import "server-only";

import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId,
  tenantAdminChannelAccessAllows,
  type TenantAdminChannelAccess,
} from "@/actions/auth-utils";
import {
  getPrzelewy24PaymentCredentials,
  getStripePaymentCredentials,
  hasTenantPrzelewy24PaymentConfig,
  hasTenantStripePaymentConfig,
} from "@/lib/payments/tenant-payment-config";
import {
  type Przelewy24PaymentCredentials,
  type StripePaymentCredentials,
  getPrzelewy24TransactionBySessionId,
  createPaymentLedgerEntry,
  getProviderPaymentLedgerEntryId,
  getStripePaymentIntentById,
  refundPrzelewy24Payment,
  refundStripePayment,
  writeOrderPaymentLedgerEntry,
} from "@konfi/payments";
import {
  isNestedCustomer,
  Order,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";

import type {
  AdminPaymentListItem,
  AdminPaymentListResponse,
  AdminRefundMutationResponse,
  AdminPaymentRefundStatus,
  AdminPaymentSummary,
  PaymentProviderKey,
} from "./admin-types";
import {
  getLatestRefundRequest,
  getRefundHistory,
  getRefundedAmount,
  getRemainingRefundableAmount,
  hasActiveRefundRequest,
} from "./refund-helpers";
import type { PaymentRefundRequestAudit } from "./refund-helpers";

type PaymentRefundAudit = {
  provider: PaymentProviderKey;
  tenantId?: string;
  orderPath: string;
  orderId: string;
  channelId: string;
  paymentIntent?: string;
  sessionId?: string;
  amount: number;
  refundAmount?: number;
  refundedAmount?: number;
  currency: string;
  status: Exclude<AdminPaymentRefundStatus, "NONE">;
  reason: string;
  requestedBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  failedAt?: FirebaseFirestore.Timestamp;
  providerRefundId?: string;
  providerReference?: string;
  failureReason?: string;
  attempts: number;
  refundHistory?: PaymentRefundRequestAudit[];
};

type RefundableOrder = {
  order: Order;
  orderId: string;
  orderPath: string;
  channelId: string;
  refundAmount: number;
  nextRefundedAmount: number;
};

type AdminPaymentOrderRecord = {
  item: AdminPaymentListItem;
  order: Order;
  orderPath: string;
};

export class AdminPaymentRefundError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AdminPaymentRefundError";
    this.statusCode = statusCode;
  }
}

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;
const PAYMENT_PROVIDER_TYPES: Record<PaymentProviderKey, PaymentType> = {
  stripe: PaymentType.STRIPE,
  przelewy24: PaymentType.PRZELEWY24,
};

async function getAdminPaymentTenantAccessContext(): Promise<{
  channelAccess: TenantAdminChannelAccess;
  tenantContext: TenantContext;
}> {
  const tenantContext = await getTenantContextForRequest();

  if (
    tenantContext.deploymentMode !== "saas" &&
    !tenantContext.requireTenantId
  ) {
    return {
      channelAccess: {
        allChannels: true,
        channelIds: [],
      },
      tenantContext,
    };
  }

  return getTenantAdminChannelAccessContext();
}

function isValidOrderDocumentPath(path: string): boolean {
  return /^channels\/[^/]+\/orders\/[^/]+$/u.test(path);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toIsoString(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString() as string;
  }

  return undefined;
}

function toMillis(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis() as number;
  }

  const iso = toIsoString(value);
  if (!iso) {
    return 0;
  }

  return new Date(iso).getTime();
}

function getCustomerLabel(order: Order): string {
  if (isNestedCustomer(order.customer)) {
    return order.customer.name;
  }

  const customerValue =
    typeof order.customer === "string" ? order.customer.trim() : "";
  if (customerValue.length > 0) {
    return customerValue;
  }

  const contactName = [order.contact?.email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return contactName[0] ?? "—";
}

function getProviderReference(
  provider: PaymentProviderKey,
  order: Order,
): string | undefined {
  if (provider === "stripe") {
    return order.checkoutSession?.paymentIntent;
  }

  return order.checkoutSession?.paymentIntent ?? order.checkoutSession?.id;
}

function comparePaymentItems(
  left: AdminPaymentListItem,
  right: AdminPaymentListItem,
) {
  if (left.createdAtMs !== right.createdAtMs) {
    return right.createdAtMs - left.createdAtMs;
  }

  return right.orderNumber - left.orderNumber;
}

function normalizeIsoDateString(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalizedDate = new Date(value);
  if (Number.isNaN(normalizedDate.getTime())) {
    return undefined;
  }

  return normalizedDate.toISOString();
}

function mapStripePaymentStatus(
  status: Stripe.PaymentIntent.Status,
): PaymentStatus {
  switch (status) {
    case "succeeded":
      return PaymentStatus.COMPLETED;
    case "canceled":
      return PaymentStatus.CANCELED;
    case "processing":
    case "requires_capture":
      return PaymentStatus.PENDING;
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
    default:
      return PaymentStatus.NEW;
  }
}

async function isProviderConfigured(
  provider: PaymentProviderKey,
  tenantContext?: TenantContext,
): Promise<boolean> {
  return provider === "stripe"
    ? hasTenantStripePaymentConfig(tenantContext)
    : hasTenantPrzelewy24PaymentConfig(tenantContext);
}

function getRefundAuditId(
  provider: PaymentProviderKey,
  orderPath: string,
): string {
  return `${provider}-${Buffer.from(orderPath).toString("base64url")}`;
}

function canRefundOrder(
  provider: PaymentProviderKey,
  order: Order,
  orderPath: string,
  refund?: PaymentRefundAudit,
): boolean {
  if (order.paymentStatus !== PaymentStatus.COMPLETED) {
    return false;
  }

  if (hasActiveRefundRequest(refund)) {
    return false;
  }

  if (getRemainingRefundableAmount(order.totalPrice, refund) < 1) {
    return false;
  }

  if (provider === "stripe") {
    return Boolean(order.checkoutSession?.paymentIntent);
  }

  return Boolean(order.path ?? orderPath);
}

function getOrderPathParts(orderPath: string) {
  if (!isValidOrderDocumentPath(orderPath)) {
    throw new Error("Invalid order reference");
  }

  const [channelsSegment, channelId, ordersSegment, orderId] =
    orderPath.split("/");

  if (
    channelsSegment !== "channels" ||
    ordersSegment !== "orders" ||
    !channelId ||
    !orderId ||
    channelId === "." ||
    channelId === ".." ||
    orderId === "." ||
    orderId === ".."
  ) {
    throw new Error("Invalid order reference");
  }

  return {
    channelId,
    orderId,
  };
}

function toPaymentListItem(params: {
  provider: PaymentProviderKey;
  order: Order;
  orderId: string;
  orderPath: string;
  channelId: string;
  refund?: PaymentRefundAudit;
  providerConfigured: boolean;
}): AdminPaymentListItem {
  const {
    provider,
    order,
    orderId,
    orderPath,
    channelId,
    refund,
    providerConfigured,
  } = params;
  const latestRefundRequest = getLatestRefundRequest(refund);
  const refundedAmount = getRefundedAmount(refund);
  const remainingRefundableAmount = getRemainingRefundableAmount(
    order.totalPrice,
    refund,
  );

  return {
    orderId,
    orderNumber: order.number,
    orderPath,
    channelId,
    customerLabel: getCustomerLabel(order),
    contactEmail: order.contact?.email ?? order.email ?? undefined,
    currency: order.currency ?? "PLN",
    totalAmount: order.totalPrice,
    paymentStatus: order.paymentStatus,
    providerReference: getProviderReference(provider, order),
    checkoutSessionId: order.checkoutSession?.id,
    checkoutUrl: order.checkoutSession?.url,
    createdAt: toIsoString(order.createdAt),
    createdAtMs: toMillis(order.createdAt),
    refundEligible:
      providerConfigured && canRefundOrder(provider, order, orderPath, refund),
    refundedAmount,
    remainingRefundableAmount,
    refundStatus: latestRefundRequest?.status ?? "NONE",
    refundAmount: latestRefundRequest?.amount,
    refundReason: latestRefundRequest?.reason,
    refundRequestedAt: latestRefundRequest?.createdAt
      ? toIsoString(latestRefundRequest.createdAt)
      : undefined,
    refundCompletedAt: latestRefundRequest?.completedAt
      ? toIsoString(latestRefundRequest.completedAt)
      : undefined,
    refundFailureReason: latestRefundRequest?.failureReason,
  };
}

function summarizePayments(items: AdminPaymentListItem[]): AdminPaymentSummary {
  return items.reduce<AdminPaymentSummary>(
    (summary, item) => {
      summary.totalCount += 1;
      summary.totalAmount += item.totalAmount;
      if (item.refundEligible) {
        summary.refundableCount += 1;
      }
      if (
        item.refundedAmount > 0 ||
        item.paymentStatus === PaymentStatus.REFUNDED
      ) {
        summary.refundedCount += 1;
      }
      if (
        item.refundStatus === "PROCESSING" ||
        item.refundStatus === "PENDING"
      ) {
        summary.pendingRefundCount += 1;
      }
      return summary;
    },
    {
      totalCount: 0,
      refundableCount: 0,
      refundedCount: 0,
      pendingRefundCount: 0,
      totalAmount: 0,
    },
  );
}

async function listProviderOrderSnapshots(params: {
  channelAccess: TenantAdminChannelAccess;
  db: FirebaseFirestore.Firestore;
  provider: PaymentProviderKey;
  tenantContext: TenantContext;
}) {
  const tenantId = getTenantAdminScopeTenantId(params.tenantContext);
  const filterByChannelAccess = (
    snapshots: FirebaseFirestore.QueryDocumentSnapshot[],
  ) =>
    snapshots.filter((snapshot) => {
      const { channelId } = getOrderPathParts(snapshot.ref.path);

      return tenantAdminChannelAccessAllows(params.channelAccess, channelId);
    });

  try {
    let query: FirebaseFirestore.Query = params.db
      .collectionGroup("orders")
      .where("paymentType", "==", PAYMENT_PROVIDER_TYPES[params.provider]);

    if (tenantId) {
      query = query.where("tenantId", "==", tenantId);
    }

    const ordersSnapshot = await query.get();

    return filterByChannelAccess(ordersSnapshot.docs);
  } catch (error) {
    const firestoreCode =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (firestoreCode !== 9) {
      throw error;
    }

    console.error(
      `Falling back to per-channel payment query for ${params.provider} after collectionGroup FAILED_PRECONDITION`,
      error,
    );

    let channelsQuery: FirebaseFirestore.Query =
      params.db.collection("channels");

    if (tenantId) {
      channelsQuery = channelsQuery.where("tenantId", "==", tenantId);
    }

    const channelsSnapshot = await channelsQuery.get();
    const orderSnapshotsByChannel = await Promise.all(
      channelsSnapshot.docs
        .filter((channelSnapshot) =>
          tenantAdminChannelAccessAllows(
            params.channelAccess,
            channelSnapshot.id,
          ),
        )
        .map((channelSnapshot) => {
          let ordersQuery: FirebaseFirestore.Query = channelSnapshot.ref
            .collection("orders")
            .where(
              "paymentType",
              "==",
              PAYMENT_PROVIDER_TYPES[params.provider],
            );

          if (tenantId) {
            ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
          }

          return ordersQuery.get().then((snapshot) => snapshot.docs);
        }),
    );

    return orderSnapshotsByChannel.flat();
  }
}

async function enrichAdminPaymentListItem(
  provider: PaymentProviderKey,
  paymentRecord: AdminPaymentOrderRecord,
  credentials: StripePaymentCredentials | Przelewy24PaymentCredentials,
): Promise<AdminPaymentListItem> {
  const { item, order, orderPath } = paymentRecord;

  if (provider === "stripe") {
    const paymentIntentId = order.checkoutSession?.paymentIntent;
    if (!paymentIntentId) {
      return item;
    }

    try {
      const paymentIntent = await getStripePaymentIntentById({
        credentials: credentials as StripePaymentCredentials,
        isTest: order.isTest,
        paymentIntentId,
      });

      return {
        ...item,
        providerReference: paymentIntent.id,
        contactEmail: paymentIntent.receipt_email ?? item.contactEmail,
        totalAmount:
          paymentIntent.amount_received > 0
            ? paymentIntent.amount_received
            : paymentIntent.amount,
        paymentStatus: mapStripePaymentStatus(paymentIntent.status),
        createdAt: new Date(paymentIntent.created * 1000).toISOString(),
        createdAtMs: paymentIntent.created * 1000,
      };
    } catch (error) {
      console.error(
        `Failed to enrich Stripe payment ${paymentIntentId} for ${orderPath}`,
        error,
      );
      return item;
    }
  }

  const sessionId = order.path ?? orderPath;
  try {
    const transaction = await getPrzelewy24TransactionBySessionId({
      credentials: credentials as Przelewy24PaymentCredentials,
      isTest: order.isTest,
      sessionId,
    });
    const providerCreatedAt = normalizeIsoDateString(
      transaction.dateOfTransaction ?? transaction.date,
    );

    return {
      ...item,
      providerReference: transaction.orderId.toString(),
      contactEmail: transaction.clientEmail ?? item.contactEmail,
      totalAmount:
        typeof transaction.amount === "number"
          ? transaction.amount
          : item.totalAmount,
      currency: transaction.currency ?? item.currency,
      createdAt: providerCreatedAt ?? item.createdAt,
      createdAtMs: providerCreatedAt
        ? new Date(providerCreatedAt).getTime()
        : item.createdAtMs,
    };
  } catch (error) {
    console.error(
      `Failed to enrich Przelewy24 payment ${sessionId} for ${orderPath}`,
      error,
    );
    return item;
  }
}

export function parsePaymentProviderKey(
  value: string,
): PaymentProviderKey | undefined {
  if (value === "stripe" || value === "przelewy24") {
    return value;
  }

  return undefined;
}

export function isPaymentProviderKey(
  value: string,
): value is PaymentProviderKey {
  return parsePaymentProviderKey(value) !== undefined;
}

export async function listAdminPayments(params: {
  provider: PaymentProviderKey;
  page?: number;
  perPage?: number;
  search?: string;
}): Promise<AdminPaymentListResponse> {
  const db = getAdminDb();
  const { channelAccess, tenantContext } =
    await getAdminPaymentTenantAccessContext();
  const page = Math.max(params.page ?? 1, 1);
  const perPage = Math.min(
    Math.max(params.perPage ?? DEFAULT_PER_PAGE, 1),
    MAX_PER_PAGE,
  );
  const search = params.search?.trim().toLowerCase();
  const providerConfigured = await isProviderConfigured(
    params.provider,
    tenantContext,
  );
  const providerCredentials = providerConfigured
    ? params.provider === "stripe"
      ? await getStripePaymentCredentials(tenantContext)
      : await getPrzelewy24PaymentCredentials(tenantContext)
    : undefined;

  const [orderSnapshots, refundsSnapshot] = await Promise.all([
    listProviderOrderSnapshots({
      channelAccess,
      db,
      provider: params.provider,
      tenantContext,
    }),
    db
      .collection("paymentRefunds")
      .where("provider", "==", params.provider)
      .get(),
  ]);
  const tenantId = getTenantAdminScopeTenantId(tenantContext);

  const refundsByPath = new Map<string, PaymentRefundAudit>(
    refundsSnapshot.docs.flatMap((snapshot) => {
      const refund = snapshot.data() as PaymentRefundAudit;
      const { channelId } = getOrderPathParts(refund.orderPath);

      if (
        (tenantId && refund.tenantId !== tenantId) ||
        !tenantAdminChannelAccessAllows(channelAccess, channelId)
      ) {
        return [];
      }

      return [[refund.orderPath, refund] as const];
    }),
  );

  const paymentRecords = orderSnapshots.map((snapshot) => {
    const order = snapshot.data() as Order;
    const orderPath = order.path ?? snapshot.ref.path;
    const { channelId, orderId } = getOrderPathParts(orderPath);

    return {
      item: toPaymentListItem({
        provider: params.provider,
        order,
        orderId,
        orderPath,
        channelId,
        providerConfigured,
        refund: refundsByPath.get(orderPath),
      }),
      order,
      orderPath,
    } satisfies AdminPaymentOrderRecord;
  });

  const filteredRecords = !search
    ? paymentRecords
    : paymentRecords.filter(({ item }) =>
        [
          item.customerLabel,
          item.contactEmail,
          item.providerReference,
          item.checkoutSessionId,
          item.orderNumber.toString(),
          item.orderId,
          item.orderPath,
        ].some((value) => value?.toLowerCase().includes(search)),
      );

  const sortedRecords = filteredRecords.toSorted((left, right) =>
    comparePaymentItems(left.item, right.item),
  );
  const sortedItems = sortedRecords.map((record) => record.item);
  const startIndex = (page - 1) * perPage;
  const items = await Promise.all(
    sortedRecords
      .slice(startIndex, startIndex + perPage)
      .map((record) =>
        providerCredentials
          ? enrichAdminPaymentListItem(
              params.provider,
              record,
              providerCredentials,
            )
          : record.item,
      ),
  );

  return {
    items,
    page,
    perPage,
    totalCount: sortedItems.length,
    summary: summarizePayments(sortedItems),
  };
}

function getRefundErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Refund request failed";
}

async function validateRefundableOrder(params: {
  provider: PaymentProviderKey;
  orderPath: string;
  reason: string;
  requestedBy: string;
  refundAmount: number;
}): Promise<{
  refundRef: FirebaseFirestore.DocumentReference;
  refundableOrder: RefundableOrder;
  attempts: number;
  requestId: string;
  tenantContext: TenantContext;
}> {
  if (!isValidOrderDocumentPath(params.orderPath)) {
    throw new AdminPaymentRefundError("Invalid order reference", 400);
  }

  const { channelAccess, tenantContext } =
    await getAdminPaymentTenantAccessContext();
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const { channelId } = getOrderPathParts(params.orderPath);

  if (!tenantAdminChannelAccessAllows(channelAccess, channelId)) {
    throw new AdminPaymentRefundError("Tenant channel access is required", 403);
  }

  if (!(await isProviderConfigured(params.provider, tenantContext))) {
    throw new AdminPaymentRefundError(
      "This payment provider is not configured",
      503,
    );
  }

  const trimmedReason = params.reason.trim();
  if (trimmedReason.length < 5) {
    throw new AdminPaymentRefundError(
      "Refund reason must contain at least 5 characters",
      400,
    );
  }

  const normalizedRefundAmount = Math.floor(params.refundAmount);
  if (!Number.isFinite(normalizedRefundAmount) || normalizedRefundAmount < 1) {
    throw new AdminPaymentRefundError(
      "Refund amount must be greater than 0",
      400,
    );
  }

  const db = getAdminDb();
  const refundRef = db
    .collection("paymentRefunds")
    .doc(getRefundAuditId(params.provider, params.orderPath));
  const orderRef = db.doc(params.orderPath);

  return await db.runTransaction(async (transaction) => {
    const [orderSnapshot, refundSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(refundRef),
    ]);

    if (!orderSnapshot.exists) {
      throw new AdminPaymentRefundError("Order not found", 404);
    }

    const order = orderSnapshot.data() as Order;
    if (order.paymentType !== PAYMENT_PROVIDER_TYPES[params.provider]) {
      throw new AdminPaymentRefundError(
        "Payment provider does not match the selected order",
        400,
      );
    }

    if (order.paymentStatus === PaymentStatus.REFUNDED) {
      throw new AdminPaymentRefundError(
        "Payment has already been refunded",
        409,
      );
    }

    const existingRefund = refundSnapshot.exists
      ? (refundSnapshot.data() as PaymentRefundAudit)
      : undefined;

    if (hasActiveRefundRequest(existingRefund)) {
      throw new AdminPaymentRefundError(
        "A refund request already exists for this payment",
        409,
      );
    }

    if (
      !canRefundOrder(params.provider, order, params.orderPath, existingRefund)
    ) {
      throw new AdminPaymentRefundError(
        "Payment is not eligible for a refund",
        409,
      );
    }

    const remainingRefundableAmount = getRemainingRefundableAmount(
      order.totalPrice,
      existingRefund,
    );
    if (normalizedRefundAmount > remainingRefundableAmount) {
      throw new AdminPaymentRefundError(
        "Refund amount exceeds the remaining refundable balance",
        409,
      );
    }
    const currentRefundedAmount = getRefundedAmount(existingRefund);

    const existingHistory = getRefundHistory(existingRefund);
    const attempts =
      Math.max(existingHistory.length, existingRefund?.attempts ?? 0) + 1;
    const now = Timestamp.now();
    const { orderId } = getOrderPathParts(params.orderPath);

    if (tenantId && order.tenantId !== tenantId) {
      throw new AdminPaymentRefundError(
        "Payment does not belong to the active tenant",
        403,
      );
    }

    const requestId = `${refundRef.id}-${attempts}`;
    const refundHistoryEntry: PaymentRefundRequestAudit = {
      requestId,
      amount: normalizedRefundAmount,
      status: "PROCESSING",
      reason: trimmedReason,
      requestedBy: params.requestedBy,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(
      refundRef,
      {
        provider: params.provider,
        tenantId: order.tenantId,
        orderPath: params.orderPath,
        orderId,
        channelId,
        paymentIntent: order.checkoutSession?.paymentIntent,
        sessionId: order.path ?? params.orderPath,
        amount: Math.floor(order.totalPrice),
        refundAmount: normalizedRefundAmount,
        refundedAmount: currentRefundedAmount,
        currency: order.currency ?? "PLN",
        status: "PROCESSING",
        reason: trimmedReason,
        requestedBy: params.requestedBy,
        createdAt: existingRefund?.createdAt ?? now,
        updatedAt: now,
        completedAt: FieldValue.delete(),
        failureReason: FieldValue.delete(),
        failedAt: FieldValue.delete(),
        providerRefundId: FieldValue.delete(),
        providerReference: FieldValue.delete(),
        attempts,
        refundHistory: [...existingHistory, refundHistoryEntry],
      },
      { merge: true },
    );

    return {
      refundRef,
      refundableOrder: {
        order,
        orderId,
        orderPath: params.orderPath,
        channelId,
        refundAmount: normalizedRefundAmount,
        nextRefundedAmount: currentRefundedAmount + normalizedRefundAmount,
      },
      attempts,
      requestId,
      tenantContext,
    };
  });
}

async function updateRefundAuditRequest(params: {
  refundRef: FirebaseFirestore.DocumentReference;
  requestId: string;
  status: Exclude<AdminPaymentRefundStatus, "NONE">;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  failedAt?: FirebaseFirestore.Timestamp;
  failureReason?: string;
  providerRefundId?: string;
  providerReference?: string;
  refundedAmountIncrement?: number;
}) {
  await params.refundRef.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(params.refundRef);
    const existingRefund = snapshot.exists
      ? (snapshot.data() as PaymentRefundAudit)
      : undefined;
    const existingHistory = getRefundHistory(existingRefund);
    const updatedHistory = existingHistory.map((request) => {
      if (request.requestId !== params.requestId) {
        return request;
      }

      return {
        ...request,
        status: params.status,
        updatedAt: params.updatedAt,
        completedAt: params.completedAt,
        failedAt: params.failedAt,
        failureReason: params.failureReason,
        providerRefundId: params.providerRefundId,
        providerReference: params.providerReference,
      };
    });

    const nextRefundedAmount =
      getRefundedAmount(existingRefund) + (params.refundedAmountIncrement ?? 0);

    transaction.set(
      params.refundRef,
      {
        status: params.status,
        updatedAt: params.updatedAt,
        completedAt: params.completedAt ?? FieldValue.delete(),
        failedAt: params.failedAt ?? FieldValue.delete(),
        failureReason: params.failureReason ?? FieldValue.delete(),
        providerRefundId: params.providerRefundId ?? FieldValue.delete(),
        providerReference: params.providerReference ?? FieldValue.delete(),
        refundedAmount: nextRefundedAmount,
        refundHistory: updatedHistory,
      },
      { merge: true },
    );
  });
}

async function writeCompletedRefundLedgerEntry(params: {
  ledgerEntryId?: string;
  orderPath: string;
  provider: PaymentProviderKey;
  providerEventId?: string;
  providerReference?: string;
  refundableOrder: RefundableOrder;
}) {
  const db = getAdminDb();
  const id =
    params.ledgerEntryId ??
    getProviderPaymentLedgerEntryId({
      entryType: PaymentLedgerEntryType.REFUND,
      orderId: params.refundableOrder.orderId,
      providerEventId: params.providerEventId,
      providerReference: params.providerReference,
    });

  await writeOrderPaymentLedgerEntry({
    firestore: db,
    orderPath: params.orderPath,
    entry: createPaymentLedgerEntry({
      amount: params.refundableOrder.refundAmount,
      entryType: PaymentLedgerEntryType.REFUND,
      id,
      order: params.refundableOrder.order,
      orderId: params.refundableOrder.orderId,
      orderPath: params.orderPath,
      paymentMethodId: params.refundableOrder.order.paymentType,
      providerEventId: params.providerEventId,
      providerKind: params.provider,
      providerReference: params.providerReference,
      status: PaymentLedgerEntryStatus.SUCCEEDED,
    }),
  });
}

export async function requestAdminPaymentRefund(params: {
  ledgerEntryId?: string;
  provider: PaymentProviderKey;
  orderPath: string;
  reason: string;
  requestedBy: string;
  refundAmount: number;
}): Promise<AdminRefundMutationResponse> {
  const { refundRef, refundableOrder, requestId, tenantContext } =
    await validateRefundableOrder(params);
  const trimmedReason = params.reason.trim();

  try {
    if (params.provider === "stripe") {
      const paymentIntentId =
        refundableOrder.order.checkoutSession?.paymentIntent;
      if (!paymentIntentId) {
        throw new AdminPaymentRefundError(
          "Stripe payment intent is missing",
          409,
        );
      }

      const refund = await refundStripePayment({
        credentials: await getStripePaymentCredentials(tenantContext),
        isTest: refundableOrder.order.isTest,
        paymentIntentId,
        amount: refundableOrder.refundAmount,
        idempotencyKey: requestId,
        reason: "requested_by_customer",
        metadata: {
          adminUid: params.requestedBy,
          orderPath: refundableOrder.orderPath,
          reason: trimmedReason,
        },
      });

      const refundStatus =
        refund.status === "succeeded" ? "COMPLETED" : "PENDING";

      const completedAt =
        refundStatus === "COMPLETED" ? Timestamp.now() : undefined;
      await updateRefundAuditRequest({
        refundRef,
        requestId,
        status: refundStatus,
        updatedAt: Timestamp.now(),
        completedAt,
        providerRefundId: refund.id,
        providerReference:
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : (refund.payment_intent?.id ?? paymentIntentId),
        refundedAmountIncrement:
          refundStatus === "COMPLETED" ? refundableOrder.refundAmount : 0,
      });

      if (refundStatus === "COMPLETED") {
        await writeCompletedRefundLedgerEntry({
          orderPath: refundableOrder.orderPath,
          ledgerEntryId: params.ledgerEntryId,
          provider: params.provider,
          providerEventId: refund.id,
          providerReference:
            typeof refund.payment_intent === "string"
              ? refund.payment_intent
              : (refund.payment_intent?.id ?? paymentIntentId),
          refundableOrder,
        });
        const db = getAdminDb();
        const isFullRefund =
          refundableOrder.nextRefundedAmount >=
          Math.floor(refundableOrder.order.totalPrice);
        if (isFullRefund) {
          await db.doc(refundableOrder.orderPath).update({
            paymentStatus: PaymentStatus.REFUNDED,
            activities: FieldValue.arrayUnion({
              type: "PAYMENT_STATUS_UPDATE",
              value: PaymentStatus.REFUNDED,
              timestamp: Timestamp.now(),
              metadata: {
                provider: params.provider,
                adminUid: params.requestedBy,
                reason: trimmedReason,
                refundAmount: refundableOrder.refundAmount,
              },
            }),
          });
        }
      }

      return {
        message:
          refundStatus === "COMPLETED"
            ? "Refund completed successfully"
            : "Refund request was accepted and is being processed",
        refundStatus,
      } satisfies AdminRefundMutationResponse;
    }

    const refund = await refundPrzelewy24Payment({
      credentials: await getPrzelewy24PaymentCredentials(tenantContext),
      isTest: refundableOrder.order.isTest,
      sessionId: refundableOrder.order.path ?? refundableOrder.orderPath,
      amount: refundableOrder.refundAmount,
      description: trimmedReason.slice(0, 250),
      requestId,
    });

    const normalizedStatus = refund.status.toLowerCase();
    const refundStatus =
      normalizedStatus === "success" || normalizedStatus === "completed"
        ? "COMPLETED"
        : "PENDING";

    const completedAt =
      refundStatus === "COMPLETED" ? Timestamp.now() : undefined;
    await updateRefundAuditRequest({
      refundRef,
      requestId,
      status: refundStatus,
      updatedAt: Timestamp.now(),
      completedAt,
      providerRefundId: refund.refundsUuid,
      providerReference: refund.orderId?.toString(),
      refundedAmountIncrement:
        refundStatus === "COMPLETED" ? refundableOrder.refundAmount : 0,
    });

    if (refundStatus === "COMPLETED") {
      await writeCompletedRefundLedgerEntry({
        orderPath: refundableOrder.orderPath,
        ledgerEntryId: params.ledgerEntryId,
        provider: params.provider,
        providerEventId: refund.refundsUuid,
        providerReference: refund.orderId?.toString(),
        refundableOrder,
      });
      const db = getAdminDb();
      const isFullRefund =
        refundableOrder.nextRefundedAmount >=
        Math.floor(refundableOrder.order.totalPrice);
      if (isFullRefund) {
        await db.doc(refundableOrder.orderPath).update({
          paymentStatus: PaymentStatus.REFUNDED,
          activities: FieldValue.arrayUnion({
            type: "PAYMENT_STATUS_UPDATE",
            value: PaymentStatus.REFUNDED,
            timestamp: Timestamp.now(),
            metadata: {
              provider: params.provider,
              adminUid: params.requestedBy,
              reason: trimmedReason,
              refundAmount: refundableOrder.refundAmount,
            },
          }),
        });
      }
    }

    return {
      message:
        refundStatus === "COMPLETED"
          ? "Refund completed successfully"
          : "Refund request was accepted and is being processed",
      refundStatus,
    } satisfies AdminRefundMutationResponse;
  } catch (error) {
    await updateRefundAuditRequest({
      refundRef,
      requestId,
      status: "FAILED",
      updatedAt: Timestamp.now(),
      failedAt: Timestamp.now(),
      failureReason: getRefundErrorMessage(error),
    });

    throw error;
  }
}

export function getPaymentListQueryParams(searchParams: URLSearchParams) {
  return {
    page: parsePositiveInt(searchParams.get("page"), 1),
    perPage: parsePositiveInt(searchParams.get("perPage"), DEFAULT_PER_PAGE),
    search: searchParams.get("search") ?? undefined,
  };
}
