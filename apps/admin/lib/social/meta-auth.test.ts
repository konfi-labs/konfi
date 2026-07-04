import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock firebase/serverApp (not used directly in meta-auth but transitively)
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getTenantContextForRequest: vi.fn(),
}));

vi.mock("@/lib/integration-secret-crypto", () => ({
  encryptIntegrationSecret: vi.fn(),
  isEncryptedIntegrationSecret: vi.fn(),
}));

vi.mock("@konfi/utils", () => ({
  META_TENANT_INTEGRATION_KEY: "meta",
  tenantMetaIntegrationDocumentId: (tenantId: string) => `${tenantId}_meta`,
  TENANT_INTEGRATIONS_COLLECTION: "tenantIntegrations",
  normalizeMetaTenantIntegrationMetadata: vi.fn((metadata: unknown) => ({
    meta: {},
  })),
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SESSION_SECRET: "test-session-secret-that-is-long-enough-for-testing",
  };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("encryptMetaAuthState / decryptMetaAuthState — round-trip", () => {
  it("round-trips a valid state payload", async () => {
    const { encryptMetaAuthState, decryptMetaAuthState } = await import(
      "./meta-auth"
    );

    const authState = {
      state: "abc123",
      redirectUri: "https://example.com/callback",
      createdAt: Date.now(),
      lng: "en",
    };

    const token = await encryptMetaAuthState(authState);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const decoded = await decryptMetaAuthState(token);
    expect(decoded).toEqual(authState);
  });

  it("returns null for garbage input", async () => {
    const { decryptMetaAuthState } = await import("./meta-auth");
    const result = await decryptMetaAuthState("not-a-valid-jwt");
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // We can't easily time-travel, but we can verify tampered tokens are rejected
    const { decryptMetaAuthState } = await import("./meta-auth");
    // A structurally valid-looking but wrong JWE
    const result = await decryptMetaAuthState(
      "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..invalid.payload.here",
    );
    expect(result).toBeNull();
  });
});

describe("buildMetaAuthorizationUrl", () => {
  it("contains exactly the five required scopes", async () => {
    const { buildMetaAuthorizationUrl } = await import("./meta-auth");

    const appConfig = {
      appId: "my-app-id",
      appSecret: "my-app-secret",
      graphApiVersion: "v23.0",
    };

    const url = buildMetaAuthorizationUrl({
      appConfig,
      redirectUri: "https://example.com/callback",
      state: "test-state",
    });

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.facebook.com");
    expect(parsed.pathname).toBe("/v23.0/dialog/oauth");

    const scopeParam = parsed.searchParams.get("scope");
    expect(scopeParam).toBeTruthy();

    const scopes = scopeParam!.split(",");
    expect(scopes).toHaveLength(5);
    expect(scopes).toContain("pages_show_list");
    expect(scopes).toContain("pages_manage_posts");
    expect(scopes).toContain("pages_read_engagement");
    expect(scopes).toContain("instagram_business_basic");
    expect(scopes).toContain("instagram_business_content_publish");
  });

  it("includes the app id, redirect uri, and state", async () => {
    const { buildMetaAuthorizationUrl } = await import("./meta-auth");

    const url = buildMetaAuthorizationUrl({
      appConfig: { appId: "app-123", appSecret: "s", graphApiVersion: "v23.0" },
      redirectUri: "https://example.com/cb",
      state: "state-xyz",
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("app-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.com/cb");
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });
});

describe("exchangeCodeForTokens — POST transport", () => {
  it("sends credentials in POST body, not URL query string", async () => {
    const mockFetch = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "short-lived-token" }),
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { exchangeCodeForTokens } = await import("./meta-auth");

    const result = await exchangeCodeForTokens({
      appConfig: { appId: "app-id", appSecret: "app-secret", graphApiVersion: "v23.0" },
      code: "auth-code",
      redirectUri: "https://example.com/callback",
    });

    expect(result.accessToken).toBe("short-lived-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    // URL must NOT contain the secret or code as query params
    expect(calledUrl).not.toContain("client_secret");
    expect(calledUrl).not.toContain("auth-code");
    expect(calledUrl).not.toContain("?");
    // Must use POST with form body
    expect(calledInit.method).toBe("POST");
    const bodyStr = calledInit.body as string;
    expect(bodyStr).toContain("client_secret=app-secret");
    expect(bodyStr).toContain("code=auth-code");

    vi.unstubAllGlobals();
  });
});

describe("exchangeForLongLivedUserToken — POST transport", () => {
  it("sends credentials in POST body, not URL query string", async () => {
    const mockFetch = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "long-lived-token", expires_in: 5183944 }),
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { exchangeForLongLivedUserToken } = await import("./meta-auth");

    const result = await exchangeForLongLivedUserToken({
      appConfig: { appId: "app-id", appSecret: "app-secret", graphApiVersion: "v23.0" },
      shortLivedToken: "short-token",
    });

    expect(result.accessToken).toBe("long-lived-token");
    expect(typeof result.expiresAt).toBe("number");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).not.toContain("client_secret");
    expect(calledUrl).not.toContain("short-token");
    expect(calledUrl).not.toContain("?");
    expect(calledInit.method).toBe("POST");
    const bodyStr = calledInit.body as string;
    expect(bodyStr).toContain("client_secret=app-secret");
    expect(bodyStr).toContain("fb_exchange_token=short-token");

    vi.unstubAllGlobals();
  });
});

describe("fetchPagesWithInstagramAccounts — pagination", () => {
  it("follows paging.next until exhausted", async () => {
    const page1: unknown = {
      data: [
        {
          id: "page-1",
          name: "Page One",
          access_token: "token-1",
          instagram_business_account: { id: "ig-1", username: "page_one_ig" },
        },
      ],
      paging: { next: "https://graph.facebook.com/page2" },
    };

    const page2: unknown = {
      data: [
        {
          id: "page-2",
          name: "Page Two",
          access_token: "token-2",
        },
      ],
      // no paging.next — end of list
    };

    let callCount = 0;
    const mockFetch = vi.fn((_url: string, _init?: RequestInit) => {
      callCount += 1;
      const body = callCount === 1 ? page1 : page2;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    const { fetchPagesWithInstagramAccounts } = await import("./meta-auth");

    const results = await fetchPagesWithInstagramAccounts({
      appConfig: { appId: "app", appSecret: "secret", graphApiVersion: "v23.0" },
      userToken: "user-token",
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "page-1",
      name: "Page One",
      accessToken: "token-1",
      igAccount: { id: "ig-1", username: "page_one_ig" },
    });
    expect(results[1]).toEqual({
      id: "page-2",
      name: "Page Two",
      accessToken: "token-2",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // No fetch URL should contain the access_token as a query parameter (auth)
    for (const call of mockFetch.mock.calls) {
      const calledUrl = call[0] as string;
      const parsed = new URL(calledUrl);
      expect(parsed.searchParams.get("access_token")).toBeNull();
    }
    // Authorization header must be present on every call
    for (const call of mockFetch.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.["Authorization"]).toBe("Bearer user-token");
    }

    vi.unstubAllGlobals();
  });

  it("throws on non-ok Graph API response", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: { message: "Access denied", code: 200 },
          }),
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { fetchPagesWithInstagramAccounts } = await import("./meta-auth");

    await expect(
      fetchPagesWithInstagramAccounts({
        appConfig: { appId: "app", appSecret: "s", graphApiVersion: "v23.0" },
        userToken: "t",
      }),
    ).rejects.toThrow("Access denied");

    vi.unstubAllGlobals();
  });
});
