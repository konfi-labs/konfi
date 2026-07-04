import { ActivityStatus, OrderStatus } from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreOrder } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  getLastSuccessfulRatingRequestRunAt,
  listPendingRatingRequestOrders,
  markRatingRequestRunSuccessful,
  processRatingRequestOrder,
  runAutomatedRatingRequests,
} from "./rating-request-service";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockCreateRating: vi.fn(),
  mockFieldValueDelete: vi.fn(),
  mockGetFirebaseAdminApp: vi.fn(),
  mockGetFirestore: vi.fn(),
  mockOrderRefUpdate: vi.fn(),
  mockSendEmail: vi.fn(),
  mockTimestampFromDate: vi.fn(),
  mockTimestampNow: vi.fn(),
  mockTransactionGet: vi.fn(),
  mockTransactionUpdate: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mockSendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetFirestore,
  getFirebaseAdminApp: mocks.mockGetFirebaseAdminApp,
}));

vi.mock("@konfi/emails", () => ({
  RatingRequest: () => null,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mocks.mockGetFirestore,
  Timestamp: {
    fromDate: mocks.mockTimestampFromDate,
    now: mocks.mockTimestampNow,
  },
  FieldValue: {
    delete: mocks.mockFieldValueDelete,
  },
}));

function createOrder(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    channelId: "channel-1",
    contact: {
      email: "customer@example.com",
      name: "Customer",
    },
    id: "order-1",
    isFromStore: true,
    items: [
      {
        product: {
          id: "product-1",
        },
      },
    ],
    status: OrderStatus.FULFILLED,
    userId: "customer-uid",
    ...overrides,
  } as StoreOrder;
}

const tenantAContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} satisfies TenantContext;

describe("processRatingRequestOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockGetFirestore.mockReturnValue({
      doc: () => ({
        create: mocks.mockCreateRating,
        id: "rating-doc-id",
      }),
      runTransaction: async (
        callback: (transaction: {
          get: typeof mocks.mockTransactionGet;
          update: typeof mocks.mockTransactionUpdate;
        }) => Promise<StoreOrder | undefined>,
      ) =>
        callback({
          get: mocks.mockTransactionGet,
          update: mocks.mockTransactionUpdate,
        }),
    });
    mocks.mockCreateRating.mockResolvedValue(undefined);
    mocks.mockFieldValueDelete.mockReturnValue("DELETE_FIELD");
    mocks.mockOrderRefUpdate.mockResolvedValue(undefined);
    mocks.mockSendEmail.mockResolvedValue(undefined);
    mocks.mockTimestampFromDate.mockImplementation((date: Date) => ({
      toDate: () => date,
    }));
    mocks.mockTimestampNow.mockReturnValue({
      toDate: () => new Date("2026-05-02T11:05:00.000Z"),
    });
  });

  it("reserves the order, creates a rating, sends one email, and marks completion", async () => {
    const order = createOrder();
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => order,
    });

    const result = await processRatingRequestOrder({
      order: {
        data: order,
        ref: {
          id: "order-1",
          update: mocks.mockOrderRefUpdate,
        } as unknown as FirebaseFirestore.DocumentReference,
      },
    });

    expect(result).toBe("sent");
    expect(mocks.mockTransactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-1" }),
      {
        ratingRequestReservationExpiresAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
        ratingRequestReservationId: expect.any(String),
        ratingRequestReservedAt: expect.objectContaining({
          toDate: expect.any(Function),
        }),
      },
    );
    const reservationUpdate = mocks.mockTransactionUpdate.mock
      .calls[0]?.[1] as {
      ratingRequestReservationExpiresAt: { toDate(): Date };
    };
    expect(
      reservationUpdate.ratingRequestReservationExpiresAt.toDate(),
    ).toBeInstanceOf(Date);
    expect(mocks.mockCreateRating).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockOrderRefUpdate).toHaveBeenCalledWith({
      ratingRequestReservationExpiresAt: "DELETE_FIELD",
      ratingRequestReservationId: "DELETE_FIELD",
      ratingRequestReservedAt: "DELETE_FIELD",
      ratingsAdded: true,
    });
  });

  it("skips duplicate events when the order is already reserved", async () => {
    const order = createOrder({ ratingsAdded: true });
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => order,
    });

    const result = await processRatingRequestOrder({
      order: {
        data: order,
        ref: {
          id: "order-1",
          update: mocks.mockOrderRefUpdate,
        } as unknown as FirebaseFirestore.DocumentReference,
      },
    });

    expect(result).toBe("skipped");
    expect(mocks.mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mocks.mockOrderRefUpdate).not.toHaveBeenCalled();
    expect(mocks.mockCreateRating).not.toHaveBeenCalled();
    expect(mocks.mockSendEmail).not.toHaveBeenCalled();
  });

  it("still sends email when every pending rating already exists from an earlier attempt", async () => {
    const order = createOrder();
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => order,
    });
    mocks.mockCreateRating.mockRejectedValue({ code: "already-exists" });

    const result = await processRatingRequestOrder({
      order: {
        data: order,
        ref: {
          id: "order-1",
          update: mocks.mockOrderRefUpdate,
        } as unknown as FirebaseFirestore.DocumentReference,
      },
    });

    expect(result).toBe("sent");
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockOrderRefUpdate).toHaveBeenCalledWith({
      ratingRequestReservationExpiresAt: "DELETE_FIELD",
      ratingRequestReservationId: "DELETE_FIELD",
      ratingRequestReservedAt: "DELETE_FIELD",
      ratingsAdded: true,
    });
  });

  it("does not reserve while a rating request lease is active", async () => {
    const order = createOrder({
      ratingRequestReservationExpiresAt: {
        toDate: () => new Date("2999-01-01T00:00:00.000Z"),
      },
    } as Partial<StoreOrder>);
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => order,
    });

    const result = await processRatingRequestOrder({
      order: {
        data: order,
        ref: {
          id: "order-1",
          update: mocks.mockOrderRefUpdate,
        } as unknown as FirebaseFirestore.DocumentReference,
      },
    });

    expect(result).toBe("skipped");
    expect(mocks.mockTransactionUpdate).not.toHaveBeenCalled();
    expect(mocks.mockOrderRefUpdate).not.toHaveBeenCalled();
    expect(mocks.mockCreateRating).not.toHaveBeenCalled();
    expect(mocks.mockSendEmail).not.toHaveBeenCalled();
  });

  it("releases the rating request reservation when sending fails", async () => {
    const order = createOrder();
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => order,
    });
    mocks.mockSendEmail.mockRejectedValue(new Error("send failed"));

    await expect(
      processRatingRequestOrder({
        order: {
          data: order,
          ref: {
            id: "order-1",
            update: mocks.mockOrderRefUpdate,
          } as unknown as FirebaseFirestore.DocumentReference,
        },
      }),
    ).rejects.toThrow("send failed");

    expect(mocks.mockTransactionUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.mockOrderRefUpdate).toHaveBeenCalledWith({
      ratingRequestReservationExpiresAt: "DELETE_FIELD",
      ratingRequestReservationId: "DELETE_FIELD",
      ratingRequestReservedAt: "DELETE_FIELD",
    });
  });
});

describe("listPendingRatingRequestOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTimestampFromDate.mockImplementation((date: Date) => ({
      toDate: () => date,
    }));
  });

  it("queries only fulfilled store orders and filters by the fulfillment window", async () => {
    const fulfilledAfter = new Date("2026-05-01T11:00:00.000Z");
    const fulfilledBefore = new Date("2026-05-02T11:00:00.000Z");
    const eligibleOrder = createOrder({
      activities: [
        {
          timestamp: {
            toDate: () => new Date("2026-05-02T10:30:00.000Z"),
          },
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.FULFILLED,
        },
      ],
    });
    const oldFulfilledOrder = createOrder({
      activities: [
        {
          timestamp: {
            toDate: () => new Date("2026-05-01T10:30:00.000Z"),
          },
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.FULFILLED,
        },
      ],
      id: "order-2",
    });
    const adminOrder = createOrder({
      activities: [
        {
          timestamp: {
            toDate: () => new Date("2026-05-02T10:30:00.000Z"),
          },
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.FULFILLED,
        },
      ],
      id: "order-3",
      isFromStore: false,
    });
    const query = {
      get: vi.fn().mockResolvedValue({
        docs: [
          {
            data: () => eligibleOrder,
            ref: { id: "order-1" },
          },
          {
            data: () => oldFulfilledOrder,
            ref: { id: "order-2" },
          },
          {
            data: () => adminOrder,
            ref: { id: "order-3" },
          },
        ],
      }),
      limit: vi.fn(),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collectionGroup: vi.fn().mockReturnValue(query),
    } as unknown as FirebaseFirestore.Firestore;

    const orders = await listPendingRatingRequestOrders({
      fulfilledAfter,
      fulfilledBefore,
      firestore,
    });

    expect(firestore.collectionGroup).toHaveBeenCalledWith("orders");
    expect(query.where).toHaveBeenCalledWith(
      "status",
      "==",
      OrderStatus.FULFILLED,
    );
    expect(query.where).toHaveBeenCalledWith("isFromStore", "==", true);
    expect(query.where).toHaveBeenCalledTimes(2);
    expect(query.orderBy).not.toHaveBeenCalled();
    expect(orders).toEqual([
      {
        data: eligibleOrder,
        ref: { id: "order-1" },
      },
    ]);
  });

  it("scopes SaaS rating request order scans by tenant", async () => {
    const query = {
      get: vi.fn().mockResolvedValue({ docs: [] }),
      limit: vi.fn(),
      where: vi.fn(),
    };
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collectionGroup: vi.fn().mockReturnValue(query),
    } as unknown as FirebaseFirestore.Firestore;

    await listPendingRatingRequestOrders({
      fulfilledAfter: new Date("2026-05-01T11:00:00.000Z"),
      fulfilledBefore: new Date("2026-05-02T11:00:00.000Z"),
      firestore,
      tenantContext: tenantAContext,
    });

    expect(query.where).toHaveBeenCalledWith("tenantId", "==", "tenant-a");
  });
});

describe("runAutomatedRatingRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    mocks.mockCreateRating.mockResolvedValue(undefined);
    mocks.mockFieldValueDelete.mockReturnValue("DELETE_FIELD");
    mocks.mockGetFirebaseAdminApp.mockReturnValue({});
    mocks.mockGetFirestore.mockReturnValue({
      doc: () => ({
        create: mocks.mockCreateRating,
        id: "rating-doc-id",
      }),
      runTransaction: async (
        callback: (transaction: {
          get: typeof mocks.mockTransactionGet;
          update: typeof mocks.mockTransactionUpdate;
        }) => Promise<StoreOrder | undefined>,
      ) =>
        callback({
          get: mocks.mockTransactionGet,
          update: mocks.mockTransactionUpdate,
        }),
    });
    mocks.mockOrderRefUpdate.mockResolvedValue(undefined);
    mocks.mockSendEmail.mockResolvedValue(undefined);
    mocks.mockTimestampFromDate.mockImplementation((date: Date) => ({
      toDate: () => date,
    }));
  });

  it("reports fetched documents separately from eligible orders", async () => {
    const fulfilledAfter = new Date("2026-05-01T11:00:00.000Z");
    const fulfilledBefore = new Date("2026-05-02T11:00:00.000Z");
    const eligibleOrder = createOrder({
      activities: [
        {
          timestamp: {
            toDate: () => new Date("2026-05-02T10:30:00.000Z"),
          },
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.FULFILLED,
        },
      ],
    });
    const oldFulfilledOrder = createOrder({
      activities: [
        {
          timestamp: {
            toDate: () => new Date("2026-05-01T10:30:00.000Z"),
          },
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: OrderStatus.FULFILLED,
        },
      ],
      id: "order-2",
    });
    const query = {
      get: vi.fn().mockResolvedValue({
        docs: [
          {
            data: () => eligibleOrder,
            ref: {
              id: "order-1",
              update: mocks.mockOrderRefUpdate,
            },
          },
          {
            data: () => oldFulfilledOrder,
            ref: {
              id: "order-2",
              update: vi.fn(),
            },
          },
        ],
      }),
      limit: vi.fn(),
      where: vi.fn(),
    };
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const firestore = {
      collectionGroup: vi.fn().mockReturnValue(query),
    } as unknown as FirebaseFirestore.Firestore;
    mocks.mockTransactionGet.mockResolvedValue({
      data: () => eligibleOrder,
    });

    const result = await runAutomatedRatingRequests({
      fulfilledAfter,
      fulfilledBefore,
      firestore,
    });

    expect(result).toEqual({
      eligible: 1,
      scanned: 2,
      sent: 1,
      skipped: 0,
    });
  });
});

describe("rating request cron state", () => {
  it("stores SaaS cron cursor state per tenant", async () => {
    const doc = vi.fn(() => ({
      get: vi.fn(async () => ({
        data: () => undefined,
      })),
      set: vi.fn(),
    }));
    const collection = vi.fn(() => ({ doc }));
    const firestore = {
      collection,
    } as unknown as FirebaseFirestore.Firestore;

    await getLastSuccessfulRatingRequestRunAt({
      firestore,
      tenantContext: tenantAContext,
    });
    await markRatingRequestRunSuccessful({
      completedAt: new Date("2026-05-02T11:00:00.000Z"),
      firestore,
      tenantContext: tenantAContext,
    });

    expect(doc).toHaveBeenCalledWith("rating-requests_tenant-a");
    expect(doc).toHaveBeenCalledTimes(2);
  });
});
