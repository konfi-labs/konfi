import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  authorizeStoreMcpOAuthRequest,
  exchangeStoreMcpOAuthToken,
  registerStoreMcpOAuthClient,
  storeMcpAuthorizationServerMetadata,
  storeMcpProtectedResourceMetadata,
  verifyStoreMcpOAuthAccessToken,
} from "./oauth";

vi.mock("server-only", () => ({}));

const TEST_STORE_SESSION_COOKIE = "__konfi_store_session";

const { mockGetUser, mockVerifySessionCookie } = vi.hoisted(() => ({
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
  STORE_SESSION_COOKIE: "__konfi_store_session",
  getAdminAuth: vi.fn(() => ({
    getUser: mockGetUser,
  })),
  getFirebaseAdminApp: vi.fn(() => ({})),
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

describe("store MCP OAuth", () => {
  beforeEach(() => {
    collections.clear();
    mockFirestore.collection.mockClear();
    mockGetUser.mockReset();
    mockVerifySessionCookie.mockReset();
    mockVerifySessionCookie.mockResolvedValue({
      uid: "customer-1",
    });
    mockGetUser.mockResolvedValue({
      disabled: false,
      email: "customer@example.com",
      uid: "customer-1",
    });
  });

  it("advertises store MCP OAuth discovery metadata", () => {
    const request = new Request("https://store.example.com/mcp");

    expect(storeMcpAuthorizationServerMetadata(request)).toMatchObject({
      authorization_endpoint: "https://store.example.com/mcp/oauth/authorize",
      issuer: "https://store.example.com/mcp",
      registration_endpoint: "https://store.example.com/mcp/oauth/register",
      token_endpoint: "https://store.example.com/mcp/oauth/token",
    });
    expect(
      storeMcpAuthorizationServerMetadata(request).scopes_supported,
    ).toEqual(["store:context", "store:catalog:read", "store:orders:read"]);
    expect(storeMcpProtectedResourceMetadata(request)).toMatchObject({
      authorization_servers: ["https://store.example.com/mcp"],
      resource: "https://store.example.com/mcp",
    });
  });

  it("uses the incoming host when Next normalizes the request URL", () => {
    const request = new Request("http://localhost:3000/mcp", {
      headers: {
        host: "127.0.0.1:3000",
      },
    });

    expect(storeMcpAuthorizationServerMetadata(request)).toMatchObject({
      authorization_endpoint: "http://127.0.0.1:3000/mcp/oauth/authorize",
      issuer: "http://127.0.0.1:3000/mcp",
      registration_endpoint: "http://127.0.0.1:3000/mcp/oauth/register",
      token_endpoint: "http://127.0.0.1:3000/mcp/oauth/token",
    });
    expect(storeMcpProtectedResourceMetadata(request)).toMatchObject({
      authorization_servers: ["http://127.0.0.1:3000/mcp"],
      resource: "http://127.0.0.1:3000/mcp",
    });
  });

  it("redirects authorization requests without a store session to login", async () => {
    mockVerifySessionCookie.mockResolvedValueOnce(null);
    const verifier = "correct-horse-battery-staple";
    const client = await registerStoreMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://store.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeStoreMcpOAuthRequest(
      new Request(authorizeUrl),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/pl/auth/login");
    expect(response.headers.get("location")).toContain("redirect=");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("keeps the incoming host when redirecting to store login", async () => {
    mockVerifySessionCookie.mockResolvedValueOnce(null);
    const verifier = "correct-horse-battery-staple";
    const client = await registerStoreMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL("http://localhost:3000/mcp/oauth/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeStoreMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          host: "127.0.0.1:3000",
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "http://127.0.0.1:3000/pl/auth/login",
    );
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("treats malformed session cookie encoding as unauthenticated", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerStoreMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const authorizeUrl = new URL(
      "https://store.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(client.client_id));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await authorizeStoreMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: `${TEST_STORE_SESSION_COOKIE}=%E0%A4%A`,
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/pl/auth/login");
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("omits undefined optional client fields before storing", async () => {
    const client = await registerStoreMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
    });
    const storedClient = collectionStore("storeMcpOAuthClients").get(
      String(client.client_id),
    );

    expect(storedClient).not.toHaveProperty("clientName");
    expect(client.scope).toBe(
      "store:context store:catalog:read store:orders:read",
    );
  });

  it("defaults dynamically registered clients to public clients", async () => {
    const client = await registerStoreMcpOAuthClient({
      redirect_uris: ["http://127.0.0.1/callback"],
    });
    const storedClient = collectionStore("storeMcpOAuthClients").get(
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

  it("registers a public client and exchanges an authorization code with PKCE", async () => {
    const verifier = "correct-horse-battery-staple";
    const client = await registerStoreMcpOAuthClient({
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "store:catalog:read store:orders:read",
      token_endpoint_auth_method: "none",
    });
    const clientId = client.client_id;
    const authorizeUrl = new URL(
      "https://store.example.com/mcp/oauth/authorize",
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", String(clientId));
    authorizeUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authorizeUrl.searchParams.set("code_challenge", s256(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "store:orders:read");
    authorizeUrl.searchParams.set("state", "state-1");

    const consentResponse = await authorizeStoreMcpOAuthRequest(
      new Request(authorizeUrl, {
        headers: {
          cookie: `${TEST_STORE_SESSION_COOKIE}=session-cookie`,
        },
      }),
    );
    const consentBody = await consentResponse.text();

    expect(consentResponse.status).toBe(200);
    expect(consentBody).toContain("Codex");
    expect(consentBody).toContain("store:orders:read");

    const authorizeResponse = await authorizeStoreMcpOAuthRequest(
      new Request("https://store.example.com/mcp/oauth/authorize", {
        headers: {
          cookie: `${TEST_STORE_SESSION_COOKIE}=session-cookie`,
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

    expect(authorizeResponse.status).toBe(302);
    expect(redirectUrl.searchParams.get("state")).toBe("state-1");
    expect(code).toBeTruthy();

    const tokenResponse = await exchangeStoreMcpOAuthToken(
      new Request("https://store.example.com/mcp/oauth/token", {
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
      scope: "store:orders:read",
      token_type: "Bearer",
    });
    expect(typeof tokenResponse.access_token).toBe("string");
    expect(typeof tokenResponse.refresh_token).toBe("string");

    const verified = await verifyStoreMcpOAuthAccessToken(
      String(tokenResponse.access_token),
    );

    expect(verified).toMatchObject({
      clientId,
      customerUid: "customer-1",
      resource: "https://store.example.com/mcp",
      scopes: ["store:orders:read"],
    });
  });
});
