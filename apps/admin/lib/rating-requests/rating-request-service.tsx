import "server-only";

import { sendEmail } from "@/lib/email";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  getRatingDocumentId,
  getRatingProductIds,
  shouldProcessRatingFlow,
} from "@/lib/rating-requests/rating-request-helpers";
import { RatingRequest } from "@konfi/emails";
import { requireTenantContextTenantId } from "@konfi/firebase";
import { ActivityStatus, OrderStatus, Rating, StoreOrder } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";

const FIRESTORE_ALREADY_EXISTS_CODE = 6;
const RATING_REQUEST_CONCURRENCY_LIMIT = 5;
const RATING_REQUEST_CRON_STATE_COLLECTION = "cronRuns";
const RATING_REQUEST_CRON_STATE_ID = "rating-requests";
const RATING_REQUEST_RESERVATION_TTL_MS = 30 * 60 * 1000;

export interface RatingRequestOrder {
  data: StoreOrder;
  ref: DocumentReference;
}

export interface RatingRequestRunResult {
  eligible: number;
  scanned: number;
  sent: number;
  skipped: number;
}

interface FirestoreTimestampLike {
  toDate(): Date;
}

interface RatingRequestCronState {
  lastSuccessfulRunAt?: FirestoreTimestampLike;
}

interface RatingRequestWindow {
  fulfilledAfter: Date;
  fulfilledBefore: Date;
}

interface RatingRequestOrderScan {
  fetched: number;
  orders: RatingRequestOrder[];
}

type RatingRequestReservationData = StoreOrder & {
  ratingRequestReservationExpiresAt?: FirestoreTimestampLike;
};

const legacyDedicatedTenantContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

function shouldScopeToTenant(tenantContext?: TenantContext): boolean {
  return Boolean(
    tenantContext &&
    (tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId),
  );
}

function getTenantScopeId(tenantContext?: TenantContext): string | undefined {
  return shouldScopeToTenant(tenantContext)
    ? requireTenantContextTenantId(
        tenantContext as TenantContext,
        "rating request cron",
      )
    : undefined;
}

function getRatingRequestCronStateId(tenantContext?: TenantContext): string {
  const tenantId = getTenantScopeId(tenantContext);

  return tenantId
    ? `${RATING_REQUEST_CRON_STATE_ID}_${tenantId}`
    : RATING_REQUEST_CRON_STATE_ID;
}

function toDate(value: unknown): Date | undefined {
  if (typeof value !== "object" || value === null || !("toDate" in value)) {
    return undefined;
  }

  const toDateMethod = (value as { toDate?: unknown }).toDate;
  if (typeof toDateMethod !== "function") {
    return undefined;
  }

  const date = toDateMethod.call(value);

  return date instanceof Date ? date : undefined;
}

function isWithinRatingRequestWindow(
  date: Date,
  window: RatingRequestWindow,
): boolean {
  return date > window.fulfilledAfter && date <= window.fulfilledBefore;
}

function wasOrderFulfilledWithinWindow(
  data: Pick<StoreOrder, "activities">,
  window: RatingRequestWindow,
): boolean {
  if (!Array.isArray(data.activities)) {
    return false;
  }

  return data.activities.some((activity) => {
    if (
      activity.type !== ActivityStatus.ORDER_STATUS_UPDATE ||
      activity.value !== OrderStatus.FULFILLED
    ) {
      return false;
    }

    const fulfilledAt = toDate(activity.timestamp);

    return fulfilledAt
      ? isWithinRatingRequestWindow(fulfilledAt, window)
      : false;
  });
}

function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return (
    (typeof code === "number" && code === FIRESTORE_ALREADY_EXISTS_CODE) ||
    (typeof code === "string" && code === "already-exists")
  );
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = Array.from({ length: items.length }) as R[];
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) {
      return;
    }

    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runNext(),
    ),
  );

  return results;
}

export async function listPendingRatingRequestOrders(params: {
  fulfilledAfter: Date;
  fulfilledBefore: Date;
  firestore: FirebaseFirestore.Firestore;
  limit?: number;
  tenantContext?: TenantContext;
}): Promise<RatingRequestOrder[]> {
  const scan = await scanPendingRatingRequestOrders(params);

  return scan.orders;
}

async function scanPendingRatingRequestOrders(params: {
  fulfilledAfter: Date;
  fulfilledBefore: Date;
  firestore: FirebaseFirestore.Firestore;
  limit?: number;
  tenantContext?: TenantContext;
}): Promise<RatingRequestOrderScan> {
  const window: RatingRequestWindow = {
    fulfilledAfter: params.fulfilledAfter,
    fulfilledBefore: params.fulfilledBefore,
  };
  const tenantId = getTenantScopeId(params.tenantContext);
  let query = params.firestore
    .collectionGroup("orders")
    .where("status", "==", OrderStatus.FULFILLED)
    .where("isFromStore", "==", true);
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  const snapshot = await (
    params.limit ? query.limit(params.limit) : query
  ).get();

  const orders = snapshot.docs
    .map((doc) => ({
      data: doc.data() as StoreOrder,
      ref: doc.ref,
    }))
    .filter(
      (order) =>
        shouldProcessRatingFlow(order.data) &&
        wasOrderFulfilledWithinWindow(order.data, window) &&
        getRatingProductIds(order.data).length > 0,
    );

  return {
    fetched: snapshot.docs.length,
    orders,
  };
}

export async function reserveRatingRequestOrder(params: {
  now: Date;
  orderRef: DocumentReference;
  reservationId: string;
  tenantContext?: TenantContext;
}): Promise<StoreOrder | undefined> {
  const firestore = getAdminDb();
  const tenantId = getTenantScopeId(params.tenantContext);
  const newReservationExpiresAt = new Date(
    params.now.getTime() + RATING_REQUEST_RESERVATION_TTL_MS,
  );

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(params.orderRef);
    const latestOrder = snapshot.data() as
      | RatingRequestReservationData
      | undefined;
    const existingReservationExpiresAt = toDate(
      latestOrder?.ratingRequestReservationExpiresAt,
    );

    if (
      !latestOrder ||
      (tenantId && latestOrder.tenantId !== tenantId) ||
      !shouldProcessRatingFlow(latestOrder) ||
      getRatingProductIds(latestOrder).length === 0 ||
      (existingReservationExpiresAt &&
        existingReservationExpiresAt.getTime() > params.now.getTime())
    ) {
      return undefined;
    }

    transaction.update(params.orderRef, {
      ratingRequestReservationExpiresAt: Timestamp.fromDate(
        newReservationExpiresAt,
      ),
      ratingRequestReservationId: params.reservationId,
      ratingRequestReservedAt: Timestamp.fromDate(params.now),
    });

    return latestOrder;
  });
}

async function releaseRatingRequestReservation(params: {
  orderRef: DocumentReference;
}): Promise<void> {
  await params.orderRef.update({
    ratingRequestReservationExpiresAt: FieldValue.delete(),
    ratingRequestReservationId: FieldValue.delete(),
    ratingRequestReservedAt: FieldValue.delete(),
  });
}

async function markRatingRequestOrderCompleted(params: {
  orderRef: DocumentReference;
}): Promise<void> {
  await params.orderRef.update({
    ratingRequestReservationExpiresAt: FieldValue.delete(),
    ratingRequestReservationId: FieldValue.delete(),
    ratingRequestReservedAt: FieldValue.delete(),
    ratingsAdded: true,
  });
}

async function createPendingRatingIfNotExists(params: {
  channelId: string;
  productId: string;
  tenantContext?: TenantContext;
  userId: string;
}): Promise<boolean> {
  const firestore = getAdminDb();
  const tenantId = getTenantScopeId(params.tenantContext);
  const ratingDocRef = firestore.doc(
    `channels/${params.channelId}/products/${params.productId}/ratings/${getRatingDocumentId(params.userId)}`,
  );
  const rating: Rating = {
    id: ratingDocRef.id,
    productId: params.productId,
    userId: params.userId,
    rating: 0,
    isRated: false,
    active: false,
    ...(tenantId ? { tenantId } : {}),
  };

  try {
    await ratingDocRef.create(rating);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return false;
    }

    throw error;
  }

  return true;
}

async function sendRatingRequestEmail(
  data: StoreOrder,
  tenantContext?: TenantContext,
): Promise<void> {
  const resolvedContext = tenantContext ?? legacyDedicatedTenantContext;
  const noReplyEmail = isSharedSaasTenantRuntime(resolvedContext)
    ? undefined
    : process.env.NO_REPLY_EMAIL;
  if (!noReplyEmail && !isSharedSaasTenantRuntime(resolvedContext)) {
    throw new Error("NO_REPLY_EMAIL is not defined.");
  }

  if (!data.contact.email) {
    return;
  }

  await sendEmail({
    to: data.contact.email,
    from: noReplyEmail,
    subject: "Podziel się swoją opinią!",
    tenantContext: resolvedContext,
    template: <RatingRequest name={data.contact.name || ""} />,
  });
}

export async function processRatingRequestOrder(params: {
  order: RatingRequestOrder;
  tenantContext?: TenantContext;
}): Promise<"sent" | "skipped"> {
  const reservationId = randomUUID();
  const reservedOrder = await reserveRatingRequestOrder({
    now: new Date(),
    orderRef: params.order.ref,
    reservationId,
    tenantContext: params.tenantContext,
  });

  if (!reservedOrder) {
    return "skipped";
  }

  try {
    // Rating docs use deterministic ids, so retries can safely reuse any docs
    // created before a later rating create or email send failed; either failure
    // path releases the reservation in the outer catch block below.
    await Promise.all(
      getRatingProductIds(reservedOrder).map((productId) =>
        createPendingRatingIfNotExists({
          channelId: reservedOrder.channelId,
          productId,
          tenantContext: params.tenantContext,
          userId: reservedOrder.userId,
        }),
      ),
    );

    if (!reservedOrder.contact.email) {
      await markRatingRequestOrderCompleted({
        orderRef: params.order.ref,
      });

      return "skipped";
    }

    await sendRatingRequestEmail(reservedOrder, params.tenantContext);
    await markRatingRequestOrderCompleted({
      orderRef: params.order.ref,
    });

    return "sent";
  } catch (error) {
    try {
      await releaseRatingRequestReservation({
        orderRef: params.order.ref,
      });
    } catch (clearError) {
      console.error("Failed to release rating request reservation:", {
        orderId: params.order.ref.id,
        originalError: error,
        releaseError: clearError,
        reservationId,
      });
    }

    throw error;
  }
}

export async function runAutomatedRatingRequests(params: {
  fulfilledAfter: Date;
  fulfilledBefore: Date;
  firestore?: FirebaseFirestore.Firestore;
  limit?: number;
  tenantContext?: TenantContext;
}): Promise<RatingRequestRunResult> {
  const firestore = params.firestore ?? getAdminDb();
  const scan = await scanPendingRatingRequestOrders({
    fulfilledAfter: params.fulfilledAfter,
    fulfilledBefore: params.fulfilledBefore,
    firestore,
    limit: params.limit,
    tenantContext: params.tenantContext,
  });

  const results = await runWithConcurrency(
    scan.orders,
    (order) =>
      processRatingRequestOrder({
        order,
        tenantContext: params.tenantContext,
      }),
    RATING_REQUEST_CONCURRENCY_LIMIT,
  );
  const sent = results.filter((result) => result === "sent").length;

  return {
    eligible: scan.orders.length,
    scanned: scan.fetched,
    sent,
    skipped: scan.orders.length - sent,
  };
}

export async function getLastSuccessfulRatingRequestRunAt(params: {
  firestore: FirebaseFirestore.Firestore;
  tenantContext?: TenantContext;
}): Promise<Date | undefined> {
  const snapshot = await params.firestore
    .collection(RATING_REQUEST_CRON_STATE_COLLECTION)
    .doc(getRatingRequestCronStateId(params.tenantContext))
    .get();
  const data = snapshot.data() as RatingRequestCronState | undefined;

  return data?.lastSuccessfulRunAt?.toDate();
}

export async function markRatingRequestRunSuccessful(params: {
  completedAt: Date;
  firestore: FirebaseFirestore.Firestore;
  tenantContext?: TenantContext;
}): Promise<void> {
  await params.firestore
    .collection(RATING_REQUEST_CRON_STATE_COLLECTION)
    .doc(getRatingRequestCronStateId(params.tenantContext))
    .set(
      {
        lastSuccessfulRunAt: Timestamp.fromDate(params.completedAt),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
}
