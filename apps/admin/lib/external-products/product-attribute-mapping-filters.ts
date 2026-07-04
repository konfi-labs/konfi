import type { AttributeMapping } from "@konfi/types";

export function filterProductAttributeMappings(options: {
  mappings: AttributeMapping[];
  pageCountAttributeName?: string;
  rangedDimensionAttributeNames?: ReadonlySet<string>;
}): AttributeMapping[] {
  const { mappings, pageCountAttributeName, rangedDimensionAttributeNames } =
    options;

  return mappings.filter((mapping) => {
    if (mapping.specialRole) {
      return false;
    }

    if (rangedDimensionAttributeNames?.has(mapping.externalAttributeName)) {
      return false;
    }

    if (
      pageCountAttributeName &&
      mapping.externalAttributeName === pageCountAttributeName
    ) {
      return false;
    }

    return true;
  });
}
