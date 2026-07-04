/**
 * Allegro Token Management Utility
 * Handles OAuth2 Authorization Code flow, token storage, and refresh.
 * Mirrors the pattern from microsoft-auth.ts.
 */

import { createHash } from "crypto";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";

export const ALLEGRO_TOKENS_COOKIE = "allegro_tokens";
export const ALLEGRO_OAUTH_STATE_COOKIE = "allegro_oauth_state";
export const OAUTH_STATE_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

const ALLEGRO_TOKENS_COOKIE_CHUNK_PREFIX = `${ALLEGRO_TOKENS_COOKIE}_chunk_`;
const ALLEGRO_TOKENS_COOKIE_CHUNK_COUNT = `${ALLEGRO_TOKENS_COOKIE}_chunk_count`;
const ALLEGRO_TOKEN_COOKIE_MAX_VALUE_LENGTH = 3500;
const ALLEGRO_TOKEN_COOKIE_MAX_CHUNKS = 20;

const JWT_ISSUER = "konfi-admin";
const TOKENS_JWT_AUDIENCE = "allegro_tokens";
const OAUTH_STATE_JWT_AUDIENCE = "allegro_oauth_state";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Refresh 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const ENCRYPTION_SECRET =
  process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET;

// Allegro OAuth endpoints
const ALLEGRO_AUTH_URL = "https://allegro.pl/auth/oauth/authorize";
const ALLEGRO_TOKEN_URL = "https://allegro.pl/auth/oauth/token";
const ALLEGRO_SANDBOX_AUTH_URL =
  "https://allegro.pl.allegrosandbox.pl/auth/oauth/authorize";
const ALLEGRO_SANDBOX_TOKEN_URL =
  "https://allegro.pl.allegrosandbox.pl/auth/oauth/token";
const ALLEGRO_API_BASE = "https://api.allegro.pl";
const ALLEGRO_SANDBOX_API_BASE = "https://api.allegro.pl.allegrosandbox.pl";

export const ALLEGRO_REQUIRED_SCOPES = [
  "allegro:api:profile:read",
  "allegro:api:orders:read",
  "allegro:api:orders:write",
  "allegro:api:sale:offers:read",
  "allegro:api:sale:offers:write",
  "allegro:api:sale:settings:read",
] as const;

export const ALLEGRO_ORDER_FULFILLMENT_SCOPE =
  "allegro:api:orders:write" as const;

function isSandbox(): boolean {
  const sandboxFlag = process.env.ALLEGRO_SANDBOX?.trim().toLowerCase();
  return sandboxFlag === "true" || sandboxFlag === "1" || sandboxFlag === "yes";
}

export function getAllegroApiBase(): string {
  return isSandbox() ? ALLEGRO_SANDBOX_API_BASE : ALLEGRO_API_BASE;
}

function getAuthUrl(): string {
  return isSandbox() ? ALLEGRO_SANDBOX_AUTH_URL : ALLEGRO_AUTH_URL;
}

function getTokenUrl(): string {
  return isSandbox() ? ALLEGRO_SANDBOX_TOKEN_URL : ALLEGRO_TOKEN_URL;
}

function parseConfiguredAllegroRedirectUrl(): URL | null {
  const redirectUri = process.env.ALLEGRO_REDIRECT_URI?.trim();
  if (!redirectUri) {
    return null;
  }

  try {
    return new URL(redirectUri);
  } catch (error) {
    console.error("Invalid ALLEGRO_REDIRECT_URI value:", error);
    return null;
  }
}

function getConfiguredAdminOrigin(): string | null {
  const value =
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim();

  if (!value) {
    return null;
  }

  try {
    const normalizedValue = /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`;
    return new URL(normalizedValue).origin;
  } catch (error) {
    console.error("Invalid ADMIN_URL/NEXT_PUBLIC_ADMIN_URL value:", error);
    return null;
  }
}

function isAllowedAllegroRedirectProtocol(protocol: string): boolean {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
  if (process.env.NODE_ENV === "production") {
    return protocol === "https:";
  }

  return protocol === "https:" || protocol === "http:";
}

export function getAllegroCallbackUrl(fallbackOrigin: string): string {
  const configuredRedirectUrl = parseConfiguredAllegroRedirectUrl();
  if (
    configuredRedirectUrl &&
    isAllowedAllegroRedirectProtocol(configuredRedirectUrl.protocol)
  ) {
    return configuredRedirectUrl.toString();
  }

  if (configuredRedirectUrl) {
    console.error(
      "ALLEGRO_REDIRECT_URI uses an unsupported protocol. Falling back to request origin.",
    );
  }

  return new URL(
    "/api/auth/callback/allegro",
    getConfiguredAdminOrigin() ?? fallbackOrigin,
  ).toString();
}

export function getAllegroPublicOrigin(fallbackOrigin: string): string {
  const configuredRedirectUrl = parseConfiguredAllegroRedirectUrl();
  if (
    configuredRedirectUrl &&
    isAllowedAllegroRedirectProtocol(configuredRedirectUrl.protocol)
  ) {
    return configuredRedirectUrl.origin;
  }

  if (configuredRedirectUrl) {
    console.error(
      "ALLEGRO_REDIRECT_URI uses an unsupported protocol. Falling back to request origin.",
    );
  }

  return getConfiguredAdminOrigin() ?? fallbackOrigin;
}

export interface AllegroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export function getAllegroConfig(): AllegroConfig {
  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
  const redirectUri = process.env.ALLEGRO_REDIRECT_URI;

  if (!clientId) {
    throw new Error("ALLEGRO_CLIENT_ID environment variable is required");
  }
  if (!clientSecret) {
    throw new Error("ALLEGRO_CLIENT_SECRET environment variable is required");
  }
  return { clientId, clientSecret, redirectUri };
}

// ---------- encryption helpers ----------

function getEncryptionKey(): Uint8Array {
  if (!ENCRYPTION_SECRET) {
    throw new Error(
      "Missing encryption secret. Set SESSION_SECRET or ENCRYPTION_SECRET.",
    );
  }
  return createHash("sha256").update(ENCRYPTION_SECRET, "utf8").digest();
}

export interface AllegroAuthState {
  state: string;
  redirectUri: string;
  createdAt: number;
  channelId?: string;
}

export async function encryptAllegroAuthState(
  authState: AllegroAuthState,
): Promise<string> {
  return new EncryptJWT({ data: authState })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(OAUTH_STATE_JWT_AUDIENCE)
    .setExpirationTime(`${OAUTH_STATE_COOKIE_MAX_AGE}s`)
    .encrypt(getEncryptionKey());
}

export async function decryptAllegroAuthState(
  encryptedData: string,
): Promise<AllegroAuthState | null> {
  try {
    const { payload } = await jwtDecrypt(encryptedData, getEncryptionKey(), {
      issuer: JWT_ISSUER,
      audience: OAUTH_STATE_JWT_AUDIENCE,
    });
    const data = payload.data as AllegroAuthState | undefined;
    if (
      data &&
      typeof data.state === "string" &&
      typeof data.redirectUri === "string" &&
      typeof data.createdAt === "number" &&
      (data.channelId === undefined || typeof data.channelId === "string")
    ) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Failed to decrypt Allegro auth state:", error);
    return null;
  }
}

// ---------- token storage ----------

export interface AllegroTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
  userId: string;
  userLogin: string;
  userEmail?: string;
}

export interface AllegroTokenResult {
  accessToken: string;
  tokenData: AllegroTokenData;
}

export function getMissingAllegroScopes(
  grantedScope: string | undefined,
  requiredScopes: readonly string[] = ALLEGRO_REQUIRED_SCOPES,
): string[] {
  const grantedScopes = new Set(
    (grantedScope ?? "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );

  return requiredScopes.filter((scope) => !grantedScopes.has(scope));
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

const baseCookieOptions = {
  httpOnly: true,
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE,
  path: "/",
};

function readChunkCount(cookieStore: CookieStore): number | null {
  const rawCount = cookieStore.get(ALLEGRO_TOKENS_COOKIE_CHUNK_COUNT)?.value;
  if (!rawCount) {
    return null;
  }

  const parsedCount = Number.parseInt(rawCount, 10);
  if (
    Number.isNaN(parsedCount) ||
    parsedCount <= 0 ||
    parsedCount > ALLEGRO_TOKEN_COOKIE_MAX_CHUNKS
  ) {
    return null;
  }

  return parsedCount;
}

function readEncryptedTokensFromCookies(
  cookieStore: CookieStore,
): string | null {
  const singleCookieValue = cookieStore.get(ALLEGRO_TOKENS_COOKIE)?.value;
  if (singleCookieValue) {
    return singleCookieValue;
  }

  const chunkCount = readChunkCount(cookieStore);
  if (!chunkCount) {
    return null;
  }

  let combinedValue = "";
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkValue = cookieStore.get(
      `${ALLEGRO_TOKENS_COOKIE_CHUNK_PREFIX}${chunkIndex}`,
    )?.value;

    if (!chunkValue) {
      return null;
    }

    combinedValue += chunkValue;
  }

  return combinedValue;
}

export async function clearAllegroTokenCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ALLEGRO_TOKENS_COOKIE);
  cookieStore.delete(ALLEGRO_TOKENS_COOKIE_CHUNK_COUNT);

  for (
    let chunkIndex = 0;
    chunkIndex < ALLEGRO_TOKEN_COOKIE_MAX_CHUNKS;
    chunkIndex += 1
  ) {
    cookieStore.delete(`${ALLEGRO_TOKENS_COOKIE_CHUNK_PREFIX}${chunkIndex}`);
  }
}

function isAllegroTokenData(value: unknown): value is AllegroTokenData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number" &&
    (v.scope === undefined || typeof v.scope === "string") &&
    typeof v.userId === "string" &&
    typeof v.userLogin === "string" &&
    (v.userEmail === undefined || typeof v.userEmail === "string")
  );
}

async function decryptTokenData(
  encryptedData: string,
): Promise<AllegroTokenData | null> {
  try {
    const { payload } = await jwtDecrypt(encryptedData, getEncryptionKey(), {
      issuer: JWT_ISSUER,
      audience: TOKENS_JWT_AUDIENCE,
    });
    const data: unknown = payload.data;
    return isAllegroTokenData(data) ? data : null;
  } catch (error) {
    console.error("Failed to decrypt Allegro token data:", error);
    return null;
  }
}

export async function encryptAndStoreTokens(
  tokenData: AllegroTokenData,
): Promise<void> {
  const cookieStore = await cookies();

  const encryptedTokens = await new EncryptJWT({ data: tokenData })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(TOKENS_JWT_AUDIENCE)
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .encrypt(getEncryptionKey());

  await clearAllegroTokenCookies();

  if (encryptedTokens.length <= ALLEGRO_TOKEN_COOKIE_MAX_VALUE_LENGTH) {
    cookieStore.set(ALLEGRO_TOKENS_COOKIE, encryptedTokens, baseCookieOptions);
    return;
  }

  const chunkCount = Math.ceil(
    encryptedTokens.length / ALLEGRO_TOKEN_COOKIE_MAX_VALUE_LENGTH,
  );
  if (chunkCount > ALLEGRO_TOKEN_COOKIE_MAX_CHUNKS) {
    throw new Error(
      `Allegro token payload too large for cookie chunking (${chunkCount} chunks).`,
    );
  }

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const startIndex = chunkIndex * ALLEGRO_TOKEN_COOKIE_MAX_VALUE_LENGTH;
    const endIndex = startIndex + ALLEGRO_TOKEN_COOKIE_MAX_VALUE_LENGTH;
    const chunkValue = encryptedTokens.slice(startIndex, endIndex);
    cookieStore.set(
      `${ALLEGRO_TOKENS_COOKIE_CHUNK_PREFIX}${chunkIndex}`,
      chunkValue,
      baseCookieOptions,
    );
  }

  cookieStore.set(
    ALLEGRO_TOKENS_COOKIE_CHUNK_COUNT,
    String(chunkCount),
    baseCookieOptions,
  );
}

// ---------- OAuth flow helpers ----------

export function getAuthorizationUrl(options?: {
  channelId?: string;
  redirectUri?: string;
}): {
  url: string;
  authState: AllegroAuthState;
} {
  const config = getAllegroConfig();
  const redirectUri = options?.redirectUri ?? config.redirectUri;

  if (!redirectUri) {
    throw new Error(
      "Missing Allegro redirect URI. Provide ALLEGRO_REDIRECT_URI or a request-derived redirect URI.",
    );
  }

  const state = crypto.randomUUID();
  const authState: AllegroAuthState = {
    state,
    redirectUri,
    createdAt: Date.now(),
    ...(options?.channelId ? { channelId: options.channelId } : {}),
  };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: ALLEGRO_REQUIRED_SCOPES.join(" "),
    state,
  });

  return {
    url: `${getAuthUrl()}?${params.toString()}`,
    authState,
  };
}

export interface AllegroTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  jti: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}> {
  const config = getAllegroConfig();

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Allegro token exchange failed: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as AllegroTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const config = getAllegroConfig();

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(getTokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Allegro token refresh failed: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as AllegroTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ---------- token retrieval with auto-refresh ----------

export async function getAllegroAccessToken(): Promise<AllegroTokenResult | null> {
  const cookieStore = await cookies();
  const encryptedTokens = readEncryptedTokensFromCookies(cookieStore);

  if (!encryptedTokens) {
    return null;
  }

  const tokenData = await decryptTokenData(encryptedTokens);
  if (!tokenData) {
    await clearAllegroTokenCookies();
    return null;
  }

  const now = Date.now();
  const needsRefresh = now > tokenData.expiresAt - TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return { accessToken: tokenData.accessToken, tokenData };
  }

  if (!tokenData.refreshToken) {
    console.warn("Allegro access token expired and no refresh token available");
    return null;
  }

  console.log("Refreshing Allegro access token...");

  try {
    const newTokens = await refreshAccessToken(tokenData.refreshToken);

    const updatedTokenData: AllegroTokenData = {
      ...tokenData,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: newTokens.expiresAt,
    };

    await encryptAndStoreTokens(updatedTokenData);
    console.log("Allegro access token refreshed successfully");

    return {
      accessToken: updatedTokenData.accessToken,
      tokenData: updatedTokenData,
    };
  } catch (refreshError) {
    console.error("Failed to refresh Allegro token:", refreshError);
    await clearAllegroTokenCookies();
    return null;
  }
}

/**
 * Fetch current user info from Allegro /me endpoint
 */
export async function getAllegroCurrentUser(
  accessToken: string,
): Promise<{ id: string; login: string; email?: string }> {
  const response = await fetch(`${getAllegroApiBase()}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.allegro.public.v1+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Allegro user: ${response.status}`);
  }

  const data = (await response.json()) as {
    id: string;
    login: string;
    email?: string;
  };

  return { id: data.id, login: data.login, email: data.email };
}
