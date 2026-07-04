import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@konfi/types";
import type { UserRecord } from "firebase-admin/auth";
import { TenantMembershipStatus, TenantRole } from "@sblyvwx/cloud-contracts";
import {
  getAdminSessionClaims,
  getAdminSessionUser,
  McpAuthError,
  resolveMcpAuthContext,
  resolveMcpChannelIdsForUser,
} from "./auth";

const {
  mockGetUser,
  mockGetTenantContext,
  mockGetTenantIdForHostname,
  mockVerifyIdToken,
  mockVerifyMcpOAuthAccessToken,
  mockVerifySessionCookie,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetTenantContext: vi.fn(),
  mockGetTenantIdForHostname: vi.fn(),
  mockVerifyIdToken: vi.fn(),
  mockVerifyMcpOAuthAccessToken: vi.fn(),
  mockVerifySessionCookie: vi.fn(),
}));

const { mockMemberDocumentGet, mockTenantMembershipDocumentGet } = vi.hoisted(
  () => ({
    mockMemberDocumentGet: vi.fn(),
    mockTenantMembershipDocumentGet: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("./oauth", () => ({
  verifyMcpOAuthAccessToken: mockVerifyMcpOAuthAccessToken,
}));
vi.mock("@/lib/firebase/serverApp", () => ({
  adminTenantIdCookieName: "__tenantId",
  getAdminDb: vi.fn(() => ({
    collection: vi.fn((collectionName: string) => {
      if (collectionName === "tenantMemberships") {
        return {
          doc: vi.fn(() => ({
            get: mockTenantMembershipDocumentGet,
          })),
        };
      }

      return {
        doc: vi.fn(() => ({
          get: mockMemberDocumentGet,
        })),
      };
    }),
  })),
  getAdminAuth: vi.fn(() => ({
    getUser: mockGetUser,
    verifyIdToken: mockVerifyIdToken,
  })),
  getFirebaseAdminApp: vi.fn(),
  getTenantContext: mockGetTenantContext,
  getTenantIdForHostname: mockGetTenantIdForHostname,
  verifySessionCookie: mockVerifySessionCookie,
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));

function createUser(
  customClaims: UserRecord["customClaims"] = {},
  disabled: boolean = false,
): UserRecord {
  return {
    customClaims,
    disabled,
    uid: "user-1",
  } as UserRecord;
}

function createMember(channelIds: string[]): Member {
  return {
    channelIds,
  } as Member;
}

describe("MCP auth channel visibility", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockGetUser.mockReset();
    mockGetTenantContext.mockReset();
    mockGetTenantContext.mockReturnValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });
    mockGetTenantIdForHostname.mockReset();
    mockGetTenantIdForHostname.mockResolvedValue(undefined);
    mockMemberDocumentGet.mockReset();
    mockMemberDocumentGet.mockResolvedValue({ exists: false });
    mockTenantMembershipDocumentGet.mockReset();
    mockTenantMembershipDocumentGet.mockResolvedValue({ exists: false });
    mockVerifyIdToken.mockReset();
    mockVerifyMcpOAuthAccessToken.mockReset();
    mockVerifyMcpOAuthAccessToken.mockResolvedValue(null);
    mockVerifySessionCookie.mockReset();
  });

  it("rejects bearer tokens that are not OAuth or Firebase tokens", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error("invalid token"));

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer dev-token",
        }),
      ),
    ).rejects.toBeInstanceOf(McpAuthError);
  });

  it("accepts the configured development bearer token without Firebase auth", async () => {
    vi.stubEnv("KONFI_MCP_DEV_BEARER_TOKEN", "dev-token");

    const context = await resolveMcpAuthContext(
      new Headers({
        authorization: "Bearer dev-token",
        "x-request-id": "request-1",
      }),
      "http://localhost:3001/mcp",
    );

    expect(context).toMatchObject({
      actor: {
        kind: "machine",
        uid: "konfi-dev-mcp",
      },
      permissions: {
        channelIds: [],
        isAdmin: true,
        isSuperAdmin: true,
      },
      request: {
        requestId: "request-1",
        source: "mcp",
      },
      token: {
        clientId: "konfi-dev",
        resource: "http://localhost:3001/mcp",
      },
    });
    expect(context.permissions.scopes).toContain("orders:write");
    expect(mockVerifyMcpOAuthAccessToken).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("does not accept the development bearer token in production", async () => {
    vi.stubEnv("KONFI_MCP_DEV_BEARER_TOKEN", "dev-token");
    vi.stubEnv("NODE_ENV", "production");
    mockVerifyIdToken.mockRejectedValueOnce(new Error("invalid token"));

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer dev-token",
        }),
      ),
    ).rejects.toBeInstanceOf(McpAuthError);
  });

  it("rejects OAuth tokens issued for a different MCP resource", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://other.example.com/mcp",
      scopes: ["products:read"],
    });

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer oauth-token",
        }),
        "https://admin.example.com/mcp",
      ),
    ).rejects.toBeInstanceOf(McpAuthError);
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
  });

  it("uses Firebase token expiry and expected resource in fallback metadata", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    mockVerifyIdToken.mockResolvedValueOnce({
      exp,
      uid: "user-1",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }));

    const context = await resolveMcpAuthContext(
      new Headers({
        authorization: "Bearer firebase-token",
      }),
      "https://admin.example.com/mcp",
    );

    expect(context.token).toMatchObject({
      expiresAtMs: exp * 1000,
      resource: "https://admin.example.com/mcp",
    });
    expect(context.permissions.scopes).toContain("drafts:write");
    expect(context.permissions.scopes).not.toContain("products:write");
  });

  it("scopes OAuth tokens to the token tenant membership", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
      tenantId: "tenant-a",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }));
    mockGetTenantContext.mockImplementation((tenantId?: string) => ({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId,
    }));
    mockTenantMembershipDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: "tenant-a_user-1",
        tenantId: "tenant-a",
        uid: "user-1",
        role: TenantRole.ADMIN,
        accessLevel: 1,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: ["channel-1"],
      }),
    });

    const context = await resolveMcpAuthContext(
      new Headers({
        authorization: "Bearer oauth-token",
      }),
      "https://admin.example.com/mcp",
    );

    expect(context.permissions).toMatchObject({
      channelIds: ["channel-1"],
      tenantId: "tenant-a",
    });
    expect(context.token).toMatchObject({
      tenantId: "tenant-a",
    });
  });

  it("keeps tenant-owner OAuth write scopes within the token tenant", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:write", "business:write"],
      tenantId: "tenant-a",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }));
    mockGetTenantContext.mockImplementation((tenantId?: string) => ({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId,
    }));
    mockTenantMembershipDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: "tenant-a_user-1",
        tenantId: "tenant-a",
        uid: "user-1",
        role: TenantRole.OWNER,
        accessLevel: 5000,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: [],
      }),
    });

    const context = await resolveMcpAuthContext(
      new Headers({
        authorization: "Bearer oauth-token",
      }),
      "https://admin.example.com/mcp",
    );

    expect(context.permissions).toMatchObject({
      channelIds: [],
      tenantId: "tenant-a",
    });
    expect(context.permissions.scopes).toContain("products:write");
    expect(context.permissions.scopes).toContain("business:write");
  });

  it("rejects SaaS OAuth tokens when tenant membership was removed", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
      tenantId: "tenant-a",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }));
    mockGetTenantContext.mockImplementation((tenantId?: string) => ({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId,
    }));
    mockTenantMembershipDocumentGet.mockResolvedValueOnce({ exists: false });

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer oauth-token",
        }),
        "https://admin.example.com/mcp",
      ),
    ).rejects.toBeInstanceOf(McpAuthError);
  });

  it("scopes Firebase fallback bearer tokens from the admin tenant cookie", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    mockVerifyIdToken.mockResolvedValueOnce({
      exp,
      uid: "user-1",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }));
    mockGetTenantContext.mockImplementation((tenantId?: string) => ({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId,
    }));
    mockTenantMembershipDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: "tenant-a_user-1",
        tenantId: "tenant-a",
        uid: "user-1",
        role: TenantRole.OWNER,
        accessLevel: 5000,
        status: TenantMembershipStatus.ACTIVE,
        channelIds: ["channel-1"],
      }),
    });

    const context = await resolveMcpAuthContext(
      new Headers({
        authorization: "Bearer firebase-token",
        cookie: "__tenantId=tenant-a",
      }),
      "https://admin.example.com/mcp",
    );

    expect(context.permissions).toMatchObject({
      channelIds: ["channel-1"],
      tenantId: "tenant-a",
    });
  });

  it("rejects Firebase fallback tokens for non-admin users", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      exp: Math.floor(Date.now() / 1000) + 600,
      uid: "user-1",
    });
    mockGetUser.mockResolvedValueOnce(createUser());

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer firebase-token",
        }),
      ),
    ).rejects.toBeInstanceOf(McpAuthError);

    expect(mockMemberDocumentGet).not.toHaveBeenCalled();
  });

  it("rejects OAuth tokens for disabled admin users", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }, true));

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer oauth-token",
        }),
        "https://admin.example.com/mcp",
      ),
    ).rejects.toBeInstanceOf(McpAuthError);

    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(mockMemberDocumentGet).not.toHaveBeenCalled();
  });

  it("rejects OAuth tokens when an admin user has been downgraded", async () => {
    mockVerifyMcpOAuthAccessToken.mockResolvedValueOnce({
      adminUid: "user-1",
      clientId: "client-1",
      expiresAtMs: Date.now() + 60_000,
      jti: "token-1",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });
    mockGetUser.mockResolvedValueOnce(createUser());

    await expect(
      resolveMcpAuthContext(
        new Headers({
          authorization: "Bearer oauth-token",
        }),
        "https://admin.example.com/mcp",
      ),
    ).rejects.toBeInstanceOf(McpAuthError);

    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(mockMemberDocumentGet).not.toHaveBeenCalled();
  });

  it("treats malformed session cookie encoding as missing", async () => {
    await expect(
      getAdminSessionClaims(
        new Headers({
          cookie: "__session=%E0%A4%A",
        }),
      ),
    ).resolves.toBeNull();

    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects disabled users from admin session helpers", async () => {
    mockVerifySessionCookie.mockResolvedValueOnce({
      admin: true,
      uid: "user-1",
    });
    mockGetUser.mockResolvedValueOnce(createUser({ admin: true }, true));

    await expect(
      getAdminSessionUser(
        new Headers({
          cookie: "__session=session-cookie",
        }),
      ),
    ).resolves.toBeNull();
  });

  it("exposes only the storefront channel to normal users", () => {
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "store-channel";

    expect(
      resolveMcpChannelIdsForUser(
        createUser(),
        createMember(["admin-channel"]),
      ),
    ).toEqual(["store-channel"]);
  });

  it("exposes all channels to admins", () => {
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "store-channel";

    expect(
      resolveMcpChannelIdsForUser(
        createUser({ admin: true }),
        createMember(["admin-channel"]),
      ),
    ).toEqual([]);
  });
});
