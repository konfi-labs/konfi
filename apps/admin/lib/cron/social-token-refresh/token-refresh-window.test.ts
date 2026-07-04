import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCipheriv } from "node:crypto";

vi.mock("server-only", () => ({}));

// ──────────────────────────────────────────────────────────────────────────────
// Hoist mocks
// ──────────────────────────────────────────────────────────────────────────────

const integrationKey = "meta";
const secretKey = "0123456789abcdef0123456789abcdef";

function encryptForTest(plaintext: string, tenantId: string) {
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secretKey), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(`${tenantId}:${integrationKey}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    algorithm: "aes-256-gcm" as const,
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    keyVersion: "2026-06",
  };
}

const TENANT_ID = "tenant-refresh-test";

const mocks = vi.hoisted(() => {
  let docData: Record<string, unknown> | undefined;
  let docExists = false;
  let setCallArgs: unknown[] = [];
  let appConfigData: unknown = null;

  return {
    get docData() {
      return docData;
    },
    set docData(v) {
      docData = v;
    },
    get docExists() {
      return docExists;
    },
    set docExists(v) {
      docExists = v;
    },
    get setCallArgs() {
      return setCallArgs;
    },
    set setCallArgs(v) {
      setCallArgs = v;
    },
    get appConfigData() {
      return appConfigData;
    },
    set appConfigData(v) {
      appConfigData = v;
    },
  };
});

const exchangeMock = vi.fn();
const setMock = vi.fn((...args: unknown[]) => {
  mocks.setCallArgs = args;
  return Promise.resolve();
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: mocks.docExists,
          data: () => mocks.docData,
        })),
        set: setMock,
      })),
    })),
  })),
}));

vi.mock("@/lib/social/meta-auth", () => ({
  exchangeForLongLivedUserToken: exchangeMock,
}));

vi.mock("@/lib/social/meta-config", () => ({
  getMetaAppConfig: vi.fn(async () => mocks.appConfigData),
}));

vi.mock("@/lib/social/meta-credentials", () => ({
  markMetaIntegrationNeedsAttention: vi.fn(),
}));

const originalEnv = process.env;

const tenantContext = {
  deploymentMode: "saas" as const,
  requireTenantId: true,
  tenantId: TENANT_ID,
};

let refreshMetaTokenForTenant: (typeof import("./index"))["refreshMetaTokenForTenant"];

describe("refreshMetaTokenForTenant — window logic", () => {
  beforeAll(async () => {
    ({ refreshMetaTokenForTenant } = await import("./index"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docExists = false;
    mocks.docData = undefined;
    mocks.setCallArgs = [];
    mocks.appConfigData = {
      appId: "app-id",
      appSecret: "app-secret",
      graphApiVersion: "v23.0",
    };
    process.env = {
      ...originalEnv,
      KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
        "2026-06": secretKey,
      }),
      KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION: "2026-06",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns not_connected when doc does not exist", async () => {
    mocks.docExists = false;
    const result = await refreshMetaTokenForTenant(tenantContext);
    expect(result.outcome).toBe("not_connected");
  }, 15_000);

  it("returns not_connected when status is not 'connected'", async () => {
    mocks.docExists = true;
    mocks.docData = { status: "needs_attention", metadata: {} };
    const result = await refreshMetaTokenForTenant(tenantContext);
    expect(result.outcome).toBe("not_connected");
  }, 15_000);

  it("returns skipped when token expiry is more than 15 days away", async () => {
    const farFuture = Date.now() + 20 * 24 * 60 * 60 * 1000; // 20 days
    mocks.docExists = true;
    mocks.docData = {
      status: "connected",
      tenantId: TENANT_ID,
      metadata: {
        meta: {
          encryptedUserToken: encryptForTest("user-token", TENANT_ID),
          userTokenExpiresAt: farFuture,
        },
      },
    };
    const result = await refreshMetaTokenForTenant(tenantContext);
    expect(result.outcome).toBe("skipped");
    expect(exchangeMock).not.toHaveBeenCalled();
  }, 15_000);

  it("refreshes when token expiry is within 15 days", async () => {
    const soonExpiry = Date.now() + 10 * 24 * 60 * 60 * 1000; // 10 days
    const newExpiry = Date.now() + 60 * 24 * 60 * 60 * 1000;
    mocks.docExists = true;
    mocks.docData = {
      status: "connected",
      tenantId: TENANT_ID,
      metadata: {
        meta: {
          encryptedUserToken: encryptForTest("user-token", TENANT_ID),
          userTokenExpiresAt: soonExpiry,
        },
      },
    };
    exchangeMock.mockResolvedValueOnce({
      accessToken: "new-long-lived-token",
      expiresAt: newExpiry,
    });

    const result = await refreshMetaTokenForTenant(tenantContext);
    expect(result.outcome).toBe("refreshed");
    expect(exchangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ shortLivedToken: "user-token" }),
    );
    expect(setMock).toHaveBeenCalled();
  }, 15_000);

  it("refreshes when token is already expired (expiresAt in the past)", async () => {
    const pastExpiry = Date.now() - 1000;
    const newExpiry = Date.now() + 60 * 24 * 60 * 60 * 1000;
    mocks.docExists = true;
    mocks.docData = {
      status: "connected",
      tenantId: TENANT_ID,
      metadata: {
        meta: {
          encryptedUserToken: encryptForTest("expired-token", TENANT_ID),
          userTokenExpiresAt: pastExpiry,
        },
      },
    };
    exchangeMock.mockResolvedValueOnce({
      accessToken: "refreshed-token",
      expiresAt: newExpiry,
    });

    const result = await refreshMetaTokenForTenant(tenantContext);
    expect(result.outcome).toBe("refreshed");
  });

  it("returns failed and marks needs_attention on exchange error", async () => {
    const soonExpiry = Date.now() + 5 * 24 * 60 * 60 * 1000;
    mocks.docExists = true;
    mocks.docData = {
      status: "connected",
      tenantId: TENANT_ID,
      metadata: {
        meta: {
          encryptedUserToken: encryptForTest("user-token", TENANT_ID),
          userTokenExpiresAt: soonExpiry,
        },
      },
    };
    exchangeMock.mockRejectedValueOnce(
      new Error("Graph API error 190: Invalid token"),
    );

    const { markMetaIntegrationNeedsAttention } =
      await import("@/lib/social/meta-credentials");

    const result = await refreshMetaTokenForTenant(tenantContext);

    expect(result.outcome).toBe("failed");
    expect(markMetaIntegrationNeedsAttention).toHaveBeenCalledWith(
      tenantContext,
      expect.stringContaining("Invalid token"),
    );
  });
});
