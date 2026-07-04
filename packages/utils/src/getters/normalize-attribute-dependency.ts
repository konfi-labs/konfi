import type { AttributeDependencyRule } from "@konfi/types";

/**
 * Normalizes an attribute dependency entry to always return an array of rules.
 * Handles both the legacy single-rule format and the new multi-rule array format.
 */
export function normalizeAttributeDependency(
  entry: AttributeDependencyRule | AttributeDependencyRule[] | undefined,
): AttributeDependencyRule[] {
  if (!entry) {
    return [];
  }

  return Array.isArray(entry) ? entry : [entry];
}

type RuleApplicability = "active" | "inactive" | "unknown";

function getRuleApplicability(
  rule: AttributeDependencyRule,
  resolvedValues: Record<string, string>,
): RuleApplicability {
  const whenEntries = Object.entries(rule.when ?? {});

  if (whenEntries.length === 0) {
    return "active";
  }

  for (const [attributeId, allowedValues] of whenEntries) {
    const selectedValue = resolvedValues[attributeId];

    if (selectedValue === undefined) {
      return "unknown";
    }

    if (allowedValues.length > 0 && !allowedValues.includes(selectedValue)) {
      return "inactive";
    }
  }

  return "active";
}

export function getDependencyRuleParentIds(
  rule: AttributeDependencyRule,
): string[] {
  return [...new Set([rule.dependsOn, ...Object.keys(rule.when ?? {})])];
}

/**
 * Checks whether all dependency rules for a given attribute are satisfied.
 * Returns `true` when the attribute should be visible/included.
 */
export function areAllDependencyRulesMet(
  rules: AttributeDependencyRule[],
  resolvedValues: Record<string, string>,
): boolean {
  return rules.every((rule) => {
    const applicability = getRuleApplicability(rule, resolvedValues);

    if (applicability === "inactive") {
      return true;
    }

    if (applicability === "unknown") {
      return false;
    }

    const parentValue = resolvedValues[rule.dependsOn];

    if (parentValue === undefined) {
      return false;
    }

    if (
      rule.dependencyValues &&
      rule.dependencyValues.length > 0 &&
      !rule.dependencyValues.includes(parentValue)
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Collects disabled option values for a child attribute across all its
 * dependency rules.  An option is disabled when ANY rule restricts it
 * (i.e. the allowed sets are intersected).
 */
export function getDisabledOptionsFromRules(
  rules: AttributeDependencyRule[],
  allOptionValues: string[],
  resolvedValues: Record<string, string>,
): string[] {
  let currentAllowed: Set<string> | undefined;

  for (const rule of rules) {
    if (getRuleApplicability(rule, resolvedValues) !== "active") {
      continue;
    }

    const parentValue = resolvedValues[rule.dependsOn];

    if (!parentValue || !rule.conditionalOptions) {
      continue;
    }

    const allowedForRule = rule.conditionalOptions[parentValue];

    if (!allowedForRule || allowedForRule.length === 0) {
      continue;
    }

    const allowedSet = new Set(allowedForRule);

    // Intersect: keep only options allowed by ALL rules
    currentAllowed =
      currentAllowed === undefined
        ? allowedSet
        : currentAllowed.intersection(allowedSet);
  }

  if (currentAllowed === undefined) {
    return [];
  }

  return allOptionValues.filter((value) => !currentAllowed.has(value));
}
