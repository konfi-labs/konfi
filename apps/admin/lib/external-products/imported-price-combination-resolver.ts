import type {
  Attribute,
  AttributeMapping,
  ExternalAttribute,
  Product,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  areAllDependencyRulesMet,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "@konfi/utils";
import { resolveMappedInternalOptionValue } from "./product-attribute-dependencies";

type InternalAttributeMap = ReadonlyMap<string, Attribute & { id: string }>;

type CreateImportedMatrixCombinationResolverOptions = {
  attributeDependencies?: Product["attributeDependencies"];
  externalAttributes: ExternalAttribute[];
  internalAttributesById: InternalAttributeMap;
  orderedProductAttributes: string[];
  productAttributeOptions: Record<string, string[]>;
  selectedMappings: AttributeMapping[];
};

function buildExternalAttributeLookup(
  externalAttributes: ExternalAttribute[],
): Map<string, ExternalAttribute> {
  const externalAttributesByKey = new Map<string, ExternalAttribute>();

  for (const attribute of externalAttributes) {
    externalAttributesByKey.set(attribute.id || attribute.name, attribute);

    if (attribute.id && !externalAttributesByKey.has(attribute.name)) {
      externalAttributesByKey.set(attribute.name, attribute);
    }
  }

  return externalAttributesByKey;
}

export function createImportedMatrixCombinationResolver({
  attributeDependencies,
  externalAttributes,
  internalAttributesById,
  orderedProductAttributes,
  productAttributeOptions,
  selectedMappings,
}: CreateImportedMatrixCombinationResolverOptions): (
  configurationValues: Record<string, string>,
) => string | null {
  const mappingByInternalAttributeId = new Map<string, AttributeMapping>();

  for (const mapping of selectedMappings) {
    if (mapping.internalAttributeId) {
      mappingByInternalAttributeId.set(mapping.internalAttributeId, mapping);
    }
  }

  const externalAttributesByKey =
    buildExternalAttributeLookup(externalAttributes);
  const calculatedAttributeIds = orderedProductAttributes.filter(
    (attributeId) => internalAttributesById.get(attributeId)?.calculated,
  );

  if (calculatedAttributeIds.length === 0) {
    return () => DEFAULT_COMBINATION;
  }

  const resolveInternalValueForConfiguration = (
    attributeId: string,
    configurationValues: Record<string, string>,
  ): string | undefined => {
    const internalAttribute = internalAttributesById.get(attributeId);
    const mapping = mappingByInternalAttributeId.get(attributeId);
    const externalName = mapping?.externalAttributeName;

    if (!internalAttribute || !mapping || !externalName) {
      return undefined;
    }

    const externalAttribute = externalAttributesByKey.get(externalName);
    const externalValue =
      configurationValues[externalName] ??
      (externalAttribute?.id
        ? configurationValues[externalAttribute.id]
        : undefined) ??
      (externalAttribute?.name
        ? configurationValues[externalAttribute.name]
        : undefined);

    return resolveMappedInternalOptionValue({
      externalAttribute,
      externalValue,
      internalAttribute,
      mapping,
    });
  };

  return (configurationValues: Record<string, string>): string | null => {
    const combinationParts: string[] = [];
    const resolvedValues: Record<string, string> = {};

    for (const attributeId of calculatedAttributeIds) {
      const resolvedInternalValue = resolveInternalValueForConfiguration(
        attributeId,
        configurationValues,
      );
      const rules = normalizeAttributeDependency(
        attributeDependencies?.[attributeId],
      );

      // Use accumulated resolvedValues for dependency evaluation,
      // matching how parseCombinationValues evaluates dependencies.
      if (rules.length > 0 && !areAllDependencyRulesMet(rules, resolvedValues)) {
        continue;
      }

      if (!resolvedInternalValue) {
        return null;
      }

      const allowedOptions = productAttributeOptions[attributeId];

      if (allowedOptions && !allowedOptions.includes(resolvedInternalValue)) {
        return null;
      }

      if (rules.length > 0) {
        const disabledOptions = getDisabledOptionsFromRules(
          rules,
          allowedOptions ?? [],
          resolvedValues,
        );

        if (disabledOptions.includes(resolvedInternalValue)) {
          return null;
        }
      }

      combinationParts.push(resolvedInternalValue);
      resolvedValues[attributeId] = resolvedInternalValue;
    }

    return combinationParts.length > 0
      ? combinationParts.join("-")
      : DEFAULT_COMBINATION;
  };
}
