import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolAuthContext } from "../tool-layer";
import {
  checkMcpAuthenticatedRateLimit,
  checkMcpOAuthRateLimit,
  checkMcpRouteIpRateLimit,
  mcpRateLimitTestPolicies,
  resetMcpRateLimitsForTests,
} from "./rate-limit";

vi.mock("server-only", () => ({}));

function requestForIp(ip: string): Request {
  return new Request("https://admin.example.com/mcp", {
    headers: {
      "x-forwarded-for": `${ip}, 10.0.0.1`,
    },
  });
}

function authContext(): ToolAuthContext {
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
    token: {
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["user:context"],
    },
  };
}

describe("MCP rate limits", () => {
  beforeEach(() => {
    resetMcpRateLimitsForTests();
  });

  it("allows normal MCP traffic and returns 429 after the IP window is exhausted", async () => {
    const request = requestForIp("203.0.113.10");

    for (let count = 0; count < mcpRateLimitTestPolicies.mcpIp.limit; count++) {
      expect(checkMcpRouteIpRateLimit(request)).toBeNull();
    }

    const response = checkMcpRouteIpRateLimit(request);
    const body = (await response?.json()) as {
      error?: { message?: string };
      jsonrpc?: "2.0";
    };

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBeTruthy();
    expect(body).toMatchObject({
      error: {
        message: "Rate limit exceeded.",
      },
      jsonrpc: "2.0",
    });
  });

  it("tracks OAuth limits separately from authenticated MCP tool limits", async () => {
    const request = requestForIp("203.0.113.11");
    const auth = authContext();

    for (
      let count = 0;
      count < mcpRateLimitTestPolicies.oauthIp.limit;
      count++
    ) {
      expect(checkMcpOAuthRateLimit(request)).toBeNull();
    }

    const oauthResponse = checkMcpOAuthRateLimit(request);

    expect(oauthResponse?.status).toBe(429);
    expect(checkMcpAuthenticatedRateLimit(auth)).toBeNull();
  });
});
