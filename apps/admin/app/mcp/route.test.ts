import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { resetMcpRateLimitsForTests } from "@/lib/ai/mcp/rate-limit";
import type { ToolAuthContext } from "@/lib/ai/tool-layer";

const { MockMcpAuthError, resolveMcpAuthContextMock } = vi.hoisted(() => ({
  MockMcpAuthError: class extends Error {},
  resolveMcpAuthContextMock: vi.fn(),
}));

vi.mock("@/lib/ai/mcp/auth", () => ({
  McpAuthError: MockMcpAuthError,
  resolveMcpAuthContext: resolveMcpAuthContextMock,
}));
vi.mock("server-only", () => ({}));

vi.mock("@/lib/ai/mcp/protocol", () => ({
  handleMcpStreamableHttpRequest: vi.fn(
    async () => new Response("{}", { status: 200 }),
  ),
}));
vi.mock("@/lib/ai/mcp/runtime", () => ({
  createMcpToolRuntime: vi.fn((authContext: unknown) => ({ authContext })),
}));

function createRequest(method: string, headers: HeadersInit = {}): Request {
  return new Request("https://admin.example.com/mcp", {
    body: method === "POST" ? "{}" : undefined,
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      ...headers,
    },
    method,
  });
}

function authenticatedContext(): ToolAuthContext {
  return {
    actor: {
      kind: "oauth-user",
      uid: "user-1",
    },
    permissions: {
      channelIds: [],
      isAdmin: true,
      isSuperAdmin: false,
      scopes: ["user:context"],
    },
    request: {
      requestId: "request-1",
      source: "mcp",
    },
  };
}

describe("MCP route", () => {
  beforeEach(() => {
    resetMcpRateLimitsForTests();
    resolveMcpAuthContextMock.mockReset();
    resolveMcpAuthContextMock.mockRejectedValue(
      new MockMcpAuthError("Missing bearer token."),
    );
  });

  it("returns protected-resource metadata on unauthorized requests", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(createRequest("POST"));
    const body = (await response.json()) as {
      error: { code: number; message: string };
      id: null;
      jsonrpc: "2.0";
    };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: -32001,
        message: "Authentication failed.",
      },
      id: null,
      jsonrpc: "2.0",
    });
    expect(response.headers.get("www-authenticate")).toContain(
      "https://admin.example.com/.well-known/oauth-protected-resource",
    );
    expect(resolveMcpAuthContextMock).toHaveBeenCalledWith(
      expect.any(Headers),
      "https://admin.example.com/mcp",
    );
    warn.mockRestore();
  });

  it("uses the incoming host for unauthorized OAuth metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(
      new Request("http://localhost:3001/mcp", {
        body: "{}",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
          host: "127.0.0.1:3001",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://127.0.0.1:3001/.well-known/oauth-protected-resource/mcp"',
    );
    expect(resolveMcpAuthContextMock).toHaveBeenCalledWith(
      expect.any(Headers),
      "http://127.0.0.1:3001/mcp",
    );
    warn.mockRestore();
  });

  it("returns 405 for authenticated GET when standalone SSE is disabled", async () => {
    resolveMcpAuthContextMock.mockResolvedValueOnce(authenticatedContext());

    const response = await GET(createRequest("GET"));
    const body = (await response.json()) as {
      error: { message: string };
      jsonrpc: "2.0";
    };

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(body.error.message).toBe("Method not allowed.");
  });

  it("returns 405 for authenticated DELETE because sessions are stateless", async () => {
    resolveMcpAuthContextMock.mockResolvedValueOnce(authenticatedContext());

    const response = await DELETE(createRequest("DELETE"));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});
