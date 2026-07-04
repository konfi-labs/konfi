import { PriceTypeEnum, Product } from "@konfi/types";
import { isMatrixLikePriceType } from "./price-types";

/**
 * Checks if prices need to be fetched from subcollection
 */
export function needsPriceFetching(
  product: Product | undefined,
  priceType: PriceTypeEnum,
  calculatedCombination?: string,
): boolean {
  if (!product) return false;

  // For MATRIX type, always fetch prices when we have a calculated combination
  // This ensures prices update when combination changes
  if (isMatrixLikePriceType(priceType) && calculatedCombination) {
    return true;
  }

  // For THRESHOLD type, fetch if prices are empty or if we have a combination
  if (priceType === PriceTypeEnum.THRESHOLD) {
    return (
      !product.prices || product.prices.length === 0 || !!calculatedCombination
    );
  }

  // For SINGLE price type, fetch if no default price and no prices array
  if (priceType === PriceTypeEnum.SINGLE) {
    return (
      !product.defaultPrice && (!product.prices || product.prices.length === 0)
    );
  }

  return false;
}

/**
 * Validates if prices array is ready for calcPrice function
 */
export function validatePricesForCalculation(
  prices: Product["prices"] | undefined,
  priceType: PriceTypeEnum,
  calculatedCombination?: string,
): boolean {
  if (!prices || prices.length === 0) return false;

  // For matrix products, check if the specific combination exists
  if (isMatrixLikePriceType(priceType) && calculatedCombination) {
    return prices.some(
      (price) => price.combination?.id === calculatedCombination,
    );
  }

  return true;
}
