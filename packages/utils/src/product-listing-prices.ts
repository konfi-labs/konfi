import { PriceTypeEnum } from "@konfi/types";
import type { Price, Product } from "@konfi/types";
import { calculateDynamicListingPrices } from "./dynamic-pricing";
import { getEffectiveProductListingPrices } from "./product-price-offsets";

type ListingPriceProduct = Pick<
  Product,
  | "attributeDependencies"
  | "attributeOptions"
  | "attributes"
  | "customSize"
  | "defaultPrice"
  | "dynamicPricing"
  | "highPrice"
  | "lowPrice"
  | "pageCount"
  | "priceOffsets"
  | "priceType"
  | "prices"
  | "spec"
  | "volumes"
>;

export function getProductListingPrices(product: ListingPriceProduct): {
  defaultPrice: Price;
  highPrice: Price;
  lowPrice: Price;
} {
  if (
    product.priceType === PriceTypeEnum.DYNAMIC &&
    product.dynamicPricing?.enabled
  ) {
    return calculateDynamicListingPrices({
      applyPriceOffsets: true,
      config: product.dynamicPricing,
      context: {
        pageCount: product.pageCount?.enabled
          ? product.pageCount.minimum
          : undefined,
      },
      currency: product.defaultPrice?.currency,
      product,
    });
  }

  return getEffectiveProductListingPrices(product);
}
