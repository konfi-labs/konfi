import "server-only";

import { buildAgentHarnessSystemPrompt } from "@/lib/ai/agent-harness";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import {
  isAttributeMappingReady,
  isExternalAttributeSelectable,
  isIgnoredAttributeMapping,
  isProviderOnlyPricingMappingComplete,
} from "@/lib/external-products/provider-pricing";
import { MODELS } from "@konfi/firebase";
import type {
  AttributeMapping,
  ExternalAttribute,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { Output, ToolLoopAgent, isStepCount } from "ai";
import { z } from "zod";

const MAX_PROMPT_ATTRIBUTE_VALUES = 80;

const generatedAttributeValueSetSchema = z.object({
  attribute: z.string(),
  values: z.array(z.string()),
});

const generatedExactExclusionRuleSchema = z.object({
  when: z.array(generatedAttributeValueSetSchema),
  omitAttributes: z.array(z.string()).optional(),
  excludeValues: z.array(generatedAttributeValueSetSchema).optional(),
  allowValues: z.array(generatedAttributeValueSetSchema).optional(),
  reason: z.string().optional(),
});

const generatedValueOrderSchema = z.object({
  attribute: z.string(),
  values: z.array(z.string()),
});

const generatedComparisonRuleSchema = z.object({
  leftAttribute: z.string(),
  operator: z.enum(["<=", "<", ">=", ">", "=", "!="]),
  rightAttribute: z.string(),
  valueOrders: z.array(generatedValueOrderSchema).optional(),
  reason: z.string().optional(),
});

const generatedPricingExclusionPlanSchema = z.object({
  rules: z.array(generatedExactExclusionRuleSchema).optional(),
  comparisonRules: z.array(generatedComparisonRuleSchema).optional(),
  notes: z.array(z.string()).optional(),
});

export type GeneratedPricingExclusionPlan = z.infer<
  typeof generatedPricingExclusionPlanSchema
>;

export interface PricingExclusionRuleAssistantResult {
  rules: ExternalProductPricingExclusionRule[];
  summary: string;
  warnings: string[];
}

type AssistantAttribute = ExternalAttribute & {
  values: string[];
};

type AttributeIndex = {
  attributesByKey: Map<string, AssistantAttribute>;
  lookup: Map<string, AssistantAttribute[]>;
};

function normalizeLookupText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactText(value: string): string {
  return value
    .replace(/[\r\n|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getOptionLabel(attribute: ExternalAttribute, value: string): string {
  return (
    attribute.options?.find((option) => option.value === value)?.label ?? value
  );
}

function addLookupValue(
  lookup: Map<string, AssistantAttribute[]>,
  key: string | undefined,
  attribute: AssistantAttribute,
) {
  const normalized = key ? normalizeLookupText(key) : "";

  if (!normalized) {
    return;
  }

  lookup.set(normalized, [...(lookup.get(normalized) ?? []), attribute]);
}

function buildAttributeIndex(attributes: AssistantAttribute[]): AttributeIndex {
  const attributesByKey = new Map<string, AssistantAttribute>();
  const lookup = new Map<string, AssistantAttribute[]>();

  for (const attribute of attributes) {
    const key = getExternalAttributeKey(attribute);
    attributesByKey.set(key, attribute);
    addLookupValue(lookup, key, attribute);
    addLookupValue(lookup, attribute.id, attribute);
    addLookupValue(lookup, attribute.name, attribute);
    addLookupValue(lookup, attribute.category, attribute);
  }

  return { attributesByKey, lookup };
}

function buildValueLookup(
  attribute: AssistantAttribute,
): Map<string, string[]> {
  const lookup = new Map<string, string[]>();

  const add = (key: string | undefined, value: string) => {
    const normalized = key ? normalizeLookupText(key) : "";

    if (!normalized) {
      return;
    }

    lookup.set(normalized, [...(lookup.get(normalized) ?? []), value]);
  };

  for (const value of attribute.values) {
    add(value, value);
    add(getOptionLabel(attribute, value), value);
  }

  return lookup;
}

function resolveAttribute(
  index: AttributeIndex,
  rawAttribute: string,
): AssistantAttribute | undefined {
  const direct = index.attributesByKey.get(rawAttribute);

  if (direct) {
    return direct;
  }

  const matches = index.lookup.get(normalizeLookupText(rawAttribute)) ?? [];
  const uniqueMatches = [...new Set(matches)];

  return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

function resolveValue(
  attribute: AssistantAttribute,
  rawValue: string,
): string | undefined {
  if (attribute.values.includes(rawValue)) {
    return rawValue;
  }

  const lookup = buildValueLookup(attribute);
  const matches = lookup.get(normalizeLookupText(rawValue)) ?? [];
  const uniqueMatches = [...new Set(matches)];

  return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

export function getPricingExclusionAssistantAttributes(options: {
  attributeMappings?: AttributeMapping[];
  externalAttributes: ExternalAttribute[];
}): AssistantAttribute[] {
  const { attributeMappings, externalAttributes } = options;
  const mappingByExternalName = new Map(
    (attributeMappings ?? []).map((mapping) => [
      mapping.externalAttributeName,
      mapping,
    ]),
  );

  return externalAttributes.flatMap((attribute) => {
    if (!isExternalAttributeSelectable(attribute)) {
      return [];
    }

    const key = getExternalAttributeKey(attribute);
    const mapping =
      mappingByExternalName.get(key) ??
      mappingByExternalName.get(attribute.name);

    if (
      !mapping ||
      isIgnoredAttributeMapping(mapping) ||
      !isAttributeMappingReady(mapping)
    ) {
      return [];
    }

    const restrictedValues = isProviderOnlyPricingMappingComplete(mapping)
      ? [mapping.fixedExternalValue.trim()]
      : Object.keys(mapping.optionMappings ?? {});
    const restrictedValueSet =
      restrictedValues.length > 0 ? new Set(restrictedValues) : undefined;
    const values = restrictedValueSet
      ? attribute.values.filter((value) => restrictedValueSet.has(value))
      : attribute.values;

    if (values.length === 0) {
      return [];
    }

    return [
      {
        ...attribute,
        options: restrictedValueSet
          ? attribute.options?.filter((option) =>
              restrictedValueSet.has(option.value),
            )
          : attribute.options,
        values,
      },
    ];
  });
}

function normalizeValueSet(options: {
  attributeIndex: AttributeIndex;
  set: z.infer<typeof generatedAttributeValueSetSchema>;
  warnings: string[];
}): readonly [string, string[]] | undefined {
  const { attributeIndex, set, warnings } = options;
  const attribute = resolveAttribute(attributeIndex, set.attribute);

  if (!attribute) {
    warnings.push(`Unknown supplier attribute: ${set.attribute}`);
    return undefined;
  }

  const values = [
    ...new Set(
      set.values
        .map((value) => resolveValue(attribute, value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (values.length === 0) {
    warnings.push(
      `No known values resolved for ${getExternalAttributeKey(attribute)}`,
    );
    return undefined;
  }

  return [getExternalAttributeKey(attribute), values] as const;
}

function mergeExcludedValues(
  target: Record<string, Set<string>>,
  attributeKey: string,
  values: string[],
) {
  const targetValues = target[attributeKey] ?? new Set<string>();

  for (const value of values) {
    targetValues.add(value);
  }

  target[attributeKey] = targetValues;
}

function sortStrings(values: Iterable<string>): string[] {
  return [...values].toSorted();
}

function sortRuleObject(
  object?: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(object ?? {})
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, values.toSorted()]),
  );
}

function normalizeExactRule(options: {
  attributeIndex: AttributeIndex;
  rule: z.infer<typeof generatedExactExclusionRuleSchema>;
  warnings: string[];
}): ExternalProductPricingExclusionRule | undefined {
  const { attributeIndex, rule, warnings } = options;
  const whenEntries = rule.when
    .map((set) => normalizeValueSet({ attributeIndex, set, warnings }))
    .filter(
      (entry): entry is readonly [string, string[]] => entry !== undefined,
    );

  if (whenEntries.length === 0) {
    return undefined;
  }

  const when = Object.fromEntries(whenEntries);
  const conditionAttributeNames = new Set(Object.keys(when));
  const omitAttributes = [
    ...new Set(
      (rule.omitAttributes ?? [])
        .map((attributeName) => resolveAttribute(attributeIndex, attributeName))
        .filter((attribute): attribute is AssistantAttribute =>
          Boolean(attribute),
        )
        .map((attribute) => getExternalAttributeKey(attribute))
        .filter((attributeKey) => !conditionAttributeNames.has(attributeKey)),
    ),
  ];
  const excludedValueSets: Record<string, Set<string>> = {};

  for (const set of rule.excludeValues ?? []) {
    const normalized = normalizeValueSet({ attributeIndex, set, warnings });

    if (!normalized || conditionAttributeNames.has(normalized[0])) {
      continue;
    }

    mergeExcludedValues(excludedValueSets, normalized[0], normalized[1]);
  }

  for (const set of rule.allowValues ?? []) {
    const normalized = normalizeValueSet({ attributeIndex, set, warnings });

    if (!normalized || conditionAttributeNames.has(normalized[0])) {
      continue;
    }

    const attribute = attributeIndex.attributesByKey.get(normalized[0]);
    const allowedValues = new Set(normalized[1]);
    const excludedValues =
      attribute?.values.filter((value) => !allowedValues.has(value)) ?? [];

    if (excludedValues.length > 0) {
      mergeExcludedValues(excludedValueSets, normalized[0], excludedValues);
    }
  }

  const excludeValues = Object.fromEntries(
    Object.entries(excludedValueSets)
      .map(([attributeKey, values]) => [attributeKey, sortStrings(values)])
      .filter(([, values]) => values.length > 0),
  );

  if (omitAttributes.length === 0 && Object.keys(excludeValues).length === 0) {
    return undefined;
  }

  return {
    when,
    ...(omitAttributes.length > 0 ? { omitAttributes } : {}),
    ...(Object.keys(excludeValues).length > 0 ? { excludeValues } : {}),
    source: "manual",
  };
}

function parseFirstNumber(value: string): number | undefined {
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return undefined;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildRankMap(options: {
  attribute: AssistantAttribute;
  attributeIndex: AttributeIndex;
  valueOrders?: z.infer<typeof generatedValueOrderSchema>[];
  warnings: string[];
}): Map<string, number> {
  const { attribute, attributeIndex, valueOrders, warnings } = options;
  const attributeKey = getExternalAttributeKey(attribute);
  const order = valueOrders?.find((candidate) => {
    const orderedAttribute = resolveAttribute(
      attributeIndex,
      candidate.attribute,
    );

    return orderedAttribute
      ? getExternalAttributeKey(orderedAttribute) === attributeKey
      : false;
  });

  if (order) {
    const rankMap = new Map<string, number>();

    order.values.forEach((value, index) => {
      const resolvedValue = resolveValue(attribute, value);

      if (resolvedValue) {
        rankMap.set(resolvedValue, index);
      }
    });

    if (rankMap.size > 0) {
      return rankMap;
    }
  }

  const numericRanks = attribute.values.map((value) => {
    const label = getOptionLabel(attribute, value);
    const rank = parseFirstNumber(`${label} ${value}`);

    return { rank, value };
  });

  if (numericRanks.every((item) => item.rank !== undefined)) {
    return new Map(
      numericRanks.map((item) => [item.value, item.rank as number]),
    );
  }

  warnings.push(
    `Could not infer comparable order for ${attributeKey}; skipped comparison rule for that attribute.`,
  );

  return new Map();
}

function isComparisonAllowed(options: {
  leftRank: number;
  operator: z.infer<typeof generatedComparisonRuleSchema>["operator"];
  rightRank: number;
}): boolean {
  const { leftRank, operator, rightRank } = options;

  switch (operator) {
    case "<=":
      return leftRank <= rightRank;
    case "<":
      return leftRank < rightRank;
    case ">=":
      return leftRank >= rightRank;
    case ">":
      return leftRank > rightRank;
    case "=":
      return leftRank === rightRank;
    case "!=":
      return leftRank !== rightRank;
  }
}

function normalizeComparisonRule(options: {
  attributeIndex: AttributeIndex;
  rule: z.infer<typeof generatedComparisonRuleSchema>;
  warnings: string[];
}): ExternalProductPricingExclusionRule[] {
  const { attributeIndex, rule, warnings } = options;
  const leftAttribute = resolveAttribute(attributeIndex, rule.leftAttribute);
  const rightAttribute = resolveAttribute(attributeIndex, rule.rightAttribute);

  if (!leftAttribute || !rightAttribute) {
    warnings.push(
      `Skipped comparison rule with unknown attributes: ${rule.leftAttribute} ${rule.operator} ${rule.rightAttribute}`,
    );
    return [];
  }

  const leftAttributeKey = getExternalAttributeKey(leftAttribute);
  const rightAttributeKey = getExternalAttributeKey(rightAttribute);

  if (leftAttributeKey === rightAttributeKey) {
    warnings.push(`Skipped self-comparison rule for ${leftAttributeKey}`);
    return [];
  }

  const leftRanks = buildRankMap({
    attribute: leftAttribute,
    attributeIndex,
    valueOrders: rule.valueOrders,
    warnings,
  });
  const rightRanks = buildRankMap({
    attribute: rightAttribute,
    attributeIndex,
    valueOrders: rule.valueOrders,
    warnings,
  });

  if (leftRanks.size === 0 || rightRanks.size === 0) {
    return [];
  }

  return rightAttribute.values.flatMap((rightValue) => {
    const rightRank = rightRanks.get(rightValue);

    if (rightRank === undefined) {
      return [];
    }

    const excludedLeftValues = leftAttribute.values.filter((leftValue) => {
      const leftRank = leftRanks.get(leftValue);

      if (leftRank === undefined) {
        return false;
      }

      return !isComparisonAllowed({
        leftRank,
        operator: rule.operator,
        rightRank,
      });
    });

    if (excludedLeftValues.length === 0) {
      return [];
    }

    return [
      {
        excludeValues: {
          [leftAttributeKey]: excludedLeftValues,
        },
        source: "manual" as const,
        when: {
          [rightAttributeKey]: [rightValue],
        },
      },
    ];
  });
}

function stableRuleKey(rule: ExternalProductPricingExclusionRule): string {
  return JSON.stringify({
    excludeValues: sortRuleObject(rule.excludeValues),
    omitAttributes: sortStrings(rule.omitAttributes ?? []),
    when: sortRuleObject(rule.when),
  });
}

export function normalizeGeneratedPricingExclusionPlan(options: {
  attributes: AssistantAttribute[];
  plan: GeneratedPricingExclusionPlan;
}): PricingExclusionRuleAssistantResult {
  const { attributes, plan } = options;
  const warnings = [...(plan.notes ?? [])];
  const attributeIndex = buildAttributeIndex(attributes);
  const generatedRules = [
    ...(plan.rules ?? [])
      .map((rule) => normalizeExactRule({ attributeIndex, rule, warnings }))
      .filter(
        (rule): rule is ExternalProductPricingExclusionRule =>
          rule !== undefined,
      ),
    ...(plan.comparisonRules ?? []).flatMap((rule) =>
      normalizeComparisonRule({ attributeIndex, rule, warnings }),
    ),
  ];
  const dedupedRules: ExternalProductPricingExclusionRule[] = [];
  const seen = new Set<string>();

  for (const rule of generatedRules) {
    const key = stableRuleKey(rule);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedRules.push(rule);
  }

  return {
    rules: dedupedRules,
    summary:
      dedupedRules.length === 1
        ? "Generated 1 pricing exclusion rule."
        : `Generated ${dedupedRules.length} pricing exclusion rules.`,
    warnings: [...new Set(warnings)],
  };
}

function formatPromptAttribute(attribute: AssistantAttribute, index: number) {
  const key = getExternalAttributeKey(attribute);
  const valueParts = attribute.values
    .slice(0, MAX_PROMPT_ATTRIBUTE_VALUES)
    .map((value) => {
      const label = getOptionLabel(attribute, value);

      return label === value
        ? compactText(value)
        : `${compactText(value)}=${compactText(label)}`;
    });
  const truncatedCount = Math.max(
    attribute.values.length - MAX_PROMPT_ATTRIBUTE_VALUES,
    0,
  );
  const truncatedSuffix = truncatedCount > 0 ? `; +${truncatedCount} more` : "";

  return `A${index + 1} key=${compactText(key)} name=${compactText(attribute.name)} values=${valueParts.join("; ")}${truncatedSuffix}`;
}

function formatExistingRule(
  rule: ExternalProductPricingExclusionRule,
  index: number,
): string {
  const when = Object.entries(rule.when)
    .map(([attributeKey, values]) => `${attributeKey}:${values.join("/")}`)
    .join(",");
  const omit = (rule.omitAttributes ?? []).join("/");
  const exclude = Object.entries(rule.excludeValues ?? {})
    .map(([attributeKey, values]) => `${attributeKey}:${values.join("/")}`)
    .join(",");

  return `R${index + 1} when=${compactText(when)} omit=${compactText(omit)} exclude=${compactText(exclude)}`;
}

export function buildPricingExclusionAssistantPrompt(options: {
  attributes: AssistantAttribute[];
  description: string;
  existingRules?: ExternalProductPricingExclusionRule[];
  productName: string;
}): string {
  const { attributes, description, existingRules, productName } = options;

  return [
    `PRODUCT ${compactText(productName)}`,
    "USER EXCLUSION DESCRIPTION",
    description.trim(),
    "SUPPLIER ATTRIBUTES",
    ...attributes.map(formatPromptAttribute),
    "EXISTING RULES",
    ...(existingRules?.length
      ? existingRules.map(formatExistingRule)
      : ["none"]),
  ].join("\n");
}

async function createPricingExclusionRuleAssistant() {
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_PRO);
  const instructions = buildAgentHarnessSystemPrompt({
    role: "an expert Konfi supplier pricing exclusion rule designer",
    workflow: [
      "Read the user's natural-language description of supplier option exclusions.",
      "Translate it into the smallest set of structured exclusion rules.",
      "Use comparison rules for ordered relationships such as cover paper weight must be lower than or equal to inner paper weight.",
      "Use exact rules for finish/coating/foil dependencies and activation statements.",
    ],
    rules: [
      "Return structured data only through the schema.",
      "Use only supplier attribute keys and option values from the prompt.",
      "Do not invent attributes, option values, or unavailable states.",
      "Prefer fewer broad rules over one rule per full product combination.",
      "For a phrase like attribute A cannot be higher than attribute B, output leftAttribute=A, operator=<=, rightAttribute=B.",
      "For activation language, use allowValues for the attribute values that remain valid under the condition.",
      "For complete exclusion language, use omitAttributes.",
      "For excluding only some values of an attribute, use excludeValues.",
      "If the user statement is ambiguous, omit that part and include a note.",
      "Copy provider option values exactly; use labels only to understand meaning.",
    ],
  });

  return new ToolLoopAgent({
    id: "external-pricing-exclusion-rule-assistant",
    instructions,
    model,
    output: Output.object({ schema: generatedPricingExclusionPlanSchema }),
    stopWhen: isStepCount(1),
    temperature: 0.1,
  });
}

export async function generatePricingExclusionRulesFromDescription(options: {
  attributeMappings?: AttributeMapping[];
  description: string;
  existingRules?: ExternalProductPricingExclusionRule[];
  externalAttributes: ExternalAttribute[];
  productName: string;
}): Promise<PricingExclusionRuleAssistantResult> {
  const {
    attributeMappings,
    description,
    existingRules,
    externalAttributes,
    productName,
  } = options;
  const attributes = getPricingExclusionAssistantAttributes({
    attributeMappings,
    externalAttributes,
  });

  if (attributes.length < 2) {
    return {
      rules: [],
      summary: "Not enough mapped supplier attributes to build exclusions.",
      warnings: ["Map at least two supplier pricing attributes first."],
    };
  }

  const assistant = await createPricingExclusionRuleAssistant();
  const { output } = await assistant.generate({
    prompt: buildPricingExclusionAssistantPrompt({
      attributes,
      description,
      existingRules,
      productName,
    }),
  });

  return normalizeGeneratedPricingExclusionPlan({
    attributes,
    plan: output,
  });
}
