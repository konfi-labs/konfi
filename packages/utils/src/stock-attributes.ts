import {
  Product,
  NestedProduct,
  Attribute,
  Configuration,
  PriceTypeEnum,
} from "@konfi/types";

/**
 * Get stock-tracked attributes for a MATRIX product with their selected values
 */
export function getStockTrackedAttributes(
  product: Product | NestedProduct,
  configuration: Configuration,
  attributes: Attribute[],
): { attributeId: string; optionValue: string }[] {
  // Only MATRIX products use attribute-based stock
  if (product.priceType !== PriceTypeEnum.MATRIX) {
    return [];
  }

  // No configuration or selected options
  if (!configuration.selectedAttributeOptions) {
    return [];
  }

  const stockTrackedAttributes: { attributeId: string; optionValue: string }[] =
    [];

  // Get attributes that are marked for stock tracking
  const stockTrackingAttributes = attributes.filter(
    (attr) => attr.trackStock === true && product.attributes.includes(attr.id),
  );

  for (const attribute of stockTrackingAttributes) {
    const selectedValue = configuration.selectedAttributeOptions[attribute.id];
    if (selectedValue) {
      stockTrackedAttributes.push({
        attributeId: attribute.id,
        optionValue: String(selectedValue),
      });
    }
  }

  return stockTrackedAttributes;
}

/**
 * Check if any attributes in the product require stock tracking
 */
export function hasStockTrackedAttributes(
  product: Product | NestedProduct,
  attributes: Attribute[],
): boolean {
  if (product.priceType !== PriceTypeEnum.MATRIX) {
    return false;
  }

  return attributes.some(
    (attr) => attr.trackStock === true && product.attributes.includes(attr.id),
  );
}

/**
 * Get the stock document ID for an attribute option
 */
export function getAttributeStockId(
  attributeId: string,
  optionValue: string,
): string {
  return `${attributeId}_${optionValue}`;
}
