"use server";

import {
  getTenantAdminScopeTenantId,
  requireAdminAuth,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  getResendRuntimeClient,
  resolveResendSenderAddress,
} from "@/lib/resend/client";
import { StatusChange, render } from "@konfi/emails";
import {
  DesignatedPickupArea,
  isNestedCustomer,
  OrderStatus,
  ShippingOptions,
  StoreOrder,
} from "@konfi/types";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

interface ResendApiError {
  message?: string;
  statusCode?: number | null;
}

interface ResendSendResponseLike {
  error: ResendApiError | null;
}

const RESEND_MIN_REQUEST_INTERVAL_MS = 600;
const RESEND_RATE_LIMIT_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/**
 * IMPORTANT LIMITATION:
 * This queue/spacing state is process-local only. In Next.js server runtimes,
 * scale-out across multiple instances can still exceed account-wide limits.
 */
let lastResendRequestAt = 0;
let resendRequestQueue: Promise<void> = Promise.resolve();
let hasLoggedLimiterScopeWarning = false;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRateLimitError = (error: ResendApiError | null): boolean => {
  if (!error) {
    return false;
  }

  if (error.statusCode === 429) {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("429")
  );
};

const runQueuedResendRequest = async <T>(request: () => Promise<T>) => {
  const queuedRequest = resendRequestQueue.then(async () => {
    const elapsedSinceLastRequest = Date.now() - lastResendRequestAt;
    const waitMs = Math.max(
      0,
      RESEND_MIN_REQUEST_INTERVAL_MS - elapsedSinceLastRequest,
    );

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    try {
      return await request();
    } finally {
      lastResendRequestAt = Date.now();
    }
  });

  resendRequestQueue = queuedRequest.then(
    () => undefined,
    () => undefined,
  );

  return queuedRequest;
};

async function executeResendRequestWithRateLimit<
  T extends ResendSendResponseLike,
>(request: () => Promise<T>): Promise<T> {
  if (!hasLoggedLimiterScopeWarning) {
    console.warn(
      "Resend limiter is process-local only; scale-out can still exceed account-wide rate limits.",
    );
    hasLoggedLimiterScopeWarning = true;
  }

  let retryAttempt = 0;

  while (true) {
    const response = await runQueuedResendRequest(request);

    if (!isRateLimitError(response.error)) {
      return response;
    }

    if (retryAttempt >= RESEND_RATE_LIMIT_RETRY_DELAYS_MS.length) {
      return response;
    }

    const retryDelayMs = RESEND_RATE_LIMIT_RETRY_DELAYS_MS[retryAttempt];
    retryAttempt += 1;
    await sleep(retryDelayMs);
  }
}

function requiresPickupArrivalConfirmation(params: {
  designatedPickupAreaId?: string;
  pickupAreaWarehouseId?: string;
  sourceWarehouseIds: string[];
}): boolean {
  const { designatedPickupAreaId, pickupAreaWarehouseId, sourceWarehouseIds } =
    params;

  if (!designatedPickupAreaId || !pickupAreaWarehouseId) {
    return false;
  }

  if (sourceWarehouseIds.length === 0) {
    return false;
  }

  return !sourceWarehouseIds.includes(pickupAreaWarehouseId);
}

function getSourceWarehouseIds(order: StoreOrder): string[] {
  return [
    ...new Set(
      order.items
        .map((item) => item.warehouseId)
        .filter((id): id is string => !!id),
    ),
  ];
}

async function resolvePickupContext(
  db: FirebaseFirestore.Firestore,
  order: StoreOrder,
  tenantId?: string,
) {
  const sourceWarehouseIds = getSourceWarehouseIds(order);

  if (!order.designatedPickupAreaId) {
    return { sourceWarehouseIds, requiresArrivalConfirmation: false };
  }

  const pickupAreaSnap = await db
    .doc(`designatedPickupAreas/${order.designatedPickupAreaId}`)
    .get();

  if (!pickupAreaSnap.exists) {
    return { sourceWarehouseIds, requiresArrivalConfirmation: false };
  }

  const pickupArea = pickupAreaSnap.data() as DesignatedPickupArea;
  if (tenantId && pickupArea.tenantId !== tenantId) {
    return { sourceWarehouseIds, requiresArrivalConfirmation: false };
  }

  const needsConfirmation = requiresPickupArrivalConfirmation({
    designatedPickupAreaId: order.designatedPickupAreaId,
    pickupAreaWarehouseId: pickupArea.warehouseId,
    sourceWarehouseIds,
  });

  return {
    sourceWarehouseIds,
    pickupAreaWarehouseId: pickupArea.warehouseId,
    requiresArrivalConfirmation: needsConfirmation,
  };
}

interface SendStatusEmailResult {
  sent: boolean;
  suppressed?: boolean;
  error?: string;
}

/**
 * Server action: send a status-change email for an order.
 *
 * Called from the admin UI when an order status changes.
 * Handles the cross-warehouse pickup suppression gate:
 * - If the order is READY + PERSONAL_COLLECTION and the pickup warehouse
 *   differs from the source warehouses, the email is suppressed until the goods
 *   actually arrive. Arrival sets `tracking.deliveredAt` — either manually via
 *   `markOrderArrivedAtPickup`, by a delivery scan, or automatically by the
 *   internal-transit cron sweep (`/api/cron/internal-transit`) — which releases
 *   the pickup-ready email at that point.
 */
export async function sendOrderStatusEmail(
  channelId: string,
  orderId: string,
  newStatus: OrderStatus,
): Promise<SendStatusEmailResult> {
  await requireAdminAuth();
  const [authorizedChannelId, tenantContext] = await Promise.all([
    requireTenantAdminChannelAccess(channelId),
    getTenantContextForRequest(),
  ]);
  const tenantId = getTenantAdminScopeTenantId(tenantContext);

  const db = getAdminDb();
  const orderRef = db.doc(`channels/${authorizedChannelId}/orders/${orderId}`);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return { sent: false, error: "Order not found" };
  }

  const order = orderSnap.data() as StoreOrder;
  if (tenantId && order.tenantId !== tenantId) {
    return { sent: false, error: "Order not found" };
  }

  // Only send for email-eligible orders
  if (!order.isFromStore && !order.sendStatusChangeEmail) {
    return { sent: false };
  }

  // Only send for relevant statuses
  if (
    newStatus !== OrderStatus.IN_PROGRESS &&
    newStatus !== OrderStatus.READY &&
    newStatus !== OrderStatus.CANCELED &&
    newStatus !== OrderStatus.DELAYED
  ) {
    return { sent: false };
  }

  const shippingOption =
    order.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION;

  // Translate status
  let statusTranslated: string;
  switch (newStatus) {
    case OrderStatus.IN_PROGRESS:
      statusTranslated = "W realizacji";
      break;
    case OrderStatus.READY:
      if (shippingOption === ShippingOptions.PERSONAL_COLLECTION)
        statusTranslated = "Gotowe do odebrania";
      else statusTranslated = "Gotowe do wysyłki";
      break;
    case OrderStatus.CANCELED:
      statusTranslated = "Anulowane";
      break;
    case OrderStatus.DELAYED:
      statusTranslated = "Opóźnione";
      break;
    default:
      statusTranslated = "Nieznany";
  }

  // Pickup email suppression gate
  if (
    newStatus === OrderStatus.READY &&
    shippingOption === ShippingOptions.PERSONAL_COLLECTION
  ) {
    const pickupContext = await resolvePickupContext(db, order, tenantId);

    if (
      pickupContext.requiresArrivalConfirmation &&
      !order.tracking?.deliveredAt
    ) {
      console.info(
        `Suppressing pickup-ready email for order ${order.number} - ` +
          `source warehouses [${pickupContext.sourceWarehouseIds.join(",")}] ` +
          `do not include pickup warehouse ${pickupContext.pickupAreaWarehouseId}; awaiting delivery confirmation`,
      );
      return { sent: false, suppressed: true };
    }
  }

  const resendRuntime = await getResendRuntimeClient(tenantContext).catch(
    (error: unknown) => ({
      error:
        error instanceof Error ? error.message : "Resend is not configured",
    }),
  );

  if ("error" in resendRuntime) {
    return { sent: false, error: resendRuntime.error };
  }

  const { config, resend } = resendRuntime;

  const contactEmail = order.contact.email;
  if (!contactEmail) {
    return { sent: false, error: "No contact email on order" };
  }

  const customerName = isNestedCustomer(order.customer)
    ? order.customer.name
    : order.customer || "";
  const formattedFrom = resolveResendSenderAddress(config);
  const orderNumber = `${order.number}`;
  const subject = "Zmiana statusu zamówienia";
  let sendResponse: ResendSendResponseLike;

  try {
    const html = await render(
      StatusChange({
        brand: "store",
        name: customerName,
        orderNumber,
        status: statusTranslated,
      }),
    );

    sendResponse = await executeResendRequestWithRateLimit(() =>
      resend.emails.send({
        to: [contactEmail],
        from: formattedFrom,
        subject,
        html,
      }),
    );
  } catch (jsxError) {
    return {
      sent: false,
      error:
        jsxError instanceof Error
          ? jsxError.message
          : "Failed to render status-change email",
    };
  }

  const error = sendResponse.error;

  if (error) {
    console.error("Failed to send status-change email:", error);
    return { sent: false, error: error.message };
  }

  // Log email-sent activity on the order document
  await orderRef.update({
    activities: FieldValue.arrayUnion({
      type: "EMAIL_SENT",
      value: "EMAIL_SENT",
      timestamp: Timestamp.now(),
      metadata: {
        to: contactEmail,
        from: formattedFrom,
        subject,
        template: {
          kind: "jsx",
          name: "StatusChange",
        },
      },
    }),
  });

  return { sent: true };
}
