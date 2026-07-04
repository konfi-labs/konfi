import { Attribute, PriceTypeEnum, Product } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";

import { orderAttributeOptions } from "../order-attribute-options";
import { isMatrixLikePriceType } from "../price-types";

export function filterAttributes(
  attributes: Attribute[] | null,
  product?: Product,
): Attribute[] {
  if (isUndefined(product) || isNull(product) || isNull(attributes)) return [];
  let memoAttributes: Attribute[] = [];
  if (isMatrixLikePriceType(product.priceType)) {
    for (let i = 0; i < product.attributes.length; i++) {
      const attribute = attributes.find(
        (attribute) => attribute.id === product?.attributes[i],
      );
      // Skip if attribute doesn't exist in the attributes array
      if (isUndefined(attribute)) {
        console.warn(
          `Attribute with id ${product.attributes[i]} not found in attributes array`,
        );
        continue;
      }

      const baseOptions = Array.isArray(attribute.options)
        ? attribute.options
        : [];
      if (baseOptions.length === 0) {
        console.warn(
          `Attribute with id ${attribute.id} has no defined options`,
        );
        continue;
      }

      const productOptionValues = product?.attributeOptions?.[attribute.id];
      let orderedOptions =
        Array.isArray(productOptionValues) && productOptionValues.length > 0
          ? orderAttributeOptions(baseOptions, productOptionValues)
          : baseOptions;

      if (!orderedOptions.length) {
        console.warn(
          `Attribute with id ${attribute.id} has no available options for product ${product.id}`,
        );
        continue;
      }

      memoAttributes.push({
        ...attribute,
        options: orderedOptions,
      });
    }
  }
  return memoAttributes;
}
