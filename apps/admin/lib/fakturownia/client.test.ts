import { createCipheriv } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";
import { getFakturowniaConfig } from "./client";

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

const originalEnv = process.env;
const integrationKey = "fakturownia";
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

describe("getFakturowniaConfig", () => {
  beforeEach(() => {
    mocks.documentData = undefined;
    mocks.documentExists = false;
    mocks.getTenantContextForRequest.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses env-backed credentials in dedicated mode", async () => {
    process.env = {
      ...originalEnv,
      FAKTUROWNIA_API_KEY: "fakturownia-key",
      FAKTUROWNIA_SUBDOMAIN: "company",
      KONFI_DEPLOYMENT_MODE: "dedicated",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    await expect(getFakturowniaConfig()).resolves.toEqual({
      apiKey: "fakturownia-key",
      baseUrl: "https://company.fakturownia.pl",
    });
  });

  it("uses tenant-owned encrypted credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      FAKTUROWNIA_API_KEY: "tenant-b-key",
      FAKTUROWNIA_SUBDOMAIN: "tenant-b",
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
        fakturownia: {
          encryptedApiKey: encryptForTest({
            plaintext: "tenant-a-key",
            tenantId: "tenant-a",
          }),
          subdomain: "tenant-a",
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

    await expect(getFakturowniaConfig()).resolves.toEqual({
      apiKey: "tenant-a-key",
      baseUrl: "https://tenant-a.fakturownia.pl",
    });
  });

  it("does not use process-wide credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      FAKTUROWNIA_API_KEY: "tenant-b-key",
      FAKTUROWNIA_SUBDOMAIN: "tenant-b",
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_TENANT_ID: "tenant-a",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getFakturowniaConfig()).rejects.toThrow(
      "Fakturownia is not configured for this tenant.",
    );
  });

  it("rejects cross-tenant integration records", async () => {
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
        fakturownia: {
          encryptedApiKey: encryptForTest({
            plaintext: "tenant-b-key",
            tenantId: "tenant-b",
          }),
          subdomain: "tenant-b",
        },
      },
      status: "connected",
      tenantId: "tenant-b",
    };

    await expect(
      getFakturowniaConfig({
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("Fakturownia is not connected for this tenant.");
  });
});
