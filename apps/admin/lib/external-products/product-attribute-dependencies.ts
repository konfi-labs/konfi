import type {
  Attribute,
  AttributeDependencyRule,
  AttributeMapping,
  ExternalAttribute,
  ExternalProductPricingExclusionRule,
  Product,
} from "@konfi/types";
import { getPersistedManualPricingExclusionRules } from "./pricing-combination-planner";
import {
  getSyntheticEmptyOptionMappingValue,
  isSyntheticEmptyBranchExternalOptionValue,
  isSyntheticEmptyExternalOptionValue,
} from "./option-mapping-utils";
import { findExternalAttributeByKey } from "./external-attribute-key";
import { getDependencyRuleParentIds } from "@konfi/utils";

const NEVER_MATCH_DEPENDENCY_VALUE = "__never__";

type InternalAttributeMap = Map<string, Attribute & { id: string; }>;

type ResolveMappedInternalOptionValueOptions = {
  externalAttribute?: ExternalAttribute;
  externalValue?: string;
  internalAttribute?: Attribute;
  mapping?: AttributeMapping;
};

type CollectMappedAttributeOptionsOptions = {
  externalAttribute?: ExternalAttribute;
  internalAttribute?: Attribute;
  mapping: AttributeMapping;
};

type BuildProductAttributeDependenciesOptions = {
  attributeMappings: AttributeMapping[];
  externalAttributes: ExternalAttribute[];
  internalAttributesById: InternalAttributeMap;
  pricingExclusionRules?: ExternalProductPricingExclusionRule[];
  productAttributeOptions: Record<string, string[]>;
};

type DependencyAccumulator = {
  dependsOn: string;
  excludedValuesByParent: Map<string, Set<string>>;
  omittedParentValues: Set<string>;
  when: Record<string, string[]>;
};

type AttributeDependencyEntry = NonNullable<
  Product["attributeDependencies"]
>[string];

type ResolvedParentCondition = {
  attributeId: string;
  values: string[];
};

function normalizeToken(value?: string): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-") ?? ""
  );
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function findInternalAttributeOptionValue(
  internalAttribute: Attribute | undefined,
  candidateValue?: string,
): string | undefined {
  if (!internalAttribute || !candidateValue) {
    return undefined;
  }

  const exactMatch = internalAttribute.options?.find(
    (option) => option.value === candidateValue,
  );

  if (exactMatch) {
    return exactMatch.value;
  }

  const normalizedCandidate = normalizeToken(candidateValue);

  return internalAttribute.options?.find((option) => {
    const normalizedOptionValue = normalizeToken(option.value);
    const normalizedOptionLabel = normalizeToken(option.label);

    return (
      normalizedOptionValue === normalizedCandidate ||
      normalizedOptionLabel === normalizedCandidate
    );
  })?.value;
}

function normalizeDependencyRules(
  entry: AttributeDependencyEntry | undefined,
): AttributeDependencyRule[] {
  if (!entry) {
    return [];
  }

  return Array.isArray(entry) ? entry : [entry];
}

function hasWhenConditions(
  rule: Pick<AttributeDependencyRule, "when">,
): boolean {
  return Boolean(rule.when && Object.keys(rule.when).length > 0);
}

function buildWhenConditions(
  conditions: ResolvedParentCondition[],
): Record<string, string[]> {
  return Object.fromEntries(
    conditions
      .map(
        (condition) =>
          [condition.attributeId, uniqueSorted(condition.values)] as const,
      )
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function serializeWhenConditions(when: Record<string, string[]>): string {
  return JSON.stringify(
    Object.entries(when)
      .map(
        ([attributeId, values]) => [attributeId, uniqueSorted(values)] as const,
      )
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

export function sortAttributeIdsByDependencies(
  attributeIds: string[],
  attributeDependencies?: Product["attributeDependencies"],
): string[] {
  if (!attributeDependencies || attributeIds.length <= 1) {
    return attributeIds;
  }

  const uniqueAttributeIds = [...new Set(attributeIds)];
  const attributeIdSet = new Set(uniqueAttributeIds);
  const originalOrder = new Map(
    uniqueAttributeIds.map(
      (attributeId, index) => [attributeId, index] as const,
    ),
  );
  const childrenByParent = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>(
    uniqueAttributeIds.map((attributeId) => [attributeId, 0]),
  );

  for (const childAttributeId of uniqueAttributeIds) {
    const rules = normalizeDependencyRules(
      attributeDependencies[childAttributeId],
    );

    for (const rule of rules) {
      for (const parentAttributeId of getDependencyRuleParentIds(rule)) {
        if (
          !parentAttributeId ||
          parentAttributeId === childAttributeId ||
          !attributeIdSet.has(parentAttributeId)
        ) {
          continue;
        }

        const existingChildren = childrenByParent.get(parentAttributeId);

        if (existingChildren?.has(childAttributeId)) {
          continue;
        }

        if (existingChildren) {
          existingChildren.add(childAttributeId);
        } else {
          childrenByParent.set(parentAttributeId, new Set([childAttributeId]));
        }

        inDegree.set(
          childAttributeId,
          (inDegree.get(childAttributeId) ?? 0) + 1,
        );
      }
    }
  }

  let readyQueue = uniqueAttributeIds
    .filter((attributeId) => (inDegree.get(attributeId) ?? 0) === 0)
    .toSorted(
      (left, right) =>
        (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0),
    );
  const orderedAttributeIds: string[] = [];

  while (readyQueue.length > 0) {
    const currentAttributeId = readyQueue.shift();

    if (!currentAttributeId) {
      continue;
    }

    orderedAttributeIds.push(currentAttributeId);

    for (const childAttributeId of childrenByParent.get(currentAttributeId) ??
      []) {
      const nextInDegree = (inDegree.get(childAttributeId) ?? 0) - 1;
      inDegree.set(childAttributeId, nextInDegree);

      if (nextInDegree === 0) {
        readyQueue.push(childAttributeId);
        readyQueue = readyQueue.toSorted(
          (left, right) =>
            (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0),
        );
      }
    }
  }

  if (orderedAttributeIds.length === uniqueAttributeIds.length) {
    return orderedAttributeIds;
  }

  const remainingAttributeIds = uniqueAttributeIds.filter(
    (attributeId) => !orderedAttributeIds.includes(attributeId),
  );

  return [...orderedAttributeIds, ...remainingAttributeIds];
}

function isNeverMatchDependencyRule(rule: AttributeDependencyRule): boolean {
  return (
    rule.dependencyValues?.length === 1 &&
    rule.dependencyValues[0] === NEVER_MATCH_DEPENDENCY_VALUE
  );
}

export function collectImpossibleDependentAttributeIds(options: {
  attributeIds: string[];
  attributeDependencies?: Product["attributeDependencies"];
}): string[] {
  const { attributeDependencies, attributeIds } = options;

  if (!attributeDependencies || attributeIds.length === 0) {
    return [];
  }

  const impossibleAttributeIds = new Set<string>();
  let discoveredNewImpossibleAttribute = true;

  while (discoveredNewImpossibleAttribute) {
    discoveredNewImpossibleAttribute = false;

    for (const attributeId of attributeIds) {
      if (impossibleAttributeIds.has(attributeId)) {
        continue;
      }

      const rules = normalizeDependencyRules(
        attributeDependencies[attributeId],
      );

      if (
        rules.some(
          (rule) =>
            !hasWhenConditions(rule) &&
            (isNeverMatchDependencyRule(rule) ||
              getDependencyRuleParentIds(rule).some((parentAttributeId) =>
                impossibleAttributeIds.has(parentAttributeId),
              )),
        )
      ) {
        impossibleAttributeIds.add(attributeId);
        discoveredNewImpossibleAttribute = true;
      }
    }
  }

  return [...impossibleAttributeIds];
}

export function resolveMappedInternalOptionValue({
  externalAttribute,
  externalValue,
  internalAttribute,
  mapping,
}: ResolveMappedInternalOptionValueOptions): string | undefined {
  if (!internalAttribute) {
    return undefined;
  }

  if (!externalValue) {
    return getSyntheticEmptyOptionMappingValue(mapping);
  }

  if (isSyntheticEmptyExternalOptionValue(externalValue)) {
    return getSyntheticEmptyOptionMappingValue(mapping);
  }

  const explicitMapping = mapping?.optionMappings?.[externalValue];

  if (explicitMapping) {
    const resolvedExplicitMapping = findInternalAttributeOptionValue(
      internalAttribute,
      explicitMapping,
    );

    if (resolvedExplicitMapping) {
      return resolvedExplicitMapping;
    }
  }

  if (isSyntheticEmptyBranchExternalOptionValue(externalValue)) {
    return getSyntheticEmptyOptionMappingValue(mapping);
  }

  const normalizedCandidates = new Set([normalizeToken(externalValue)]);
  const externalOption = externalAttribute?.options?.find(
    (option) => option.value === externalValue,
  );

  if (externalOption?.label) {
    normalizedCandidates.add(normalizeToken(externalOption.label));
  }

  if (explicitMapping) {
    normalizedCandidates.add(normalizeToken(explicitMapping));
  }

  return internalAttribute.options?.find((option) => {
    const normalizedOptionValue = normalizeToken(option.value);
    const normalizedOptionLabel = normalizeToken(option.label);

    return (
      normalizedCandidates.has(normalizedOptionValue) ||
      normalizedCandidates.has(normalizedOptionLabel)
    );
  })?.value;
}

export function collectMappedAttributeOptions({
  externalAttribute,
  internalAttribute,
  mapping,
}: CollectMappedAttributeOptionsOptions): string[] {
  if (!internalAttribute?.options?.length) {
    return [];
  }

  const candidateExternalValues = new Set<string>();

  for (const externalValue of externalAttribute?.values ?? []) {
    candidateExternalValues.add(externalValue);
  }

  for (const option of externalAttribute?.options ?? []) {
    candidateExternalValues.add(option.value);
  }

  for (const externalValue of Object.keys(mapping.optionMappings ?? {})) {
    candidateExternalValues.add(externalValue);
  }

  // When an attribute exists in the mapping but has no external values,
  // external options, and no option mappings, we cannot determine which
  // internal options are valid. Return empty so the caller can decide how to
  // handle it (e.g. skip the attribute or warn the user).
  if (candidateExternalValues.size === 0) {
    return [];
  }

  const resolvedOptions = new Set<string>();

  for (const externalValue of candidateExternalValues) {
    const resolvedValue = resolveMappedInternalOptionValue({
      externalAttribute,
      externalValue,
      internalAttribute,
      mapping,
    });

    if (resolvedValue) {
      resolvedOptions.add(resolvedValue);
    }
  }

  return [...resolvedOptions];
}

export function buildProductAttributeDependenciesFromExternalPricing({
  attributeMappings,
  externalAttributes,
  internalAttributesById,
  pricingExclusionRules,
  productAttributeOptions,
}: BuildProductAttributeDependenciesOptions): NonNullable<
  Product["attributeDependencies"]
> {
  const manualPricingExclusionRules = getPersistedManualPricingExclusionRules(
    pricingExclusionRules,
  );

  if (!manualPricingExclusionRules.length) {
    return {};
  }

  const eligibleMappings = attributeMappings.filter(
    (mapping) =>
      !mapping.ignored &&
      mapping.internalAttributeId &&
      mapping.verified !== false,
  );

  if (eligibleMappings.length === 0) {
    return {};
  }

  const externalAttributesByKey = new Map<string, ExternalAttribute>();

  for (const attribute of externalAttributes) {
    externalAttributesByKey.set(attribute.id || attribute.name, attribute);

    if (attribute.id && !externalAttributesByKey.has(attribute.name)) {
      externalAttributesByKey.set(attribute.name, attribute);
    }
  }

  const mappingByExternalName = new Map<string, AttributeMapping>();

  for (const mapping of eligibleMappings) {
    mappingByExternalName.set(mapping.externalAttributeName, mapping);

    const externalAttribute = findExternalAttributeByKey(
      externalAttributes,
      mapping.externalAttributeName,
    );

    if (!externalAttribute) {
      continue;
    }

    mappingByExternalName.set(
      externalAttribute.id || externalAttribute.name,
      mapping,
    );
    mappingByExternalName.set(externalAttribute.name, mapping);
  }

  // Track dependencies per child per parent:
  // Map<childAttributeId, Map<parentAttributeId, DependencyAccumulator>>
  const dependenciesByChild = new Map<
    string,
    Map<string, DependencyAccumulator>
  >();

  const resolveInternalValues = (
    attributeName: string,
    externalValues: string[],
  ): { attributeId?: string; values: string[]; } => {
    const mapping = mappingByExternalName.get(attributeName);
    const attributeId = mapping?.internalAttributeId;

    if (!attributeId) {
      return { values: [] };
    }

    const internalAttribute = internalAttributesById.get(attributeId);
    const externalAttribute = externalAttributesByKey.get(attributeName);
    const allowedValues = new Set(productAttributeOptions[attributeId] ?? []);

    const resolvedValues = uniqueSorted(
      externalValues
        .map((externalValue) =>
          resolveMappedInternalOptionValue({
            externalAttribute,
            externalValue,
            internalAttribute,
            mapping,
          }),
        )
        .filter((value): value is string => Boolean(value))
        .filter((value) => allowedValues.has(value)),
    );

    return { attributeId, values: resolvedValues };
  };

  const ensureDependency = (
    childAttributeId: string,
    parentAttributeId: string,
    when: Record<string, string[]>,
  ): DependencyAccumulator => {
    let parentMap = dependenciesByChild.get(childAttributeId);

    if (!parentMap) {
      parentMap = new Map<string, DependencyAccumulator>();
      dependenciesByChild.set(childAttributeId, parentMap);
    }

    const dependencyKey = `${parentAttributeId}::${serializeWhenConditions(when)}`;
    const existing = parentMap.get(dependencyKey);

    if (existing) {
      return existing;
    }

    const created: DependencyAccumulator = {
      dependsOn: parentAttributeId,
      excludedValuesByParent: new Map<string, Set<string>>(),
      omittedParentValues: new Set<string>(),
      when,
    };

    parentMap.set(dependencyKey, created);

    return created;
  };

  for (const rule of manualPricingExclusionRules) {
    const whenEntries = Object.entries(rule.when ?? {}).filter(
      ([, values]) => Array.isArray(values) && values.length > 0,
    );

    if (whenEntries.length === 0) {
      continue;
    }

    const resolvedParentConditions: ResolvedParentCondition[] = [];
    let hasInvalidParentCondition = false;

    for (const [
      parentExternalAttributeName,
      parentExternalValues,
    ] of whenEntries) {
      const { attributeId, values } = resolveInternalValues(
        parentExternalAttributeName,
        parentExternalValues,
      );

      if (!attributeId || values.length === 0) {
        hasInvalidParentCondition = true;
        break;
      }

      resolvedParentConditions.push({
        attributeId,
        values,
      });
    }

    if (hasInvalidParentCondition || resolvedParentConditions.length === 0) {
      continue;
    }

    for (const omittedExternalAttributeName of rule.omitAttributes ?? []) {
      const { attributeId: childAttributeId } = resolveInternalValues(
        omittedExternalAttributeName,
        [],
      );
      const childMapping = mappingByExternalName.get(
        omittedExternalAttributeName,
      );

      if (!childAttributeId) {
        continue;
      }

      const applicableParentConditions = resolvedParentConditions.filter(
        (condition) => condition.attributeId !== childAttributeId,
      );

      if (applicableParentConditions.length === 0) {
        continue;
      }

      const [primaryParentCondition, ...additionalParentConditions] =
        applicableParentConditions;
      const dependency = ensureDependency(
        childAttributeId,
        primaryParentCondition.attributeId,
        buildWhenConditions(additionalParentConditions),
      );
      const childOptions = uniqueSorted(
        productAttributeOptions[childAttributeId] ?? [],
      );
      const syntheticEmptyValue =
        getSyntheticEmptyOptionMappingValue(childMapping);

      if (syntheticEmptyValue && childOptions.includes(syntheticEmptyValue)) {
        const excludedOptionValues = childOptions.filter(
          (value) => value !== syntheticEmptyValue,
        );

        for (const parentValue of primaryParentCondition.values) {
          const excludedValues =
            dependency.excludedValuesByParent.get(parentValue) ??
            new Set<string>();

          excludedOptionValues.forEach((value) => excludedValues.add(value));
          dependency.excludedValuesByParent.set(parentValue, excludedValues);
        }

        continue;
      }

      primaryParentCondition.values.forEach((value) =>
        dependency.omittedParentValues.add(value),
      );
    }

    for (const [
      excludedExternalAttributeName,
      excludedExternalValues,
    ] of Object.entries(rule.excludeValues ?? {})) {
      const { attributeId: childAttributeId, values: childInternalValues } =
        resolveInternalValues(
          excludedExternalAttributeName,
          excludedExternalValues,
        );

      if (!childAttributeId || childInternalValues.length === 0) {
        continue;
      }

      const applicableParentConditions = resolvedParentConditions.filter(
        (condition) => condition.attributeId !== childAttributeId,
      );

      if (applicableParentConditions.length === 0) {
        continue;
      }

      const [primaryParentCondition, ...additionalParentConditions] =
        applicableParentConditions;
      const dependency = ensureDependency(
        childAttributeId,
        primaryParentCondition.attributeId,
        buildWhenConditions(additionalParentConditions),
      );

      for (const parentValue of primaryParentCondition.values) {
        const excludedValues =
          dependency.excludedValuesByParent.get(parentValue) ??
          new Set<string>();

        childInternalValues.forEach((value) => excludedValues.add(value));
        dependency.excludedValuesByParent.set(parentValue, excludedValues);
      }
    }
  }

  const result: NonNullable<Product["attributeDependencies"]> = {};

  for (const [childAttributeId, parentMap] of dependenciesByChild.entries()) {
    const rules: AttributeDependencyRule[] = [];

    for (const [, dependency] of parentMap.entries()) {
      const parentOptions = uniqueSorted(
        productAttributeOptions[dependency.dependsOn] ?? [],
      );
      const attributeOptions = uniqueSorted(
        productAttributeOptions[childAttributeId] ?? [],
      );

      if (parentOptions.length === 0 || attributeOptions.length === 0) {
        continue;
      }

      const omittedParentValues = new Set(dependency.omittedParentValues);
      const conditionalOptions: Record<string, string[]> = {};

      for (const [
        parentValue,
        excludedValues,
      ] of dependency.excludedValuesByParent.entries()) {
        if (omittedParentValues.has(parentValue)) {
          continue;
        }

        const allowedOptions = attributeOptions.filter(
          (value) => !excludedValues.has(value),
        );

        if (allowedOptions.length === 0) {
          omittedParentValues.add(parentValue);
          continue;
        }

        if (allowedOptions.length < attributeOptions.length) {
          conditionalOptions[parentValue] = allowedOptions;
        }
      }

      const dependencyValues = parentOptions.filter(
        (value) => !omittedParentValues.has(value),
      );

      if (
        omittedParentValues.size === 0 &&
        Object.keys(conditionalOptions).length === 0
      ) {
        continue;
      }

      const rule: AttributeDependencyRule = {
        dependsOn: dependency.dependsOn,
        ...(hasWhenConditions(dependency) ? { when: dependency.when } : {}),
        ...(omittedParentValues.size > 0
          ? {
            dependencyValues:
              dependencyValues.length > 0
                ? dependencyValues
                : [NEVER_MATCH_DEPENDENCY_VALUE],
          }
          : {}),
        ...(Object.keys(conditionalOptions).length > 0
          ? { conditionalOptions }
          : {}),
      };

      rules.push(rule);
    }

    if (rules.length === 1) {
      result[childAttributeId] = rules[0];
    } else if (rules.length > 1) {
      result[childAttributeId] = rules;
    }
  }

  return result;
}
