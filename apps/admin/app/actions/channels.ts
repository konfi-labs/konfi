"use server";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { buildTenantChannelMirrorDocument } from "@/lib/tenant-channel-mirror";
import type { Channel, NestedMember } from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";
import {
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@/lib/saas-runtime-quotas";
import {
  getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
  requireTenantAdminChannelAccess,
  requireTenantPermission,
  requireTenantWidePermission,
  tenantAdminChannelAccessAllows,
} from "./auth-utils";

const CHANNELS_QUERY_LIMIT = 1000;

export type SerializedChannelTimestamp = {
  nanoseconds: number;
  seconds: number;
};

export type AuthorizedChannel = Omit<Channel, "createdAt" | "updatedAt"> & {
  createdAt: SerializedChannelTimestamp;
  updatedAt: SerializedChannelTimestamp;
};

export interface CreateChannelActionInput {
  createdBy: NestedMember;
  currency: Channel["currency"];
  name: string;
  notifications?: Channel["notifications"];
  warehouses: Channel["warehouses"];
}

export interface UpdateChannelActionInput {
  currency: Channel["currency"];
  name: string;
  notifications?: Channel["notifications"];
  updatedBy: NestedMember;
  warehouses: Channel["warehouses"];
}

interface TenantData {
  moduleFlags?: {
    storefront?: boolean;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializeTimestamp(value: unknown): SerializedChannelTimestamp {
  if (!isRecord(value)) {
    return {
      nanoseconds: 0,
      seconds: 0,
    };
  }

  const seconds = readNumberProperty(value, ["seconds", "_seconds"]);
  const nanoseconds = readNumberProperty(value, [
    "nanoseconds",
    "_nanoseconds",
  ]);

  return {
    nanoseconds: nanoseconds ?? 0,
    seconds: seconds ?? 0,
  };
}

function isTimestampLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (readNumberProperty(value, ["seconds", "_seconds"]) !== undefined &&
      readNumberProperty(value, ["nanoseconds", "_nanoseconds"]) !==
        undefined) ||
    typeof value.toDate === "function"
  );
}

function serializeServerValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (isTimestampLike(value)) {
    return serializeTimestamp(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeServerValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeServerValue(nestedValue),
      ]),
    );
  }

  return undefined;
}

function serializeServerObject<T extends object>(value: T): T {
  return serializeServerValue(value) as T;
}

function readNumberProperty(
  value: Record<string, unknown>,
  propertyNames: readonly string[],
): number | undefined {
  for (const propertyName of propertyNames) {
    const propertyValue = value[propertyName];
    if (typeof propertyValue === "number") {
      return propertyValue;
    }
  }

  return undefined;
}

function serializeChannel(id: string, data: Channel): AuthorizedChannel {
  const serializedData = serializeServerObject(data);

  return {
    ...serializedData,
    id: data.id || id,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function isValidChannelDocumentId(channelId: string): boolean {
  return channelId.length > 0 && !channelId.includes("/");
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${label} is required.`);
  }

  return trimmedValue;
}

function normalizeSingleSegment(value: string, label: string): string {
  const trimmedValue = normalizeRequiredString(value, label);

  if (trimmedValue.includes("/")) {
    throw new Error(`${label} must be a single path segment.`);
  }

  return trimmedValue;
}

function normalizeMember(
  member: NestedMember,
  fallbackUid: string,
): NestedMember {
  const id = member.id.trim() || fallbackUid;
  const name = member.name.trim() || "Admin";

  return { id, name };
}

function normalizeWarehouses(warehouses: Channel["warehouses"]) {
  return [
    ...new Set(
      warehouses
        .map((warehouseId) => warehouseId.trim())
        .filter((warehouseId) => warehouseId.length > 0),
    ),
  ];
}

async function getTenantStorefrontEnabled(tenantId: string): Promise<boolean> {
  const tenantSnapshot = await getAdminDb()
    .collection("tenants")
    .doc(tenantId)
    .get();
  const tenant = tenantSnapshot.data() as TenantData | undefined;

  return tenant?.moduleFlags?.storefront !== false;
}

async function upsertTenantChannelMirror(input: {
  channel: Pick<Channel, "active" | "currency" | "name">;
  channelId: string;
  createdAt?: unknown;
  tenantId?: string;
}) {
  if (!input.tenantId) {
    return;
  }

  const storefrontEnabled = await getTenantStorefrontEnabled(input.tenantId);
  const mirror = buildTenantChannelMirrorDocument({
    channel: input.channel,
    storefrontEnabled,
    tenantId: input.tenantId,
  });

  await getAdminDb()
    .collection("tenantChannels")
    .doc(input.channelId)
    .set(
      {
        ...mirror,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function disableTenantChannelMirror(input: {
  channelId: string;
  tenantId?: string;
}) {
  if (!input.tenantId) {
    return;
  }

  await getAdminDb().collection("tenantChannels").doc(input.channelId).set(
    {
      status: "disabled",
      tenantId: input.tenantId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function debugChannels(event: string, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[admin-channels] ${event}`, details);
}

export async function loadAuthorizedChannels(): Promise<AuthorizedChannel[]> {
  const { channelAccess, tenantContext } =
    await getTenantAdminChannelAccessContext();
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const db = getAdminDb();

  debugChannels("load authorized channels", {
    allChannels: channelAccess.allChannels,
    channelIds: channelAccess.channelIds,
    tenantId: tenantId ?? null,
  });

  if (channelAccess.allChannels) {
    const channelsCollection = db.collection("channels");
    const channelsQuery = tenantId
      ? channelsCollection.where("tenantId", "==", tenantId)
      : channelsCollection;
    const snapshot = await channelsQuery.limit(CHANNELS_QUERY_LIMIT).get();

    debugChannels("loaded all tenant channels", {
      count: snapshot.size,
      tenantId: tenantId ?? null,
    });

    return snapshot.docs.map((doc) =>
      serializeChannel(doc.id, doc.data() as Channel),
    );
  }

  const channelIds = channelAccess.channelIds.filter(isValidChannelDocumentId);
  if (channelIds.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(
    channelIds.map((channelId) =>
      db.collection("channels").doc(channelId).get(),
    ),
  );
  const missingChannelIds = snapshots
    .filter((snapshot) => !snapshot.exists)
    .map((snapshot) => snapshot.id);

  if (missingChannelIds.length > 0) {
    debugChannels("membership references missing channels", {
      channelIds: missingChannelIds,
      tenantId: tenantId ?? null,
    });
  }

  const channels = snapshots
    .filter((snapshot) => {
      if (!snapshot.exists) {
        return false;
      }

      const channel = snapshot.data() as Channel | undefined;
      return !tenantId || channel?.tenantId === tenantId;
    })
    .map((snapshot) =>
      serializeChannel(snapshot.id, snapshot.data() as Channel),
    );

  debugChannels("loaded membership channels", {
    count: channels.length,
    requestedCount: channelIds.length,
    tenantId: tenantId ?? null,
  });

  return channels;
}

export async function createChannelAction(
  input: CreateChannelActionInput,
): Promise<AuthorizedChannel> {
  const { tenantContext, uid } = await requireTenantWidePermission(
    "configuration.channels.create",
  );
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const db = getAdminDb();

  await assertSaasRuntimeQuota({
    context: tenantContext,
    firestore: db,
    operation: "admin.channel.create",
    resource: "channels",
  });

  const channelRef = db.collection("channels").doc();
  const now = FieldValue.serverTimestamp();
  const channel = {
    active: true,
    createdAt: now as Channel["createdAt"],
    createdBy: normalizeMember(input.createdBy, uid),
    currency: input.currency,
    id: channelRef.id,
    name: normalizeRequiredString(input.name, "Channel name"),
    ...(input.notifications ? { notifications: input.notifications } : {}),
    ...(tenantId ? { tenantId } : {}),
    updatedAt: now as Channel["updatedAt"],
    updatedBy: normalizeMember(input.createdBy, uid),
    warehouses: normalizeWarehouses(input.warehouses),
  } satisfies Channel;

  await channelRef.set(channel);
  await upsertTenantChannelMirror({
    channel,
    channelId: channelRef.id,
    createdAt: now,
    tenantId,
  });
  await recordSaasRuntimeQuotaUsage({
    context: tenantContext,
    firestore: db,
    operation: "admin.channel.create",
    resource: "channels",
  });

  const snapshot = await channelRef.get();

  return serializeChannel(channelRef.id, snapshot.data() as Channel);
}

export async function updateChannelAction(
  channelId: string,
  input: UpdateChannelActionInput,
): Promise<AuthorizedChannel> {
  const normalizedChannelId = await requireTenantAdminChannelAccess(channelId);
  const { tenantContext, uid } = await requireTenantPermission(
    "configuration.channels.update",
  );
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const channelRef = getAdminDb()
    .collection("channels")
    .doc(normalizedChannelId);
  const snapshot = await channelRef.get();

  if (!snapshot.exists) {
    throw new Error("Channel not found.");
  }

  const existingChannel = snapshot.data() as Channel;
  const channelUpdate: Partial<Channel> = {
    currency: input.currency,
    name: normalizeRequiredString(input.name, "Channel name"),
    ...(input.notifications ? { notifications: input.notifications } : {}),
    ...((tenantId ?? existingChannel.tenantId)
      ? { tenantId: tenantId ?? existingChannel.tenantId }
      : {}),
    updatedAt: FieldValue.serverTimestamp() as Channel["updatedAt"],
    updatedBy: normalizeMember(input.updatedBy, uid),
    warehouses: normalizeWarehouses(input.warehouses),
  };

  await channelRef.update(channelUpdate);

  const updatedSnapshot = await channelRef.get();
  const updatedChannel = serializeChannel(
    normalizedChannelId,
    updatedSnapshot.data() as Channel,
  );

  await upsertTenantChannelMirror({
    channel: {
      active: updatedChannel.active,
      currency: updatedChannel.currency,
      name: updatedChannel.name,
    },
    channelId: normalizedChannelId,
    tenantId: tenantId ?? existingChannel.tenantId,
  });

  return updatedChannel;
}

export async function removeChannelAction(channelId: string): Promise<void> {
  const normalizedChannelId = normalizeSingleSegment(channelId, "Channel ID");
  const { channelAccess, tenantContext } =
    await getTenantAdminChannelAccessContext();
  const tenantId = getTenantAdminScopeTenantId(tenantContext);

  if (!tenantAdminChannelAccessAllows(channelAccess, normalizedChannelId)) {
    throw new Error("Tenant channel access is required.");
  }

  const db = getAdminDb();
  const channelRef = db.collection("channels").doc(normalizedChannelId);
  const channelSnapshot = await channelRef.get();
  const channel = channelSnapshot.data() as Channel | undefined;

  if (tenantId && channel?.tenantId !== tenantId) {
    throw new Error("Tenant channel access is required.");
  }

  await channelRef.delete();
  await disableTenantChannelMirror({
    channelId: normalizedChannelId,
    tenantId: tenantId ?? channel?.tenantId,
  });
}
