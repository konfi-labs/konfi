import "server-only";

import { createDecipheriv, createHash } from "node:crypto";

const algorithm = "aes-256-gcm";
const authTagByteLength = 16;
const requiredKeyByteLength = 32;
const hexEncodedSecretKeyPattern = /^[\da-f]{64}$/iu;
const versionPattern = /^[a-zA-Z0-9_.:-]+$/u;

export interface EncryptedIntegrationSecret {
  algorithm: typeof algorithm;
  authTag: string;
  ciphertext: string;
  iv: string;
  keyVersion: string;
}

interface IntegrationSecretScope {
  integrationKey: string;
  tenantId: string;
}

function decodeIntegrationSecretsKey(
  raw: string,
  variableName: string,
): Buffer {
  if (!raw) {
    throw new Error(`${variableName} is not configured.`);
  }

  if (raw.startsWith("base64:")) {
    const decoded = Buffer.from(raw.slice("base64:".length), "base64");

    if (decoded.length !== requiredKeyByteLength) {
      throw new Error(`${variableName} base64 value must decode to 32 bytes.`);
    }

    return decoded;
  }

  if (hexEncodedSecretKeyPattern.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const bytes = Buffer.from(raw, "utf8");
  if (bytes.length === requiredKeyByteLength) {
    return bytes;
  }

  if (bytes.length < requiredKeyByteLength) {
    throw new Error(`${variableName} must be at least 32 bytes.`);
  }

  return createHash("sha256").update(bytes).digest();
}

function readIntegrationSecretsKeyring(): Map<string, Buffer> {
  const raw = process.env.KONFI_INTEGRATION_SECRETS_KEYRING?.trim();

  if (!raw) {
    throw new Error("KONFI_INTEGRATION_SECRETS_KEYRING is not configured.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("KONFI_INTEGRATION_SECRETS_KEYRING must be a JSON object.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("KONFI_INTEGRATION_SECRETS_KEYRING must be a JSON object.");
  }

  return new Map(
    Object.entries(parsed).map(([version, value]) => {
      if (!versionPattern.test(version)) {
        throw new Error(`Invalid integration secret key version "${version}".`);
      }

      if (typeof value !== "string") {
        throw new Error(
          `KONFI_INTEGRATION_SECRETS_KEYRING.${version} must be a string.`,
        );
      }

      return [
        version,
        decodeIntegrationSecretsKey(
          value.trim(),
          `KONFI_INTEGRATION_SECRETS_KEYRING.${version}`,
        ),
      ] as const;
    }),
  );
}

function readIntegrationSecretsKey(keyVersion: string): Buffer {
  const keyring = readIntegrationSecretsKeyring();
  const key = keyring.get(keyVersion);

  if (key) {
    return key;
  }

  throw new Error(
    `Unsupported encrypted integration secret key version "${keyVersion}".`,
  );
}

function additionalAuthenticatedData({
  integrationKey,
  tenantId,
}: IntegrationSecretScope): Buffer {
  return Buffer.from(`${tenantId}:${integrationKey}`, "utf8");
}

export function isEncryptedIntegrationSecret(
  value: unknown,
): value is EncryptedIntegrationSecret {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<EncryptedIntegrationSecret>;

  return (
    candidate.algorithm === algorithm &&
    typeof candidate.keyVersion === "string" &&
    typeof candidate.authTag === "string" &&
    typeof candidate.ciphertext === "string" &&
    typeof candidate.iv === "string"
  );
}

export function decryptIntegrationSecret({
  encrypted,
  scope,
}: {
  encrypted: EncryptedIntegrationSecret;
  scope: IntegrationSecretScope;
}): string {
  const decipher = createDecipheriv(
    algorithm,
    readIntegrationSecretsKey(encrypted.keyVersion),
    Buffer.from(encrypted.iv, "base64"),
    { authTagLength: authTagByteLength },
  );
  decipher.setAAD(additionalAuthenticatedData(scope));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
