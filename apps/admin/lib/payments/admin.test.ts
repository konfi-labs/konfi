import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentStatus, PaymentType, type Order } from "@konfi/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deleteMarker = Symbol("field-delete");

  class MockTimestamp {
    private static counter = 0;
    private readonly millis: number;

    constructor(millis: number) {
      this.millis = millis;
    }

    static now() {
      MockTimestamp.counter += 1;
      return new MockTimestamp(MockTimestamp.counter);
    }

    toDate() {
      return new Date(this.millis);
    }

    toMillis() {
      return this.millis;
    }
  }

  function mergeData(
    current: Record<string, unknown> | undefined,
    patch: Record<string, unknown>,
  ) {
    const next = { ...current };

    for (const [key, value] of Object.entries(patch)) {
      if (value === deleteMarker) {
        delete next[key];
        continue;
      }

      next[key] = value;
    }

    return next;
  }

  const state: {
    orderDocData?: Order;
    refundDocData?: Record<string, unknown>;
    channelDocs: {
      id: string;
      ref: {
        collection: (name: string) => {
          where: (
            field: string,
            operator: string,
            value: unknown,
          ) => {
            get: () => Promise<{
              docs: Array<{
                ref: { path: string };
                data: () => Order;
              }>;
              empty: boolean;
              size: number;
            }>;
          };
        };
      };
    }[];
    collectionGroupDocs: Array<{
      ref: { path: string };
      data: () => Order;
    }>;
    collectionGroupError?: unknown;
    paymentRefundDocs: Array<{
      data: () => Record<string, unknown>;
    }>;
  } = {
    channelDocs: [],
    collectionGroupDocs: [],
    collectionGroupError: undefined,
    paymentRefundDocs: [],
  };

  const mockOrderUpdate = vi.fn();
  const mockLedgerSet = vi.fn();
  const ledgerRef = {
    path: "channels/channel-1/orders/order-1/paymentLedgerEntries/ledger-1",
    set: mockLedgerSet,
  };
  const orderRef = {
    path: "channels/channel-1/orders/order-1",
    update: mockOrderUpdate,
  };

  const refundRef = {
    id: "refund-1",
    path: "paymentRefunds/refund-1",
    firestore: undefined as unknown,
  };

  const mockDb = {
    collectionGroup: vi.fn((name: string) => {
      if (name !== "orders") {
        throw new Error("Unexpected collection group");
      }

      return {
        where: vi.fn((_field: string, _operator: string, _value: unknown) => ({
          get: vi.fn(async () => {
            if (state.collectionGroupError) {
              throw state.collectionGroupError;
            }

            return {
              docs: state.collectionGroupDocs ?? [],
              empty: (state.collectionGroupDocs ?? []).length === 0,
              size: (state.collectionGroupDocs ?? []).length,
            };
          }),
        })),
      };
    }),
    collection: vi.fn((name: string) => {
      if (name === "channels") {
        return {
          get: vi.fn(async () => ({
            docs: state.channelDocs ?? [],
          })),
        };
      }

      if (name === "paymentRefunds") {
        return {
          doc: vi.fn(() => refundRef),
          where: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: state.paymentRefundDocs ?? [],
            })),
          })),
        };
      }

      return {
        doc: vi.fn(() => refundRef),
      };
    }),
    doc: vi.fn((path: string) =>
      path.includes("/paymentLedgerEntries/") ? ledgerRef : orderRef,
    ),
    runTransaction: vi.fn(
      async (
        handler: (transaction: {
          get: (ref: unknown) => Promise<{
            exists: boolean;
            data: () => unknown;
          }>;
          set: (
            ref: unknown,
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) => void;
        }) => Promise<unknown>,
      ) => {
        const transaction = {
          get: vi.fn(async (ref: unknown) => {
            if (ref === orderRef) {
              const orderDocData = state.orderDocData;
              return {
                exists: Boolean(orderDocData),
                data: () => orderDocData,
              };
            }

            if (ref === refundRef) {
              const refundDocData = state.refundDocData;
              return {
                exists: Boolean(refundDocData),
                data: () => refundDocData,
              };
            }

            throw new Error("Unexpected transaction reference");
          }),
          set: (
            ref: unknown,
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) => {
            if (ref !== refundRef) {
              throw new Error("Unexpected transaction set reference");
            }

            state.refundDocData = options?.merge
              ? mergeData(state.refundDocData, data)
              : { ...data };
          },
        };

        return await handler(transaction);
      },
    ),
  };

  refundRef.firestore = mockDb;

  return {
    deleteMarker,
    MockTimestamp,
    state,
    orderRef,
    refundRef,
    mockDb,
    mockGetFirebaseAdminApp: vi.fn(() => ({ name: "admin-app" })),
    mockGetFirestore: vi.fn(() => mockDb),
    mockRefundStripePayment: vi.fn(),
    mockRefundPrzelewy24Payment: vi.fn(),
    mockGetStripePaymentIntentById: vi.fn(),
    mockGetPrzelewy24TransactionBySessionId: vi.fn(),
    mockOrderUpdate,
    mockLedgerSet,
    mockGetTenantContextForRequest: vi.fn(async () => ({
      deploymentMode: "dedicated" as const,
      requireTenantId: false,
      tenantId: "default",
    })),
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
  getTenantContextForRequest: mocks.mockGetTenantContextForRequest,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => "__name__",
  },
  FieldValue: {
    delete: () => mocks.deleteMarker,
    arrayUnion: (...values: unknown[]) => values,
  },
  Timestamp: mocks.MockTimestamp,
  getFirestore: mocks.mockGetFirestore,
}));

vi.mock("@konfi/payments", () => ({
  createPaymentLedgerEntry: vi.fn((entry) => ({
    ...entry,
    active: true,
    idempotencyKey: entry.id,
  })),
  getProviderPaymentLedgerEntryId: vi.fn(
    ({
      entryType,
      orderId,
      providerEventId,
      providerReference,
    }: {
      entryType: string;
      orderId: string;
      providerEventId?: string;
      providerReference?: string;
    }) =>
      [
        orderId,
        entryType,
        providerEventId ?? providerReference ?? "provider",
      ].join("-"),
  ),
  getPrzelewy24TransactionBySessionId:
    mocks.mockGetPrzelewy24TransactionBySessionId,
  getStripePaymentIntentById: mocks.mockGetStripePaymentIntentById,
  refundPrzelewy24Payment: mocks.mockRefundPrzelewy24Payment,
  refundStripePayment: mocks.mockRefundStripePayment,
  writeOrderPaymentLedgerEntry: vi.fn(
    async ({
      firestore,
      orderPath,
      entry,
    }: {
      firestore: { doc: (path: string) => { set: ReturnType<typeof vi.fn> } };
      orderPath: string;
      entry: { id: string };
    }) => {
      await firestore
        .doc(`${orderPath}/paymentLedgerEntries/${entry.id}`)
        .set(entry, { merge: true });
    },
  ),
}));

let requestAdminPaymentRefund: (typeof import("./admin"))["requestAdminPaymentRefund"];
let listAdminPayments: (typeof import("./admin"))["listAdminPayments"];

describe("requestAdminPaymentRefund", () => {
  beforeAll(async () => {
    ({ requestAdminPaymentRefund, listAdminPayments } =
      await import("./admin"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");

    mocks.state.orderDocData = {
      checkoutSession: {
        paymentIntent: "pi_123",
      },
      currency: "PLN",
      isTest: false,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentType: PaymentType.STRIPE,
      totalPrice: 10_000,
    } as Order;
    mocks.state.channelDocs = [];
    mocks.state.paymentRefundDocs = [];

    const existingTimestamp = mocks.MockTimestamp.now();
    mocks.state.refundDocData = {
      attempts: 1,
      createdAt: existingTimestamp,
      refundedAmount: 2_500,
      refundHistory: [
        {
          amount: 2_500,
          createdAt: existingTimestamp,
          reason: "Initial partial refund",
          requestId: "refund-1-1",
          requestedBy: "admin-1",
          status: "COMPLETED",
          updatedAt: existingTimestamp,
        },
      ],
    };

    mocks.mockRefundStripePayment.mockResolvedValue({
      id: "re_123",
      payment_intent: "pi_123",
      status: "succeeded",
    });
  });

  it("updates the refund audit in a second transaction after a successful refund", async () => {
    const result = await requestAdminPaymentRefund({
      provider: "stripe",
      orderPath: "channels/channel-1/orders/order-1",
      reason: "Customer requested a partial refund",
      requestedBy: "admin-1",
      refundAmount: 2_500,
    });

    expect(result).toEqual({
      message: "Refund completed successfully",
      refundStatus: "COMPLETED",
    });
    expect(mocks.mockDb.runTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.mockRefundStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2_500,
        idempotencyKey: "refund-1-2",
        paymentIntentId: "pi_123",
      }),
    );
    expect(mocks.mockOrderUpdate).not.toHaveBeenCalled();
    expect(mocks.mockLedgerSet).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2_500,
        entryType: "REFUND",
        orderId: "order-1",
        orderPath: "channels/channel-1/orders/order-1",
        providerEventId: "re_123",
        providerKind: "stripe",
        providerReference: "pi_123",
        status: "SUCCEEDED",
      }),
      { merge: true },
    );
    expect(mocks.state.refundDocData).toEqual(
      expect.objectContaining({
        providerRefundId: "re_123",
        providerReference: "pi_123",
        refundedAmount: 5_000,
        status: "COMPLETED",
      }),
    );
    expect(mocks.state.refundDocData?.refundHistory).toEqual([
      expect.objectContaining({
        requestId: "refund-1-1",
        status: "COMPLETED",
      }),
      expect.objectContaining({
        amount: 2_500,
        providerRefundId: "re_123",
        providerReference: "pi_123",
        reason: "Customer requested a partial refund",
        requestId: "refund-1-2",
        requestedBy: "admin-1",
        status: "COMPLETED",
      }),
    ]);
  });

  it("can reuse an existing refund ledger entry id", async () => {
    await requestAdminPaymentRefund({
      ledgerEntryId: "rma-request-ledger-entry",
      provider: "stripe",
      orderPath: "channels/channel-1/orders/order-1",
      reason: "RMA provider refund dispatch",
      requestedBy: "admin-1",
      refundAmount: 1_000,
    });

    expect(mocks.mockDb.doc).toHaveBeenCalledWith(
      "channels/channel-1/orders/order-1/paymentLedgerEntries/rma-request-ledger-entry",
    );
    expect(mocks.mockLedgerSet).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1_000,
        id: "rma-request-ledger-entry",
        entryType: "REFUND",
        providerEventId: "re_123",
        providerKind: "stripe",
        status: "SUCCEEDED",
      }),
      { merge: true },
    );
  });
});

describe("listAdminPayments", () => {
  beforeAll(async () => {
    ({ requestAdminPaymentRefund, listAdminPayments } =
      await import("./admin"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.state.channelDocs = [];
    mocks.state.collectionGroupDocs = [];
    mocks.state.collectionGroupError = undefined;
    mocks.state.paymentRefundDocs = [];
  });

  it("loads provider payments through a collection group query", async () => {
    const createdAt = new mocks.MockTimestamp(1_000);
    const orderSnapshot = {
      ref: {
        path: "channels/channel-1/orders/order-1",
      },
      data: () =>
        ({
          contact: {
            email: "customer@example.com",
          },
          createdAt,
          currency: "PLN",
          number: 101,
          path: "channels/channel-1/orders/order-1",
          paymentStatus: PaymentStatus.COMPLETED,
          paymentType: PaymentType.STRIPE,
          totalPrice: 12_345,
        }) as Order,
    };

    mocks.state.collectionGroupDocs = [orderSnapshot];

    const result = await listAdminPayments({
      provider: "stripe",
    });

    expect(mocks.mockDb.collectionGroup).toHaveBeenCalledWith("orders");
    const collectionGroupResult = mocks.mockDb.collectionGroup.mock.results[0]
      ?.value as { where: ReturnType<typeof vi.fn> };
    expect(collectionGroupResult.where).toHaveBeenCalledWith(
      "paymentType",
      "==",
      PaymentType.STRIPE,
    );
    expect(result.totalCount).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: "channel-1",
        contactEmail: "customer@example.com",
        orderId: "order-1",
        orderPath: "channels/channel-1/orders/order-1",
        paymentStatus: PaymentStatus.COMPLETED,
        totalAmount: 12_345,
      }),
    ]);
  });

  it("falls back to per-channel queries when collection group requires a missing index", async () => {
    const createdAt = new mocks.MockTimestamp(1_000);
    const orderSnapshot = {
      ref: {
        path: "channels/channel-1/orders/order-1",
      },
      data: () =>
        ({
          contact: {
            email: "customer@example.com",
          },
          createdAt,
          currency: "PLN",
          number: 101,
          path: "channels/channel-1/orders/order-1",
          paymentStatus: PaymentStatus.COMPLETED,
          paymentType: PaymentType.PRZELEWY24,
          totalPrice: 12_345,
        }) as Order,
    };

    const getOrders = vi.fn(async () => ({
      docs: [orderSnapshot],
      empty: false,
      size: 1,
    }));
    const whereOrders = vi.fn(
      (_field: string, _operator: string, _value: unknown) => ({
        get: getOrders,
      }),
    );

    mocks.state.collectionGroupError = { code: 9 };
    mocks.state.channelDocs = [
      {
        id: "channel-1",
        ref: {
          collection: (name: string) => {
            if (name !== "orders") {
              throw new Error("Unexpected channel subcollection");
            }

            return {
              where: whereOrders,
            };
          },
        },
      },
    ];
    mocks.mockGetPrzelewy24TransactionBySessionId.mockResolvedValue({
      orderId: "provider-order-1",
      clientEmail: "customer@example.com",
      amount: 12_345,
      currency: "PLN",
      dateOfTransaction: "2026-04-19T14:00:00.000Z",
    });

    const result = await listAdminPayments({
      provider: "przelewy24",
    });

    expect(mocks.mockDb.collectionGroup).toHaveBeenCalledWith("orders");
    expect(mocks.mockDb.collection).toHaveBeenCalledWith("channels");
    expect(whereOrders).toHaveBeenCalledWith(
      "paymentType",
      "==",
      PaymentType.PRZELEWY24,
    );
    expect(result.totalCount).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: "channel-1",
        contactEmail: "customer@example.com",
        orderId: "order-1",
        orderPath: "channels/channel-1/orders/order-1",
        paymentStatus: PaymentStatus.COMPLETED,
        totalAmount: 12_345,
      }),
    ]);
  });
});
