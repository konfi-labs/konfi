import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  explainProductPrice,
  getAttributeOptionCosts,
  getBusinessRecord,
  getCurrentUserContext,
  getCustomer,
  getDraftResourceOptions,
  getDraftSchema,
  getKonfiDraftingDocs,
  getOrder,
  getOrderByNumber,
  getProductDynamicPricingConfig,
  getProduct,
  getProductCosts,
  getProductConfigurationSchema,
  getSavedDraft,
  listProductPriceRows,
  listProducts,
  listBusinessResources,
  listChannels,
  listOrders,
  listProductCostMappings,
  queryFirestoreRecords,
  saveBusinessUpdateDraft,
  saveDraft,
  searchBusinessRecords,
  searchCostEvidence,
  searchMaterialCostsByQuery,
  searchCustomers,
  searchOrders,
  searchProducts,
  suggestOrderItems,
} from "../tool-layer/tools";
import { ToolLayerError } from "../tool-layer/errors";
import {
  BUSINESS_RESOURCE_NAMES,
  KONFI_DRAFTING_DOC_TOPICS,
  PRODUCT_PRICE_TABLES,
  type ToolLayerRuntime,
} from "../tool-layer/types";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const SERVER_INFO = {
  name: "konfi-mcp",
  version: "0.1.0",
};

const READ_ONLY_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};

const WRITE_DRAFT_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
  readOnlyHint: false,
};

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toStructuredContent(value: JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { result: value };
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

function successToolResult(value: unknown): CallToolResult {
  const jsonValue = toJsonValue(value);

  return {
    content: [
      {
        text: JSON.stringify(jsonValue),
        type: "text",
      },
    ],
    structuredContent: toStructuredContent(jsonValue),
  };
}

function errorToolResult(
  message: string,
  structuredContent: Record<string, unknown>,
): CallToolResult {
  return {
    content: [
      {
        text: message,
        type: "text",
      },
    ],
    isError: true,
    structuredContent,
  };
}

async function runTool<TResult>(
  toolName: string,
  operation: () => Promise<TResult>,
): Promise<CallToolResult> {
  try {
    return successToolResult(await operation());
  } catch (error) {
    if (error instanceof ToolLayerError) {
      return errorToolResult(error.message, {
        code: error.code,
        ...error.details,
        status: error.status,
      });
    }

    console.error("[mcp] Tool call failed", {
      error,
      toolName,
    });

    return errorToolResult("Tool call failed.", {
      code: "internal_error",
      status: 500,
    });
  }
}

export function createKonfiMcpServer(runtime: ToolLayerRuntime): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "get_current_user_context",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Return the authenticated Konfi actor, granted read scopes, and visible channel IDs.",
      inputSchema: {},
      title: "Get Current User Context",
    },
    async () =>
      runTool("get_current_user_context", () => getCurrentUserContext(runtime)),
  );

  server.registerTool(
    "list_channels",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List authorized Konfi channels by name. Use one of these names as channelName for channel-scoped requests.",
      inputSchema: {},
      title: "List Channels",
    },
    async () => runTool("list_channels", () => listChannels(runtime)),
  );

  server.registerTool(
    "list_business_resources",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List admin-only Konfi business resources available through the generic business record tools, including campaigns, promotions, invoices, operations, settings, catalog infrastructure, scheduling, suppliers, and provider-import surfaces.",
      inputSchema: {},
      title: "List Business Resources",
    },
    async () =>
      runTool("list_business_resources", () => listBusinessResources(runtime)),
  );

  server.registerTool(
    "search_business_records",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search or list records from one admin-only Konfi business resource. Use list_business_resources first to choose the resource. For channel-scoped resources, prefer channelName from list_channels; channelId is accepted for backward compatibility. This is read-only and returns sanitized, truncated previews.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        query: z.string().optional(),
        resource: z.enum(BUSINESS_RESOURCE_NAMES),
      },
      title: "Search Business Records",
    },
    async ({ channelId, channelName, limit, query, resource }) =>
      runTool("search_business_records", () =>
        searchBusinessRecords(runtime, {
          channelId,
          channelName,
          limit,
          query,
          resource,
        }),
      ),
  );

  server.registerTool(
    "query_firestore_records",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Run a bounded read-only Firestore query against one allowlisted Konfi business resource. Use list_business_resources first to choose a Firestore-backed resource. Supports where clauses, orderBy clauses, limit, and page; results are sanitized and truncated. Prefer this over search_business_records when exact Firestore fields such as number, status, active, customer.id, or createdAt are known. If Firestore reports a missing composite index, simplify the query or add the required index before retrying. For channel-scoped resources, prefer channelName from list_channels; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        orderBy: z
          .array(
            z.object({
              direction: z.enum(["asc", "desc"]).optional(),
              field: z.string(),
            }),
          )
          .optional(),
        page: z.number().optional(),
        resource: z.enum(BUSINESS_RESOURCE_NAMES),
        where: z
          .array(
            z.object({
              field: z.string(),
              op: z.enum([
                "<",
                "<=",
                "==",
                "!=",
                ">=",
                ">",
                "array-contains",
                "array-contains-any",
                "in",
                "not-in",
              ]),
              value: jsonValueSchema,
            }),
          )
          .optional(),
      },
      title: "Query Firestore Records",
    },
    async ({ channelId, channelName, limit, orderBy, page, resource, where }) =>
      runTool("query_firestore_records", () =>
        queryFirestoreRecords(runtime, {
          channelId,
          channelName,
          limit,
          orderBy,
          page,
          resource,
          where,
        }),
      ),
  );

  server.registerTool(
    "get_business_record",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch one sanitized admin-only Konfi business record from a resource returned by list_business_resources. For channel-scoped resources, prefer channelName from list_channels; channelId is accepted for backward compatibility. This is read-only and does not create, update, or approve final records.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        recordId: z.string(),
        resource: z.enum(BUSINESS_RESOURCE_NAMES),
      },
      title: "Get Business Record",
    },
    async ({ channelId, channelName, recordId, resource }) =>
      runTool("get_business_record", () =>
        getBusinessRecord(runtime, {
          channelId,
          channelName,
          recordId,
          resource,
        }),
      ),
  );

  server.registerTool(
    "save_business_update_draft",
    {
      annotations: WRITE_DRAFT_TOOL_ANNOTATIONS,
      description:
        "Save a small MCP-proposed update draft for an existing Konfi business record from list_business_resources. Use this for field-level change proposals that a human admin must review in Konfi; it does not directly update, delete, approve, refund, or create final records. Pass draftRunId from a previous save to edit that MCP draft instead of creating a new one. Prefer channelName for channel-scoped resources.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        changes: z
          .array(
            z.object({
              note: z.string().optional(),
              path: z.string(),
              previousValue: jsonValueSchema.optional(),
              value: jsonValueSchema,
            }),
          )
          .min(1)
          .max(10),
        draftRunId: z.string().optional(),
        recordId: z.string(),
        resource: z.enum(BUSINESS_RESOURCE_NAMES),
        summary: z.string().optional(),
        title: z.string().optional(),
      },
      title: "Save Business Update Draft",
    },
    async ({
      channelId,
      channelName,
      changes,
      draftRunId,
      recordId,
      resource,
      summary,
      title,
    }) =>
      runTool("save_business_update_draft", () =>
        saveBusinessUpdateDraft(runtime, {
          channelId,
          channelName,
          changes,
          draftRunId,
          recordId,
          resource,
          summary,
          title,
        }),
      ),
  );

  server.registerTool(
    "search_orders",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search orders in an authorized channel. Plain numeric queries such as 12345 or #12345 are treated as exact visible order-number lookups. Use list_orders instead when the user asks for latest, newest, or recent orders. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        page: z.number().optional(),
        query: z.string(),
      },
      title: "Search Orders",
    },
    async ({ channelId, channelName, limit, page, query }) =>
      runTool("search_orders", () =>
        searchOrders(runtime, { channelId, channelName, limit, page, query }),
      ),
  );

  server.registerTool(
    "list_orders",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List active orders in an authorized channel ordered newest first by creation time. Use this for latest, newest, recent, or first-page order requests; pass limit 1 for the latest order. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        page: z.number().optional(),
      },
      title: "List Orders",
    },
    async ({ channelId, channelName, limit, page }) =>
      runTool("list_orders", () =>
        listOrders(runtime, { channelId, channelName, limit, page }),
      ),
  );

  server.registerTool(
    "get_order",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch a redacted order summary by internal order ID from an authorized channel. If the user gives a visible order number like #12345, use get_order_by_number instead. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        orderId: z.string(),
      },
      title: "Get Order",
    },
    async ({ channelId, channelName, orderId }) =>
      runTool("get_order", () =>
        getOrder(runtime, { channelId, channelName, orderId }),
      ),
  );

  server.registerTool(
    "get_order_by_number",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch a redacted order summary by the visible numeric order number shown in Konfi, for example #12345. Use this when the user provides an order number instead of an internal order ID. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        orderNumber: z.number().int().positive(),
      },
      title: "Get Order By Number",
    },
    async ({ channelId, channelName, orderNumber }) =>
      runTool("get_order_by_number", () =>
        getOrderByNumber(runtime, { channelId, channelName, orderNumber }),
      ),
  );

  server.registerTool(
    "search_products",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search products in an authorized channel. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        query: z.string(),
      },
      title: "Search Products",
    },
    async ({ channelId, channelName, limit, query }) =>
      runTool("search_products", () =>
        searchProducts(runtime, { channelId, channelName, limit, query }),
      ),
  );

  server.registerTool(
    "list_products",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List active products available in an authorized channel without a search query. Use this when the agent needs to enumerate the product catalog before choosing or comparing products. Prefer channelName; channelId is accepted for backward compatibility. Results are paginated; follow nextPage until it is absent.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        page: z.number().optional(),
      },
      title: "List Products",
    },
    async ({ channelId, channelName, limit, page }) =>
      runTool("list_products", () =>
        listProducts(runtime, { channelId, channelName, limit, page }),
      ),
  );

  server.registerTool(
    "suggest_order_items",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Suggest complete configured quote/order line items from an authorized channel. Use this after search_products when drafting quotes or orders, then pass the returned items into save_draft after human review. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        query: z.string(),
      },
      title: "Suggest Order Items",
    },
    async ({ channelId, channelName, limit, query }) =>
      runTool("suggest_order_items", () =>
        suggestOrderItems(runtime, { channelId, channelName, limit, query }),
      ),
  );

  server.registerTool(
    "get_product",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch a redacted product summary and pricing metadata by ID from an authorized channel. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        productId: z.string(),
      },
      title: "Get Product",
    },
    async ({ channelId, channelName, productId }) =>
      runTool("get_product", () =>
        getProduct(runtime, { channelId, channelName, productId }),
      ),
  );

  server.registerTool(
    "get_product_configuration_schema",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch the selectable configuration schema for a product in an authorized channel. Use this after search_products/get_product and before asking the user for quantity, attributes, size, page count, or before calling explain_price. The MCP server does not store the selected configuration; keep it in the client agent context.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        productId: z.string(),
      },
      title: "Get Product Configuration Schema",
    },
    async ({ channelId, channelName, productId }) =>
      runTool("get_product_configuration_schema", () =>
        getProductConfigurationSchema(runtime, {
          channelId,
          channelName,
          productId,
        }),
      ),
  );

  server.registerTool(
    "list_product_price_rows",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List persisted product price rows from an authorized channel with page/limit pagination. Use this for MATRIX price tables and page-count price subcollections. Values are raw persisted minor currency units.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        limit: z.number().optional(),
        page: z.number().optional(),
        productId: z.string(),
        table: z.enum(PRODUCT_PRICE_TABLES).optional(),
      },
      title: "List Product Price Rows",
    },
    async (input) =>
      runTool("list_product_price_rows", () =>
        listProductPriceRows(runtime, input),
      ),
  );

  server.registerTool(
    "get_product_dynamic_pricing_config",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch the raw DYNAMIC pricing config for a product in an authorized channel. Optionally includes linked dynamic pricing presets. Values are raw persisted minor currency units.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        includeLinkedPresets: z.boolean().optional(),
        productId: z.string(),
      },
      title: "Get Product Dynamic Pricing Config",
    },
    async (input) =>
      runTool("get_product_dynamic_pricing_config", () =>
        getProductDynamicPricingConfig(runtime, input),
      ),
  );

  server.registerTool(
    "get_draft_schema",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Return the admin draft planning schema for a category, product type, quote, order, or product. This is read-only guidance for the MCP client agent to keep a draft in its own context; it does not create or persist anything.",
      inputSchema: {
        draftType: z.enum([
          "category",
          "productType",
          "quote",
          "order",
          "product",
        ]),
      },
      title: "Get Draft Schema",
    },
    async ({ draftType }) =>
      runTool("get_draft_schema", () => getDraftSchema(runtime, { draftType })),
  );

  server.registerTool(
    "get_konfi_drafting_docs",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Return Konfi-specific drafting documentation for MCP clients, including quote/order/product flow, attribute and product type structures, money units, combinations, dependencies, custom sizes, page counts, volumes, advanced finishing, blocked drafts, atomic catalog changes, examples, and pricing guidance for SINGLE, THRESHOLD, MATRIX, and DYNAMIC price types. Use this before save_draft when the client agent needs valid field semantics instead of guessing.",
      inputSchema: {
        topic: z.enum(KONFI_DRAFTING_DOC_TOPICS).optional(),
      },
      title: "Get Konfi Drafting Docs",
    },
    async ({ topic }) =>
      runTool("get_konfi_drafting_docs", () =>
        getKonfiDraftingDocs(runtime, { topic }),
      ),
  );

  server.registerTool(
    "get_draft_resource_options",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Return real selectable Konfi resources for drafting a category, product type, quote, order, or product. Use this with get_draft_schema before drafting so channel, category IDs, product type IDs, attribute IDs/options, and enum values are grounded in current Konfi data. This tool is read-only and does not create or persist anything.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        draftType: z.enum([
          "category",
          "productType",
          "quote",
          "order",
          "product",
        ]),
      },
      title: "Get Draft Resource Options",
    },
    async ({ channelId, channelName, draftType }) =>
      runTool("get_draft_resource_options", () =>
        getDraftResourceOptions(runtime, {
          channelId,
          channelName,
          draftType,
        }),
      ),
  );

  server.registerTool(
    "save_draft",
    {
      annotations: WRITE_DRAFT_TOOL_ANNOTATIONS,
      description:
        "Save a completed MCP-generated category, product type, quote, order, or product draft for human review in Konfi. Use this only after the draft is grounded with get_draft_schema, get_draft_resource_options, and product pricing/configuration tools when relevant. This writes a completed draft task to the Konfi Tasks surface and returns an openUrl for the real form; it does not create the final category, product type, quote, order, or product. Pass draftRunId from a previous save to replace that MCP draft instead of creating a new one.",
      inputSchema: {
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        draft: z.record(z.string(), z.unknown()),
        draftRunId: z.string().optional(),
        draftType: z.enum([
          "category",
          "productType",
          "quote",
          "order",
          "product",
        ]),
        summary: z.string().optional(),
        title: z.string().optional(),
      },
      title: "Save Draft",
    },
    async ({
      channelId,
      channelName,
      draft,
      draftRunId,
      draftType,
      summary,
      title,
    }) =>
      runTool("save_draft", () =>
        saveDraft(runtime, {
          channelId,
          channelName,
          draft,
          draftRunId,
          draftType,
          summary,
          title,
        }),
      ),
  );

  server.registerTool(
    "get_saved_draft",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Read back a saved MCP-generated draft by draftRunId returned from save_draft or save_business_update_draft. This only returns MCP draft records that still require human review; it does not read final categories, product types, products, quotes, orders, or business records.",
      inputSchema: {
        draftRunId: z.string(),
      },
      title: "Get Saved Draft",
    },
    async ({ draftRunId }) =>
      runTool("get_saved_draft", () => getSavedDraft(runtime, { draftRunId })),
  );

  server.registerTool(
    "explain_price",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Explain the price for a product and quantity in an authorized channel. Prefer channelName; channelId is accepted for backward compatibility.",
      inputSchema: {
        calculatedCombination: z.string().optional(),
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        customFormat: z.boolean().optional(),
        customPrice: z.number().nullable().optional(),
        discount: z.number().optional(),
        height: z.number().positive().optional(),
        pageCount: z.number().nullable().optional(),
        productId: z.string(),
        quantity: z.number().positive(),
        selectedAttributeOptions: z
          .record(z.string(), z.string())
          .nullable()
          .optional(),
        volume: z.number().positive().optional(),
        width: z.number().positive().optional(),
      },
      title: "Explain Price",
    },
    async (input) =>
      runTool("explain_price", () => explainProductPrice(runtime, input)),
  );

  server.registerTool(
    "get_product_costs",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch approved Fakturownia cost entries mapped to a product, optionally narrowed by attribute, option, and invoice date range. This is read-only cost evidence for agent analysis and does not recommend or update prices.",
      inputSchema: {
        attributeId: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().optional(),
        optionValue: z.string().optional(),
        productId: z.string(),
      },
      title: "Get Product Costs",
    },
    async (input) =>
      runTool("get_product_costs", () => getProductCosts(runtime, input)),
  );

  server.registerTool(
    "list_product_cost_mappings",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List approved product-to-cost mappings and their linked attributes/options. Pending and rejected mappings are not exposed through this read-only MCP tool.",
      inputSchema: {
        limit: z.number().optional(),
        productId: z.string().optional(),
      },
      title: "List Product Cost Mappings",
    },
    async (input) =>
      runTool("list_product_cost_mappings", () =>
        listProductCostMappings(runtime, input),
      ),
  );

  server.registerTool(
    "get_attribute_option_costs",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch approved Fakturownia cost entries tied to a specific product attribute option, optionally narrowed to one product and invoice date range. This does not expose raw invoice dumps.",
      inputSchema: {
        attributeId: z.string(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().optional(),
        optionValue: z.string(),
        productId: z.string().optional(),
      },
      title: "Get Attribute Option Costs",
    },
    async (input) =>
      runTool("get_attribute_option_costs", () =>
        getAttributeOptionCosts(runtime, input),
      ),
  );

  server.registerTool(
    "search_cost_evidence",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search approved normalized Fakturownia cost evidence by supplier, product, attribute, option, invoice number, or invoice date range. Results are bounded and exclude credentials and unrestricted invoice dumps.",
      inputSchema: {
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().optional(),
        productId: z.string().optional(),
        query: z.string().optional(),
      },
      title: "Search Cost Evidence",
    },
    async (input) =>
      runTool("search_cost_evidence", () => searchCostEvidence(runtime, input)),
  );

  server.registerTool(
    "search_material_costs",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Answer natural-language material cost questions from approved Fakturownia cost mappings using semantic search. Returns latest and average net cost, unit basis, sample count, and grounded invoice evidence. This is read-only and does not recommend or update product prices.",
      inputSchema: {
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().optional(),
        productId: z.string().optional(),
        query: z.string(),
      },
      title: "Search Material Costs",
    },
    async (input) =>
      runTool("search_material_costs", () =>
        searchMaterialCostsByQuery(runtime, input),
      ),
  );

  server.registerTool(
    "search_customers",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search customers visible to the authorized admin. Returns redacted customer result labels only.",
      inputSchema: {
        limit: z.number().optional(),
        query: z.string(),
      },
      title: "Search Customers",
    },
    async ({ limit, query }) =>
      runTool("search_customers", () =>
        searchCustomers(runtime, { limit, query }),
      ),
  );

  server.registerTool(
    "get_customer",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch a redacted customer summary by ID without email, phone, or addresses.",
      inputSchema: {
        customerId: z.string(),
      },
      title: "Get Customer",
    },
    async ({ customerId }) =>
      runTool("get_customer", () => getCustomer(runtime, { customerId })),
  );

  return server;
}

export async function handleMcpStreamableHttpRequest(
  runtime: ToolLayerRuntime,
  request: Request,
): Promise<Response> {
  const server = createKonfiMcpServer(runtime);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  // The MCP SDK exposes transport errors through an `onerror` callback property.
  // oxlint-disable-next-line unicorn/prefer-add-event-listener
  transport.onerror = (error) => {
    console.warn("[mcp] Streamable HTTP transport error", {
      message: error.message,
    });
  };

  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();

  return response;
}
