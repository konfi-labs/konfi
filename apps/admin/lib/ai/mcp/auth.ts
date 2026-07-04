import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  getAdminDb,
  getAdminAuth,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";

import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import type { Member } from "@konfi/types";
import type { ToolAuthContext, ToolScope } from "../tool-layer";
import { verifyMcpOAuthAccessToken } from "./oauth";
import { allowedMcpScopesForClaims, capMcpScopesToClaims } from "./scopes";
import {
  resolveMcpTenantAuthorization,
  type McpTenantAuthorization,
} from "./tenant-auth";

const BEARER_PREFIX = "Bearer ";
const DEV_BEARER_TOKEN_ENV = "KONFI_MCP_DEV_BEARER_TOKEN";

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

function readBearerToken(headers: Headers): string {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith(BEARER_PREFIX)) {
    throw new McpAuthError("Missing bearer token.");
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new McpAuthError("Missing bearer token.");
  }

  return token;
}

function readDevelopmentBearerToken(): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const token = process.env[DEV_BEARER_TOKEN_ENV]?.trim();
  return token || undefined;
}

function tokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function resolveRequestId(headers: Headers): string {
  return (
    headers.get("x-request-id") ??
    headers.get("mcp-session-id") ??
    crypto.randomUUID()
  );
}

export async function findMemberForUser(
  user: UserRecord,
): Promise<Member | null> {
  const firestore = getAdminDb();
  const membersRef = firestore.collection("members");
  const byId = await membersRef.doc(user.uid).get();

  if (byId.exists) {
    return byId.data() as Member;
  }

  if (!user.email) {
    return null;
  }

  const byEmail = await membersRef
    .where("email", "==", user.email)
    .limit(1)
    .get();

  return byEmail.empty ? null : (byEmail.docs[0].data() as Member);
}

export function hasAdminClaim(user: UserRecord): boolean {
  return user.customClaims?.admin === true;
}

export function hasSuperAdminClaim(user: UserRecord): boolean {
  return user.customClaims?.accessLevel === 9999;
}

function requireActiveAdminUser(user: UserRecord): void {
  if (user.disabled || !hasAdminClaim(user)) {
    throw new McpAuthError("Invalid bearer token.");
  }
}

export function resolveMcpChannelIdsForUser(
  user: UserRecord,
  member: Member | null,
): string[] {
  if (hasAdminClaim(user)) {
    return [];
  }

  const storeChannelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID?.trim();
  return storeChannelId ? [storeChannelId] : (member?.channelIds ?? []);
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

    const key = trimmed.slice(0, separatorIndex);
    if (key === name) {
      try {
        return decodeURIComponent(trimmed.slice(separatorIndex + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function getAdminSessionClaims(
  headers: Headers,
): Promise<DecodedIdToken | null> {
  const sessionCookie = readCookie(headers, "__session");

  if (!sessionCookie) {
    return null;
  }

  const claims = await verifySessionCookie(sessionCookie);
  return claims?.admin === true ? claims : null;
}

export async function getAdminSessionUser(
  headers: Headers,
): Promise<UserRecord | null> {
  const claims = await getAdminSessionClaims(headers);
  if (!claims) {
    return null;
  }

  const user = await getAdminAuth().getUser(claims.uid);
  return user.disabled || !hasAdminClaim(user) ? null : user;
}

function userAuthContext(
  user: UserRecord,
  member: Member | null,
  headers: Headers,
  scopes: ToolScope[],
  token?: ToolAuthContext["token"],
  tenantAuthorization: McpTenantAuthorization = {},
): ToolAuthContext {
  return {
    actor: {
      displayName: user.displayName ?? member?.name,
      email: user.email ?? member?.email,
      kind: "oauth-user",
      uid: user.uid,
    },
    permissions: {
      channelIds:
        tenantAuthorization.channelIds ??
        resolveMcpChannelIdsForUser(user, member),
      isAdmin: hasAdminClaim(user),
      isSuperAdmin: hasSuperAdminClaim(user),
      scopes,
      ...(tenantAuthorization.tenantId
        ? { tenantId: tenantAuthorization.tenantId }
        : {}),
    },
    request: {
      requestId: resolveRequestId(headers),
      source: "mcp",
    },
    token,
  };
}

function developmentAuthContext(
  headers: Headers,
  expectedResource?: string,
): ToolAuthContext {
  const scopes = allowedMcpScopesForClaims({
    accessLevel: 9999,
    admin: true,
  });

  return {
    actor: {
      displayName: "Konfi Dev MCP",
      kind: "machine",
      uid: "konfi-dev-mcp",
    },
    permissions: {
      channelIds: [],
      isAdmin: true,
      isSuperAdmin: true,
      scopes,
    },
    request: {
      requestId: resolveRequestId(headers),
      source: "mcp",
    },
    token: {
      clientId: "konfi-dev",
      expiresAtMs: Date.now() + 365 * 24 * 60 * 60 * 1000,
      resource: expectedResource ?? process.env.KONFI_MCP_RESOURCE ?? "/mcp",
      scopes,
    },
  };
}

export async function resolveMcpAuthContext(
  headers: Headers,
  expectedResource?: string,
): Promise<ToolAuthContext> {
  const token = readBearerToken(headers);
  const developmentToken = readDevelopmentBearerToken();

  if (developmentToken && tokenEquals(token, developmentToken)) {
    return developmentAuthContext(headers, expectedResource);
  }

  const oauthToken = await verifyMcpOAuthAccessToken(token);
  if (oauthToken) {
    if (expectedResource && oauthToken.resource !== expectedResource) {
      throw new McpAuthError(
        "OAuth token was issued for a different MCP resource.",
      );
    }

    const user = await getAdminAuth().getUser(oauthToken.adminUid);
    requireActiveAdminUser(user);
    const tenantAuthorization = await resolveMcpTenantAuthorization(
      headers,
      user,
      oauthToken.tenantId,
    );
    if (!tenantAuthorization) {
      throw new McpAuthError("OAuth token is not authorized for this tenant.");
    }
    const member = await findMemberForUser(user);
    const scopes = capMcpScopesToClaims(oauthToken.scopes, {
      accessLevel: user.customClaims?.accessLevel,
      admin: user.customClaims?.admin,
      tenantAccessLevel: tenantAuthorization.accessLevel,
      tenantRole: tenantAuthorization.role,
    });

    return userAuthContext(
      user,
      member,
      headers,
      scopes,
      {
        clientId: oauthToken.clientId,
        expiresAtMs: oauthToken.expiresAtMs,
        jti: oauthToken.jti,
        resource: oauthToken.resource,
        scopes,
        ...(tenantAuthorization.tenantId
          ? { tenantId: tenantAuthorization.tenantId }
          : {}),
      },
      tenantAuthorization,
    );
  }

  const decodedToken = await getAdminAuth()
    .verifyIdToken(token)
    .catch(() => null);

  if (!decodedToken) {
    throw new McpAuthError("Invalid bearer token.");
  }

  const user = await getAdminAuth().getUser(decodedToken.uid);
  requireActiveAdminUser(user);
  const tenantAuthorization = await resolveMcpTenantAuthorization(
    headers,
    user,
  );
  if (!tenantAuthorization) {
    throw new McpAuthError("Bearer token is not authorized for this tenant.");
  }
  const member = await findMemberForUser(user);
  const scopes = allowedMcpScopesForClaims({
    accessLevel: user.customClaims?.accessLevel,
    admin: user.customClaims?.admin,
    tenantAccessLevel: tenantAuthorization.accessLevel,
    tenantRole: tenantAuthorization.role,
  });

  return userAuthContext(
    user,
    member,
    headers,
    scopes,
    {
      expiresAtMs: decodedToken.exp * 1000,
      resource: expectedResource ?? process.env.KONFI_MCP_RESOURCE ?? "/mcp",
      scopes,
      ...(tenantAuthorization.tenantId
        ? { tenantId: tenantAuthorization.tenantId }
        : {}),
    },
    tenantAuthorization,
  );
}
