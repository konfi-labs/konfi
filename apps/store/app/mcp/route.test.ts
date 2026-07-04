import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { resetStoreMcpRateLimitsForTests } from "@/lib/mcp/rate-limit";

vi.mock("server-only", () => ({}));

const {
  MockStoreMcpAuthError,
  createStoreMcpRuntimeMock,
  handleStoreMcpStreamableHttpRequestMock,
  resolveStoreMcpAuthContextMock,
} = vi.hoisted(() => ({
  MockStoreMcpAuthError: class extends Error {},
  createStoreMcpRuntimeMock: vi.fn((authContext: unknown) => ({
    authContext,
  })),
  handleStoreMcpStreamableHttpRequestMock: vi.fn(
    async () => new Response("{}", { status: 200 }),
  ),
  resolveStoreMcpAuthContextMock: vi.fn(),
}));

vi.mock("@/lib/mcp/auth", () => ({
  StoreMcpAuthError: MockStoreMcpAuthError,
  resolveStoreMcpAuthContext: resolveStoreMcpAuthContextMock,
}));

vi.mock("@/lib/mcp/protocol", () => ({
  createStoreMcpRuntime: createStoreMcpRuntimeMock,
  handleStoreMcpStreamableHttpRequest: handleStoreMcpStreamableHttpRequestMock,
}));

function createRequest(method: string, headers: HeadersInit = {}): Request {
  return new Request("https://example.com/mcp", {
    body: method === "POST" ? "{}" : undefined,
    headers: {
      Authorization: "Bearer oauth-token",
      "Content-Type": "application/json",
      ...headers,
    },
    method,
  });
}

function customerContext() {
  return {
    actor: {
      kind: "customer",
      uid: "customer-1",
    },
    permissions: {
      scopes: ["store:context", "store:catalog:read", "store:orders:read"],
    },
    request: {
      requestId: "request-1",
      source: "store-mcp",
    },
    token: {
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://example.com/mcp",
      scopes: ["store:context", "store:catalog:read", "store:orders:read"],
    },
  };
}

describe("store MCP route", () => {
  beforeEach(() => {
    resetStoreMcpRateLimitsForTests();
    vi.clearAllMocks();
    resolveStoreMcpAuthContextMock.mockResolvedValue(customerContext());
  });

  it("allows Streamable HTTP requests with store OAuth auth", async () => {
    const response = await POST(createRequest("POST"));

    expect(response.status).toBe(200);
    expect(resolveStoreMcpAuthContextMock).toHaveBeenCalledWith(
      expect.any(Headers),
      "https://example.com/mcp",
    );
    expect(createStoreMcpRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          kind: "customer",
        }),
      }),
    );
    expect(handleStoreMcpStreamableHttpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext: expect.objectContaining({
          actor: expect.objectContaining({
            kind: "customer",
          }),
        }),
      }),
      expect.any(Request),
    );
  });

  it("returns 401 with OAuth metadata when auth fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveStoreMcpAuthContextMock.mockRejectedValueOnce(
      new MockStoreMcpAuthError("Invalid OAuth access token."),
    );

    const response = await POST(createRequest("POST"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp"',
    );
    expect(handleStoreMcpStreamableHttpRequestMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses the incoming host for unauthorized OAuth metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveStoreMcpAuthContextMock.mockRejectedValueOnce(
      new MockStoreMcpAuthError("Invalid OAuth access token."),
    );

    const response = await POST(
      new Request("http://localhost:3000/mcp", {
        body: "{}",
        headers: {
          Authorization: "Bearer oauth-token",
          "Content-Type": "application/json",
          host: "127.0.0.1:3000",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp"',
    );
    expect(resolveStoreMcpAuthContextMock).toHaveBeenCalledWith(
      expect.any(Headers),
      "http://127.0.0.1:3000/mcp",
    );
    warn.mockRestore();
  });

  it("returns 405 for GET and DELETE because sessions are stateless", async () => {
    await expect(GET(createRequest("GET"))).resolves.toHaveProperty(
      "status",
      405,
    );
    await expect(DELETE(createRequest("DELETE"))).resolves.toHaveProperty(
      "status",
      405,
    );
  });
});
