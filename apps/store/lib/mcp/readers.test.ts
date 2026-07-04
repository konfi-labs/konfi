import type { Order } from "@konfi/types";
import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
}));

import {
  createFirestoreStoreMcpReaders,
  isOrderVisibleToCustomer,
} from "./readers";

interface MockProductSnapshot {
  data(): Record<string, unknown> | undefined;
  exists: boolean;
  id: string;
  ref: {
    parent: {
      parent?: {
        id: string;
      };
    };
  };
}

interface MockQuerySnapshot {
  docs: MockProductSnapshot[];
  empty: boolean;
}

interface QueryWhere {
  field: string;
  operator: string;
  value: unknown;
}

class MockProductQuery {
  readonly wheres: QueryWhere[] = [];
  limitValue: number | null = null;

  constructor(private readonly docs: MockProductSnapshot[]) {}

  where(field: string, operator: string, value: unknown): MockProductQuery {
    this.wheres.push({ field, operator, value });
    return this;
  }

  limit(value: number): MockProductQuery {
    this.limitValue = value;
    return this;
  }

  async get(): Promise<MockQuerySnapshot> {
    return {
      docs: this.docs,
      empty: this.docs.length === 0,
    };
  }
}

function createMissingProductSnapshot(id: string): MockProductSnapshot {
  return {
    data: () => undefined,
    exists: false,
    id,
    ref: {
      parent: {},
    },
  };
}

function createProductSnapshot(
  id: string,
  data: Record<string, unknown>,
): MockProductSnapshot {
  return {
    data: () => data,
    exists: true,
    id,
    ref: {
      parent: {
        parent: {
          id: "source-channel",
        },
      },
    },
  };
}

function createProductData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    active: true,
    availability: {
      availableForPurchase: true,
      publication: {
        toDate: () => new Date("2026-01-01T00:00:00.000Z"),
      },
      published: true,
    },
    description: "Public product",
    id: "linked-product",
    linkedChannels: ["store-channel"],
    name: "Linked product",
    seo: {
      description: "Public product",
      slug: "linked-product",
      title: "Linked product",
    },
    ...overrides,
  };
}

function createFirestoreMock(linkedDocs: MockProductSnapshot[]): {
  collectionGroupQueries: MockProductQuery[];
  firestore: Firestore;
} {
  const collectionGroupQueries: MockProductQuery[] = [];
  const firestore = {
    collection: vi.fn(() => ({
      doc: vi.fn((documentId: string) => ({
        get: vi.fn(async () => createMissingProductSnapshot(documentId)),
      })),
      where: vi.fn(
        (field: string, operator: string, value: unknown): MockProductQuery =>
          new MockProductQuery([]).where(field, operator, value),
      ),
    })),
    collectionGroup: vi.fn(() => {
      const query = new MockProductQuery(linkedDocs);
      collectionGroupQueries.push(query);
      return query;
    }),
  };

  return {
    collectionGroupQueries,
    firestore: firestore as unknown as Firestore,
  };
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    active: true,
    activities: [],
    appliedPromotionCodes: [],
    billing: null,
    carriedOutBy: [],
    channelId: "channel-1",
    contact: {
      active: true,
      email: "customer@example.com",
      name: "Customer",
      phone: "123456789",
    },
    createdAt: { toDate: () => new Date("2026-05-01T00:00:00.000Z") },
    createdBy: {
      id: "system",
      name: "System",
    },
    currency: "PLN",
    customer: {
      id: "customer-1",
      name: "Customer",
    },
    deadline: { toDate: () => new Date("2026-05-15T00:00:00.000Z") },
    deadlineString: "2026-05-15",
    difficulty: 0,
    exactTime: false,
    filesStatus: "WAITING_FOR_FILES",
    fulfilledItems: [],
    id: "order-1",
    inProgressItems: [],
    invoice: false,
    isFromStore: true,
    isTest: false,
    items: [],
    keywords: [],
    messages: [],
    name: "Order #1",
    number: 1,
    paymentStatus: "NEW",
    paymentType: "STRIPE",
    priority: 0,
    priorityItems: [],
    shipping: null,
    shippingOption: null,
    shippingPrice: 0,
    shippingPriceDiscount: null,
    status: "NEW",
    totalPrice: 1000,
    totalPriceDiscount: null,
    updatedAt: { toDate: () => new Date("2026-05-01T00:00:00.000Z") },
    updatedBy: {
      id: "system",
      name: "System",
    },
    ...overrides,
  } as unknown as Order;
}

describe("isOrderVisibleToCustomer", () => {
  it("allows active orders owned by the customer", () => {
    expect(isOrderVisibleToCustomer(createOrder(), "customer-1")).toBe(true);
  });

  it("allows orders owned through top-level customerId", () => {
    expect(
      isOrderVisibleToCustomer(
        createOrder({
          customer: {
            id: "",
            name: "Customer",
          },
          customerId: "customer-1",
        } as Partial<Order>),
        "customer-1",
      ),
    ).toBe(true);
  });

  it("rejects orders owned by a different customer", () => {
    expect(isOrderVisibleToCustomer(createOrder(), "customer-2")).toBe(false);
  });

  it("rejects inactive orders", () => {
    expect(
      isOrderVisibleToCustomer(createOrder({ active: false }), "customer-1"),
    ).toBe(false);
  });

  it("queries linked products by product id instead of scanning a batch", async () => {
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "store-channel";
    const { collectionGroupQueries, firestore } = createFirestoreMock([
      createProductSnapshot("doc-product", createProductData()),
    ]);
    const readers = createFirestoreStoreMcpReaders(firestore);

    const record = await readers.getProduct({ productId: "linked-product" });

    expect(record?.product.id).toBe("linked-product");
    expect(collectionGroupQueries[0]?.limitValue).toBe(1);
    expect(collectionGroupQueries[0]?.wheres).toContainEqual({
      field: "id",
      operator: "==",
      value: "linked-product",
    });
  });

  it("queries linked products by slug instead of scanning a batch", async () => {
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "store-channel";
    const { collectionGroupQueries, firestore } = createFirestoreMock([
      createProductSnapshot("doc-product", createProductData()),
    ]);
    const readers = createFirestoreStoreMcpReaders(firestore);

    const record = await readers.getProduct({ slug: "linked-product" });

    expect(record?.product.seo.slug).toBe("linked-product");
    expect(collectionGroupQueries[0]?.limitValue).toBe(1);
    expect(collectionGroupQueries[0]?.wheres).toContainEqual({
      field: "seo.slug",
      operator: "==",
      value: "linked-product",
    });
  });
});
