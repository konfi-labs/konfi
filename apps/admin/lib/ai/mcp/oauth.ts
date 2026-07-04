import "server-only";

import {
  getAdminDb,
  getAdminAuth,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";
import { Timestamp } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import {
  McpOAuthCoreError,
  createMcpOAuthServer,
  type McpOAuthConsentCopy,
  type OAuthAccessToken,
  type OAuthAuthorizationCode,
  type OAuthClient,
  type OAuthRefreshToken,
  type OAuthStorage,
  type VerifiedOAuthToken,
  mcpOAuthRequestOrigin,
} from "@konfi/utils/server/mcp-oauth-core";
import i18next from "@/i18n/i18next";
import { cookieName, fallbackLng, languages } from "@/i18n/settings";
import type { ToolScope } from "../tool-layer";
import {
  capMcpScopesToClaims,
  isToolScope,
  readSupportedOAuthScopes,
} from "./scopes";
import {
  resolveMcpTenantAuthorization,
  type McpTenantAuthorization,
} from "./tenant-auth";

const CLIENTS_COLLECTION = "mcpOAuthClients";
const CODES_COLLECTION = "mcpOAuthAuthorizationCodes";
const ACCESS_TOKENS_COLLECTION = "mcpOAuthAccessTokens";
const REFRESH_TOKENS_COLLECTION = "mcpOAuthRefreshTokens";
const DEFAULT_CLIENT_SCOPES = readSupportedOAuthScopes();

type McpOAuthUserRecord = UserRecord & {
  mcpTenantAuthorization?: McpTenantAuthorization;
};

type TimestampedAuthorizationCode = OAuthAuthorizationCode<
  ToolScope,
  Timestamp
>;
type TimestampedAccessToken = OAuthAccessToken<ToolScope, Timestamp>;
type TimestampedRefreshToken = OAuthRefreshToken<ToolScope, Timestamp>;

export type McpOAuthClient = OAuthClient<ToolScope>;
export { McpOAuthCoreError as McpOAuthError };

export interface VerifiedMcpOAuthToken extends Omit<
  VerifiedOAuthToken<ToolScope>,
  "subjectUid"
> {
  adminUid: string;
  tenantId?: string;
}

interface StoredAuthorizationCode extends Omit<
  TimestampedAuthorizationCode,
  "subjectUid"
> {
  adminUid: string;
  subjectUid?: string;
  tenantId?: string;
}

interface StoredAccessToken extends Omit<TimestampedAccessToken, "subjectUid"> {
  adminUid: string;
  subjectUid?: string;
  tenantId?: string;
}

interface StoredRefreshToken extends Omit<
  TimestampedRefreshToken,
  "subjectUid"
> {
  adminUid: string;
  subjectUid?: string;
  tenantId?: string;
}

interface McpOAuthSubjectParts {
  adminUid: string;
  tenantId?: string;
}

function firestore() {
  return getAdminDb();
}

function timestampFromMs(value: number): Timestamp {
  return Timestamp.fromMillis(value);
}

function mcpOAuthConsentSigningSecret(): string | undefined {
  return (
    process.env.KONFI_MCP_OAUTH_CONSENT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.ENCRYPTION_SECRET?.trim() ||
    undefined
  );
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

function normalizeMcpOAuthLanguage(value: string | null | undefined): string {
  if (!value) {
    return fallbackLng;
  }

  for (const candidate of value.split(",")) {
    const language = candidate.split(";")[0]?.split("-")[0]?.trim();

    if (language && languages.includes(language)) {
      return language;
    }
  }

  return fallbackLng;
}

function getMcpOAuthRequestLanguage(request: Request): string {
  return normalizeMcpOAuthLanguage(
    readCookie(request.headers, cookieName) ??
      request.headers.get("accept-language"),
  );
}

async function getMcpOAuthConsentCopy(
  request: Request,
): Promise<Partial<McpOAuthConsentCopy>> {
  const language = getMcpOAuthRequestLanguage(request);
  await i18next.loadLanguages(language);
  await i18next.loadNamespaces("translation");
  const t = i18next.getFixedT(language, "translation", "mcpOAuthConsent");

  return {
    authorizeButtonLabel: t("authorizeButtonLabel", {
      defaultValue: "Authorize access",
    }),
    brandLabel: t("brandLabel", { defaultValue: "Konfi Admin" }),
    cancelButtonLabel: t("cancelButtonLabel", { defaultValue: "Cancel" }),
    clientLabel: t("clientLabel", { defaultValue: "Client" }),
    description: t("description", {
      defaultValue:
        "Review the client and scopes before Konfi grants access to your MCP tools.",
    }),
    eyebrow: t("eyebrow", { defaultValue: "Secure OAuth authorization" }),
    heading: t("heading", { defaultValue: "Authorize Konfi MCP access" }),
    language,
    noScopesLabel: t("noScopesLabel", {
      defaultValue: "No scopes requested",
    }),
    redirectHostLabel: t("redirectHostLabel", {
      defaultValue: "Redirect host",
    }),
    redirectUriLabel: t("redirectUriLabel", {
      defaultValue: "Redirect URI",
    }),
    scopesHeading: t("scopesHeading", { defaultValue: "Requested scopes" }),
    scopesIntro: t("scopesIntro", {
      defaultValue:
        "These OAuth scopes limit what this client can ask Konfi to do.",
    }),
    securityNote: t("securityNote", {
      defaultValue:
        "Only authorize clients you recognize. You can revoke access later by removing the registered OAuth client.",
    }),
    securityNoteTitle: t("securityNoteTitle", {
      defaultValue: "Security check",
    }),
    title: t("title", { defaultValue: "Authorize Konfi MCP" }),
  };
}

function encodeMcpOAuthSubjectUid(adminUid: string, tenantId?: string): string {
  if (!tenantId) {
    return adminUid;
  }

  return `tenant:${Buffer.from(
    JSON.stringify({
      adminUid,
      tenantId,
    }),
  ).toString("base64url")}`;
}

function decodeMcpOAuthSubjectUid(subjectUid: string): McpOAuthSubjectParts {
  if (!subjectUid.startsWith("tenant:")) {
    return { adminUid: subjectUid };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(subjectUid.slice("tenant:".length), "base64url").toString(
        "utf8",
      ),
    ) as { adminUid?: unknown; tenantId?: unknown };
    const adminUid =
      typeof decoded.adminUid === "string" ? decoded.adminUid.trim() : "";
    const tenantId =
      typeof decoded.tenantId === "string" ? decoded.tenantId.trim() : "";

    return adminUid
      ? {
          adminUid,
          ...(tenantId ? { tenantId } : {}),
        }
      : { adminUid: subjectUid };
  } catch {
    return { adminUid: subjectUid };
  }
}

function buildLoginRedirect(request: Request): URL {
  const requestUrl = new URL(request.url);
  const language = getMcpOAuthRequestLanguage(request);
  const loginUrl = new URL(
    `/${language}/auth/login`,
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
  const sessionCookie = readCookie(headers, "__session");

  if (!sessionCookie) {
    return null;
  }

  const claims = await verifySessionCookie(sessionCookie);
  if (claims?.admin !== true) {
    return null;
  }

  const user = await getAdminAuth().getUser(claims.uid);
  return user.disabled || user.customClaims?.admin !== true ? null : user;
}

async function getAuthenticatedSessionSubject(
  headers: Headers,
): Promise<{ uid: string; user: McpOAuthUserRecord } | null> {
  const user = await getAuthenticatedSessionUser(headers);
  if (!user) {
    return null;
  }

  const tenantAuthorization = await resolveMcpTenantAuthorization(
    headers,
    user,
  );
  if (!tenantAuthorization) {
    return null;
  }

  const mcpUser = Object.assign(user, {
    mcpTenantAuthorization: tenantAuthorization,
  });

  return {
    uid: encodeMcpOAuthSubjectUid(user.uid, tenantAuthorization.tenantId),
    user: mcpUser,
  };
}

function authorizationCodeToStored(
  code: TimestampedAuthorizationCode,
): StoredAuthorizationCode {
  const { subjectUid, ...rest } = code;
  const subject = decodeMcpOAuthSubjectUid(subjectUid);
  return {
    ...rest,
    adminUid: subject.adminUid,
    ...(subject.tenantId ? { tenantId: subject.tenantId } : {}),
  };
}

function authorizationCodeFromStored(
  code: StoredAuthorizationCode,
): TimestampedAuthorizationCode {
  const { adminUid, subjectUid, tenantId, ...rest } = code;
  return {
    ...rest,
    subjectUid: subjectUid ?? encodeMcpOAuthSubjectUid(adminUid, tenantId),
  };
}

function accessTokenToStored(token: TimestampedAccessToken): StoredAccessToken {
  const { subjectUid, ...rest } = token;
  const subject = decodeMcpOAuthSubjectUid(subjectUid);
  return {
    ...rest,
    adminUid: subject.adminUid,
    ...(subject.tenantId ? { tenantId: subject.tenantId } : {}),
  };
}

function accessTokenFromStored(
  token: StoredAccessToken,
): TimestampedAccessToken {
  const { adminUid, subjectUid, tenantId, ...rest } = token;
  return {
    ...rest,
    subjectUid: subjectUid ?? encodeMcpOAuthSubjectUid(adminUid, tenantId),
  };
}

function refreshTokenToStored(
  token: TimestampedRefreshToken,
): StoredRefreshToken {
  const { subjectUid, ...rest } = token;
  const subject = decodeMcpOAuthSubjectUid(subjectUid);
  return {
    ...rest,
    adminUid: subject.adminUid,
    ...(subject.tenantId ? { tenantId: subject.tenantId } : {}),
  };
}

function refreshTokenFromStored(
  token: StoredRefreshToken,
): TimestampedRefreshToken {
  const { adminUid, subjectUid, tenantId, ...rest } = token;
  return {
    ...rest,
    subjectUid: subjectUid ?? encodeMcpOAuthSubjectUid(adminUid, tenantId),
  };
}

function verifiedTokenFromCore(
  token: VerifiedOAuthToken<ToolScope>,
): VerifiedMcpOAuthToken {
  const { subjectUid, ...rest } = token;
  const subject = decodeMcpOAuthSubjectUid(subjectUid);
  const tokenTenantId = (
    token as VerifiedOAuthToken<ToolScope> & {
      tenantId?: unknown;
    }
  ).tenantId;
  const tenantId =
    typeof tokenTenantId === "string" ? tokenTenantId.trim() : subject.tenantId;

  return {
    ...rest,
    adminUid: subject.adminUid,
    ...(tenantId ? { tenantId } : {}),
  };
}

const oauthStorage: OAuthStorage<ToolScope, Timestamp> = {
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

    return snapshot.exists ? (snapshot.data() as McpOAuthClient) : null;
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

const oauthServer = createMcpOAuthServer<
  ToolScope,
  McpOAuthUserRecord,
  Timestamp
>({
  clientIdPrefix: "mcp_",
  consent: {
    copy: ({ request }) => getMcpOAuthConsentCopy(request),
    description:
      "Confirm this OAuth client before Konfi grants access to your MCP tools.",
    heading: "Authorize Konfi MCP access",
    signingSecret: mcpOAuthConsentSigningSecret,
    title: "Authorize Konfi MCP",
  },
  defaultScopes: DEFAULT_CLIENT_SCOPES,
  getAuthenticatedSubject: getAuthenticatedSessionSubject,
  isScope: isToolScope,
  loginRedirect: buildLoginRedirect,
  paths: {
    authorization: "/mcp/oauth/authorize",
    registration: "/mcp/oauth/register",
    resource: "/mcp",
    revocation: "/mcp/oauth/revoke",
    token: "/mcp/oauth/token",
  },
  resolveGrantScopes({ requestedScopes, subject }) {
    const tenantAuthorization = subject.user.mcpTenantAuthorization;
    return capMcpScopesToClaims(requestedScopes, {
      accessLevel: subject.user.customClaims?.accessLevel,
      admin: subject.user.customClaims?.admin,
      tenantAccessLevel: tenantAuthorization?.accessLevel,
      tenantRole: tenantAuthorization?.role,
    });
  },
  async validateRefreshToken(token) {
    const subject = decodeMcpOAuthSubjectUid(token.subjectUid);
    const user = await getAdminAuth().getUser(subject.adminUid);
    if (user.disabled || user.customClaims?.admin !== true) {
      throw new McpOAuthCoreError("invalid_grant", "Invalid refresh token.");
    }
    const tenantAuthorization = await resolveMcpTenantAuthorization(
      new Headers(),
      user,
      subject.tenantId,
    );
    if (!tenantAuthorization) {
      throw new McpOAuthCoreError("invalid_grant", "Invalid refresh token.");
    }
  },
  resourceMismatchDescription:
    "OAuth resource must match the Konfi MCP resource.",
  resourceName: "Konfi MCP",
  storage: oauthStorage,
  supportedScopes: readSupportedOAuthScopes(),
  timestampFromMs,
});

export function mcpResourceUrl(request: Request): URL {
  return oauthServer.resourceUrl(request);
}

export function authorizationServerMetadata(request: Request) {
  return oauthServer.authorizationServerMetadata(request);
}

export function protectedResourceMetadata(request: Request) {
  return oauthServer.protectedResourceMetadata(request);
}

export function registerMcpOAuthClient(
  body: unknown,
): Promise<Record<string, unknown>> {
  return oauthServer.registerClient(body);
}

export function authorizeMcpOAuthRequest(
  request: Request,
  options: {
    consentConfirmed?: boolean;
    params?: URLSearchParams;
  } = {},
): Promise<Response> {
  return oauthServer.authorizeRequest(request, options);
}

export function isMcpOAuthConsentTokenValid(
  request: Request,
  params: URLSearchParams,
): boolean {
  return oauthServer.isConsentTokenValid(request, params);
}

export function exchangeMcpOAuthToken(
  request: Request,
): Promise<Record<string, unknown>> {
  return oauthServer.exchangeToken(request);
}

export async function verifyMcpOAuthAccessToken(
  token: string,
): Promise<VerifiedMcpOAuthToken | null> {
  const verifiedToken = await oauthServer.verifyAccessToken(token);
  return verifiedToken ? verifiedTokenFromCore(verifiedToken) : null;
}

export function revokeMcpOAuthToken(request: Request): Promise<void> {
  return oauthServer.revokeToken(request);
}

export function oauthErrorResponse(error: unknown): Response {
  return oauthServer.errorResponse(error);
}
