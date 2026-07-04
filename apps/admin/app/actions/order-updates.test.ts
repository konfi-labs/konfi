import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivityStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  ShippingOptions,
} from "@konfi/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  MockAdminAuthError: class MockAdminAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminAuthError";
      this.statusCode = statusCode;
    }
  },
  mockArrayUnion: vi.fn((...values: unknown[]) => ({
    operation: "arrayUnion",
    values,
  })),
  mockGetAdminDb: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockGetStripePaymentCredentials: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockRequireAdminAuth: vi.fn(),
  mockRequireAdminOrCourierAuth: vi.fn(),
  mockRequireTenantAdminChannelAccess: vi.fn(),
  mockSendEmail: vi.fn(),
  mockTimestampNow: vi.fn(),
}));

vi.mock("./auth-utils", () => ({
  AdminAuthError: mocks.MockAdminAuthError,
  getTenantAdminScopeTenantId: (context: { tenantId?: string }) =>
    context.tenantId,
  requireAdminAuth: mocks.mockRequireAdminAuth,
  requireAdminOrCourierAuth: mocks.mockRequireAdminOrCourierAuth,
  requireTenantAdminChannelAccess: mocks.mockRequireTenantAdminChannelAccess,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mockSendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
  getTenantContextForRequest: mocks.mockGetTenantContextForRequest,
}));

vi.mock("@/lib/payments/tenant-payment-config", () => ({
  getStripePaymentCredentials: mocks.mockGetStripePaymentCredentials,
}));

vi.mock("@konfi/payments", () => ({
  createCheckoutSession: mocks.mockCreateCheckoutSession,
}));

vi.mock("@konfi/emails", () => ({
  StatusChange: () => null,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: mocks.mockArrayUnion,
  },
  GeoPoint: class {
    constructor(
      public latitude: number,
      public longitude: number,
    ) {}
  },
  Timestamp: {
    now: mocks.mockTimestampNow,
  },
}));

let createAdminStripePaymentLink: (typeof import("./order-updates"))["createAdminStripePaymentLink"];
let markOrderArrivedAtPickup: (typeof import("./order-updates"))["markOrderArrivedAtPickup"];
let recordOrderScan: (typeof import("./order-updates"))["recordOrderScan"];
let updateOrderPaymentDocument: (typeof import("./order-updates"))["updateOrderPaymentDocument"];
let updateOrderStatusField: (typeof import("./order-updates"))["updateOrderStatusField"];

const tenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} as const;

function timestamp(millis: number) {
  return {
    toMillis: () => millis,
  };
}

function createOrder() {
  return {
    contact: {
      email: "customer@example.com",
    },
    customer: "Example Customer",
    designatedPickupAreaId: "pickup-area-1",
    id: "order-1",
    isFromStore: true,
    isTest: false,
    items: [
      {
        description: "A5",
        product: {
          name: "Flyer",
        },
        quantity: 1,
        totalPrice: 1000,
        warehouseId: "source-warehouse",
      },
    ],
    number: 123,
    path: "channels/channel-1/orders/order-1",
    paymentStatus: PaymentStatus.NEW,
    paymentType: PaymentType.BANK_TRANSFER,
    sendStatusChangeEmail: false,
    shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    status: OrderStatus.READY,
    tenantId: "tenant-a",
    totalPrice: 1000,
    tracking: {
      link: "",
      number: "",
      shippingOption: ShippingOptions.PERSONAL_COLLECTION,
    },
  };
}

function createFirestore(orderData = createOrder()) {
  const orderUpdate = vi.fn();
  const transactionUpdate = vi.fn();
  const transactionSet = vi.fn();
  const scanRef = {
    id: "scan-1",
  };
  const orderRef = {
    path: "channels/channel-1/orders/order-1",
    collection: (name: string) => {
      if (name !== "scanEvents") {
        throw new Error(`Unexpected subcollection: ${name}`);
      }

      return {
        doc: () => scanRef,
      };
    },
    get: vi.fn(async () => ({
      data: () => orderData,
      exists: true,
    })),
    update: orderUpdate,
  };
  const pickupAreaRef = {
    get: vi.fn(async () => ({
      data: () => ({
        tenantId: "tenant-a",
        warehouseId: "pickup-warehouse",
      }),
      exists: true,
    })),
  };
  const channelRef = {
    get: vi.fn(async () => ({
      data: () => ({
        tenantId: "tenant-a",
      }),
      exists: true,
    })),
  };
  const firestore = {
    collection: (path: string) => {
      if (path !== "channels") {
        throw new Error(`Unexpected collection path: ${path}`);
      }

      return {
        doc: () => channelRef,
      };
    },
    doc: (path: string) => {
      if (path === "channels/channel-1/orders/order-1") {
        return orderRef;
      }

      if (path === "designatedPickupAreas/pickup-area-1") {
        return pickupAreaRef;
      }

      throw new Error(`Unexpected doc path: ${path}`);
    },
    runTransaction: async (
      callback: (transaction: {
        get: typeof orderRef.get;
        set: typeof transactionSet;
        update: typeof transactionUpdate;
      }) => Promise<void>,
    ) =>
      callback({
        get: orderRef.get,
        set: transactionSet,
        update: transactionUpdate,
      }),
  };

  return {
    firestore,
    orderRef,
    orderUpdate,
    scanRef,
    transactionSet,
    transactionUpdate,
  };
}

describe("order update email side effects", () => {
  beforeAll(async () => {
    ({
      createAdminStripePaymentLink,
      markOrderArrivedAtPickup,
      recordOrderScan,
      updateOrderPaymentDocument,
      updateOrderStatusField,
    } = await import("./order-updates"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetTenantContextForRequest.mockResolvedValue(tenantContext);
    mocks.mockRequireAdminAuth.mockResolvedValue(undefined);
    mocks.mockRequireAdminOrCourierAuth.mockResolvedValue({
      admin: true,
      uid: "staff-uid",
    });
    mocks.mockRequireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    mocks.mockTimestampNow.mockReturnValue(timestamp(1000));
    mocks.mockSendEmail.mockResolvedValue(undefined);
    mocks.mockGetStripePaymentCredentials.mockResolvedValue({
      secretKey: "sk_test",
      webhookSecret: "whsec_test",
    });
    mocks.mockCreateCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.test/session",
      paymentIntent: "pi_test_123",
    });
  });

  it("creates and stores a Stripe payment link for an unpaid admin order", async () => {
    const fixture = createFirestore();
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    const result = await createAdminStripePaymentLink({
      channelId: "channel-1",
      orderId: "order-1",
      updatedBy: {
        id: "admin-1",
        name: "Admin User",
      },
    });

    expect(result).toEqual({
      checkoutSession: {
        id: "cs_test_123",
        url: "https://checkout.stripe.test/session",
        paymentIntent: "pi_test_123",
      },
      paymentStatus: PaymentStatus.NEW,
      paymentType: PaymentType.STRIPE,
    });
    expect(mocks.mockGetStripePaymentCredentials).toHaveBeenCalledWith(
      tenantContext,
    );
    expect(mocks.mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "order-1",
        path: "channels/channel-1/orders/order-1",
        paymentType: PaymentType.STRIPE,
      }),
      {
        stripeCredentials: {
          secretKey: "sk_test",
          webhookSecret: "whsec_test",
        },
      },
    );
    expect(fixture.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutSession: {
          id: "cs_test_123",
          url: "https://checkout.stripe.test/session",
          paymentIntent: "pi_test_123",
        },
        paymentStatus: PaymentStatus.NEW,
        paymentType: PaymentType.STRIPE,
        updatedBy: {
          id: "admin-1",
          name: "Admin User",
        },
      }),
    );
  });

  it("does not create a Stripe payment link for a paid order", async () => {
    const fixture = createFirestore({
      ...createOrder(),
      paymentStatus: PaymentStatus.COMPLETED,
    });
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    await expect(
      createAdminStripePaymentLink({
        channelId: "channel-1",
        orderId: "order-1",
      }),
    ).rejects.toThrow("Paid orders cannot receive a new Stripe payment link");

    expect(mocks.mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.orderUpdate).not.toHaveBeenCalled();
  });

  it("does not fail markOrderArrivedAtPickup when pickup-ready email fails", async () => {
    const fixture = createFirestore();
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);
    mocks.mockSendEmail.mockRejectedValue(
      new Error("Resend is not configured"),
    );

    const result = await markOrderArrivedAtPickup("channel-1", "order-1");

    expect(result).toMatchObject({
      deliveredAtMillis: 1000,
      emailError: "Resend is not configured",
      emailSent: false,
    });
    expect(fixture.orderUpdate).toHaveBeenCalledWith({
      tracking: expect.objectContaining({
        deliveredAt: expect.objectContaining({
          toMillis: expect.any(Function),
        }),
      }),
    });
  });

  it("does not fail recordOrderScan when pickup-ready email fails", async () => {
    const fixture = createFirestore();
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);
    mocks.mockSendEmail.mockRejectedValue(
      new Error("Resend is not configured"),
    );

    await expect(
      recordOrderScan({
        channelId: "channel-1",
        orderId: "order-1",
        raw: "scan-payload",
        stage: "DELIVERY",
      }),
    ).resolves.toEqual({ ok: true, scanId: "scan-1" });

    expect(fixture.transactionSet).toHaveBeenCalledWith(
      fixture.scanRef,
      expect.objectContaining({
        raw: "scan-payload",
        tenantId: "tenant-a",
      }),
    );
    expect(fixture.transactionUpdate).toHaveBeenCalled();
  });

  it("returns a typed failure for expected recordOrderScan auth denials", async () => {
    mocks.mockRequireAdminOrCourierAuth.mockRejectedValue(
      new mocks.MockAdminAuthError("Unauthorized: Admin access required", 401),
    );

    await expect(
      recordOrderScan({
        channelId: "channel-1",
        orderId: "order-1",
        raw: "scan-payload",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Unauthorized: Admin access required",
        statusCode: 401,
      },
    });
  });

  it("still throws unexpected recordOrderScan auth defects", async () => {
    mocks.mockRequireAdminOrCourierAuth.mockRejectedValue(
      new mocks.MockAdminAuthError("Unexpected auth defect", 500),
    );

    await expect(
      recordOrderScan({
        channelId: "channel-1",
        orderId: "order-1",
        raw: "scan-payload",
      }),
    ).rejects.toThrow("Unexpected auth defect");
  });

  it("records EMAIL_SENT activity when pickup-ready email succeeds", async () => {
    const fixture = createFirestore();
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    const result = await markOrderArrivedAtPickup("channel-1", "order-1");

    expect(result).toMatchObject({
      deliveredAtMillis: 1000,
      emailSent: true,
    });
    expect(fixture.orderUpdate).toHaveBeenCalledTimes(2);
    expect(fixture.orderUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        activities: expect.objectContaining({
          operation: "arrayUnion",
          values: [
            expect.objectContaining({
              type: ActivityStatus.EMAIL_SENT,
              value: ActivityStatus.EMAIL_SENT,
            }),
          ],
        }),
      }),
    );
  });

  it("updates payment status and activity atomically", async () => {
    const fixture = createFirestore({
      ...createOrder(),
      paymentStatus: PaymentStatus.NEW,
    });
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    await updateOrderStatusField({
      channelId: "channel-1",
      field: "paymentStatus",
      orderId: "order-1",
      source: "test",
      value: PaymentStatus.COMPLETED,
    });

    expect(fixture.transactionUpdate).toHaveBeenCalledWith(
      fixture.orderRef,
      expect.objectContaining({
        activities: expect.objectContaining({
          operation: "arrayUnion",
          values: [
            expect.objectContaining({
              metadata: expect.objectContaining({
                after: PaymentStatus.COMPLETED,
                before: PaymentStatus.NEW,
                source: "test",
              }),
              type: ActivityStatus.PAYMENT_STATUS_UPDATE,
              value: PaymentStatus.COMPLETED,
            }),
          ],
        }),
        paymentStatus: PaymentStatus.COMPLETED,
      }),
    );
  });

  it("updates payment document and completed payment status atomically", async () => {
    const fixture = createFirestore({
      ...createOrder(),
      paymentStatus: PaymentStatus.NEW,
    });
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    const result = await updateOrderPaymentDocument({
      channelId: "channel-1",
      orderId: "order-1",
      paymentDocumentId: "Bez",
      proformaDocumentId: "",
      source: "test-payment-document",
    });

    expect(result).toEqual({
      paymentDocumentId: "Bez",
      paymentStatus: PaymentStatus.COMPLETED,
      proformaDocumentId: "",
    });
    expect(fixture.transactionUpdate).toHaveBeenCalledWith(
      fixture.orderRef,
      expect.objectContaining({
        activities: expect.objectContaining({
          operation: "arrayUnion",
          values: [
            expect.objectContaining({
              metadata: expect.objectContaining({
                after: PaymentStatus.COMPLETED,
                before: PaymentStatus.NEW,
                source: "test-payment-document",
              }),
              type: ActivityStatus.PAYMENT_STATUS_UPDATE,
              value: PaymentStatus.COMPLETED,
            }),
          ],
        }),
        paymentDocumentId: "Bez",
        paymentStatus: PaymentStatus.COMPLETED,
        proformaDocumentId: "",
      }),
    );
  });

  it("preserves payment document fields when protected payment status downgrade is skipped", async () => {
    const fixture = createFirestore({
      ...createOrder(),
      paymentStatus: PaymentStatus.COMPLETED,
    });
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    const result = await updateOrderPaymentDocument({
      channelId: "channel-1",
      orderId: "order-1",
      paymentDocumentId: "",
      proformaDocumentId: "PRO/1/2026",
    });

    expect(result).toEqual({
      paymentDocumentId: "",
      paymentStatus: PaymentStatus.COMPLETED,
      proformaDocumentId: "PRO/1/2026",
    });
    expect(fixture.transactionUpdate).toHaveBeenCalledWith(fixture.orderRef, {
      paymentDocumentId: "",
      proformaDocumentId: "PRO/1/2026",
    });
  });

  it("blocks generic payment status downgrades for paid orders", async () => {
    const fixture = createFirestore({
      ...createOrder(),
      paymentStatus: PaymentStatus.COMPLETED,
    });
    mocks.mockGetAdminDb.mockReturnValue(fixture.firestore);

    await expect(
      updateOrderStatusField({
        channelId: "channel-1",
        field: "paymentStatus",
        orderId: "order-1",
        value: PaymentStatus.NEW,
      }),
    ).rejects.toThrow("Paid orders cannot be reset");

    expect(fixture.transactionUpdate).not.toHaveBeenCalled();
  });
});
