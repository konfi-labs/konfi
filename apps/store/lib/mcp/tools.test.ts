import type { Attribute, Category, Order, Product } from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreMcpToolError } from "./errors";
import {
  getProductConfigurationSchema,
  listCategorySchemas,
  listCustomerOrders,
  searchProducts,
} from "./tools";
import type { StoreMcpRuntime } from "./types";

vi.mock("server-only", () => ({}));

function createProduct(overrides: Partial<Product> = {}): Product {
  return {
    active: true,
    allowCustomPrice: false,
    attributeOptions: {
      paper: ["matte", "secret"],
    },
    attributes: ["paper"],
    availability: {
      availableForPurchase: true,
      published: true,
      publication: {
        toDate: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    category: {
      active: true,
      id: "cat-1",
      name: "Business cards",
    },
    customSize: false,
    defaultPrice: {
      currency: "PLN",
      value: 1000,
    },
    description: "Printed business cards.",
    difficulty: 1,
    highPrice: {
      currency: "PLN",
      value: 2000,
    },
    id: "product-1",
    keywords: [],
    linkedChannels: [],
    linkedWarehouses: [],
    lowPrice: {
      currency: "PLN",
      value: 1000,
    },
    name: "Business cards",
    prefferedUnit: "PCS",
    priceType: "SINGLE",
    prices: [
      {
        currency: "PLN",
        value: 1000,
        volume: {
          label: "100 pcs",
          value: 100,
        },
      },
    ],
    productType: null,
    recommended: true,
    seo: {
      description: "Business cards",
      slug: "business-cards",
      title: "Business cards",
    },
    shipping: {
      types: [],
    },
    spec: {
      defaultOrder: 100,
      images: ["image-1.jpg"],
      maximumOrder: 10_000,
      minimumOrder: 100,
      step: 100,
    },
    threeDModel: null,
    volumes: [],
    ...overrides,
  } as unknown as Product;
}

function createAttribute(overrides: Partial<Attribute> = {}): Attribute {
  return {
    active: true,
    calculated: false,
    createdAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
    createdBy: {
      id: "system",
      name: "System",
    },
    format: false,
    id: "paper",
    keywords: [],
    name: "Paper",
    options: [
      {
        customFormat: false,
        hidden: false,
        label: "Matte",
        value: "matte",
      },
      {
        customFormat: false,
        hidden: true,
        label: "Secret",
        value: "secret",
      },
    ],
    required: true,
    trackStock: false,
    type: "DROPDOWN",
    updatedAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
    updatedBy: {
      id: "system",
      name: "System",
    },
    ...overrides,
  } as unknown as Attribute;
}

function createCategory(overrides: Partial<Category> = {}): Category {
  return {
    createdAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
    createdBy: {
      id: "system",
      name: "System",
    },
    id: "cat-1",
    keywords: [],
    name: "Business cards",
    seo: {
      description: "Business cards",
      slug: "business-cards",
      title: "Business cards",
    },
    tenantId: "tenant-1",
    updatedAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
    updatedBy: {
      id: "system",
      name: "System",
    },
    ...overrides,
  } as unknown as Category;
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
    items: [
      {
        combination: null,
        customFormat: false,
        customPrice: null,
        description: "Business cards",
        discount: {
          type: "FIXED",
          value: 0,
        },
        id: "item-1",
        name: "Business cards",
        product: {
          id: "product-1",
          name: "Business cards",
          prefferedUnit: "PCS",
          priceType: "SINGLE",
          spec: {
            images: [],
          },
        },
        quantity: 100,
        totalPrice: 1000,
        unit: "PCS",
      },
    ],
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

function createRuntime(
  input: {
    attributes?: Attribute[];
    categories?: Category[];
    orders?: Order[];
    products?: Product[];
    scopes?: StoreMcpRuntime["auth"]["permissions"]["scopes"];
  } = {},
): StoreMcpRuntime {
  const products = input.products ?? [createProduct()];
  const product = products[0] ?? createProduct();
  const scopes = input.scopes ?? [
    "store:context",
    "store:catalog:read",
    "store:orders:read",
  ];

  return {
    auth: {
      actor: {
        kind: "customer",
        uid: "customer-1",
      },
      permissions: {
        scopes,
      },
      request: {
        requestId: "request-1",
        source: "store-mcp",
      },
      token: {
        expiresAtMs: Date.now() + 60_000,
        scopes,
      },
    },
    readers: {
      getCustomerOrder: vi.fn(),
      getProduct: vi.fn().mockResolvedValue({
        product,
        sourceChannelId: "channel-1",
        targetChannelId: "channel-1",
      }),
      listAttributes: vi
        .fn()
        .mockResolvedValue(input.attributes ?? [createAttribute()]),
      listCategories: vi.fn().mockResolvedValue(input.categories ?? []),
      listCustomerOrders: vi.fn().mockResolvedValue(input.orders ?? []),
      searchProducts: vi.fn().mockResolvedValue(
        products.map((catalogProduct) => ({
          product: catalogProduct,
          sourceChannelId: "channel-1",
          targetChannelId: "channel-1",
        })),
      ),
    },
  };
}

describe("store MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_STORE_URL = "example.com";
  });

  it("returns public product search results with catalog scope", async () => {
    const runtime = createRuntime();

    const result = await searchProducts(runtime, {
      query: "cards",
    });

    expect(result.products).toEqual([
      expect.objectContaining({
        id: "product-1",
        name: "Business cards",
        url: "https://example.com/products/business-cards",
      }),
    ]);
  });

  it("filters hidden product configuration options", async () => {
    const runtime = createRuntime();

    const result = await getProductConfigurationSchema(runtime, {
      productId: "product-1",
    });

    expect(result.attributes).toEqual([
      expect.objectContaining({
        id: "paper",
        options: [
          expect.objectContaining({
            label: "Matte",
            value: "matte",
          }),
        ],
      }),
    ]);
  });

  it("returns category schemas with hierarchy and aggregated attributes", async () => {
    const rootCategory = createCategory({
      id: "stickers",
      name: "Naklejki i etykiety",
      seo: {
        description: "Naklejki i etykiety",
        slug: "naklejki-i-etykiety",
        title: "Naklejki i etykiety",
      },
    });
    const childCategory = createCategory({
      id: "foil-stickers",
      name: "Foliowe",
      parentId: "stickers",
      seo: {
        description: "Foliowe",
        slug: "foliowe",
        title: "Foliowe",
      },
    });
    const foilProduct = createProduct({
      attributes: ["material", "finish"],
      category: {
        id: "foil-stickers",
        name: "Foliowe",
        parentId: "stickers",
      },
      id: "foil-product",
      name: "Naklejki foliowe",
    });
    const runtime = createRuntime({
      attributes: [
        createAttribute({ id: "material", name: "Materiał" }),
        createAttribute({ id: "finish", name: "Uszlachetnienie" }),
      ],
      categories: [rootCategory, childCategory],
      products: [foilProduct],
    });

    const result = await listCategorySchemas(runtime, {});

    expect(result.categorySchemas).toEqual([
      expect.objectContaining({
        attributeIds: ["finish", "material"],
        depth: 0,
        id: "stickers",
        kind: "category",
        path: [{ id: "stickers", name: "Naklejki i etykiety" }],
        productCount: 1,
        productIds: ["foil-product"],
      }),
      expect.objectContaining({
        attributeIds: ["finish", "material"],
        depth: 1,
        id: "foil-stickers",
        kind: "subcategory",
        parentId: "stickers",
        path: [
          { id: "stickers", name: "Naklejki i etykiety" },
          { id: "foil-stickers", name: "Foliowe" },
        ],
        productCount: 1,
      }),
    ]);
    expect(result.categorySchemas[1]?.attributes).toEqual([
      expect.objectContaining({ id: "finish", name: "Uszlachetnienie" }),
      expect.objectContaining({ id: "material", name: "Materiał" }),
    ]);
  });

  it("requires order scope for customer order lists", async () => {
    const runtime = createRuntime({
      scopes: ["store:context", "store:catalog:read"],
    });

    await expect(listCustomerOrders(runtime, {})).rejects.toMatchObject({
      code: "missing_scope",
    } satisfies Partial<StoreMcpToolError>);
  });

  it("lists orders for the OAuth-authorized store customer", async () => {
    const runtime = createRuntime({
      orders: [createOrder()],
    });

    const result = await listCustomerOrders(runtime, {});

    expect(runtime.readers.listCustomerOrders).toHaveBeenCalledWith({
      customerId: "customer-1",
      limit: 10,
    });
    expect(result.orders).toEqual([
      expect.objectContaining({
        id: "order-1",
        itemCount: 1,
        totalPrice: 1000,
      }),
    ]);
  });
});
