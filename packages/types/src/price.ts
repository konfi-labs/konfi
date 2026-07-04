import type { CurrencyCode } from "./enums";
import { Volume } from "./catalog/volume";
import { Combination } from "./catalog/combination";

export type Price = {
  value?: number | null;
  threshold?: number;
  combination?: Combination;
  volume?: Volume;
  taxCategoryId?: string;
  currency: CurrencyCode;
};
