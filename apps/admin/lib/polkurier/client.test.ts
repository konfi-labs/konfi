import { createCipheriv } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";
import { getPolkurierConfig } from "./client";

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
const integrationKey = "polkurier";
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

describe("getPolkurierConfig", () => {
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
      KONFI_DEPLOYMENT_MODE: "dedicated",
      POLKURIER_HOST: "https://polkurier.example.test",
      POLKURIER_LOGIN: "login",
      POLKURIER_TOKEN: "token",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    await expect(getPolkurierConfig()).resolves.toEqual({
      authLogin: "login",
      authToken: "token",
      baseUrl: "https://polkurier.example.test",
    });
  });

  it("uses tenant-owned encrypted credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION: "2026-06",
      KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
        "2026-06": secretKey,
      }),
      KONFI_TENANT_ID: "tenant-a",
      POLKURIER_HOST: "https://tenant-b.example.test",
      POLKURIER_LOGIN: "tenant-b-login",
      POLKURIER_TOKEN: "tenant-b-token",
    };
    mocks.documentExists = true;
    mocks.documentData = {
      integrationKey,
      metadata: {
        polkurier: {
          authLogin: "tenant-a-login",
          baseUrl: "https://tenant-a.example.test",
          encryptedAuthToken: encryptForTest({
            plaintext: "tenant-a-token",
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

    await expect(getPolkurierConfig()).resolves.toEqual({
      authLogin: "tenant-a-login",
      authToken: "tenant-a-token",
      baseUrl: "https://tenant-a.example.test",
    });
  });

  it("does not use process-wide credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_TENANT_ID: "tenant-a",
      POLKURIER_HOST: "https://tenant-b.example.test",
      POLKURIER_LOGIN: "tenant-b-login",
      POLKURIER_TOKEN: "tenant-b-token",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getPolkurierConfig()).rejects.toThrow(
      "Polkurier is not configured for this tenant.",
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
        polkurier: {
          authLogin: "tenant-b-login",
          baseUrl: "https://tenant-b.example.test",
          encryptedAuthToken: encryptForTest({
            plaintext: "tenant-b-token",
            tenantId: "tenant-b",
          }),
        },
      },
      status: "connected",
      tenantId: "tenant-b",
    };

    await expect(
      getPolkurierConfig({
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("Polkurier is not connected for this tenant.");
  });
});
