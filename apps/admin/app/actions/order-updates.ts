"use server";

import {
  AdminAuthError,
  getTenantAdminScopeTenantId,
  requireAdminOrCourierAuth,
  requireAdminAuth,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  getPaymentDocumentOrderUpdate,
  type PaymentDocumentOrderUpdate,
} from "@/lib/orders/payment-document";
import { getStripePaymentCredentials } from "@/lib/payments/tenant-payment-config";
import {
  loadInternalTransitSettingsForChannel,
  loadOrderWorkflowStatusesSettingsForChannel,
  scheduleInternalTransitForOrder,
} from "@/lib/internal-transit/server";
import { StatusChange } from "@konfi/emails";
import {
  ActivityStatus,
  DesignatedPickupArea,
  IActivity,
  isPaymentStatus,
  isNestedCustomer,
  NestedMember,
  OrderInternalTransit,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  ScanPayload,
  ShippingOptions,
  StoreOrder,
  Tracking,
  TrackingScan,
  TrackingScanStage,
} from "@konfi/types";
import { createCheckoutSession } from "@konfi/payments";
import { doesOrderWorkflowStatusStartInternalTransit } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue, GeoPoint, Timestamp } from "firebase-admin/firestore";

type OrderStatusField = "status" | "paymentStatus" | "filesStatus";

interface UpdateOrderStatusFieldInput {
  channelId: string;
  field: OrderStatusField;
  orderId: string;
  source?: string;
  updatedBy?: NestedMember;
  value: string;
}

interface UpdateOrderPaymentDocumentInput {
  channelId: string;
  orderId: string;
  paymentDocumentId?: string;
  proformaDocumentId?: string;
  source?: string;
}

interface CreateAdminStripePaymentLinkInput {
  channelId: string;
  orderId: string;
  updatedBy?: NestedMember;
}

export interface CreateAdminStripePaymentLinkResult {
  checkoutSession: NonNullable<StoreOrder["checkoutSession"]>;
  paymentStatus: PaymentStatus;
  paymentType: PaymentType.STRIPE;
}

type ScanStageInput = "AUTO" | "PICKUP" | "DELIVERY";

interface PickupReadyEmailResult {
  emailError?: string;
  emailSent?: boolean;
}

export interface RecordOrderScanInput {
  accuracy?: number | null;
  channelId: string;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
  orderId: string;
  parsed?: ScanPayload;
  raw: string;
  stage?: ScanStageInput;
  userAgent?: string | null;
}

export type RecordOrderScanResult =
  | {
      ok: true;
      scanId: string;
    }
  | {
      ok: false;
      error: {
        code: "FORBIDDEN" | "UNAUTHENTICATED";
        message: string;
        statusCode: 401 | 403;
      };
    };

function normalizeChannelId(channelId: string): string {
  const normalized = channelId.trim();
  if (!normalized) {
    throw new Error("Channel ID is required");
  }

  return normalized;
}

function isExpectedRecordScanAuthError(
  error: unknown,
): error is AdminAuthError {
  return (
    error instanceof AdminAuthError &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
}

function toRecordScanAuthFailure(error: AdminAuthError): RecordOrderScanResult {
  const statusCode = error.statusCode === 401 ? 401 : 403;

  return {
    ok: false,
    error: {
      code: statusCode === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      message: error.message,
      statusCode,
    },
  };
}

async function requireStaffChannelAccess(channelId: string) {
  const normalizedChannelId = normalizeChannelId(channelId);
  const claims = await requireAdminOrCourierAuth();
  const tenantContext = await getTenantContextForRequest();

  if (claims.admin === true) {
    await requireTenantAdminChannelAccess(normalizedChannelId);
    return {
      channelId: normalizedChannelId,
      staffUid: claims.uid,
      tenantContext,
    };
  }

  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  if (tenantId) {
    const channelSnapshot = await getAdminDb()
      .collection("channels")
      .doc(normalizedChannelId)
      .get();
    const channelData = channelSnapshot.data() as
      | { tenantId?: string | null }
      | undefined;

    if (!channelSnapshot.exists || channelData?.tenantId !== tenantId) {
      throw new Error("Tenant channel access is required");
    }
  }

  return {
    channelId: normalizedChannelId,
    staffUid: claims.uid,
    tenantContext,
  };
}

function getOrderRef(channelId: string, orderId: string) {
  return getAdminDb().doc(`channels/${channelId}/orders/${orderId}`);
}

function isOrderStatusField(value: string): value is OrderStatusField {
  return (
    value === "status" || value === "paymentStatus" || value === "filesStatus"
  );
}

function validateOrderStatusFieldValue(
  field: OrderStatusField,
  value: string,
): void {
  if (!value.trim()) {
    throw new Error("Invalid status value");
  }

  if (field === "paymentStatus" && !isPaymentStatus(value)) {
    throw new Error("Invalid status value");
  }
}

function getActivityStatusForField(
  field: OrderStatusField,
): ActivityStatus | null {
  switch (field) {
    case "status":
      return ActivityStatus.ORDER_STATUS_UPDATE;
    case "paymentStatus":
      return ActivityStatus.PAYMENT_STATUS_UPDATE;
    case "filesStatus":
      return ActivityStatus.FILES_STATUS_UPDATE;
  }
}

function isProtectedPaymentStatusDowngrade(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus,
): boolean {
  return (
    (currentStatus === PaymentStatus.COMPLETED ||
      currentStatus === PaymentStatus.REFUNDED ||
      currentStatus === PaymentStatus.PARTIALLY_PAID) &&
    (nextStatus === PaymentStatus.NEW || nextStatus === PaymentStatus.PENDING)
  );
}

function createStatusActivity(params: {
  actor?: NestedMember;
  currentValue: string;
  field: OrderStatusField;
  source?: string;
  timestamp: FirebaseFirestore.Timestamp;
  value: string;
}): IActivity | null {
  const type = getActivityStatusForField(params.field);

  if (!type) {
    return null;
  }

  return {
    type,
    value: params.value,
    timestamp: params.timestamp,
    metadata: {
      after: params.value,
      before: params.currentValue,
      source: params.source ?? "admin-status-control",
      ...(params.actor ? { actor: params.actor } : {}),
    },
  };
}

/**
 * Result of a status-field update. For `field === "status"` it reports whether
 * the new status started an internal-transit schedule, so the UI can surface a
 * "no transit schedule matched" hint when a transit-flagged status had no usable
 * route/departure.
 */
export interface UpdateOrderStatusFieldResult {
  internalTransit?:
    | { scheduled: true }
    | {
        scheduled: false;
        reason: "no-pickup-area" | "no-matching-route" | "no-departure-window";
      };
}

function createInternalTransitActivity(
  type:
    | ActivityStatus.INTERNAL_TRANSIT_SCHEDULED
    | ActivityStatus.INTERNAL_TRANSIT_CANCELED,
  params: {
    actor?: NestedMember;
    source?: string;
    timestamp: FirebaseFirestore.Timestamp;
    transit?: OrderInternalTransit;
  },
): IActivity {
  return {
    type,
    value: type,
    timestamp: params.timestamp,
    metadata: {
      source: params.source ?? "admin-status-control",
      ...(params.transit
        ? {
            routeId: params.transit.routeId,
            destinationWarehouseId: params.transit.destinationWarehouseId,
            departureAt: params.transit.departureAt,
            expectedArrivalAt: params.transit.expectedArrivalAt,
          }
        : {}),
      ...(params.actor ? { actor: params.actor } : {}),
    },
  };
}

export async function updateOrderStatusField({
  channelId,
  field,
  orderId,
  source,
  updatedBy,
  value,
}: UpdateOrderStatusFieldInput): Promise<UpdateOrderStatusFieldResult> {
  if (!isOrderStatusField(field)) {
    throw new Error("Invalid status field");
  }

  validateOrderStatusFieldValue(field, value);
  const authorizedChannelId = await requireTenantAdminChannelAccess(channelId);
  const orderRef = getOrderRef(authorizedChannelId, orderId);

  // The internal-transit dispatch hook only applies to the order workflow
  // status. Settings reads are done outside the transaction (they're cheap and
  // must not contend with the order write).
  const skipTransitHook = source === "internal-transit-scheduler";
  let workflowSettingsPromise:
    | ReturnType<typeof loadOrderWorkflowStatusesSettingsForChannel>
    | undefined;
  let transitSettingsPromise:
    | ReturnType<typeof loadInternalTransitSettingsForChannel>
    | undefined;

  if (field === "status" && !skipTransitHook) {
    workflowSettingsPromise =
      loadOrderWorkflowStatusesSettingsForChannel(authorizedChannelId);
    transitSettingsPromise =
      loadInternalTransitSettingsForChannel(authorizedChannelId);
  }

  const result: UpdateOrderStatusFieldResult = {};

  await getAdminDb().runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new Error("Order not found");
    }

    const order = orderSnapshot.data() as StoreOrder;
    const currentValue = order[field];

    if (currentValue === value) {
      return;
    }

    if (
      field === "paymentStatus" &&
      isProtectedPaymentStatusDowngrade(
        currentValue as PaymentStatus,
        value as PaymentStatus,
      )
    ) {
      throw new Error(
        "Paid orders cannot be reset to a new or pending payment status from this control.",
      );
    }

    const timestamp = Timestamp.now();
    const shouldAttachStatusActor = field === "status" && !!updatedBy;
    const activity = createStatusActivity({
      actor: updatedBy,
      currentValue,
      field,
      source,
      timestamp,
      value,
    });
    const activities: IActivity[] = activity ? [activity] : [];
    const updateData: Record<string, unknown> = {
      [field]: value,
      ...(shouldAttachStatusActor
        ? {
            createdBy: updatedBy,
            updatedAt: timestamp,
            updatedBy,
          }
        : {}),
    };

    if (
      field === "status" &&
      workflowSettingsPromise &&
      transitSettingsPromise
    ) {
      const [workflowSettings, transitSettings] = await Promise.all([
        workflowSettingsPromise,
        transitSettingsPromise,
      ]);
      const tenantId = getTenantAdminScopeTenantId(
        await getTenantContextForRequest(),
      );
      const enteringTransit = doesOrderWorkflowStatusStartInternalTransit(
        value,
        workflowSettings,
      );
      const leavingTransit =
        doesOrderWorkflowStatusStartInternalTransit(
          currentValue,
          workflowSettings,
        ) && order.internalTransit?.state === "SCHEDULED";

      if (enteringTransit) {
        const outcome = await scheduleInternalTransitForOrder({
          channelId: authorizedChannelId,
          order,
          dispatchedAt: timestamp.toDate(),
          settings: transitSettings,
          tenantId,
        });

        if (outcome.scheduled) {
          updateData.internalTransit = outcome.data.internalTransit;
          activities.push(
            createInternalTransitActivity(
              ActivityStatus.INTERNAL_TRANSIT_SCHEDULED,
              {
                actor: updatedBy,
                source,
                timestamp,
                transit: outcome.data.internalTransit,
              },
            ),
          );
          result.internalTransit = { scheduled: true };
        } else {
          result.internalTransit = {
            scheduled: false,
            reason: outcome.reason,
          };
        }
      } else if (leavingTransit && order.internalTransit) {
        // Manual correction away from a transit status cancels the pending
        // auto-arrival so the sweep won't fire.
        updateData.internalTransit = {
          ...order.internalTransit,
          state: "CANCELED",
        };
        activities.push(
          createInternalTransitActivity(
            ActivityStatus.INTERNAL_TRANSIT_CANCELED,
            {
              actor: updatedBy,
              source,
              timestamp,
              transit: order.internalTransit,
            },
          ),
        );
      }
    }

    if (activities.length > 0) {
      updateData.activities = FieldValue.arrayUnion(...activities);
    }

    transaction.update(orderRef, updateData);
  });

  return result;
}

export async function updateOrderPaymentDocument({
  channelId,
  orderId,
  paymentDocumentId,
  proformaDocumentId,
  source,
}: UpdateOrderPaymentDocumentInput): Promise<PaymentDocumentOrderUpdate> {
  const updateData = getPaymentDocumentOrderUpdate(
    paymentDocumentId,
    proformaDocumentId,
  );
  const authorizedChannelId = await requireTenantAdminChannelAccess(channelId);
  const orderRef = getOrderRef(authorizedChannelId, orderId);
  let appliedUpdate: PaymentDocumentOrderUpdate = {
    ...(updateData.paymentDocumentId !== undefined
      ? { paymentDocumentId: updateData.paymentDocumentId }
      : {}),
    ...(updateData.proformaDocumentId !== undefined
      ? { proformaDocumentId: updateData.proformaDocumentId }
      : {}),
  };

  await getAdminDb().runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new Error("Order not found");
    }

    const order = orderSnapshot.data() as StoreOrder;
    const transactionUpdateData: Record<string, unknown> = {
      ...appliedUpdate,
    };
    const nextPaymentStatus = updateData.paymentStatus;

    if (nextPaymentStatus) {
      const currentPaymentStatus = order.paymentStatus;
      const shouldApplyPaymentStatus =
        currentPaymentStatus !== nextPaymentStatus &&
        !isProtectedPaymentStatusDowngrade(
          currentPaymentStatus,
          nextPaymentStatus,
        );

      appliedUpdate = {
        ...appliedUpdate,
        paymentStatus: shouldApplyPaymentStatus
          ? nextPaymentStatus
          : currentPaymentStatus,
      };

      if (shouldApplyPaymentStatus) {
        const timestamp = Timestamp.now();
        const activity = createStatusActivity({
          currentValue: currentPaymentStatus,
          field: "paymentStatus",
          source: source ?? "admin-payment-document-form",
          timestamp,
          value: nextPaymentStatus,
        });

        transactionUpdateData.paymentStatus = nextPaymentStatus;

        if (activity) {
          transactionUpdateData.activities = FieldValue.arrayUnion(activity);
        }
      }
    }

    transaction.update(orderRef, transactionUpdateData);
  });

  return appliedUpdate;
}

function isProtectedStripeLinkCreationStatus(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.COMPLETED ||
    status === PaymentStatus.REFUNDED ||
    status === PaymentStatus.PARTIALLY_PAID
  );
}

export async function createAdminStripePaymentLink({
  channelId,
  orderId,
  updatedBy,
}: CreateAdminStripePaymentLinkInput): Promise<CreateAdminStripePaymentLinkResult> {
  const authorizedChannelId = await requireTenantAdminChannelAccess(channelId);
  const tenantContext = await getTenantContextForRequest();
  const orderRef = getOrderRef(authorizedChannelId, orderId);
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found");
  }

  const order = orderSnapshot.data() as StoreOrder;
  const tenantId = getTenantAdminScopeTenantId(tenantContext);

  if (tenantId && order.tenantId !== tenantId) {
    throw new AdminAuthError("Tenant channel access is required", 403);
  }

  if (isProtectedStripeLinkCreationStatus(order.paymentStatus)) {
    throw new Error("Paid orders cannot receive a new Stripe payment link.");
  }

  if (order.paymentType === PaymentType.STRIPE && order.checkoutSession?.url) {
    return {
      checkoutSession: order.checkoutSession,
      paymentStatus: order.paymentStatus,
      paymentType: PaymentType.STRIPE,
    };
  }

  const orderPath = order.path ?? orderRef.path;
  const checkoutSession = await createCheckoutSession(
    {
      ...order,
      id: order.id ?? orderId,
      path: orderPath,
      paymentType: PaymentType.STRIPE,
    },
    {
      stripeCredentials: await getStripePaymentCredentials(tenantContext),
    },
  );
  const nextCheckoutSession: NonNullable<StoreOrder["checkoutSession"]> = {
    id: checkoutSession.id,
    url: checkoutSession.url,
    paymentIntent: checkoutSession.paymentIntent ?? "",
  };
  const now = Timestamp.now();
  const updateData: Record<string, unknown> = {
    checkoutSession: nextCheckoutSession,
    paymentStatus: PaymentStatus.NEW,
    paymentType: PaymentType.STRIPE,
    updatedAt: now,
    ...(updatedBy ? { updatedBy } : {}),
  };
  const activities: StoreOrder["activities"] = [];

  if (order.paymentType !== PaymentType.STRIPE) {
    activities.push({
      type: ActivityStatus.PAYMENT_METHOD_CHANGED,
      value: ActivityStatus.PAYMENT_METHOD_CHANGED,
      timestamp: now,
      metadata: {
        before: order.paymentType,
        after: PaymentType.STRIPE,
      },
    });
  }

  if (order.paymentStatus !== PaymentStatus.NEW) {
    activities.push({
      type: ActivityStatus.PAYMENT_STATUS_UPDATE,
      value: PaymentStatus.NEW,
      timestamp: now,
      metadata: {
        before: order.paymentStatus,
        after: PaymentStatus.NEW,
        source: "admin-stripe-payment-link",
      },
    });
  }

  if (activities.length > 0) {
    updateData.activities = FieldValue.arrayUnion(...activities);
  }

  await orderRef.update(updateData);

  return {
    checkoutSession: nextCheckoutSession,
    paymentStatus: PaymentStatus.NEW,
    paymentType: PaymentType.STRIPE,
  };
}

function resolveStage(
  current: StoreOrder["status"],
  requested?: ScanStageInput,
  tracking?: Tracking,
): TrackingScanStage {
  if (requested && requested !== "AUTO") {
    return requested;
  }

  if (tracking?.deliveredAt) {
    return "OTHER";
  }

  if (tracking?.pickupAt || tracking?.lastScan?.stage === "PICKUP") {
    return "DELIVERY";
  }

  if (current === OrderStatus.READY || current === OrderStatus.IN_PROGRESS) {
    return "PICKUP";
  }

  if (current === OrderStatus.FULFILLED) {
    return "OTHER";
  }

  return "DELIVERY";
}

function computeNextStatus(
  current: StoreOrder["status"],
  stage: TrackingScanStage,
  shippingOption: StoreOrder["shippingOption"],
  isFromStore: boolean,
): StoreOrder["status"] | null {
  if (stage === "PICKUP") {
    return null;
  }

  if (stage === "DELIVERY") {
    if (shippingOption === ShippingOptions.PERSONAL_COLLECTION && isFromStore) {
      if (current !== OrderStatus.READY) {
        return OrderStatus.READY;
      }
    }

    if (current !== OrderStatus.FULFILLED) {
      return OrderStatus.FULFILLED;
    }
  }

  return null;
}

function getSourceWarehouseIds(order: StoreOrder): string[] {
  return [
    ...new Set(
      order.items
        .map((item) => item.warehouseId)
        .filter((warehouseId): warehouseId is string => !!warehouseId),
    ),
  ];
}

function requiresPickupArrivalConfirmation(params: {
  designatedPickupAreaId?: string;
  pickupAreaWarehouseId?: string;
  sourceWarehouseIds: string[];
}): boolean {
  if (!params.designatedPickupAreaId || !params.pickupAreaWarehouseId) {
    return false;
  }

  if (params.sourceWarehouseIds.length === 0) {
    return false;
  }

  return !params.sourceWarehouseIds.includes(params.pickupAreaWarehouseId);
}

async function shouldSendDeliveryConfirmationPickupEmail(params: {
  order: StoreOrder;
  previousDeliveredAt: boolean;
  tenantContext: TenantContext;
}) {
  const { order, previousDeliveredAt, tenantContext } = params;

  if (
    previousDeliveredAt ||
    !order.tracking?.deliveredAt ||
    order.status !== OrderStatus.READY ||
    order.shippingOption !== ShippingOptions.PERSONAL_COLLECTION ||
    (!order.isFromStore && !order.sendStatusChangeEmail) ||
    !order.designatedPickupAreaId
  ) {
    return false;
  }

  const pickupAreaSnapshot = await getAdminDb()
    .doc(`designatedPickupAreas/${order.designatedPickupAreaId}`)
    .get();

  if (!pickupAreaSnapshot.exists) {
    return false;
  }

  const pickupArea = pickupAreaSnapshot.data() as DesignatedPickupArea;
  const tenantId = tenantContext.tenantId?.trim();
  if (tenantId && pickupArea.tenantId !== tenantId) {
    return false;
  }

  return requiresPickupArrivalConfirmation({
    designatedPickupAreaId: order.designatedPickupAreaId,
    pickupAreaWarehouseId: pickupArea.warehouseId,
    sourceWarehouseIds: getSourceWarehouseIds(order),
  });
}

async function sendPickupReadyEmail(params: {
  order: StoreOrder;
  orderRef: FirebaseFirestore.DocumentReference;
  tenantContext?: TenantContext;
}): Promise<PickupReadyEmailResult> {
  const { order, orderRef, tenantContext } = params;
  const contactEmail = order.contact.email?.trim();

  if (!contactEmail) {
    return { emailSent: false };
  }

  const customerName = isNestedCustomer(order.customer)
    ? order.customer.name
    : order.customer || "";
  const subject = "Zmiana statusu zamowienia";

  await sendEmail({
    to: contactEmail,
    subject,
    tenantContext,
    template: StatusChange({
      brand: "store",
      name: customerName,
      orderNumber: `${order.number}`,
      status: "Gotowe do odebrania",
    }),
  });

  await orderRef.update({
    activities: FieldValue.arrayUnion({
      type: ActivityStatus.EMAIL_SENT,
      value: ActivityStatus.EMAIL_SENT,
      timestamp: Timestamp.now(),
      metadata: {
        to: contactEmail,
        subject,
        template: {
          kind: "jsx",
          name: "StatusChange",
        },
      },
    }),
  });

  return { emailSent: true };
}

async function trySendPickupReadyEmail(params: {
  order: StoreOrder;
  orderRef: FirebaseFirestore.DocumentReference;
  tenantContext?: TenantContext;
}): Promise<PickupReadyEmailResult> {
  try {
    return await sendPickupReadyEmail(params);
  } catch (error) {
    const emailError =
      error instanceof Error ? error.message : "Failed to send pickup email";

    console.error("Failed to send pickup-ready email:", error);

    return {
      emailSent: false,
      emailError,
    };
  }
}

export async function maybeSendPickupReadyEmailForArrivedOrder(params: {
  order: StoreOrder;
  orderRef: FirebaseFirestore.DocumentReference;
  previousDeliveredAt: boolean;
  tenantContext: TenantContext;
}): Promise<PickupReadyEmailResult> {
  if (
    await shouldSendDeliveryConfirmationPickupEmail({
      order: params.order,
      previousDeliveredAt: params.previousDeliveredAt,
      tenantContext: params.tenantContext,
    })
  ) {
    return trySendPickupReadyEmail({
      order: params.order,
      orderRef: params.orderRef,
      tenantContext: params.tenantContext,
    });
  }

  return {};
}

/**
 * Core "mark arrived at pickup" logic, usable from contexts that already
 * resolved the channel and tenant (e.g. the internal-transit cron sweep, which
 * has no user session). Writes `tracking.deliveredAt` and — when the suppressed
 * cross-warehouse pickup gate now permits it — sends the pickup-ready email.
 * Idempotent: a second call with `deliveredAt` already set won't re-send.
 */
export async function markOrderArrivedAtPickupCore(params: {
  channelId: string;
  orderId: string;
  tenantContext: TenantContext;
}): Promise<{ deliveredAtMillis: number } & PickupReadyEmailResult> {
  const { channelId, orderId, tenantContext } = params;
  const orderRef = getOrderRef(channelId, orderId);
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found");
  }

  const order = orderSnapshot.data() as StoreOrder;
  const previousDeliveredAt = Boolean(order.tracking?.deliveredAt);
  const deliveredAt = order.tracking?.deliveredAt
    ? (order.tracking.deliveredAt as Timestamp)
    : Timestamp.now();
  const tracking: Tracking = order.tracking
    ? { ...order.tracking, deliveredAt }
    : {
        shippingOption:
          order.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
        number: "",
        link: "",
        deliveredAt,
      };
  const updatedOrder: StoreOrder = {
    ...order,
    tracking,
  };

  if (!previousDeliveredAt) {
    await orderRef.update({ tracking });
  }

  const emailResult = await maybeSendPickupReadyEmailForArrivedOrder({
    order: updatedOrder,
    orderRef,
    previousDeliveredAt,
    tenantContext,
  });

  return { deliveredAtMillis: deliveredAt.toMillis(), ...emailResult };
}

export async function markOrderArrivedAtPickup(
  channelId: string,
  orderId: string,
) {
  await requireAdminAuth();
  const [authorizedChannelId, tenantContext] = await Promise.all([
    requireTenantAdminChannelAccess(channelId),
    getTenantContextForRequest(),
  ]);

  return markOrderArrivedAtPickupCore({
    channelId: authorizedChannelId,
    orderId,
    tenantContext,
  });
}

export interface InternalTransitActionResult {
  ok: boolean;
  reason?: "no-transit" | "not-scheduled" | "no-departure-window";
}

/**
 * Cancel a pending auto-arrival (state SCHEDULED → CANCELED). The manual
 * "mark arrived at pickup" action remains the fallback.
 */
export async function cancelInternalTransit(
  channelId: string,
  orderId: string,
): Promise<InternalTransitActionResult> {
  await requireAdminAuth();
  const authorizedChannelId = await requireTenantAdminChannelAccess(channelId);
  const orderRef = getOrderRef(authorizedChannelId, orderId);
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    throw new Error("Order not found");
  }

  const order = orderSnapshot.data() as StoreOrder;
  const transit = order.internalTransit;

  if (!transit) {
    return { ok: false, reason: "no-transit" };
  }

  if (transit.state !== "SCHEDULED") {
    return { ok: false, reason: "not-scheduled" };
  }

  await orderRef.update({
    "internalTransit.state": "CANCELED",
    activities: FieldValue.arrayUnion(
      createInternalTransitActivity(ActivityStatus.INTERNAL_TRANSIT_CANCELED, {
        source: "admin-internal-transit-control",
        timestamp: Timestamp.now(),
        transit,
      }),
    ),
  });

  return { ok: true };
}

/**
 * Postpone a pending auto-arrival to the next scheduled departure after the
 * currently scheduled one (recomputed from `departureAt`).
 */
export async function postponeInternalTransit(
  channelId: string,
  orderId: string,
): Promise<InternalTransitActionResult> {
  await requireAdminAuth();
  const [authorizedChannelId, tenantContext] = await Promise.all([
    requireTenantAdminChannelAccess(channelId),
    getTenantContextForRequest(),
  ]);
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const orderRef = getOrderRef(authorizedChannelId, orderId);
  const [orderSnapshot, settings] = await Promise.all([
    orderRef.get(),
    loadInternalTransitSettingsForChannel(authorizedChannelId),
  ]);

  if (!orderSnapshot.exists) {
    throw new Error("Order not found");
  }

  const order = orderSnapshot.data() as StoreOrder;
  const transit = order.internalTransit;

  if (!transit) {
    return { ok: false, reason: "no-transit" };
  }

  if (transit.state !== "SCHEDULED") {
    return { ok: false, reason: "not-scheduled" };
  }

  // Recompute from just past the current departure (beyond its grace window) so
  // the same run is skipped and the next departure is selected.
  const route = settings.routes.find((item) => item.id === transit.routeId);
  const graceMillis = (route?.graceMinutes ?? 0) * 60_000;
  const departureMillis = (transit.departureAt as Timestamp).toMillis();
  const dispatchedAt = new Date(departureMillis + graceMillis + 60_000);
  const outcome = await scheduleInternalTransitForOrder({
    channelId: authorizedChannelId,
    order,
    dispatchedAt,
    settings,
    tenantId,
  });

  if (!outcome.scheduled) {
    return { ok: false, reason: "no-departure-window" };
  }

  await orderRef.update({
    internalTransit: outcome.data.internalTransit,
    activities: FieldValue.arrayUnion(
      createInternalTransitActivity(ActivityStatus.INTERNAL_TRANSIT_SCHEDULED, {
        source: "admin-internal-transit-postpone",
        timestamp: Timestamp.now(),
        transit: outcome.data.internalTransit,
      }),
    ),
  });

  return { ok: true };
}

export async function recordOrderScan(
  input: RecordOrderScanInput,
): Promise<RecordOrderScanResult> {
  let access: Awaited<ReturnType<typeof requireStaffChannelAccess>>;
  try {
    access = await requireStaffChannelAccess(input.channelId);
  } catch (error) {
    if (isExpectedRecordScanAuthError(error)) {
      return toRecordScanAuthFailure(error);
    }

    throw error;
  }

  const { channelId, staffUid, tenantContext } = access;
  const orderId = input.orderId.trim();
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const firestore = getAdminDb();
  const orderRef = getOrderRef(channelId, orderId);
  const scanRef = orderRef.collection("scanEvents").doc();
  const scannedAt = Timestamp.now();
  const location = input.location
    ? new GeoPoint(input.location.latitude, input.location.longitude)
    : null;
  const scanEvent = {
    raw: input.raw,
    ...(input.parsed ? { parsed: input.parsed } : {}),
    stage: input.stage ?? "AUTO",
    scannedAt,
    by: staffUid,
    location,
    accuracy: input.accuracy ?? null,
    userAgent: input.userAgent ?? null,
    targetRef: `/channels/${channelId}/orders/${orderId}`,
    ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
  };

  let emailCandidate:
    | {
        order: StoreOrder;
        previousDeliveredAt: boolean;
      }
    | undefined;

  await firestore.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    transaction.set(scanRef, scanEvent);

    if (!orderSnapshot.exists) {
      return;
    }

    const order = orderSnapshot.data() as StoreOrder;
    const stage = resolveStage(order.status, input.stage, order.tracking);
    const nextStatus = computeNextStatus(
      order.status,
      stage,
      order.shippingOption,
      order.isFromStore ?? false,
    );
    const scan: TrackingScan = {
      id: scanRef.id,
      stage,
      scannedAt,
      by: staffUid,
      location: (location ?? undefined) as unknown as TrackingScan["location"],
      accuracy: input.accuracy ?? undefined,
      raw: input.raw,
      userAgent: input.userAgent ?? undefined,
    };
    const trackingUpdate: Partial<Tracking> = {
      lastScan: scan,
    };

    if (stage === "PICKUP" && !order.tracking?.pickupAt) {
      trackingUpdate.pickupAt = scannedAt;
    }

    if (stage === "DELIVERY" && !order.tracking?.deliveredAt) {
      trackingUpdate.deliveredAt = scannedAt;
    }

    const tracking: Tracking = order.tracking
      ? { ...order.tracking, ...trackingUpdate }
      : (trackingUpdate as Tracking);
    const activities: IActivity[] = [
      {
        type: ActivityStatus.TRACKING_SCAN,
        value: ActivityStatus.TRACKING_SCAN,
        timestamp: Timestamp.now(),
        metadata: {
          id: scan.id,
          stage: scan.stage,
          scannedAt: scan.scannedAt,
          by: scan.by,
          accuracy: scan.accuracy,
          userAgent: scan.userAgent,
          location: scan.location,
          raw: scan.raw,
        },
      },
    ];
    const updateData: Record<string, unknown> = {
      tracking,
      activities: FieldValue.arrayUnion(...activities),
    };

    if (nextStatus && nextStatus !== order.status) {
      updateData.status = nextStatus;
      activities.push({
        type: ActivityStatus.ORDER_STATUS_UPDATE,
        value: nextStatus,
        timestamp: Timestamp.now(),
      });
      updateData.activities = FieldValue.arrayUnion(...activities);
    }

    transaction.update(orderRef, updateData);

    const updatedOrder: StoreOrder = {
      ...order,
      status: nextStatus ?? order.status,
      tracking,
    };

    if (!nextStatus && !order.tracking?.deliveredAt && tracking.deliveredAt) {
      emailCandidate = {
        order: updatedOrder,
        previousDeliveredAt: false,
      };
    }
  });

  if (
    emailCandidate &&
    (await shouldSendDeliveryConfirmationPickupEmail({
      order: emailCandidate.order,
      previousDeliveredAt: emailCandidate.previousDeliveredAt,
      tenantContext,
    }))
  ) {
    await trySendPickupReadyEmail({
      order: emailCandidate.order,
      orderRef,
      tenantContext,
    });
  }

  return { ok: true, scanId: scanRef.id };
}
