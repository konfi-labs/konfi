import { describe, expect, it, vi } from "vitest";
import { handleStoreMcpStreamableHttpRequest } from "./protocol";
import type { StoreMcpReaders, StoreMcpRuntime } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
}));

type JsonRpcResponse = {
  error?: {
    code: number;
    message: string;
  };
  id: number | string | null;
  jsonrpc: "2.0";
  result?: Record<string, unknown>;
};

function createReaders(): StoreMcpReaders {
  return {
    getCustomerOrder: vi.fn(async () => null),
    getProduct: vi.fn(async () => null),
    listAttributes: vi.fn(async () => []),
    listCategories: vi.fn(async () => []),
    listCustomerOrders: vi.fn(async () => []),
    searchProducts: vi.fn(async () => []),
  };
}

function createRuntime(readers: StoreMcpReaders = createReaders()) {
  return {
    auth: {
      actor: {
        kind: "customer",
        uid: "customer-1",
      },
      permissions: {
        scopes: ["store:context", "store:catalog:read"],
      },
      request: {
        requestId: "request-1",
        source: "store-mcp",
      },
      token: {
        expiresAtMs: Date.now() + 60_000,
        scopes: ["store:context", "store:catalog:read"],
      },
    },
    readers,
  } satisfies StoreMcpRuntime;
}

function createMcpPostRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request("https://example.com/mcp", {
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

describe("store MCP Streamable HTTP protocol", () => {
  it("exposes only customer/store tools through tools/list", async () => {
    const response = await handleStoreMcpStreamableHttpRequest(
      createRuntime(),
      createMcpPostRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);
    const tools = result.tools as { name: string }[];
    const toolNames = tools.map((tool) => tool.name);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "get_store_context",
        "list_categories",
        "list_category_schemas",
        "search_products",
        "get_product",
        "get_product_configuration_schema",
        "list_customer_orders",
        "get_customer_order",
      ]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        "list_channels",
        "list_business_resources",
        "save_draft",
        "search_customers",
      ]),
    );
  });

  it("returns customer-order scope errors as tool errors", async () => {
    const readers = createReaders();
    const response = await handleStoreMcpStreamableHttpRequest(
      createRuntime(readers),
      createMcpPostRequest({
        id: "call-1",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {},
          name: "list_customer_orders",
        },
      }),
    );
    const body = await readMcpResponse(response);
    const result = expectResultObject(body);

    expect(response.status).toBe(200);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "missing_scope",
      status: 403,
    });
    expect(readers.listCustomerOrders).not.toHaveBeenCalled();
  });

  it("requires Streamable HTTP POST Accept headers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await handleStoreMcpStreamableHttpRequest(
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
});
