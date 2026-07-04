import { createHmac, timingSafeEqual } from "node:crypto";

export const STOREFRONT_EDITOR_TOKEN_VERSION = 1;
export const DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS = 60 * 60 * 4;
export const MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS = 60 * 60 * 8;

export interface StorefrontEditorSession {
  channelId: string;
  expiresAt: number;
  issuedAt: number;
  tenantId: string;
  uid: string;
}

interface StorefrontEditorTokenPayload extends StorefrontEditorSession {
  version: typeof STOREFRONT_EDITOR_TOKEN_VERSION;
}

const base64UrlEncode = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

const base64UrlDecode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

const signingSecret = () => {
  const secret = process.env.KONFI_STOREFRONT_EDITOR_SECRET?.trim();

  if (!secret) {
    throw new Error("KONFI_STOREFRONT_EDITOR_SECRET is not configured.");
  }

  return secret;
};

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const isPayload = (value: unknown): value is StorefrontEditorTokenPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StorefrontEditorTokenPayload>;

  return (
    candidate.version === STOREFRONT_EDITOR_TOKEN_VERSION &&
    typeof candidate.channelId === "string" &&
    typeof candidate.tenantId === "string" &&
    typeof candidate.uid === "string" &&
    typeof candidate.issuedAt === "number" &&
    typeof candidate.expiresAt === "number"
  );
};

export function createStorefrontEditorToken(
  session: Omit<StorefrontEditorSession, "expiresAt" | "issuedAt"> & {
    expiresInSeconds?: number;
  },
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt =
    issuedAt +
    Math.min(
      session.expiresInSeconds ?? DEFAULT_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
      MAX_STOREFRONT_EDITOR_TOKEN_AGE_SECONDS,
    );
  const payload: StorefrontEditorTokenPayload = {
    channelId: session.channelId,
    expiresAt,
    issuedAt,
    tenantId: session.tenantId,
    uid: session.uid,
    version: STOREFRONT_EDITOR_TOKEN_VERSION,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload, signingSecret())}`;
}

export function verifyStorefrontEditorToken(
  token: string | null | undefined,
): StorefrontEditorSession | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature, ...extraParts] = token.split(".");

  if (!(encodedPayload && signature) || extraParts.length > 0) {
    return null;
  }

  if (!safeEqual(signature, sign(encodedPayload, signingSecret()))) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;

    if (!isPayload(parsed)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (parsed.expiresAt <= now || parsed.issuedAt > now + 60) {
      return null;
    }

    return {
      channelId: parsed.channelId,
      expiresAt: parsed.expiresAt,
      issuedAt: parsed.issuedAt,
      tenantId: parsed.tenantId,
      uid: parsed.uid,
    };
  } catch {
    return null;
  }
}
