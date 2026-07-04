import { PriceTypeEnum } from "@konfi/types";
import { isMatrixLikePriceType } from "@konfi/utils";

export interface QuotePricingQuantitiesInput {
  defaultOrder?: number | null;
  itemQuantity?: number | null;
  itemVolume?: number | null;
  priceType: PriceTypeEnum;
}

export interface QuotePricingQuantities {
  isMatrixLike: boolean;
  quantity: number;
  volume: number;
}

function toPositiveNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

export function resolveQuotePricingQuantities({
  defaultOrder,
  itemQuantity,
  itemVolume,
  priceType,
}: QuotePricingQuantitiesInput): QuotePricingQuantities {
  const isMatrixLike = isMatrixLikePriceType(priceType);
  const requestedVolume =
    toPositiveNumber(itemVolume) ??
    toPositiveNumber(itemQuantity) ??
    toPositiveNumber(defaultOrder) ??
    1;
  const quantity = isMatrixLike
    ? (toPositiveNumber(itemQuantity) ?? 1)
    : requestedVolume;

  return {
    isMatrixLike,
    quantity,
    volume: requestedVolume,
  };
}