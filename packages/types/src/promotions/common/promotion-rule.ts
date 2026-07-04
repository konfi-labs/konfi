import { WhereFilterOp } from "firebase/firestore";
import {
  PromotionRuleAttributeEnum,
  PromotionRuleOperatorEnum,
} from "../../enums";

/**
 * The possible operators to use in a promotion rule.
 */
export type PromotionRuleOperatorValues =
  keyof typeof PromotionRuleOperatorEnum;

export const firestoreOperatorMapping: Record<
  PromotionRuleOperatorValues,
  WhereFilterOp
> = {
  GT: ">",
  LT: "<",
  EQ: "==",
  NE: "!=",
  IN: "in",
  LTE: "<=",
  GTE: ">=",
};

export type PromotionRuleAttributeValues =
  keyof typeof PromotionRuleAttributeEnum;

export interface PromotionRuleContext {
  channelId?: string;
  customerGroupIds?: string[];
  isFirstOrder?: boolean;
  productTypeId?: string;
  usageCount?: number;
}

/**
 * The promotion rule details.
 */
export interface PromotionRule {
  /**
   * The ID of the promotion rule.
   */
  id: string;

  /**
   * The description of the promotion rule.
   */
  description?: string | null;

  /**
   * The attribute of the promotion rule.
   */
  attribute?: PromotionRuleAttributeValues;

  /**
   * The operator of the promotion rule.
   */
  operator?: PromotionRuleOperatorValues;

  /**
   * The values of the promotion rule.
   */
  values: string[];
}

/**
 * The promotion rule to be created.
 */
export interface CreatePromotionRule {
  /**
   * The description of the promotion rule.
   */
  description?: string | null;

  /**
   * The attribute of the promotion rule.
   */
  attribute: PromotionRuleAttributeValues;

  /**
   * The operator of the promotion rule.
   */
  operator: PromotionRuleOperatorValues;

  /**
   * The values of the promotion rule.
   * When provided, `PromotionRuleValue` records are
   * created and associated with the promotion rule.
   */
  values: string[];
}

/**
 * The attributes to update in the promotion rule.
 */
export interface UpdatePromotionRule {
  /**
   * The ID of the promotion rule.
   */
  id: string;

  /**
   * The description of the promotion rule.
   */
  description?: string | null;

  /**
   * The attribute of the promotion rule.
   */
  attribute?: PromotionRuleAttributeValues;

  /**
   * The operator of the promotion rule.
   */
  operator?: PromotionRuleOperatorValues;

  /**
   * The values of the promotion rule.
   * When provided, `PromotionRuleValue` records are
   * created and associated with the promotion rule.
   */
  values?: string[];
}

/**
 * The details required when removing a promotion rule.
 */
export interface RemovePromotionRule {
  /**
   * The ID of the promotion rule to remove.
   */
  id: string;
}
