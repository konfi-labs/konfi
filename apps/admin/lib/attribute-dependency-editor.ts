import type { AttributeDependencyRule, Product } from "@konfi/types";
import {
  getDependencyRuleParentIds,
  normalizeAttributeDependency,
} from "@konfi/utils";
import { sortAttributeIdsByDependencies } from "./external-products/product-attribute-dependencies";

type AttributeDependencies = NonNullable<Product["attributeDependencies"]>;

function toDependencyEntry(
  rules: AttributeDependencyRule[],
): AttributeDependencies[string] | undefined {
  if (rules.length === 0) {
    return undefined;
  }

  return rules.length === 1 ? rules[0] : rules;
}

export function appendAttributeDependencyRule(
  attributeDependencies: Product["attributeDependencies"] | undefined,
  attributeId: string,
  rule: AttributeDependencyRule,
): AttributeDependencies {
  const currentRules = normalizeAttributeDependency(
    attributeDependencies?.[attributeId],
  );
  const nextRules = [...currentRules, rule];

  return {
    ...attributeDependencies,
    [attributeId]: toDependencyEntry(nextRules)!,
  };
}

export function removeAttributeDependencyRule(
  attributeDependencies: Product["attributeDependencies"] | undefined,
  attributeId: string,
  ruleIndex: number,
): AttributeDependencies {
  const currentRules = normalizeAttributeDependency(
    attributeDependencies?.[attributeId],
  );

  if (ruleIndex < 0 || ruleIndex >= currentRules.length) {
    return { ...attributeDependencies };
  }

  const nextRules = currentRules.filter((_, index) => index !== ruleIndex);
  const nextDependencies = {
    ...attributeDependencies,
  };
  const nextEntry = toDependencyEntry(nextRules);

  if (nextEntry) {
    nextDependencies[attributeId] = nextEntry;
  } else {
    delete nextDependencies[attributeId];
  }

  return nextDependencies;
}

export function wouldCreateAttributeDependencyCycle(
  attributeDependencies: Product["attributeDependencies"] | undefined,
  attributeId: string,
  dependsOn: string,
): boolean {
  if (!attributeId || !dependsOn) {
    return false;
  }

  if (attributeId === dependsOn) {
    return true;
  }

  const visited = new Set<string>();
  const queue = [dependsOn];

  while (queue.length > 0) {
    const currentAttributeId = queue.pop();

    if (!currentAttributeId || visited.has(currentAttributeId)) {
      continue;
    }

    if (currentAttributeId === attributeId) {
      return true;
    }

    visited.add(currentAttributeId);

    const rules = normalizeAttributeDependency(
      attributeDependencies?.[currentAttributeId],
    );

    for (const rule of rules) {
      for (const parentAttributeId of getDependencyRuleParentIds(rule)) {
        if (!visited.has(parentAttributeId)) {
          queue.push(parentAttributeId);
        }
      }
    }
  }

  return false;
}

export function getAvailableDependencyParentIds({
  attributeDependencies,
  attributeId,
  availableAttributeIds,
}: {
  attributeDependencies: Product["attributeDependencies"] | undefined;
  attributeId: string;
  availableAttributeIds: string[];
}): string[] {
  if (!attributeId) {
    return [];
  }

  const usedParentIds = new Set(
    normalizeAttributeDependency(attributeDependencies?.[attributeId]).flatMap(
      (rule) => getDependencyRuleParentIds(rule),
    ),
  );

  return availableAttributeIds.filter(
    (candidateAttributeId) =>
      candidateAttributeId !== attributeId &&
      !usedParentIds.has(candidateAttributeId) &&
      !wouldCreateAttributeDependencyCycle(
        attributeDependencies,
        attributeId,
        candidateAttributeId,
      ),
  );
}

export function filterConditionalOptionsByDependencyValues(
  dependencyValues: string[],
  conditionalOptions: Record<string, string[]>,
): Record<string, string[]> {
  if (dependencyValues.length === 0) {
    return { ...conditionalOptions };
  }

  const allowedParentValues = new Set(dependencyValues);

  return Object.fromEntries(
    Object.entries(conditionalOptions).filter(([parentValue]) =>
      allowedParentValues.has(parentValue),
    ),
  );
}

export function sortAttributeIdsWithDependencies(
  attributeIds: string[],
  attributeDependencies: Product["attributeDependencies"] | undefined,
): string[] {
  return sortAttributeIdsByDependencies(attributeIds, attributeDependencies);
}
