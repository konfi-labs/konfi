import type {
  Attribute,
  AttributeMapping,
  ExternalAttribute,
} from "@konfi/types";
import type {
  AISuggestedAttributeMapping,
  AISuggestedOptionMapping,
} from "./ai-mapping-types";
import {
  findExternalAttributeByKey,
  getExternalAttributeKey,
} from "./external-attribute-key";

type InternalAttributeForMapping = Pick<Attribute, "options"> & {
  id: string;
};

function trimOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeConfidence(value?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getExternalOptionValues(
  externalAttribute?: ExternalAttribute,
): Array<{ value: string; label?: string }> {
  if (!externalAttribute) {
    return [];
  }

  const valuesByValue = new Map<string, { value: string; label?: string }>();

  for (const value of externalAttribute.values ?? []) {
    valuesByValue.set(value, { value });
  }

  for (const option of externalAttribute.options ?? []) {
    valuesByValue.set(option.value, {
      value: option.value,
      ...(option.label ? { label: option.label } : {}),
    });
  }

  return Array.from(valuesByValue.values());
}

function resolveExternalOptionValue(options: {
  externalAttribute?: ExternalAttribute;
  externalValue: string;
}): string {
  const { externalAttribute, externalValue } = options;
  const trimmed = externalValue.trim();

  if (!externalAttribute) {
    return trimmed;
  }

  const externalOptions = getExternalOptionValues(externalAttribute);
  const exactOption = externalOptions.find(
    (option) => option.value === trimmed,
  );

  if (exactOption) {
    return exactOption.value;
  }

  const normalizedExternalValue = normalizeToken(trimmed);
  const normalizedOption = externalOptions.find(
    (option) =>
      normalizeToken(option.value) === normalizedExternalValue ||
      (option.label
        ? normalizeToken(option.label) === normalizedExternalValue
        : false),
  );

  return normalizedOption?.value ?? trimmed;
}

function resolveInternalOptionValue(options: {
  internalAttribute?: InternalAttributeForMapping;
  internalValue: string;
}): string | undefined {
  const { internalAttribute, internalValue } = options;
  const trimmed = internalValue.trim();

  if (!internalAttribute?.options?.length) {
    return trimmed;
  }

  const exactOption = internalAttribute.options.find(
    (option) => option.value === trimmed,
  );

  if (exactOption) {
    return exactOption.value;
  }

  const normalizedInternalValue = normalizeToken(trimmed);
  const normalizedOption = internalAttribute.options.find(
    (option) =>
      normalizeToken(option.value) === normalizedInternalValue ||
      normalizeToken(option.label) === normalizedInternalValue,
  );

  return normalizedOption?.value ?? trimmed;
}

function normalizeOptionMappings(
  optionMappings?: Record<string, string>,
  externalAttribute?: ExternalAttribute,
  internalAttribute?: InternalAttributeForMapping,
): Record<string, string> | undefined {
  const entries = Object.entries(optionMappings ?? {}).flatMap(
    ([externalValue, internalValue]) => {
      const normalizedExternalValue = resolveExternalOptionValue({
        externalAttribute,
        externalValue,
      });
      const normalizedInternalValue = resolveInternalOptionValue({
        internalAttribute,
        internalValue,
      });

      if (
        normalizedExternalValue.length === 0 ||
        !normalizedInternalValue ||
        normalizedInternalValue.length === 0
      ) {
        return [];
      }

      return [[normalizedExternalValue, normalizedInternalValue] as const];
    },
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function mergeBooleanFlag(
  left?: boolean,
  right?: boolean,
): boolean | undefined {
  if (left === true || right === true) {
    return true;
  }

  if (left === false || right === false) {
    return false;
  }

  return undefined;
}

function maxOptionalNumber(left?: number, right?: number): number | undefined {
  const normalizedLeft = normalizeConfidence(left);
  const normalizedRight = normalizeConfidence(right);

  if (normalizedLeft === undefined) {
    return normalizedRight;
  }

  if (normalizedRight === undefined) {
    return normalizedLeft;
  }

  return Math.max(normalizedLeft, normalizedRight);
}

function resolveExternalAttributeName(options: {
  externalAttributes: ExternalAttribute[];
  externalAttributeName: string;
}): string {
  const { externalAttributes, externalAttributeName } = options;
  const trimmed = trimOptionalString(externalAttributeName);

  if (!trimmed) {
    return "";
  }

  const externalAttribute = findExternalAttributeByKey(
    externalAttributes,
    trimmed,
  );
  return externalAttribute
    ? getExternalAttributeKey(externalAttribute)
    : trimmed;
}

function isReadyAttributeMapping(mapping: AttributeMapping): boolean {
  if (mapping.ignored === true) {
    return true;
  }

  if (mapping.specialRole === "pageCount") {
    return true;
  }

  if (trimOptionalString(mapping.internalAttributeId)) {
    return true;
  }

  return (
    mapping.providerOnlyPricing === true &&
    Boolean(trimOptionalString(mapping.fixedExternalValue))
  );
}

function getAttributeMappingPriority(
  mapping: AttributeMapping,
): readonly [number, number, number, number, number] {
  const optionMappings = normalizeOptionMappings(mapping.optionMappings);

  return [
    Number(isReadyAttributeMapping(mapping)),
    Number(mapping.verified === true),
    Number(Boolean(trimOptionalString(mapping.internalAttributeId))),
    Object.keys(optionMappings ?? {}).length,
    normalizeConfidence(mapping.confidence) ?? -1,
  ] as const;
}

function comparePriority(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function normalizeAttributeMapping(
  mapping: AttributeMapping,
  options?: {
    externalAttribute?: ExternalAttribute;
    internalAttribute?: InternalAttributeForMapping;
  },
): AttributeMapping | null {
  const externalAttributeName = trimOptionalString(
    mapping.externalAttributeName,
  );

  if (!externalAttributeName) {
    return null;
  }

  const confidence = normalizeConfidence(mapping.confidence);
  const verified =
    typeof mapping.verified === "boolean" ? mapping.verified : undefined;

  if (mapping.ignored === true) {
    return {
      externalAttributeName,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(verified !== undefined ? { verified } : {}),
      ignored: true,
    };
  }

  if (mapping.providerOnlyPricing === true) {
    const fixedExternalValue = trimOptionalString(mapping.fixedExternalValue);

    return {
      externalAttributeName,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(verified !== undefined ? { verified } : {}),
      providerOnlyPricing: true,
      ...(fixedExternalValue ? { fixedExternalValue } : {}),
    };
  }

  if (mapping.specialRole === "pageCount") {
    return {
      externalAttributeName,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(verified !== undefined ? { verified } : {}),
      specialRole: "pageCount",
    };
  }

  const internalAttributeId = trimOptionalString(mapping.internalAttributeId);
  const optionMappings = normalizeOptionMappings(
    mapping.optionMappings,
    options?.externalAttribute,
    options?.internalAttribute,
  );

  return {
    externalAttributeName,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(verified !== undefined ? { verified } : {}),
    ...(internalAttributeId ? { internalAttributeId } : {}),
    ...(optionMappings ? { optionMappings } : {}),
  };
}

function mergeOptionMappings(
  preferred?: Record<string, string>,
  fallback?: Record<string, string>,
): Record<string, string> | undefined {
  const merged = {
    ...fallback,
    ...preferred,
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeDuplicateAttributeMappings(options: {
  existing: AttributeMapping;
  candidate: AttributeMapping;
}): AttributeMapping {
  const { existing, candidate } = options;
  const preferCandidate =
    comparePriority(
      getAttributeMappingPriority(candidate),
      getAttributeMappingPriority(existing),
    ) > 0;
  const preferred = preferCandidate ? candidate : existing;
  const fallback = preferCandidate ? existing : candidate;
  const shouldMergeOptionMappings =
    preferred.ignored !== true &&
    preferred.providerOnlyPricing !== true &&
    preferred.specialRole === undefined &&
    fallback.ignored !== true &&
    fallback.providerOnlyPricing !== true &&
    fallback.specialRole === undefined &&
    trimOptionalString(preferred.internalAttributeId) !== undefined &&
    trimOptionalString(preferred.internalAttributeId) ===
      trimOptionalString(fallback.internalAttributeId);

  return (
    normalizeAttributeMapping({
      ...fallback,
      ...preferred,
      optionMappings: shouldMergeOptionMappings
        ? mergeOptionMappings(preferred.optionMappings, fallback.optionMappings)
        : preferred.optionMappings,
      confidence: maxOptionalNumber(preferred.confidence, fallback.confidence),
      verified: mergeBooleanFlag(preferred.verified, fallback.verified),
    }) ?? preferred
  );
}

function normalizeAiOptionMapping(
  optionMapping: AISuggestedOptionMapping,
  options?: {
    externalAttribute?: ExternalAttribute;
    internalAttribute?: InternalAttributeForMapping;
  },
): AISuggestedOptionMapping | null {
  const externalValue = trimOptionalString(optionMapping.externalValue);

  if (!externalValue) {
    return null;
  }

  const normalizedExternalValue = resolveExternalOptionValue({
    externalAttribute: options?.externalAttribute,
    externalValue,
  });
  const internalValue = trimOptionalString(optionMapping.internalValue);
  const normalizedInternalValue = internalValue
    ? resolveInternalOptionValue({
        internalAttribute: options?.internalAttribute,
        internalValue,
      })
    : undefined;
  const suggestedNewOption =
    optionMapping.suggestedNewOption?.label &&
    optionMapping.suggestedNewOption?.value
      ? {
          label: optionMapping.suggestedNewOption.label.trim(),
          value: optionMapping.suggestedNewOption.value.trim(),
        }
      : undefined;

  return {
    externalValue: normalizedExternalValue,
    ...(normalizedInternalValue
      ? { internalValue: normalizedInternalValue }
      : {}),
    ...(suggestedNewOption ? { suggestedNewOption } : {}),
    confidence: normalizeConfidence(optionMapping.confidence) ?? 0,
  };
}

function normalizeAiOptionMappings(
  optionMappings: AISuggestedOptionMapping[],
  options?: {
    externalAttribute?: ExternalAttribute;
    internalAttribute?: InternalAttributeForMapping;
  },
): AISuggestedOptionMapping[] {
  const optionMappingsByExternalValue = new Map<
    string,
    AISuggestedOptionMapping
  >();
  const orderedExternalValues: string[] = [];

  for (const optionMapping of optionMappings) {
    const normalized = normalizeAiOptionMapping(optionMapping, options);

    if (!normalized) {
      continue;
    }

    const existing = optionMappingsByExternalValue.get(
      normalized.externalValue,
    );

    if (!existing) {
      optionMappingsByExternalValue.set(normalized.externalValue, normalized);
      orderedExternalValues.push(normalized.externalValue);
      continue;
    }

    const preferCandidate =
      comparePriority(
        [
          Number(Boolean(normalized.internalValue)),
          Number(Boolean(normalized.suggestedNewOption)),
          normalized.confidence,
        ],
        [
          Number(Boolean(existing.internalValue)),
          Number(Boolean(existing.suggestedNewOption)),
          existing.confidence,
        ],
      ) > 0;

    if (preferCandidate) {
      optionMappingsByExternalValue.set(normalized.externalValue, normalized);
    }
  }

  return orderedExternalValues
    .map((externalValue) => optionMappingsByExternalValue.get(externalValue))
    .filter((optionMapping): optionMapping is AISuggestedOptionMapping =>
      Boolean(optionMapping),
    );
}

function normalizeAiSuggestedAttributeMapping(
  mapping: AISuggestedAttributeMapping,
  options?: {
    externalAttribute?: ExternalAttribute;
    internalAttribute?: InternalAttributeForMapping;
  },
): AISuggestedAttributeMapping | null {
  const externalAttributeName = trimOptionalString(
    mapping.externalAttributeName,
  );

  if (!externalAttributeName) {
    return null;
  }

  const internalAttributeId = trimOptionalString(mapping.internalAttributeId);
  const suggestedNewAttributeOptions = (
    mapping.suggestedNewAttribute?.options ?? []
  )
    .map((option) => {
      const label = option.label.trim();
      const value = option.value.trim();
      const color = trimOptionalString(option.color);

      if (!label || !value) {
        return null;
      }

      return {
        label,
        value,
        ...(color ? { color } : {}),
      };
    })
    .filter(
      (
        option,
      ): option is {
        label: string;
        value: string;
        color?: string;
      } => Boolean(option),
    );
  const suggestedNewAttribute =
    mapping.suggestedNewAttribute?.name &&
    mapping.suggestedNewAttribute?.type &&
    suggestedNewAttributeOptions.length > 0
      ? {
          name: mapping.suggestedNewAttribute.name.trim(),
          type: mapping.suggestedNewAttribute.type,
          options: suggestedNewAttributeOptions,
        }
      : undefined;

  return {
    externalAttributeName,
    ...(internalAttributeId ? { internalAttributeId } : {}),
    confidence: normalizeConfidence(mapping.confidence) ?? 0,
    optionMappings: normalizeAiOptionMappings(mapping.optionMappings, options),
    ...(suggestedNewAttribute ? { suggestedNewAttribute } : {}),
  };
}

export function normalizeAttributeMappings(options: {
  externalAttributes: ExternalAttribute[];
  internalAttributes?: InternalAttributeForMapping[];
  mappings?: AttributeMapping[];
}): AttributeMapping[] {
  const {
    externalAttributes,
    internalAttributes = [],
    mappings = [],
  } = options;
  const internalAttributesById = new Map(
    internalAttributes.map((attribute) => [attribute.id, attribute]),
  );
  const normalizedMappingsByExternalName = new Map<string, AttributeMapping>();
  const orderedExternalNames: string[] = [];

  for (const mapping of mappings) {
    const normalizedExternalAttributeName = resolveExternalAttributeName({
      externalAttributes,
      externalAttributeName: mapping.externalAttributeName,
    });
    const externalAttribute = findExternalAttributeByKey(
      externalAttributes,
      normalizedExternalAttributeName,
    );
    const internalAttribute = mapping.internalAttributeId
      ? internalAttributesById.get(mapping.internalAttributeId)
      : undefined;
    const normalizedMapping = normalizeAttributeMapping(
      {
        ...mapping,
        externalAttributeName: normalizedExternalAttributeName,
      },
      {
        externalAttribute,
        internalAttribute,
      },
    );

    if (!normalizedMapping) {
      continue;
    }

    const existingMapping = normalizedMappingsByExternalName.get(
      normalizedMapping.externalAttributeName,
    );

    if (!existingMapping) {
      normalizedMappingsByExternalName.set(
        normalizedMapping.externalAttributeName,
        normalizedMapping,
      );
      orderedExternalNames.push(normalizedMapping.externalAttributeName);
      continue;
    }

    normalizedMappingsByExternalName.set(
      normalizedMapping.externalAttributeName,
      mergeDuplicateAttributeMappings({
        existing: existingMapping,
        candidate: normalizedMapping,
      }),
    );
  }

  return orderedExternalNames
    .map((externalAttributeName) =>
      normalizedMappingsByExternalName.get(externalAttributeName),
    )
    .filter((mapping): mapping is AttributeMapping => Boolean(mapping));
}

export function normalizeAiSuggestedAttributeMappings(options: {
  externalAttributes: ExternalAttribute[];
  internalAttributes?: InternalAttributeForMapping[];
  mappings?: AISuggestedAttributeMapping[];
}): AISuggestedAttributeMapping[] {
  const {
    externalAttributes,
    internalAttributes = [],
    mappings = [],
  } = options;
  const internalAttributesById = new Map(
    internalAttributes.map((attribute) => [attribute.id, attribute]),
  );
  const normalizedMappingsByExternalName = new Map<
    string,
    AISuggestedAttributeMapping
  >();
  const orderedExternalNames: string[] = [];

  for (const mapping of mappings) {
    const normalizedExternalAttributeName = resolveExternalAttributeName({
      externalAttributes,
      externalAttributeName: mapping.externalAttributeName,
    });
    const externalAttribute = findExternalAttributeByKey(
      externalAttributes,
      normalizedExternalAttributeName,
    );
    const internalAttribute = mapping.internalAttributeId
      ? internalAttributesById.get(mapping.internalAttributeId)
      : undefined;
    const normalizedMapping = normalizeAiSuggestedAttributeMapping(
      {
        ...mapping,
        externalAttributeName: normalizedExternalAttributeName,
      },
      {
        externalAttribute,
        internalAttribute,
      },
    );

    if (!normalizedMapping) {
      continue;
    }

    const existingMapping = normalizedMappingsByExternalName.get(
      normalizedMapping.externalAttributeName,
    );

    if (!existingMapping) {
      normalizedMappingsByExternalName.set(
        normalizedMapping.externalAttributeName,
        normalizedMapping,
      );
      orderedExternalNames.push(normalizedMapping.externalAttributeName);
      continue;
    }

    const preferCandidate =
      comparePriority(
        [
          Number(Boolean(normalizedMapping.internalAttributeId)),
          normalizedMapping.optionMappings.filter(
            (option) => option.internalValue,
          ).length,
          normalizedMapping.confidence,
          Number(Boolean(normalizedMapping.suggestedNewAttribute)),
        ],
        [
          Number(Boolean(existingMapping.internalAttributeId)),
          existingMapping.optionMappings.filter(
            (option) => option.internalValue,
          ).length,
          existingMapping.confidence,
          Number(Boolean(existingMapping.suggestedNewAttribute)),
        ],
      ) > 0;

    if (preferCandidate) {
      normalizedMappingsByExternalName.set(
        normalizedMapping.externalAttributeName,
        normalizedMapping,
      );
    }
  }

  return orderedExternalNames
    .map((externalAttributeName) =>
      normalizedMappingsByExternalName.get(externalAttributeName),
    )
    .filter((mapping): mapping is AISuggestedAttributeMapping =>
      Boolean(mapping),
    );
}
