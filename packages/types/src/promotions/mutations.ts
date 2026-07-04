import { Timestamp } from "firebase/firestore";
import {
  CampaignBudgetTypeValues,
  CampaignAvailabilityTypeValues,
} from "./common";

/**
 * The campaign budget to be created.
 */
export interface CreateCampaignBudget {
  /**
   * The type of the campaign budget.
   */
  type?: CampaignBudgetTypeValues;

  /**
   * The limit of the campaign budget.
   */
  limit?: number | null;

  /**
   * How much is used of the campaign budget.
   */
  used?: number;

  /**
   * The currency of the campaign.
   */
  currencyCode?: string | null;
}

/**
 * The attributes to update in the campaign budget.
 */
export interface UpdateCampaignBudget {
  /**
   * The ID of the campaign budget.
   */
  id: string;

  /**
   * The type of the campaign budget.
   */
  type?: CampaignBudgetTypeValues;

  /**
   * The limit of the campaign budget.
   */
  limit?: number | null;

  /**
   * The limit of the campaign budget.
   */
  currencyCode?: string | null;

  /**
   * How much is used of the campaign budget.
   */
  used?: number;
}

/**
 * The campaign to be created.
 */
export interface CreateCampaign {
  /**
   * The name of the campaign.
   */
  name: string;

  /**
   * The description of the campaign.
   */
  description?: string | null;

  /**
   * The campaign identifier of the campaign.
   */
  campaignIdentifier: string;

  /**
   * The start date of the campaign.
   */
  startsAt?: string | null;

  /**
   * The end date of the campaign.
   */
  endsAt?: string | null;

  /**
   * The availability types of the campaign (ONLINE, POS).
   */
  availabilityTypes?: CampaignAvailabilityTypeValues[];

  /**
   * The associated campaign budget.
   */
  budget?: CreateCampaignBudget | null;

  /**
   * The date the campaign was created.
   */
  createdAt: Timestamp;

  /**
   * The date the campaign was updated.
   */
  updatedAt: Timestamp;
}

/**
 * The attributes to update in the campaign.
 */
export interface UpdateCampaign {
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
  description?: string | null;

  /**
   * The campaign identifier of the campaign.
   */
  campaignIdentifier?: string;

  /**
   * The start date of the campaign.
   */
  startsAt?: string | null;

  /**
   * The end date of the campaign.
   */
  endsAt?: string | null;

  /**
   * The availability types of the campaign (ONLINE, POS).
   */
  availabilityTypes?: CampaignAvailabilityTypeValues[];

  /**
   * The budget of the campaign.
   */
  budget?: Omit<UpdateCampaignBudget, "id"> | null;

  /**
   * The date the campaign was updated.
   */
  updatedAt: Timestamp;
}

export interface AddPromotionsToCampaign {
  /**
   * The ID of the campaign.
   */
  id: string;

  /**
   * Ids of promotions to add
   */
  promotionIds: string[];
}

export interface RemovePromotionsFromCampaign {
  /**
   * The ID of the campaign.
   */
  id: string;

  /**
   * Ids of promotions to add
   */
  promotionIds: string[];
}
