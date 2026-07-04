import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { StoreMcpToolError } from "./errors";
import { createFirestoreStoreMcpReaders } from "./readers";
import {
  getCustomerOrder,
  getProduct,
  getProductConfigurationSchema,
  getStoreContext,
  listCategories,
  listCategorySchemas,
  listCustomerOrders,
  searchProducts,
} from "./tools";
import type { StoreMcpAuthContext, StoreMcpRuntime } from "./types";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const SERVER_INFO = {
  name: "konfi-store-mcp",
  version: "0.1.0",
};

const READ_ONLY_TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toStructuredContent(value: JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { result: value };
}

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
  operation: () => Promise<TResult> | TResult,
): Promise<CallToolResult> {
  try {
    return successToolResult(await operation());
  } catch (error) {
    if (error instanceof StoreMcpToolError) {
      return errorToolResult(error.message, {
        code: error.code,
        ...error.details,
        status: error.status,
      });
    }

    console.error("[store-mcp] Tool call failed", {
      error,
      toolName,
    });

    return errorToolResult("Tool call failed.", {
      code: "internal_error",
      status: 500,
    });
  }
}

export function createStoreMcpRuntime(
  auth: StoreMcpAuthContext,
): StoreMcpRuntime {
  return {
    auth,
    readers: createFirestoreStoreMcpReaders(),
  };
}

export function createKonfiStoreMcpServer(runtime: StoreMcpRuntime): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "get_store_context",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Return customer/store MCP context for the OAuth-authorized customer. The storefront channel is implicit; do not ask the user for a channel id.",
      inputSchema: {},
      title: "Get Store Context",
    },
    async () => runTool("get_store_context", () => getStoreContext(runtime)),
  );

  server.registerTool(
    "list_categories",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List public storefront categories for the configured store channel. This is public customer-facing data.",
      inputSchema: {
        limit: z.number().optional(),
      },
      title: "List Categories",
    },
    async ({ limit }) =>
      runTool("list_categories", () => listCategories(runtime, { limit })),
  );

  server.registerTool(
    "list_category_schemas",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List public storefront category taxonomy schemas with hierarchy metadata and aggregated product attribute coverage for the configured store channel.",
      inputSchema: {
        limit: z.number().optional(),
      },
      title: "List Category Schemas",
    },
    async ({ limit }) =>
      runTool("list_category_schemas", () =>
        listCategorySchemas(runtime, { limit }),
      ),
  );

  server.registerTool(
    "search_products",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Search or list public, purchasable storefront products for the configured store channel. Use an empty query to list recommended/default products.",
      inputSchema: {
        limit: z.number().optional(),
        query: z.string().optional(),
      },
      title: "Search Products",
    },
    async ({ limit, query }) =>
      runTool("search_products", () =>
        searchProducts(runtime, { limit, query }),
      ),
  );

  server.registerTool(
    "get_product",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch one public storefront product by productId or slug. Returns public product metadata, quantity rules, attributes, and a bounded public price-row preview.",
      inputSchema: {
        productId: z.string().optional(),
        slug: z.string().optional(),
      },
      title: "Get Product",
    },
    async ({ productId, slug }) =>
      runTool("get_product", () => getProduct(runtime, { productId, slug })),
  );

  server.registerTool(
    "get_product_configuration_schema",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch public selectable configuration data for a storefront product. The MCP server does not store selections; keep chosen options in the MCP client context.",
      inputSchema: {
        productId: z.string().optional(),
        slug: z.string().optional(),
      },
      title: "Get Product Configuration Schema",
    },
    async ({ productId, slug }) =>
      runTool("get_product_configuration_schema", () =>
        getProductConfigurationSchema(runtime, { productId, slug }),
      ),
  );

  server.registerTool(
    "list_customer_orders",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "List orders owned by the OAuth-authorized store customer. Requires the store:orders:read scope.",
      inputSchema: {
        limit: z.number().optional(),
      },
      title: "List Customer Orders",
    },
    async ({ limit }) =>
      runTool("list_customer_orders", () =>
        listCustomerOrders(runtime, { limit }),
      ),
  );

  server.registerTool(
    "get_customer_order",
    {
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Fetch one order owned by the OAuth-authorized store customer. Requires the store:orders:read scope.",
      inputSchema: {
        orderId: z.string(),
      },
      title: "Get Customer Order",
    },
    async ({ orderId }) =>
      runTool("get_customer_order", () =>
        getCustomerOrder(runtime, { orderId }),
      ),
  );

  return server;
}

export async function handleStoreMcpStreamableHttpRequest(
  runtime: StoreMcpRuntime,
  request: Request,
): Promise<Response> {
  const server = createKonfiStoreMcpServer(runtime);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  // The MCP SDK exposes transport errors through an `onerror` callback property.
  // oxlint-disable-next-line unicorn/prefer-add-event-listener
  transport.onerror = (error) => {
    console.warn("[store-mcp] Streamable HTTP transport error", {
      message: error.message,
    });
  };

  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();

  return response;
}
