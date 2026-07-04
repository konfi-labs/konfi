import { createCipheriv } from "node:crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { EncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  documentData: undefined as Record<string, unknown> | undefined,
  documentExists: false,
  getTenantContextForRequest: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() =>
          Promise.resolve({
            data: () => mocks.documentData,
            exists: mocks.documentExists,
          }),
        ),
      })),
    })),
  })),
  getTenantContextForRequest: mocks.getTenantContextForRequest,
}));

const integrationKey = "meta";
const secretKey = "0123456789abcdef0123456789abcdef";

function encryptForTest({
  plaintext,
  tenantId,
}: {
  plaintext: string;
  tenantId: string;
}): EncryptedIntegrationSecret {
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
    algorithm: "aes-256-gcm",
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    keyVersion: "2026-06",
  };
}

const originalEnv = process.env;

let getMetaAppConfig: (typeof import("./meta-config"))["getMetaAppConfig"];

describe("getMetaAppConfig", () => {
  beforeAll(async () => {
    ({ getMetaAppConfig } = await import("./meta-config"));
  }, 30_000);

  beforeEach(() => {
    mocks.documentData = undefined;
    mocks.documentExists = false;
    mocks.getTenantContextForRequest.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env-backed credentials in dedicated mode", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "dedicated",
      META_APP_ID: "dedicated-app-id",
      META_APP_SECRET: "dedicated-app-secret",
      META_GRAPH_API_VERSION: "v23.0",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    await expect(getMetaAppConfig()).resolves.toEqual({
      appId: "dedicated-app-id",
      appSecret: "dedicated-app-secret",
      graphApiVersion: "v23.0",
    });
  }, 15_000);

  it("uses default graph API version when env var absent", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "dedicated",
      META_APP_ID: "app-id",
      META_APP_SECRET: "app-secret",
    };
    delete process.env.META_GRAPH_API_VERSION;
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    const config = await getMetaAppConfig();
    expect(config?.graphApiVersion).toBe("v23.0");
  }, 15_000);

  it("returns null in dedicated mode when env vars are absent", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "dedicated",
    };
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    await expect(getMetaAppConfig()).resolves.toBeNull();
  }, 15_000);

  it("uses tenant-owned encrypted credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION: "2026-06",
      KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
        "2026-06": secretKey,
      }),
      KONFI_TENANT_ID: "tenant-a",
    };
    mocks.documentExists = true;
    mocks.documentData = {
      integrationKey,
      metadata: {
        meta: {
          appId: "tenant-a-app-id",
          encryptedAppSecret: encryptForTest({
            plaintext: "tenant-a-app-secret",
            tenantId: "tenant-a",
          }),
        },
      },
      status: "connected",
      tenantId: "tenant-a",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getMetaAppConfig()).resolves.toEqual({
      appId: "tenant-a-app-id",
      appSecret: "tenant-a-app-secret",
      graphApiVersion: "v23.0",
    });
  });

  it("returns null in SaaS mode when tenant doc is absent", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_TENANT_ID: "tenant-a",
    };
    mocks.documentExists = false;
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getMetaAppConfig()).resolves.toBeNull();
  });

  it("returns null in SaaS mode when appId or encryptedAppSecret is missing", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_TENANT_ID: "tenant-a",
    };
    mocks.documentExists = true;
    mocks.documentData = {
      integrationKey,
      metadata: {
        meta: {
          // appId missing
        },
      },
      status: "connected",
      tenantId: "tenant-a",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getMetaAppConfig()).resolves.toBeNull();
  });
});
