import { NestedProduct, Product, Configuration } from "@konfi/types";
import { DEFAULT_COMBINATION } from "../constants";
import { isPageCountAllowed } from "../page-count";
import { getRatio, isValidRatio } from "../ratio";
import { isMatrixLikePriceType } from "../price-types";
import { isValidSize } from "./is-valid-size";

export function canAddToCart(
  product: Product | NestedProduct,
  configuration: Configuration,
  options?: { allowOutOfSpec?: boolean },
): boolean {
  if (!product) return false;

  const allowOutOfSpec = options?.allowOutOfSpec ?? false;

  const { spec } = product;
  const { calculatedCombination, combination } = configuration;
  const { quantity, volume, customFormat, width, height } = configuration;
  const { minimumOrder, maximumOrder, minimumRatio, maximumRatio } = spec;

  if (isMatrixLikePriceType(product.priceType)) {
    if (!allowOutOfSpec) {
      if (quantity < 1) return false;
      if (volume && volume > maximumOrder) return false;
      if (volume && volume < minimumOrder) return false;
    }
    if (!calculatedCombination) return false;
    if (!combination && calculatedCombination !== DEFAULT_COMBINATION) {
      return false;
    }
  } else {
    if (!allowOutOfSpec) {
      if (quantity < 1) return false;
      if (quantity > maximumOrder) return false;
      if (quantity < minimumOrder) return false;
    }
  }

  if (customFormat) {
    if (!width) return false;
    if (!height) return false;
    if (!allowOutOfSpec) {
      if (!isValidSize(width, height, product, configuration)) return false;
      if (product.spec.validateRatio) {
        const ratio = getRatio(width, height);
        if (
          !isValidRatio(
            width,
            height,
            minimumRatio ?? 0.2,
            maximumRatio ?? 5,
            ratio,
          )
        )
          return false;
      }
    }
  }

  if (
    product.pageCount?.enabled &&
    !isPageCountAllowed(
      configuration.pageCount,
      product.pageCount,
      configuration.selectedAttributeOptions,
    )
  ) {
    return false;
  }

  return true;
}
