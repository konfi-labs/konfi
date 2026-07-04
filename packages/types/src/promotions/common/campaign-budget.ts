import { CampaignBudgetTypeEnum } from "../../enums";

/**
 * The campaign budget's possible types.
 */
export type CampaignBudgetTypeValues = keyof typeof CampaignBudgetTypeEnum;

/**
 * The campaign budget details.
 */
export interface CampaignBudget {
  /**
   * The type of the campaign budget:
   *
   * - `spend` indicates that the budget is limited by the amount discounted by the promotions in the associated campaign.
   * - `usage` indicates that the budget is limited by the number of times the promotions of the associated campaign have been used.
   *
   */
  type?: CampaignBudgetTypeValues;

  /**
   * The limit of the campaign budget.
   */
  limit?: number | null;

  /**
   * The usage from the campaign budget's limit:
   *
   * - If the budget's type is `spend`, the value of this attribute is the amount discounted so far by the promotions in the associated campaign.
   * - If the budget's type is `usage`, the value of this attribute is the number of times the promotions of the associated campaign have been used so far.
   *
   */
  used?: number;

  /**
   * The currency of the campaign.
   */
  currencyCode?: string;
}
