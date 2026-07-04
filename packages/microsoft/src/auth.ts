/**
 * Microsoft Graph API Authentication using MSAL
 */

import {
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
  ConfidentialClientApplication,
} from "@azure/msal-node";
import { createHash, randomBytes, randomUUID } from "crypto";
import { getAuthorityUrl, getMicrosoftConfig } from "./config";
import type { MicrosoftAuthState, MicrosoftTokens } from "./types";

let msalInstance: ConfidentialClientApplication | null = null;

type MsalRefreshTokenEntity = {
  clientId?: string;
  environment?: string;
  homeAccountId?: string;
  realm?: string;
  secret?: string;
  target?: string;
};

type MsalCacheData = {
  RefreshToken?: Record<string, MsalRefreshTokenEntity>;
};

type RefreshTokenSelection = {
  clientId: string;
  environment?: string;
  homeAccountId?: string;
  scopes?: string[];
  tenantId?: string;
};

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function generatePkceCodes(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(
    createHash("sha256").update(verifier).digest(),
  );

  return { verifier, challenge };
}

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

function parseMsalCache(cacheData: string): MsalCacheData {
  const value = JSON.parse(cacheData) as unknown;

  if (!value || typeof value !== "object") {
    return {};
  }

  const refreshTokenValue = (value as { RefreshToken?: unknown }).RefreshToken;
  if (!refreshTokenValue || typeof refreshTokenValue !== "object") {
    return {};
  }

  return {
    RefreshToken: refreshTokenValue as Record<string, MsalRefreshTokenEntity>,
  };
}

function scopeTargetMatches(
  tokenTarget: string | undefined,
  scopes: string[] | undefined,
) {
  if (!tokenTarget || !scopes || scopes.length === 0) {
    return false;
  }

  const targetScopes = new Set(
    tokenTarget
      .split(/\s+/)
      .map((scope) => scope.trim().toLowerCase())
      .filter(Boolean),
  );

  return scopes.every((scope) => targetScopes.has(scope.toLowerCase()));
}

export function extractRefreshTokenFromMsalCache(
  cacheData: string,
  selection: RefreshTokenSelection,
): string | undefined {
  const refreshTokens = parseMsalCache(cacheData).RefreshToken ?? {};
  const candidates = Object.values(refreshTokens).filter(
    (token): token is MsalRefreshTokenEntity & { secret: string } =>
      typeof token.secret === "string" && token.secret.length > 0,
  );

  const scored = candidates
    .map((token) => {
      let score = 0;

      if (token.clientId === selection.clientId) {
        score += 4;
      }
      if (
        selection.homeAccountId &&
        token.homeAccountId === selection.homeAccountId
      ) {
        score += 4;
      }
      if (
        selection.environment &&
        token.environment === selection.environment
      ) {
        score += 2;
      }
      if (selection.tenantId && token.realm === selection.tenantId) {
        score += 1;
      }
      if (scopeTargetMatches(token.target, selection.scopes)) {
        score += 1;
      }

      return { score, token };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.token.secret;
}

/**
 * Get or create MSAL Confidential Client Application
 */
export function getMsalClient(): ConfidentialClientApplication {
  if (msalInstance) {
    return msalInstance;
  }

  const config = getMicrosoftConfig();
  const authority = getAuthorityUrl(config.tenantId);

  msalInstance = new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority,
    },
    system: {
      loggerOptions: {
        logLevel: process.env.NODE_ENV === "development" ? 3 : 0, // Info : Error
        piiLoggingEnabled: false,
      },
    },
  });

  return msalInstance;
}

/**
 * Generate authorization URL for OAuth2 flow with PKCE
 */
export async function getAuthorizationUrl(): Promise<{
  url: string;
  authState: MicrosoftAuthState;
}> {
  const config = getMicrosoftConfig();
  const client = getMsalClient();

  // Generate PKCE codes
  const { verifier, challenge } = await generatePkceCodes();

  // Generate state for CSRF protection
  const state = randomUUID();

  const authState: MicrosoftAuthState = {
    state,
    codeVerifier: verifier,
    redirectUri: config.redirectUri,
    createdAt: Date.now(),
  };

  const authCodeUrlParams: AuthorizationUrlRequest = {
    scopes: config.scopes,
    redirectUri: config.redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  };

  const url = await client.getAuthCodeUrl(authCodeUrlParams);

  return { url, authState };
}

/**
 * Validate state parameter from callback
 */
export function validateAuthState(
  authState: MicrosoftAuthState,
): MicrosoftAuthState | null {
  const tenMinutesAgo = Date.now() - AUTH_STATE_TTL_MS;
  if (authState.createdAt < tenMinutesAgo) {
    return null;
  }

  return authState;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  authState: MicrosoftAuthState,
): Promise<MicrosoftTokens> {
  const validatedState = validateAuthState(authState);

  if (!validatedState) {
    throw new Error("Invalid or expired state parameter");
  }

  const config = getMicrosoftConfig();
  const client = getMsalClient();

  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes: config.scopes,
    redirectUri: validatedState.redirectUri,
    codeVerifier: validatedState.codeVerifier,
  };

  const response = await client.acquireTokenByCode(tokenRequest);

  if (!response || !response.accessToken) {
    throw new Error("Failed to acquire access token");
  }

  // Get refresh token from the cache
  const cache = client.getTokenCache();
  const cacheData = cache.serialize();
  let refreshToken: string | undefined;

  try {
    refreshToken = extractRefreshTokenFromMsalCache(cacheData, {
      clientId: config.clientId,
      environment: response.account?.environment,
      homeAccountId: response.account?.homeAccountId,
      scopes: config.scopes,
      tenantId: response.account?.tenantId,
    });
  } catch {
    console.warn("Could not extract refresh token from cache");
  }

  return {
    accessToken: response.accessToken,
    refreshToken,
    expiresAt: response.expiresOn
      ? response.expiresOn.getTime()
      : Date.now() + 3600 * 1000,
    scope: response.scopes.join(" "),
    tokenType: response.tokenType || "Bearer",
  };
}

/**
 * Refresh access token using refresh token (if stored externally)
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<MicrosoftTokens> {
  const config = getMicrosoftConfig();
  const client = getMsalClient();

  const response = await client.acquireTokenByRefreshToken({
    refreshToken,
    scopes: config.scopes,
  });

  if (!response || !response.accessToken) {
    throw new Error("Failed to refresh access token");
  }

  // Get new refresh token from the cache (it may have been rotated)
  const cache = client.getTokenCache();
  const cacheData = cache.serialize();
  let newRefreshToken: string | undefined;

  try {
    newRefreshToken = extractRefreshTokenFromMsalCache(cacheData, {
      clientId: config.clientId,
      scopes: config.scopes,
    });
  } catch {
    console.warn("Could not extract new refresh token from cache");
  }

  return {
    accessToken: response.accessToken,
    refreshToken: newRefreshToken || refreshToken, // Use new one if available, otherwise keep old
    expiresAt: response.expiresOn
      ? response.expiresOn.getTime()
      : Date.now() + 3600 * 1000,
    scope: response.scopes.join(" "),
    tokenType: response.tokenType || "Bearer",
  };
}

/**
 * Get tokens using client credentials (for app-only access)
 * Note: This requires admin consent for the target tenant
 */
export async function getAppOnlyToken(
  scopes: string[] = ["https://graph.microsoft.com/.default"],
): Promise<string> {
  const client = getMsalClient();

  const response = await client.acquireTokenByClientCredential({
    scopes,
  });

  if (!response || !response.accessToken) {
    throw new Error("Failed to acquire app-only access token");
  }

  return response.accessToken;
}

/**
 * Clear MSAL cache (for logout)
 */
export async function clearMsalCache(): Promise<void> {
  if (msalInstance) {
    const cache = msalInstance.getTokenCache();
    const accounts = await cache.getAllAccounts();

    for (const account of accounts) {
      await cache.removeAccount(account);
    }
  }
}
