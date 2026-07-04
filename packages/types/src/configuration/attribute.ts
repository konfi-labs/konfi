import { Base } from "../base";
import { Locale } from "../enums";
import type { TenantOwned } from "../tenant";
import type { TranslatedContentMetadata } from "../translation-meta";
import { Option } from "./option";
import type { FakturowniaCostUnit } from "../costs/fakturownia-cost";

export enum AttributeInputTypeEnum {
  DROPDOWN = "DROPDOWN",
  DROPDOWN_COLOR = "DROPDOWN_COLOR",
  RADIO_GROUP = "RADIO_GROUP",
  RADIO_GROUP_IMAGE = "RADIO_GROUP_IMAGE",
  RADIO_GROUP_COLOR = "RADIO_GROUP_COLOR",
  ADVANCED_FINISHING = "ADVANCED_FINISHING",
}

export type CalculateStockFromSheet = {
  enabled: boolean;
  sheetWidth: number;
  sheetHeight: number;
  margin?: number;
  bleed?: number;
};

export interface Attribute extends Base, TenantOwned {
  calculated: boolean;
  required: boolean;
  format: boolean;
  pages?: boolean;
  options: Option[];
  keywords: string[];
  type: keyof typeof AttributeInputTypeEnum;
  trackStock: boolean;
  calculateStockFromSheet?: CalculateStockFromSheet;
  /** Admin override for the material's cost basis (purchase-unit for cost conversion). */
  costUnit?: FakturowniaCostUnit;
}

export interface CreateAttribute extends Attribute {}

export interface AttributeCreateForm extends Omit<
  CreateAttribute,
  "updatedBy" | "updatedAt" | "createdAt" | "active" | "keywords" | "tenantId"
> {}

export interface UpdateAttribute extends Omit<
  Attribute,
  "id" | "calculated" | "required" | "format" | "createdBy" | "createdAt"
> {}

export interface AttributeUpdateForm extends Omit<
  UpdateAttribute,
  "keywords" | "updatedAt" | "active" | "tenantId"
> {
  id: Attribute["id"];
  calculated: Attribute["calculated"];
  required: Attribute["required"];
  format: Attribute["format"];
}

export type NestedAttribute = Omit<
  Attribute,
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "keywords"
  | "active"
  | "tenantId"
>;

export interface OptionTranslation extends Omit<
  Option,
  | "value"
  | "customFormat"
  | "hidden"
  | "formatWidth"
  | "formatHeight"
  | "pages"
  | "cost"
  | "unitsPerSheet"
  | "image"
  | "color"
> {
  /**
   * Stable source option identifier used to reconcile translations after
   * option reordering. Legacy translation docs may not have it.
   */
  value?: Option["value"];
}

export interface AttributeTranslation
  extends
    Omit<
      Attribute,
      | "calculated"
      | "required"
      | "format"
      | "pages"
      | "options"
      | "keywords"
      | "type"
      | "trackStock"
      | "calculateStockFromSheet"
      | "costUnit"
      | "tenantId"
    >,
    TranslatedContentMetadata {
  locale: Locale;
  options: OptionTranslation[];
}

export interface AttributeTranslationCreate extends AttributeTranslation {}

export interface AttributeTranslationCreateForm extends Omit<
  AttributeTranslation,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> {}

export interface AttributeTranslationUpdate extends Omit<
  AttributeTranslation,
  "id" | "createdAt" | "createdBy"
> {}

export interface AttributeTranslationUpdateForm extends Omit<
  AttributeTranslationUpdate,
  "updatedAt"
> {}
