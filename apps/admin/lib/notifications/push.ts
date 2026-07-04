import "server-only";

import { getAdminDb, getAdminMessaging } from "@/lib/firebase/serverApp";
import type { Notification } from "@konfi/types";
import type { Message } from "firebase-admin/messaging";
import type { Timestamp } from "firebase-admin/firestore";

type TenantNotification = Notification & {
  tenantId?: string;
};

type FcmTokenData = {
  tenantId?: string;
  tokens?: Array<{
    value?: unknown;
    timestamp?: Timestamp;
  }>;
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

function readTokenValues(data: FcmTokenData): string[] {
  return (data.tokens ?? [])
    .map((token) => token.value)
    .filter((value): value is string => typeof value === "string");
}

export async function publishNotificationPush(
  notification: TenantNotification,
) {
  const tokensCollection = getAdminDb().collection("fcmTokens");
  const tokenQuery = notification.tenantId
    ? tokensCollection.where("tenantId", "==", notification.tenantId)
    : requiresTenantScopedNotifications()
      ? null
      : tokensCollection;

  if (!tokenQuery) {
    console.warn(
      "Skipping tenantless notification push in tenant-scoped mode",
      {
        notificationId: notification.id,
      },
    );
    return;
  }

  const tokenSnapshot = await tokenQuery.get();
  const tokens = tokenSnapshot.docs.flatMap((doc) =>
    readTokenValues(doc.data() as FcmTokenData),
  );

  if (tokens.length === 0) {
    return;
  }

  const messages: Message[] = tokens.map((token) => ({
    token,
    notification: {
      title: notification.title,
      body: notification.options?.body ?? "",
    },
  }));

  await getAdminMessaging()
    .sendEach(messages)
    .catch((error: unknown) => {
      console.error("Error sending push notification", error);
    });
}
