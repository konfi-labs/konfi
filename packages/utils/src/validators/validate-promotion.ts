import { Campaign, Promotion } from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";

export function validatePromotion(
  promotion: Promotion,
  campaign?: Campaign,
): boolean {
  // Check if the promotion is active
  if (!promotion.active) {
    return false;
  }

  if (!promotion.applicationMethod) {
    return false;
  }

  if (!promotion.applicationMethod.type) {
    return false;
  }

  if (!promotion.applicationMethod.targetType) {
    return false;
  }

  if (!promotion.applicationMethod.allocation) {
    return false;
  }

  if (!promotion.applicationMethod.value) {
    return false;
  }

  if (!promotion.applicationMethod.currencyCode) {
    return false;
  }

  if (promotion.applicationMethod.maxQuantity === null) {
    return false;
  }

  if (campaign && promotion.campaignId) {
    // Check if the promotion matches the campaign
    if (promotion.campaignId !== campaign.id) {
      return false;
    }

    // Check if the campaign has started and has not ended
    const now = new Date();
    if (campaign.startsAt) {
      const startDate = new Date(campaign.startsAt);
      if (now < startDate) {
        return false;
      }
      if (campaign.endsAt) {
        const endDate = new Date(campaign.endsAt);
        if (now > endDate) {
          return false;
        }
      }
    }

    if (campaign.budget && campaign.budget.limit && campaign.budget.used) {
      if (campaign.budget.used >= campaign.budget.limit) {
        return false;
      }
    }
  }

  // Check if the promotion has valid rules
  if (promotion.rules) {
    for (const rule of promotion.rules) {
      if (!rule.attribute) {
        return false;
      }

      if (isEmpty(rule.operator)) {
        return false;
      }

      if (isEmpty(rule.values)) {
        return false;
      }
    }
  }

  return true;
}
