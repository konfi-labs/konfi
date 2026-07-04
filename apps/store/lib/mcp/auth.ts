import "server-only";

import { getAdminAuth } from "@/lib/firebase/serverApp";
import { verifyStoreMcpOAuthAccessToken } from "./oauth";
import type { StoreMcpAuthContext } from "./types";

const BEARER_PREFIX = "Bearer ";

export class StoreMcpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreMcpAuthError";
  }
}

function readOAuthAccessToken(headers: Headers): string {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith(BEARER_PREFIX)) {
    throw new StoreMcpAuthError("Missing OAuth access token.");
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new StoreMcpAuthError("Missing OAuth access token.");
  }

  return token;
}

export function resolveStoreMcpRequestId(headers: Headers): string {
  return (
    headers.get("x-request-id") ??
    headers.get("mcp-session-id") ??
    crypto.randomUUID()
  );
}

export async function resolveStoreMcpAuthContext(
  headers: Headers,
  expectedResource?: string,
): Promise<StoreMcpAuthContext> {
  const requestId = resolveStoreMcpRequestId(headers);
  const accessToken = readOAuthAccessToken(headers);
  const oauthToken = await verifyStoreMcpOAuthAccessToken(accessToken);

  if (!oauthToken) {
    throw new StoreMcpAuthError("Invalid OAuth access token.");
  }

  if (expectedResource && oauthToken.resource !== expectedResource) {
    throw new StoreMcpAuthError(
      "OAuth token was issued for a different MCP resource.",
    );
  }

  const user = await getAdminAuth().getUser(oauthToken.customerUid);
  if (user.disabled) {
    throw new StoreMcpAuthError("User is disabled.");
  }

  return {
    actor: {
      displayName: user.displayName ?? undefined,
      email: user.email ?? undefined,
      kind: "customer",
      uid: user.uid,
    },
    permissions: {
      scopes: oauthToken.scopes,
    },
    request: {
      requestId,
      source: "store-mcp",
    },
    token: {
      clientId: oauthToken.clientId,
      expiresAtMs: oauthToken.expiresAtMs,
      jti: oauthToken.jti,
      resource: oauthToken.resource,
      scopes: oauthToken.scopes,
    },
  };
}
