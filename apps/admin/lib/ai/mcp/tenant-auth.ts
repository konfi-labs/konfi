import "server-only";

import {
  adminTenantIdCookieName,
  getAdminDb,
  getTenantContext,
  getTenantIdForHostname,
} from "@/lib/firebase/serverApp";
import {
  buildTenantMembershipId,
  type TenantContext,
  type TenantMembership,
  TenantMembershipStatus,
  TenantRole,
} from "@sblyvwx/cloud-contracts";
import { resolveRequestTenantHostname } from "@konfi/firebase";
import type { UserRecord } from "firebase-admin/auth";

export interface McpTenantAuthorization {
  accessLevel?: number;
  channelIds?: string[];
  role?: TenantRole;
  tenantId?: string;
}

function hasSuperAdminClaim(user: UserRecord): boolean {
  return user.customClaims?.accessLevel === 9999;
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

function shouldScopeTenantAccess(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}

function normalizeMembershipChannelIds(
  channelIds: TenantMembership["channelIds"],
): string[] {
  return [
    ...new Set(
      (channelIds ?? [])
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0),
    ),
  ];
}

export function isMcpAdminTenantMembership(
  membership: TenantMembership | null,
): membership is TenantMembership {
  return (
    membership !== null &&
    membership.status === TenantMembershipStatus.ACTIVE &&
    (membership.role === TenantRole.OWNER ||
      membership.role === TenantRole.ADMIN)
  );
}

export async function getMcpTenantMembershipForUid(
  tenantId: string,
  uid: string,
): Promise<TenantMembership | null> {
  const snapshot = await getAdminDb()
    .collection("tenantMemberships")
    .doc(buildTenantMembershipId(tenantId, uid))
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return (snapshot.data() as TenantMembership | undefined) ?? null;
}

export async function resolveMcpTenantContextForHeaders(
  headers: Headers,
  explicitTenantId?: string,
): Promise<TenantContext> {
  const baseContext = getTenantContext(explicitTenantId);
  const requestBaseContext =
    explicitTenantId || baseContext.deploymentMode !== "saas"
      ? baseContext
      : { ...baseContext, tenantId: undefined };

  if (
    requestBaseContext.deploymentMode !== "saas" ||
    requestBaseContext.tenantId
  ) {
    return requestBaseContext;
  }

  const hostname = resolveRequestTenantHostname(headers);
  if (hostname) {
    const hostnameTenantId = await getTenantIdForHostname(hostname);
    if (hostnameTenantId) {
      return getTenantContext(hostnameTenantId);
    }
  }

  const cookieTenantId = readCookie(headers, adminTenantIdCookieName)?.trim();
  return getTenantContext(cookieTenantId);
}

export async function resolveMcpTenantAuthorization(
  headers: Headers,
  user: UserRecord,
  explicitTenantId?: string,
): Promise<McpTenantAuthorization | null> {
  const tenantContext = await resolveMcpTenantContextForHeaders(
    headers,
    explicitTenantId,
  );

  if (!shouldScopeTenantAccess(tenantContext)) {
    return {};
  }

  const tenantId = tenantContext.tenantId?.trim();
  if (!tenantId) {
    return null;
  }

  if (hasSuperAdminClaim(user)) {
    return {
      channelIds: [],
      tenantId,
    };
  }

  const membership = await getMcpTenantMembershipForUid(tenantId, user.uid);
  if (!isMcpAdminTenantMembership(membership)) {
    return null;
  }

  return {
    accessLevel: membership.accessLevel,
    channelIds: normalizeMembershipChannelIds(membership.channelIds),
    role: membership.role,
    tenantId,
  };
}
