import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resetMcpRateLimitsForTests } from "@/lib/ai/mcp/rate-limit";

const {
  authorizeMcpOAuthRequestMock,
  isMcpOAuthConsentTokenValidMock,
  oauthErrorResponseMock,
} = vi.hoisted(() => ({
  authorizeMcpOAuthRequestMock: vi.fn(),
  isMcpOAuthConsentTokenValidMock: vi.fn(),
  oauthErrorResponseMock: vi.fn((error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
  ),
}));

vi.mock("@/lib/ai/mcp/oauth", () => ({
  authorizeMcpOAuthRequest: authorizeMcpOAuthRequestMock,
  isMcpOAuthConsentTokenValid: isMcpOAuthConsentTokenValidMock,
  oauthErrorResponse: oauthErrorResponseMock,
}));
vi.mock("server-only", () => ({}));

function consentRequest(headers: HeadersInit = {}): Request {
  return new Request("https://admin.example.com/mcp/oauth/authorize", {
    body: new URLSearchParams({
      client_id: "client-1",
      mcp_oauth_consent: "allow",
    }),
    headers,
    method: "POST",
  });
}

describe("MCP OAuth authorize route", () => {
  beforeEach(() => {
    resetMcpRateLimitsForTests();
    authorizeMcpOAuthRequestMock.mockReset();
    authorizeMcpOAuthRequestMock.mockResolvedValue(
      new Response(null, { status: 302 }),
    );
    isMcpOAuthConsentTokenValidMock.mockReset();
    isMcpOAuthConsentTokenValidMock.mockReturnValue(false);
  });

  it("rejects consent posts without same-origin evidence", async () => {
    const response = await POST(consentRequest());

    expect(response.status).toBe(403);
    expect(authorizeMcpOAuthRequestMock).not.toHaveBeenCalled();
  });

  it("accepts consent posts with a matching referer when origin is absent", async () => {
    const response = await POST(
      consentRequest({
        referer: "https://admin.example.com/pl/auth/login",
      }),
    );
    const options = authorizeMcpOAuthRequestMock.mock.calls[0]?.[1];

    expect(response.status).toBe(302);
    expect(options?.consentConfirmed).toBe(true);
    expect(options?.params.get("client_id")).toBe("client-1");
  });

  it("accepts consent posts from Codex loopback callbacks with a valid consent token", async () => {
    isMcpOAuthConsentTokenValidMock.mockReturnValueOnce(true);

    const response = await POST(
      consentRequest({
        origin: "http://127.0.0.1:5555",
      }),
    );
    const options = authorizeMcpOAuthRequestMock.mock.calls[0]?.[1];

    expect(response.status).toBe(302);
    expect(isMcpOAuthConsentTokenValidMock).toHaveBeenCalled();
    expect(options?.consentConfirmed).toBe(true);
    expect(options?.params.get("client_id")).toBe("client-1");
  });

  it("uses the incoming host when checking consent post origin", async () => {
    const response = await POST(
      new Request("http://localhost:3001/mcp/oauth/authorize", {
        body: new URLSearchParams({
          client_id: "client-1",
          mcp_oauth_consent: "allow",
        }),
        headers: {
          host: "127.0.0.1:3001",
          referer: "http://127.0.0.1:3001/pl/auth/login",
        },
        method: "POST",
      }),
    );
    const options = authorizeMcpOAuthRequestMock.mock.calls[0]?.[1];

    expect(response.status).toBe(302);
    expect(options?.consentConfirmed).toBe(true);
    expect(options?.params.get("client_id")).toBe("client-1");
  });
});
