"use server";

import {
  getAuthenticatedAdminMember,
  requireSuperAdminAuth,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { processOrderCreatedFulfillment } from "@/lib/fulfillment/service";
import { createAppNotification } from "@/lib/notifications/app-notifications";
import { requestAdminPaymentRefund } from "@/lib/payments/admin";
import type { PaymentProviderKey } from "@/lib/payments/admin-types";
import { processOrderStockReservation } from "@/lib/stock/order-stock-service";
import { ComplaintNotification } from "@konfi/emails";
import {
  Channel,
  Complaint,
  ComplaintCreate,
  Discount,
  Notification,
  NotificationType,
  Order,
  OrderFilesStatus,
  OrderStatus,
  PaymentLedgerEntry,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
  PaymentType,
  RmaFulfillmentRequestStatus,
  RmaRequest,
  RmaProviderRefundStatus,
  RmaRequestStatus,
  RmaRequestType,
  RmaResolutionEvent,
  RmaResolutionType,
  RmaStockReservationStatus,
  StoreCreditTransaction,
  StoreCreditTransactionType,
} from "@konfi/types";
import {
  ComplaintCreateSchema,
  RMA_REQUESTS_COLLECTION,
  RMA_RESOLUTION_EVENTS_COLLECTION,
  canTransitionRmaStatus,
  createRmaRequestFromComplaint,
  getResolvedRmaRequestStatus,
  getChannelNotificationEmails,
  isRmaRequestStatus,
  isRmaResolutionType,
  normalizeRmaResolutionAmount,
  rmaResolutionRequiresAmount,
} from "@konfi/utils";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { InferType } from "yup";

type CreateComplaintInput = InferType<typeof ComplaintCreateSchema>;

function getAdminBaseUrl(): string | undefined {
  return (
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim()
  );
}

function buildAdminOrderUrl(orderId: string, channelId: string) {
  const path = `/orders/${orderId}?channelId=${encodeURIComponent(channelId)}`;
  const baseUrl = getAdminBaseUrl();

  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

async function publishComplaintNotifications(params: {
  channel: Channel;
  channelId: string;
  complaint: ComplaintCreate;
  tenantContext: Awaited<ReturnType<typeof getTenantContextForRequest>>;
}) {
  const { channel, channelId, complaint, tenantContext } = params;
  const channelName = channel.name || "Nieznany kanal";
  const url = `/orders/${complaint.orderId}?channelId=${channelId}`;
  const notification: Notification = {
    id: "",
    title: "Nowa reklamacja",
    options: {
      body: `Nowa reklamacja zostala utworzona w kanale ${channelName}.`,
    },
    archived: false,
    channelId,
    url,
    createdAt: Timestamp.now(),
  };

  await createAppNotification({
    firestore: getAdminDb(),
    notification,
    tenantContext,
  });

  if (
    !channel.notifications?.enabledTypes.includes(
      NotificationType.COMPLAINT_CREATED,
    )
  ) {
    return;
  }

  const notificationEmails = getChannelNotificationEmails(
    channel,
    process.env.NOTIFICATIONS_EMAIL,
  );

  if (notificationEmails.length === 0) {
    return;
  }

  const absoluteUrl = buildAdminOrderUrl(complaint.orderId, channelId);
  const emailResults = await Promise.allSettled(
    notificationEmails.map((notificationEmail) =>
      sendEmail({
        to: notificationEmail,
        from: process.env.NO_REPLY_EMAIL?.trim(),
        subject: `Nowa reklamacja w kanale ${channelName}`,
        template: ComplaintNotification({
          brand: "admin",
          channelName,
          orderId: complaint.orderId,
          description: complaint.description || "Brak opisu",
          url: absoluteUrl,
        }),
      }),
    ),
  );

  emailResults.forEach((result) => {
    if (result.status === "rejected") {
      console.error(
        "Failed to send complaint notification email",
        result.reason,
      );
    }
  });
}

export async function createComplaint(input: {
  channelId: string;
  data: CreateComplaintInput;
  orderId: string;
}) {
  const channelId = await requireTenantAdminChannelAccess(input.channelId);
  const tenantContext = await getTenantContextForRequest();
  const data = await ComplaintCreateSchema.validate(input.data, {
    abortEarly: false,
    stripUnknown: true,
  });
  const firestore = getAdminDb();
  const channelSnapshot = await firestore
    .collection("channels")
    .doc(channelId)
    .get();

  if (!channelSnapshot.exists) {
    throw new Error("Channel not found");
  }

  const channel = {
    ...(channelSnapshot.data() as Channel),
    id: channelSnapshot.id,
  } satisfies Channel;
  const timestampNow = Timestamp.now();
  const complaintRef = firestore
    .collection(`channels/${channelId}/complaints`)
    .doc();
  const complaint: ComplaintCreate = {
    id: complaintRef.id,
    orderId: input.orderId,
    channelId,
    orderItemIds: data.orderItemIds,
    description: data.description,
    status: data.status,
    createdBy: data.createdBy,
    createdAt: timestampNow,
    updatedBy: data.createdBy,
    updatedAt: timestampNow,
    carriedOutBy: data.carriedOutBy,
    active: true,
    ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
  };

  await firestore.runTransaction(async (transaction) => {
    transaction.set(complaintRef, complaint);
    transaction.update(
      firestore.doc(`channels/${channelId}/orders/${input.orderId}`),
      {
        complaints: FieldValue.arrayUnion(complaintRef.id),
      },
    );
  });

  await publishComplaintNotifications({
    channel,
    channelId,
    complaint,
    tenantContext,
  });

  return { id: complaintRef.id };
}

function normalizeRmaType(type: RmaRequestType | undefined): RmaRequestType {
  return Object.values(RmaRequestType).includes(type ?? RmaRequestType.CLAIM)
    ? (type ?? RmaRequestType.CLAIM)
    : RmaRequestType.CLAIM;
}

function getRmaPaymentLedgerEntryId(params: {
  resolutionEventId: string;
  rmaRequestId: string;
}) {
  return `rma_${params.rmaRequestId}_${params.resolutionEventId}`;
}

function getStoreCreditTransactionId(params: {
  resolutionEventId: string;
  rmaRequestId: string;
}) {
  return `rma_${params.rmaRequestId}_${params.resolutionEventId}`;
}

function getOrderCustomerId(order: Order, rmaRequest: RmaRequest) {
  return (
    rmaRequest.customerId ??
    (typeof order.customer === "string" ? order.customer : order.customer.id)
  );
}

function createRmaRefundLedgerEntry(params: {
  actor: Awaited<ReturnType<typeof getAuthenticatedAdminMember>>;
  amount: number;
  order: Order;
  paymentLedgerEntryId: string;
  timestampNow: ReturnType<typeof Timestamp.now>;
  tenantId?: string;
}): PaymentLedgerEntry {
  return {
    active: true,
    amount: params.amount,
    channelId: params.order.channelId,
    createdAt: params.timestampNow,
    createdBy: params.actor,
    currency: params.order.currency ?? "PLN",
    entryType: PaymentLedgerEntryType.REFUND,
    id: params.paymentLedgerEntryId,
    idempotencyKey: params.paymentLedgerEntryId,
    metadata: {
      source: "rma",
    },
    name: `${PaymentLedgerEntryType.REFUND} ${params.order.number}`,
    orderId: params.order.id,
    orderNumber: params.order.number,
    paymentMethodId: params.order.paymentType,
    status: PaymentLedgerEntryStatus.PENDING,
    tenantId: params.tenantId ?? params.order.tenantId,
    updatedAt: params.timestampNow,
    updatedBy: params.actor,
  };
}

function rmaResolutionCreatesReplacementOrder(type: RmaResolutionType) {
  return (
    type === RmaResolutionType.REMAKE || type === RmaResolutionType.REPLACE
  );
}

function getReplacementOrderName(type: RmaResolutionType, order: Order) {
  return type === RmaResolutionType.REMAKE
    ? `RMA remake for order ${order.number}`
    : `RMA replacement for order ${order.number}`;
}

function getProviderRefundStatus(
  status: "COMPLETED" | "FAILED" | "PENDING" | "PROCESSING",
): RmaProviderRefundStatus {
  return status;
}

function getProviderForRefund(order: Order): PaymentProviderKey | undefined {
  if (order.paymentType === PaymentType.STRIPE) {
    return "stripe";
  }

  if (order.paymentType === PaymentType.PRZELEWY24) {
    return "przelewy24";
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Provider refund failed";
}

function createRmaReplacementOrder(params: {
  actor: Awaited<ReturnType<typeof getAuthenticatedAdminMember>>;
  order: Order;
  orderId: string;
  orderNumber: number;
  rmaRequest: RmaRequest;
  resolutionEventId: string;
  resolutionType: RmaResolutionType;
  timestampNow: ReturnType<typeof Timestamp.now>;
  tenantId?: string;
}): Order {
  const affectedItems = params.order.items.filter((item) =>
    params.rmaRequest.items.some((rmaItem) => rmaItem.orderItemId === item.id),
  );

  if (affectedItems.length === 0) {
    throw new Error(
      "RMA replacement requires at least one affected order item",
    );
  }

  const items = affectedItems.map((item) => {
    const rmaItem = params.rmaRequest.items.find(
      (candidate) => candidate.orderItemId === item.id,
    );
    const quantity = Math.max(
      1,
      Math.round(
        rmaItem?.approvedQuantity ?? rmaItem?.quantity ?? item.quantity,
      ),
    );

    return {
      ...item,
      quantity,
      totalPrice: 0,
      customPrice: 0,
      discount: new Discount().object,
      fulfillmentAssignment: undefined,
      warehouseId: undefined,
    };
  });

  return {
    active: true,
    activities: [
      {
        timestamp: params.timestampNow,
        type: "ORDER_STATUS_UPDATE",
        value: OrderStatus.NEW,
      },
      {
        timestamp: params.timestampNow,
        type: "PAYMENT_STATUS_UPDATE",
        value: PaymentStatus.COMPLETED,
      },
    ],
    anonymousPackageLabelAddress: params.order.anonymousPackageLabelAddress,
    anonymousPackageShipping: params.order.anonymousPackageShipping ?? false,
    appliedPromotionCodes: [],
    billing: params.order.billing,
    carriedOutBy: params.order.carriedOutBy ?? [],
    channelId: params.order.channelId,
    contact: params.order.contact,
    createdAt: params.timestampNow,
    createdBy: params.actor,
    currency: params.order.currency,
    currencySnapshot: params.order.currencySnapshot,
    customer: params.order.customer,
    deadline: params.order.deadline,
    deadlineString: params.order.deadlineString,
    designatedPickupAreaId: params.order.designatedPickupAreaId ?? "",
    difficulty: params.order.difficulty,
    email: params.order.email,
    exactTime: params.order.exactTime,
    externalSource: null,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    fulfilledItems: [],
    id: params.orderId,
    inProgressItems: [],
    invoice: false,
    invoiceNotes: `Created from RMA ${params.rmaRequest.id} for order ${params.order.number}.`,
    isFromStore: false,
    isTest: params.order.isTest,
    items,
    keywords: [
      ...params.order.keywords,
      params.rmaRequest.id,
      params.order.id,
      params.resolutionEventId,
    ].filter(Boolean),
    mailLink: params.order.mailLink ?? "",
    messages: [],
    name: getReplacementOrderName(params.resolutionType, params.order),
    number: params.orderNumber,
    paymentDocumentId: "",
    paymentStatus: PaymentStatus.COMPLETED,
    paymentType: params.order.paymentType,
    priority: params.order.priority,
    priorityItems: [],
    printingMethods: params.order.printingMethods ?? [],
    sendStatusChangeEmail: false,
    shipping: params.order.shipping,
    shippingOption: params.order.shippingOption,
    shippingPrice: 0,
    shippingPriceDiscount: new Discount().object,
    specialNotes: [
      `RMA ${params.resolutionType.toLowerCase()} order.`,
      `Source order: ${params.order.number} (${params.order.id}).`,
      `RMA request: ${params.rmaRequest.id}.`,
    ].join("\n"),
    status: OrderStatus.NEW,
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    totalPrice: 0,
    totalPriceDiscount: new Discount().object,
    updatedAt: params.timestampNow,
    updatedBy: params.actor,
  };
}

export async function createRmaRequestForComplaint(input: {
  channelId: string;
  complaintId: string;
  type?: RmaRequestType;
}) {
  const [channelId, tenantContext, actor] = await Promise.all([
    requireTenantAdminChannelAccess(input.channelId),
    getTenantContextForRequest(),
    getAuthenticatedAdminMember(),
  ]);
  const firestore = getAdminDb();
  const timestampNow = Timestamp.now();
  const complaintRef = firestore.doc(
    `channels/${channelId}/complaints/${input.complaintId}`,
  );
  const rmaRef = firestore
    .collection(`channels/${channelId}/${RMA_REQUESTS_COLLECTION}`)
    .doc();

  await firestore.runTransaction(async (transaction) => {
    const complaintSnapshot = await transaction.get(complaintRef);

    if (!complaintSnapshot.exists) {
      throw new Error("Complaint not found");
    }

    const complaint = {
      id: complaintSnapshot.id,
      ...complaintSnapshot.data(),
    } as Complaint;
    const orderRef = firestore.doc(
      `channels/${channelId}/orders/${complaint.orderId}`,
    );
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new Error("Order not found");
    }

    const order = {
      id: orderSnapshot.id,
      ...orderSnapshot.data(),
    } as Order;
    const rmaRequest: RmaRequest = {
      id: rmaRef.id,
      ...createRmaRequestFromComplaint({
        actor,
        complaint,
        now: timestampNow,
        order,
        type: normalizeRmaType(input.type),
      }),
      ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
    };

    transaction.set(rmaRef, rmaRequest);
    transaction.update(complaintRef, {
      rmaRequestIds: FieldValue.arrayUnion(rmaRef.id),
      updatedAt: timestampNow,
      updatedBy: actor,
    });
  });

  return { id: rmaRef.id };
}

export async function updateRmaRequestStatus(input: {
  channelId: string;
  rmaRequestId: string;
  status: unknown;
}) {
  if (!isRmaRequestStatus(input.status)) {
    throw new Error("Invalid RMA status");
  }

  const nextStatus = input.status;
  const [channelId, tenantContext, actor] = await Promise.all([
    requireTenantAdminChannelAccess(input.channelId),
    getTenantContextForRequest(),
    getAuthenticatedAdminMember(),
  ]);
  const firestore = getAdminDb();
  const timestampNow = Timestamp.now();
  const rmaRef = firestore.doc(
    `channels/${channelId}/${RMA_REQUESTS_COLLECTION}/${input.rmaRequestId}`,
  );

  await firestore.runTransaction(async (transaction) => {
    const rmaSnapshot = await transaction.get(rmaRef);

    if (!rmaSnapshot.exists) {
      throw new Error("RMA request not found");
    }

    const rmaRequest = {
      id: rmaSnapshot.id,
      ...rmaSnapshot.data(),
    } as RmaRequest;

    if (!canTransitionRmaStatus(rmaRequest.status, nextStatus)) {
      throw new Error("This RMA status transition is not allowed");
    }

    transaction.update(rmaRef, {
      status: nextStatus,
      updatedAt: timestampNow,
      updatedBy: actor,
      ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
    });
  });
}

export async function resolveRmaRequest(input: {
  amount?: number;
  channelId: string;
  dispatchProviderRefund?: boolean;
  notes?: string;
  rmaRequestId: string;
  resolutionType: unknown;
}): Promise<{
  fulfillmentRequestCreatedCount?: number;
  fulfillmentRequestError?: string;
  fulfillmentRequestSkippedCount?: number;
  fulfillmentRequestStatus?: RmaFulfillmentRequestStatus;
  providerRefundError?: string;
  providerRefundStatus?: RmaProviderRefundStatus | "SKIPPED";
  stockReservationError?: string;
  stockReservationStatus?: RmaStockReservationStatus;
}> {
  if (!isRmaResolutionType(input.resolutionType)) {
    throw new Error("Invalid RMA resolution");
  }

  const resolutionType = input.resolutionType;
  const amount = normalizeRmaResolutionAmount(input.amount);

  if (rmaResolutionRequiresAmount(resolutionType) && amount <= 0) {
    throw new Error("RMA refund or credit amount must be greater than zero");
  }

  const shouldDispatchProviderRefund =
    resolutionType === RmaResolutionType.REFUND &&
    input.dispatchProviderRefund === true;

  if (shouldDispatchProviderRefund) {
    await requireSuperAdminAuth();
  }

  const [channelId, tenantContext, actor] = await Promise.all([
    requireTenantAdminChannelAccess(input.channelId),
    getTenantContextForRequest(),
    getAuthenticatedAdminMember(),
  ]);
  const firestore = getAdminDb();
  const timestampNow = Timestamp.now();
  const rmaRef = firestore.doc(
    `channels/${channelId}/${RMA_REQUESTS_COLLECTION}/${input.rmaRequestId}`,
  );
  const resolutionEventRef = rmaRef
    .collection(RMA_RESOLUTION_EVENTS_COLLECTION)
    .doc();
  const tenantId = tenantContext.tenantId;
  let providerRefund:
    | {
        ledgerEntryRef: FirebaseFirestore.DocumentReference;
        orderPath: string;
        paymentLedgerEntryId: string;
        provider: PaymentProviderKey;
        reason: string;
        resolutionEventRef: FirebaseFirestore.DocumentReference;
      }
    | undefined;
  let replacementFulfillment:
    | {
        orderId: string;
        order: Order;
        resolutionEventRef: FirebaseFirestore.DocumentReference;
      }
    | undefined;
  const replacementOrderNumber = rmaResolutionCreatesReplacementOrder(
    resolutionType,
  )
    ? (
        await firestore.collection(`channels/${channelId}/orders`).count().get()
      ).data().count
    : undefined;

  await firestore.runTransaction(async (transaction) => {
    const rmaSnapshot = await transaction.get(rmaRef);

    if (!rmaSnapshot.exists) {
      throw new Error("RMA request not found");
    }

    const rmaRequest = {
      id: rmaSnapshot.id,
      ...rmaSnapshot.data(),
    } as RmaRequest;

    if (rmaRequest.status === RmaRequestStatus.COMPLETED) {
      throw new Error("RMA request is already completed");
    }

    if (rmaRequest.status === RmaRequestStatus.CANCELED) {
      throw new Error("Canceled RMA requests cannot be resolved");
    }

    if (
      rmaRequest.status === RmaRequestStatus.REJECTED &&
      resolutionType !== RmaResolutionType.REJECT
    ) {
      throw new Error(
        "Rejected RMA requests can only receive a reject outcome",
      );
    }

    const orderRef = firestore.doc(
      `channels/${channelId}/orders/${rmaRequest.orderId}`,
    );
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      throw new Error("Order not found");
    }

    const order = {
      id: orderSnapshot.id,
      ...orderSnapshot.data(),
    } as Order;
    const provider = getProviderForRefund(order);

    if (shouldDispatchProviderRefund && !provider) {
      throw new Error(
        "Provider refund dispatch is only available for Stripe and Przelewy24 payments",
      );
    }

    const resolution = {
      ...(amount > 0 ? { amount } : {}),
      currency: order.currency,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      type: resolutionType,
    };
    const update: {
      paymentLedgerEventIds?: FieldValue;
      replacementOrderIds?: FieldValue;
      resolution: RmaRequest["resolution"];
      resolutionEventIds: FieldValue;
      status: RmaRequestStatus;
      storeCreditTransactionIds?: FieldValue;
      tenantId?: string;
      updatedAt: typeof timestampNow;
      updatedBy: typeof actor;
    } = {
      resolution,
      resolutionEventIds: FieldValue.arrayUnion(resolutionEventRef.id),
      status: getResolvedRmaRequestStatus(resolutionType),
      updatedAt: timestampNow,
      updatedBy: actor,
      ...(tenantId ? { tenantId } : {}),
    };
    const resolutionEvent: RmaResolutionEvent = {
      active: true,
      ...(amount > 0 ? { amount } : {}),
      channelId,
      createdAt: timestampNow,
      createdBy: actor,
      currency: order.currency,
      id: resolutionEventRef.id,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      orderId: order.id,
      rmaRequestId: rmaRequest.id,
      ...(tenantId ? { tenantId } : {}),
      type: resolutionType,
      updatedAt: timestampNow,
      updatedBy: actor,
    };

    if (rmaResolutionCreatesReplacementOrder(resolutionType)) {
      const replacementOrderId = `rma_${rmaRequest.id}_${resolutionEventRef.id}`;
      const replacementOrderRef = firestore.doc(
        `channels/${channelId}/orders/${replacementOrderId}`,
      );

      const replacementOrder = createRmaReplacementOrder({
        actor,
        order,
        orderId: replacementOrderId,
        orderNumber: replacementOrderNumber ?? order.number,
        resolutionEventId: resolutionEventRef.id,
        resolutionType,
        rmaRequest,
        tenantId,
        timestampNow,
      });

      transaction.set(replacementOrderRef, replacementOrder, { merge: true });
      update.replacementOrderIds = FieldValue.arrayUnion(replacementOrderId);
      resolutionEvent.replacementOrderId = replacementOrderId;
      replacementFulfillment = {
        order: replacementOrder,
        orderId: replacementOrderId,
        resolutionEventRef,
      };
    }

    if (resolutionType === RmaResolutionType.REFUND) {
      const paymentLedgerEntryId = getRmaPaymentLedgerEntryId({
        resolutionEventId: resolutionEventRef.id,
        rmaRequestId: rmaRequest.id,
      });
      const paymentLedgerEntryRef = orderRef
        .collection("paymentLedgerEntries")
        .doc(paymentLedgerEntryId);
      const reason = input.notes?.trim() || `RMA refund ${rmaRequest.id}`;

      transaction.set(
        paymentLedgerEntryRef,
        createRmaRefundLedgerEntry({
          actor,
          amount,
          order,
          paymentLedgerEntryId,
          tenantId,
          timestampNow,
        }),
        { merge: true },
      );
      update.paymentLedgerEventIds =
        FieldValue.arrayUnion(paymentLedgerEntryId);
      resolutionEvent.paymentLedgerEntryId = paymentLedgerEntryId;

      if (shouldDispatchProviderRefund && provider) {
        providerRefund = {
          ledgerEntryRef: paymentLedgerEntryRef,
          orderPath: orderRef.path,
          paymentLedgerEntryId,
          provider,
          reason,
          resolutionEventRef,
        };
      }
    }

    if (resolutionType === RmaResolutionType.CREDIT) {
      const customerId = getOrderCustomerId(order, rmaRequest);
      if (!customerId) {
        throw new Error("Customer is required to issue RMA store credit");
      }

      const customerRef = firestore.doc(`customers/${customerId}`);
      const customerSnapshot = await transaction.get(customerRef);

      if (!customerSnapshot.exists) {
        throw new Error("Customer not found for RMA store credit");
      }

      const currentBalance =
        typeof customerSnapshot.data()?.storeCreditBalance === "number"
          ? (customerSnapshot.data()?.storeCreditBalance as number)
          : 0;
      const nextBalance = currentBalance + amount;
      const storeCreditTransactionId = getStoreCreditTransactionId({
        resolutionEventId: resolutionEventRef.id,
        rmaRequestId: rmaRequest.id,
      });
      const storeCreditTransactionRef = customerRef
        .collection("storeCreditTransactions")
        .doc(storeCreditTransactionId);
      const storeCreditTransaction: StoreCreditTransaction = {
        active: true,
        amount,
        balanceAfter: nextBalance,
        createdAt: timestampNow,
        createdBy: actor,
        currency: order.currency,
        customerId,
        id: storeCreditTransactionId,
        name: `RMA credit ${rmaRequest.id}`,
        orderId: order.id,
        reason: input.notes?.trim() || `RMA ${rmaRequest.id}`,
        ...(tenantId ? { tenantId } : {}),
        type: StoreCreditTransactionType.ISSUE,
        updatedAt: timestampNow,
        updatedBy: actor,
      };

      transaction.update(customerRef, {
        storeCreditBalance: nextBalance,
        updatedAt: timestampNow,
        updatedBy: actor,
      });
      transaction.set(storeCreditTransactionRef, storeCreditTransaction, {
        merge: true,
      });
      update.storeCreditTransactionIds = FieldValue.arrayUnion(
        storeCreditTransactionId,
      );
      resolutionEvent.storeCreditTransactionId = storeCreditTransactionId;
    }

    transaction.set(resolutionEventRef, resolutionEvent, { merge: true });
    transaction.update(rmaRef, update);
  });

  const result: {
    fulfillmentRequestCreatedCount?: number;
    fulfillmentRequestError?: string;
    fulfillmentRequestSkippedCount?: number;
    fulfillmentRequestStatus?: RmaFulfillmentRequestStatus;
    providerRefundError?: string;
    providerRefundStatus?: RmaProviderRefundStatus | "SKIPPED";
    stockReservationError?: string;
    stockReservationStatus?: RmaStockReservationStatus;
  } = {};

  if (replacementFulfillment) {
    try {
      await processOrderStockReservation({
        channelId,
        order: replacementFulfillment.order,
        orderId: replacementFulfillment.orderId,
      });
      const updatedAt = Timestamp.now();

      await replacementFulfillment.resolutionEventRef.set(
        {
          stockReservationStatus: "COMPLETED",
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      );

      result.stockReservationStatus = "COMPLETED";
    } catch (error) {
      const stockReservationError = getErrorMessage(error);
      const updatedAt = Timestamp.now();

      await replacementFulfillment.resolutionEventRef.set(
        {
          stockReservationError,
          stockReservationStatus: "FAILED",
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      );

      result.stockReservationError = stockReservationError;
      result.stockReservationStatus = "FAILED";
    }

    try {
      const fulfillmentResult = await processOrderCreatedFulfillment(
        {
          channelId,
          orderId: replacementFulfillment.orderId,
        },
        { skipTenantAuth: true },
      );
      const fulfillmentRequestStatus =
        fulfillmentResult.createdCount > 0 ? "COMPLETED" : "SKIPPED";
      const updatedAt = Timestamp.now();

      await replacementFulfillment.resolutionEventRef.set(
        {
          fulfillmentRequestCreatedCount: fulfillmentResult.createdCount,
          fulfillmentRequestSkippedCount: fulfillmentResult.skippedCount,
          fulfillmentRequestStatus,
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      );

      result.fulfillmentRequestCreatedCount = fulfillmentResult.createdCount;
      result.fulfillmentRequestSkippedCount = fulfillmentResult.skippedCount;
      result.fulfillmentRequestStatus = fulfillmentRequestStatus;
    } catch (error) {
      const fulfillmentRequestError = getErrorMessage(error);
      const updatedAt = Timestamp.now();

      await replacementFulfillment.resolutionEventRef.set(
        {
          fulfillmentRequestError,
          fulfillmentRequestStatus: "FAILED",
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      );

      result.fulfillmentRequestError = fulfillmentRequestError;
      result.fulfillmentRequestStatus = "FAILED";
    }
  }

  if (!providerRefund) {
    return { ...result, providerRefundStatus: "SKIPPED" };
  }

  try {
    const result = await requestAdminPaymentRefund({
      ledgerEntryId: providerRefund.paymentLedgerEntryId,
      orderPath: providerRefund.orderPath,
      provider: providerRefund.provider,
      reason: providerRefund.reason,
      refundAmount: amount,
      requestedBy: actor.id,
    });
    const providerRefundStatus = getProviderRefundStatus(result.refundStatus);
    const updatedAt = Timestamp.now();

    await providerRefund.resolutionEventRef.set(
      {
        providerRefundStatus,
        updatedAt,
        updatedBy: actor,
      },
      { merge: true },
    );

    return { ...result, providerRefundStatus };
  } catch (error) {
    const providerRefundError = getErrorMessage(error);
    const updatedAt = Timestamp.now();

    await Promise.all([
      providerRefund.resolutionEventRef.set(
        {
          providerRefundError,
          providerRefundStatus: "FAILED",
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      ),
      providerRefund.ledgerEntryRef.set(
        {
          status: PaymentLedgerEntryStatus.FAILED,
          updatedAt,
          updatedBy: actor,
        },
        { merge: true },
      ),
    ]);

    return {
      ...result,
      providerRefundError,
      providerRefundStatus: "FAILED",
    };
  }
}
