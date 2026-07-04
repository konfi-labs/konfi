import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CurrencyEnum,
  PaymentType,
  ShippingOptions,
  Unit,
  type FormattedOrderItem,
  type NestedCustomer,
  type Settings,
} from "@konfi/types";
import {
  buildInboundOrderCreate,
  createInboundOrder,
  createInboundQuote,
} from "./creation";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { InboundEmailRecord, InboundRoutingDecision } from "./types";

vi.mock("server-only", () => ({}));

const { mockGetAdminDb } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@konfi/firebase", () => ({
  QUOTE_COUNTER_DOCUMENT_ID: "quotes",
  allocateOrderNumberInTransaction: async (
    transaction: {
      get: (
        ref: unknown,
      ) => Promise<{
        data: () => { count?: number; nextNumber?: number };
        exists?: boolean;
      }>;
    },
    collectionRef: {
      count: () => unknown;
      parent: { collection: (id: string) => { doc: (id: string) => unknown } };
    },
    options?: { counterDocumentId?: string },
  ) => {
    const counterRef = collectionRef.parent
      .collection("counters")
      .doc(options?.counterDocumentId ?? "orders");
    const counterSnapshot = await transaction.get(counterRef);
    const orderNumber = counterSnapshot.exists
      ? (counterSnapshot.data().nextNumber ?? 1)
      : ((await transaction.get(collectionRef.count())).data().count ?? 0);

    return {
      counterRef,
      nextNumber: orderNumber + 1,
      orderNumber,
    };
  },
  withTenantOwned: <T extends object>(
    data: T & { tenantId?: string | null },
    context: TenantContext,
    operationName: string,
  ) => {
    if (context.deploymentMode !== "saas" && !context.requireTenantId) {
      return data;
    }

    const tenantId = data.tenantId?.trim() || context.tenantId?.trim();
    if (!tenantId) {
      throw new Error(
        `Missing tenantId for ${operationName} in ${context.deploymentMode} deployment mode.`,
      );
    }

    return { ...data, tenantId };
  },
}));

// FieldValue sentinels are recorded structurally; their exact shape is
// irrelevant to the order-numbering assertions.
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: (...values: unknown[]) => ({ type: "arrayUnion", values }),
    serverTimestamp: () => ({ type: "serverTimestamp" }),
  },
  Timestamp: {
    fromDate: (date: Date) => ({ type: "timestamp", iso: date.toISOString() }),
    now: () => ({ type: "timestamp-now" }),
  },
}));

const dedicatedTenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
} satisfies TenantContext;

const saasTenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-1",
} satisfies TenantContext;

const missingSaasTenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
} satisfies TenantContext;

function createSettings(): Settings {
  return {
    freeShipping: {
      enabled: false,
      min: 0,
    },
    shippingOptionsPrices: {
      [ShippingOptions.DHL]: 1230,
    },
  } as Settings;
}

function createRecord(): InboundEmailRecord {
  return {
    adminRecipientEmail: "orders@example.com",
    attachments: [],
    bcc: [],
    cc: [],
    channelId: "channel-1",
    createdBy: {
      id: "member-1",
      name: "Member",
    },
    eventCreatedAt: "2026-05-22T00:00:00.000Z",
    from: "customer@example.com",
    headers: {},
    html: null,
    id: "email-1",
    messageId: "message-1",
    resendEmailId: "resend-1",
    status: "processing",
    subject: "Order",
    text: "Please order one booklet.",
    to: ["orders@example.com"],
  };
}

function createDecision(): InboundRoutingDecision {
  const customer = {
    id: "customer-1",
    name: "Customer",
  } as NestedCustomer;
  const item = {
    customFormat: false,
    customPrice: null,
    description: "Booklet",
    discount: {
      code: null,
      discountedAmount: 0,
      discountValue: 0,
      type: "PERCENTAGE",
    },
    id: "item-1",
    name: "Booklet",
    product: {
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        taxCategoryId: "books",
        value: 10800,
      },
      id: "product-1",
      name: "Booklet",
      spec: { images: [] },
    },
    quantity: 1,
    totalPrice: 10800,
    unit: Unit.PCS,
  } as FormattedOrderItem;

  return {
    contact: {
      active: true,
      email: "customer@example.com",
      name: "Customer",
      phone: "",
    },
    customer,
    items: [item],
    missingInformation: [],
    model: {
      billingAddress: {
        active: true,
        city: "Warsaw",
        country: "PL",
        name: "Customer",
        street: "Main 1",
        zipCode: "00-001",
      },
      deadlineString: "2026-05-30",
      invoiceRequested: true,
      missingInformation: [],
      paymentType: PaymentType.BANK_TRANSFER,
      productRequest: "One booklet",
      rationale: "Exact match",
      requiredOrderFields: {
        itemsExplicit: true,
        paymentExplicit: true,
        shippingDestinationExplicit: true,
        shippingMethodExplicit: true,
      },
      responseDraft: {
        body: "Created",
        subject: "Order created",
      },
      shippingAddress: {
        active: true,
        city: "Warsaw",
        country: "PL",
        name: "Customer",
        street: "Main 1",
        zipCode: "00-001",
      },
      shippingOption: ShippingOptions.DHL,
      specialNotes: "",
    },
    outcome: "order",
    rationale: "Exact match",
    senderAuthentication: {
      dkim: "pass",
      dmarc: "pass",
      reasons: [],
      spf: "pass",
      verdict: "trusted",
    },
  };
}

describe("inbound email order creation", () => {
  it("adds an optional tax snapshot when tax settings are enabled", () => {
    const order = buildInboundOrderCreate({
      channel: {
        currency: CurrencyEnum.PLN,
        id: "channel-1",
      },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      taxSettings: {
        enabled: true,
        regions: [
          {
            countryCodes: ["PL"],
            defaultRateId: "standard",
            id: "pl",
            name: "Poland",
            rates: [
              { id: "standard", name: "VAT 23%", percent: 23 },
              {
                id: "books",
                name: "Books 8%",
                percent: 8,
                priority: 10,
                target: { taxCategoryIds: ["books"] },
              },
            ],
          },
        ],
      },
    });

    expect(order.taxSummary).toMatchObject({
      countryCode: "PL",
      enabled: true,
      shippingGross: 1230,
      totalGross: 12030,
    });
    expect(order.taxSummary?.lines[0]).toMatchObject({
      rateId: "books",
      taxAmount: 800,
    });
  });

  it("keeps imported email orders unchanged when tax settings are disabled", () => {
    const order = buildInboundOrderCreate({
      channel: {
        currency: CurrencyEnum.PLN,
        id: "channel-1",
      },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      taxSettings: {
        enabled: false,
      },
    });

    expect(order.taxSummary).toBeUndefined();
  });
});

/**
 * Minimal admin-SDK Firestore stub exercising the order-number allocation path
 * of `createInboundOrder`. The orders collection exposes `.parent` (the channel
 * doc) so the shared `@konfi/firebase` helper can reach
 * `channels/{id}/counters/orders`.
 */
function createOrderCreationDb(options: {
  counter?: { nextNumber: number } | undefined;
  seedCount?: number;
}) {
  const counter = options.counter;
  const seedCount = options.seedCount ?? 0;

  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const counterRef = {
    id: "orders",
    path: "channels/channel-1/counters/orders",
  };
  const aggregateQuery = {
    get: vi.fn(async () => ({ data: () => ({ count: seedCount }) })),
  };
  const orderDocRef = {
    id: "generated-order-id",
    path: "channels/channel-1/orders/generated-order-id",
    set: vi.fn(async () => undefined),
  };

  const channelDoc: Record<string, unknown> = {
    id: "channel-1",
    path: "channels/channel-1",
  };
  const ordersCollection = {
    parent: channelDoc,
    count: vi.fn(() => aggregateQuery),
    doc: vi.fn(() => orderDocRef),
  };
  channelDoc.collection = vi.fn((id: string) => {
    if (id === "orders") {
      return ordersCollection;
    }
    if (id === "counters") {
      return { doc: vi.fn(() => counterRef) };
    }
    if (id === "settings") {
      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false, data: () => undefined })),
        })),
      };
    }
    throw new Error(`unexpected channel sub-collection ${id}`);
  });

  const customerSet = vi.fn(async () => undefined);
  const inboundEmailSet = vi.fn(async () => undefined);

  const db = {
    collection: vi.fn((id: string) => {
      if (id === "channels") {
        return { doc: vi.fn(() => channelDoc) };
      }
      if (id === "customers") {
        return { doc: vi.fn(() => ({ set: customerSet })) };
      }
      if (id === "inboundEmails") {
        return { doc: vi.fn(() => ({ set: inboundEmailSet })) };
      }
      throw new Error(`unexpected collection ${id}`);
    }),
    runTransaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => {
      transaction.get.mockImplementation((ref: unknown) => {
        if (ref === counterRef) {
          return Promise.resolve({
            exists: counter !== undefined,
            data: () => counter,
          });
        }
        if (ref === aggregateQuery) {
          return Promise.resolve({ data: () => ({ count: seedCount }) });
        }
        throw new Error("unexpected transaction.get reference");
      });
      return fn(transaction);
    }),
  };

  return {
    aggregateQuery,
    counterRef,
    customerSet,
    db,
    inboundEmailSet,
    orderDocRef,
    transaction,
  };
}

/**
 * Minimal admin-SDK Firestore stub exercising the quote-number allocation path
 * of `createInboundQuote`. The quotes collection exposes `.parent` (the channel
 * doc) so the shared `@konfi/firebase` helper can reach
 * `channels/{id}/counters/quotes`.
 */
function createQuoteCreationDb(options: {
  counter?: { nextNumber: number } | undefined;
  seedCount?: number;
}) {
  const counter = options.counter;
  const seedCount = options.seedCount ?? 0;

  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const counterRef = {
    id: "quotes",
    path: "channels/channel-1/counters/quotes",
  };
  const aggregateQuery = {
    get: vi.fn(async () => ({ data: () => ({ count: seedCount }) })),
  };
  const quoteDocRef = {
    id: "generated-quote-id",
    path: "channels/channel-1/quotes/generated-quote-id",
    set: vi.fn(async () => undefined),
  };

  const channelDoc: Record<string, unknown> = {
    id: "channel-1",
    path: "channels/channel-1",
  };
  const quotesCollection = {
    parent: channelDoc,
    count: vi.fn(() => aggregateQuery),
    doc: vi.fn(() => quoteDocRef),
  };
  channelDoc.collection = vi.fn((id: string) => {
    if (id === "quotes") {
      return quotesCollection;
    }
    if (id === "counters") {
      return { doc: vi.fn(() => counterRef) };
    }
    throw new Error(`unexpected channel sub-collection ${id}`);
  });

  const inboundEmailSet = vi.fn(async () => undefined);

  const db = {
    collection: vi.fn((id: string) => {
      if (id === "channels") {
        return { doc: vi.fn(() => channelDoc) };
      }
      if (id === "inboundEmails") {
        return { doc: vi.fn(() => ({ set: inboundEmailSet })) };
      }
      throw new Error(`unexpected collection ${id}`);
    }),
    runTransaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => {
      transaction.get.mockImplementation((ref: unknown) => {
        if (ref === counterRef) {
          return Promise.resolve({
            exists: counter !== undefined,
            data: () => counter,
          });
        }
        if (ref === aggregateQuery) {
          return Promise.resolve({ data: () => ({ count: seedCount }) });
        }
        throw new Error("unexpected transaction.get reference");
      });
      return fn(transaction);
    }),
  };

  return {
    aggregateQuery,
    counterRef,
    db,
    inboundEmailSet,
    quoteDocRef,
    transaction,
  };
}

describe("createInboundOrder order numbering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes the order number from the per-channel counter and advances it", async () => {
    const { counterRef, db, orderDocRef, transaction } = createOrderCreationDb({
      counter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(db);

    const orderId = await createInboundOrder({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    expect(orderId).toBe(orderDocRef.id);

    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderDocRef,
    );
    expect(orderSetCall?.[1]).toEqual(
      expect.objectContaining({ id: orderDocRef.id, number: 42 }),
    );

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual({ nextNumber: 43 });
    expect(counterSetCall?.[2]).toEqual({ merge: true });
  });

  it("seeds the order number from the in-transaction count when no counter exists", async () => {
    const { counterRef, db, orderDocRef, transaction } = createOrderCreationDb({
      counter: undefined,
      seedCount: 5,
    });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundOrder({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderDocRef,
    );
    expect(orderSetCall?.[1]).toEqual(expect.objectContaining({ number: 5 }));

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual({ nextNumber: 6 });
  });

  it("stamps SaaS order, counter, customer update, and inbound status writes", async () => {
    const {
      counterRef,
      customerSet,
      db,
      inboundEmailSet,
      orderDocRef,
      transaction,
    } = createOrderCreationDb({
      counter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundOrder({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: saasTenantContext,
    });

    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderDocRef,
    );
    expect(orderSetCall?.[1]).toEqual(
      expect.objectContaining({
        id: orderDocRef.id,
        number: 42,
        tenantId: "tenant-1",
      }),
    );

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual({
      nextNumber: 43,
      tenantId: "tenant-1",
    });
    expect(customerSet).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" }),
      { merge: true },
    );
    expect(inboundEmailSet).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: orderDocRef.id,
        status: "order-created",
        tenantId: "tenant-1",
      }),
      { merge: true },
    );
  });

  it("does not stamp dedicated order or counter writes", async () => {
    const { counterRef, db, orderDocRef, transaction } = createOrderCreationDb({
      counter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundOrder({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderDocRef,
    );
    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(orderSetCall?.[1]).not.toHaveProperty("tenantId");
    expect(counterSetCall?.[1]).not.toHaveProperty("tenantId");
  });

  it("rejects SaaS order creation when tenant id is missing", async () => {
    const { db, transaction } = createOrderCreationDb({
      counter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await expect(
      createInboundOrder({
        channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
        decision: createDecision(),
        record: createRecord(),
        settings: createSettings(),
        tenantContext: missingSaasTenantContext,
      }),
    ).rejects.toThrow("Missing tenantId for inbound order counter");
    expect(transaction.set).not.toHaveBeenCalled();
  });
});

describe("createInboundQuote quote numbering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes the quote number from the per-channel quotes counter and advances it", async () => {
    const { counterRef, db, quoteDocRef, transaction } = createQuoteCreationDb({
      counter: { nextNumber: 10 },
    });
    mockGetAdminDb.mockReturnValue(db);

    const quoteId = await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    expect(quoteId).toBe(quoteDocRef.id);

    const quoteSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === quoteDocRef,
    );
    expect(quoteSetCall?.[1]).toEqual(
      expect.objectContaining({ id: quoteDocRef.id, number: 10 }),
    );

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual({ nextNumber: 11 });
    expect(counterSetCall?.[2]).toEqual({ merge: true });
  });

  it("two sequential quote creations get distinct numbers", async () => {
    let callCount = 0;
    const counterRef = {
      id: "quotes",
      path: "channels/channel-1/counters/quotes",
    };
    const quoteDocRef = {
      id: "generated-quote-id",
      path: "channels/channel-1/quotes/generated-quote-id",
      set: vi.fn(async () => undefined),
    };
    const channelDoc: Record<string, unknown> = {
      id: "channel-1",
      path: "channels/channel-1",
    };
    const quotesCollection = {
      parent: channelDoc,
      count: vi.fn(),
      doc: vi.fn(() => quoteDocRef),
    };
    channelDoc.collection = vi.fn((id: string) => {
      if (id === "quotes") {
        return quotesCollection;
      }
      if (id === "counters") {
        return { doc: vi.fn(() => counterRef) };
      }
      throw new Error(`unexpected channel sub-collection ${id}`);
    });

    const inboundEmailSet = vi.fn(async () => undefined);
    const transactions: Array<{
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    }> = [];
    const db = {
      collection: vi.fn((id: string) => {
        if (id === "channels") {
          return { doc: vi.fn(() => channelDoc) };
        }
        if (id === "inboundEmails") {
          return { doc: vi.fn(() => ({ set: inboundEmailSet })) };
        }
        throw new Error(`unexpected collection ${id}`);
      }),
      // Each runTransaction call simulates an independent transaction: the first
      // sees nextNumber=1, the second sees nextNumber=2 (as if the first committed).
      runTransaction: vi.fn(
        async (
          fn: (tx: {
            get: ReturnType<typeof vi.fn>;
            set: ReturnType<typeof vi.fn>;
          }) => unknown,
        ) => {
          callCount += 1;
          const currentNext = callCount;
          const tx = {
            get: vi.fn(async (ref: unknown) => {
              if (ref === counterRef) {
                return {
                  exists: true,
                  data: () => ({ nextNumber: currentNext }),
                };
              }
              throw new Error("unexpected ref");
            }),
            set: vi.fn(),
          };
          transactions.push(tx);
          return fn(tx);
        },
      ),
    };

    mockGetAdminDb.mockReturnValue(db);

    const decision = createDecision();
    const record1 = { ...createRecord(), id: "email-1" };
    const record2 = { ...createRecord(), id: "email-2" };

    await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision,
      record: record1,
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });
    await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision,
      record: record2,
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    expect(db.runTransaction).toHaveBeenCalledTimes(2);

    // First transaction wrote number:1 and advanced the counter to nextNumber:2
    const tx1 = transactions[0];
    const tx1QuoteSetCall = tx1.set.mock.calls.find(
      ([ref]) => ref === quoteDocRef,
    );
    expect(tx1QuoteSetCall?.[1]).toEqual(
      expect.objectContaining({ number: 1 }),
    );
    const tx1CounterSetCall = tx1.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(tx1CounterSetCall?.[1]).toEqual({ nextNumber: 2 });
    expect(tx1CounterSetCall?.[2]).toEqual({ merge: true });

    // Second transaction wrote number:2 and advanced the counter to nextNumber:3
    const tx2 = transactions[1];
    const tx2QuoteSetCall = tx2.set.mock.calls.find(
      ([ref]) => ref === quoteDocRef,
    );
    expect(tx2QuoteSetCall?.[1]).toEqual(
      expect.objectContaining({ number: 2 }),
    );
    const tx2CounterSetCall = tx2.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(tx2CounterSetCall?.[1]).toEqual({ nextNumber: 3 });
    expect(tx2CounterSetCall?.[2]).toEqual({ merge: true });
  });

  it("writes the quote counter to channels/{id}/counters/quotes (not orders)", async () => {
    const { counterRef, db, transaction } = createQuoteCreationDb({
      counter: { nextNumber: 5 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterRef.path).toBe("channels/channel-1/counters/quotes");
    expect(counterSetCall?.[1]).toEqual({ nextNumber: 6 });
    expect(counterSetCall?.[2]).toEqual({ merge: true });
  });

  it("stamps SaaS quote, counter, and inbound status writes", async () => {
    const { counterRef, db, inboundEmailSet, quoteDocRef, transaction } =
      createQuoteCreationDb({
        counter: { nextNumber: 10 },
      });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: saasTenantContext,
    });

    const quoteSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === quoteDocRef,
    );
    expect(quoteSetCall?.[1]).toEqual(
      expect.objectContaining({
        id: quoteDocRef.id,
        number: 10,
        tenantId: "tenant-1",
      }),
    );

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual({
      nextNumber: 11,
      tenantId: "tenant-1",
    });
    expect(inboundEmailSet).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: quoteDocRef.id,
        status: "quote-created",
        tenantId: "tenant-1",
      }),
      { merge: true },
    );
  });

  it("does not stamp dedicated quote or counter writes", async () => {
    const { counterRef, db, quoteDocRef, transaction } = createQuoteCreationDb({
      counter: { nextNumber: 10 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await createInboundQuote({
      channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
      decision: createDecision(),
      record: createRecord(),
      settings: createSettings(),
      tenantContext: dedicatedTenantContext,
    });

    const quoteSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === quoteDocRef,
    );
    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(quoteSetCall?.[1]).not.toHaveProperty("tenantId");
    expect(counterSetCall?.[1]).not.toHaveProperty("tenantId");
  });

  it("rejects SaaS quote creation when tenant id is missing", async () => {
    const { db, transaction } = createQuoteCreationDb({
      counter: { nextNumber: 10 },
    });
    mockGetAdminDb.mockReturnValue(db);

    await expect(
      createInboundQuote({
        channel: { currency: CurrencyEnum.PLN, id: "channel-1" },
        decision: createDecision(),
        record: createRecord(),
        settings: createSettings(),
        tenantContext: missingSaasTenantContext,
      }),
    ).rejects.toThrow("Missing tenantId for inbound quote counter");
    expect(transaction.set).not.toHaveBeenCalled();
  });
});
