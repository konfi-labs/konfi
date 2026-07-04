import type { ExternalAttribute } from "@konfi/types";
import type { PricingCombinationStrategy } from "@/lib/external-products/pricing-combination-planner";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";

export type PricingResponseCorrection = {
  omitAttributes?: string[];
  reason?: string;
  setValues?: Record<string, string>;
};

export type PricingResponseSignals = {
  allPricesZero?: boolean;
  available?: boolean;
  disabledAttributes: string[];
  excludedAttributeValues: Record<string, string[]>;
  notSelectedRequiredAttributes: string[];
  priceTableCount?: number;
  reportingParams?: Record<string, string>;
  selectedAttributes: Record<string, string>;
  summaryDescription?: string;
  triggeredExclusionAttributes: string[];
};

function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== "object" || obj === null) {
    return undefined;
  }

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
      continue;
    }

    return undefined;
  }

  return current;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeKey(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function extractExcludedAttributeValues(
  apiData: unknown,
): Record<string, string[]> {
  const sources = [
    getByPath(apiData, "exclusions.exclusionForAttributeId"),
    getByPath(apiData, "exclusions.triggeredExclusions"),
  ];
  const merged = new Map<string, Set<string>>();

  for (const source of sources) {
    if (
      typeof source !== "object" ||
      source === null ||
      Array.isArray(source)
    ) {
      continue;
    }

    for (const [attributeId, exclusionValueMap] of Object.entries(source)) {
      if (
        typeof exclusionValueMap !== "object" ||
        exclusionValueMap === null ||
        Array.isArray(exclusionValueMap)
      ) {
        continue;
      }

      const values = merged.get(attributeId) ?? new Set<string>();

      for (const value of Object.keys(exclusionValueMap)) {
        values.add(value);
      }

      merged.set(attributeId, values);
    }
  }

  return Object.fromEntries(
    [...merged.entries()].map(([attributeId, values]) => [
      attributeId,
      [...values],
    ]),
  );
}

function buildExternalAttributeLookup(
  externalAttributes: ExternalAttribute[],
): Map<string, ExternalAttribute> {
  const lookup = new Map<string, ExternalAttribute>();

  for (const attribute of externalAttributes) {
    lookup.set(normalizeKey(attribute.name), attribute);

    if (attribute.id) {
      lookup.set(normalizeKey(attribute.id), attribute);
    }
  }

  return lookup;
}

function extractAllPricesZero(priceTable: unknown): boolean | undefined {
  if (!Array.isArray(priceTable) || priceTable.length === 0) {
    return undefined;
  }

  let foundAnyPrice = false;

  for (const entry of priceTable) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const nestedRows = (entry as Record<string, unknown>).priceRowsPerVolume;
    const rows = Array.isArray(nestedRows) ? nestedRows : [entry];

    for (const row of rows) {
      if (typeof row !== "object" || row === null) {
        continue;
      }

      const netPriceValue = getByPath(row, "netPrice.value");
      const grossPriceValue = getByPath(row, "grossPrice.value");

      for (const rawValue of [netPriceValue, grossPriceValue]) {
        if (rawValue === undefined || rawValue === null) {
          continue;
        }

        const numericValue =
          typeof rawValue === "number"
            ? rawValue
            : typeof rawValue === "string"
              ? parseFloat(rawValue)
              : NaN;

        if (isNaN(numericValue)) {
          continue;
        }

        foundAnyPrice = true;

        if (numericValue > 0) {
          return false;
        }
      }
    }
  }

  return foundAnyPrice ? true : undefined;
}

export function extractPricingResponseSignals(
  apiData: unknown,
): PricingResponseSignals {
  const availableValue = getByPath(apiData, "available");
  const priceTable = getByPath(apiData, "prices.priceTable");
  const triggeredExclusions = getByPath(
    apiData,
    "exclusions.triggeredExclusions",
  );
  const selectedAttributes: Record<string, string> = {};
  const labelGroups = getByPath(apiData, "description.labelGroups");

  if (Array.isArray(labelGroups)) {
    for (const group of labelGroups) {
      const attributes =
        typeof group === "object" && group !== null && "attributes" in group
          ? (group.attributes as unknown)
          : undefined;

      if (!Array.isArray(attributes)) {
        continue;
      }

      for (const attribute of attributes) {
        if (typeof attribute !== "object" || attribute === null) {
          continue;
        }

        const attributeId =
          typeof attribute.attributeId === "string"
            ? attribute.attributeId
            : undefined;
        const selectedValueId =
          typeof attribute.firstValueIdFromValueLabels === "string"
            ? attribute.firstValueIdFromValueLabels
            : undefined;

        if (attributeId && selectedValueId) {
          selectedAttributes[attributeId] = selectedValueId;
        }
      }
    }
  }

  return {
    allPricesZero: extractAllPricesZero(priceTable),
    available:
      typeof availableValue === "boolean" ? availableValue : undefined,
    disabledAttributes: asStringArray(
      getByPath(apiData, "exclusions.disabledAttributes"),
    ),
    excludedAttributeValues: extractExcludedAttributeValues(apiData),
    notSelectedRequiredAttributes: asStringArray(
      getByPath(apiData, "exclusions.notSelectedRequiredAttributes"),
    ),
    priceTableCount: Array.isArray(priceTable) ? priceTable.length : undefined,
    reportingParams: asStringRecord(getByPath(apiData, "reportingParams")),
    selectedAttributes,
    summaryDescription:
      typeof getByPath(apiData, "summaryDescription") === "string"
        ? (getByPath(apiData, "summaryDescription") as string)
        : typeof getByPath(apiData, "description.description") === "string"
          ? (getByPath(apiData, "description.description") as string)
          : undefined,
    triggeredExclusionAttributes:
      typeof triggeredExclusions === "object" &&
      triggeredExclusions !== null &&
      !Array.isArray(triggeredExclusions)
        ? Object.keys(triggeredExclusions)
        : [],
  };
}

export function looksLikeUnavailablePricingResponse(apiData: unknown): boolean {
  const signals = extractPricingResponseSignals(apiData);

  if (signals.available === false) {
    return true;
  }

  if (signals.allPricesZero === true) {
    return true;
  }

  // When the provider explicitly confirms availability and has price data,
  // trust that over notSelectedRequiredAttributes (which can be informational)
  const hasRealPriceData =
    typeof signals.priceTableCount === "number" && signals.priceTableCount > 0;

  if (signals.available === true && hasRealPriceData) {
    return false;
  }

  if (signals.notSelectedRequiredAttributes.length > 0) {
    return true;
  }

  if (hasRealPriceData) {
    return false;
  }

  return signals.priceTableCount === 0;
}

export function summarizeUnavailablePricingSignals(
  signals: PricingResponseSignals,
): string {
  const parts: string[] = [];

  if (signals.available === false) {
    parts.push("available=false");
  }

  if (typeof signals.priceTableCount === "number") {
    parts.push(`priceTableCount=${signals.priceTableCount}`);
  }

  if (signals.triggeredExclusionAttributes.length > 0) {
    parts.push(
      `triggeredExclusions=${signals.triggeredExclusionAttributes.join(",")}`,
    );
  }

  if (signals.notSelectedRequiredAttributes.length > 0) {
    parts.push(
      `missingRequired=${signals.notSelectedRequiredAttributes.join(",")}`,
    );
  }

  if (signals.allPricesZero === true) {
    parts.push("allPricesZero=true");
  }

  return parts.join("; ") || "empty price response";
}

export function sanitizePricingResponseCorrection(options: {
  correction: PricingResponseCorrection;
  currentConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
}): PricingResponseCorrection | null {
  const { correction, currentConfiguration, externalAttributes } = options;
  const attributeLookup = buildExternalAttributeLookup(externalAttributes);
  const omitAttributes = [...new Set(correction.omitAttributes ?? [])].filter(
    (attributeKey) => attributeLookup.has(normalizeKey(attributeKey)),
  );
  const setValues: Record<string, string> = {};

  for (const [attributeKey, value] of Object.entries(
    correction.setValues ?? {},
  )) {
    const attribute = attributeLookup.get(normalizeKey(attributeKey));

    if (!attribute || !attribute.values.includes(value)) {
      continue;
    }

    setValues[attributeKey] = value;
  }

  const applied = applyPricingResponseCorrection(currentConfiguration, {
    omitAttributes,
    setValues,
  });

  if (
    JSON.stringify(applied) === JSON.stringify(currentConfiguration)
  ) {
    return null;
  }

  return {
    omitAttributes: omitAttributes.length > 0 ? omitAttributes : undefined,
    reason: correction.reason?.trim() || undefined,
    setValues: Object.keys(setValues).length > 0 ? setValues : undefined,
  };
}

export function applyPricingResponseCorrection(
  currentConfiguration: Record<string, string>,
  correction: PricingResponseCorrection,
): Record<string, string> {
  const nextConfiguration = { ...currentConfiguration };

  for (const attributeName of correction.omitAttributes ?? []) {
    delete nextConfiguration[attributeName];
  }

  for (const [attributeName, value] of Object.entries(
    correction.setValues ?? {},
  )) {
    nextConfiguration[attributeName] = value;
  }

  return nextConfiguration;
}

function getPricingResponseCorrectionComplexityScore(options: {
  correction: PricingResponseCorrection;
  currentConfiguration: Record<string, string>;
}): number {
  const correctedConfiguration = applyPricingResponseCorrection(
    options.currentConfiguration,
    options.correction,
  );
  const values = Object.values(correctedConfiguration);
  const definedAttributeCount = values.length;
  const nonNeutralValueCount = values.filter(
    (value) => normalizeKey(value) !== "none",
  ).length;

  return definedAttributeCount * 10 + nonNeutralValueCount;
}

export function sortPricingResponseCorrectionsBySimplicity(options: {
  corrections: PricingResponseCorrection[];
  currentConfiguration: Record<string, string>;
}): PricingResponseCorrection[] {
  const { corrections, currentConfiguration } = options;

  return [...corrections].toSorted((correctionA, correctionB) => {
    const complexityDiff =
      getPricingResponseCorrectionComplexityScore({
        correction: correctionA,
        currentConfiguration,
      }) -
      getPricingResponseCorrectionComplexityScore({
        correction: correctionB,
        currentConfiguration,
      });

    if (complexityDiff !== 0) {
      return complexityDiff;
    }

    const omittedAttributeDiff =
      (correctionB.omitAttributes?.length ?? 0) -
      (correctionA.omitAttributes?.length ?? 0);

    if (omittedAttributeDiff !== 0) {
      return omittedAttributeDiff;
    }

    const setValueDiff =
      Object.keys(correctionA.setValues ?? {}).length -
      Object.keys(correctionB.setValues ?? {}).length;

    if (setValueDiff !== 0) {
      return setValueDiff;
    }

    return (correctionA.reason ?? "").localeCompare(correctionB.reason ?? "");
  });
}

export function mergePricingCombinationStrategies(
  ...strategies: Array<PricingCombinationStrategy | undefined>
): PricingCombinationStrategy | undefined {
  const rules = strategies.flatMap((strategy) => strategy?.rules ?? []);

  return rules.length > 0 ? { rules } : undefined;
}

export function deriveDeterministicPricingResponseCorrections(options: {
  currentConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  responseData: unknown;
}): PricingResponseCorrection[] {
  const { currentConfiguration, externalAttributes, responseData } = options;
  const signals = extractPricingResponseSignals(responseData);
  const attributeLookup = buildExternalAttributeLookup(externalAttributes);
  const omitDisabledAttributes = signals.disabledAttributes
    .map((attributeKey) => attributeLookup.get(normalizeKey(attributeKey)))
    .filter(
      (attribute): attribute is ExternalAttribute => {
        if (!attribute) return false;
        const key = getExternalAttributeKey(attribute);
        return key in currentConfiguration || attribute.name in currentConfiguration;
      },
    )
    .map((attribute) => {
      const key = getExternalAttributeKey(attribute);
      return key in currentConfiguration ? key : attribute.name;
    });
  const setToNoneAttributes: string[] = [];
  const omitExcludedAttributes: string[] = [];

  for (const [attributeKey, excludedValues] of Object.entries(
    signals.excludedAttributeValues,
  )) {
    const attribute = attributeLookup.get(normalizeKey(attributeKey));
    if (!attribute) continue;

    const attrKey = getExternalAttributeKey(attribute);
    const configKey =
      attrKey in currentConfiguration
        ? attrKey
        : attribute.name in currentConfiguration
          ? attribute.name
          : undefined;

    if (!configKey) {
      continue;
    }

    const currentValue =
      currentConfiguration[configKey] ??
      (attribute.id
        ? signals.selectedAttributes[attribute.id]
        : undefined);

    if (!currentValue) {
      continue;
    }

    const excludesCurrentValue = excludedValues.includes(currentValue);
    const excludesAllValues = excludedValues.includes("*");

    if (!excludesCurrentValue && !excludesAllValues) {
      continue;
    }

    if (attribute.values.includes("none") && currentValue !== "none") {
      setToNoneAttributes.push(configKey);
      continue;
    }

    omitExcludedAttributes.push(configKey);
  }

  const corrections: PricingResponseCorrection[] = [];

  // Deterministic correction for missing required attributes: pick their first value
  const addRequiredSetValues: Record<string, string> = {};

  for (const requiredAttributeKey of signals.notSelectedRequiredAttributes) {
    const attribute = attributeLookup.get(normalizeKey(requiredAttributeKey));

    if (!attribute) continue;
    const attrKey = getExternalAttributeKey(attribute);
    if (attrKey in currentConfiguration || attribute.name in currentConfiguration) {
      continue;
    }

    const firstValue = attribute.values.find(
      (value) => normalizeKey(value) !== "none",
    );

    if (firstValue) {
      addRequiredSetValues[attrKey] = firstValue;
    }
  }

  if (Object.keys(addRequiredSetValues).length > 0) {
    corrections.push({
      reason: "add missing required attributes reported by provider",
      setValues: addRequiredSetValues,
    });
  }

  const primaryOmitAttributes = [
    ...new Set([...omitDisabledAttributes, ...omitExcludedAttributes]),
  ];
  const primarySetValues = Object.fromEntries(
    [...new Set(setToNoneAttributes)].map((attributeName) => [attributeName, "none"]),
  );

  if (
    primaryOmitAttributes.length > 0 ||
    Object.keys(primarySetValues).length > 0
  ) {
    const combinedSetValues = {
      ...addRequiredSetValues,
      ...primarySetValues,
    };

    corrections.push({
      omitAttributes:
        primaryOmitAttributes.length > 0 ? primaryOmitAttributes : undefined,
      reason:
        Object.keys(addRequiredSetValues).length > 0
          ? "provider exclusions, disabled attributes, and missing required attributes"
          : "provider exclusions and disabled attributes",
      setValues:
        Object.keys(combinedSetValues).length > 0
          ? combinedSetValues
          : undefined,
    });
  }

  const omitAllOptionalAttributes = [
    ...new Set([
      ...primaryOmitAttributes,
      ...setToNoneAttributes,
    ]),
  ];

  if (
    omitAllOptionalAttributes.length > 0 &&
    JSON.stringify([...omitAllOptionalAttributes].toSorted()) !==
      JSON.stringify([...primaryOmitAttributes].toSorted())
  ) {
    corrections.push({
      omitAttributes: omitAllOptionalAttributes,
      reason: "omit all currently excluded optional attributes",
    });
  }

  return corrections
    .map((correction) =>
      sanitizePricingResponseCorrection({
        correction,
        currentConfiguration,
        externalAttributes,
      }),
    )
    .filter(
      (correction): correction is PricingResponseCorrection => Boolean(correction),
    );
}

export function buildPricingStrategyFromCorrection(options: {
  correctedConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  originalConfiguration: Record<string, string>;
}): PricingCombinationStrategy | undefined {
  const {
    correctedConfiguration,
    externalAttributes,
    originalConfiguration,
  } = options;
  const omittedAttributes = Object.keys(originalConfiguration).filter(
    (attributeName) => !(attributeName in correctedConfiguration),
  );
  const constrainedAttributes = Object.entries(correctedConfiguration).filter(
    ([attributeName, value]) => originalConfiguration[attributeName] !== value,
  );
  const attributeLookup = buildExternalAttributeLookup(externalAttributes);
  const when = Object.fromEntries(
    Object.entries(correctedConfiguration).filter(([configKey]) => {
      if (omittedAttributes.includes(configKey)) {
        return false;
      }

      if (constrainedAttributes.some(([key]) => key === configKey)) {
        return false;
      }

      return attributeLookup.get(normalizeKey(configKey))?.affectsPricing !== false;
    }),
  );
  const allowedValues = Object.fromEntries(
    constrainedAttributes.map(([attributeName, value]) => [attributeName, [value]]),
  );

  if (
    Object.keys(when).length === 0 &&
    omittedAttributes.length === 0 &&
    Object.keys(allowedValues).length === 0
  ) {
    return undefined;
  }

  return {
    rules: [
      {
        when: Object.keys(when).length > 0 ? when : undefined,
        omitAttributes:
          omittedAttributes.length > 0 ? omittedAttributes : undefined,
        requiredAttributes:
          Object.keys(allowedValues).length > 0
            ? Object.keys(allowedValues)
            : undefined,
        allowedValues:
          Object.keys(allowedValues).length > 0 ? allowedValues : undefined,
        reason: "learned from successful deterministic pricing correction",
      },
    ],
  };
}

function getKnownConfigurationKey(options: {
  attributeName: string;
  currentConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
}): string | undefined {
  const { attributeName, currentConfiguration, externalAttributes } = options;
  const attributeLookup = buildExternalAttributeLookup(externalAttributes);
  const attribute = attributeLookup.get(normalizeKey(attributeName));

  if (!attribute) {
    return undefined;
  }

  const attributeKey = getExternalAttributeKey(attribute);

  if (attributeKey in currentConfiguration) {
    return attributeKey;
  }

  if (attribute.name in currentConfiguration) {
    return attribute.name;
  }

  return attributeKey;
}

function buildConditionWithoutAttributes(options: {
  currentConfiguration: Record<string, string>;
  omittedAttributes: string[];
}): Record<string, string> | undefined {
  const omittedAttributeSet = new Set(options.omittedAttributes);
  const when = Object.fromEntries(
    Object.entries(options.currentConfiguration).filter(
      ([attributeName]) => !omittedAttributeSet.has(attributeName),
    ),
  );

  return Object.keys(when).length > 0 ? when : undefined;
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildPricingStrategyFromUnavailableResponse(options: {
  currentConfiguration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  responseData: unknown;
}): PricingCombinationStrategy | undefined {
  const { currentConfiguration, externalAttributes, responseData } = options;

  if (!looksLikeUnavailablePricingResponse(responseData)) {
    return undefined;
  }

  const signals = extractPricingResponseSignals(responseData);
  const rules: NonNullable<PricingCombinationStrategy["rules"]> = [];
  const disabledAttributes = signals.disabledAttributes
    .map((attributeName) =>
      getKnownConfigurationKey({
        attributeName,
        currentConfiguration,
        externalAttributes,
      }),
    )
    .filter((attributeName): attributeName is string => Boolean(attributeName));
  const presentDisabledAttributes = disabledAttributes.filter(
    (attributeName) => attributeName in currentConfiguration,
  );

  if (presentDisabledAttributes.length > 0) {
    rules.push({
      omitAttributes: presentDisabledAttributes,
      reason: "learned from provider disabled-attribute signal",
      when: buildConditionWithoutAttributes({
        currentConfiguration,
        omittedAttributes: presentDisabledAttributes,
      }),
    });
  }

  for (const [attributeName, excludedValues] of Object.entries(
    signals.excludedAttributeValues,
  )) {
    const configurationKey = getKnownConfigurationKey({
      attributeName,
      currentConfiguration,
      externalAttributes,
    });

    if (!configurationKey) {
      continue;
    }

    const currentValue = currentConfiguration[configurationKey];

    if (!currentValue) {
      continue;
    }

    const excludedValueSet = new Set(excludedValues);
    const normalizedCurrentValue = normalizeComparableValue(currentValue);
    const excludesCurrentValue = excludedValues.some(
      (value) => normalizeComparableValue(value) === normalizedCurrentValue,
    );

    if (
      !excludedValueSet.has(currentValue) &&
      !excludedValueSet.has("*") &&
      !excludesCurrentValue
    ) {
      continue;
    }

    rules.push({
      excludedValues: {
        [configurationKey]: [currentValue],
      },
      reason: "learned from provider excluded-value signal",
      when: buildConditionWithoutAttributes({
        currentConfiguration,
        omittedAttributes: [configurationKey],
      }),
    });
  }

  const requiredAttributes = signals.notSelectedRequiredAttributes
    .map((attributeName) =>
      getKnownConfigurationKey({
        attributeName,
        currentConfiguration,
        externalAttributes,
      }),
    )
    .filter((attributeName): attributeName is string => Boolean(attributeName))
    .filter((attributeName) => !(attributeName in currentConfiguration));

  if (requiredAttributes.length > 0) {
    rules.push({
      reason: "learned from provider missing-required-attribute signal",
      requiredAttributes,
      when:
        Object.keys(currentConfiguration).length > 0
          ? currentConfiguration
          : undefined,
    });
  }

  return rules.length > 0 ? { rules } : undefined;
}
