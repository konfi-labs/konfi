import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  authorizationServerMetadata,
  authorizeMcpOAuthRequest,
  exchangeMcpOAuthToken,
  isMcpOAuthConsentTokenValid,
  protectedResourceMetadata,
  registerMcpOAuthClient,
  verifyMcpOAuthAccessToken,
} from "./oauth";
import { allowedMcpScopesForClaims } from "./scopes";
import { TenantMembershipStatus, TenantRole } from "@sblyvwx/cloud-contracts";

vi.mock("server-only", () => ({}));

const {
  mockGetTenantContext,
  mockGetTenantIdForHostname,
  mockGetUser,
  mockVerifySessionCookie,
} = vi.hoisted(() => ({
  mockGetTenantContext: vi.fn(),
  mockGetTenantIdForHostname: vi.fn(),
  mockGetUser: vi.fn(),
  mockVerifySessionCookie: vi.fn(),
}));

type StoredDocument = Record<string, unknown>;

const collections = new Map<string, Map<string, StoredDocument>>();

interface MockDocumentSnapshot {
  data(): StoredDocument | undefined;
  exists: boolean;
}

interface MockDocumentReference {
  delete(): void;
  get(): Promise<MockDocumentSnapshot>;
  set(value: StoredDocument): Promise<void>;
  update(value: StoredDocument): Promise<void>;
}

interface MockTransaction {
  delete(ref: MockDocumentReference): void;
  get(ref: MockDocumentReference): Promise<MockDocumentSnapshot>;
}

function collectionStore(name: string): Map<string, StoredDocument> {
  const existing = collections.get(name);

  if (existing) {
    return existing;
  }

  const created = new Map<string, StoredDocument>();
  collections.set(name, created);
  return created;
}

const mockFirestore = {
  collection: vi.fn((collectionName: string) => ({
    doc: vi.fn((documentId: string) => {
      const store = collectionStore(collectionName);

      return {
        delete: vi.fn(() => {
          store.delete(documentId);
        }),
        get: vi.fn(async () => ({
          data: () => store.get(documentId),
          exists: store.has(documentId),
        })),
        set: vi.fn(async (value: StoredDocument) => {
          store.set(documentId, value);
        }),
        update: vi.fn(async (value: StoredDocument) => {
          const current = store.get(documentId);
          if (!current) {
            throw new Error("not found");
          }
          store.set(documentId, { ...current, ...value });
        }),
      } satisfies MockDocumentReference;
    }),
  })),
  runTransaction: vi.fn(
    async <T>(operation: (transaction: MockTransaction) => Promise<T>) =>
      operation({
        delete: (ref) => {
          ref.delete();
        },
        get: (ref) => ref.get(),
      }),
  ),
};

vi.mock("@/lib/firebase/serverApp", () => ({
  adminTenantIdCookieName: "__tenantId",
  getAdminDb: vi.fn(() => mockFirestore),
  getAdminAuth: vi.fn(() => ({
    getUser: mockGetUser,
  })),
  getFirebaseAdminApp: vi.fn(() => ({})),
  getTenantContext: mockGetTenantContext,
  getTenantIdForHostname: mockGetTenantIdForHostname,
  verifySessionCookie: mockVerifySessionCookie,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => mockFirestore),
  Timestamp: {
    fromMillis: vi.fn((millis: number) => ({ millis })),
  },
}));

function s256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function createAdminUser(disabled: boolean = false): {
  customClaims: { admin: true };
  disabled: boolean;
  email: string;
  uid: string;
} {
  return {
    customClaims: {
      admin: true,
    },
    disabled,
    email: "admin@example.com",
    uid: "user-1",
  };
}

function setSaasTenantContext() {
  mockGetTenantContext.mockImplementation((tenantId?: string) => ({
    deploymentMode: "saas",
    requireTenantId: true,
    ...(tenantId ? { tenantId } : {}),
  }));
}

function addTenantMembership(input: {
  accessLevel?: number;
  channelIds?: string[];
  role?: TenantRole;
  tenantId: string;
  uid: string;
}) {
  const id = `${input.tenantId}_${input.uid}`;
  collectionStore("tenantMemberships").set(id, {
    accessLevel: input.accessLevel ?? 1,
    channelIds: input.channelIds ?? [],
    id,
    role: input.role ?? TenantRole.ADMIN,
    status: TenantMembershipStatus.ACTIVE,
    tenantId: input.tenantId,
    uid: input.uid,
  });
}

describe("MCP OAuth", () => {
  beforeEach(() => {
    collections.clear();
    mockGetUser.mockReset();
    mockGetTenantContext.mockReset();
    mockGetTenantContext.mockReturnValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
    });
    mockGetTenantIdForHostname.mockReset();
    mockGetTenantIdForHostname.mockResolvedValue(undefined);
    mockVerifySessionCookie.mockReset();
    mockVerifySessionCookie.mockResolvedValue({
      admin: true,
      uid: "user-1",
    });
    mockGetUser.mockResolvedValue(createAdminUser());
    vi.stubEnv("SESSION_SECRET", "test-mcp-oauth-consent-secret");
  });

  it("rejects non-admin sessions during OAuth authorization", async () => {
    mockVerifySessionCookie.mockResolvedValueOnce({
      admin: false,
      uid: "user-1",
    });
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie",
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/pl/auth/login");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("rejects disabled admin sessions during OAuth authorization", async () => {
    mockGetUser.mockResolvedValueOnce(createAdminUser(true));
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie",
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/pl/auth/login");
  });

  it("treats malformed session cookie encoding as unauthenticated", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=%E0%A4%A",
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/pl/auth/login");
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("advertises MCP OAuth discovery metadata", () => {
    const request = new Request("https://admin.example.com/mcp");

    expect(authorizationServerMetadata(request)).toMatchObject({
      authorization_endpoint: "https://admin.example.com/mcp/oauth/authorize",
      code_challenge_methods_supported: ["S256"],
      issuer: "https://admin.example.com/mcp",
      registration_endpoint: "https://admin.example.com/mcp/oauth/register",
      token_endpoint: "https://admin.example.com/mcp/oauth/token",
    });
    expect(authorizationServerMetadata(request).scopes_supported).toContain(
      "orders:write",
    );
    expect(protectedResourceMetadata(request)).toMatchObject({
      authorization_servers: ["https://admin.example.com/mcp"],
      resource: "https://admin.example.com/mcp",
    });
  });

  it("uses the incoming host when Next normalizes the request URL", () => {
    const request = new Request("http://localhost:3001/mcp", {
      headers: {
        host: "127.0.0.1:3001",
      },
    });

    expect(authorizationServerMetadata(request)).toMatchObject({
      authorization_endpoint: "http://127.0.0.1:3001/mcp/oauth/authorize",
      issuer: "http://127.0.0.1:3001/mcp",
      registration_endpoint: "http://127.0.0.1:3001/mcp/oauth/register",
      token_endpoint: "http://127.0.0.1:3001/mcp/oauth/token",
    });
    expect(protectedResourceMetadata(request)).toMatchObject({
      authorization_servers: ["http://127.0.0.1:3001/mcp"],
      resource: "http://127.0.0.1:3001/mcp",
    });
  });

  it("keeps the incoming host when redirecting to login", async () => {
    mockVerifySessionCookie.mockResolvedValueOnce(null);
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL("http://localhost:3001/mcp/oauth/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          host: "127.0.0.1:3001",
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "http://127.0.0.1:3001/pl/auth/login",
    );
  });

  it("caps scopes by the authenticated user's role", () => {
    expect(allowedMcpScopesForClaims({})).toEqual([
      "user:context",
      "channels:read",
      "products:read",
      "pricing:explain",
    ]);
    expect(allowedMcpScopesForClaims({ admin: true })).toContain(
      "products:read",
    );
    expect(allowedMcpScopesForClaims({ admin: true })).toContain(
      "business:read",
    );
    expect(allowedMcpScopesForClaims({ admin: true })).toContain(
      "drafts:write",
    );
    expect(allowedMcpScopesForClaims({})).not.toContain("business:read");
    expect(allowedMcpScopesForClaims({ admin: true })).not.toContain(
      "products:write",
    );
    expect(
      allowedMcpScopesForClaims({ accessLevel: 9999, admin: true }),
    ).toContain("products:write");
  });

  it("requires consent before authorizing external redirect URIs", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      client_name: "Remote Codex",
      redirect_uris: ["https://devbox.example.internal/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "https://devbox.example.internal/callback",
    );
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");
    authorizeUrl.searchParams.set("state", "state-1");

    const consentResponse = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie",
        },
      }),
    );
    const body = await consentResponse.text();

    expect(consentResponse.status).toBe(200);
    expect(consentResponse.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Remote Codex");
    expect(body).toContain("https://devbox.example.internal/callback");
    expect(body).toContain("products:read");

    const authorizeResponse = await authorizeMcpOAuthRequest(
      new Request("https://admin.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: "__session=session-cookie",
        },
        method: "POST",
      }),
      {
        consentConfirmed: true,
        params: authorizeUrl.searchParams,
      },
    );
    const redirectLocation = authorizeResponse.headers.get("location");

    expect(authorizeResponse.status).toBe(302);
    expect(redirectLocation).toContain(
      "https://devbox.example.internal/callback",
    );
  });

  it("localizes the consent page from the language cookie", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      client_name: "Remote Codex",
      redirect_uris: ["https://devbox.example.internal/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "https://devbox.example.internal/callback",
    );
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");

    const consentResponse = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie; i18next=pl",
        },
      }),
    );
    const body = await consentResponse.text();

    expect(consentResponse.status).toBe(200);
    expect(body).toContain("Zatwierdź dostęp Konfi MCP");
    expect(body).toContain("Żądane zakresy");
    expect(body).toContain("Zatwierdź dostęp");
    expect(body).toContain('lang="pl"');
  });

  it("signs consent pages so loopback-submitted consent can be verified", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:5555/callback/Y6GKE34jDZCg"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:5555/callback/Y6GKE34jDZCg",
    );
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");
    authorizeUrl.searchParams.set("state", "state-1");

    const consentResponse = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie",
        },
      }),
    );
    const body = await consentResponse.text();
    const token = body.match(
      /name="mcp_oauth_consent_token" value="([^"]+)"/,
    )?.[1];
    const params = new URLSearchParams(authorizeUrl.searchParams);
    params.set("mcp_oauth_consent", "allow");
    params.set("mcp_oauth_consent_token", token ?? "");

    expect(token).toBeTruthy();
    expect(
      isMcpOAuthConsentTokenValid(
        new Request("https://admin.example.com/mcp/oauth/authorize", {
          method: "POST",
        }),
        params,
      ),
    ).toBe(true);

    params.set("redirect_uri", "http://127.0.0.1:5555/changed");

    expect(
      isMcpOAuthConsentTokenValid(
        new Request("https://admin.example.com/mcp/oauth/authorize", {
          method: "POST",
        }),
        params,
      ),
    ).toBe(false);
  });

  it("omits undefined optional client fields before storing", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const storedClient = collectionStore("mcpOAuthClients").get(
      String(client.client_id),
    );

    expect(storedClient).not.toHaveProperty("clientName");
    expect(String(client.scope)).toContain("orders:read");
    expect(String(client.scope)).toContain("products:write");
  });

  it("defaults dynamically registered clients to public clients", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
    });
    const storedClient = collectionStore("mcpOAuthClients").get(
      String(client.client_id),
    );

    expect(client).toMatchObject({
      token_endpoint_auth_method: "none",
    });
    expect(client.client_secret).toBeUndefined();
    expect(client.client_secret_expires_at).toBeUndefined();
    expect(storedClient).toMatchObject({
      tokenEndpointAuthMethod: "none",
    });
    expect(storedClient).not.toHaveProperty("clientSecretHash");
  });

  it("exchanges authorization codes for explicit confidential clients", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "client_secret_post",
    });
    const clientId = String(client.client_id);
    const clientSecret = String(client.client_secret);
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");

    const authorizeResponse = await authorizeMcpOAuthRequest(
      new Request("https://admin.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: "__session=session-cookie",
        },
        method: "POST",
      }),
      {
        consentConfirmed: true,
        params: authorizeUrl.searchParams,
      },
    );
    const redirectUrl = new URL(
      authorizeResponse.headers.get("location") ?? "",
    );
    const code = redirectUrl.searchParams.get("code");

    expect(code).toBeTruthy();

    const tokenResponse = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code ?? "",
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1/callback",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );

    expect(tokenResponse).toMatchObject({
      scope: "products:read",
      token_type: "Bearer",
    });
  });

  it("rejects unsupported token endpoint auth methods", async () => {
    await expect(
      registerMcpOAuthClient({
        redirect_uris: ["http://127.0.0.1/callback"],
        token_endpoint_auth_method: "client_secret_typo",
      }),
    ).rejects.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("enforces the registered token endpoint auth method", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    });
    const clientId = String(client.client_id);
    const clientSecret = String(client.client_secret);

    await expect(
      exchangeMcpOAuthToken(
        new Request("https://admin.example.com/mcp/oauth/token", {
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: "missing-refresh-token",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      ),
    ).rejects.toMatchObject({
      error: "invalid_client",
    });

    await expect(
      exchangeMcpOAuthToken(
        new Request("https://admin.example.com/mcp/oauth/token", {
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: "missing-refresh-token",
          }),
          headers: {
            authorization: `Basic ${Buffer.from(
              `${clientId}:${clientSecret}`,
            ).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      ),
    ).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("rejects refresh tokens for disabled admin users", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const refreshToken = "refresh-token";
    collectionStore("mcpOAuthRefreshTokens").set(s256(refreshToken), {
      adminUid: "user-1",
      clientId: String(client.client_id),
      createdAtMs: Date.now(),
      expiresAt: { millis: Date.now() + 60_000 },
      expiresAtMs: Date.now() + 60_000,
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });
    mockGetUser.mockResolvedValueOnce(createAdminUser(true));

    await expect(
      exchangeMcpOAuthToken(
        new Request("https://admin.example.com/mcp/oauth/token", {
          body: new URLSearchParams({
            client_id: String(client.client_id),
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      ),
    ).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("exchanges refresh tokens for active admin users", async () => {
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const refreshToken = "refresh-token";
    collectionStore("mcpOAuthRefreshTokens").set(s256(refreshToken), {
      adminUid: "user-1",
      clientId: String(client.client_id),
      createdAtMs: Date.now(),
      expiresAt: { millis: Date.now() + 60_000 },
      expiresAtMs: Date.now() + 60_000,
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });

    const response = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: String(client.client_id),
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );

    expect(response).toMatchObject({
      scope: "products:read",
      token_type: "Bearer",
    });
    expect(typeof response.access_token).toBe("string");
    expect(typeof response.refresh_token).toBe("string");
  });

  it("registers a public client and exchanges an authorization code with PKCE", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const clientId = client.client_id;

    expect(typeof clientId).toBe("string");
    expect(client).toMatchObject({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });

    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(clientId));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");
    authorizeUrl.searchParams.set("state", "state-1");

    const consentResponse = await authorizeMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: "__session=session-cookie",
        },
      }),
    );
    const consentBody = await consentResponse.text();

    expect(consentResponse.status).toBe(200);
    expect(consentResponse.headers.get("content-type")).toContain("text/html");
    expect(consentBody).toContain("Codex");
    expect(consentBody).toContain("http://127.0.0.1/callback");
    expect(consentBody).toContain("products:read");

    const authorizeResponse = await authorizeMcpOAuthRequest(
      new Request("https://admin.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: "__session=session-cookie",
        },
        method: "POST",
      }),
      {
        consentConfirmed: true,
        params: authorizeUrl.searchParams,
      },
    );
    const redirectLocation = authorizeResponse.headers.get("location");

    expect(authorizeResponse.status).toBe(302);
    expect(redirectLocation).toBeTruthy();

    const redirectUrl = new URL(redirectLocation ?? "");
    const code = redirectUrl.searchParams.get("code");

    expect(redirectUrl.searchParams.get("state")).toBe("state-1");
    expect(code).toBeTruthy();
    expect(
      collectionStore("mcpOAuthAuthorizationCodes").get(s256(code ?? "")),
    ).toHaveProperty("expiresAt");

    const tokenResponse = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: String(clientId),
          code: code ?? "",
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1/callback",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );

    expect(tokenResponse).toMatchObject({
      expires_in: 3600,
      scope: "products:read",
      token_type: "Bearer",
    });
    expect(typeof tokenResponse.access_token).toBe("string");
    expect(typeof tokenResponse.refresh_token).toBe("string");
    expect(
      collectionStore("mcpOAuthAccessTokens").get(
        s256(String(tokenResponse.access_token)),
      ),
    ).toHaveProperty("expiresAt");
    expect(
      collectionStore("mcpOAuthRefreshTokens").get(
        s256(String(tokenResponse.refresh_token)),
      ),
    ).toHaveProperty("expiresAt");

    const verified = await verifyMcpOAuthAccessToken(
      String(tokenResponse.access_token),
    );

    expect(verified).toMatchObject({
      adminUid: "user-1",
      clientId,
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });

    await expect(
      exchangeMcpOAuthToken(
        new Request("https://admin.example.com/mcp/oauth/token", {
          body: new URLSearchParams({
            client_id: String(clientId),
            code: code ?? "",
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: "http://127.0.0.1/callback",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        }),
      ),
    ).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("persists and verifies the authorized tenant for SaaS admin OAuth tokens", async () => {
    setSaasTenantContext();
    addTenantMembership({
      channelIds: ["channel-1"],
      tenantId: "tenant-a",
      uid: "user-1",
    });
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "user:context products:read",
      token_endpoint_auth_method: "none",
    });
    const clientId = String(client.client_id);
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "products:read");

    const authorizeResponse = await authorizeMcpOAuthRequest(
      new Request("https://admin.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: "__session=session-cookie; __tenantId=tenant-a",
        },
        method: "POST",
      }),
      {
        consentConfirmed: true,
        params: authorizeUrl.searchParams,
      },
    );
    const redirectUrl = new URL(
      authorizeResponse.headers.get("location") ?? "",
    );
    const code = redirectUrl.searchParams.get("code");

    expect(code).toBeTruthy();
    expect(
      collectionStore("mcpOAuthAuthorizationCodes").get(s256(code ?? "")),
    ).toMatchObject({
      adminUid: "user-1",
      tenantId: "tenant-a",
    });

    const tokenResponse = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: clientId,
          code: code ?? "",
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1/callback",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );
    const accessToken = String(tokenResponse.access_token);
    const refreshToken = String(tokenResponse.refresh_token);

    expect(
      collectionStore("mcpOAuthAccessTokens").get(s256(accessToken)),
    ).toMatchObject({
      adminUid: "user-1",
      tenantId: "tenant-a",
    });
    expect(
      collectionStore("mcpOAuthRefreshTokens").get(s256(refreshToken)),
    ).toMatchObject({
      adminUid: "user-1",
      tenantId: "tenant-a",
    });

    await expect(verifyMcpOAuthAccessToken(accessToken)).resolves.toMatchObject(
      {
        adminUid: "user-1",
        tenantId: "tenant-a",
      },
    );

    const refreshedResponse = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );
    const refreshedAccessToken = String(refreshedResponse.access_token);

    expect(
      collectionStore("mcpOAuthAccessTokens").get(s256(refreshedAccessToken)),
    ).toMatchObject({
      adminUid: "user-1",
      tenantId: "tenant-a",
    });
  });

  it("grants tenant owners write scopes when the client uses default admin scopes", async () => {
    setSaasTenantContext();
    addTenantMembership({
      accessLevel: 5000,
      role: TenantRole.OWNER,
      tenantId: "tenant-a",
      uid: "user-1",
    });
    const verifier = "correct-horse-battery-staple";
    const client = await registerMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const clientId = String(client.client_id);
    const authorizeUrl = new URL(
      "https://admin.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const authorizeResponse = await authorizeMcpOAuthRequest(
      new Request("https://admin.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: "__session=session-cookie; __tenantId=tenant-a",
        },
        method: "POST",
      }),
      {
        consentConfirmed: true,
        params: authorizeUrl.searchParams,
      },
    );
    const redirectUrl = new URL(
      authorizeResponse.headers.get("location") ?? "",
    );
    const code = redirectUrl.searchParams.get("code");

    const tokenResponse = await exchangeMcpOAuthToken(
      new Request("https://admin.example.com/mcp/oauth/token", {
        body: new URLSearchParams({
          client_id: clientId,
          code: code ?? "",
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1/callback",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );

    expect(String(tokenResponse.scope)).toContain("products:write");
    expect(String(tokenResponse.scope)).toContain("business:write");
  });

  it("caches verified access tokens briefly", async () => {
    const token = "cached-access-token";
    collectionStore("mcpOAuthAccessTokens").set(s256(token), {
      adminUid: "user-1",
      clientId: "client-1",
      createdAtMs: Date.now(),
      expiresAt: { millis: Date.now() + 60_000 },
      expiresAtMs: Date.now() + 60_000,
      jti: "token-jti",
      resource: "https://admin.example.com/mcp",
      scopes: ["products:read"],
    });
    mockFirestore.collection.mockClear();

    await expect(verifyMcpOAuthAccessToken(token)).resolves.toMatchObject({
      clientId: "client-1",
    });
    await expect(verifyMcpOAuthAccessToken(token)).resolves.toMatchObject({
      clientId: "client-1",
    });

    expect(
      mockFirestore.collection.mock.calls.filter(
        ([collectionName]) => collectionName === "mcpOAuthAccessTokens",
      ),
    ).toHaveLength(1);
  });
});
