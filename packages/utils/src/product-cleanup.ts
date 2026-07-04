import { Price, PriceTypeEnum, Product } from "@konfi/types";
import { DEFAULT_COMBINATION } from "./constants";
import { isMatrixLikePriceType } from "./price-types";

/**
 * Clean up non-matrix products by resetting attribute-related properties
 * and ensuring price combinations use DEFAULT_COMBINATION
 */
export function cleanupNonMatrixProduct<T extends Partial<Product>>(
  product: T,
): T {
  // Only clean up if product is not a matrix type
  if (isMatrixLikePriceType(product.priceType)) {
    return product;
  }

  const cleanedProduct = { ...product };

  // Reset attribute-related properties for non-matrix products
  cleanedProduct.attributes = [];
  cleanedProduct.attributeOptions = {};
  cleanedProduct.attributeDependencies = {};

  // Fix price combinations to use DEFAULT_COMBINATION
  if (cleanedProduct.prices && Array.isArray(cleanedProduct.prices)) {
    cleanedProduct.prices = cleanedProduct.prices.map((price: Price) => ({
      ...price,
      combination: price.combination
        ? { ...price.combination, id: DEFAULT_COMBINATION }
        : undefined,
    }));
  }

  return cleanedProduct;
}

/**
 * Validate that non-matrix products don't have attribute configurations
 */
export function validateProductAttributes(product: Partial<Product>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Only validate non-matrix products
  if (isMatrixLikePriceType(product.priceType)) {
    return { isValid: true, errors: [] };
  }

  // Check for attribute-related properties that should be empty
  if (product.attributes && product.attributes.length > 0) {
    errors.push("Non-matrix products should not have attributes");
  }

  if (
    product.attributeOptions &&
    Object.keys(product.attributeOptions).length > 0
  ) {
    errors.push("Non-matrix products should not have attribute options");
  }

  if (
    product.attributeDependencies &&
    Object.keys(product.attributeDependencies).length > 0
  ) {
    errors.push("Non-matrix products should not have attribute dependencies");
  }

  // Check for invalid price combinations
  if (product.prices && Array.isArray(product.prices)) {
    const invalidCombinations = product.prices.filter(
      (price: Price) =>
        price.combination?.id && price.combination.id !== DEFAULT_COMBINATION,
    );

    if (invalidCombinations.length > 0) {
      errors.push(
        "Non-matrix products should only have default price combinations",
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Fix price combinations to use DEFAULT_COMBINATION for non-matrix products
 */
export function fixPriceCombinations(
  prices: Price[],
  priceType: PriceTypeEnum,
): Price[] {
  if (isMatrixLikePriceType(priceType)) {
    return prices; // Don't modify matrix product prices
  }

  return prices.map((price) => ({
    ...price,
    combination: price.combination
      ? { ...price.combination, id: DEFAULT_COMBINATION }
      : undefined,
  }));
}
