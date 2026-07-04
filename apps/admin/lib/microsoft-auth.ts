/**
 * Microsoft Token Management Utility
 * Handles token retrieval, decryption, and automatic refresh
 */

import { createHash } from "crypto";
import { refreshAccessToken, type MicrosoftAuthState } from "@konfi/microsoft";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";

export const MICROSOFT_TOKENS_COOKIE = "microsoft_tokens";
export const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_oauth_state";
export const OAUTH_STATE_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

export const MICROSOFT_JWT_ISSUER = "konfi-admin";
export const MICROSOFT_TOKENS_JWT_AUDIENCE = "microsoft_tokens";
export const MICROSOFT_OAUTH_STATE_JWT_AUDIENCE = "microsoft_oauth_state";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Refresh token 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Encryption key (must match callback route)
const ENCRYPTION_SECRET =
  process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET;

/**
 * Get encryption key as Uint8Array (32 bytes for A256GCM)
 */
export function getMicrosoftEncryptionKey(): Uint8Array {
  if (!ENCRYPTION_SECRET) {
    throw new Error(
      "Missing encryption secret. Set SESSION_SECRET or ENCRYPTION_SECRET.",
    );
  }

  // Derive a stable 32-byte key (avoid weak/partial keys from padding/truncation).
  return createHash("sha256").update(ENCRYPTION_SECRET, "utf8").digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface MicrosoftTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
  userEmail: string;
  userName: string;
}

export interface TokenResult {
  accessToken: string;
  tokenData: MicrosoftTokenData;
}

function isMicrosoftAuthState(value: unknown): value is MicrosoftAuthState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.state) &&
    isString(value.codeVerifier) &&
    isString(value.redirectUri) &&
    isNumber(value.createdAt)
  );
}

function isMicrosoftTokenData(value: unknown): value is MicrosoftTokenData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.accessToken) &&
    (value.refreshToken === undefined || isString(value.refreshToken)) &&
    isNumber(value.expiresAt) &&
    isString(value.userId) &&
    isString(value.userEmail) &&
    isString(value.userName)
  );
}

/**
 * Decrypt token data from JWE cookie
 */
async function decryptTokenData(
  encryptedData: string,
): Promise<MicrosoftTokenData | null> {
  try {
    const { payload } = await jwtDecrypt(
      encryptedData,
      getMicrosoftEncryptionKey(),
      {
        issuer: MICROSOFT_JWT_ISSUER,
        audience: MICROSOFT_TOKENS_JWT_AUDIENCE,
      },
    );
    const data: unknown = payload.data;
    return isMicrosoftTokenData(data) ? data : null;
  } catch (error) {
    console.error("Failed to decrypt token data:", error);
    return null;
  }
}

export async function encryptMicrosoftAuthState(
  authState: MicrosoftAuthState,
): Promise<string> {
  return new EncryptJWT({ data: authState })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(MICROSOFT_JWT_ISSUER)
    .setAudience(MICROSOFT_OAUTH_STATE_JWT_AUDIENCE)
    .setExpirationTime(`${OAUTH_STATE_COOKIE_MAX_AGE}s`)
    .encrypt(getMicrosoftEncryptionKey());
}

export async function decryptMicrosoftAuthState(
  encryptedData: string,
): Promise<MicrosoftAuthState | null> {
  try {
    const { payload } = await jwtDecrypt(
      encryptedData,
      getMicrosoftEncryptionKey(),
      {
        issuer: MICROSOFT_JWT_ISSUER,
        audience: MICROSOFT_OAUTH_STATE_JWT_AUDIENCE,
      },
    );
    const data: unknown = payload.data;
    return isMicrosoftAuthState(data) ? data : null;
  } catch (error) {
    console.error("Failed to decrypt auth state:", error);
    return null;
  }
}

/**
 * Encrypt and store token data in cookie
 */
async function encryptAndStoreTokens(
  tokenData: MicrosoftTokenData,
): Promise<void> {
  const cookieStore = await cookies();

  const encryptedTokens = await new EncryptJWT({ data: tokenData })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(MICROSOFT_JWT_ISSUER)
    .setAudience(MICROSOFT_TOKENS_JWT_AUDIENCE)
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .encrypt(getMicrosoftEncryptionKey());

  cookieStore.set(MICROSOFT_TOKENS_COOKIE, encryptedTokens, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * Get Microsoft access token with automatic refresh
 * Returns null if not authenticated or refresh fails
 */
export async function getMicrosoftAccessToken(): Promise<TokenResult | null> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(MICROSOFT_TOKENS_COOKIE);

  if (!tokenCookie) {
    return null;
  }

  // Decrypt token data
  const tokenData = await decryptTokenData(tokenCookie.value);
  if (!tokenData) {
    // Invalid/corrupted token, clear cookie
    cookieStore.delete(MICROSOFT_TOKENS_COOKIE);
    return null;
  }

  const now = Date.now();

  // Check if token needs refresh (expired or will expire soon)
  const needsRefresh = now > tokenData.expiresAt - TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    // Token is still valid
    return {
      accessToken: tokenData.accessToken,
      tokenData,
    };
  }

  // Token needs refresh
  if (!tokenData.refreshToken) {
    // No refresh token available, user needs to re-authenticate
    console.warn("Access token expired and no refresh token available");
    return null;
  }

  console.log("Refreshing Microsoft access token...");

  try {
    const newTokens = await refreshAccessToken(tokenData.refreshToken);

    // Update token data
    const updatedTokenData: MicrosoftTokenData = {
      ...tokenData,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken || tokenData.refreshToken,
      expiresAt: newTokens.expiresAt,
    };

    // Encrypt and store updated tokens
    await encryptAndStoreTokens(updatedTokenData);

    console.log("Microsoft access token refreshed successfully");

    return {
      accessToken: updatedTokenData.accessToken,
      tokenData: updatedTokenData,
    };
  } catch (refreshError) {
    console.error("Failed to refresh Microsoft token:", refreshError);
    // Clear invalid tokens
    cookieStore.delete(MICROSOFT_TOKENS_COOKIE);
    return null;
  }
}

/**
 * Check if user is authenticated with Microsoft
 */
export async function isMicrosoftAuthenticated(): Promise<boolean> {
  const result = await getMicrosoftAccessToken();
  return result !== null;
}

/**
 * Get Microsoft user info from stored token data
 */
export async function getMicrosoftUser(): Promise<{
  id: string;
  email: string;
  name: string;
} | null> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(MICROSOFT_TOKENS_COOKIE);

  if (!tokenCookie) {
    return null;
  }

  const tokenData = await decryptTokenData(tokenCookie.value);
  if (!tokenData) {
    return null;
  }

  return {
    id: tokenData.userId,
    email: tokenData.userEmail,
    name: tokenData.userName,
  };
}
