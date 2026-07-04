import { PaymentType, ProofingOptions } from "@konfi/types";
import {
  normalizeCurrencySettings,
  convertCurrencyMinorAmount,
} from "@konfi/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `create-order.server.ts` starts with `import "server-only"`, which throws
// outside a server component; neutralize it the same way the sibling
// `change-payment-method.server.test.ts` does.
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Hoisted mocks. Everything that performs real I/O or heavyweight computation
// (pricing engine, AI classification, Firestore, payments, notifications,
// webhooks, quotas, risk analysis) is replaced so the test can pin the
// *control flow* of createStoreOrder deterministically.
// ---------------------------------------------------------------------------
const {
  mockGetAdminDb,
  mockAfter,
  mockCreateCheckoutSession,
  mockGetStripeCredentials,
  mockGetPrzelewy24Credentials,
  mockAssertModuleEnabled,
  mockAssertQuota,
  mockIsModuleEnabled,
  mockRecordQuotaUsage,
  mockStartRiskAnalysis,
  mockEmitWebhookEvent,
  mockDeleteOneTimePromotions,
  mockMoveCartFilesToOrder,
  mockSendNewOrderNotifications,
  mockClassifyPrintingMethods,
  mockResolveChannelProducts,
  mockGetEstimatedDelivery,
  mockGetOrderItemDeliveryTime,
  // @konfi/utils stubs whose return shape the module structurally consumes:
  mockGetAvailableShippingOptions,
  mockGetAvailablePaymentTypes,
  mockCalculateConfiguredProductPrice,
  mockArrayUnion,
  mockIncrement,
  mockTimestampNow,
  mockTimestampFromDate,
} = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockAfter: vi.fn((callback: () => unknown) => callback()),
  mockCreateCheckoutSession: vi.fn(),
  mockGetStripeCredentials: vi.fn(),
  mockGetPrzelewy24Credentials: vi.fn(),
  mockAssertModuleEnabled: vi.fn(),
  mockAssertQuota: vi.fn(),
  mockIsModuleEnabled: vi.fn(),
  mockRecordQuotaUsage: vi.fn(),
  mockStartRiskAnalysis: vi.fn(),
  mockEmitWebhookEvent: vi.fn(),
  mockDeleteOneTimePromotions: vi.fn(),
  mockMoveCartFilesToOrder: vi.fn(),
  mockSendNewOrderNotifications: vi.fn(),
  mockClassifyPrintingMethods: vi.fn(),
  mockResolveChannelProducts: vi.fn(),
  mockGetEstimatedDelivery: vi.fn(),
  mockGetOrderItemDeliveryTime: vi.fn(),
  mockGetAvailableShippingOptions: vi.fn(),
  mockGetAvailablePaymentTypes: vi.fn(),
  mockCalculateConfiguredProductPrice: vi.fn(),
  mockArrayUnion: vi.fn((...values: unknown[]) => ({
    type: "arrayUnion",
    values,
  })),
  mockIncrement: vi.fn((value: number) => ({ type: "increment", value })),
  mockTimestampNow: vi.fn(() => ({ type: "timestamp-now" })),
  mockTimestampFromDate: vi.fn((date: Date) => ({
    type: "timestamp",
    iso: date.toISOString(),
    toDate: () => date,
  })),
}));

vi.mock("next/server", () => ({ after: mockAfter }));

vi.mock("../firebase/serverApp", () => ({ getAdminDb: mockGetAdminDb }));

vi.mock("../payments/create-checkout-session", () => ({
  createCheckoutSession: mockCreateCheckoutSession,
}));

vi.mock("../payments/tenant-payment-config", () => ({
  getStripePaymentCredentials: mockGetStripeCredentials,
  getPrzelewy24PaymentCredentials: mockGetPrzelewy24Credentials,
}));

vi.mock("../saas-runtime-quotas", () => ({
  assertSaasRuntimeModuleEnabled: mockAssertModuleEnabled,
  assertSaasRuntimeQuota: mockAssertQuota,
  isSaasRuntimeModuleEnabled: mockIsModuleEnabled,
  recordSaasRuntimeQuotaUsage: mockRecordQuotaUsage,
}));

vi.mock("../order-risk/start-workflow", () => ({
  startStoreOrderRiskAnalysis: mockStartRiskAnalysis,
}));

vi.mock("../webhooks/outbound-webhooks.server", () => ({
  emitCommerceWebhookEvent: mockEmitWebhookEvent,
}));

vi.mock("../newsletter/newsletter-promotion.server", () => ({
  deleteAppliedOneTimePromotions: mockDeleteOneTimePromotions,
}));

vi.mock("./move-cart-files-to-order.server", () => ({
  moveCartFilesToOrder: mockMoveCartFilesToOrder,
}));

vi.mock("./new-order-notifications", () => ({
  sendNewOrderNotifications: mockSendNewOrderNotifications,
}));

vi.mock("./classify-printing-methods", () => ({
  classifyStoreOrderPrintingMethods: mockClassifyPrintingMethods,
}));

vi.mock("./order-price-offsets", () => ({
  // Pass prices through unchanged.
  applyOrderItemProductPriceOffsets: ({ prices }: { prices: unknown }) =>
    prices,
}));

vi.mock("./channel-products.server", () => ({
  resolveChannelProductsByIdForOrder: mockResolveChannelProducts,
}));

vi.mock("../../context/cart-selections", () => ({
  getCartAvailableShippingOptions: mockGetAvailableShippingOptions,
  getCartAvailablePaymentTypes: mockGetAvailablePaymentTypes,
  // The rule context only feeds the (mocked) pricing helpers; a plain object is
  // sufficient for the characterization tests.
  getCartShippingRuleContext: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: mockArrayUnion,
    increment: mockIncrement,
  },
  Timestamp: {
    now: mockTimestampNow,
    fromDate: mockTimestampFromDate,
  },
}));

// `@konfi/utils` is mocked wholesale so pricing/shipping/currency/tax math is
// deterministic. Each stub reproduces only the shape that
// create-order.server.ts structurally depends on. The internal `validatePrices`
// helper calls `calculateConfiguredProductPrice`; returning the item's own
// totalPrice makes price validation pass for the happy path and fail when the
// request total is tampered with.
vi.mock("@konfi/utils", () => ({
  applyPromotion: vi.fn(),
  applyPriceListToProductPrices: vi.fn(({ prices }: { prices: unknown }) => ({
    prices,
  })),
  buildDynamicPricesForSelection: vi.fn(() => []),
  calculateConfiguredProductPrice: mockCalculateConfiguredProductPrice,
  convertCurrencyMinorAmount: vi.fn(
    ({
      amountMinor,
      baseCurrency,
    }: {
      amountMinor: number;
      baseCurrency: string;
    }) => ({
      ok: true,
      snapshot: {
        fromCurrencyCode: baseCurrency,
        toCurrencyCode: baseCurrency,
        amountMinor,
        convertedAmountMinor: amountMinor,
        rate: 1,
        rateSource: "default",
      },
    }),
  ),
  CURRENCIES_SETTINGS_DOC_ID: "currencies",
  DEFAULT_COMBINATION: "default",
  generateKeywords: vi.fn(() => []),
  getEstimatedDelivery: mockGetEstimatedDelivery,
  getOrderItemDeliveryTime: mockGetOrderItemDeliveryTime,
  parseDynamicSelectionFromCombination: vi.fn(() => ({})),
  getPickupAreasByShippingOption: vi.fn(() => []),
  getShippingMethodPrice: vi.fn(() => 0),
  getSubtotalPrice: vi.fn((items: { totalPrice?: number }[]) =>
    items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0),
  ),
  isStoreCreditRedemptionAllowed: vi.fn(
    ({
      balance,
      requestedAmount,
    }: {
      balance?: number;
      orderTotal: number;
      requestedAmount: number;
    }) => requestedAmount <= 0 || requestedAmount <= (balance ?? 0),
  ),
  isAnonymousPackageShippingAllowedFor: vi.fn(() => true),
  isShippingFree: vi.fn(() => false),
  normalizeCurrencyCode: vi.fn((value?: string | null) => value ?? undefined),
  normalizeCurrencySettings: vi.fn(() => ({ defaultCurrencyCode: "PLN" })),
  normalizeAnonymousPackageLabelAddress: vi.fn((value: unknown) => value),
  normalizeInvoiceRecipientAddress: vi.fn((value: unknown) => value),
  normalizePaymentMethodsSettings: vi.fn((value: unknown) => value ?? {}),
  normalizeShippingMethodsSettings: vi.fn((value: unknown) => value ?? {}),
  normalizeStoreCreditAmount: vi.fn((value?: number) =>
    typeof value === "number" && value > 0 ? value : 0,
  ),
  PAYMENT_METHODS_SETTINGS_DOC_ID: "paymentMethods",
  removeUndefined: vi.fn(<T extends Record<string, unknown>>(value: T) => {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        result[key] = entry;
      }
    }
    return result as T;
  }),
  resolveDynamicPricingConfig: vi.fn((config: unknown) => config),
  SHIPPING_METHODS_SETTINGS_DOC_ID: "shippingMethods",
  StoreOrderSchema: { validate: vi.fn(async (value: unknown) => value) },
  buildOrderTaxSummary: vi.fn(() => ({ lines: [], totalTax: 0 })),
  TAX_SETTINGS_DOC_ID: "tax",
  isPurchasable: vi.fn(
    (product: {
      active?: boolean;
      availability: {
        availableForPurchase?: boolean;
        published?: boolean;
        publication?: { toDate: () => Date } | null;
        expiration?: { toDate: () => Date } | null;
      };
    }) => {
      if (!product) return false;
      const a = product.availability;
      if (!(product.active && a.availableForPurchase && a.published)) {
        return false;
      }
      if (a.publication == null) return false;
      if (a.publication.toDate() > new Date()) return false;
      if (a.expiration && a.expiration.toDate() < new Date()) return false;
      return true;
    },
  ),
}));

let createStoreOrder: (typeof import("./create-order.server"))["createStoreOrder"];

const tenantContext = {
  deploymentMode: "dedicated" as const,
  requireTenantId: false,
  tenantId: "default",
};

const AUTH_UID = "user-1";
const CHANNEL_ID = "channel-1";
const WAREHOUSE_ID = "wh-1";
const PRODUCT_ID = "product-1";
const GENERATED_ORDER_ID = "generated-order-id";
const STUBBED_ORDERS_COUNT = 42;

// Firestore document paths produced by the *real* `@konfi/firebase`
// `tenantFirestorePaths` in dedicated mode (kept unmocked so the keys are
// deterministic).
const PATHS = {
  cartItems: `carts/${AUTH_UID}/items`,
  buying: `channels/${CHANNEL_ID}/settings/buying`,
  customer: `customers/${AUTH_UID}`,
  channel: `channels/${CHANNEL_ID}`,
  ordersCollection: `channels/${CHANNEL_ID}/orders`,
  warehouse: `channels/${CHANNEL_ID}/warehouses/${WAREHOUSE_ID}`,
  settings: (id: string) => `channels/${CHANNEL_ID}/settings/${id}`,
  stock: (productId: string) =>
    `channels/${CHANNEL_ID}/warehouses/${WAREHOUSE_ID}/stock/${productId}`,
  productPrices: `channels/${CHANNEL_ID}/products/${PRODUCT_ID}/prices`,
};

function makeSnapshot(data: unknown, exists = data !== undefined) {
  return { exists, data: () => data };
}

function createCartItem(quantity = 1) {
  return {
    quantity,
    totalPrice: 5000 * quantity,
    discount: { discountValue: 0, discountedAmount: 0 },
    product: {
      id: PRODUCT_ID,
      name: "Business cards",
      channelId: CHANNEL_ID,
      prices: [{ currency: "PLN", value: 5000 }],
      spec: { images: [] },
    },
  };
}

function createProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: "Business cards",
    channelId: CHANNEL_ID,
    priceType: "STATIC",
    difficulty: 1,
    prices: [{ currency: "PLN", value: 5000 }],
    defaultPrice: { currency: "PLN", value: 5000 },
    spec: { images: [], minimumOrder: 1 },
    active: true,
    availability: {
      availableForPurchase: true,
      published: true,
      publication: { toDate: () => new Date("2020-01-01T00:00:00.000Z") },
    },
    attributes: [],
    ...overrides,
  };
}

function createCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: "customer-1",
    name: "Example Customer",
    addresses: [],
    allowedBankPayments: true,
    allowedOnPickupPayments: false,
    allowedDefferedPayments: false,
    storeCreditBalance: 0,
    specialNotes: "",
    keywords: [],
    active: true,
    ...overrides,
  };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    contact: {
      name: "Example Customer",
      email: "jan@example.com",
      phone: "123456789",
    },
    shipping: {
      name: "Example Customer",
      street: "Street 1",
      zip: "00-001",
      city: "Warsaw",
      country: "PL",
    },
    billing: null,
    shippingOption: "INPOST",
    paymentType: PaymentType.BANK_TRANSFER,
    anonymousPackageShipping: false,
    anonymousPackageLabelAddress: null,
    currency: "PLN",
    appliedPromotionCodes: [],
    storeCreditAmount: 0,
    designatedPickupAreaId: "pickup-1",
    invoice: false,
    saveShippingAddress: false,
    saveBillingAddress: false,
    specialNotes: "",
    invoiceNotes: "",
    proofing: ProofingOptions.RUN_AS_IS,
    totalPrice: 5000,
    ...overrides,
  };
}

interface AdminDbOptions {
  cartEmpty?: boolean;
  cartItemQuantity?: number;
  buyingEnabled?: boolean;
  customer?: Record<string, unknown> | undefined;
  stockDoc?: { total: number; allocated: number } | undefined;
  stockThrows?: boolean;
  shippingOptionsPrices?: Record<string, unknown> | undefined;
  freeShipping?: Record<string, unknown> | undefined;
  checkout?: Record<string, unknown> | undefined;
  latestStoreCreditBalance?: number;
  /**
   * Per-channel order-number counter. When `undefined` the counter document is
   * treated as missing, which makes the allocation seed from the in-transaction
   * aggregate `count()` (`seedOrdersCount`).
   */
  orderCounter?: { nextNumber: number } | undefined;
  /** Aggregate `count()` used to lazily seed a missing counter. */
  seedOrdersCount?: number;
  linkedDeadlineProducts?: Record<string, unknown>[];
}

/**
 * Minimal in-memory Firestore stub. Resolves the exact reads/writes the
 * createStoreOrder flow performs and records the transaction operations so the
 * tests can assert on them. Intentionally duplicated per the plan (no shared
 * helper).
 */
function createAdminDb(options: AdminDbOptions = {}) {
  const {
    cartEmpty = false,
    cartItemQuantity = 1,
    buyingEnabled = true,
    customer = createCustomer(),
    stockDoc,
    stockThrows = false,
    shippingOptionsPrices = { INPOST: { price: 0 } },
    freeShipping = { enabled: false, min: 0 },
    checkout = { invoiceEnabled: true },
    latestStoreCreditBalance,
    seedOrdersCount = STUBBED_ORDERS_COUNT,
    linkedDeadlineProducts = [],
  } = options;
  // A missing `orderCounter` key defaults to an existing counter; passing
  // `orderCounter: undefined` explicitly models a missing counter document.
  const orderCounter = Object.prototype.hasOwnProperty.call(
    options,
    "orderCounter",
  )
    ? options.orderCounter
    : { nextNumber: STUBBED_ORDERS_COUNT };

  const cartItemRefs = cartEmpty
    ? []
    : [{ ref: { id: "cart-item-1", path: `${PATHS.cartItems}/cart-item-1` } }];
  const cartDocs = cartItemRefs.map(({ ref }) => ({
    ref,
    data: () => createCartItem(cartItemQuantity),
  }));

  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const orderRef = {
    id: GENERATED_ORDER_ID,
    path: `${PATHS.ordersCollection}/${GENERATED_ORDER_ID}`,
  };

  // Per-channel order-number counter doc: channels/{id}/counters/orders, reached
  // from the orders collection's `.parent` (the channel doc) -> counters/orders.
  const counterRef = {
    id: "orders",
    path: `${PATHS.channel}/counters/orders`,
  };
  const counterSnapshot = makeSnapshot(
    orderCounter,
    orderCounter !== undefined,
  );
  // Aggregate count() used by both the (legacy) collection-level read — which
  // must NOT run anymore — and the helper's in-transaction lazy seed.
  const aggregateQuery = {
    get: vi.fn().mockResolvedValue(makeSnapshot({ count: seedOrdersCount })),
  };
  const collectionLevelCount = vi.fn(() => aggregateQuery);
  const channelDoc = {
    id: CHANNEL_ID,
    path: PATHS.channel,
    collection: vi.fn((id: string) => {
      if (id === "counters") {
        return { doc: vi.fn(() => counterRef) };
      }
      throw new Error(`unexpected sibling collection ${id}`);
    }),
  };

  function priceSubcollection() {
    return {
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue(makeSnapshot(undefined, false)),
      })),
    };
  }

  const adminDb = {
    collection: vi.fn((path: string) => {
      if (path === PATHS.cartItems) {
        return {
          get: vi.fn().mockResolvedValue({ empty: cartEmpty, docs: cartDocs }),
        };
      }
      if (path === PATHS.ordersCollection) {
        return {
          count: collectionLevelCount,
          doc: vi.fn(() => orderRef),
          parent: channelDoc,
        };
      }
      if (path === PATHS.productPrices) {
        return priceSubcollection();
      }
      // priceLists / designatedPickupAreas tenant-filtered queries:
      return {
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(makeSnapshot(undefined, false)),
        })),
      };
    }),
    collectionGroup: vi.fn((collectionId: string) => {
      if (collectionId !== "products") {
        throw new Error(`unexpected collection group ${collectionId}`);
      }

      return {
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            docs: linkedDeadlineProducts.map((product) => ({
              data: () => product,
              ref: {
                parent: {
                  parent: {
                    id:
                      typeof product.channelId === "string"
                        ? product.channelId
                        : "source-channel",
                  },
                },
              },
            })),
          }),
        })),
      };
    }),
    doc: vi.fn((path: string) => {
      if (path === PATHS.buying) {
        return {
          get: vi
            .fn()
            .mockResolvedValue(makeSnapshot({ enabled: buyingEnabled })),
        };
      }
      // The customer is read by authUid (`customers/user-1`) but the
      // transaction writes use `customer.id` (`customers/customer-1`); both
      // resolve to the same stub here.
      if (path.startsWith("customers/")) {
        return {
          get: vi.fn().mockResolvedValue(makeSnapshot(customer)),
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ id: "store-credit-tx-1" })),
          })),
        };
      }
      if (path === PATHS.channel) {
        return {
          get: vi
            .fn()
            .mockResolvedValue(
              makeSnapshot({ warehouses: [WAREHOUSE_ID], currency: "PLN" }),
            ),
        };
      }
      if (path === PATHS.settings("shippingOptionsPrices")) {
        return {
          get: vi.fn().mockResolvedValue(makeSnapshot(shippingOptionsPrices)),
        };
      }
      if (path === PATHS.settings("freeShipping")) {
        return { get: vi.fn().mockResolvedValue(makeSnapshot(freeShipping)) };
      }
      if (path === PATHS.settings("checkout")) {
        return { get: vi.fn().mockResolvedValue(makeSnapshot(checkout)) };
      }
      if (path === PATHS.settings("currencies")) {
        return {
          get: vi
            .fn()
            .mockResolvedValue(makeSnapshot({ defaultCurrencyCode: "PLN" })),
        };
      }
      if (path === PATHS.settings("tax")) {
        return {
          get: vi.fn().mockResolvedValue(makeSnapshot(undefined, false)),
        };
      }
      if (path === PATHS.stock(PRODUCT_ID)) {
        return { path } as unknown;
      }
      // Fallback: an unknown settings/doc read returns "missing".
      return { get: vi.fn().mockResolvedValue(makeSnapshot(undefined, false)) };
    }),
    getAll: vi.fn(async () => {
      if (stockThrows) {
        throw new Error("stock read failed");
      }
      return [makeSnapshot(stockDoc, stockDoc !== undefined)];
    }),
    runTransaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => {
      const balance =
        latestStoreCreditBalance ??
        (customer?.storeCreditBalance as number | undefined) ??
        0;
      const customerSnapshot = makeSnapshot({
        ...(customer ?? {}),
        storeCreditBalance: balance,
      });
      transaction.get.mockImplementation((ref: unknown) => {
        if (ref === counterRef) {
          return Promise.resolve(counterSnapshot);
        }
        if (ref === aggregateQuery) {
          return Promise.resolve(makeSnapshot({ count: seedOrdersCount }));
        }
        if (
          typeof ref === "object" &&
          ref !== null &&
          "path" in ref &&
          ref.path === PATHS.stock(PRODUCT_ID)
        ) {
          if (stockThrows) {
            return Promise.reject(new Error("stock read failed"));
          }

          return Promise.resolve(
            makeSnapshot(stockDoc, stockDoc !== undefined),
          );
        }

        return Promise.resolve(customerSnapshot);
      });
      return fn(transaction);
    }),
  };

  return {
    adminDb,
    transaction,
    orderRef,
    cartDocs,
    counterRef,
    collectionLevelCount,
  };
}

function primeHappyPathMocks() {
  mockGetAvailableShippingOptions.mockReturnValue(["INPOST"]);
  mockGetAvailablePaymentTypes.mockReturnValue([
    PaymentType.BANK_TRANSFER,
    PaymentType.STRIPE,
  ]);
  // validatePrices(...) sums calculateConfiguredProductPrice results and
  // compares against the request total; echo the item total so it matches.
  mockCalculateConfiguredProductPrice.mockImplementation(
    ({ quantity }: { quantity: number }) => ({
      result: 5000 * quantity,
      error: undefined,
    }),
  );
  mockIsModuleEnabled.mockResolvedValue(false);
  mockResolveChannelProducts.mockResolvedValue([createProduct()]);
  mockGetEstimatedDelivery.mockReturnValue(
    new Date("2026-07-01T00:00:00.000Z"),
  );
  mockGetOrderItemDeliveryTime.mockReturnValue(1);
}

describe("createStoreOrder", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = CHANNEL_ID;
    process.env.NODE_ENV = "test";

    mockAfter.mockImplementation((callback: () => unknown) => callback());
    // The module calls `startStoreOrderRiskAnalysis(...).catch(...)`, so the
    // mock must return a thenable.
    mockStartRiskAnalysis.mockResolvedValue(undefined);
    mockAssertModuleEnabled.mockResolvedValue(undefined);
    mockAssertQuota.mockResolvedValue(undefined);
    mockRecordQuotaUsage.mockResolvedValue(undefined);
    mockSendNewOrderNotifications.mockResolvedValue(undefined);
    mockMoveCartFilesToOrder.mockResolvedValue(undefined);
    mockDeleteOneTimePromotions.mockResolvedValue(undefined);
    mockEmitWebhookEvent.mockResolvedValue(undefined);
    mockCreateCheckoutSession.mockResolvedValue({
      id: "sess_123",
      url: "https://stripe.test/session",
      paymentIntent: "pi_123",
    });
    mockGetStripeCredentials.mockResolvedValue({
      secretKey: "sk_test_123",
      webhookSecret: "whsec_123",
    });
    mockArrayUnion.mockImplementation((...values: unknown[]) => ({
      type: "arrayUnion",
      values,
    }));
    mockIncrement.mockImplementation((value: number) => ({
      type: "increment",
      value,
    }));
    mockTimestampNow.mockImplementation(() => ({ type: "timestamp-now" }));
    mockTimestampFromDate.mockImplementation((date: Date) => ({
      type: "timestamp",
      iso: date.toISOString(),
      toDate: () => date,
    }));

    primeHappyPathMocks();

    ({ createStoreOrder } = await import("./create-order.server"));
  });

  // -- Error paths ----------------------------------------------------------

  it("returns CART_EMPTY when the cart has no items", async () => {
    const { adminDb } = createAdminDb({ cartEmpty: true });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result).toEqual({
      id: "",
      message: "ORDER_CREATION_FAILED",
      url: "",
      error: "CART_EMPTY",
    });
  });

  it("returns BUYING_DISABLED when storefront buying is turned off", async () => {
    const { adminDb } = createAdminDb({ buyingEnabled: false });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("BUYING_DISABLED");
  });

  it("returns INVALID_SHIPPING_OPTION when the requested option is unavailable", async () => {
    const { adminDb } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);
    mockGetAvailableShippingOptions.mockReturnValue(["PACZKOMATY_INPOST"]);

    const result = await createStoreOrder({
      request: createRequest({ shippingOption: "INPOST" }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("INVALID_SHIPPING_OPTION");
  });

  it("returns INVALID_PAYMENT_TYPE when the requested payment type is unavailable", async () => {
    const { adminDb } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);
    mockGetAvailablePaymentTypes.mockReturnValue([PaymentType.STRIPE]);

    const result = await createStoreOrder({
      request: createRequest({
        paymentType: PaymentType.BANK_TRANSFER,
      }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("INVALID_PAYMENT_TYPE");
  });

  it("returns INVALID_PRICES when the recomputed item price does not match the cart total", async () => {
    const { adminDb } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);
    // validatePrices recomputes each item price via calculateConfiguredProductPrice
    // and rejects when it differs from the cart item's stored totalPrice (5000).
    mockCalculateConfiguredProductPrice.mockReturnValue({
      result: 1,
      error: undefined,
    });

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("INVALID_PRICES");
  });

  it("allows checkout by default when available stock is below the ordered quantity", async () => {
    const { adminDb, transaction } = createAdminDb({
      cartItemQuantity: 2,
      stockDoc: { total: 2, allocated: 1 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      // available = total - allocated = 1, requested quantity = 2.
      request: createRequest({ totalPrice: 10000 }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.message).toBe("ORDER_CREATED_SUCCESFULLY");
    expect(result.error).toBeUndefined();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("returns INSUFFICIENT_STOCK when strict stock policy has too little stock", async () => {
    const { adminDb } = createAdminDb({
      cartItemQuantity: 2,
      checkout: { invoiceEnabled: true, stockPolicy: "block" },
      stockDoc: { total: 2, allocated: 1 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      // available = total - allocated = 1, requested quantity = 2.
      request: createRequest({ totalPrice: 10000 }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("INSUFFICIENT_STOCK");
  });

  it("returns STOCK_NOT_FOUND when strict stock policy has no stock document", async () => {
    const { adminDb } = createAdminDb({
      checkout: { invoiceEnabled: true, stockPolicy: "block" },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("STOCK_NOT_FOUND");
  });

  it("returns STOCK_CHECK_FAILED when the strict stock read throws", async () => {
    const { adminDb } = createAdminDb({
      checkout: { invoiceEnabled: true, stockPolicy: "block" },
      stockThrows: true,
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("STOCK_CHECK_FAILED");
  });

  it("reserves stock atomically inside the order transaction when strict stock policy passes", async () => {
    const { adminDb, transaction } = createAdminDb({
      checkout: { invoiceEnabled: true, stockPolicy: "block" },
      stockDoc: { total: 100, allocated: 4 },
      orderCounter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.message).toBe("ORDER_CREATED_SUCCESFULLY");
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATHS.stock(PRODUCT_ID) }),
      expect.objectContaining({
        allocated: { type: "increment", value: 1 },
        updatedBy: {
          id: "system",
          name: "System",
        },
      }),
    );
  });

  it("preserves admin override when strict stock policy would block store checkout", async () => {
    const { adminDb, transaction } = createAdminDb({
      cartItemQuantity: 2,
      checkout: { invoiceEnabled: true, stockPolicy: "block" },
      stockDoc: { total: 2, allocated: 1 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest({ totalPrice: 10000 }) as never,
      authUid: AUTH_UID,
      isAdmin: true,
      tenantContext,
    });

    expect(result).toEqual({
      id: "test_order_id",
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "",
      error: undefined,
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("still creates the order when printing-method classification throws", async () => {
    const { adminDb, transaction, orderRef } = createAdminDb({
      stockDoc: { total: 100, allocated: 0 },
      orderCounter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);
    // Enable the printingMethods module so the classification branch is entered.
    mockIsModuleEnabled.mockImplementation(({ module }: { module: string }) =>
      module === "printingMethods"
        ? Promise.resolve(true)
        : Promise.resolve(false),
    );
    mockClassifyPrintingMethods.mockRejectedValue(
      new Error("Vertex AI unavailable"),
    );

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    // Checkout must succeed despite the classification failure.
    expect(result).toEqual({
      id: orderRef.id,
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "",
    });

    // The persisted order must have printingMethods defaulted to [].
    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderRef,
    );
    expect(orderSetCall).toBeDefined();
    expect(orderSetCall?.[1]).toEqual(
      expect.objectContaining({ printingMethods: [] }),
    );
  });

  it("returns STORE_CREDIT_EXCEEDS_BALANCE when the transaction balance is too low", async () => {
    const { adminDb } = createAdminDb({
      customer: createCustomer({ storeCreditBalance: 5000 }),
      // The transaction re-reads the balance and finds it insufficient.
      latestStoreCreditBalance: 100,
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest({ storeCreditAmount: 5000 }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("STORE_CREDIT_EXCEEDS_BALANCE");
  });

  it("returns INVALID_PRODUCTS when a product is not purchasable (missing publication)", async () => {
    const { adminDb } = createAdminDb();
    mockGetAdminDb.mockReturnValue(adminDb);
    // Return a product that fails isPurchasable: active but publication is null,
    // so the canonical rule rejects it.
    mockResolveChannelProducts.mockResolvedValue([
      createProduct({
        availability: {
          availableForPurchase: true,
          published: true,
          publication: null,
        },
      }),
    ]);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result).toEqual({
      id: "",
      message: "ORDER_CREATION_FAILED",
      url: "",
      error: "INVALID_PRODUCTS",
    });
  });

  // -- Happy path -----------------------------------------------------------

  it("persists the order and returns success on the full happy path", async () => {
    const {
      adminDb,
      transaction,
      orderRef,
      counterRef,
      collectionLevelCount,
      cartDocs,
    } = createAdminDb({
      stockDoc: { total: 100, allocated: 0 },
      // Existing per-channel counter -> the order takes its `nextNumber`.
      orderCounter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    // Result shape pins the existing "SUCCESFULLY" typo and empty url for the
    // offline (BANK_TRANSFER) payment path.
    expect(result).toEqual({
      id: orderRef.id,
      message: "ORDER_CREATED_SUCCESFULLY",
      url: "",
    });

    // The order number now comes from the per-channel counter doc, allocated
    // transactionally (plan 004), not the pre-transaction collection count.
    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderRef,
    );
    expect(orderSetCall).toBeDefined();
    expect(orderSetCall?.[1]).toEqual(expect.objectContaining({ number: 42 }));

    // The counter doc is rewritten (merge) with the advanced nextNumber.
    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall).toBeDefined();
    expect(counterSetCall?.[1]).toEqual(
      expect.objectContaining({ nextNumber: 43 }),
    );
    expect(counterSetCall?.[2]).toEqual({ merge: true });

    // With the counter present, the legacy collection-level count() is never read.
    expect(collectionLevelCount).not.toHaveBeenCalled();

    // Every cart item doc is deleted inside the transaction.
    expect(transaction.delete).toHaveBeenCalledTimes(cartDocs.length);
    for (const doc of cartDocs) {
      expect(transaction.delete).toHaveBeenCalledWith(doc.ref);
    }

    // Risk analysis is dispatched once (plan 006 moves this into after()).
    expect(mockStartRiskAnalysis).toHaveBeenCalledTimes(1);

    // Quota guard + usage record each fire once for the order create.
    expect(mockAssertQuota).toHaveBeenCalledTimes(1);
    expect(mockRecordQuotaUsage).toHaveBeenCalledTimes(1);
  });

  it("adds linked channel lead time before estimating the store order deadline", async () => {
    const { adminDb } = createAdminDb({
      stockDoc: { total: 100, allocated: 0 },
      linkedDeadlineProducts: [
        createProduct({
          channelId: "W33",
          linkedChannels: [CHANNEL_ID],
          prices: [
            {
              combination: { id: "default", active: true, customFormat: false },
              currency: "PLN",
              value: 5000,
              volume: { deliveryTime: 4, value: 1 },
            },
          ],
        }),
      ],
    });
    mockGetAdminDb.mockReturnValue(adminDb);
    mockGetOrderItemDeliveryTime.mockImplementation(
      (item: {
        product?: { channelId?: string; deadlineDeliveryTime?: number };
      }) =>
        item.product?.channelId === "W33"
          ? 4
          : (item.product?.deadlineDeliveryTime ?? 1),
    );

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.message).toBe("ORDER_CREATED_SUCCESFULLY");

    const estimatedDeliveryItems = mockGetEstimatedDelivery.mock
      .calls[0]?.[0] as
      | Array<{ product?: { deadlineDeliveryTime?: number } }>
      | undefined;
    expect(estimatedDeliveryItems?.[0]?.product?.deadlineDeliveryTime).toBe(3);
  });

  it("seeds the order number from the in-transaction count when no counter exists", async () => {
    const { adminDb, transaction, orderRef, counterRef } = createAdminDb({
      stockDoc: { total: 100, allocated: 0 },
      // No counter doc yet -> lazy seed from the in-transaction aggregate count.
      orderCounter: undefined,
      seedOrdersCount: 7,
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest() as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.message).toBe("ORDER_CREATED_SUCCESFULLY");

    const orderSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === orderRef,
    );
    expect(orderSetCall?.[1]).toEqual(expect.objectContaining({ number: 7 }));

    const counterSetCall = transaction.set.mock.calls.find(
      ([ref]) => ref === counterRef,
    );
    expect(counterSetCall?.[1]).toEqual(
      expect.objectContaining({ nextNumber: 8 }),
    );
  });

  // -- Store credit currency guard ------------------------------------------

  it("rejects store credit when the resolved currency is not the native currency (request.currency omitted, channel default differs)", async () => {
    // Override normalizeCurrencySettings so the channel's resolved default is
    // EUR, not PLN.  This simulates a multi-currency channel whose default
    // differs from the native order currency.
    vi.mocked(normalizeCurrencySettings).mockReturnValue({
      defaultCurrencyCode: "EUR",
    });
    // Override convertCurrencyMinorAmount to honour targetCurrency so the
    // resolved selectedOrderCurrency.currency becomes "EUR".
    vi.mocked(convertCurrencyMinorAmount).mockImplementation(
      ({
        amountMinor,
        baseCurrency,
        targetCurrency,
      }: {
        amountMinor: number;
        baseCurrency: string;
        targetCurrency?: string;
      }) => ({
        ok: true as const,
        snapshot: {
          fromCurrencyCode: baseCurrency,
          toCurrencyCode: targetCurrency ?? baseCurrency,
          amountMinor,
          convertedAmountMinor: amountMinor,
          rate: 1,
          rateSource: "default",
        },
      }),
    );

    const { adminDb } = createAdminDb({
      customer: createCustomer({ storeCreditBalance: 10000 }),
      // The transaction re-reads the balance; keep it high enough to pass the
      // in-transaction STORE_CREDIT_EXCEEDS_BALANCE guard.
      latestStoreCreditBalance: 10000,
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    // No `currency` field → request.currency is undefined, so the resolved
    // currency comes from the channel default ("EUR" after the mock override).
    const result = await createStoreOrder({
      request: createRequest({
        storeCreditAmount: 5000,
        currency: undefined,
      }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.error).toBe("INVALID_STORE_CREDIT_CURRENCY");
  });

  it("allows store credit in the native currency (happy path unchanged after guard)", async () => {
    // Default mocks keep normalizeCurrencySettings returning PLN — the native
    // order currency — so the new guard must NOT fire.
    const { adminDb } = createAdminDb({
      stockDoc: { total: 100, allocated: 0 },
      customer: createCustomer({ storeCreditBalance: 5000 }),
      latestStoreCreditBalance: 5000,
      orderCounter: { nextNumber: 42 },
    });
    mockGetAdminDb.mockReturnValue(adminDb);

    const result = await createStoreOrder({
      request: createRequest({ storeCreditAmount: 2000 }) as never,
      authUid: AUTH_UID,
      isAdmin: false,
      tenantContext,
    });

    expect(result.message).toBe("ORDER_CREATED_SUCCESFULLY");
    expect(result.error).toBeUndefined();
  });
});
