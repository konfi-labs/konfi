import type { Attribute } from "../configuration/attribute";
import type { Option } from "../configuration/option";

export type ProductPriceOffsetRuleScope =
  | "product"
  | "attributeOption"
  | "configuration";

export type ProductPriceOffsetRule = {
  id: string;
  enabled: boolean;
  label?: string;
  scope: ProductPriceOffsetRuleScope;
  percent?: number;
  fixedValue?: number;
  attributeId?: Attribute["id"];
  optionValue?: Option["value"];
  calculatedCombination?: string;
  volumeValue?: number;
  pageCount?: number;
};

export type ProductPriceOffsetConfig = {
  enabled: boolean;
  rules: ProductPriceOffsetRule[];
};
