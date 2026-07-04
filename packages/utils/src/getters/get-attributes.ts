import type { Option } from "@konfi/types";
import { Attribute } from "@konfi/types";

import { orderAttributeOptions } from "../order-attribute-options";

export function getAttributes(
  attributes: Attribute[],
  productAttributes: Attribute["id"][],
  productAttributeOptions: { [key: Attribute["id"]]: Option["value"][] },
) {
  if (!attributes || !productAttributes || !productAttributeOptions) return;
  let result: Attribute[] = [];
  for (let i = 0; i < productAttributes.length; i++) {
    const _attribute = productAttributes[i];
    const attribute = attributes.find((obj) => obj.id === _attribute);
    if (!attribute)
      throw console.error(`Attribute with id "${_attribute}" not found`);
    const productOptionValues = productAttributeOptions[_attribute] ?? [];
    if (
      !Array.isArray(productOptionValues) ||
      productOptionValues.length === 0
    ) {
      result.push({ ...attribute, options: [] });
      continue;
    }
    const orderedOptions = orderAttributeOptions(
      attribute.options,
      productOptionValues,
    );
    result.push({
      ...attribute,
      options: orderedOptions,
    });
  }
  return result;
}
