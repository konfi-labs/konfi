import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
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

describe("admin integration secret crypto", () => {
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

  describe("encryptIntegrationSecret", () => {
    it("round-trips: encrypt then decrypt returns original plaintext", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-06": "0123456789abcdef0123456789abcdef",
        }),
      };
      const scope = { integrationKey: "stripe", tenantId: "tenant-x" };
      const plaintext = "super-secret-stripe-key";

      const encrypted = encryptIntegrationSecret({ plaintext, scope });

      expect(isEncryptedIntegrationSecret(encrypted)).toBe(true);
      expect(encrypted.algorithm).toBe("aes-256-gcm");
      expect(encrypted.keyVersion).toBe("2026-06");
      expect(
        decryptIntegrationSecret({ encrypted, scope }),
      ).toBe(plaintext);
    });

    it("decrypt fails when scope (AAD) differs from encryption scope", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-06": "0123456789abcdef0123456789abcdef",
        }),
      };
      const plaintext = "secret-value";
      const encryptScope = { integrationKey: "meta", tenantId: "tenant-a" };
      const decryptScope = { integrationKey: "meta", tenantId: "tenant-b" };

      const encrypted = encryptIntegrationSecret({
        plaintext,
        scope: encryptScope,
      });

      expect(() =>
        decryptIntegrationSecret({ encrypted, scope: decryptScope }),
      ).toThrow();
    });

    it("uses KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION when set", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-05": "0123456789abcdef0123456789abcdef",
          "2026-06": "abcdef0123456789abcdef0123456789",
        }),
        KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION: "2026-06",
      };
      const scope = { integrationKey: "resend", tenantId: "tenant-y" };
      const encrypted = encryptIntegrationSecret({
        plaintext: "api-key",
        scope,
      });

      expect(encrypted.keyVersion).toBe("2026-06");
      expect(
        decryptIntegrationSecret({ encrypted, scope }),
      ).toBe("api-key");
    });

    it("falls back to single-entry keyring when ACTIVE_KEY_VERSION is not set", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-05": "0123456789abcdef0123456789abcdef",
        }),
      };
      const scope = { integrationKey: "resend", tenantId: "tenant-z" };
      const encrypted = encryptIntegrationSecret({
        plaintext: "only-key",
        scope,
      });

      expect(encrypted.keyVersion).toBe("2026-05");
    });

    it("throws when multi-key keyring has no ACTIVE_KEY_VERSION set", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-05": "0123456789abcdef0123456789abcdef",
          "2026-06": "abcdef0123456789abcdef0123456789",
        }),
      };
      const scope = { integrationKey: "resend", tenantId: "tenant-z" };

      expect(() =>
        encryptIntegrationSecret({ plaintext: "val", scope }),
      ).toThrow(
        "KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION must be set when the keyring contains more than one key.",
      );
    });

    it("throws when ACTIVE_KEY_VERSION points to a missing keyring entry", () => {
      process.env = {
        ...originalEnv,
        KONFI_INTEGRATION_SECRETS_KEYRING: JSON.stringify({
          "2026-06": "abcdef0123456789abcdef0123456789",
        }),
        KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION: "2026-99",
      };
      const scope = { integrationKey: "resend", tenantId: "tenant-z" };

      expect(() =>
        encryptIntegrationSecret({ plaintext: "val", scope }),
      ).toThrow(
        `KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION "2026-99" is not present in KONFI_INTEGRATION_SECRETS_KEYRING.`,
      );
    });
  });
});
