"use server";

import {
  AdminAuthError,
  membershipHasPermission,
  requireTenantAdminAuthContext,
  requireTenantOwnerOrSuperAdminAuth,
  tenantMembershipHasFullTenantScope,
} from "@/actions/auth-utils";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/serverApp";
import {
  buildTenantMembershipId,
  isTenantPermission,
  TENANT_PERMISSION_VERSION,
  type TenantMembership,
  TenantMembershipStatus,
  type TenantPermission,
  TenantRole,
} from "@sblyvwx/cloud-contracts";
import { FieldValue } from "firebase-admin/firestore";

const DEFAULT_DEDICATED_TENANT_ID = "default";

export interface TenantMembershipAccessRecord {
  accessLevel: number;
  channelIds: string[];
  displayName?: string;
  email?: string;
  id: string;
  permissionVersion?: 1;
  permissions?: TenantPermission[];
  role: TenantRole;
  status: TenantMembershipStatus;
  tenantId: string;
  uid: string;
}

export interface CurrentTenantAccess {
  canManageTenantAccess: boolean;
  channelIds: string[];
  hasExplicitPermissions: boolean;
  hasFullTenantScope: boolean;
  isLegacyFullAccess: boolean;
  permissions: TenantPermission[];
  role: TenantRole | null;
  tenantId?: string;
}

export interface SaveTenantMembershipAccessInput {
  channelIds?: string[];
  email?: string;
  permissions?: TenantPermission[];
  role: TenantRole;
  status: TenantMembershipStatus;
  tenantId?: string;
  uid?: string;
}

function resolveTenantIdFromContext(tenantId: string | undefined): string {
  const normalized = tenantId?.trim();
  return normalized || DEFAULT_DEDICATED_TENANT_ID;
}

function normalizeSingleSegment(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  if (trimmed.includes("/")) {
    throw new Error(`${label} must be a single path segment.`);
  }

  return trimmed;
}

function normalizeEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeChannelIds(channelIds: string[] | undefined): string[] {
  return [
    ...new Set(
      (channelIds ?? [])
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0),
    ),
  ];
}

function normalizePermissions(
  permissions: TenantPermission[] | undefined,
): TenantPermission[] {
  return [
    ...new Set(
      (permissions ?? []).filter((permission) =>
        isTenantPermission(permission),
      ),
    ),
  ];
}

function assertEditableRole(role: TenantRole): TenantRole {
  if (
    role !== TenantRole.OWNER &&
    role !== TenantRole.ADMIN &&
    role !== TenantRole.MEMBER &&
    role !== TenantRole.COURIER
  ) {
    throw new Error("Unsupported tenant role.");
  }

  return role;
}

function assertEditableStatus(
  status: TenantMembershipStatus,
): TenantMembershipStatus {
  if (
    status !== TenantMembershipStatus.ACTIVE &&
    status !== TenantMembershipStatus.INVITED &&
    status !== TenantMembershipStatus.DISABLED
  ) {
    throw new Error("Unsupported tenant membership status.");
  }

  return status;
}

function serializeMembership(
  membership: TenantMembership,
  identity?: { displayName?: string; email?: string },
): TenantMembershipAccessRecord {
  return {
    accessLevel: membership.accessLevel,
    channelIds: membership.channelIds ?? [],
    ...(identity?.displayName ? { displayName: identity.displayName } : {}),
    ...(identity?.email ? { email: identity.email } : {}),
    id: membership.id,
    ...(membership.permissionVersion
      ? { permissionVersion: membership.permissionVersion }
      : {}),
    ...(membership.permissions ? { permissions: membership.permissions } : {}),
    role: membership.role,
    status: membership.status,
    tenantId: membership.tenantId,
    uid: membership.uid,
  };
}

async function resolveMembershipIdentity(uid: string) {
  try {
    const user = await getAdminAuth().getUser(uid);
    return {
      displayName: user.displayName,
      email: user.email,
    };
  } catch {
    return {};
  }
}

async function resolveTargetUid(input: SaveTenantMembershipAccessInput) {
  const uid = input.uid?.trim();
  if (uid) {
    return normalizeSingleSegment(uid, "User ID");
  }

  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("User email or UID is required.");
  }

  const user = await getAdminAuth().getUserByEmail(email);
  return user.uid;
}

async function ensureAdminClaim(uid: string) {
  const auth = getAdminAuth();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};

  if (currentClaims.admin === true) {
    return;
  }

  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    admin: true,
    accessLevel:
      typeof currentClaims.accessLevel === "number"
        ? currentClaims.accessLevel
        : 1,
  });
}

export async function getCurrentTenantAccessAction(): Promise<CurrentTenantAccess> {
  const { membership, tenantContext } =
    await requireTenantOwnerOrSuperAdminAuth().catch(async (error: unknown) => {
      if (
        error instanceof AdminAuthError &&
        error.message === "Tenant owner access is required"
      ) {
        return requireTenantAdminAuthContext();
      }

      throw error;
    });
  const tenantId = resolveTenantIdFromContext(tenantContext.tenantId);

  if (!membership) {
    return {
      canManageTenantAccess: true,
      channelIds: [],
      hasExplicitPermissions: false,
      hasFullTenantScope: true,
      isLegacyFullAccess: true,
      permissions: [],
      role: TenantRole.OWNER,
      tenantId,
    };
  }

  return {
    canManageTenantAccess: membership.role === TenantRole.OWNER,
    channelIds:
      membership.role === TenantRole.OWNER ? [] : (membership.channelIds ?? []),
    hasExplicitPermissions: "permissions" in membership,
    hasFullTenantScope: tenantMembershipHasFullTenantScope(membership),
    isLegacyFullAccess:
      membership.role === TenantRole.OWNER ||
      (membership.role === TenantRole.ADMIN && !("permissions" in membership)),
    permissions: membership.permissions ?? [],
    role: membership.role,
    tenantId: membership.tenantId,
  };
}

export async function listTenantMembershipAccessAction(
  tenantId?: string,
): Promise<TenantMembershipAccessRecord[]> {
  const { tenantContext } = await requireTenantOwnerOrSuperAdminAuth(tenantId);
  const targetTenantId = resolveTenantIdFromContext(
    tenantId ?? tenantContext.tenantId,
  );

  const snapshot = await getAdminDb()
    .collection("tenantMemberships")
    .where("tenantId", "==", targetTenantId)
    .limit(1000)
    .get();

  const records = await Promise.all(
    snapshot.docs.map(async (document) => {
      const membership = document.data() as TenantMembership;
      return serializeMembership(
        {
          ...membership,
          id: membership.id || document.id,
        },
        await resolveMembershipIdentity(membership.uid),
      );
    }),
  );

  return records.sort((a, b) => {
    const left = a.email ?? a.displayName ?? a.uid;
    const right = b.email ?? b.displayName ?? b.uid;
    return left.localeCompare(right);
  });
}

export async function saveTenantMembershipAccessAction(
  input: SaveTenantMembershipAccessInput,
): Promise<TenantMembershipAccessRecord> {
  const { tenantContext } = await requireTenantOwnerOrSuperAdminAuth(
    input.tenantId,
  );
  const tenantId = resolveTenantIdFromContext(
    input.tenantId ?? tenantContext.tenantId,
  );
  const uid = await resolveTargetUid(input);
  const role = assertEditableRole(input.role);
  const status = assertEditableStatus(input.status);
  const permissions = normalizePermissions(input.permissions);
  const membershipId = buildTenantMembershipId(tenantId, uid);
  const membershipRef = getAdminDb()
    .collection("tenantMemberships")
    .doc(membershipId);
  const existingSnapshot = await membershipRef.get();
  const now = FieldValue.serverTimestamp();
  const data = {
    accessLevel: role === TenantRole.OWNER ? 5000 : 1,
    channelIds:
      role === TenantRole.OWNER ? [] : normalizeChannelIds(input.channelIds),
    id: membershipId,
    permissionVersion: TENANT_PERMISSION_VERSION,
    permissions,
    role,
    status,
    tenantId,
    uid,
    updatedAt: now,
    ...(existingSnapshot.exists ? {} : { createdAt: now }),
  } satisfies Omit<TenantMembership, "createdAt" | "updatedAt"> & {
    createdAt?: FieldValue;
    updatedAt: FieldValue;
  };

  await membershipRef.set(data, { merge: true });

  if (role === TenantRole.OWNER || role === TenantRole.ADMIN) {
    await ensureAdminClaim(uid);
  }

  const savedSnapshot = await membershipRef.get();
  const savedMembership = savedSnapshot.data() as TenantMembership | undefined;

  if (!savedMembership) {
    throw new AdminAuthError("Tenant membership could not be saved", 500);
  }

  return serializeMembership(
    { ...savedMembership, id: savedMembership.id || membershipId },
    await resolveMembershipIdentity(uid),
  );
}

export async function currentTenantMembershipHasPermissionAction(
  permission: TenantPermission,
): Promise<boolean> {
  const { membership } = await requireTenantAdminAuthContext();
  return !membership || membershipHasPermission(membership, permission);
}
