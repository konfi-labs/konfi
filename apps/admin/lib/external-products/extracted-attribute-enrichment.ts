import type { ExternalAttribute, ExternalAttributeOption } from "@konfi/types";
import { createSyntheticEmptyBranchExternalOptionValue } from "./option-mapping-utils";

type EnrichExtractedExternalAttributesOptions = {
  attributes: ExternalAttribute[];
  payloads: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function getRecordArray(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeAlias(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

function buildDerivedOptionLabel(options: {
  emptyGroupLabel: string;
  leafLabel?: string;
}): string {
  const { emptyGroupLabel, leafLabel } = options;

  if (!leafLabel) {
    return emptyGroupLabel;
  }

  return `${leafLabel} (${emptyGroupLabel})`;
}

function buildDerivedOptionsFromAttributeSpec(
  attributeSpec: Record<string, unknown>,
): ExternalAttributeOption[] {
  const rawOptions = getRecordArray(attributeSpec, "options");

  if (rawOptions.length === 0) {
    return [];
  }

  const emptyGroups = rawOptions.filter(
    (option) =>
      getOptionalBoolean(option, "empty") === true &&
      Boolean(getOptionalString(option, "label")),
  );
  const canInferCorrespondingValues = emptyGroups.length === 1;
  const derivedOptions: ExternalAttributeOption[] = [];
  const syntheticValueCounts = new Map<string, number>();

  for (const emptyGroup of emptyGroups) {
    const emptyGroupLabel = getOptionalString(emptyGroup, "label");

    if (!emptyGroupLabel) {
      continue;
    }

    const inferredCorrespondingValues = canInferCorrespondingValues
      ? rawOptions.flatMap((option) =>
        getRecordArray(option, "values").flatMap((leafValue) => {
          const correspondingValue = getOptionalString(
            leafValue,
            "correspondingValue",
          );

          if (!correspondingValue) {
            return [];
          }

          return [
            {
              value: correspondingValue,
              label: buildDerivedOptionLabel({
                emptyGroupLabel,
                leafLabel: getOptionalString(leafValue, "label"),
              }),
            },
          ];
        }),
      )
      : [];

    if (inferredCorrespondingValues.length > 0) {
      derivedOptions.push(...inferredCorrespondingValues);
      continue;
    }

    const syntheticBaseValue =
      createSyntheticEmptyBranchExternalOptionValue(emptyGroupLabel);
    const count = (syntheticValueCounts.get(syntheticBaseValue) ?? 0) + 1;
    syntheticValueCounts.set(syntheticBaseValue, count);

    derivedOptions.push({
      value:
        count === 1 ? syntheticBaseValue : `${syntheticBaseValue}-${count}`,
      label: emptyGroupLabel,
    });
  }

  const dedupedOptions: ExternalAttributeOption[] = [];
  const seenValues = new Set<string>();

  for (const option of derivedOptions) {
    if (seenValues.has(option.value)) {
      continue;
    }

    seenValues.add(option.value);
    dedupedOptions.push(option);
  }

  return dedupedOptions;
}

function getAttributeSpecRecords(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  const attributeSpecs = payload.attributeSpecs;

  if (!isRecord(attributeSpecs)) {
    return [];
  }

  const attributes = attributeSpecs.attributes;

  if (!Array.isArray(attributes)) {
    return [];
  }

  return attributes.filter(isRecord);
}

function getMetadataRecords(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  const result: Record<string, unknown>[] = [];

  if (isRecord(payload.metadata)) {
    result.push(payload.metadata);
  }

  if (isRecord(payload.exclusions) && isRecord(payload.exclusions.metadata)) {
    result.push(payload.exclusions.metadata);
  }

  return result;
}

function mergeNumericMetadata(
  attribute: ExternalAttribute,
  numericMetadata: Record<string, { minimum?: number; maximum?: number; step?: number }>,
): ExternalAttribute {
  const aliases = [
    normalizeAlias(attribute.id),
    normalizeAlias(attribute.name),
  ].filter((value): value is string => Boolean(value));

  const metadata = aliases
    .map((alias) => numericMetadata[alias])
    .find((value) => value !== undefined);

  if (!metadata) {
    return attribute;
  }

  return {
    ...attribute,
    numberConfig: {
      minimum: metadata.minimum ?? attribute.numberConfig?.minimum,
      maximum: metadata.maximum ?? attribute.numberConfig?.maximum,
      step: metadata.step ?? attribute.numberConfig?.step,
    },
  };
}

function mergeAttributeOptions(
  attribute: ExternalAttribute,
  derivedOptions: ExternalAttributeOption[],
): ExternalAttribute {
  const existingOptions: ExternalAttributeOption[] =
    attribute.options ?? attribute.values.map((value) => ({ value }));
  const mergedOptions = [...existingOptions];

  for (const derivedOption of derivedOptions) {
    const existingIndex = mergedOptions.findIndex(
      (option) => option.value === derivedOption.value,
    );

    if (existingIndex === -1) {
      mergedOptions.push(derivedOption);
      continue;
    }

    if (!mergedOptions[existingIndex].label && derivedOption.label) {
      mergedOptions[existingIndex] = {
        ...mergedOptions[existingIndex],
        label: derivedOption.label,
      };
    }
  }

  return {
    ...attribute,
    values: [...new Set(mergedOptions.map((option) => option.value))],
    options: mergedOptions,
  };
}

export function enrichExtractedExternalAttributes(
  options: EnrichExtractedExternalAttributesOptions,
): ExternalAttribute[] {
  const { attributes, payloads } = options;
  const numericMetadata = payloads.reduce<
    Record<string, { minimum?: number; maximum?: number; step?: number }>
  >((acc, payload) => {
    for (const metadataRecord of getMetadataRecords(payload)) {
      for (const [key, value] of Object.entries(metadataRecord)) {
        const match = key.match(/^(.*)-(min|max|step)$/);

        if (!match || typeof value !== "number" || !Number.isFinite(value)) {
          continue;
        }

        const [, rawName, rawField] = match;
        const alias = normalizeAlias(rawName);

        if (!alias) {
          continue;
        }

        const current = acc[alias] ?? {};
        if (rawField === "min") {
          current.minimum = value;
        } else if (rawField === "max") {
          current.maximum = value;
        } else if (rawField === "step") {
          current.step = value;
        }

        acc[alias] = current;
      }
    }

    return acc;
  }, {});
  const enrichedAttributes: ExternalAttribute[] = attributes.map((attribute) =>
    mergeNumericMetadata(
      {
        ...attribute,
        values: [...attribute.values],
        options: attribute.options?.map((option) => ({ ...option })),
      },
      numericMetadata,
    ),
  );

  for (const payload of payloads) {
    for (const attributeSpec of getAttributeSpecRecords(payload)) {
      const derivedOptions = buildDerivedOptionsFromAttributeSpec(attributeSpec);

      if (derivedOptions.length === 0) {
        continue;
      }

      const specIdAlias = normalizeAlias(getOptionalString(attributeSpec, "id"));
      const specNameAlias = normalizeAlias(getOptionalString(attributeSpec, "name"));

      // Prefer matching by id alias (more specific) to avoid mismatches when
      // multiple attributes share the same display name.
      let existingIndex = -1;

      if (specIdAlias) {
        existingIndex = enrichedAttributes.findIndex((attribute) => {
          const attributeIdAlias = normalizeAlias(attribute.id);
          return attributeIdAlias === specIdAlias;
        });
      }

      if (existingIndex === -1) {
        const specAliases = new Set(
          [specIdAlias, specNameAlias].filter(
            (value): value is string => Boolean(value),
          ),
        );

        existingIndex = enrichedAttributes.findIndex((attribute) => {
          const attributeAliases = [
            normalizeAlias(attribute.id),
            normalizeAlias(attribute.name),
          ].filter((value): value is string => Boolean(value));

          return attributeAliases.some((alias) => specAliases.has(alias));
        });
      }

      if (existingIndex >= 0) {
        enrichedAttributes[existingIndex] = mergeNumericMetadata(
          mergeAttributeOptions(enrichedAttributes[existingIndex], derivedOptions),
          numericMetadata,
        );
        continue;
      }

      const fallbackName =
        getOptionalString(attributeSpec, "name") ??
        getOptionalString(attributeSpec, "id");

      if (!fallbackName) {
        continue;
      }

      enrichedAttributes.push({
        id: getOptionalString(attributeSpec, "id"),
        name: fallbackName,
        values: derivedOptions.map((option) => option.value),
        options: derivedOptions,
        numberConfig: (() => {
          const aliases = [
            normalizeAlias(getOptionalString(attributeSpec, "id")),
            normalizeAlias(fallbackName),
          ].filter((value): value is string => Boolean(value));

          return aliases
            .map((alias) => numericMetadata[alias])
            .find((value) => value !== undefined);
        })(),
      });
    }
  }

  return enrichedAttributes;
}
