import { describe, expect, it, vi } from "vitest";
import {
  type Attribute,
  type Channel,
  CurrencyEnum,
  type Customer,
  type DynamicPricingConfig,
  type DynamicPricingPreset,
  type Order,
  PriceTypeEnum,
  type Product,
  Unit,
} from "@konfi/types";
import { handleMcpStreamableHttpRequest } from "./protocol";
import type {
  ToolAuthContext,
  ToolLayerReaders,
  ToolLayerRuntime,
  ToolLayerWriters,
} from "../tool-layer";

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
    kind: "oauth-user",
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

type JsonRpcResponse = {
  error?: {
    code: number;
    message: string;
  };
  id: number | string | null;
  jsonrpc: "2.0";
  result?: Record<string, unknown>;
};

function createReaders(): ToolLayerReaders {
  return {
    getAttributeOptionCosts: vi.fn(async () => []),
    listChannels: vi.fn(async () => [
      {
        active: true,
        createdAt: new Date() as Channel["createdAt"],
        createdBy: {
          id: "user-1",
          name: "Admin",
        },
        currency: "PLN",
        id: "channel-1",
        name: "Main Store",
        updatedAt: new Date() as Channel["updatedAt"],
        updatedBy: {
          id: "user-1",
          name: "Admin",
        },
        warehouses: [],
      } as Channel,
    ]),
    listAttributes: vi.fn(async () => [] as Attribute[]),
    listCategories: vi.fn(async () => []),
    getCustomer: vi.fn(async () => null as Customer | null),
    getCustomerOrders: vi.fn(async () => [] as Order[]),
    getDynamicPricingAttributes: vi.fn(async () => [] as Attribute[]),
    getDynamicPricingPresetsByIds: vi.fn(
      async () => [] as DynamicPricingPreset[],
    ),
    getBusinessRecord: vi.fn(async () => null),
    getDraftRecord: vi.fn(async () => null),
    getOrder: vi.fn(async () => null as Order | null),
    getOrderByNumber: vi.fn(async () => null as Order | null),
    getProduct: vi.fn(async () => null as Product | null),
    getProductCosts: vi.fn(async () => []),
    getProductDynamicPricing: vi.fn(
      async () => null as DynamicPricingConfig | null,
    ),
    listProductPriceRows: vi.fn(async () => []),
    listBusinessRecords: vi.fn(async () => []),
    listOrdersByIds: vi.fn(async () => [] as Order[]),
    listOrders: vi.fn(async () => [] as Order[]),
    listProducts: vi.fn(async () => [] as Product[]),
    listProductCostMappings: vi.fn(async () => []),
    listProductsByIds: vi.fn(async () => [] as Product[]),
    listProductTypes: vi.fn(async () => []),
    queryBusinessRecords: vi.fn(async () => ({
      collectionPath: "channels/channel-1/orders",
      records: [],
    })),
    searchCustomers: vi.fn(async () => [] as string[]),
    searchCostEvidence: vi.fn(async () => []),
    searchMaterialCostsByQuery: vi.fn(async () => ({
      baseCurrency: "PLN",
      matches: [],
      noResultReason:
        "No approved indexed Fakturownia cost matched this query.",
      query: "folia bąbelkowa",
      summary: {
        sampleCount: 0,
      },
      totalReturned: 0,
    })),
    searchOrders: vi.fn(async () => ({ orderIds: [], totalHits: 0 })),
    searchProducts: vi.fn(async () => [] as string[]),
  };
}

function createRuntime(
  readers: ToolLayerReaders = createReaders(),
  options: {
    auth?: ToolAuthContext;
    writers?: ToolLayerWriters;
  } = {},
) {
  return {
    auth: options.auth ?? auth,
    readers,
    ...(options.writers ? { writers: options.writers } : {}),
  } satisfies ToolLayerRuntime;
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    active: true,
    channelId: "channel-1",
    createdAt: new Date("2026-06-10T10:00:00.000Z"),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    currency: "PLN",
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
    updatedAt: new Date("2026-06-10T10:00:00.000Z"),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    ...overrides,
  } as Order;
}

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
    createdAt: new Date("2026-06-10T10:00:00.000Z"),
    createdBy: {
      id: "user-1",
      name: "Admin",
    },
    customSize: false,
    defaultPrice: {
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
    lowPrice: {
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    name: "Business cards",
    prefferedUnit: Unit.PCS,
    priceType: PriceTypeEnum.MATRIX,
    prices: [],
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
    updatedAt: new Date("2026-06-10T10:00:00.000Z"),
    updatedBy: {
      id: "user-1",
      name: "Admin",
    },
    volumes: [],
    ...overrides,
  } as Product;
}

function createDynamicPricingConfig(
  overrides: Partial<DynamicPricingConfig> = {},
): DynamicPricingConfig {
  return {
    attributeRules: [],
    basePrice: 1000,
    enabled: true,
    globalRules: [],
    inputs: [],
    linkedPresetIds: [],
    ...overrides,
  };
}

function createMcpPostRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request("https://admin.example.com/mcp", {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

async function readMcpResponse(response: Response): Promise<JsonRpcResponse> {
  return (await response.json()) as JsonRpcResponse;
}

function expectResultObject(
  response: JsonRpcResponse,
): Record<string, unknown> {
  expect(response.result).toBeTruthy();
  return response.result ?? {};
}

describe("MCP Streamable HTTP protocol", () => {
  it("exposes read-only tools through Streamable HTTP tools/list", async () => {
    const response = await handleMcpStreamableHttpRequest(
      createRuntime(),
      createMcpPostRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);
    const tools = result.tools as {
      annotations?: Record<string, unknown>;
      inputSchema?: Record<string, unknown>;
      name: string;
    }[];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "get_current_user_context",
        "list_channels",
        "list_business_resources",
        "search_business_records",
        "query_firestore_records",
        "get_business_record",
        "save_business_update_draft",
        "search_orders",
        "list_orders",
        "get_order",
        "get_order_by_number",
        "list_products",
        "search_products",
        "suggest_order_items",
        "get_product",
        "get_product_configuration_schema",
        "list_product_price_rows",
        "get_product_dynamic_pricing_config",
        "get_draft_schema",
        "get_konfi_drafting_docs",
        "get_draft_resource_options",
        "save_draft",
        "get_saved_draft",
        "explain_price",
        "get_product_costs",
        "list_product_cost_mappings",
        "get_attribute_option_costs",
        "search_cost_evidence",
        "search_material_costs",
        "search_customers",
        "get_customer",
      ]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining(["get_active_channel", "set_active_channel"]),
    );
    expect(toolNames.join(" ")).not.toMatch(/delete|approve|refund|workflow/);
    expect(
      tools.find((tool) => tool.name === "save_business_update_draft"),
    ).toMatchObject({
      annotations: {
        readOnlyHint: false,
      },
      inputSchema: {
        properties: {
          draftRunId: {
            type: "string",
          },
        },
      },
    });
    expect(
      tools.find((tool) => tool.name === "query_firestore_records"),
    ).toMatchObject({
      inputSchema: {
        properties: {
          resource: {
            enum: expect.arrayContaining(["orders", "products"]),
          },
          where: {
            type: "array",
          },
        },
        required: ["resource"],
      },
    });
    expect(tools.find((tool) => tool.name === "save_draft")).toMatchObject({
      inputSchema: {
        properties: {
          draftRunId: {
            type: "string",
          },
          draftType: {
            enum: expect.arrayContaining(["category", "productType"]),
          },
        },
      },
    });
    expect(tools.find((tool) => tool.name === "get_saved_draft")).toMatchObject(
      {
        annotations: {
          destructiveHint: false,
          readOnlyHint: true,
        },
        inputSchema: {
          properties: {
            draftRunId: {
              type: "string",
            },
          },
          required: ["draftRunId"],
        },
      },
    );
    expect(tools.find((tool) => tool.name === "search_products")).toMatchObject(
      {
        inputSchema: {
          properties: {
            channelName: {
              type: "string",
            },
          },
          required: ["query"],
        },
      },
    );
    expect(tools.find((tool) => tool.name === "list_products")).toMatchObject({
      inputSchema: {
        properties: {
          page: {
            type: "number",
          },
        },
      },
    });
    expect(
      tools.find((tool) => tool.name === "list_product_price_rows"),
    ).toMatchObject({
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        properties: {
          table: {
            enum: expect.arrayContaining([
              "prices",
              "pageCountPrices",
              "pageCountSegmentStepPrices",
              "pageCountStepPrices",
            ]),
          },
        },
        required: ["productId"],
      },
    });
    expect(
      tools.find((tool) => tool.name === "get_product_dynamic_pricing_config"),
    ).toMatchObject({
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        properties: {
          includeLinkedPresets: {
            type: "boolean",
          },
        },
        required: ["productId"],
      },
    });
    expect(tools.find((tool) => tool.name === "list_orders")).toMatchObject({
      inputSchema: {
        properties: {
          page: {
            type: "number",
          },
        },
      },
    });
    expect(
      tools.find((tool) => tool.name === "get_order_by_number"),
    ).toMatchObject({
      inputSchema: {
        properties: {
          orderNumber: {
            type: "integer",
          },
        },
        required: ["orderNumber"],
      },
    });
    expect(
      tools.find((tool) => tool.name === "get_konfi_drafting_docs"),
    ).toMatchObject({
      inputSchema: {
        properties: {
          topic: {
            enum: expect.arrayContaining([
              "advancedFinishing",
              "blockedDrafts",
              "configuration",
              "customSize",
              "dependencies",
              "draftShapes",
              "examples",
              "money",
              "pageCount",
              "pricing",
              "product",
              "volume",
            ]),
          },
        },
      },
    });
    for (const toolName of [
      "get_product_costs",
      "list_product_cost_mappings",
      "get_attribute_option_costs",
      "search_cost_evidence",
      "search_material_costs",
    ]) {
      expect(tools.find((tool) => tool.name === toolName)).toMatchObject({
        annotations: {
          destructiveHint: false,
          readOnlyHint: true,
        },
      });
    }
  });

  it("requires Streamable HTTP POST Accept headers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await handleMcpStreamableHttpRequest(
      createRuntime(),
      createMcpPostRequest(
        {
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
        },
        { Accept: "application/json" },
      ),
    );
    const body = await readMcpResponse(response);

    expect(response.status).toBe(406);
    expect(body.error?.message).toContain(
      "Client must accept both application/json and text/event-stream",
    );
    warn.mockRestore();
  });

  it("returns user context without reading Firestore", async () => {
    const readers = createReaders();
    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-1",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {},
          name: "get_current_user_context",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(readers.getProduct).not.toHaveBeenCalled();
    expect(readers.searchOrders).not.toHaveBeenCalled();
  });

  it("searches material costs through the MCP tool", async () => {
    const readers = createReaders();
    vi.mocked(readers.searchMaterialCostsByQuery).mockResolvedValueOnce({
      baseCurrency: "PLN",
      matches: [
        {
          confidence: 0.94,
          currency: "PLN",
          distance: 0.09,
          evidenceId: "invoice-1-0",
          invoice: {
            id: "invoice-1",
            issueDate: "2026-02-01",
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
      query: "folia bąbelkowa",
      summary: {
        averageUnitCostNetBase: 80,
        latestIssueDate: "2026-02-01",
        latestUnitCostNetBase: 80,
        sampleCount: 1,
      },
      totalReturned: 1,
    });

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, {
        auth: {
          ...auth,
          permissions: {
            ...auth.permissions,
            scopes: [...auth.permissions.scopes, "costs:read"],
          },
        },
      }),
      createMcpPostRequest({
        id: "call-costs",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            limit: 5,
            query: "folia bąbelkowa",
          },
          name: "search_material_costs",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(readers.searchMaterialCostsByQuery).toHaveBeenCalledWith({
      limit: 5,
      query: "folia bąbelkowa",
    });
    expect(result.structuredContent).toMatchObject({
      baseCurrency: "PLN",
      summary: {
        latestUnitCostNetBase: 80,
      },
      totalReturned: 1,
    });
  });

  it("denies cross-channel tool calls before reader access", async () => {
    const readers = createReaders();
    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-2",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelId: "channel-2",
            query: "cards",
          },
          name: "search_products",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "channel_denied",
        status: 403,
      },
    });
    expect(readers.searchProducts).not.toHaveBeenCalled();
  });

  it("uses a channel name for channel-scoped calls", async () => {
    const readers = createReaders();
    const searchResponse = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-search",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            query: "cards",
          },
          name: "search_products",
        },
      }),
    );
    const searchBody = await readMcpResponse(searchResponse);
    const searchResult = expectResultObject(searchBody);

    expect(searchResult.isError).toBeUndefined();
    expect(readers.searchProducts).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 10,
      query: "cards",
    });
  });

  it("lists product price rows through the MCP tool", async () => {
    const readers = createReaders();
    vi.mocked(readers.getProduct).mockResolvedValueOnce(
      createProduct({ priceType: PriceTypeEnum.MATRIX }),
    );
    vi.mocked(readers.listProductPriceRows).mockResolvedValueOnce([
      {
        channelId: "channel-1",
        id: "row-1",
        prices: [
          {
            currency: CurrencyEnum.PLN,
            value: 1000,
          },
        ],
        productId: "product-1",
      },
    ]);

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-list-product-price-rows",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            limit: 1,
            productId: "product-1",
            table: "prices",
          },
          name: "list_product_price_rows",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      limit: 1,
      page: 0,
      priceType: PriceTypeEnum.MATRIX,
      productId: "product-1",
      rows: [
        {
          id: "row-1",
          prices: [
            {
              currency: CurrencyEnum.PLN,
              value: 1000,
            },
          ],
        },
      ],
      table: "prices",
      totalReturned: 1,
    });
    expect(readers.listProductPriceRows).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 2,
      offset: 0,
      productId: "product-1",
      table: "prices",
    });
  });

  it("returns dynamic pricing config through the MCP tool", async () => {
    const config = createDynamicPricingConfig({
      linkedPresetIds: ["preset-1"],
    });
    const readers = createReaders();
    vi.mocked(readers.getProduct).mockResolvedValueOnce(
      createProduct({ priceType: PriceTypeEnum.DYNAMIC }),
    );
    vi.mocked(readers.getProductDynamicPricing).mockResolvedValueOnce(config);
    vi.mocked(readers.getDynamicPricingPresetsByIds).mockResolvedValueOnce([
      {
        id: "preset-1",
        kind: "global",
        label: "Setup fee",
      },
    ]);

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-get-dynamic-pricing-config",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            includeLinkedPresets: true,
            productId: "product-1",
          },
          name: "get_product_dynamic_pricing_config",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      config: {
        basePrice: 1000,
        enabled: true,
        linkedPresetIds: ["preset-1"],
      },
      linkedPresets: [
        {
          id: "preset-1",
          kind: "global",
        },
      ],
      priceType: PriceTypeEnum.DYNAMIC,
      productId: "product-1",
    });
  });

  it("returns MCP error results for product pricing tool-layer errors", async () => {
    const readers = createReaders();
    vi.mocked(readers.getProduct).mockResolvedValueOnce(
      createProduct({ priceType: PriceTypeEnum.MATRIX }),
    );
    vi.mocked(readers.getProductDynamicPricing).mockResolvedValueOnce(null);

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-get-dynamic-pricing-config-error",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            productId: "product-1",
          },
          name: "get_product_dynamic_pricing_config",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "validation_error",
        status: 400,
      },
    });
  });

  it("runs bounded Firestore business resource queries through the MCP tool", async () => {
    const readers = createReaders();
    vi.mocked(readers.queryBusinessRecords).mockResolvedValueOnce({
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
    });
    const businessAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        scopes: [...auth.permissions.scopes, "business:read"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: businessAuth }),
      createMcpPostRequest({
        id: "call-query-firestore",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            limit: 1,
            resource: "orders",
            where: [
              {
                field: "number",
                op: "==",
                value: 123,
              },
            ],
          },
          name: "query_firestore_records",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      collectionPath: "channels/channel-1/orders",
      records: [
        {
          id: "order-123",
          path: "channels/channel-1/orders/order-123",
        },
      ],
      resource: "orders",
      totalReturned: 1,
    });
    expect(readers.queryBusinessRecords).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 1,
      offset: 0,
      orderBy: [],
      resource: "orders",
      where: [
        {
          field: "number",
          op: "==",
          value: 123,
        },
      ],
    });
  });

  it("lists newest orders through the MCP tool", async () => {
    const readers = createReaders();
    vi.mocked(readers.listOrders).mockResolvedValueOnce([
      createOrder({ id: "order-2", number: 102 }),
    ]);

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-list-orders",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            limit: 1,
          },
          name: "list_orders",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      limit: 1,
      page: 0,
      results: [
        {
          id: "order-2",
          number: 102,
        },
      ],
      totalReturned: 1,
    });
    expect(readers.listOrders).toHaveBeenCalledWith({
      channelId: "channel-1",
      limit: 1,
      offset: 0,
    });
  });

  it("fetches orders by visible number through the MCP tool", async () => {
    const readers = createReaders();
    vi.mocked(readers.getOrderByNumber).mockResolvedValueOnce(
      createOrder({ id: "order-123", number: 123 }),
    );

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-get-order-number",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            orderNumber: 123,
          },
          name: "get_order_by_number",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      id: "order-123",
      number: 123,
    });
    expect(readers.getOrderByNumber).toHaveBeenCalledWith({
      channelId: "channel-1",
      orderNumber: 123,
    });
  });

  it("saves business update drafts without directly mutating the record", async () => {
    const readers = createReaders();
    vi.mocked(readers.getBusinessRecord).mockResolvedValueOnce({
      channelId: "channel-1",
      data: {
        active: true,
        id: "product-1",
        name: "Old name",
      },
      id: "product-1",
      path: "channels/channel-1/products/product-1",
      resource: "products",
    });
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "update-draft-1" })),
    };
    const superAdminAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        isSuperAdmin: true,
        scopes: [
          ...auth.permissions.scopes,
          "business:read",
          "business:write",
          "drafts:write",
        ],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: superAdminAuth, writers }),
      createMcpPostRequest({
        id: "call-update-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            changes: [
              {
                path: "name",
                previousValue: "Old name",
                value: "New name",
              },
            ],
            channelName: "main store",
            draftRunId: "update-draft-1",
            recordId: "product-1",
            resource: "products",
            summary: "Rename the product after admin review.",
          },
          name: "save_business_update_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      openUrl: "/tools/tasks?runId=update-draft-1",
      recordId: "product-1",
      resource: "products",
      status: "completed",
    });
    expect(readers.getBusinessRecord).toHaveBeenCalledWith({
      channelId: "channel-1",
      recordId: "product-1",
      resource: "products",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        existingRunId: "update-draft-1",
        draftType: "businessUpdate",
        result: expect.objectContaining({
          businessUpdateDraft: expect.objectContaining({
            changes: [
              {
                path: "name",
                previousValue: "Old name",
                value: "New name",
              },
            ],
            readyForReview: true,
          }),
        }),
      }),
    );
  });

  it("saves category drafts without directly creating the category", async () => {
    const readers = createReaders();
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "category-draft-1" })),
    };
    const superAdminAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        isSuperAdmin: true,
        scopes: [...auth.permissions.scopes, "drafts:write", "products:write"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: superAdminAuth, writers }),
      createMcpPostRequest({
        id: "call-category-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            draft: {
              category: {
                description: "Large format print products.",
                name: "Large Format",
              },
            },
            draftType: "category",
            summary: "Ready for category review.",
          },
          name: "save_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      draftType: "category",
      openUrl: "/catalog?create=category&agentRunId=category-draft-1",
      runId: "category-draft-1",
      status: "completed",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        draftType: "category",
        result: expect.objectContaining({
          categoryDraft: expect.objectContaining({
            category: expect.objectContaining({
              name: "Large Format",
            }),
            readyForCreate: true,
          }),
        }),
      }),
    );
  });

  it("saves product type drafts without directly creating the product type", async () => {
    const readers = createReaders();
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "product-type-draft-1" })),
    };
    const superAdminAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        isSuperAdmin: true,
        scopes: [...auth.permissions.scopes, "drafts:write", "products:write"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: superAdminAuth, writers }),
      createMcpPostRequest({
        id: "call-product-type-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            draft: {
              productType: {
                attributes: ["paper", { id: "finish", name: "Finish" }],
                isShippable: true,
                name: "Large Format",
              },
            },
            draftType: "productType",
            summary: "Ready for product type review.",
          },
          name: "save_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      draftType: "productType",
      openUrl:
        "/configuration/product-types?type=create-new&agentRunId=product-type-draft-1",
      runId: "product-type-draft-1",
      status: "completed",
    });
    expect(writers.saveDraftRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        draftType: "productType",
        result: expect.objectContaining({
          productTypeDraft: expect.objectContaining({
            productType: expect.objectContaining({
              attributes: ["paper", "finish"],
              id: "largeFormat",
              name: "Large Format",
            }),
            readyForCreate: true,
          }),
        }),
      }),
    );
  });

  it("reads back saved MCP draft records", async () => {
    const readers = createReaders();
    vi.mocked(readers.getDraftRecord).mockResolvedValueOnce({
      channelId: "channel-1",
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      result: {
        categoryDraft: {
          category: {
            name: "Large Format",
          },
          readyForCreate: true,
        },
      },
      runId: "category-draft-1",
      source: "mcp",
      status: "completed",
      summary: "Ready for category review.",
      taskType: "category",
      workflowStatus: "mcp_draft",
    });
    const draftAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        scopes: [...auth.permissions.scopes, "drafts:write"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: draftAuth }),
      createMcpPostRequest({
        id: "call-get-saved-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            draftRunId: "category-draft-1",
          },
          name: "get_saved_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      channelId: "channel-1",
      draftType: "category",
      openUrl: "/catalog?create=category&agentRunId=category-draft-1",
      result: {
        categoryDraft: {
          category: {
            name: "Large Format",
          },
          readyForCreate: true,
        },
      },
      runId: "category-draft-1",
      status: "completed",
      summary: "Ready for category review.",
    });
    expect(readers.getDraftRecord).toHaveBeenCalledWith({
      runId: "category-draft-1",
    });
  });

  it("denies reading saved MCP drafts from unauthorized channels", async () => {
    const readers = createReaders();
    vi.mocked(readers.getDraftRecord).mockResolvedValueOnce({
      channelId: "channel-2",
      createdBy: {
        id: "user-1",
        name: "Admin",
      },
      result: {
        itemCount: 1,
      },
      runId: "quote-draft-1",
      source: "mcp",
      taskType: "quote",
      workflowStatus: "mcp_draft",
    });
    const draftAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        scopes: [...auth.permissions.scopes, "drafts:preview"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: draftAuth }),
      createMcpPostRequest({
        id: "call-get-cross-channel-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            draftRunId: "quote-draft-1",
          },
          name: "get_saved_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "channel_denied",
        status: 403,
      },
    });
  });

  it("denies reading MCP drafts created by another actor", async () => {
    const readers = createReaders();
    vi.mocked(readers.getDraftRecord).mockResolvedValueOnce({
      channelId: "channel-1",
      createdBy: {
        id: "other-user",
        name: "Other User",
      },
      result: {
        itemCount: 1,
      },
      runId: "quote-draft-1",
      source: "mcp",
      taskType: "quote",
      workflowStatus: "mcp_draft",
    });
    const draftAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        scopes: [...auth.permissions.scopes, "drafts:preview"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: draftAuth }),
      createMcpPostRequest({
        id: "call-get-other-actor-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            draftRunId: "quote-draft-1",
          },
          name: "get_saved_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "resource_denied",
        status: 403,
      },
    });
  });

  it("denies reading non-MCP agent records as saved drafts", async () => {
    const readers = createReaders();
    vi.mocked(readers.getDraftRecord).mockResolvedValueOnce({
      result: {},
      runId: "agent-run-1",
      source: "durable-agent",
      taskType: "quote",
      workflowStatus: "completed",
    });
    const draftAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        scopes: [...auth.permissions.scopes, "drafts:preview"],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: draftAuth }),
      createMcpPostRequest({
        id: "call-get-non-mcp-draft",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            draftRunId: "agent-run-1",
          },
          name: "get_saved_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "resource_denied",
        status: 403,
      },
    });
  });

  it("blocks business update drafts for sensitive credential fields", async () => {
    const readers = createReaders();
    const writers: ToolLayerWriters = {
      saveDraftRecord: vi.fn(async () => ({ runId: "update-draft-1" })),
    };
    const superAdminAuth: ToolAuthContext = {
      ...auth,
      permissions: {
        ...auth.permissions,
        isSuperAdmin: true,
        scopes: [
          ...auth.permissions.scopes,
          "business:read",
          "business:write",
          "drafts:write",
        ],
      },
    };

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers, { auth: superAdminAuth, writers }),
      createMcpPostRequest({
        id: "call-update-secret",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            changes: [
              {
                path: "apiSecret",
                value: "new-secret",
              },
            ],
            recordId: "provider-1",
            resource: "externalProviders",
          },
          name: "save_business_update_draft",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "validation_error",
        status: 400,
      },
    });
    expect(readers.getBusinessRecord).not.toHaveBeenCalled();
    expect(writers.saveDraftRecord).not.toHaveBeenCalled();
  });

  it("suggests order items through the shared tool layer", async () => {
    const readers = createReaders();
    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-suggest",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelName: "main store",
            query: "100 business cards",
          },
          name: "suggest_order_items",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      catalogCandidateCount: 1,
      count: 1,
      items: [expect.objectContaining({ productId: "product-1" })],
    });
    expect(mockSuggestOrderItemsFromCatalog).toHaveBeenCalledWith({
      attributes: [],
      channelId: "channel-1",
      limit: 20,
      query: "100 business cards",
    });
  });

  it("hides unexpected internal error messages from clients", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const readers = createReaders();
    vi.mocked(readers.searchProducts).mockRejectedValueOnce(
      new Error("connect ECONNREFUSED meilisearch.internal:7700"),
    );

    const response = await handleMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-3",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            channelId: "channel-1",
            query: "cards",
          },
          name: "search_products",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "internal_error",
        status: 500,
      },
    });
    expect(JSON.stringify(result)).toContain("Tool call failed.");
    expect(JSON.stringify(result)).not.toContain("meilisearch.internal");
    expect(consoleError).toHaveBeenCalledWith("[mcp] Tool call failed", {
      error: expect.any(Error),
      toolName: "search_products",
    });

    consoleError.mockRestore();
  });
});
