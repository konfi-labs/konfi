"use server";

import { getTenantAdminScopeTenantId, requireAdminAuth } from "./auth-utils";
import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { CampaignNotification } from "@konfi/emails";
import { Campaign, Channel, NotificationType } from "@konfi/types";
import {
  ADMIN_CAMPAIGNS_UPDATE,
  getAvailabilityMessage,
  getChannelNotificationEmails,
} from "@konfi/utils";

function getAdminCampaignUrl(campaignId: string): string | undefined {
  const baseUrl =
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim();

  if (!baseUrl) {
    return;
  }

  return new URL(ADMIN_CAMPAIGNS_UPDATE(campaignId), baseUrl).toString();
}

function timestampLikeToString(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString().split("T")[0] ?? value.toISOString();
  }

  if (typeof value === "object" && "toDate" in value) {
    const toDate = value.toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value) as unknown;
      if (date instanceof Date) {
        return date.toISOString().split("T")[0] ?? date.toISOString();
      }
    }
  }

  return String(value);
}

export async function sendCampaignCreatedNotifications(campaignId: string) {
  await requireAdminAuth();

  const firestore = getAdminDb();
  const tenantContext = await getTenantContextForRequest();
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const campaignSnapshot = await firestore
    .collection("campaigns")
    .doc(campaignId)
    .get();

  if (!campaignSnapshot.exists) {
    throw new Error("Campaign not found");
  }

  const campaign = {
    ...(campaignSnapshot.data() as Campaign),
    id: campaignSnapshot.id,
  } satisfies Campaign;
  let channelsQuery = firestore.collection(
    "channels",
  ) as FirebaseFirestore.Query;

  if (tenantId) {
    channelsQuery = channelsQuery.where("tenantId", "==", tenantId);
  }

  const channelsSnapshot = await channelsQuery.get();
  const channels = channelsSnapshot.docs.map((doc) => ({
    ...(doc.data() as Channel),
    id: doc.id,
  }));
  const campaignUrl = getAdminCampaignUrl(campaign.id);
  const emailResults = await Promise.allSettled(
    channels.flatMap((channel) => {
      if (
        !channel.notifications?.enabledTypes.includes(
          NotificationType.CAMPAIGN_CREATED,
        )
      ) {
        return [];
      }

      return getChannelNotificationEmails(
        channel,
        process.env.NOTIFICATIONS_EMAIL,
      ).map((notificationEmail) =>
        sendEmail({
          to: notificationEmail,
          from: process.env.NO_REPLY_EMAIL?.trim(),
          subject: `Nowa kampania: ${campaign.name}`,
          template: CampaignNotification({
            brand: "admin",
            campaignName: campaign.name ?? campaign.id,
            description: campaign.description ?? "",
            startDate: timestampLikeToString(campaign.startsAt),
            endDate: timestampLikeToString(campaign.endsAt),
            availabilityType: getAvailabilityMessage(campaign),
            url: campaignUrl,
          }),
        }),
      );
    }),
  );

  emailResults.forEach((result) => {
    if (result.status === "rejected") {
      console.error(
        "Failed to send campaign notification email",
        result.reason,
      );
    }
  });

  return {
    sent: emailResults.filter((result) => result.status === "fulfilled").length,
  };
}
