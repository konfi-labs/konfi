import type { AttributeMapping } from "@konfi/types";

export type DuplicateInternalAttributeMapping = {
  internalAttributeId: string;
  externalAttributeNames: string[];
};

export function getUniqueInternalAttributeId(
  mapping: AttributeMapping,
): string | undefined {
  if (
    mapping.ignored === true ||
    mapping.providerOnlyPricing === true ||
    mapping.specialRole
  ) {
    return undefined;
  }

  const internalAttributeId = mapping.internalAttributeId?.trim();

  return internalAttributeId && internalAttributeId.length > 0
    ? internalAttributeId
    : undefined;
}

export function getDuplicateInternalAttributeMappings(
  attributeMappings: AttributeMapping[],
): DuplicateInternalAttributeMapping[] {
  const externalAttributesByInternalAttributeId = new Map<
    string,
    Set<string>
  >();

  for (const mapping of attributeMappings) {
    const internalAttributeId = getUniqueInternalAttributeId(mapping);

    if (!internalAttributeId) {
      continue;
    }

    const externalAttributeNames =
      externalAttributesByInternalAttributeId.get(internalAttributeId) ??
      new Set<string>();

    externalAttributeNames.add(mapping.externalAttributeName);
    externalAttributesByInternalAttributeId.set(
      internalAttributeId,
      externalAttributeNames,
    );
  }

  return Array.from(externalAttributesByInternalAttributeId.entries())
    .filter(([, externalAttributeNames]) => externalAttributeNames.size > 1)
    .map(([internalAttributeId, externalAttributeNames]) => ({
      internalAttributeId,
      externalAttributeNames: Array.from(externalAttributeNames),
    }));
}
