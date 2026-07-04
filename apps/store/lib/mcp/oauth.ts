import "server-only";

import {
  STORE_SESSION_COOKIE,
  getAdminAuth,
  getFirebaseAdminApp,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";
import { DEFAULT_LOCALE } from "@konfi/types";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import {
  McpOAuthCoreError,
  createMcpOAuthServer,
  type OAuthAccessToken,
  type OAuthAuthorizationCode,
  type OAuthClient,
  type OAuthRefreshToken,
  type OAuthStorage,
  type VerifiedOAuthToken,
  mcpOAuthRequestOrigin,
} from "@konfi/utils/server/mcp-oauth-core";
import { STORE_MCP_SCOPES, type StoreMcpScope } from "./types";

const CLIENTS_COLLECTION = "storeMcpOAuthClients";
const CODES_COLLECTION = "storeMcpOAuthAuthorizationCodes";
const ACCESS_TOKENS_COLLECTION = "storeMcpOAuthAccessTokens";
const REFRESH_TOKENS_COLLECTION = "storeMcpOAuthRefreshTokens";
const DEFAULT_CLIENT_SCOPES = [...STORE_MCP_SCOPES];

type TimestampedAuthorizationCode = OAuthAuthorizationCode<
  StoreMcpScope,
  Timestamp
>;
type TimestampedAccessToken = OAuthAccessToken<StoreMcpScope, Timestamp>;
type TimestampedRefreshToken = OAuthRefreshToken<StoreMcpScope, Timestamp>;

export type StoreMcpOAuthClient = OAuthClient<StoreMcpScope>;
export { McpOAuthCoreError as StoreMcpOAuthError };

export interface VerifiedStoreMcpOAuthToken extends Omit<
  VerifiedOAuthToken<StoreMcpScope>,
  "subjectUid"
> {
  customerUid: string;
}

interface StoredAuthorizationCode extends Omit<
  TimestampedAuthorizationCode,
  "subjectUid"
> {
  customerUid: string;
  subjectUid?: string;
}

interface StoredAccessToken extends Omit<TimestampedAccessToken, "subjectUid"> {
  customerUid: string;
  subjectUid?: string;
}

interface StoredRefreshToken extends Omit<
  TimestampedRefreshToken,
  "subjectUid"
> {
  customerUid: string;
  subjectUid?: string;
}

function firestore() {
  return getFirestore(getFirebaseAdminApp());
}

function timestampFromMs(value: number): Timestamp {
  return Timestamp.fromMillis(value);
}

function storeMcpOAuthConsentSigningSecret(): string | undefined {
  return (
    process.env.KONFI_MCP_OAUTH_CONSENT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.ENCRYPTION_SECRET?.trim() ||
    undefined
  );
}

function isStoreMcpScope(value: string): value is StoreMcpScope {
  return STORE_MCP_SCOPES.includes(value as StoreMcpScope);
}

export function readSupportedStoreMcpOAuthScopes(): StoreMcpScope[] {
  return [...STORE_MCP_SCOPES];
}

function readCookie(headers: Headers, name: string): string | null {
  const cookie = headers.get("cookie");

  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    if (trimmed.slice(0, separatorIndex) === name) {
      try {
        return decodeURIComponent(trimmed.slice(separatorIndex + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function buildLoginRedirect(request: Request): URL {
  const requestUrl = new URL(request.url);
  const loginUrl = new URL(
    `/${DEFAULT_LOCALE}/auth/login`,
    mcpOAuthRequestOrigin(request),
  );
  loginUrl.searchParams.set(
    "redirect",
    `${requestUrl.pathname}${requestUrl.search}`,
  );
  return loginUrl;
}

async function getAuthenticatedSessionUser(
  headers: Headers,
): Promise<UserRecord | null> {
  const sessionCookie = readCookie(headers, STORE_SESSION_COOKIE);

  if (!sessionCookie) {
    return null;
  }

  const claims = await verifySessionCookie(sessionCookie);
  if (!claims) {
    return null;
  }

  const user = await getAdminAuth().getUser(claims.uid);
  return user.disabled ? null : user;
}

function authorizationCodeToStored(
  code: TimestampedAuthorizationCode,
): StoredAuthorizationCode {
  const { subjectUid, ...rest } = code;
  return { ...rest, customerUid: subjectUid };
}

function authorizationCodeFromStored(
  code: StoredAuthorizationCode,
): TimestampedAuthorizationCode {
  const { customerUid, subjectUid, ...rest } = code;
  return { ...rest, subjectUid: subjectUid ?? customerUid };
}

function accessTokenToStored(token: TimestampedAccessToken): StoredAccessToken {
  const { subjectUid, ...rest } = token;
  return { ...rest, customerUid: subjectUid };
}

function accessTokenFromStored(
  token: StoredAccessToken,
): TimestampedAccessToken {
  const { customerUid, subjectUid, ...rest } = token;
  return { ...rest, subjectUid: subjectUid ?? customerUid };
}

function refreshTokenToStored(
  token: TimestampedRefreshToken,
): StoredRefreshToken {
  const { subjectUid, ...rest } = token;
  return { ...rest, customerUid: subjectUid };
}

function refreshTokenFromStored(
  token: StoredRefreshToken,
): TimestampedRefreshToken {
  const { customerUid, subjectUid, ...rest } = token;
  return { ...rest, subjectUid: subjectUid ?? customerUid };
}

function verifiedTokenFromCore(
  token: VerifiedOAuthToken<StoreMcpScope>,
): VerifiedStoreMcpOAuthToken {
  const { subjectUid, ...rest } = token;
  return { ...rest, customerUid: subjectUid };
}

const oauthStorage: OAuthStorage<StoreMcpScope, Timestamp> = {
  async consumeAuthorizationCode(hash, validate) {
    const db = firestore();
    const codeRef = db.collection(CODES_COLLECTION).doc(hash);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(codeRef);

      if (!snapshot.exists) {
        throw new McpOAuthCoreError(
          "invalid_grant",
          "Invalid authorization code.",
        );
      }

      const code = authorizationCodeFromStored(
        snapshot.data() as StoredAuthorizationCode,
      );
      await validate(code);
      transaction.delete(codeRef);
      return code;
    });
  },
  async consumeRefreshToken(hash, validate) {
    const db = firestore();
    const tokenRef = db.collection(REFRESH_TOKENS_COLLECTION).doc(hash);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(tokenRef);

      if (!snapshot.exists) {
        throw new McpOAuthCoreError("invalid_grant", "Invalid refresh token.");
      }

      const token = refreshTokenFromStored(
        snapshot.data() as StoredRefreshToken,
      );
      await validate(token);
      transaction.delete(tokenRef);
      return token;
    });
  },
  async getAccessToken(hash) {
    const snapshot = await firestore()
      .collection(ACCESS_TOKENS_COLLECTION)
      .doc(hash)
      .get();

    return snapshot.exists
      ? accessTokenFromStored(snapshot.data() as StoredAccessToken)
      : null;
  },
  async getClient(clientId) {
    const snapshot = await firestore()
      .collection(CLIENTS_COLLECTION)
      .doc(clientId)
      .get();

    return snapshot.exists ? (snapshot.data() as StoreMcpOAuthClient) : null;
  },
  async revokeToken(hash, clientId, revokedAtMs) {
    await Promise.all([
      firestore()
        .collection(ACCESS_TOKENS_COLLECTION)
        .doc(hash)
        .update({ revokedAtMs, revokedByClientId: clientId })
        .catch(() => undefined),
      firestore()
        .collection(REFRESH_TOKENS_COLLECTION)
        .doc(hash)
        .update({ revokedAtMs, revokedByClientId: clientId })
        .catch(() => undefined),
    ]);
  },
  async saveAuthorizationCode(hash, code) {
    await firestore()
      .collection(CODES_COLLECTION)
      .doc(hash)
      .set(authorizationCodeToStored(code));
  },
  async saveClient(client) {
    await firestore()
      .collection(CLIENTS_COLLECTION)
      .doc(client.clientId)
      .set(client);
  },
  async saveTokenPair(input) {
    await Promise.all([
      firestore()
        .collection(ACCESS_TOKENS_COLLECTION)
        .doc(input.accessHash)
        .set(accessTokenToStored(input.accessToken)),
      firestore()
        .collection(REFRESH_TOKENS_COLLECTION)
        .doc(input.refreshHash)
        .set(refreshTokenToStored(input.refreshToken)),
    ]);
  },
};

const oauthServer = createMcpOAuthServer<StoreMcpScope, UserRecord, Timestamp>({
  clientIdPrefix: "store_mcp_",
  consent: {
    description:
      "Confirm this OAuth client before Konfi grants access to your customer-facing MCP tools.",
    heading: "Authorize Konfi Store MCP access",
    signingSecret: storeMcpOAuthConsentSigningSecret,
    title: "Authorize Konfi Store MCP",
  },
  defaultScopes: DEFAULT_CLIENT_SCOPES,
  async getAuthenticatedSubject(headers) {
    const user = await getAuthenticatedSessionUser(headers);
    return user ? { uid: user.uid, user } : null;
  },
  isScope: isStoreMcpScope,
  loginRedirect: buildLoginRedirect,
  paths: {
    authorization: "/mcp/oauth/authorize",
    registration: "/mcp/oauth/register",
    resource: "/mcp",
    revocation: "/mcp/oauth/revoke",
    token: "/mcp/oauth/token",
  },
  resourceMismatchDescription:
    "OAuth resource must match the Konfi Store MCP resource.",
  resourceName: "Konfi Store MCP",
  storage: oauthStorage,
  supportedScopes: STORE_MCP_SCOPES,
  timestampFromMs,
});

export function storeMcpResourceUrl(request: Request): URL {
  return oauthServer.resourceUrl(request);
}

export function storeMcpAuthorizationServerMetadata(request: Request) {
  return oauthServer.authorizationServerMetadata(request);
}

export function storeMcpProtectedResourceMetadata(request: Request) {
  return oauthServer.protectedResourceMetadata(request);
}

export function registerStoreMcpOAuthClient(
  body: unknown,
): Promise<Record<string, unknown>> {
  return oauthServer.registerClient(body);
}

export function authorizeStoreMcpOAuthRequest(
  request: Request,
  options: {
    consentConfirmed?: boolean;
    params?: URLSearchParams;
  } = {},
): Promise<Response> {
  return oauthServer.authorizeRequest(request, options);
}

export function isStoreMcpOAuthConsentTokenValid(
  request: Request,
  params: URLSearchParams,
): boolean {
  return oauthServer.isConsentTokenValid(request, params);
}

export function exchangeStoreMcpOAuthToken(
  request: Request,
): Promise<Record<string, unknown>> {
  return oauthServer.exchangeToken(request);
}

export async function verifyStoreMcpOAuthAccessToken(
  token: string,
): Promise<VerifiedStoreMcpOAuthToken | null> {
  const verifiedToken = await oauthServer.verifyAccessToken(token);
  return verifiedToken ? verifiedTokenFromCore(verifiedToken) : null;
}

export function revokeStoreMcpOAuthToken(request: Request): Promise<void> {
  return oauthServer.revokeToken(request);
}

export function storeMcpOAuthErrorResponse(error: unknown): Response {
  return oauthServer.errorResponse(error);
}
