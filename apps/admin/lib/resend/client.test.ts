import { createCipheriv } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";
import { getResendConfig, resolveResendSenderAddress } from "./client";

vi.mock("server-only", () => ({}));

vi.mock("resend", () => ({
  Resend: vi.fn(),
}));

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
const integrationKey = "resend";
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

describe("getResendConfig", () => {
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
      NEXT_PUBLIC_SHORT_COMPANY_NAME: "Dedicated Mail",
      NO_REPLY_EMAIL: "noreply@dedicated.example",
      RESEND_API_KEY: "dedicated-resend-key",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });

    await expect(getResendConfig()).resolves.toEqual({
      apiKey: "dedicated-resend-key",
      fromEmail: "noreply@dedicated.example",
      fromName: "Dedicated Mail",
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
      NO_REPLY_EMAIL: "noreply@tenant-b.example",
      RESEND_API_KEY: "tenant-b-resend-key",
    };
    mocks.documentExists = true;
    mocks.documentData = {
      integrationKey,
      metadata: {
        resend: {
          encryptedApiKey: encryptForTest({
            plaintext: "tenant-a-resend-key",
            tenantId: "tenant-a",
          }),
          fromEmail: "noreply@tenant-a.example",
          fromName: "Tenant A",
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

    await expect(getResendConfig()).resolves.toEqual({
      apiKey: "tenant-a-resend-key",
      fromEmail: "noreply@tenant-a.example",
      fromName: "Tenant A",
    });
  });

  it("does not use process-wide credentials in SaaS mode", async () => {
    process.env = {
      ...originalEnv,
      KONFI_DEPLOYMENT_MODE: "saas",
      KONFI_TENANT_ID: "tenant-a",
      NO_REPLY_EMAIL: "noreply@tenant-b.example",
      RESEND_API_KEY: "tenant-b-resend-key",
    };
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(getResendConfig()).rejects.toThrow(
      "Resend is not configured for this tenant.",
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
        resend: {
          encryptedApiKey: encryptForTest({
            plaintext: "tenant-b-resend-key",
            tenantId: "tenant-b",
          }),
          fromEmail: "noreply@tenant-b.example",
        },
      },
      status: "connected",
      tenantId: "tenant-b",
    };

    await expect(
      getResendConfig({
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("Resend is not connected for this tenant.");
  });
});

describe("resolveResendSenderAddress", () => {
  it("uses the tenant sender name when configured", () => {
    expect(
      resolveResendSenderAddress({
        fromEmail: "noreply@tenant.example",
        fromName: "Tenant Mail",
      }),
    ).toBe("Tenant Mail <noreply@tenant.example>");
  });

  it("does not wrap preformatted sender addresses", () => {
    expect(
      resolveResendSenderAddress({
        fromEmail: "Tenant Mail <noreply@tenant.example>",
      }),
    ).toBe("Tenant Mail <noreply@tenant.example>");
  });
});
