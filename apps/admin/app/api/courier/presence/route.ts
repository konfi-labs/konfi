"use server";

import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import {
  buildTenantMembershipId,
  type TenantContext,
  type TenantMembership,
  TenantMembershipStatus,
  TenantRole,
} from "@sblyvwx/cloud-contracts";

import {
  getAdminDb,
  getTenantContextForRequest,
  verifyAnyIdToken,
} from "@/lib/firebase/serverApp";

type CourierPresenceRequest = {
  channelId?: string;
  userId?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  userAgent?: string | null;
  timestamp?: number;
  source?: string;
};

type UserClaims = {
  admin?: unknown;
  courier?: unknown;
  accessLevel?: unknown;
};

type UserRecord = {
  customClaims?: UserClaims;
  uid: string;
};

type ChannelData = {
  tenantId?: string | null;
};

function isSuperAdmin(userRecord: UserRecord): boolean {
  return (
    userRecord.customClaims?.admin === true &&
    userRecord.customClaims.accessLevel === 9999
  );
}

function shouldScopeTenantAccess(tenantContext: TenantContext): boolean {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function membershipCanUseChannel(
  membership: TenantMembership | null,
  channelId: string,
  allowedRoles: readonly TenantRole[],
): boolean {
  if (
    !membership ||
    membership.status !== TenantMembershipStatus.ACTIVE ||
    !allowedRoles.includes(membership.role)
  ) {
    return false;
  }

  const channelIds = membership.channelIds
    ?.map((value) => value.trim())
    .filter((value) => value.length > 0);

  return (
    !channelIds || channelIds.length === 0 || channelIds.includes(channelId)
  );
}

async function loadTenantMembership(
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

async function requireAuthorizedChannelPresenceWrite(
  channelId: string,
  userRecord: UserRecord,
): Promise<void> {
  const claims = userRecord.customClaims || {};
  if (isSuperAdmin(userRecord)) {
    return;
  }

  const tenantContext = await getTenantContextForRequest();
  const scopesTenantAccess = shouldScopeTenantAccess(tenantContext);
  if (!scopesTenantAccess) {
    return;
  }

  const tenantId = tenantContext.tenantId?.trim();
  if (!tenantId) {
    throw new Response("Forbidden", { status: 403 });
  }

  const channelSnapshot = await getAdminDb()
    .collection("channels")
    .doc(channelId)
    .get();
  const channel = channelSnapshot.data() as ChannelData | undefined;
  if (!channelSnapshot.exists || channel?.tenantId !== tenantId) {
    throw new Response("Forbidden", { status: 403 });
  }

  const allowedRoles =
    claims.admin === true
      ? ([TenantRole.OWNER, TenantRole.ADMIN] as const)
      : ([TenantRole.COURIER] as const);
  const membership = await loadTenantMembership(tenantId, userRecord.uid);

  if (!membershipCanUseChannel(membership, channelId, allowedRoles)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const firestore = getAdminDb();

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userRecord = await verifyAnyIdToken(idToken);
    if (!userRecord) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as CourierPresenceRequest;
    const channelId =
      typeof body.channelId === "string" ? body.channelId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!channelId || !userId) {
      return Response.json(
        { error: "Missing channelId or userId" },
        { status: 400 },
      );
    }
    if (userRecord.uid !== userId) {
      return new Response("Forbidden", { status: 403 });
    }
    const claims = userRecord.customClaims || {};
    if (!claims.courier && !claims.admin) {
      return new Response("Forbidden", { status: 403 });
    }
    await requireAuthorizedChannelPresenceWrite(channelId, userRecord);

    const latitude =
      typeof body.location?.latitude === "number"
        ? body.location.latitude
        : undefined;
    const longitude =
      typeof body.location?.longitude === "number"
        ? body.location.longitude
        : undefined;
    const accuracy = typeof body.accuracy === "number" ? body.accuracy : null;
    const heading = typeof body.heading === "number" ? body.heading : null;
    const speed = typeof body.speed === "number" ? body.speed : null;
    const userAgent =
      typeof body.userAgent === "string" ? body.userAgent : null;
    const timestamp =
      typeof body.timestamp === "number" ? body.timestamp : Date.now();

    const docRef = firestore.doc(`/channels/${channelId}/couriers/${userId}`);
    const updatePayload: Record<string, unknown> = {
      uid: userId,
      updatedAt: FieldValue.serverTimestamp(),
      lastBackgroundSyncAt: FieldValue.serverTimestamp(),
      backgroundSyncedAtMs: timestamp,
      accuracy,
      heading,
      speed,
      userAgent,
      source: body.source || "periodic-sync",
      activePage: "delivery",
    };
    if (latitude !== undefined && longitude !== undefined) {
      updatePayload.location = new GeoPoint(latitude, longitude);
    } else {
      updatePayload.location = null;
    }

    await docRef.set(updatePayload, { merge: true });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("Courier presence sync failed", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
