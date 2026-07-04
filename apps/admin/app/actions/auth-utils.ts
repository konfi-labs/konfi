import "server-only";

import {
  buildTenantMembershipId,
  type TenantContext,
  type TenantMembership,
  type TenantPermission,
  TenantMembershipStatus,
  TenantRole,
} from "@sblyvwx/cloud-contracts";
import { type NestedMember } from "@konfi/types";
import {
  getAdminDb,
  getTenantContextForRequest,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";
import type { DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export class AdminAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
  }
}

export interface TenantAdminAuthContext {
  membership: TenantMembership | null;
  tenantContext: TenantContext;
  uid: string;
}

export type TenantAdminChannelAccess =
  | {
      allChannels: true;
      channelIds: [];
    }
  | {
      allChannels: false;
      channelIds: string[];
    };

interface TenantOwnedData {
  tenantId?: string | null;
}

function normalizeMembershipChannelIds(
  channelIds: TenantMembership["channelIds"],
): string[] {
  if (!channelIds) {
    return [];
  }

  return [
    ...new Set(
      channelIds
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0),
    ),
  ];
}

function normalizeRequiredChannelId(channelId: string): string {
  const trimmedChannelId = channelId.trim();

  if (!trimmedChannelId) {
    throw new AdminAuthError("Channel ID is required", 400);
  }

  return trimmedChannelId;
}

function shouldScopeTenantAdminAccess(tenantContext: TenantContext): boolean {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function getTenantMembershipLoginPriority(
  membership: TenantMembership,
): number {
  switch (membership.role) {
    case TenantRole.OWNER:
      return 0;
    case TenantRole.ADMIN:
      return 1;
    case TenantRole.MEMBER:
      return 2;
    case TenantRole.COURIER:
      return 3;
  }
}

export function pickDefaultTenantMembershipForLogin(
  memberships: TenantMembership[],
): TenantMembership | undefined {
  return memberships.toSorted((left, right) => {
    const priorityDelta =
      getTenantMembershipLoginPriority(left) -
      getTenantMembershipLoginPriority(right);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const accessLevelDelta = right.accessLevel - left.accessLevel;
    if (accessLevelDelta !== 0) {
      return accessLevelDelta;
    }

    const tenantDelta = left.tenantId.localeCompare(right.tenantId);
    if (tenantDelta !== 0) {
      return tenantDelta;
    }

    return left.id.localeCompare(right.id);
  })[0];
}

export function getTenantAdminScopeTenantId(
  tenantContext: TenantContext,
): string | undefined {
  if (!shouldScopeTenantAdminAccess(tenantContext)) {
    return undefined;
  }

  const tenantId = tenantContext.tenantId?.trim();
  if (!tenantId) {
    throw new AdminAuthError("Tenant context is required", 403);
  }

  return tenantId;
}

async function requireChannelDocumentInTenant(
  channelId: string,
  tenantContext: TenantContext,
): Promise<void> {
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  if (!tenantId) {
    return;
  }

  const channelSnapshot = await getAdminDb()
    .collection("channels")
    .doc(channelId)
    .get();
  const channelData = channelSnapshot.data() as TenantOwnedData | undefined;

  if (!channelSnapshot.exists || channelData?.tenantId !== tenantId) {
    throw new AdminAuthError("Tenant channel access is required", 403);
  }
}

export function getTenantMembershipChannelAccess(
  membership: TenantMembership | null,
): TenantAdminChannelAccess {
  if (
    !membership?.channelIds ||
    membership.channelIds.length === 0 ||
    membership.role === TenantRole.OWNER
  ) {
    return {
      allChannels: true,
      channelIds: [],
    };
  }

  return {
    allChannels: false,
    channelIds: normalizeMembershipChannelIds(membership.channelIds),
  };
}

export function tenantAdminChannelAccessAllows(
  access: TenantAdminChannelAccess,
  channelId: string,
): boolean {
  const trimmedChannelId = channelId.trim();

  return (
    trimmedChannelId.length > 0 &&
    (access.allChannels || access.channelIds.includes(trimmedChannelId))
  );
}

export function tenantMembershipCanAccessChannel(
  membership: TenantMembership | null,
  channelId: string,
): boolean {
  return tenantAdminChannelAccessAllows(
    getTenantMembershipChannelAccess(membership),
    channelId,
  );
}

export function tenantMembershipHasFullTenantScope(
  membership: TenantMembership | null,
): boolean {
  return getTenantMembershipChannelAccess(membership).allChannels;
}

function decodedClaimsAreSuperAdmin(decodedClaims: DecodedIdToken): boolean {
  return decodedClaims.admin === true && decodedClaims.accessLevel === 9999;
}

export function membershipHasPermission(
  membership: TenantMembership | null,
  permission: TenantPermission,
): boolean {
  if (!membership || membership.status !== TenantMembershipStatus.ACTIVE) {
    return false;
  }

  if (membership.role === TenantRole.OWNER) {
    return true;
  }

  if (membership.role !== TenantRole.ADMIN) {
    return false;
  }

  if (!("permissions" in membership)) {
    return true;
  }

  return membership.permissions?.includes(permission) ?? false;
}

async function clearAdminAuthCookies(cookieStore: CookieStore): Promise<void> {
  cookieStore.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
  cookieStore.set("__isAdmin", "false", { ...baseCookieOptions, maxAge: 0 });
  cookieStore.set("__isCourier", "false", {
    ...baseCookieOptions,
    maxAge: 0,
  });
}

export async function clearInvalidAdminAuthCookies(
  cookieStore?: CookieStore,
): Promise<void> {
  await clearAdminAuthCookies(cookieStore ?? (await cookies()));
}

export async function clearInvalidAdminAuthCookiesForError(
  error: unknown,
  cookieStore?: CookieStore,
): Promise<boolean> {
  if (!(error instanceof AdminAuthError) || error.statusCode !== 401) {
    return false;
  }

  await clearInvalidAdminAuthCookies(cookieStore);
  return true;
}

async function requireDecodedSessionClaims(
  cookieStore: CookieStore,
): Promise<DecodedIdToken> {
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) {
    throw new AdminAuthError("Unauthorized: Staff access required", 401);
  }

  const decodedClaims = await verifySessionCookie(sessionCookie);
  if (!decodedClaims) {
    throw new AdminAuthError("Unauthorized: Staff access required", 401);
  }

  return decodedClaims;
}

async function requireDecodedAdminClaims(
  cookieStore: CookieStore,
): Promise<DecodedIdToken> {
  const decodedClaims = await requireDecodedSessionClaims(cookieStore);
  if (decodedClaims.admin !== true) {
    throw new AdminAuthError("Unauthorized: Admin access required", 401);
  }

  return decodedClaims;
}

/**
 * Checks if the current request has admin access
 * @throws {Error} If admin access is not granted
 */
export async function requireAdminAuth(
  cookieStore?: CookieStore,
): Promise<void> {
  await requireTenantAdminAuth(undefined, cookieStore);
}

export async function getTenantMembershipForUid(
  tenantId: string,
  uid: string,
): Promise<TenantMembership | null> {
  const membershipSnapshot = await getAdminDb()
    .collection("tenantMemberships")
    .doc(buildTenantMembershipId(tenantId, uid))
    .get();

  if (!membershipSnapshot.exists) {
    return null;
  }

  const membership = membershipSnapshot.data();
  if (!membership) {
    return null;
  }

  return membership as TenantMembership;
}

export async function listActiveAdminTenantMembershipsForUid(
  uid: string,
): Promise<TenantMembership[]> {
  const membershipSnapshot = await getAdminDb()
    .collection("tenantMemberships")
    .where("uid", "==", uid)
    .where("status", "==", TenantMembershipStatus.ACTIVE)
    .get();

  return membershipSnapshot.docs
    .map((document) => document.data() as TenantMembership)
    .filter(isAdminTenantMembership);
}

export function isAdminTenantMembership(
  membership: TenantMembership | null,
): membership is TenantMembership {
  return (
    membership !== null && membership.status === TenantMembershipStatus.ACTIVE
  );
}

export async function requireTenantAdminAuth(
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantMembership | null> {
  const { membership } = await requireTenantAdminAuthContext(
    tenantId,
    cookieStore,
  );

  return membership;
}

export async function requireTenantAdminAuthContext(
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantAdminAuthContext> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);
  return requireTenantAdminAuthContextForUid(decodedClaims.uid, tenantId);
}

export async function requireTenantAdminAuthContextForUid(
  uid: string,
  tenantId?: string | null,
): Promise<TenantAdminAuthContext> {
  const tenantContext = await getTenantContextForRequest(tenantId);

  if (!tenantContext.requireTenantId) {
    return {
      membership: null,
      tenantContext,
      uid,
    };
  }

  if (!tenantContext.tenantId) {
    throw new AdminAuthError("Tenant context is required", 403);
  }

  const membership = await getTenantMembershipForUid(
    tenantContext.tenantId,
    uid,
  );

  if (!isAdminTenantMembership(membership)) {
    throw new AdminAuthError("Tenant membership is required", 403);
  }

  return {
    membership,
    tenantContext,
    uid,
  };
}

export async function requireTenantPermission(
  permission: TenantPermission,
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantAdminAuthContext> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);

  if (decodedClaimsAreSuperAdmin(decodedClaims)) {
    return {
      membership: null,
      tenantContext: await getTenantContextForRequest(tenantId),
      uid: decodedClaims.uid,
    };
  }

  const authContext = await requireTenantAdminAuthContext(
    tenantId,
    resolvedCookieStore,
  );

  if (!authContext.membership) {
    return authContext;
  }

  if (!membershipHasPermission(authContext.membership, permission)) {
    throw new AdminAuthError("Tenant permission is required", 403);
  }

  return authContext;
}

export async function requireTenantWidePermission(
  permission: TenantPermission,
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantAdminAuthContext> {
  const authContext = await requireTenantPermission(
    permission,
    tenantId,
    cookieStore,
  );

  if (
    authContext.membership &&
    !tenantMembershipHasFullTenantScope(authContext.membership)
  ) {
    throw new AdminAuthError("Full tenant access is required", 403);
  }

  return authContext;
}

export async function getTenantAdminChannelAccess(
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantAdminChannelAccess> {
  const { membership } = await requireTenantAdminAuthContext(
    tenantId,
    cookieStore,
  );

  return getTenantMembershipChannelAccess(membership);
}

export async function getTenantAdminChannelAccessContext(
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<
  TenantAdminAuthContext & { channelAccess: TenantAdminChannelAccess }
> {
  const authContext = await requireTenantAdminAuthContext(
    tenantId,
    cookieStore,
  );

  return {
    ...authContext,
    channelAccess: getTenantMembershipChannelAccess(authContext.membership),
  };
}

export async function requireTenantAdminChannelAccess(
  channelId: string,
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<string> {
  const trimmedChannelId = normalizeRequiredChannelId(channelId);
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);

  if (decodedClaimsAreSuperAdmin(decodedClaims)) {
    return trimmedChannelId;
  }

  const { membership, tenantContext } = await requireTenantAdminAuthContext(
    tenantId,
    resolvedCookieStore,
  );

  if (!tenantMembershipCanAccessChannel(membership, trimmedChannelId)) {
    throw new AdminAuthError("Tenant channel access is required", 403);
  }

  await requireChannelDocumentInTenant(trimmedChannelId, tenantContext);

  return trimmedChannelId;
}

export async function requireSuperAdminAuth(
  cookieStore?: CookieStore,
): Promise<void> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);

  if (!decodedClaimsAreSuperAdmin(decodedClaims)) {
    throw new AdminAuthError("Unauthorized: Super admin access required", 403);
  }
}

export async function requireTenantOwnerOrSuperAdminAuth(
  tenantId?: string | null,
  cookieStore?: CookieStore,
): Promise<TenantAdminAuthContext> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);
  const tenantContext = await getTenantContextForRequest(tenantId);

  if (decodedClaimsAreSuperAdmin(decodedClaims)) {
    return {
      membership: null,
      tenantContext,
      uid: decodedClaims.uid,
    };
  }

  const authContext = await requireTenantAdminAuthContext(
    tenantId,
    resolvedCookieStore,
  );

  if (authContext.membership?.role !== TenantRole.OWNER) {
    throw new AdminAuthError("Tenant owner access is required", 403);
  }

  return authContext;
}

export async function requireAdminOrCourierAuth(
  cookieStore?: CookieStore,
): Promise<DecodedIdToken> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedSessionClaims(resolvedCookieStore);

  if (decodedClaims.admin !== true && decodedClaims.courier !== true) {
    throw new AdminAuthError(
      "Unauthorized: Admin or courier access required",
      401,
    );
  }

  return decodedClaims;
}

export async function getAuthenticatedAdminUid(
  cookieStore?: CookieStore,
): Promise<string> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  const decodedClaims = await requireDecodedAdminClaims(resolvedCookieStore);
  return decodedClaims.uid;
}

export async function getAuthenticatedAdminClaims(
  cookieStore?: CookieStore,
): Promise<DecodedIdToken> {
  const resolvedCookieStore = cookieStore ?? (await cookies());
  return requireDecodedAdminClaims(resolvedCookieStore);
}

export async function getAuthenticatedAdminMember(
  cookieStore?: CookieStore,
): Promise<NestedMember> {
  const decodedClaims = await getAuthenticatedAdminClaims(cookieStore);

  return {
    id: decodedClaims.uid,
    name:
      typeof decodedClaims.name === "string" && decodedClaims.name.trim()
        ? decodedClaims.name.trim()
        : "Admin",
  };
}
