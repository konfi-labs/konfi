import {
  ApplicationMethodAllocationEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodTypeEnum,
} from "../../enums";
import { CreatePromotionRule, PromotionRule } from "./promotion-rule";

/**
 * The application method's possible types.
 */
export type ApplicationMethodTypeValues =
  keyof typeof ApplicationMethodTypeEnum;

/**
 * The application method's possible target types.
 */
export type ApplicationMethodTargetTypeValues =
  keyof typeof ApplicationMethodTargetTypeEnum;

/**
 * The application method's possible allocation values.
 */
export type ApplicationMethodAllocationValues =
  keyof typeof ApplicationMethodAllocationEnum;

/**
 * The application method details.
 */
export interface ApplicationMethod {
  /**
   * The ID of the application method.
   */
  id: string;

  /**
   * The type of the application method indicating how
   * the associated promotion is applied.
   */
  type?: ApplicationMethodTypeValues;

  /**
   * The target type of the application method indicating
   * whether the associated promotion is applied to the cart's items,
   * shipping methods, or the whole order.
   */
  targetType?: ApplicationMethodTargetTypeValues;

  /**
   * The allocation value that indicates whether the associated promotion
   * is applied on each item in a cart or split between the items in the cart.
   */
  allocation?: ApplicationMethodAllocationValues;

  /**
   * The discounted amount applied by the associated promotion based on the `type`.
   */
  value?: number;

  /**
   * The currency code of the application method
   */
  currencyCode?: string;

  /**
   * The max quantity allowed in the cart for the associated promotion to be applied.
   */
  maxQuantity?: number | null;

  /**
   * The minimum quantity required for a `buyget` promotion to be applied.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the
   * value of this attribute is `2`.
   */
  buyRulesMinQuantity?: number | null;

  /**
   * The quantity that results from matching the `buyget` promotion's condition.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the value
   * of this attribute is `1`.
   */
  applyToQuantity?: number | null;

  /**
   * The target rules of the application method.
   */
  targetRules?: PromotionRule[];

  /**
   * The buy rules of the application method.
   */
  buyRules?: PromotionRule[];
}

/**
 * The application method to be created.
 */
export interface CreateApplicationMethod {
  /**
   * The type of the application method indicating how
   * the associated promotion is applied.
   */
  type: ApplicationMethodTypeValues;

  /**
   * The target type of the application method indicating
   * whether the associated promotion is applied to the cart's items,
   * shipping methods, or the whole order.
   */
  targetType: ApplicationMethodTargetTypeValues;

  /**
   * The allocation value that indicates whether the associated promotion
   * is applied on each item in a cart or split between the items in the cart.
   */
  allocation?: ApplicationMethodAllocationValues;

  /**
   * The discounted amount applied by the associated promotion based on the `type`.
   */
  value?: number;

  /**
   * Currency of the value to apply.
   */
  currencyCode?: string;

  /**
   * The max quantity allowed in the cart for the associated promotion to be applied.
   */
  maxQuantity?: number | null;

  /**
   * The minimum quantity required for a `buyget` promotion to be applied.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the
   * value of this attribute is `2`.
   */
  buyRulesMinQuantity?: number | null;

  /**
   * The quantity that results from matching the `buyget` promotion's condition.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the value
   * of this attribute is `1`.
   */
  applyToQuantity?: number | null;

  /**
   * The target rules of the application method.
   */
  targetRules?: CreatePromotionRule[];

  /**
   * The buy rules of the application method.
   */
  buyRules?: CreatePromotionRule[];
}

/**
 * The attributes to update in the application method.
 */
export interface UpdateApplicationMethod {
  /**
   * The ID of the application method.
   */
  id?: string;

  /**
   * The type of the application method indicating how
   * the associated promotion is applied.
   */
  type?: ApplicationMethodTypeValues;

  /**
   * The target type of the application method indicating
   * whether the associated promotion is applied to the cart's items,
   * shipping methods, or the whole order.
   */
  targetType?: ApplicationMethodTargetTypeValues;

  /**
   * The allocation value that indicates whether the associated promotion
   * is applied on each item in a cart or split between the items in the cart.
   */
  allocation?: ApplicationMethodAllocationValues;

  /**
   * The discounted amount applied by the associated promotion based on the `type`.
   */
  value?: number;

  /**
   * The currency code of the promotions application
   */
  currencyCode?: string;

  /**
   * The max quantity allowed in the cart for the associated promotion to be applied.
   */
  maxQuantity?: number | null;

  /**
   * The minimum quantity required for a `buyget` promotion to be applied.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the
   * value of this attribute is `2`.
   */
  buyRulesMinQuantity?: number | null;

  /**
   * The quantity that results from matching the `buyget` promotion's condition.
   * For example, if the promotion is a "Buy 2 shirts get 1 free", the value
   * of this attribute is `1`.
   */
  applyToQuantity?: number | null;
}
