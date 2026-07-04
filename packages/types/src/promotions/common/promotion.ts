import { CreateCampaign } from "../mutations";
import {
  ApplicationMethod,
  CreateApplicationMethod,
  UpdateApplicationMethod,
} from "./application-method";
import { Campaign } from "./campaign";
import { PromotionRule, CreatePromotionRule } from "./promotion-rule";
import { PromotionTypeEnum, RuleTypeEnum } from "../../enums";
import { Timestamp } from "firebase/firestore";
import type { TenantOwned } from "../../tenant";

/**
 * The promotion's possible types.
 */
export type PromotionTypeValues = keyof typeof PromotionTypeEnum;

/**
 * The promotion's possible rule types.
 */
export type RuleTypeValues = keyof typeof RuleTypeEnum;

/**
 * The promotion details.
 */
export interface Promotion extends TenantOwned {
  /**
   * The ID of the promotion.
   */
  id: string;

  /**
   * The code of the promotion.
   */
  code?: string;

  /**
   * The type of the promotion:
   *
   * - `standard` indicates that a promotion is a standard one applied with conditions.
   * - `buyget` indicates that a promotion is a "Buy X get Y" promotion.
   *
   */
  type?: PromotionTypeValues;

  /**
   * Whether the promotion is applied automatically.
   */
  isAutomatic?: boolean;

  /**
   * Whether the promotion can only be used once.
   */
  isOneTime?: boolean;

  /**
   * Minimum cart subtotal required before the promotion can be applied.
   */
  minimumOrderValue?: number | null;

  /**
   * The associated application method.
   */
  applicationMethod?: ApplicationMethod;

  /**
   * The rules of the promotion.
   */
  rules?: PromotionRule[];

  /**
   * The associated campaign.
   */
  campaignId?: string | null;

  /**
   * The associated campaign.
   */
  campaign?: Campaign;

  /**
   * Is the promotion active.
   */
  active: boolean;

  /**
   * The date the promotion was created.
   */
  createdAt: Omit<Timestamp, "toJSON">;

  /**
   * The date the promotion was last updated.
   */
  updatedAt: Omit<Timestamp, "toJSON">;
}

/**
 * The promotion to be created.
 */
export interface CreatePromotion {
  /**
   * The code of the promotion.
   */
  code: string;

  /**
   * The type of the promotion:
   *
   * - `standard` indicates that a promotion is a standard one applied with conditions.
   * - `buyget` indicates that a promotion is a "Buy X get Y" promotion.
   *
   */
  type: PromotionTypeValues;

  /**
   * Whether the promotion is applied automatically.
   */
  isAutomatic?: boolean;

  /**
   * Whether the promotion can only be used once.
   */
  isOneTime?: boolean;

  /**
   * Minimum cart subtotal required before the promotion can be applied.
   */
  minimumOrderValue?: number | null;

  /**
   * The associated application method.
   */
  applicationMethod: CreateApplicationMethod;

  /**
   * The rules of the promotion.
   */
  rules?: CreatePromotionRule[];

  /**
   * The associated campaign.
   */
  campaign?: Omit<CreateCampaign, "createdAt" | "updatedAt">;

  /**
   * The associated campaign's ID.
   */
  campaignId?: string;

  /**
   * Is the promotion active.
   */
  active: boolean;

  /**
   * The date the promotion was created.
   */
  createdAt: Omit<Timestamp, "toJSON">;

  /**
   * The date the promotion was last updated.
   */
  updatedAt: Omit<Timestamp, "toJSON">;
}

/**
 * The attributes to update in the promotion.
 */
export interface UpdatePromotion {
  /**
   * The ID of the promotion.
   */
  id: string;

  /**
   * Whether the promotion is applied automatically.
   */
  isAutomatic?: boolean;

  /**
   * Whether the promotion can only be used once.
   */
  isOneTime?: boolean;

  /**
   * Minimum cart subtotal required before the promotion can be applied.
   */
  minimumOrderValue?: number | null;

  /**
   * The code of the promotion.
   */
  code?: string;

  /**
   * The type of the promotion.
   */
  type?: PromotionTypeValues;

  /**
   * The associated application method.
   */
  applicationMethod?: Omit<UpdateApplicationMethod, "id">;

  /**
   * The rules of the promotion.
   */
  rules?: CreatePromotionRule[];

  /**
   * The associated campaign's ID.
   */
  campaignId?: string | null;

  /**
   * Is the promotion active.
   */
  active: boolean;

  /**
   * The date the promotion was last updated.
   */
  updatedAt: Omit<Timestamp, "toJSON">;
}
