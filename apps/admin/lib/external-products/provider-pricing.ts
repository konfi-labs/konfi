import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import { SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE } from "@/lib/external-products/option-mapping-utils";
import {
  buildSampledRangedDimensionValues,
  getRangedDimensionAttributeNames,
  inferExternalRangedDimensions,
} from "@/lib/external-products/ranged-dimensions";

export type ProviderOnlyPricingSelections = Record<string, string>;

function getAttributeMappingByExternalName(
  mappings?: AttributeMapping[],
): Map<string, AttributeMapping> {
  return new Map(
    (mappings ?? []).map((mapping) => [mapping.externalAttributeName, mapping]),
  );
}

function getFixedSelectionForExternalAttribute(
  attribute: Pick<ExternalAttribute, "id" | "name">,
  fixedSelections: ProviderOnlyPricingSelections,
): string | undefined {
  return (
    fixedSelections[getExternalAttributeKey(attribute)] ??
    fixedSelections[attribute.name]
  );
}

export function isExternalAttributeSelectable(
  attribute: Pick<ExternalAttribute, "values" | "options">,
): boolean {
  return (attribute.options?.length ?? 0) > 0 || attribute.values.length > 0;
}

export function isProviderOnlyPricingMapping(
  mapping: Pick<AttributeMapping, "providerOnlyPricing">,
): boolean {
  return mapping.providerOnlyPricing === true;
}

export function isIgnoredAttributeMapping(
  mapping: Pick<AttributeMapping, "ignored">,
): boolean {
  return mapping.ignored === true;
}

export function isPageCountAttributeMapping(
  mapping: Pick<AttributeMapping, "specialRole">,
): boolean {
  return mapping.specialRole === "pageCount";
}

export function isProviderOnlyPricingMappingComplete(
  mapping: Pick<AttributeMapping, "providerOnlyPricing" | "fixedExternalValue">,
): mapping is Pick<
  AttributeMapping,
  "providerOnlyPricing" | "fixedExternalValue"
> & {
  providerOnlyPricing: true;
  fixedExternalValue: string;
} {
  return (
    isProviderOnlyPricingMapping(mapping) &&
    typeof mapping.fixedExternalValue === "string" &&
    mapping.fixedExternalValue.trim().length > 0
  );
}

export function isAttributeMappingReady(
  mapping: Pick<
    AttributeMapping,
    | "fixedExternalValue"
    | "ignored"
    | "internalAttributeId"
    | "providerOnlyPricing"
    | "specialRole"
  >,
): boolean {
  return (
    isIgnoredAttributeMapping(mapping) ||
    isPageCountAttributeMapping(mapping) ||
    Boolean(mapping.internalAttributeId) ||
    isProviderOnlyPricingMappingComplete(mapping)
  );
}

export function getProviderOnlyPricingSelections(
  mappings?: AttributeMapping[],
  externalAttributes?: ExternalAttribute[],
): ProviderOnlyPricingSelections {
  const selections: ProviderOnlyPricingSelections = {};
  const attributesByKey = new Map(
    (externalAttributes ?? []).map((attribute) => [
      getExternalAttributeKey(attribute),
      attribute,
    ]),
  );

  for (const mapping of mappings ?? []) {
    if (isIgnoredAttributeMapping(mapping)) {
      continue;
    }

    if (!isProviderOnlyPricingMappingComplete(mapping)) {
      continue;
    }

    const fixedExternalValue = mapping.fixedExternalValue;
    if (typeof fixedExternalValue !== "string") {
      continue;
    }
    const sanitizedValue = fixedExternalValue.trim();
    selections[mapping.externalAttributeName] = sanitizedValue;

    const attribute = attributesByKey.get(mapping.externalAttributeName);
    if (attribute) {
      selections[attribute.name] = sanitizedValue;
    }
  }

  return selections;
}

export function getVariablePricingAttributes(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: ProviderOnlyPricingSelections;
}): ExternalAttribute[] {
  const {
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections = {},
  } = options;

  if (!configurationParams || Object.keys(configurationParams).length === 0) {
    return [];
  }

  const rangedDimensions = inferExternalRangedDimensions(externalAttributes);
  const rangedDimensionAttributeNames =
    getRangedDimensionAttributeNames(rangedDimensions);
  const sampledValuesByAttributeName = new Map<string, string[]>();

  if (rangedDimensions) {
    sampledValuesByAttributeName.set(
      rangedDimensions.width.attribute.name,
      buildSampledRangedDimensionValues(rangedDimensions.width),
    );
    sampledValuesByAttributeName.set(
      rangedDimensions.height.attribute.name,
      buildSampledRangedDimensionValues(rangedDimensions.height),
    );
  }

  const mappingByExternalName =
    getAttributeMappingByExternalName(attributeMappings);
  const shouldFilterByMappings = mappingByExternalName.size > 0;

  const relevantAttributes = externalAttributes.filter(
    (attr) =>
      (configurationParams[getExternalAttributeKey(attr)] ||
        configurationParams[attr.name]) &&
      (isExternalAttributeSelectable(attr) ||
        rangedDimensionAttributeNames.has(attr.name)) &&
      !getFixedSelectionForExternalAttribute(attr, fixedSelections),
  );

  if (relevantAttributes.length === 0) {
    return [];
  }

  const pricingRelevantAttributes = relevantAttributes.some(
    (attr) => attr.affectsPricing,
  )
    ? relevantAttributes.filter((attr) => attr.affectsPricing)
    : relevantAttributes;

  return pricingRelevantAttributes.flatMap((attribute) => {
    const sampledValues =
      sampledValuesByAttributeName.get(attribute.name) ?? attribute.values;
    const pricingAttribute =
      sampledValues === attribute.values
        ? attribute
        : {
            ...attribute,
            values: sampledValues,
          };

    if (!shouldFilterByMappings) {
      return [pricingAttribute];
    }

    const mapping =
      mappingByExternalName.get(getExternalAttributeKey(attribute)) ??
      mappingByExternalName.get(attribute.name);

    if (rangedDimensionAttributeNames.has(attribute.name)) {
      return [pricingAttribute];
    }

    if (mapping && isIgnoredAttributeMapping(mapping)) {
      return [];
    }

    if (!mapping?.internalAttributeId) {
      return [];
    }

    const mappedExternalValues = Object.keys(mapping.optionMappings ?? {});

    if (mappedExternalValues.length === 0) {
      return [attribute];
    }

    const mappedValueSet = new Set(mappedExternalValues);
    const filteredValues = pricingAttribute.values.filter((value) =>
      mappedValueSet.has(value),
    );

    // Include the synthetic empty value when it's mapped (represents "none" option).
    // This value is never in attribute.values but needs to be in the combination
    // planner's input so configurations with this attribute in "none" state are generated.
    if (
      mappedValueSet.has(SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE) &&
      !filteredValues.includes(SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE)
    ) {
      filteredValues.push(SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE);
    }

    if (filteredValues.length === 0) {
      return [];
    }

    const filteredOptions = attribute.options?.filter((option) =>
      mappedValueSet.has(option.value),
    );

    return [
      {
        ...pricingAttribute,
        values: filteredValues,
        options: filteredOptions,
      },
    ];
  });
}

export function getExpectedPricingConfigurationCount(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: ProviderOnlyPricingSelections;
}): number {
  const variableAttributes = getVariablePricingAttributes(options);

  if (variableAttributes.length === 0) {
    return 0;
  }

  return variableAttributes.reduce((total, attribute) => {
    const optionCount = Math.max(attribute.values.length, 1);
    return total * optionCount;
  }, 1);
}
