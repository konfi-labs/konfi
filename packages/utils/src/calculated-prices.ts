import {
  Attribute,
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  ProductPrice,
} from "@konfi/types";
import { DEFAULT_COMBINATION } from "./constants";
import { getHighPriceWithObject, getLowPriceWithObject } from "./getters";
import { getCombination } from "./getters/get-combination";
import { isMatrixLikePriceType } from "./price-types";

export const DEFAULT_PRICE: Price = {
  value: 0,
  threshold: 0,
  currency: CurrencyEnum.PLN,
};

/**
 * Generate default price from prices array based on price type
 * Uses calculated combination for matrix, first price for others
 */
export function generateDefaultPrice(
  prices: Price[],
  attributes: Attribute[],
  priceType: PriceTypeEnum,
  attributeDependencies?: any,
): Price {
  if (!prices || prices.length === 0) {
    return DEFAULT_PRICE;
  }

  // For non-matrix products, always return the first price with DEFAULT_COMBINATION
  if (!isMatrixLikePriceType(priceType)) {
    const firstPrice = { ...prices[0] };
    // Ensure non-matrix products use DEFAULT_COMBINATION
    if (firstPrice.combination) {
      firstPrice.combination.id = DEFAULT_COMBINATION;
    }
    return firstPrice;
  }

  // For matrix products, find the price matching the calculated combination
  try {
    const [_combination, _calculatedCombination] = getCombination(
      attributes,
      [],
      null,
      attributeDependencies,
    );

    const matchingPrice = prices.find(
      (p) => p.combination?.id === _calculatedCombination,
    );

    if (matchingPrice) {
      return matchingPrice;
    }
  } catch (error) {
    // If getCombination fails, fall back to default logic
    console.warn(
      "Failed to get calculated combination, falling back to default price",
    );
  }

  // For matrix products as fallback, return the first price
  return prices[0];
}

/**
 * Generate low price from all available price combinations
 * Based on migration.ts implementation using getLowPriceWithObject
 */
export function generateLowPrice(
  allPrices: Map<string, Price[]> | Price[],
  minOrder: number,
): Price {
  // Flatten all prices from all combinations
  const flatPrices: Price[] = Array.isArray(allPrices)
    ? allPrices
    : Array.from(allPrices.values()).flat();

  if (flatPrices.length === 0) {
    return DEFAULT_PRICE;
  }

  const { price } = getLowPriceWithObject(flatPrices, minOrder);
  return price || DEFAULT_PRICE;
}

/**
 * Generate high price from all available price combinations
 * Based on migration.ts implementation using getHighPriceWithObject
 */
export function generateHighPrice(
  allPrices: Map<string, Price[]> | Price[],
  minOrder: number,
): Price {
  // Flatten all prices from all combinations
  const flatPrices: Price[] = Array.isArray(allPrices)
    ? allPrices
    : Array.from(allPrices.values()).flat();

  if (flatPrices.length === 0) {
    return DEFAULT_PRICE;
  }

  const { price } = getHighPriceWithObject(flatPrices, minOrder);
  return price || DEFAULT_PRICE;
}

/**
 * Calculate all price variants (default, low, high) from subcollection prices
 * Based on migration.ts implementation pattern
 */
export function calculatePricesFromSubcollection(
  subcollectionPrices: ProductPrice[],
  attributes: Attribute[],
  minOrder: number,
  priceType: PriceTypeEnum = PriceTypeEnum.SINGLE,
  attributeDependencies?: any,
): {
  defaultPrice: Price;
  lowPrice: Price;
  highPrice: Price;
} {
  if (!subcollectionPrices || subcollectionPrices.length === 0) {
    return {
      defaultPrice: DEFAULT_PRICE,
      lowPrice: DEFAULT_PRICE,
      highPrice: DEFAULT_PRICE,
    };
  }

  // Convert ProductPrice[] to Map<string, Price[]> for compatibility
  const allPrices = new Map<string, Price[]>();
  const allFlatPrices: Price[] = [];

  subcollectionPrices.forEach((productPrice) => {
    allPrices.set(productPrice.id, productPrice.prices);
    allFlatPrices.push(...productPrice.prices);
  });

  // Get default price from "default" combination or first available
  const defaultCombination = subcollectionPrices.find(
    (p) => p.id === DEFAULT_COMBINATION,
  );
  const defaultPrices =
    defaultCombination?.prices || subcollectionPrices[0]?.prices || [];

  return {
    defaultPrice: generateDefaultPrice(
      defaultPrices,
      attributes,
      priceType,
      attributeDependencies,
    ),
    lowPrice: generateLowPrice(allFlatPrices, minOrder),
    highPrice: generateHighPrice(allFlatPrices, minOrder),
  };
}

/**
 * Update product with calculated prices based on current form data
 */
export function updateCalculatedPrices(
  prices: Price[],
  attributes: Attribute[],
  minOrder: number,
  priceType: PriceTypeEnum = PriceTypeEnum.SINGLE,
  attributeDependencies?: any,
): {
  defaultPrice: Price;
  lowPrice: Price;
  highPrice: Price;
} {
  // For non-matrix products, ensure all prices use DEFAULT_COMBINATION
  const processedPrices =
    !isMatrixLikePriceType(priceType)
      ? prices.map((price) => ({
          ...price,
          combination: price.combination
            ? { ...price.combination, id: DEFAULT_COMBINATION }
            : undefined,
        }))
      : prices;

  // For non-matrix products, use simpler logic
  if (!isMatrixLikePriceType(priceType)) {
    const defaultPrice =
      processedPrices.length > 0 ? processedPrices[0] : DEFAULT_PRICE;
    return {
      defaultPrice,
      lowPrice: generateLowPrice(processedPrices, minOrder),
      highPrice: generateHighPrice(processedPrices, minOrder),
    };
  }

  // Group prices by combination for matrix products
  const priceGroups = new Map<string, Price[]>();
  processedPrices.forEach((price) => {
    const combinationId = price.combination?.id || DEFAULT_COMBINATION;
    if (!priceGroups.has(combinationId)) {
      priceGroups.set(combinationId, []);
    }
    priceGroups.get(combinationId)!.push(price);
  });

  // Generate calculated prices
  const defaultPrices =
    priceGroups.get(DEFAULT_COMBINATION) ||
    Array.from(priceGroups.values())[0] ||
    [];

  return {
    defaultPrice: generateDefaultPrice(
      defaultPrices,
      attributes,
      priceType,
      attributeDependencies,
    ),
    lowPrice: generateLowPrice(priceGroups, minOrder),
    highPrice: generateHighPrice(priceGroups, minOrder),
  };
}
