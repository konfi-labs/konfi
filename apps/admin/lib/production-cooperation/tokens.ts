import "server-only";

import { createDecipheriv, createHash } from "node:crypto";
import {
  type ProductionCooperationRequestPayload,
  type ProductionCooperationTokenAction,
  productionCooperationTokenActions,
} from "@sblyvwx/cloud-contracts";
import { jwtDecrypt, type JWTPayload } from "jose";
import {
  ProductionCooperationError,
  type ProductionCooperationTokenValidation,
} from "./types";

const cooperationTokenAudience = "konfi-production-cooperation";
const cloudTokenVersion = "pc1";

function getTokenSecret(): string {
  const secret =
    process.env.SESSION_SECRET?.trim() || process.env.ENCRYPTION_SECRET?.trim();

  if (!secret) {
    throw new ProductionCooperationError(
      "unavailable",
      "Production cooperation token secret is not configured.",
      503,
    );
  }

  return secret;
}

function getEncryptionKey(): Uint8Array {
  return createHash("sha256").update(getTokenSecret(), "utf8").digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTokenAction(
  value: string | undefined,
): value is ProductionCooperationTokenAction {
  return productionCooperationTokenActions.includes(
    value as ProductionCooperationTokenAction,
  );
}

function readAudience(
  record: Record<string, unknown>,
  payload: JWTPayload,
): string | undefined {
  const explicitAudience = readString(record, "audience");
  if (explicitAudience) {
    return explicitAudience;
  }

  if (typeof payload.aud === "string") {
    return payload.aud;
  }

  if (Array.isArray(payload.aud)) {
    return payload.aud.find((value) => value === cooperationTokenAudience);
  }
}

function readTokenPayload(
  payload: JWTPayload,
): ProductionCooperationTokenValidation {
  const source = isRecord(payload.data) ? payload.data : payload;

  if (!isRecord(source)) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation token payload is invalid.",
      400,
    );
  }

  const action = readString(source, "action");
  const audience = readAudience(source, payload);
  const expiresAt = readString(source, "expiresAt");
  const issuedAt = readString(source, "issuedAt");
  const jti = readString(source, "jti") ?? readString(payload, "jti");
  const request = isRecord(source.request)
    ? (source.request as unknown as ProductionCooperationRequestPayload)
    : undefined;
  const requestId = readString(source, "requestId");
  const targetParticipantId = readString(source, "targetParticipantId");

  if (
    !isTokenAction(action) ||
    audience !== cooperationTokenAudience ||
    !expiresAt ||
    !issuedAt ||
    !jti ||
    !requestId ||
    !targetParticipantId
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation token payload is invalid.",
      400,
    );
  }

  const expiration = new Date(expiresAt);
  if (
    Number.isNaN(expiration.getTime()) ||
    expiration.getTime() <= Date.now()
  ) {
    throw new ProductionCooperationError(
      "expired",
      "Production cooperation token has expired.",
      410,
    );
  }

  return {
    action,
    payload: {
      action,
      audience: cooperationTokenAudience,
      expiresAt,
      issuedAt,
      jti,
      request,
      requestId,
      targetParticipantId,
    },
  };
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function decryptCloudToken(
  token: string,
): ProductionCooperationTokenValidation {
  const [version, encodedIv, encodedCiphertext, encodedTag] = token.split(".");

  if (
    version !== cloudTokenVersion ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedTag
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation token is malformed.",
      400,
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    decodeBase64Url(encodedIv),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(decodeBase64Url(encodedTag));

  const plaintext = Buffer.concat([
    decipher.update(decodeBase64Url(encodedCiphertext)),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as JWTPayload;

  return readTokenPayload(parsed);
}

export async function validateProductionCooperationToken(
  token: string,
  expectedAction: ProductionCooperationTokenAction,
): Promise<ProductionCooperationTokenValidation> {
  if (!token.trim()) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation token is missing.",
      400,
    );
  }

  try {
    const validation = token.startsWith(`${cloudTokenVersion}.`)
      ? decryptCloudToken(token)
      : readTokenPayload((await jwtDecrypt(token, getEncryptionKey())).payload);

    if (validation.action !== expectedAction) {
      throw new ProductionCooperationError(
        "tampered",
        "Production cooperation token action is invalid.",
        400,
      );
    }

    return validation;
  } catch (error) {
    if (error instanceof ProductionCooperationError) {
      throw error;
    }

    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation token could not be validated.",
      400,
    );
  }
}
