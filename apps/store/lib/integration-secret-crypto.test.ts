import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptIntegrationSecret,
  type EncryptedIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "./integration-secret-crypto";

vi.mock("server-only", () => ({}));

const originalEnv = process.env;

const encryptFixture = ({
  key,
  keyVersion,
  plaintext,
  scope,
}: {
  key: string;
  keyVersion: string;
  plaintext: string;
  scope: { integrationKey: string; tenantId: string };
}): EncryptedIntegrationSecret => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "utf8"), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(
    Buffer.from(`${scope.tenantId}:${scope.integrationKey}`, "utf8"),
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: "aes-256-gcm",
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    keyVersion,
  };
};

describe("store integration secret crypto", () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  it("requires the configured keyring", () => {
    process.env = {
      ...originalEnv,
    };
    const encrypted = encryptFixture({
      key: "0123456789abcdef0123456789abcdef",
      keyVersion: "2026-06",
      plaintext: "stripe-secret",
      scope: { integrationKey: "stripe", tenantId: "tenant-a" },
    });

    expect(isEncryptedIntegrationSecret(encrypted)).toBe(true);
    expect(() =>
      decryptIntegrationSecret({
        encrypted,
        scope: { integrationKey: "stripe", tenantId: "tenant-a" },
      }),
    ).toThrow("KONFI_INTEGRATION_SECRETS_KEYRING is not configured.");
  });

  it("decrypts rotated keyring secrets by stored key version", () => {
    process.env = {
      ...originalEnv,
      KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
        "2026-05": "0123456789abcdef0123456789abcdef",
        "2026-06": "abcdef0123456789abcdef0123456789",
      }),
    };
    const encrypted = encryptFixture({
      key: "abcdef0123456789abcdef0123456789",
      keyVersion: "2026-06",
      plaintext: "przelewy24-secret",
      scope: { integrationKey: "przelewy24", tenantId: "tenant-b" },
    });

    expect(isEncryptedIntegrationSecret(encrypted)).toBe(true);
    expect(
      decryptIntegrationSecret({
        encrypted,
        scope: { integrationKey: "przelewy24", tenantId: "tenant-b" },
      }),
    ).toBe("przelewy24-secret");
  });
});
