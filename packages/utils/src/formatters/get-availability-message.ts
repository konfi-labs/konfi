import { Campaign, CampaignAvailabilityTypeEnum } from "@konfi/types";
import type { TFunction } from "i18next";

export function getAvailabilityMessage(
  campaign: Campaign,
  t?: TFunction,
): string {
  if (!campaign.availabilityTypes || campaign.availabilityTypes.length === 0) {
    // Default message for backward compatibility
    return t
      ? t("store.availability.onlineOnly", {
          defaultValue: "*Special offer available online only!",
        })
      : "*Special offer available online only!";
  }
  // If has POS but not ONLINE
  if (
    campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.POS) &&
    !campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.ONLINE)
  ) {
    return t
      ? t("store.availability.posOnly", {
          defaultValue: "*Special offer available in physical store only!",
        })
      : "*Special offer available in physical store only!";
  }

  // If has ONLINE but not POS
  if (
    campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.ONLINE) &&
    !campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.POS)
  ) {
    return t
      ? t("store.availability.onlineOnly", {
          defaultValue: "*Special offer available online only!",
        })
      : "*Special offer available online only!";
  }

  // If has both ONLINE and POS
  if (
    campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.ONLINE) &&
    campaign.availabilityTypes.includes(CampaignAvailabilityTypeEnum.POS)
  ) {
    return t
      ? t("store.availability.onlineAndPos", {
          defaultValue:
            "*Special offer available both online and in physical store!",
        })
      : "*Special offer available both online and in physical store!";
  }
  // Fallback for any other case
  return t
    ? t("store.availability.onlineOnly", {
        defaultValue: "*Special offer available online only!",
      })
    : "*Special offer available online only!";
}
