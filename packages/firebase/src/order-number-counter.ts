/**
 * Atomic per-channel order-number allocation.
 *
 * Order numbers used to be derived from a non-transactional aggregate
 * `count().get()` read taken just before the order document was written. Two
 * independent writers (store checkout and the admin AI inbound-email pipeline)
 * write into the same `channels/{channelId}/orders` collection, so interleaved
 * creations could read the same count and assign duplicate numbers.
 *
 * This helper centralizes the allocation against a per-channel counter document
 * (`channels/{channelId}/counters/orders`, shaped `{ nextNumber: number }`).
 * It performs only the READ phase of the transaction (reading the counter and,
 * on first use, lazily seeding from the legacy aggregate count INSIDE the same
 * transaction to preserve numbering continuity). The CALLER is responsible for
 * the two writes (the counter `{ nextNumber }` and the order document) so that
 * those writes join the caller's own write-phase in the correct order —
 * Firestore requires all reads before all writes within a transaction.
 *
 * The types here are intentionally structural (mirroring the approach in
 * `saas-runtime-quotas.ts`) so the helper does not take a hard dependency on the
 * `firebase-admin` types and stays trivially unit-testable.
 */

export interface OrderNumberAggregateSnapshot {
  data(): { count?: number };
}

export interface OrderNumberAggregateQuery {
  get(): Promise<OrderNumberAggregateSnapshot>;
}

export interface OrderNumberDocumentSnapshot {
  exists: boolean;
  data(): { nextNumber?: number } | undefined;
}

export interface OrderNumberDocumentReference {
  readonly id?: string;
  readonly path?: string;
  collection(collectionPath: string): OrderNumberCollectionReference;
}

export interface OrderNumberCollectionReference {
  readonly parent: OrderNumberDocumentReference | null;
  count(): OrderNumberAggregateQuery;
  doc(documentPath: string): OrderNumberDocumentReference;
}

export interface OrderNumberTransaction {
  get(
    reference: OrderNumberDocumentReference,
  ): Promise<OrderNumberDocumentSnapshot>;
  get(query: OrderNumberAggregateQuery): Promise<OrderNumberAggregateSnapshot>;
}

export interface AllocateOrderNumberResult {
  /** The number to assign to the order document being created. */
  orderNumber: number;
  /** The counter document the caller must write `{ nextNumber }` into (merge). */
  counterRef: OrderNumberDocumentReference;
  /** The value the caller must persist as the counter's `nextNumber`. */
  nextNumber: number;
}

/**
 * Sub-collection (sibling of `orders`) holding per-collection counter docs.
 */
export const ORDER_COUNTERS_COLLECTION_ID = "counters";

/**
 * Document id (within `counters`) holding the order-number counter.
 */
export const ORDER_COUNTER_DOCUMENT_ID = "orders";

/**
 * Document id (within `counters`) holding the quote-number counter.
 */
export const QUOTE_COUNTER_DOCUMENT_ID = "quotes";

function resolveCounterRef(
  collectionRef: OrderNumberCollectionReference,
  counterDocumentId: string,
): OrderNumberDocumentReference {
  const channelDoc = collectionRef.parent;

  if (!channelDoc) {
    throw new Error(
      "allocateOrderNumberInTransaction requires an orders collection nested under a channel document.",
    );
  }

  return channelDoc
    .collection(ORDER_COUNTERS_COLLECTION_ID)
    .doc(counterDocumentId);
}

/**
 * Read phase of the atomic per-collection number allocation.
 *
 * Reads the per-channel counter document (default id: `orders`; pass a custom
 * `options.counterDocumentId` for other entity types such as `quotes`). When it
 * exists, the allocated number is its `nextNumber` — a non-numeric, negative, or
 * fractional value is rejected immediately (throws). When it is missing (first
 * entity in the channel, or pre-counter legacy data), the counter is lazily
 * seeded from the legacy aggregate `count()` taken inside this same transaction
 * so numbering stays continuous with historic non-counter entities.
 *
 * Does NOT perform any writes. The caller writes the counter
 * (`counterRef` -> `{ nextNumber }`, merge) and the entity document
 * (`number = orderNumber`) during its write phase.
 */
export async function allocateOrderNumberInTransaction(
  transaction: OrderNumberTransaction,
  ordersCollectionRef: OrderNumberCollectionReference,
  options?: { counterDocumentId?: string },
): Promise<AllocateOrderNumberResult> {
  const counterDocumentId = options?.counterDocumentId ?? ORDER_COUNTER_DOCUMENT_ID;
  const counterRef = resolveCounterRef(ordersCollectionRef, counterDocumentId);
  const counterSnapshot = await transaction.get(counterRef);

  let orderNumber: number;

  if (counterSnapshot.exists) {
    const currentNext = counterSnapshot.data()?.nextNumber;
    if (
      typeof currentNext !== "number" ||
      !Number.isInteger(currentNext) ||
      currentNext < 0
    ) {
      throw new Error(
        `Order counter ${counterRef.path ?? "(unknown path)"} has a non-numeric nextNumber; refusing to allocate.`,
      );
    }
    orderNumber = currentNext;
  } else {
    // Lazy seed (runs at most once per channel): read the legacy aggregate
    // count inside this transaction so the first counter-backed number follows
    // on from historic non-counter orders.
    const aggregateSnapshot = await transaction.get(
      ordersCollectionRef.count(),
    );
    orderNumber = aggregateSnapshot.data().count ?? 0;
  }

  return {
    counterRef,
    nextNumber: orderNumber + 1,
    orderNumber,
  };
}
