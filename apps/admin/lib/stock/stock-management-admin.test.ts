import type * as admin from "firebase-admin";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { reserveAttributeStock, reserveStock } = await import(
  "./stock-management-admin"
);

type FakeDocumentReference = {
  id: string;
  path: string;
};

type FakeDocumentSnapshot = {
  data: () => Record<string, unknown>;
  exists: boolean;
};

type FakeSetCall = {
  data: Record<string, unknown>;
  path: string;
};

type FakeTransaction = {
  get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
  set: (
    ref: FakeDocumentReference,
    data: Record<string, unknown>,
    options?: unknown,
  ) => void;
  update: (ref: FakeDocumentReference, data: Record<string, unknown>) => void;
};

function createDocumentReference(path: string): FakeDocumentReference {
  return {
    id: path.split("/").at(-1) ?? "",
    path,
  };
}

function createMockFirestore(options?: {
  stockData?: Record<string, unknown>;
  stockExists?: boolean;
}) {
  const stockExists = options?.stockExists ?? true;
  const stockData =
    options?.stockData ??
    ({
      allocated: 0,
      total: 10,
    } satisfies Record<string, unknown>);
  const setCalls: FakeSetCall[] = [];
  const updateCalls: FakeSetCall[] = [];
  const transaction: FakeTransaction = {
    get: async (ref) => {
      if (ref.path.includes("/inventoryMovements/")) {
        return { data: () => ({}), exists: false };
      }

      if (
        ref.path.includes("/stock/") ||
        ref.path.includes("/attributeStock/")
      ) {
        return {
          data: () => stockData,
          exists: stockExists,
        };
      }

      return { data: () => ({}), exists: false };
    },
    set: (ref, data) => {
      setCalls.push({ data, path: ref.path });
    },
    update: (ref, data) => {
      updateCalls.push({ data, path: ref.path });
    },
  };
  const db = {
    doc: (path: string) => createDocumentReference(path),
    runTransaction: (
      callback: (transaction: FakeTransaction) => Promise<void>,
    ) => callback(transaction),
  };

  return {
    db: db as unknown as admin.firestore.Firestore,
    setCalls,
    updateCalls,
  };
}

function expectNoUndefinedTopLevelFields(setCalls: FakeSetCall[]) {
  for (const call of setCalls) {
    const undefinedFields = Object.entries(call.data)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);

    expect(undefinedFields, call.path).toEqual([]);
  }
}

describe("stock-management-admin", () => {
  it("omits undefined optional fields from product inventory ledger writes", async () => {
    const { db, setCalls } = createMockFirestore();

    await reserveStock(db, [
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        productId: "product-1",
        quantity: 2,
        warehouseId: "warehouse-1",
      },
    ]);

    expect(setCalls).toHaveLength(2);
    expectNoUndefinedTopLevelFields(setCalls);
    for (const call of setCalls) {
      expect(call.data).not.toHaveProperty("idempotencyKey");
    }
  });

  it("omits undefined optional fields from attribute inventory ledger writes", async () => {
    const { db, setCalls } = createMockFirestore();

    await reserveAttributeStock(db, [
      {
        attributeId: "paper",
        attributeOptionValue: "matte",
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        quantity: 2,
        warehouseId: "warehouse-1",
      },
    ]);

    expect(setCalls).toHaveLength(2);
    expectNoUndefinedTopLevelFields(setCalls);
    for (const call of setCalls) {
      expect(call.data).not.toHaveProperty("idempotencyKey");
    }
  });

  it("skips product reservation when stock is not configured", async () => {
    const { db, setCalls, updateCalls } = createMockFirestore({
      stockExists: false,
    });

    await reserveStock(db, [
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        productId: "product-1",
        quantity: 2,
        warehouseId: "warehouse-1",
      },
    ]);

    expect(setCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("allows product reservation when available stock is negative", async () => {
    const { db, setCalls, updateCalls } = createMockFirestore({
      stockData: {
        allocated: 1,
        total: 0,
      },
    });

    await reserveStock(db, [
      {
        channelId: "channel-1",
        itemId: "item-1",
        orderId: "order-1",
        productId: "product-1",
        quantity: 1,
        warehouseId: "warehouse-1",
      },
    ]);

    expect(setCalls).toHaveLength(2);
    expect(updateCalls).toHaveLength(1);
  });
});
