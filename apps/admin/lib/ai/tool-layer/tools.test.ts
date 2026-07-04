import { describe, expect, it, vi } from "vitest";
import { CurrencyEnum, PriceTypeEnum, Unit } from "@konfi/types";
import type {
  Attribute,
  Category,
  Channel,
  Customer,
  DynamicPricingConfig,
  DynamicPricingPreset,
  Order,
  Product,
  ProductType,
} from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import { ToolLayerError } from "./errors";
import {
  explainProductPrice,
  getProductDynamicPricingConfig,
  getProductCosts,
  getBusinessRecord,
  getDraftResourceOptions,
  getDraftSchema,
  getKonfiDraftingDocs,
  getProductConfigurationSchema,
  listBusinessResources,
  listChannels,
  listProducts,
  getCustomer,
  getOrder,
  getOrderByNumber,
  listOrders,
  getProduct,
  listProductPriceRows,
  queryFirestoreRecords,
  saveDraft,
  searchOrders,
  searchBusinessRecords,
  searchMaterialCostsByQuery,
  searchProducts,
  suggestOrderItems,
} from "./tools";
import type {
  SaveDraftRecordInput,
  ToolAuditEvent,
  ToolAuthContext,
  ToolLayerReaders,
  ToolLayerRuntime,
  ToolLayerWriters,
  ProductPriceTableRow,
} from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(() => ({})),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-timestamp"),
  },
  getFirestore: vi.fn(),
}));
const mockSuggestOrderItemsFromCatalog = vi.hoisted(() =>
  vi.fn(async () => ({
    catalogCandidateCount: 1,
    count: 1,
    fullTextMatched: true,
    indexedMatched: false,
    items: [
      {
        productId: "product-1",
        productName: "Business cards",
        quantity: 100,
        totalPrice: 1000,
      },
    ],
    notes: [],
    totalAvailable: 1,
    usedFullCatalogFallback: false,
  })),
);
vi.mock("@/lib/ai/product-search/product-discovery", () => ({
  suggestOrderItemsFromCatalog: mockSuggestOrderItemsFromCatalog,
}));

const auth: ToolAuthContext = {
  actor: {
    email: "admin@example.com",
    kind: "konfi-session",
    uid: "user-1",
  },
  permissions: {
    channelIds: ["channel-1"],
    isAdmin: true,
    isSuperAdmin: false,
    scopes: [
      "user:context",
      "orders:read",
      "products:read",
      "customers:read",
      "pricing:explain",
    ],
  },
  request: {
    requestId: "request-1",
    source: "test",
  },
};

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    active: true,
    allowCustomPrice: false,
    attributeOptions: {},
    attributes: [],
    availability: {
      availableForPurchase: true,
      published: true,
    },
    category: {
      id: "category-1",
      name: "Business cards",
    },
    channelId: "channel-1",
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    customSize: false,
    defaultPrice: {
      combination: { id: DEFAULT_COMBINATION, name: "Default" },
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    description: "Cards",
    difficulty: 1,
    highPrice: {
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    id: "product-1",
    keywords: [],
    linkedChannels: [],
    lowPrice: {
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    name: "Business cards",
    prefferedUnit: Unit.PCS,
    priceType: PriceTypeEnum.SINGLE,
    prices: [
      {
        combination: { id: DEFAULT_COMBINATION, name: "Default" },
        currency: CurrencyEnum.PLN,
        value: 1000,
      },
    ],
    productType: null,
    recommended: false,
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    shipping: {
      types: [],
    },
    spec: {
      defaultOrder: 100,
      images: [],
      maximumOrder: 10000,
      minimumOrder: 1,
      step: 1,
    },
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    volumes: [],
    ...overrides,
  } as Product;
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    active: true,
    channelId: "channel-1",
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    currency: CurrencyEnum.PLN,
    customer: {
      id: "customer-1",
      name: "Acme",
    },
    deadline: null,
    filesStatus: "WAITING_FOR_FILES",
    id: "order-1",
    items: [],
    number: 42,
    paymentStatus: "UNPAID",
    paymentType: "BANK_TRANSFER",
    shippingOption: null,
    status: "NEW",
    totalPrice: 1000,
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as Order;
}

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    active: true,
    allowedBankPayments: true,
    allowedDefferedPayments: false,
    allowedOnPickupPayments: false,
    b2b: true,
    contacts: [
      {
        email: "buyer@example.com",
        name: "Buyer",
        phone: "+48123456789",
      },
    ],
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    id: "customer-1",
    keywords: [],
    name: "Acme",
    specialNotes: "VIP",
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as Customer;
}

function createChannel(
  overrides: Partial<Channel> & { tenantId?: string } = {},
): Channel {
  return {
    active: true,
    createdAt: new Date() as Channel["createdAt"],
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    currency: CurrencyEnum.PLN,
    id: "channel-1",
    name: "Main Store",
    updatedAt: new Date() as Channel["updatedAt"],
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    warehouses: [],
    ...overrides,
  };
}

function createAttribute(overrides: Partial<Attribute> = {}): Attribute {
  return {
    active: true,
    calculated: false,
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    format: false,
    id: "paper",
    keywords: [],
    name: "Paper",
    options: [
      {
        customFormat: false,
        hidden: false,
        label: "Matte 350g",
        value: "matte-350",
      },
      {
        customFormat: false,
        hidden: true,
        label: "Hidden supplier option",
        value: "hidden-supplier",
      },
    ],
    required: true,
    trackStock: false,
    type: "DROPDOWN",
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as Attribute;
}

function createCategory(overrides: Partial<Category> = {}): Category {
  return {
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    id: "category-1",
    keywords: [],
    name: "Business cards",
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as Category;
}

function createProductType(overrides: Partial<ProductType> = {}): ProductType {
  return {
    active: true,
    attributes: ["paper"],
    createdAt: new Date(),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    id: "product-type-1",
    isShippable: true,
    keywords: [],
    name: "Printed product",
    updatedAt: new Date(),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as ProductType;
}

function createProductPriceRow(
  overrides: Partial<ProductPriceTableRow> = {},
): ProductPriceTableRow {
  return {
    channelId: "channel-1",
    id: DEFAULT_COMBINATION,
    prices: [
      {
        combination: { id: DEFAULT_COMBINATION, name: "Default" },
        currency: CurrencyEnum.PLN,
        value: 1000,
      },
    ],
    productId: "product-1",
    ...overrides,
  } as ProductPriceTableRow;
}

function createDynamicPricingConfig(
  overrides: Partial<DynamicPricingConfig> = {},
): DynamicPricingConfig {
  return {
    attributeRules: [],
    baseDeliveryTime: 2,
    basePrice: 1000,
    enabled: true,
    globalRules: [],
    inputs: [],
    linkedPresetIds: [],
    ...overrides,
  };
}

function createReaders(overrides: Partial<ToolLayerReaders> = {}) {
  const product = createProduct();

  return {
    getAttributeOptionCosts: vi.fn(async () => []),
    listChannels: vi.fn(async () => [createChannel()]),
    listAttributes: vi.fn(async () => [createAttribute()]),
    listCategories: vi.fn(async () => [createCategory()]),
    getCustomer: vi.fn(async () => createCustomer()),
    getCustomerOrders: vi.fn(async () => [createOrder()]),
    getDynamicPricingAttributes: vi.fn(async () => []),
    getDynamicPricingPresetsByIds: vi.fn(
      async () => [] as DynamicPricingPreset[],
    ),
    getBusinessRecord: vi.fn(async () => null),
    getOrder: vi.fn(async () => createOrder()),
    getOrderByNumber: vi.fn(async () => createOrder()),
    getProduct: vi.fn(async () => product),
    getProductCosts: vi.fn(async () => []),
    getProductDynamicPricing: vi.fn(
      async () => null as DynamicPricingConfig | null,
    ),
    listProductPriceRows: vi.fn(async () => [createProductPriceRow()]),
    listBusinessRecords: vi.fn(async () => []),
    listOrdersByIds: vi.fn(async () => [createOrder()]),
    listOrders: vi.fn(async () => [createOrder()]),
    listProducts: vi.fn(async () => [product]),
    listProductCostMappings: vi.fn(async () => []),
    listProductsByIds: vi.fn(async () => [product]),
    listProductTypes: vi.fn(async () => [createProductType()]),
    queryBusinessRecords: vi.fn(async () => ({
      collectionPath: "channels/channel-1/orders",
      records: [],
    })),
    searchCustomers: vi.fn(async () => ["customer-1"]),
    searchOrders: vi.fn(async () => ({
      orderIds: ["order-1"],
      totalHits: 1,
    })),
    searchCostEvidence: vi.fn(async () => []),
    searchMaterialCostsByQuery: vi.fn(async () => ({
      baseCurrency: "PLN",
      matches: [],
      noResultReason:
        "No approved indexed Fakturownia cost matched this query.",
      query: "paper",
      summary: {
        sampleCount: 0,
      },
      totalReturned: 0,
    })),
    searchProducts: vi.fn(async () => ["product-1"]),
    ...overrides,
  } satisfies ToolLayerReaders;
}

function createRuntime(
  options: {
    auth?: ToolAuthContext;
    readers?: ToolLayerReaders;
    writers?: ToolLayerWriters;
  } = {},
) {
  const auditEvents: ToolAuditEvent[] = [];
  const runtime: ToolLayerRuntime = {
    audit: {
      logToolCall: vi.fn(async (event) => {
        auditEvents.push(event);
      }),
    },
    auth: options.auth ?? auth,
    readers: options.readers ?? createReaders(),
    writers: options.writers,
  };

  return { auditEvents, runtime };
}

describe("tool-layer read tools", () => {
  it("denies missing scopes before reading data", async () => {
    const readers = createReaders();
    const { auditEvents, runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: ["products:read"],
        },
      },
      readers,
    });

    await expect(
      getOrder(runtime, { channelId: "channel-1", orderId: "order-1" }),
    ).rejects.toBeInstanceOf(ToolLayerError);

    expect(readers.getOrder).not.toHaveBeenCalled();
    expect(auditEvents[0]?.status).toBe("denied");
    expect(auditEvents[0]?.authorization.denialReason).toBe("missing_scope");
  });

  it("does not let audit failures hide tool denial errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const readers = createReaders();
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: ["products:read"],
        },
      },
      readers,
    });

    runtime.audit = {
      logToolCall: vi.fn(async () => {
        throw new Error("audit unavailable");
      }),
    };

    await expect(
      getOrder(runtime, { channelId: "channel-1", orderId: "order-1" }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      status: 403,
    });

    expect(readers.getOrder).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[tool-layer] Audit logging failed", {
      error: expect.any(Error),
    });

    warn.mockRestore();
  });

  it("reads approved product costs only with the costs read scope", async () => {
    const readers = createReaders({
      getProductCosts: vi.fn(async () => [
        {
          confidence: 0.9,
          currency: "PLN",
          evidenceId: "invoice-1-0",
          invoice: {
            id: "invoice-1",
            issueDate: "2026-01-15",
            number: "FV/1/2026",
          },
          position: {
            index: 0,
            name: "Paper 350g",
          },
          productId: "product-1",
          productName: "Business cards",
          quantity: 100,
          quantityUnit: "szt",
          sourceSignals: ["supplier_linked_product"],
          supplier: {
            name: "Paper Supplier",
          },
          unitCostNet: 0.42,
        },
      ]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "costs:read"],
        },
      },
      readers,
    });

    const result = await getProductCosts(runtime, {
      dateFrom: "2026-01-01",
      limit: 10,
      productId: "product-1",
    });

    expect(readers.getProductCosts).toHaveBeenCalledWith({
      dateFrom: "2026-01-01",
      limit: 10,
      productId: "product-1",
    });
    expect(result.totalReturned).toBe(1);
    expect(result.costs[0].supplier.name).toBe("Paper Supplier");
    expect(result.notes[0]).toContain("admin-approved");
  });

  it("searches approved material costs by natural-language query with the costs read scope", async () => {
    const readers = createReaders({
      searchMaterialCostsByQuery: vi.fn(async () => ({
        baseCurrency: "PLN",
        matches: [
          {
            confidence: 0.95,
            currency: "PLN",
            distance: 0.12,
            evidenceId: "invoice-1-0",
            invoice: {
              id: "invoice-1",
              issueDate: "2026-01-15",
              number: "FV/1/2026",
            },
            position: {
              index: 0,
              name: "Folia bąbelkowa",
            },
            quantity: 1,
            quantityUnit: "rolka",
            sourceSignals: ["supplier_linked_attribute_option"],
            supplier: {
              name: "Packaging Supplier",
            },
            unitCostNet: 80,
          },
        ],
        query: "Ile kosztuje nas folia bąbelkowa?",
        summary: {
          averageUnitCostNetBase: 80,
          latestIssueDate: "2026-01-15",
          latestUnitCostNetBase: 80,
          sampleCount: 1,
        },
        totalReturned: 1,
      })),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "costs:read"],
        },
      },
      readers,
    });

    const result = await searchMaterialCostsByQuery(runtime, {
      limit: 5,
      query: "Ile kosztuje nas folia bąbelkowa?",
    });

    expect(readers.searchMaterialCostsByQuery).toHaveBeenCalledWith({
      limit: 5,
      query: "Ile kosztuje nas folia bąbelkowa?",
    });
    expect(result.summary.latestUnitCostNetBase).toBe(80);
    expect(result.matches[0].distance).toBe(0.12);
    expect(result.notes[0]).toContain("admin-approved");
  });

  it("lists authorized channels by name", async () => {
    const readers = createReaders({
      listChannels: vi.fn(async () => [
        createChannel({ id: "channel-1", name: "Main Store" }),
        createChannel({ id: "channel-2", name: "Wholesale" }),
      ]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          channelIds: ["channel-1", "channel-2"],
        },
      },
      readers,
    });

    const result = await listChannels(runtime);

    expect(result.channels).toEqual([
      {
        active: true,
        name: "Main Store",
      },
      {
        active: true,
        name: "Wholesale",
      },
    ]);
  });

  it("lists active orders from the selected channel newest first", async () => {
    const readers = createReaders({
      listOrders: vi.fn(async () => [
        createOrder({ id: "order-2", number: 102 }),
        createOrder({ id: "order-1", number: 101 }),
      ]),
    });
    const { runtime } = createRuntime({ readers });

    const result = await listOrders(runtime, {
      channelName: "Main Store",
      limit: 2,
      page: 1,
    });

    expect(readers.listOrders).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 2,
      offset: 2,
    });
    expect(result).toMatchObject({
      limit: 2,
      nextPage: 2,
      page: 1,
      results: [
        {
          id: "order-2",
          number: 102,
        },
        {
          id: "order-1",
          number: 101,
        },
      ],
      totalReturned: 2,
    });
  });

  it("fetches an order by visible order number", async () => {
    const readers = createReaders({
      getOrderByNumber: vi.fn(async () =>
        createOrder({ id: "order-123", number: 123 }),
      ),
    });
    const { runtime } = createRuntime({ readers });

    const result = await getOrderByNumber(runtime, {
      channelName: "Main Store",
      orderNumber: 123,
    });

    expect(readers.getOrderByNumber).toHaveBeenCalledWith({
      channelId: "channel-1",
      orderNumber: 123,
    });
    expect(result).toMatchObject({
      id: "order-123",
      number: 123,
    });
  });

  it("uses exact order-number lookup for numeric order searches", async () => {
    const readers = createReaders({
      getOrderByNumber: vi.fn(async () =>
        createOrder({ id: "order-456", number: 456 }),
      ),
      searchOrders: vi.fn(async () => ({
        orderIds: ["wrong-order"],
        totalHits: 1,
      })),
    });
    const { runtime } = createRuntime({ readers });

    const result = await searchOrders(runtime, {
      channelName: "Main Store",
      query: "#456",
    });

    expect(readers.getOrderByNumber).toHaveBeenCalledWith({
      channelId: "channel-1",
      orderNumber: 456,
    });
    expect(readers.searchOrders).not.toHaveBeenCalled();
    expect(result).toEqual({
      results: [
        {
          id: "order-456",
          label: "#456 Acme",
          type: "order",
        },
      ],
      totalHits: 1,
    });
  });

  it("lists admin-only business resources", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "business:read"],
        },
      },
    });

    const result = await listBusinessResources(runtime);
    const resourceNames = result.resources.map((resource) => resource.name);

    expect(resourceNames).toEqual(
      expect.arrayContaining([
        "campaigns",
        "promotions",
        "fakturowniaInvoices",
        "externalProducts",
        "channelSettings",
      ]),
    );
    expect(result.notes[0]).toContain("read-only");
  });

  it("queries Firestore business resources with structured clauses", async () => {
    const readers = createReaders({
      queryBusinessRecords: vi.fn(async () => ({
        collectionPath: "channels/channel-1/orders",
        records: [
          {
            channelId: "channel-1",
            data: {
              active: true,
              customer: {
                name: "Acme",
              },
              id: "order-123",
              number: 123,
              status: "NEW",
            },
            id: "order-123",
            path: "channels/channel-1/orders/order-123",
            resource: "orders",
          },
        ],
      })),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "business:read"],
        },
      },
      readers,
    });

    const result = await queryFirestoreRecords(runtime, {
      channelName: "Main Store",
      limit: 1,
      orderBy: [{ direction: "desc", field: "createdAt" }],
      resource: "orders",
      where: [
        {
          field: "number",
          op: "==",
          value: 123,
        },
        {
          field: "createdAt",
          op: ">=",
          value: "2026-06-10T00:00:00.000Z",
        },
      ],
    });

    expect(readers.queryBusinessRecords).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 1,
      offset: 0,
      orderBy: [{ direction: "desc", field: "createdAt" }],
      resource: "orders",
      where: [
        {
          field: "number",
          op: "==",
          value: 123,
        },
        {
          field: "createdAt",
          op: ">=",
          value: new Date("2026-06-10T00:00:00.000Z"),
        },
      ],
    });
    expect(result).toMatchObject({
      collectionPath: "channels/channel-1/orders",
      limit: 1,
      page: 0,
      records: [
        {
          id: "order-123",
          path: "channels/channel-1/orders/order-123",
          resource: "orders",
        },
      ],
      resource: "orders",
      totalReturned: 1,
    });
    expect(result.records[0]?.data).toMatchObject({
      active: true,
      number: 123,
      status: "NEW",
    });
  });

  it("returns a validation error for Firestore queries that need missing indexes", async () => {
    const readers = createReaders({
      queryBusinessRecords: vi.fn(async () => {
        throw Object.assign(
          new Error("The query requires a Firestore index."),
          {
            code: 9,
          },
        );
      }),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "business:read"],
        },
      },
      readers,
    });

    await expect(
      queryFirestoreRecords(runtime, {
        channelName: "Main Store",
        orderBy: [{ direction: "desc", field: "createdAt" }],
        resource: "orders",
        where: [
          {
            field: "status",
            op: "==",
            value: "NEW",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      status: 400,
    });
  });

  it("searches channel-scoped business resources by channel name", async () => {
    const readers = createReaders({
      listBusinessRecords: vi.fn(async () => [
        {
          channelId: "channel-1",
          data: {
            enabled: true,
            id: "express",
            percent: 25,
          },
          id: "express",
          path: "channels/channel-1/settings/express",
          resource: "channelSettings",
        },
      ]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "business:read"],
        },
      },
      readers,
    });

    const result = await searchBusinessRecords(runtime, {
      channelName: "Main Store",
      resource: "channelSettings",
    });

    expect(readers.listBusinessRecords).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 10,
      resource: "channelSettings",
    });
    expect(result.records[0]).toMatchObject({
      channelId: "channel-1",
      fields: {
        enabled: true,
        percent: 25,
      },
      id: "express",
      label: "express",
      resource: "channelSettings",
    });
  });

  it("returns sanitized business record details", async () => {
    const readers = createReaders({
      getBusinessRecord: vi.fn(async () => ({
        data: {
          auth: {
            tokenValue: "secret-token",
            type: "bearer",
          },
          headers: {
            Authorization: "Bearer secret-token",
          },
          id: "provider-1",
          name: "Supplier API",
        },
        id: "provider-1",
        path: "externalProviders/provider-1",
        resource: "externalProviders",
      })),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "business:read"],
        },
      },
      readers,
    });

    const result = await getBusinessRecord(runtime, {
      recordId: "provider-1",
      resource: "externalProviders",
    });
    const serialized = JSON.stringify(result);

    expect(result.record).toMatchObject({
      id: "provider-1",
      label: "Supplier API",
      path: "externalProviders/provider-1",
    });
    expect(serialized).not.toContain("secret-token");
    expect(serialized).toContain("[redacted]");
  });

  it("requires business read scope before listing business records", async () => {
    const readers = createReaders();
    const { runtime } = createRuntime({ readers });

    await expect(
      searchBusinessRecords(runtime, {
        resource: "campaigns",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      status: 403,
    });
    expect(readers.listBusinessRecords).not.toHaveBeenCalled();
  });

  it("uses a normalized channel name when searching products", async () => {
    const readers = createReaders({
      listChannels: vi.fn(async () => [
        createChannel({ id: "channel-1", name: "Main Store" }),
        createChannel({ id: "channel-2", name: "Sklep Łódź" }),
      ]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          channelIds: ["channel-1", "channel-2"],
        },
      },
      readers,
    });

    await searchProducts(runtime, {
      channelName: "sklep lodz",
      query: "cards",
    });

    expect(readers.searchProducts).toHaveBeenCalledWith({
      channelId: "channel-2",
      limit: 10,
      query: "cards",
    });
  });

  it("lists active products with pagination metadata", async () => {
    const readers = createReaders({
      listProducts: vi.fn(async () => [
        createProduct({ id: "product-1", name: "Business cards" }),
        createProduct({ id: "product-2", name: "Flyers" }),
        createProduct({ id: "product-3", name: "Posters" }),
      ]),
    });
    const { runtime } = createRuntime({ readers });

    const result = await listProducts(runtime, {
      channelName: "main store",
      limit: 2,
    });

    expect(readers.listProducts).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 3,
      offset: 0,
    });
    expect(result).toMatchObject({
      limit: 2,
      nextPage: 1,
      page: 0,
      products: [
        expect.objectContaining({
          id: "product-1",
          name: "Business cards",
        }),
        expect.objectContaining({
          id: "product-2",
          name: "Flyers",
        }),
      ],
      totalReturned: 2,
    });
  });

  it("lists product price rows with pagination metadata", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.MATRIX }),
      ),
      listProductPriceRows: vi.fn(async () => [
        createProductPriceRow({ id: "row-3" }),
        createProductPriceRow({ id: "row-2" }),
        createProductPriceRow({ id: "row-1" }),
      ]),
    });
    const { runtime } = createRuntime({ readers });

    const result = await listProductPriceRows(runtime, {
      channelName: "main store",
      limit: 2,
      productId: "product-1",
    });

    expect(readers.listProductPriceRows).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 3,
      offset: 0,
      productId: "product-1",
      table: "prices",
    });
    expect(result).toMatchObject({
      channelId: "channel-1",
      limit: 2,
      nextPage: 1,
      page: 0,
      priceType: PriceTypeEnum.MATRIX,
      productId: "product-1",
      rows: [
        expect.objectContaining({ id: "row-3" }),
        expect.objectContaining({ id: "row-2" }),
      ],
      table: "prices",
      totalReturned: 2,
    });
  });

  it("lists alternate page-count price row tables", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.MATRIX }),
      ),
      listProductPriceRows: vi.fn(async () => [
        createProductPriceRow({
          calculatedCombination: "paper:matte-350",
          id: "32__paper:matte-350",
          pageCount: 32,
        }),
      ]),
    });
    const { runtime } = createRuntime({ readers });

    const result = await listProductPriceRows(runtime, {
      channelId: "channel-1",
      productId: "product-1",
      table: "pageCountPrices",
    });

    expect(readers.listProductPriceRows).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 51,
      offset: 0,
      productId: "product-1",
      table: "pageCountPrices",
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        calculatedCombination: "paper:matte-350",
        id: "32__paper:matte-350",
        pageCount: 32,
      }),
    ]);
  });

  it("requires product existence before listing product price rows", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () => null),
    });
    const { runtime } = createRuntime({ readers });

    await expect(
      listProductPriceRows(runtime, {
        channelId: "channel-1",
        productId: "missing-product",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
    expect(readers.listProductPriceRows).not.toHaveBeenCalled();
  });

  it("requires pricing scope before listing product price rows", async () => {
    const readers = createReaders();
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: ["products:read"],
        },
      },
      readers,
    });

    await expect(
      listProductPriceRows(runtime, {
        channelId: "channel-1",
        productId: "product-1",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      status: 403,
    });
    expect(readers.getProduct).not.toHaveBeenCalled();
    expect(readers.listProductPriceRows).not.toHaveBeenCalled();
  });

  it("asks for a channel name when multiple authorized channels are available", async () => {
    const readers = createReaders({
      listChannels: vi.fn(async () => [
        createChannel({ id: "channel-1", name: "Main Store" }),
        createChannel({ id: "channel-2", name: "Wholesale" }),
      ]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          channelIds: ["channel-1", "channel-2"],
        },
      },
      readers,
    });

    await expect(
      searchProducts(runtime, {
        query: "cards",
      }),
    ).rejects.toMatchObject({
      code: "channel_required",
      details: {
        suggestedInput: "channelName",
      },
      status: 400,
    });
    expect(readers.searchProducts).not.toHaveBeenCalled();
  });

  it("enforces channel access before searching products", async () => {
    const readers = createReaders();
    const { auditEvents, runtime } = createRuntime({ readers });

    await expect(
      searchProducts(runtime, {
        channelId: "channel-2",
        query: "cards",
      }),
    ).rejects.toBeInstanceOf(ToolLayerError);

    expect(readers.searchProducts).not.toHaveBeenCalled();
    expect(auditEvents[0]?.authorization.denialReason).toBe("channel_denied");
  });

  it("suggests configured order items with product and pricing scopes", async () => {
    const readers = createReaders({
      listAttributes: vi.fn(async () => [createAttribute()]),
    });
    const { auditEvents, runtime } = createRuntime({ readers });

    const result = await suggestOrderItems(runtime, {
      channelId: "channel-1",
      query: "100 business cards",
    });

    expect(mockSuggestOrderItemsFromCatalog).toHaveBeenCalledWith({
      attributes: [expect.objectContaining({ id: "paper" })],
      channelId: "channel-1",
      limit: 20,
      query: "100 business cards",
    });
    expect(result).toMatchObject({
      catalogCandidateCount: 1,
      count: 1,
      items: [expect.objectContaining({ productId: "product-1" })],
      totalAvailable: 1,
    });
    expect(auditEvents[0]).toMatchObject({
      status: "success",
      tool: {
        name: "suggestOrderItems",
        outputSummary: {
          catalogCandidateCount: 1,
          count: 1,
          totalAvailable: 1,
        },
      },
    });
  });

  it("passes channel tenant context when suggesting order items", async () => {
    const readers = createReaders({
      listAttributes: vi.fn(async () => [createAttribute()]),
      listChannels: vi.fn(async () => [
        createChannel({ id: "channel-1", tenantId: "tenant-a" }),
      ]),
    });
    const { runtime } = createRuntime({ readers });

    await suggestOrderItems(runtime, {
      channelId: "channel-1",
      query: "100 business cards",
    });

    expect(mockSuggestOrderItemsFromCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        tenantId: "tenant-a",
      }),
    );
  });

  it("requires pricing scope before suggesting order items", async () => {
    const readers = createReaders();
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: ["products:read"],
        },
      },
      readers,
    });

    await expect(
      suggestOrderItems(runtime, {
        channelId: "channel-1",
        query: "100 business cards",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      status: 403,
    });
    expect(readers.listAttributes).not.toHaveBeenCalled();
  });

  it("returns redacted customer summaries", async () => {
    const { auditEvents, runtime } = createRuntime();

    const customer = await getCustomer(runtime, { customerId: "customer-1" });
    const serialized = JSON.stringify(customer);

    expect(customer.contacts[0]).toMatchObject({
      hasEmail: true,
      hasPhone: true,
      name: "Buyer",
    });
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("+48123456789");
    expect(auditEvents[0]?.status).toBe("success");
  });

  it("returns order summaries without raw document fields", async () => {
    const readers = createReaders({
      getOrder: vi.fn(async () =>
        createOrder({
          activities: [{ message: "private activity" }],
          mailLink: "https://example.com/pay",
        } as Partial<Order>),
      ),
    });
    const { runtime } = createRuntime({ readers });

    const order = await getOrder(runtime, {
      channelId: "channel-1",
      orderId: "order-1",
    });
    const serialized = JSON.stringify(order);

    expect(order).toMatchObject({
      id: "order-1",
      number: 42,
      totalPrice: 1000,
    });
    expect(serialized).not.toContain("mailLink");
    expect(serialized).not.toContain("https://example.com/pay");
    expect(serialized).not.toContain("private activity");
  });

  it("returns product summaries without provider internals", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({
          keywords: ["secret-provider-keyword"],
          provider: {
            productId: "provider-product-1",
            type: "EXTERNAL_PROVIDER",
          },
          specialNotes: "Do not expose this supplier note",
        }),
      ),
    });
    const { runtime } = createRuntime({ readers });

    const product = await getProduct(runtime, {
      channelId: "channel-1",
      productId: "product-1",
    });
    const serialized = JSON.stringify(product);

    expect(product).toMatchObject({
      id: "product-1",
      name: "Business cards",
      priceRowCount: 1,
    });
    expect(serialized).not.toContain("provider-product-1");
    expect(serialized).not.toContain("EXTERNAL_PROVIDER");
    expect(serialized).not.toContain("secret-provider-keyword");
    expect(serialized).not.toContain("supplier note");
  });

  it("returns dynamic pricing config with linked presets", async () => {
    const config = createDynamicPricingConfig({
      linkedPresetIds: ["preset-1"],
      globalRules: [
        {
          calculator: "fixed",
          fixedValue: 500,
          id: "setup-fee",
          label: "Setup fee",
          target: "price",
        },
      ],
    });
    const readers = createReaders({
      getDynamicPricingPresetsByIds: vi.fn(async () => [
        {
          description: "Setup cost",
          globalRule: config.globalRules[0],
          id: "preset-1",
          kind: "global",
          label: "Setup fee",
        },
      ]),
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.DYNAMIC }),
      ),
      getProductDynamicPricing: vi.fn(async () => config),
    });
    const { runtime } = createRuntime({ readers });

    const result = await getProductDynamicPricingConfig(runtime, {
      channelId: "channel-1",
      includeLinkedPresets: true,
      productId: "product-1",
    });

    expect(readers.getProductDynamicPricing).toHaveBeenCalledWith({
      channelId: "channel-1",
      productId: "product-1",
    });
    expect(readers.getDynamicPricingPresetsByIds).toHaveBeenCalledWith({
      channelId: "channel-1",
      presetIds: ["preset-1"],
    });
    expect(result).toMatchObject({
      channelId: "channel-1",
      config,
      linkedPresets: [
        {
          id: "preset-1",
          kind: "global",
        },
      ],
      notes: [],
      priceType: PriceTypeEnum.DYNAMIC,
      productId: "product-1",
    });
  });

  it("returns null dynamic pricing config for DYNAMIC products without config", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.DYNAMIC }),
      ),
      getProductDynamicPricing: vi.fn(async () => null),
    });
    const { runtime } = createRuntime({ readers });

    const result = await getProductDynamicPricingConfig(runtime, {
      channelId: "channel-1",
      productId: "product-1",
    });

    expect(result).toMatchObject({
      config: null,
      notes: [],
      priceType: PriceTypeEnum.DYNAMIC,
    });
  });

  it("rejects non-DYNAMIC products without orphan dynamic pricing config", async () => {
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.MATRIX }),
      ),
      getProductDynamicPricing: vi.fn(async () => null),
    });
    const { runtime } = createRuntime({ readers });

    await expect(
      getProductDynamicPricingConfig(runtime, {
        channelId: "channel-1",
        productId: "product-1",
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      status: 400,
    });
  });

  it("returns orphan dynamic pricing config for non-DYNAMIC products with a note", async () => {
    const config = createDynamicPricingConfig();
    const readers = createReaders({
      getProduct: vi.fn(async () =>
        createProduct({ priceType: PriceTypeEnum.MATRIX }),
      ),
      getProductDynamicPricing: vi.fn(async () => config),
    });
    const { runtime } = createRuntime({ readers });

    const result = await getProductDynamicPricingConfig(runtime, {
      channelId: "channel-1",
      productId: "product-1",
    });

    expect(result).toMatchObject({
      config,
      notes: [
        "This product is not DYNAMIC, but an orphan dynamic pricing config exists.",
      ],
      priceType: PriceTypeEnum.MATRIX,
    });
  });

  it("returns a product configuration schema for client-side agent state", async () => {
    const product = createProduct({
      attributeOptions: {
        paper: ["matte-350", "hidden-supplier"],
      },
      attributes: ["paper"],
      prices: [
        {
          combination: {
            active: true,
            customFormat: false,
            id: "paper:matte-350",
          },
          currency: CurrencyEnum.PLN,
          value: 1000,
        },
        {
          combination: {
            active: true,
            customFormat: false,
            id: "paper:matte-350",
          },
          currency: CurrencyEnum.PLN,
          value: 900,
        },
      ],
    });
    const readers = createReaders({
      getDynamicPricingAttributes: vi.fn(async () => [createAttribute()]),
      getProduct: vi.fn(async () => product),
    });
    const { runtime } = createRuntime({ readers });

    const schema = await getProductConfigurationSchema(runtime, {
      channelId: "channel-1",
      productId: "product-1",
    });

    expect(schema).toMatchObject({
      productId: "product-1",
      productName: "Business cards",
      pricingTool: {
        name: "explain_price",
      },
    });
    expect(schema.attributes).toEqual([
      expect.objectContaining({
        id: "paper",
        name: "Paper",
        options: [
          expect.objectContaining({
            label: "Matte 350g",
            value: "matte-350",
          }),
        ],
        required: true,
      }),
    ]);
    expect(schema.priceCombinations).toEqual([
      {
        id: "paper:matte-350",
        name: "paper:matte-350",
        priceRows: 2,
      },
    ]);
    expect(JSON.stringify(schema)).not.toContain("hidden-supplier");
  });

  it("returns admin draft schema guidance without persisting data", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });

    const schema = await getDraftSchema(runtime, { draftType: "quote" });

    expect(schema).toMatchObject({
      draftType: "quote",
      pricingFlow: {
        tools: [
          "suggest_order_items",
          "search_products",
          "get_product_configuration_schema",
          "explain_price",
        ],
      },
    });
    expect(
      schema.itemFields?.some((field) => field.name === "product.id"),
    ).toBe(true);
  });

  it("returns category draft schema guidance", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });

    const schema = await getDraftSchema(runtime, { draftType: "category" });

    expect(schema.draftType).toBe("category");
    expect(schema.fields).toContainEqual(
      expect.objectContaining({
        name: "name",
        required: true,
      }),
    );
    expect(schema.notes.join(" ")).toContain("does not create");
  });

  it("returns product type draft schema guidance", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });

    const schema = await getDraftSchema(runtime, { draftType: "productType" });

    expect(schema.draftType).toBe("productType");
    expect(schema.fields).toContainEqual(
      expect.objectContaining({
        name: "attributes",
        required: true,
      }),
    );
    expect(schema.notes.join(" ")).toContain("does not create");
  });

  it("returns Konfi drafting docs for product pricing structures", async () => {
    const readers = createReaders();
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
      readers,
    });

    const docs = await getKonfiDraftingDocs(runtime, { topic: "pricing" });

    expect(docs).toMatchObject({
      topic: "pricing",
      relatedTools: expect.arrayContaining([
        "get_product_configuration_schema",
        "explain_price",
      ]),
    });
    expect(docs.priceTypes?.map((guide) => guide.priceType)).toEqual([
      PriceTypeEnum.SINGLE,
      PriceTypeEnum.THRESHOLD,
      PriceTypeEnum.MATRIX,
      PriceTypeEnum.DYNAMIC,
    ]);
    expect(JSON.stringify(docs)).toContain("dynamicPricing");
    expect(JSON.stringify(docs)).toContain("combination.id");
    expect(readers.listAttributes).not.toHaveBeenCalled();
  });

  it("explains page-count products such as brochures", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });

    const docs = await getKonfiDraftingDocs(runtime, { topic: "pageCount" });
    const serialized = JSON.stringify(docs);

    expect(docs.topic).toBe("pageCount");
    expect(docs.relatedTools).toEqual(
      expect.arrayContaining([
        "get_product_configuration_schema",
        "explain_price",
      ]),
    );
    expect(serialized).toContain("brochures");
    expect(serialized).toContain("coverPages");
    expect(serialized).toContain("pricing.mode=exact");
    expect(serialized).toContain("item.pageCount");
  });

  it("covers specialized drafting docs topics", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });
    const topics = [
      "money",
      "configuration",
      "dependencies",
      "draftShapes",
      "customSize",
      "volume",
      "advancedFinishing",
      "blockedDrafts",
      "atomicChanges",
    ] as const;

    const docs = await Promise.all(
      topics.map((topic) => getKonfiDraftingDocs(runtime, { topic })),
    );
    const serialized = JSON.stringify(docs);

    expect(docs.every((doc) => doc.sections.length > 0)).toBe(true);
    expect(serialized).toContain("Price.value");
    expect(serialized).toContain("calculatedCombination");
    expect(serialized).toContain("attributeDependencies");
    expect(serialized).toContain("ProductAgentDraft");
    expect(serialized).toContain("customSize");
    expect(serialized).toContain("Price.volume.value");
    expect(serialized).toContain("ADVANCED_FINISHING");
    expect(serialized).toContain("blockedItems");
    expect(serialized).toContain("catalogChanges");
    expect(serialized).toContain("readyForCreate");
  });

  it("returns concrete drafting examples", async () => {
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
    });

    const docs = await getKonfiDraftingDocs(runtime, { topic: "examples" });
    const serialized = JSON.stringify(docs);

    expect(docs.examples?.length).toBeGreaterThanOrEqual(5);
    expect(docs.examples?.map((example) => example.title)).toEqual(
      expect.arrayContaining([
        "Configured Quote Or Order Item",
        "Matrix Product Price Rows",
        "Dynamic Page Count Product",
        "Blocked Product Draft",
        "Atomic Missing Option Draft",
        "Advanced Finishing Selection",
      ]),
    );
    expect(serialized).toContain("dynamicPricing");
    expect(serialized).toContain("attribute.option.add");
    expect(serialized).toContain("readyForCreate");
    expect(serialized).toContain("advancedAttributeSelections");
    expect(serialized).toContain("innerSheetVolume");
  });

  it("returns grounded draft resource options for product creation", async () => {
    const readers = createReaders({
      listAttributes: vi.fn(async () => [createAttribute()]),
      listCategories: vi.fn(async () => [createCategory()]),
      listProductTypes: vi.fn(async () => [createProductType()]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
      readers,
    });

    const resources = await getDraftResourceOptions(runtime, {
      channelName: "Main Store",
      draftType: "product",
    });

    expect(resources).toMatchObject({
      categories: [
        {
          id: "category-1",
          label: "Business cards",
        },
      ],
      channelId: "channel-1",
      draftType: "product",
      productTypes: [
        {
          attributeIds: ["paper"],
          id: "product-type-1",
          label: "Printed product",
        },
      ],
    });
    expect(resources.attributes?.[0]).toMatchObject({
      id: "paper",
      label: "Paper",
      options: [
        {
          label: "Matte 350g",
          value: "matte-350",
        },
      ],
    });
    expect(resources.enums.priceTypes?.map((option) => option.id)).toContain(
      PriceTypeEnum.DYNAMIC,
    );
    expect(resources.enums.units?.map((option) => option.id)).toContain(
      Unit.PCS,
    );
    expect(readers.listCategories).toHaveBeenCalledWith({
      channelId: "channel-1",
    });
  });

  it("returns grounded draft resource options for product type creation", async () => {
    const readers = createReaders({
      listAttributes: vi.fn(async () => [createAttribute()]),
      listCategories: vi.fn(async () => [createCategory()]),
      listProductTypes: vi.fn(async () => [createProductType()]),
    });
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:preview"],
        },
      },
      readers,
    });

    const resources = await getDraftResourceOptions(runtime, {
      channelName: "Main Store",
      draftType: "productType",
    });

    expect(resources).toMatchObject({
      channelId: "channel-1",
      draftType: "productType",
    });
    expect(resources.attributes?.[0]).toMatchObject({
      id: "paper",
      label: "Paper",
    });
    expect(readers.listAttributes).toHaveBeenCalledOnce();
    expect(readers.listCategories).not.toHaveBeenCalled();
    expect(readers.listProductTypes).not.toHaveBeenCalled();
  });

  it("saves a completed product draft into the task surface", async () => {
    const savedDrafts: SaveDraftRecordInput[] = [];
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async (input) => {
        savedDrafts.push(input);
        return { runId: "draft-run-1" };
      }),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [
            ...auth.permissions.scopes,
            "drafts:write",
            "products:write",
          ],
        },
      },
      writers,
    });

    const result = await saveDraft(runtime, {
      channelName: "Main Store",
      draft: {
        priceType: PriceTypeEnum.SINGLE,
        product: {
          name: "MCP business cards",
          priceType: PriceTypeEnum.SINGLE,
        },
        reviewSummary: "Ready for admin review.",
      },
      draftRunId: "draft-run-1",
      draftType: "product",
      summary: "Ready for admin review.",
      title: "MCP business cards draft",
    });

    expect(result).toEqual({
      channelId: "channel-1",
      draftType: "product",
      openUrl: "/catalog/products/create?agentRunId=draft-run-1",
      runId: "draft-run-1",
      status: "completed",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledOnce();
    expect(savedDrafts[0]).toMatchObject({
      channelId: "channel-1",
      draftType: "product",
      existingRunId: "draft-run-1",
      prompt: "MCP business cards draft",
      result: {
        collectedData: {
          readyForCreate: true,
        },
        readyForCreate: true,
      },
    });
    expect(
      (
        savedDrafts[0].result.collectedData as {
          draft: { product: { name: string } };
        }
      ).draft.product.name,
    ).toBe("MCP business cards");
  });

  it("saves a completed category draft into the task surface", async () => {
    const savedDrafts: SaveDraftRecordInput[] = [];
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async (input) => {
        savedDrafts.push(input);
        return { runId: "category-draft-1" };
      }),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [
            ...auth.permissions.scopes,
            "drafts:write",
            "products:write",
          ],
        },
      },
      writers,
    });

    const result = await saveDraft(runtime, {
      channelName: "Main Store",
      draft: {
        category: {
          description: "Large format print products.",
          name: "Large Format",
          seo: {
            slug: "Large Format",
          },
        },
      },
      draftType: "category",
      summary: "Ready for category review.",
      title: "Large Format category draft",
    });

    expect(result).toEqual({
      channelId: "channel-1",
      draftType: "category",
      openUrl: "/catalog?create=category&agentRunId=category-draft-1",
      runId: "category-draft-1",
      status: "completed",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledOnce();
    expect(savedDrafts[0]).toMatchObject({
      channelId: "channel-1",
      draftType: "category",
      prompt: "Large Format category draft",
      result: {
        categoryDraft: {
          category: {
            description: "Large format print products.",
            name: "Large Format",
            seo: {
              slug: "large-format",
            },
          },
          readyForCreate: true,
        },
        readyForCreate: true,
      },
    });
  });

  it("saves a completed product type draft into the task surface", async () => {
    const savedDrafts: SaveDraftRecordInput[] = [];
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async (input) => {
        savedDrafts.push(input);
        return { runId: "product-type-draft-1" };
      }),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [
            ...auth.permissions.scopes,
            "drafts:write",
            "products:write",
          ],
        },
      },
      writers,
    });

    const result = await saveDraft(runtime, {
      channelName: "Main Store",
      draft: {
        productType: {
          attributes: ["paper", { id: "finish", name: "Finish" }, "paper"],
          isShippable: true,
          name: "Large Format",
        },
      },
      draftType: "productType",
      summary: "Ready for product type review.",
      title: "Large Format product type draft",
    });

    expect(result).toEqual({
      channelId: "channel-1",
      draftType: "productType",
      openUrl:
        "/configuration/product-types?type=create-new&agentRunId=product-type-draft-1",
      runId: "product-type-draft-1",
      status: "completed",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledOnce();
    expect(savedDrafts[0]).toMatchObject({
      channelId: "channel-1",
      draftType: "productType",
      prompt: "Large Format product type draft",
      result: {
        productTypeDraft: {
          productType: {
            attributes: ["paper", "finish"],
            id: "largeFormat",
            isShippable: true,
            name: "Large Format",
          },
          readyForCreate: true,
        },
        readyForCreate: true,
      },
    });
  });

  it("saves atomic catalog changes for missing product options", async () => {
    const savedDrafts: SaveDraftRecordInput[] = [];
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async (input) => {
        savedDrafts.push(input);
        return { runId: "draft-run-1" };
      }),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [
            ...auth.permissions.scopes,
            "drafts:write",
            "products:write",
          ],
        },
      },
      writers,
    });

    await saveDraft(runtime, {
      channelName: "Main Store",
      draft: {
        missingOptions: [
          {
            attributeId: "paper",
            attributeName: "Paper",
            options: [
              {
                label: "Premium silk 350 gsm",
                value: "premium-silk-350",
              },
            ],
          },
        ],
        priceType: PriceTypeEnum.SINGLE,
        product: {
          attributeOptions: {
            paper: ["premium-silk-350"],
          },
          attributes: ["paper"],
          name: "MCP premium flyer",
          priceType: PriceTypeEnum.SINGLE,
        },
        reviewSummary: "Needs one catalog option before product creation.",
      },
      draftType: "product",
      summary: "Needs one catalog option before product creation.",
      title: "MCP premium flyer draft",
    });

    expect(writers.saveDraftRecord).toHaveBeenCalledOnce();

    const savedResult = savedDrafts[0].result as Record<string, unknown>;
    const collectedData = savedResult.collectedData as Record<string, unknown>;
    const productDraft = savedResult.productDraft as Record<string, unknown>;

    expect(savedResult).toMatchObject({
      catalogChangesVersion: 1,
      readyForCreate: false,
    });
    expect(collectedData).toMatchObject({
      catalogChanges: [
        {
          kind: "attribute.option.add",
          payload: {
            label: "Premium silk 350 gsm",
            value: "premium-silk-350",
          },
          status: "proposed",
          target: {
            attributeId: "paper",
            attributeName: "Paper",
          },
        },
      ],
      catalogChangesVersion: 1,
      catalogSetupPlan: {
        options: [
          {
            attributeId: "paper",
            attributeName: "Paper",
            options: [
              {
                label: "Premium silk 350 gsm",
                value: "premium-silk-350",
              },
            ],
          },
        ],
      },
      readyForCreate: false,
    });
    expect(productDraft).toMatchObject({
      catalogChangesVersion: 1,
      readyForCreate: false,
    });
  });

  it.each(["quote", "order"] as const)(
    "lets normal admins save %s drafts with draft write scope",
    async (draftType) => {
      const savedDrafts: SaveDraftRecordInput[] = [];
      const writers: ToolLayerWriters = {
        saveDraftRecord: vi.fn(async (input) => {
          savedDrafts.push(input);
          return { runId: "draft-run-1" };
        }),
      };
      const { runtime } = createRuntime({
        auth: {
          ...auth,
          permissions: {
            ...auth.permissions,
            isAdmin: true,
            isSuperAdmin: false,
            scopes: [...auth.permissions.scopes, "drafts:write"],
          },
        },
        writers,
      });

      const result = await saveDraft(runtime, {
        channelName: "Main Store",
        draft: {
          items: [
            {
              id: "item-1",
            },
          ],
        },
        draftType,
      });

      expect(result).toMatchObject({
        channelId: "channel-1",
        draftType,
        runId: "draft-run-1",
        status: "completed",
      });
      expect(result.openUrl).toBe(
        draftType === "quote"
          ? "/quotes/create?agentRunId=draft-run-1"
          : "/orders/create?agentRunId=draft-run-1",
      );
      expect(writers.saveDraftRecord).toHaveBeenCalledOnce();
      expect(savedDrafts[0]).toMatchObject({
        draftType,
      });
    },
  );

  it("requires product write scope before saving product drafts", async () => {
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "draft-run-1" })),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:write"],
        },
      },
      writers,
    });

    await expect(
      saveDraft(runtime, {
        channelId: "channel-1",
        draft: {
          priceType: PriceTypeEnum.SINGLE,
          product: {
            name: "MCP business cards",
            priceType: PriceTypeEnum.SINGLE,
          },
        },
        draftType: "product",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      requiredScopes: ["products:write"],
      status: 403,
    });
    expect(writers.saveDraftRecord).not.toHaveBeenCalled();
  });

  it("requires product write scope before saving product type drafts", async () => {
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "draft-run-1" })),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [...auth.permissions.scopes, "drafts:write"],
        },
      },
      writers,
    });

    await expect(
      saveDraft(runtime, {
        channelId: "channel-1",
        draft: {
          productType: {
            attributes: ["paper"],
            name: "Large Format",
          },
        },
        draftType: "productType",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      requiredScopes: ["products:write"],
      status: 403,
    });
    expect(writers.saveDraftRecord).not.toHaveBeenCalled();
  });

  it("rejects product type drafts without attribute ids", async () => {
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "draft-run-1" })),
    };
    const { runtime } = createRuntime({
      auth: {
        ...auth,
        permissions: {
          ...auth.permissions,
          scopes: [
            ...auth.permissions.scopes,
            "drafts:write",
            "products:write",
          ],
        },
      },
      writers,
    });

    await expect(
      saveDraft(runtime, {
        channelId: "channel-1",
        draft: {
          productType: {
            attributes: [{ name: "Paper" }],
            name: "Large Format",
          },
        },
        draftType: "productType",
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      status: 400,
    });
    expect(writers.saveDraftRecord).not.toHaveBeenCalled();
  });

  it("requires draft write scope before saving drafts", async () => {
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "draft-run-1" })),
    };
    const { runtime } = createRuntime({ writers });

    await expect(
      saveDraft(runtime, {
        channelId: "channel-1",
        draft: {
          items: [
            {
              id: "item-1",
            },
          ],
        },
        draftType: "quote",
      }),
    ).rejects.toMatchObject({
      code: "missing_scope",
      status: 403,
    });
    expect(writers.saveDraftRecord).not.toHaveBeenCalled();
  });

  it("returns not found for missing resources", async () => {
    const readers = createReaders({
      getOrder: vi.fn(async () => null),
    });
    const { auditEvents, runtime } = createRuntime({ readers });

    await expect(
      getOrder(runtime, { channelId: "channel-1", orderId: "missing-order" }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });

    expect(auditEvents[0]).toMatchObject({
      errorCode: "not_found",
      tool: {
        inputSummary: {
          channelId: "channel-1",
          orderId: "missing-order",
        },
      },
    });
  });

  it("explains product prices through the shared pricing utility", async () => {
    const { runtime } = createRuntime();

    const result = await explainProductPrice(runtime, {
      channelId: "channel-1",
      customFormat: false,
      productId: "product-1",
      quantity: 2,
    });

    expect(result).toMatchObject({
      channelId: "channel-1",
      productId: "product-1",
      priceType: PriceTypeEnum.SINGLE,
      pricesConsidered: 1,
      quantity: 2,
    });
    expect(result.result).toBeGreaterThan(0);
    expect(result.formattedPrice).toBeTruthy();
  });
});
