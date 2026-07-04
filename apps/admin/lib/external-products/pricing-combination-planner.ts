import type {
  AttributeMapping,
  ExternalAttribute,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import { getVariablePricingAttributes } from "@/lib/external-products/provider-pricing";

export type PriceConfigurationInput = {
  configuration: Record<string, string>;
};

export type PricingCombinationRule = {
  when?: Record<string, string>;
  omitAttributes?: string[];
  requiredAttributes?: string[];
  allowedValues?: Record<string, string[]>;
  excludedValues?: Record<string, string[]>;
  reason?: string;
};

export type PricingCombinationStrategy = {
  rules?: PricingCombinationRule[];
};

export function getPersistedManualPricingExclusionRules(
  rules?: ExternalProductPricingExclusionRule[],
): ExternalProductPricingExclusionRule[] {
  return (rules ?? []).filter((rule) => rule.source !== "ai");
}

export function buildManualPricingCombinationStrategy(
  rules?: ExternalProductPricingExclusionRule[],
): PricingCombinationStrategy | undefined {
  const sanitizedRules = (rules ?? []).flatMap((rule) => {
    const normalizedWhenEntries = Object.entries(rule.when ?? {})
      .map(([attributeName, values]) => {
        const sanitizedValues = [...new Set(values ?? [])].filter(
          (value) => value.trim().length > 0,
        );

        if (sanitizedValues.length === 0) {
          return null;
        }

        return [attributeName, sanitizedValues] as const;
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry));
    const omitAttributes =
      Array.isArray(rule.omitAttributes) && rule.omitAttributes.length > 0
        ? [...new Set(rule.omitAttributes)]
        : undefined;
    const excludedValues = Object.fromEntries(
      Object.entries(rule.excludeValues ?? {})
        .map(([attributeName, values]) => {
          const sanitizedValues = [...new Set(values ?? [])].filter(
            (value) => value.trim().length > 0,
          );

          if (sanitizedValues.length === 0) {
            return null;
          }

          return [attributeName, sanitizedValues] as const;
        })
        .filter((entry): entry is readonly [string, string[]] =>
          Boolean(entry),
        ),
    );

    if (
      normalizedWhenEntries.length === 0 ||
      (!omitAttributes?.length && Object.keys(excludedValues).length === 0)
    ) {
      return [];
    }

    const expandedWhens = normalizedWhenEntries.reduce<
      Record<string, string>[]
    >(
      (combinations, [attributeName, values]) =>
        combinations.flatMap((currentCombination) =>
          values.map((value) => ({
            ...currentCombination,
            [attributeName]: value,
          })),
        ),
      [{}],
    );

    return expandedWhens.map((when) => ({
      when,
      omitAttributes,
      excludedValues:
        Object.keys(excludedValues).length > 0 ? excludedValues : undefined,
      reason: "manual exclusion rule",
    }));
  });

  if (sanitizedRules.length > 0 && process.env.NODE_ENV === "development") {
    console.log("[buildManualPricingCombinationStrategy] Built manual rules", {
      inputRuleCount: (rules ?? []).length,
      expandedRuleCount: sanitizedRules.length,
      rules: sanitizedRules.map((r) => ({
        when: r.when,
        omitAttributes: r.omitAttributes,
        excludedValues: r.excludedValues,
      })),
    });
  }

  return sanitizedRules.length > 0 ? { rules: sanitizedRules } : undefined;
}

type SanitizedPricingCombinationRule = {
  when?: Record<string, string>;
  omitAttributes?: string[];
  requiredAttributes?: string[];
  allowedValues?: Record<string, string[]>;
  excludedValues?: Record<string, string[]>;
  reason?: string;
};

function buildAttributeMap(
  externalAttributes: ExternalAttribute[],
): Map<string, ExternalAttribute> {
  const map = new Map<string, ExternalAttribute>();

  for (const attribute of externalAttributes) {
    if (!map.has(attribute.name)) {
      map.set(attribute.name, attribute);
    }
    map.set(getExternalAttributeKey(attribute), attribute);
  }

  return map;
}

function buildSelectionWithAliases(options: {
  selection: Record<string, string>;
  externalAttributes: ExternalAttribute[];
}): Record<string, string> {
  const { selection, externalAttributes } = options;
  const expandedSelection = { ...selection };

  for (const attribute of externalAttributes) {
    const attributeKey = getExternalAttributeKey(attribute);
    const selectedValue = selection[attributeKey] ?? selection[attribute.name];

    if (selectedValue === undefined) {
      continue;
    }

    expandedSelection[attributeKey] = selectedValue;
    expandedSelection[attribute.name] = selectedValue;
  }

  return expandedSelection;
}

function sanitizeCondition(options: {
  attributesByName: Map<string, ExternalAttribute>;
  condition?: Record<string, string>;
}): Record<string, string> | undefined | null {
  const { attributesByName, condition } = options;

  if (!condition) {
    return undefined;
  }

  const cleaned: Record<string, string> = {};

  for (const [attributeName, value] of Object.entries(condition)) {
    const attribute = attributesByName.get(attributeName);

    if (!attribute || !attribute.values.includes(value)) {
      return null;
    }

    cleaned[getExternalAttributeKey(attribute)] = value;
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeAttributeNameList(options: {
  attributeNames: string[];
  attributesByName: Map<string, ExternalAttribute>;
}): string[] | undefined {
  const { attributeNames, attributesByName } = options;
  const cleaned = [
    ...new Set(
      attributeNames
        .map((attributeName) => attributesByName.get(attributeName))
        .filter((attribute): attribute is ExternalAttribute =>
          Boolean(attribute),
        )
        .map((attribute) => getExternalAttributeKey(attribute)),
    ),
  ];

  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeAllowedValues(options: {
  allowedValues?: Record<string, string[]>;
  attributesByName: Map<string, ExternalAttribute>;
}): Record<string, string[]> | undefined {
  const { allowedValues, attributesByName } = options;

  if (!allowedValues) {
    return undefined;
  }

  const cleaned: Record<string, string[]> = {};

  for (const [attributeName, values] of Object.entries(allowedValues)) {
    const attribute = attributesByName.get(attributeName);

    if (!attribute) {
      continue;
    }

    const allowedValueSet = new Set(attribute.values);
    const sanitizedValues = [...new Set(values)].filter((value) =>
      allowedValueSet.has(value),
    );

    if (sanitizedValues.length > 0) {
      cleaned[getExternalAttributeKey(attribute)] = sanitizedValues;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeExcludedValues(options: {
  excludedValues?: Record<string, string[]>;
  attributesByName: Map<string, ExternalAttribute>;
}): Record<string, string[]> | undefined {
  return sanitizeAllowedValues({
    allowedValues: options.excludedValues,
    attributesByName: options.attributesByName,
  });
}

export function sanitizePricingCombinationStrategy(options: {
  externalAttributes: ExternalAttribute[];
  strategy?: PricingCombinationStrategy;
}): PricingCombinationStrategy | undefined {
  const { externalAttributes, strategy } = options;

  if (!strategy?.rules?.length) {
    return undefined;
  }

  const attributesByName = buildAttributeMap(externalAttributes);
  const sanitizedRules: SanitizedPricingCombinationRule[] = [];

  for (const rule of strategy.rules) {
    const when = sanitizeCondition({
      attributesByName,
      condition: rule.when,
    });

    if (when === null) {
      continue;
    }

    const omitAttributes = sanitizeAttributeNameList({
      attributeNames: rule.omitAttributes ?? [],
      attributesByName,
    });

    const requiredAttributes = sanitizeAttributeNameList({
      attributeNames: rule.requiredAttributes ?? [],
      attributesByName,
    });

    const allowedValues = sanitizeAllowedValues({
      allowedValues: rule.allowedValues,
      attributesByName,
    });
    const excludedValues = sanitizeExcludedValues({
      excludedValues: rule.excludedValues,
      attributesByName,
    });

    if (
      !when &&
      !omitAttributes &&
      !requiredAttributes &&
      !allowedValues &&
      !excludedValues
    ) {
      continue;
    }

    sanitizedRules.push({
      when,
      omitAttributes,
      requiredAttributes,
      allowedValues,
      excludedValues,
      reason: rule.reason?.trim() || undefined,
    });
  }

  return sanitizedRules.length > 0 ? { rules: sanitizedRules } : undefined;
}

function doesRuleMatchCurrentSelection(options: {
  currentSelection: Record<string, string>;
  rule: SanitizedPricingCombinationRule;
}): boolean {
  const { currentSelection, rule } = options;

  if (!rule.when || Object.keys(rule.when).length === 0) {
    return true;
  }

  return Object.entries(rule.when).every(
    ([attributeName, value]) => currentSelection[attributeName] === value,
  );
}

function getActiveRules(options: {
  currentSelection: Record<string, string>;
  strategy?: PricingCombinationStrategy;
}): SanitizedPricingCombinationRule[] {
  const { currentSelection, strategy } = options;

  return (strategy?.rules ?? []).filter((rule) =>
    doesRuleMatchCurrentSelection({ currentSelection, rule }),
  );
}

function getAllowedAttributeValues(options: {
  activeRules: SanitizedPricingCombinationRule[];
  attribute: ExternalAttribute;
}): string[] {
  const { activeRules, attribute } = options;
  const attributeKey = getExternalAttributeKey(attribute);

  let allowedSet = new Set(attribute.values);

  for (const rule of activeRules) {
    const restrictedValues =
      rule.allowedValues?.[attributeKey] ??
      rule.allowedValues?.[attribute.name];

    if (!restrictedValues?.length) {
      continue;
    }

    allowedSet = allowedSet.intersection(new Set(restrictedValues));
  }

  for (const rule of activeRules) {
    const excludedValues =
      rule.excludedValues?.[attributeKey] ??
      rule.excludedValues?.[attribute.name];

    if (!excludedValues?.length) {
      continue;
    }

    allowedSet = allowedSet.difference(new Set(excludedValues));
  }

  return attribute.values.filter((value) => allowedSet.has(value));
}

function shouldOmitAttribute(options: {
  activeRules: SanitizedPricingCombinationRule[];
  attributeName: string;
}): boolean {
  const { activeRules, attributeName } = options;
  const isRequired = activeRules.some((rule) =>
    rule.requiredAttributes?.includes(attributeName),
  );

  if (isRequired) {
    return false;
  }

  return activeRules.some((rule) =>
    rule.omitAttributes?.includes(attributeName),
  );
}

export function isConfigurationValidForStrategy(options: {
  configuration: Record<string, string>;
  externalAttributes: ExternalAttribute[];
  fixedSelections: Record<string, string>;
  strategy?: PricingCombinationStrategy;
}): boolean {
  const { configuration, externalAttributes, fixedSelections, strategy } =
    options;

  if (!strategy?.rules?.length) {
    return true;
  }

  const currentSelection = buildSelectionWithAliases({
    selection: {
      ...fixedSelections,
      ...configuration,
    },
    externalAttributes,
  });

  return strategy.rules.every((rule) => {
    if (!doesRuleMatchCurrentSelection({ currentSelection, rule })) {
      return true;
    }

    if (
      rule.requiredAttributes?.some(
        (attributeName) => currentSelection[attributeName] === undefined,
      )
    ) {
      return false;
    }

    if (
      rule.omitAttributes?.some(
        (attributeName) => currentSelection[attributeName] !== undefined,
      )
    ) {
      return false;
    }

    return (
      Object.entries(rule.allowedValues ?? {}).every(
        ([attributeName, allowedValues]) => {
          const currentValue = currentSelection[attributeName];

          if (currentValue === undefined) {
            return true;
          }

          return allowedValues.includes(currentValue);
        },
      ) &&
      Object.entries(rule.excludedValues ?? {}).every(
        ([attributeName, excludedValues]) => {
          const currentValue = currentSelection[attributeName];

          if (currentValue === undefined) {
            return true;
          }

          return !excludedValues.includes(currentValue);
        },
      )
    );
  });
}

export function buildPriceConfigurationInputs(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: Record<string, string>;
  strategy?: PricingCombinationStrategy;
}): PriceConfigurationInput[] {
  const {
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections = {},
    strategy,
  } = options;

  const configuredAttributes = externalAttributes.filter(
    (attribute) =>
      Boolean(
        configurationParams?.[getExternalAttributeKey(attribute)] ||
        configurationParams?.[attribute.name],
      ) ||
      Object.prototype.hasOwnProperty.call(fixedSelections, attribute.name) ||
      Object.prototype.hasOwnProperty.call(
        fixedSelections,
        getExternalAttributeKey(attribute),
      ),
  );

  const sanitizedStrategy = sanitizePricingCombinationStrategy({
    externalAttributes: configuredAttributes,
    strategy,
  });
  const attributeLabelByKey = new Map(
    configuredAttributes.map(
      (attribute) =>
        [
          getExternalAttributeKey(attribute),
          attribute.id && attribute.id !== attribute.name
            ? `${attribute.name} (${attribute.id})`
            : attribute.name,
        ] as const,
    ),
  );

  const pricingAttributes = getVariablePricingAttributes({
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections,
  });

  if (strategy?.rules?.length) {
    // Collect all attribute keys mentioned in 'when' conditions
    const whenAttributeKeys = new Set(
      (sanitizedStrategy?.rules ?? []).flatMap((r) =>
        Object.keys(r.when ?? {}),
      ),
    );
    // Collect all attribute keys mentioned in omitAttributes or excludedValues
    const targetAttributeKeys = new Set([
      ...(sanitizedStrategy?.rules ?? []).flatMap(
        (r) => r.omitAttributes ?? [],
      ),
      ...(sanitizedStrategy?.rules ?? []).flatMap((r) =>
        Object.keys(r.excludedValues ?? {}),
      ),
    ]);
    const pricingAttributeKeyOrder = pricingAttributes.map((a) =>
      getExternalAttributeKey(a),
    );

    console.log("[buildPriceConfigurationInputs] Strategy sanitization", {
      inputRuleCount: strategy.rules.length,
      sanitizedRuleCount: sanitizedStrategy?.rules?.length ?? 0,
      configuredAttributeCount: configuredAttributes.length,
      configuredAttributeKeys: configuredAttributes.map(
        (a) => `${a.name} (${getExternalAttributeKey(a)})`,
      ),
      sanitizedRules: sanitizedStrategy?.rules?.map((rule) => ({
        when: rule.when,
        omitAttributes: rule.omitAttributes,
        excludedValues: rule.excludedValues,
        allowedValues: rule.allowedValues,
        reason: rule.reason,
      })),
      visitOrder: pricingAttributeKeyOrder,
      whenTriggerPositions: [...whenAttributeKeys].map((key) => ({
        key,
        visitIndex: pricingAttributeKeyOrder.indexOf(key),
        isFixed: Object.prototype.hasOwnProperty.call(fixedSelections, key),
      })),
      omitTargetPositions: [...targetAttributeKeys].map((key) => ({
        key,
        visitIndex: pricingAttributeKeyOrder.indexOf(key),
      })),
    });
  }

  if (pricingAttributes.length === 0) {
    return [];
  }

  const inputs: PriceConfigurationInput[] = [];
  const dedupe = new Set<string>();
  let filteredByStrategy = 0;
  const omittedAttributeCounts = new Map<string, number>();
  const zeroAllowedValueCounts = new Map<string, number>();
  const filteredValueDropCounts = new Map<
    string,
    { droppedValueCount: number; visitCount: number }
  >();

  const incrementCounter = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const visit = (index: number, configuration: Record<string, string>) => {
    if (index >= pricingAttributes.length) {
      if (
        !isConfigurationValidForStrategy({
          configuration,
          externalAttributes: configuredAttributes,
          fixedSelections,
          strategy: sanitizedStrategy,
        })
      ) {
        filteredByStrategy++;
        return;
      }

      const key = JSON.stringify(configuration);

      if (dedupe.has(key)) {
        return;
      }

      dedupe.add(key);
      inputs.push({ configuration });
      return;
    }

    const attribute = pricingAttributes[index];
    const attributeKey = getExternalAttributeKey(attribute);
    const currentSelection = buildSelectionWithAliases({
      selection: {
        ...fixedSelections,
        ...configuration,
      },
      externalAttributes: configuredAttributes,
    });
    const activeRules = getActiveRules({
      currentSelection,
      strategy: sanitizedStrategy,
    });

    if (
      shouldOmitAttribute({
        activeRules,
        attributeName: attributeKey,
      })
    ) {
      incrementCounter(omittedAttributeCounts, attributeKey);
      visit(index + 1, configuration);
      return;
    }

    const allowedValues = getAllowedAttributeValues({
      activeRules,
      attribute,
    });
    const droppedValueCount = Math.max(
      attribute.values.length - allowedValues.length,
      0,
    );

    if (droppedValueCount > 0) {
      const current = filteredValueDropCounts.get(attributeKey) ?? {
        droppedValueCount: 0,
        visitCount: 0,
      };
      filteredValueDropCounts.set(attributeKey, {
        droppedValueCount: current.droppedValueCount + droppedValueCount,
        visitCount: current.visitCount + 1,
      });
    }

    if (allowedValues.length === 0) {
      incrementCounter(zeroAllowedValueCounts, attributeKey);
      return;
    }

    for (const value of allowedValues) {
      visit(index + 1, {
        ...configuration,
        [attributeKey]: value,
      });
    }
  };

  visit(0, {});

  if (strategy?.rules?.length) {
    // Post-generation violation detection: check if any generated configurations
    // violate omitAttributes rules (this should never happen)
    const omitRules = (sanitizedStrategy?.rules ?? []).filter(
      (r) => r.omitAttributes?.length && r.when,
    );
    let violationCount = 0;
    let sampleViolation:
      | {
          configuration: Record<string, string>;
          matchedWhen: Record<string, string>;
          presentOmitAttributes: string[];
        }
      | undefined;

    if (omitRules.length > 0) {
      for (const input of inputs) {
        const expandedConfig = buildSelectionWithAliases({
          selection: { ...fixedSelections, ...input.configuration },
          externalAttributes: configuredAttributes,
        });

        for (const rule of omitRules) {
          const whenMatches = Object.entries(rule.when!).every(
            ([k, v]) => expandedConfig[k] === v,
          );

          if (!whenMatches) continue;

          const presentOmitAttributes = (rule.omitAttributes ?? []).filter(
            (attr) => expandedConfig[attr] !== undefined,
          );

          if (presentOmitAttributes.length > 0) {
            violationCount++;
            if (!sampleViolation) {
              sampleViolation = {
                configuration: input.configuration,
                matchedWhen: rule.when!,
                presentOmitAttributes,
              };
            }
          }
        }
      }
    }

    console.log("[buildPriceConfigurationInputs] Generation complete", {
      totalCandidates: inputs.length,
      filteredByStrategy,
      pricingAttributeCount: pricingAttributes.length,
      pricingAttributeKeys: pricingAttributes.map(
        (a) => `${a.name} (${getExternalAttributeKey(a)})`,
      ),
      omittedAttributeCounts: [...omittedAttributeCounts.entries()].map(
        ([attributeKey, count]) => ({
          attributeKey,
          label: attributeLabelByKey.get(attributeKey) ?? attributeKey,
          count,
        }),
      ),
      zeroAllowedValueCounts: [...zeroAllowedValueCounts.entries()].map(
        ([attributeKey, count]) => ({
          attributeKey,
          label: attributeLabelByKey.get(attributeKey) ?? attributeKey,
          count,
        }),
      ),
      filteredValueDropCounts: [...filteredValueDropCounts.entries()].map(
        ([attributeKey, summary]) => ({
          attributeKey,
          label: attributeLabelByKey.get(attributeKey) ?? attributeKey,
          droppedValueCount: summary.droppedValueCount,
          visitCount: summary.visitCount,
        }),
      ),
      omitRuleViolations: violationCount,
      ...(sampleViolation ? { sampleViolation } : {}),
    });
  }

  return inputs;
}

export function getPlannedPricingConfigurationCount(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: Record<string, string>;
  strategy?: PricingCombinationStrategy;
}): number {
  return buildPriceConfigurationInputs(options).length;
}

export function summarizePricingCombinationStrategy(
  strategy?: PricingCombinationStrategy,
): {
  ruleCount: number;
  omittedAttributeCount: number;
  requiredAttributeCount: number;
  constrainedAttributeCount: number;
} {
  const rules = strategy?.rules ?? [];
  const omittedAttributes = new Set<string>();
  const requiredAttributes = new Set<string>();
  const constrainedAttributes = new Set<string>();

  for (const rule of rules) {
    for (const attributeName of rule.omitAttributes ?? []) {
      omittedAttributes.add(attributeName);
    }

    for (const attributeName of rule.requiredAttributes ?? []) {
      requiredAttributes.add(attributeName);
    }

    for (const attributeName of Object.keys(rule.allowedValues ?? {})) {
      constrainedAttributes.add(attributeName);
    }

    for (const attributeName of Object.keys(rule.excludedValues ?? {})) {
      constrainedAttributes.add(attributeName);
    }
  }

  return {
    ruleCount: rules.length,
    omittedAttributeCount: omittedAttributes.size,
    requiredAttributeCount: requiredAttributes.size,
    constrainedAttributeCount: constrainedAttributes.size,
  };
}

/**
 * Converts AI-learned pricing combination strategy rules into persistable
 * exclusion rules. `omitAttributes` and `excludedValues` are copied directly.
 * When `externalAttributes` are provided, `allowedValues` are converted into
 * `excludeValues` by excluding the complement of the allowed value set.
 *
 * `requiredAttributes` on their own are not persistable, but when they are
 * paired with `allowedValues`, the persisted `excludeValues` preserve the
 * requirement because variable pricing attributes are included by default.
 */
export function convertStrategyRulesToExclusionRules(
  rules: PricingCombinationRule[],
  externalAttributes?: ExternalAttribute[],
): ExternalProductPricingExclusionRule[] {
  const converted: ExternalProductPricingExclusionRule[] = [];
  const attributesByName = externalAttributes
    ? buildAttributeMap(externalAttributes)
    : undefined;

  for (const rule of rules) {
    const when = rule.when;
    if (!when || Object.keys(when).length === 0) {
      continue;
    }

    const omitAttributes = rule.omitAttributes?.length
      ? rule.omitAttributes
      : undefined;
    const excludedValuesByAttribute = new Map<string, Set<string>>();

    const addExcludedValues = (attributeName: string, values: string[]) => {
      const resolvedAttribute = attributesByName?.get(attributeName);
      const targetKey = resolvedAttribute
        ? getExternalAttributeKey(resolvedAttribute)
        : attributeName;
      const targetValues =
        excludedValuesByAttribute.get(targetKey) ?? new Set<string>();

      for (const value of values) {
        const trimmedValue = value.trim();

        if (trimmedValue.length === 0) {
          continue;
        }

        targetValues.add(trimmedValue);
      }

      if (targetValues.size > 0) {
        excludedValuesByAttribute.set(targetKey, targetValues);
      }
    };

    for (const [attributeName, values] of Object.entries(
      rule.excludedValues ?? {},
    )) {
      addExcludedValues(attributeName, values);
    }

    for (const [attributeName, values] of Object.entries(
      rule.allowedValues ?? {},
    )) {
      const resolvedAttribute = attributesByName?.get(attributeName);

      if (!resolvedAttribute) {
        continue;
      }

      const allowedValues = [...new Set(values)].filter((value) =>
        resolvedAttribute.values.includes(value),
      );

      if (
        allowedValues.length === 0 ||
        allowedValues.length === resolvedAttribute.values.length
      ) {
        continue;
      }

      const allowedValueSet = new Set(allowedValues);
      const complementValues = resolvedAttribute.values.filter(
        (value) => !allowedValueSet.has(value),
      );

      if (complementValues.length > 0) {
        addExcludedValues(attributeName, complementValues);
      }
    }

    const excludeValues =
      excludedValuesByAttribute.size > 0
        ? Object.fromEntries(
            [...excludedValuesByAttribute.entries()].map(([key, values]) => [
              key,
              [...values],
            ]),
          )
        : undefined;

    if (!omitAttributes && !excludeValues) {
      continue;
    }

    // Wrap single-value `when` entries into arrays for the persisted shape
    const whenArrays: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(when)) {
      whenArrays[key] = [value];
    }

    converted.push({
      when: whenArrays,
      ...(omitAttributes ? { omitAttributes } : {}),
      ...(excludeValues ? { excludeValues } : {}),
      source: "ai",
    });
  }

  return converted;
}

/**
 * Merges AI-derived exclusion rules into an existing rule set.
 * Manual rules (source !== "ai") are always preserved.
 * Old AI rules are replaced only when `newAiRules` is non-empty;
 * an empty array is treated as "nothing learned" and keeps existing AI rules.
 */
export function mergeExclusionRulesWithAiRules(
  existingRules: ExternalProductPricingExclusionRule[],
  newAiRules: ExternalProductPricingExclusionRule[],
): ExternalProductPricingExclusionRule[] {
  if (newAiRules.length === 0) {
    return existingRules;
  }

  const manualRules = existingRules.filter((rule) => rule.source !== "ai");

  return [...manualRules, ...newAiRules];
}
