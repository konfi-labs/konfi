import { ActivityStatus, PaymentStatus, PaymentType } from "@konfi/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockGetAdminDb,
  mockCreateCheckoutSession,
  mockArrayUnion,
  mockDelete,
  mockTimestampNow,
} = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockArrayUnion: vi.fn((value: unknown) => ({
    type: "arrayUnion",
    value,
  })),
  mockDelete: vi.fn(() => ({ type: "delete" })),
  mockTimestampNow: vi.fn(() => ({ type: "timestamp-now" })),
}));

vi.mock("../firebase/serverApp", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("../payments/create-checkout-session", () => ({
  createCheckoutSession: mockCreateCheckoutSession,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: mockArrayUnion,
    delete: mockDelete,
  },
  Timestamp: {
    now: mockTimestampNow,
  },
}));

let changeStoreOrderPaymentMethod: (typeof import("./change-payment-method.server"))["changeStoreOrderPaymentMethod"];

function createOrder(overrides: Partial<import("@konfi/types").Order> = {}) {
  return {
    id: "order-1",
    name: "Order #1",
    number: 1,
    customer: {
      id: "customer-1",
      name: "Example Customer",
    },
    contact: {
      name: "Example Customer",
      email: "jan@example.com",
      phone: "123456789",
      active: true,
    },
    shipping: null,
    shippingOption: "DHL",
    shippingPrice: 1500,
    shippingPriceDiscount: null,
    invoice: false,
    billing: null,
    exactTime: false,
    deadlineString: "2026-04-30",
    deadline: { toDate: () => new Date("2026-04-30T00:00:00.000Z") },
    totalPrice: 10000,
    totalPriceDiscount: null,
    currency: "PLN",
    specialNotes: "",
    items: [
      {
        quantity: 1,
        totalPrice: 8500,
        description: "Test item",
        unit: "szt.",
        product: {
          id: "product-1",
          name: "Business cards",
          channelId: "channel-1",
          spec: {
            images: [],
          },
        },
      },
    ],
    fulfilledItems: [],
    inProgressItems: [],
    priorityItems: [],
    difficulty: 0,
    priority: 0,
    status: "NEW",
    paymentType: PaymentType.BANK_TRANSFER,
    paymentStatus: PaymentStatus.NEW,
    filesStatus: "PENDING",
    activities: [],
    messages: [],
    keywords: [],
    isFromStore: true,
    path: "channels/channel-1/orders/order-1",
    isTest: false,
    channelId: "channel-1",
    appliedPromotionCodes: [],
    carriedOutBy: [],
    createdBy: {
      id: "system",
      name: "System",
    },
    createdAt: { toDate: () => new Date("2026-04-23T00:00:00.000Z") },
    updatedBy: {
      id: "system",
      name: "System",
    },
    updatedAt: { toDate: () => new Date("2026-04-23T00:00:00.000Z") },
    active: true,
    ...overrides,
  } as import("@konfi/types").Order;
}

function createCustomer(
  overrides: Partial<import("@konfi/types").Customer> = {},
) {
  return {
    id: "customer-1",
    name: "Example Customer",
    addresses: [],
    allowedBankPayments: true,
    allowedOnPickupPayments: false,
    allowedDefferedPayments: false,
    createdBy: {
      id: "system",
      name: "System",
    },
    createdAt: { toDate: () => new Date("2026-04-23T00:00:00.000Z") },
    updatedBy: {
      id: "system",
      name: "System",
    },
    updatedAt: { toDate: () => new Date("2026-04-23T00:00:00.000Z") },
    keywords: [],
    specialNotes: "",
    active: true,
    ...overrides,
  } as import("@konfi/types").Customer;
}

function createAdminDb({
  buyingEnabled = true,
  order = createOrder(),
  customer = createCustomer(),
} = {}) {
  const orderUpdate = vi.fn();
  const orderRef = {
    get: vi.fn().mockResolvedValue({
      exists: true,
      data: () => order,
    }),
    update: orderUpdate,
  };

  const adminDb = {
    collection: vi.fn((path: string) => {
      throw new Error(`Unexpected collection path: ${path}`);
    }),
    doc: vi.fn((path: string) => {
      if (path === "channels/channel-1/settings/buying") {
        return {
          get: vi.fn().mockResolvedValue({
            data: () => ({ enabled: buyingEnabled }),
          }),
        };
      }

      if (path === "channels/channel-1/orders/order-1") {
        return orderRef;
      }

      if (path === "customers/customer-1") {
        return {
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => customer,
          }),
        };
      }

      throw new Error(`Unexpected document path: ${path}`);
    }),
  };

  return {
    adminDb,
    orderUpdate,
  };
}

const tenantContext = {
  deploymentMode: "dedicated" as const,
  requireTenantId: false,
  tenantId: "default",
};

describe("changeStoreOrderPaymentMethod", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "channel-1";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    mockCreateCheckoutSession.mockResolvedValue({
      id: "sess_123",
      url: "https://stripe.test/session",
      paymentIntent: "pi_123",
    });

    ({ changeStoreOrderPaymentMethod } =
      await import("./change-payment-method.server"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates the order and regenerates checkout sessions for online payments", async () => {
    const { adminDb, orderUpdate } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await changeStoreOrderPaymentMethod({
      orderId: "order-1",
      paymentType: PaymentType.STRIPE,
      authUid: "customer-1",
      actor: {
        id: "customer-1",
        name: "Example Customer",
      },
      isAdmin: false,
      tenantContext,
    });

    expect(result).toEqual({
      success: true,
      message: "PAYMENT_METHOD_CHANGED",
      checkoutSessionUrl: "https://stripe.test/session",
    });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "order-1",
        paymentType: PaymentType.STRIPE,
      }),
      {
        adminBaseUrl: undefined,
        storeBaseUrl: undefined,
        stripeCredentials: {
          secretKey: "sk_test_123",
          webhookSecret: "whsec_123",
        },
      },
    );
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentType: PaymentType.STRIPE,
        paymentStatus: PaymentStatus.NEW,
        updatedBy: {
          id: "customer-1",
          name: "Example Customer",
        },
        checkoutSession: {
          id: "sess_123",
          url: "https://stripe.test/session",
          paymentIntent: "pi_123",
        },
      }),
    );
    expect(mockArrayUnion).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ActivityStatus.PAYMENT_METHOD_CHANGED,
        value: ActivityStatus.PAYMENT_METHOD_CHANGED,
        metadata: {
          before: PaymentType.BANK_TRANSFER,
          after: PaymentType.STRIPE,
        },
      }),
    );
  });

  it("clears checkout session data for offline payments", async () => {
    const { adminDb, orderUpdate } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await changeStoreOrderPaymentMethod({
      orderId: "order-1",
      paymentType: PaymentType.BANK_TRANSFER,
      authUid: "customer-1",
      actor: {
        id: "customer-1",
        name: "Example Customer",
      },
      isAdmin: false,
      tenantContext,
    });

    expect(result).toEqual({
      success: true,
      message: "PAYMENT_METHOD_CHANGED",
      checkoutSessionUrl: undefined,
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutSession: {
          type: "delete",
        },
      }),
    );
  });

  it("does not let admins reset completed payments by changing payment method", async () => {
    const { adminDb, orderUpdate } = createAdminDb({
      order: createOrder({
        paymentStatus: PaymentStatus.COMPLETED,
      }),
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await changeStoreOrderPaymentMethod({
      orderId: "order-1",
      paymentType: PaymentType.STRIPE,
      authUid: "admin-1",
      actor: {
        id: "admin-1",
        name: "Admin",
      },
      isAdmin: true,
      tenantContext,
    });

    expect(result).toEqual({
      success: false,
      message: "NOT_ELIGIBLE",
      error: "Payment method cannot be changed for this order.",
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects payment changes for orders owned by another customer", async () => {
    const { adminDb, orderUpdate } = createAdminDb({
      order: createOrder({
        customer: {
          id: "other-customer",
          name: "Other Customer",
        },
      }),
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await changeStoreOrderPaymentMethod({
      orderId: "order-1",
      paymentType: PaymentType.STRIPE,
      authUid: "customer-1",
      actor: {
        id: "customer-1",
        name: "Example Customer",
      },
      isAdmin: false,
      tenantContext,
    });

    expect(result).toEqual({
      success: false,
      message: "UNAUTHORIZED",
      error: "You are not authorized to change payment method for this order",
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
