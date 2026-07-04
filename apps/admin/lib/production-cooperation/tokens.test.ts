import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { ProductionCooperationTokenPayload } from "@sblyvwx/cloud-contracts";
import { EncryptJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateProductionCooperationToken } from "./tokens";
import { ProductionCooperationError } from "./types";

vi.mock("server-only", () => ({}));

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

function tokenPayload(
  overrides: Partial<ProductionCooperationTokenPayload> = {},
): ProductionCooperationTokenPayload {
  const now = new Date("2026-05-17T10:00:00.000Z");

  return {
    action: "review",
    audience: "konfi-production-cooperation",
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    issuedAt: now.toISOString(),
    jti: "token-1",
    requestId: "request-1",
    targetParticipantId: "participant-1",
    ...overrides,
  };
}

async function encryptToken(payload: ProductionCooperationTokenPayload) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(encryptionKey("cooperation-secret"));
}

function encryptCloudToken(payload: ProductionCooperationTokenPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKey("cooperation-secret"),
    iv,
    {
      authTagLength: 16,
    },
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "pc1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

describe("validateProductionCooperationToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("decrypts a valid cooperation token", async () => {
    vi.stubEnv("SESSION_SECRET", "cooperation-secret");
    vi.useFakeTimers({
      now: new Date("2026-05-17T10:00:00.000Z"),
    });

    const token = await encryptToken(tokenPayload());
    const result = await validateProductionCooperationToken(token, "review");

    expect(result.payload.requestId).toBe("request-1");
    expect(result.payload.targetParticipantId).toBe("participant-1");
  });

  it("decrypts Cloud AES-GCM tokens with embedded request payloads", async () => {
    vi.stubEnv("SESSION_SECRET", "cooperation-secret");
    vi.useFakeTimers({
      now: new Date("2026-05-17T10:00:00.000Z"),
    });

    const token = encryptCloudToken(
      tokenPayload({
        request: {
          item: {
            id: "item-1",
            name: "Window decal",
            quantity: 3,
          },
          order: {
            channelId: "channel-1",
            id: "order-1",
            number: "ORD-1",
          },
          sourceParticipantId: "source-1",
          targetParticipantId: "participant-1",
        },
      }),
    );
    const result = await validateProductionCooperationToken(token, "review");

    expect(result.payload.request?.item.name).toBe("Window decal");
  });

  it("rejects an expired cooperation token", async () => {
    vi.stubEnv("SESSION_SECRET", "cooperation-secret");
    vi.useFakeTimers({
      now: new Date("2026-05-17T10:00:00.000Z"),
    });

    const token = await encryptToken(
      tokenPayload({
        expiresAt: "2026-05-17T09:59:00.000Z",
      }),
    );

    await expect(
      validateProductionCooperationToken(token, "review"),
    ).rejects.toMatchObject<Partial<ProductionCooperationError>>({
      code: "expired",
    });
  });

  it("rejects a token for a different action", async () => {
    vi.stubEnv("SESSION_SECRET", "cooperation-secret");
    vi.useFakeTimers({
      now: new Date("2026-05-17T10:00:00.000Z"),
    });

    const token = await encryptToken(tokenPayload({ action: "accept" }));

    await expect(
      validateProductionCooperationToken(token, "decline"),
    ).rejects.toMatchObject<Partial<ProductionCooperationError>>({
      code: "tampered",
    });
  });
});
