import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_PRODUCT_PREVIEW_QUERY_PARAM = "adminPreview";
export const ADMIN_PRODUCT_PREVIEW_COOKIE = "__konfi_admin_product_preview";
export const ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 2;

type AdminProductPreviewSessionPayload = {
  admin: true;
  exp: number;
  iat: number;
  uid: string;
};

export type AdminProductPreviewSession = {
  exp: number;
  uid: string;
};

function getPreviewSecret() {
  const secret =
    process.env.STORE_ADMIN_PREVIEW_SECRET ??
    process.env.ADMIN_PRODUCT_PREVIEW_SECRET ??
    process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!secret) {
    throw new Error(
      "Missing STORE_ADMIN_PREVIEW_SECRET, ADMIN_PRODUCT_PREVIEW_SECRET, or ADMIN_FIREBASE_SERVICE_ACCOUNT for admin product previews.",
    );
  }

  return secret;
}

function encodePayload(payload: AdminProductPreviewSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(
  encodedPayload: string,
): AdminProductPreviewSessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminProductPreviewSessionPayload>;

    if (
      parsed.admin !== true ||
      typeof parsed.uid !== "string" ||
      !parsed.uid.trim() ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed as AdminProductPreviewSessionPayload;
  } catch {
    return null;
  }
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getPreviewSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminProductPreviewSession(
  uid: string,
  nowMs = Date.now(),
) {
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = encodePayload({
    admin: true,
    exp: issuedAt + ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS,
    iat: issuedAt,
    uid,
  });

  return `${payload}.${sign(payload)}`;
}

export function verifyAdminProductPreviewSession(
  session: string | undefined,
  nowMs = Date.now(),
): AdminProductPreviewSession | null {
  if (!session) {
    return null;
  }

  const [payload, signature, ...rest] = session.split(".");
  if (!payload || !signature || rest.length > 0) {
    return null;
  }

  if (!safeEqual(signature, sign(payload))) {
    return null;
  }

  const decoded = decodePayload(payload);
  if (!decoded) {
    return null;
  }

  if (decoded.exp <= Math.floor(nowMs / 1000)) {
    return null;
  }

  return {
    exp: decoded.exp,
    uid: decoded.uid,
  };
}

function getCookieValue(
  headers: Pick<Headers, "get">,
  cookieName: string,
): string | undefined {
  const cookieHeader = headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookiePart of cookieHeader.split(";")) {
    const trimmedPart = cookiePart.trim();

    if (!trimmedPart) {
      continue;
    }

    const separatorIndex = trimmedPart.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmedPart.slice(0, separatorIndex).trim();

    if (name !== cookieName) {
      continue;
    }

    return trimmedPart.slice(separatorIndex + 1);
  }

  return undefined;
}

export function getAdminProductPreviewSessionFromHeaders(
  headers: Pick<Headers, "get">,
) {
  return verifyAdminProductPreviewSession(
    getCookieValue(headers, ADMIN_PRODUCT_PREVIEW_COOKIE),
  );
}

export function isAdminProductPreviewAllowed(
  headers: Pick<Headers, "get">,
) {
  return Boolean(getAdminProductPreviewSessionFromHeaders(headers));
}

export function isAdminProductPreviewRequested(
  value: string | string[] | undefined,
) {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return false;
  }

  return ["1", "true", "admin", "yes"].includes(raw.toLowerCase());
}

export function getAdminProductPreviewCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ADMIN_PRODUCT_PREVIEW_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
