import type { ExternalAttribute } from "@konfi/types";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";

function buildDuplicateExternalAttributeNameSet(
  externalAttributes: ExternalAttribute[],
): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const attribute of externalAttributes) {
    if (seen.has(attribute.name)) {
      duplicates.add(attribute.name);
      continue;
    }

    seen.add(attribute.name);
  }

  return duplicates;
}

export function resolveConfigurationParamsForPricingAttributes(options: {
  pricingAttributes: ExternalAttribute[];
  savedConfigParams?: Record<string, string>;
  endpointQueryParams: string[];
}): {
  correctedConfigurationParams: boolean;
  resolvedConfigurationParams: Record<string, string>;
} {
  const { pricingAttributes, savedConfigParams = {}, endpointQueryParams } = options;
  const duplicateAttributeNames =
    buildDuplicateExternalAttributeNameSet(pricingAttributes);
  const resolvedConfigurationParams: Record<string, string> = {};
  let correctedConfigurationParams = false;

  for (const attribute of pricingAttributes) {
    const attributeKey = getExternalAttributeKey(attribute);
    const keySpecificParam = savedConfigParams[attributeKey];
    const nameFallbackParam =
      keySpecificParam === undefined ? savedConfigParams[attribute.name] : undefined;
    const existingParam = keySpecificParam ?? nameFallbackParam;

    if (!existingParam) {
      if (endpointQueryParams.length === 0 && attribute.id) {
        resolvedConfigurationParams[attributeKey] = attribute.id;
        correctedConfigurationParams = true;
      }
      continue;
    }

    const duplicateNameFallbackNeedsCorrection =
      attribute.id !== undefined &&
      nameFallbackParam !== undefined &&
      duplicateAttributeNames.has(attribute.name) &&
      (endpointQueryParams.length === 0 ||
        endpointQueryParams.includes(attribute.id));
    const legacyTemplateParamNeedsCorrection =
      endpointQueryParams.length === 0 &&
      attribute.id !== undefined &&
      existingParam.toLowerCase().startsWith("spiro");
    const correctedParam =
      duplicateNameFallbackNeedsCorrection || legacyTemplateParamNeedsCorrection
        ? (attribute.id ?? existingParam)
        : existingParam;

    resolvedConfigurationParams[attributeKey] = correctedParam;
    correctedConfigurationParams ||=
      correctedParam !== existingParam || keySpecificParam === undefined;
  }

  return {
    correctedConfigurationParams,
    resolvedConfigurationParams,
  };
}

export function hasDuplicateExternalAttributeNames(
  externalAttributes: ExternalAttribute[],
): Set<string> {
  return buildDuplicateExternalAttributeNameSet(externalAttributes);
}
