import { Timestamp } from "firebase/firestore";
import { CampaignBudget } from "./campaign-budget";
import { Promotion } from "./promotion";
import { CampaignAvailabilityTypeEnum } from "../../enums";
import type { TenantOwned } from "../../tenant";

/**
 * The campaign's possible availability types.
 */
export type CampaignAvailabilityTypeValues =
  keyof typeof CampaignAvailabilityTypeEnum;

/**
 * The campaign details.
 */
export interface Campaign extends TenantOwned {
  /**
   * The ID of the campaign.
   */
  id: string;

  /**
   * The name of the campaign.
   */
  name?: string;

  /**
   * The description of the campaign.
   */
  description?: string;

  /**
   * The campaign identifier of the campaign.
   */
  campaignIdentifier?: string;

  /**
   * The start date of the campaign.
   */
  startsAt?: string;

  /**
   * The end date of the campaign.
   */
  endsAt?: string;

  /**
   * The availability types of the campaign (ONLINE, POS).
   */
  availabilityTypes?: CampaignAvailabilityTypeValues[];

  /**
   * The associated campaign budget.
   */
  budget?: CampaignBudget;

  /**
   * The associated promotions.
   */
  promotions?: Promotion[];

  /**
   * The date the campaign was created.
   */
  createdAt: Timestamp;

  /**
   * The date the campaign was updated.
   */
  updatedAt: Timestamp;
}
