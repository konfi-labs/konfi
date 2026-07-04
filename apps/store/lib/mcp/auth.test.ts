import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetAdminAuth, mockVerifyStoreMcpOAuthAccessToken } = vi.hoisted(
  () => ({
    mockGetAdminAuth: vi.fn(),
    mockVerifyStoreMcpOAuthAccessToken: vi.fn(),
  }),
);

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminAuth: mockGetAdminAuth,
}));

vi.mock("./oauth", () => ({
  verifyStoreMcpOAuthAccessToken: mockVerifyStoreMcpOAuthAccessToken,
}));

describe("resolveStoreMcpAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests when no OAuth access token is provided", async () => {
    const { StoreMcpAuthError, resolveStoreMcpAuthContext } =
      await import("./auth");

    await expect(
      resolveStoreMcpAuthContext(
        new Headers({
          "x-request-id": "request-1",
        }),
      ),
    ).rejects.toBeInstanceOf(StoreMcpAuthError);
    expect(mockVerifyStoreMcpOAuthAccessToken).not.toHaveBeenCalled();
  });

  it("resolves a store MCP OAuth access token", async () => {
    const { resolveStoreMcpAuthContext } = await import("./auth");
    mockVerifyStoreMcpOAuthAccessToken.mockResolvedValue({
      clientId: "client-1",
      customerUid: "customer-1",
      expiresAtMs: 1_800_000_000_000,
      jti: "token-1",
      resource: "https://example.com/mcp",
      scopes: ["store:context", "store:catalog:read"],
    });
    mockGetAdminAuth.mockReturnValue({
      getUser: vi.fn().mockResolvedValue({
        disabled: false,
        displayName: "Customer One",
        email: "customer@example.com",
        uid: "customer-1",
      }),
    });

    const context = await resolveStoreMcpAuthContext(
      new Headers({
        authorization: "Bearer oauth-token",
      }),
      "https://example.com/mcp",
    );

    expect(mockVerifyStoreMcpOAuthAccessToken).toHaveBeenCalledWith(
      "oauth-token",
    );
    expect(context).toMatchObject({
      actor: {
        displayName: "Customer One",
        email: "customer@example.com",
        kind: "customer",
        uid: "customer-1",
      },
      permissions: {
        scopes: ["store:context", "store:catalog:read"],
      },
      token: {
        clientId: "client-1",
        expiresAtMs: 1_800_000_000_000,
        jti: "token-1",
        resource: "https://example.com/mcp",
      },
    });
  });

  it("rejects invalid OAuth access tokens", async () => {
    const { StoreMcpAuthError, resolveStoreMcpAuthContext } =
      await import("./auth");
    mockVerifyStoreMcpOAuthAccessToken.mockResolvedValue(null);

    await expect(
      resolveStoreMcpAuthContext(
        new Headers({
          authorization: "Bearer invalid-token",
        }),
      ),
    ).rejects.toBeInstanceOf(StoreMcpAuthError);
    expect(mockGetAdminAuth).not.toHaveBeenCalled();
  });
});
