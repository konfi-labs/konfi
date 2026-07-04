import { ProductPageCountConfig, Volume } from "../catalog";
import { Price } from "../price";
import { PriceTypeEnum } from "../enums";
import { IDiscount } from "../discount";
import type { UnitId } from "./units-proofing";

export interface QuantityOptions {
  volume: number | undefined;
  volumes: Omit<Volume, "deliveryTime">[];
  quantity: number;
  prices?: Price[];
  priceType: PriceTypeEnum;
  discount: IDiscount | undefined;
  calculatedCombination: string | null | undefined;
  customFormat: boolean;
  width: number | undefined;
  height: number | undefined;
  minimumOrder: number;
  customPrice: number | null | undefined;
  unit?: UnitId;
  customVolumes?: number[];
  bleed?: number;
  includeBleed?: boolean;
  customerDiscount?: number;
  expressPercent?: number;
  pageCount?: number | null;
  pageCountConfig?: ProductPageCountConfig | null;
  selectedAttributeOptions?: { [key: string]: string | number } | null;
}
