import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { Notification } from "@konfi/types";
import { publishNotificationPush } from "./push";

type TenantNotification = Notification & {
  tenantId?: string;
};

type TenantOwnedData = {
  tenantId?: string | null;
};

function parseBooleanFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return Boolean(normalized && ["1", "true", "yes", "on"].includes(normalized));
}

function requiresTenantScopedNotifications() {
  const deploymentMode = (
    process.env.KONFI_DEPLOYMENT_MODE ??
    process.env.DEPLOYMENT_MODE ??
    ""
  )
    .trim()
    .toLowerCase();

  return (
    deploymentMode === "saas" ||
    parseBooleanFlag(
      process.env.KONFI_REQUIRE_TENANT_ID ?? process.env.REQUIRE_TENANT_ID,
    )
  );
}

async function resolveChannelTenantId(params: {
  channelId?: string;
  firestore: FirebaseFirestore.Firestore;
}) {
  if (!params.channelId || !requiresTenantScopedNotifications()) {
    return;
  }

  const channelSnapshot = await params.firestore
    .collection("channels")
    .doc(params.channelId)
    .get();
  const channelData = channelSnapshot.data() as TenantOwnedData | undefined;

  return channelData?.tenantId?.trim() || undefined;
}

async function withResolvedTenantId(
  notification: Notification,
  firestore: FirebaseFirestore.Firestore,
  tenantContext?: TenantContext,
): Promise<TenantNotification> {
  const tenantId = tenantContext?.tenantId?.trim();

  if (tenantId) {
    return { ...notification, tenantId };
  }

  const channelTenantId = await resolveChannelTenantId({
    channelId: notification.channelId,
    firestore,
  });

  return channelTenantId
    ? { ...notification, tenantId: channelTenantId }
    : notification;
}

export async function createAppNotification(params: {
  firestore: FirebaseFirestore.Firestore;
  notification: Notification;
  tenantContext?: TenantContext;
}) {
  const notificationRef = params.firestore.collection("notifications").doc();
  const notification = await withResolvedTenantId(
    {
      ...params.notification,
      id: notificationRef.id,
    },
    params.firestore,
    params.tenantContext,
  );

  await notificationRef.set(notification);
  await publishNotificationPush(notification);

  return notification;
}

export async function publishCreatedAppNotification(
  notification: Notification,
) {
  const notificationWithTenantId = await withResolvedTenantId(
    notification,
    getAdminDb(),
  );
  const originalTenantId = (notification as TenantNotification).tenantId;

  if (notificationWithTenantId.tenantId && !originalTenantId) {
    await getAdminDb()
      .collection("notifications")
      .doc(notification.id)
      .set({ tenantId: notificationWithTenantId.tenantId }, { merge: true });
  }

  await publishNotificationPush(notificationWithTenantId);
}
