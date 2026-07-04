import { describe, expect, it, vi } from "vitest";
import {
  ORDER_COUNTER_DOCUMENT_ID,
  ORDER_COUNTERS_COLLECTION_ID,
  QUOTE_COUNTER_DOCUMENT_ID,
  allocateOrderNumberInTransaction,
  type OrderNumberAggregateQuery,
  type OrderNumberCollectionReference,
  type OrderNumberDocumentReference,
  type OrderNumberTransaction,
} from "../order-number-counter";

/**
 * Builds a minimal structural orders-collection ref whose `.parent` exposes a
 * `counters` sub-collection, plus an aggregate `count()` returning `countValue`.
 */
function createOrdersCollection(countValue: number) {
  const counterRef: OrderNumberDocumentReference = {
    collection: vi.fn(),
    id: ORDER_COUNTER_DOCUMENT_ID,
    path: `channels/channel-1/${ORDER_COUNTERS_COLLECTION_ID}/${ORDER_COUNTER_DOCUMENT_ID}`,
  };

  const countersCollection: OrderNumberCollectionReference = {
    count: vi.fn(),
    doc: vi.fn(() => counterRef),
    parent: null,
  };

  const channelDoc: OrderNumberDocumentReference = {
    collection: vi.fn((id: string) => {
      if (id === ORDER_COUNTERS_COLLECTION_ID) {
        return countersCollection;
      }
      throw new Error(`unexpected collection ${id}`);
    }),
    id: "channel-1",
    path: "channels/channel-1",
  };

  const aggregateQuery: OrderNumberAggregateQuery = {
    get: vi.fn(async () => ({ data: () => ({ count: countValue }) })),
  };

  const ordersCollection: OrderNumberCollectionReference = {
    count: vi.fn(() => aggregateQuery),
    doc: vi.fn(),
    parent: channelDoc,
  };

  return { aggregateQuery, channelDoc, counterRef, countersCollection, ordersCollection };
}

describe("allocateOrderNumberInTransaction", () => {
  it("returns the counter's nextNumber and advances it when the counter exists", async () => {
    const { counterRef, ordersCollection } = createOrdersCollection(0);

    const transaction: OrderNumberTransaction = {
      get: vi.fn(async () => ({
        data: () => ({ nextNumber: 42 }),
        exists: true,
      })),
    } as unknown as OrderNumberTransaction;

    const result = await allocateOrderNumberInTransaction(
      transaction,
      ordersCollection,
    );

    expect(result.orderNumber).toBe(42);
    expect(result.nextNumber).toBe(43);
    expect(result.counterRef).toBe(counterRef);
    // Counter present -> the legacy aggregate count is NOT consulted.
    expect(ordersCollection.count).not.toHaveBeenCalled();
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.get).toHaveBeenCalledWith(counterRef);
  });

  it("seeds from the in-transaction aggregate count when the counter is missing", async () => {
    const { aggregateQuery, counterRef, ordersCollection } =
      createOrdersCollection(7);

    const get = vi
      .fn()
      // First call: the (missing) counter doc.
      .mockResolvedValueOnce({ data: () => undefined, exists: false })
      // Second call: the aggregate count query, read inside the transaction.
      .mockResolvedValueOnce({ data: () => ({ count: 7 }) });

    const transaction = { get } as unknown as OrderNumberTransaction;

    const result = await allocateOrderNumberInTransaction(
      transaction,
      ordersCollection,
    );

    expect(result.orderNumber).toBe(7);
    expect(result.nextNumber).toBe(8);
    expect(result.counterRef).toBe(counterRef);
    // The aggregate count() was read INSIDE the transaction (via transaction.get).
    expect(ordersCollection.count).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenNthCalledWith(1, counterRef);
    expect(get).toHaveBeenNthCalledWith(2, aggregateQuery);
  });

  it("treats a missing aggregate count as zero when seeding", async () => {
    const { ordersCollection } = createOrdersCollection(0);

    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: () => undefined, exists: false })
      .mockResolvedValueOnce({ data: () => ({}) });

    const transaction = { get } as unknown as OrderNumberTransaction;

    const result = await allocateOrderNumberInTransaction(
      transaction,
      ordersCollection,
    );

    expect(result.orderNumber).toBe(0);
    expect(result.nextNumber).toBe(1);
  });

  it("throws when the counter nextNumber is a string (corrupt)", async () => {
    const { counterRef, ordersCollection } = createOrdersCollection(0);

    const transaction: OrderNumberTransaction = {
      get: vi.fn(async () => ({
        data: () => ({ nextNumber: "7" }),
        exists: true,
      })),
    } as unknown as OrderNumberTransaction;

    await expect(
      allocateOrderNumberInTransaction(transaction, ordersCollection),
    ).rejects.toThrow(/non-numeric nextNumber/);
  });

  it("throws when the counter nextNumber is negative (corrupt)", async () => {
    const { counterRef, ordersCollection } = createOrdersCollection(0);

    const transaction: OrderNumberTransaction = {
      get: vi.fn(async () => ({
        data: () => ({ nextNumber: -1 }),
        exists: true,
      })),
    } as unknown as OrderNumberTransaction;

    await expect(
      allocateOrderNumberInTransaction(transaction, ordersCollection),
    ).rejects.toThrow(/non-numeric nextNumber/);
  });

  it("allocates orderNumber 7 and advances to 8 for a valid counter", async () => {
    const { counterRef, ordersCollection } = createOrdersCollection(0);

    const transaction: OrderNumberTransaction = {
      get: vi.fn(async () => ({
        data: () => ({ nextNumber: 7 }),
        exists: true,
      })),
    } as unknown as OrderNumberTransaction;

    const result = await allocateOrderNumberInTransaction(
      transaction,
      ordersCollection,
    );

    expect(result.orderNumber).toBe(7);
    expect(result.nextNumber).toBe(8);
    expect(result.counterRef).toBe(counterRef);
  });

  it("resolves a custom counterDocumentId to channels/{id}/counters/quotes", async () => {
    // Build a quotes collection whose parent is channel-1 (same shape as orders).
    const quoteCounterRef: OrderNumberDocumentReference = {
      collection: vi.fn(),
      id: QUOTE_COUNTER_DOCUMENT_ID,
      path: `channels/channel-1/${ORDER_COUNTERS_COLLECTION_ID}/${QUOTE_COUNTER_DOCUMENT_ID}`,
    };
    const countersCollection: OrderNumberCollectionReference = {
      count: vi.fn(),
      doc: vi.fn((id: string) => {
        if (id === QUOTE_COUNTER_DOCUMENT_ID) {
          return quoteCounterRef;
        }
        throw new Error(`unexpected doc id ${id}`);
      }),
      parent: null,
    };
    const channelDoc: OrderNumberDocumentReference = {
      collection: vi.fn((id: string) => {
        if (id === ORDER_COUNTERS_COLLECTION_ID) {
          return countersCollection;
        }
        throw new Error(`unexpected collection ${id}`);
      }),
      id: "channel-1",
      path: "channels/channel-1",
    };
    const quotesCollection: OrderNumberCollectionReference = {
      count: vi.fn(),
      doc: vi.fn(),
      parent: channelDoc,
    };

    const transaction: OrderNumberTransaction = {
      get: vi.fn(async () => ({
        data: () => ({ nextNumber: 3 }),
        exists: true,
      })),
    } as unknown as OrderNumberTransaction;

    const result = await allocateOrderNumberInTransaction(
      transaction,
      quotesCollection,
      { counterDocumentId: QUOTE_COUNTER_DOCUMENT_ID },
    );

    expect(result.counterRef).toBe(quoteCounterRef);
    expect(result.counterRef.path).toBe(
      `channels/channel-1/${ORDER_COUNTERS_COLLECTION_ID}/${QUOTE_COUNTER_DOCUMENT_ID}`,
    );
    expect(result.orderNumber).toBe(3);
    expect(result.nextNumber).toBe(4);
  });

  it("throws when the orders collection has no parent channel document", async () => {
    const { ordersCollection } = createOrdersCollection(0);
    (ordersCollection as { parent: unknown }).parent = null;

    const transaction = {
      get: vi.fn(),
    } as unknown as OrderNumberTransaction;

    await expect(
      allocateOrderNumberInTransaction(transaction, ordersCollection),
    ).rejects.toThrow(/orders collection nested under a channel document/);
  });
});
