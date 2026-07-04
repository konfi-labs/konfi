import type { Attribute, Product } from "@konfi/types";
import {
  areAllDependencyRulesMet,
  getDependencyRuleParentIds,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "@konfi/utils";

export interface CombinationDiagnostic {
  /** i18n key under matrix.diagnostics.* */
  key: string;
  /** Interpolation params for the translation */
  params: Record<string, string | number>;
}

/**
 * Analyzes why no valid attribute combinations can be generated given the
 * current dependency rules and selected options. Returns machine-readable
 * diagnostics (key + params) that the UI formats through i18n.
 *
 * Only call this when `memoizedCombinations.length === 0` and all
 * calculated attributes have options selected (the "happy path"
 * preconditions are already checked by the caller).
 */
export function diagnoseCombinationFailures(options: {
  attributeDependencies?: Product["attributeDependencies"];
  attributeOptions?: Product["attributeOptions"];
  calculatedAttributeIds: string[];
  attributes: Attribute[];
}): CombinationDiagnostic[] {
  const {
    attributeDependencies,
    attributeOptions,
    calculatedAttributeIds,
    attributes,
  } = options;

  if (!attributeDependencies || !attributeOptions) return [];

  const diagnostics: CombinationDiagnostic[] = [];
  const attrName = (id: string): string =>
    attributes.find((a) => a.id === id)?.name ?? id;
  const attrLabel = (id: string, value: string): string => {
    const attr = attributes.find((a) => a.id === id);
    return attr?.options.find((o) => o.value === value)?.label ?? value;
  };
  const calculatedSet = new Set(calculatedAttributeIds);

  for (const childId of calculatedAttributeIds) {
    const rules = normalizeAttributeDependency(
      attributeDependencies[childId],
    );
    if (rules.length === 0) continue;

    // Collect all parent attribute IDs referenced by rules
    const allParentIds = new Set<string>();
    for (const rule of rules) {
      for (const pid of getDependencyRuleParentIds(rule)) {
        allParentIds.add(pid);
      }
    }

    // 1. Parents not in the calculated matrix attributes
    for (const parentId of allParentIds) {
      const parentExists = attributes.some((a) => a.id === parentId);

      if (!calculatedSet.has(parentId)) {
        diagnostics.push({
          key: parentExists ? "parentNotCalculated" : "parentMissing",
          params: {
            child: attrName(childId),
            parent: attrName(parentId),
          },
        });
      }
    }

    // 2. dependencyValues vs available parent options
    for (const rule of rules) {
      const parentOptions = attributeOptions[rule.dependsOn];

      if (!parentOptions || parentOptions.length === 0) {
        diagnostics.push({
          key: "parentNoOptions",
          params: {
            child: attrName(childId),
            parent: attrName(rule.dependsOn),
          },
        });
        continue;
      }

      if (rule.dependencyValues && rule.dependencyValues.length > 0) {
        const hasMatch = parentOptions.some((v) =>
          rule.dependencyValues!.includes(v),
        );
        if (!hasMatch) {
          const requiredLabels = rule.dependencyValues
            .map((v) => attrLabel(rule.dependsOn, v))
            .join(", ");
          const availableLabels = parentOptions
            .map((v) => attrLabel(rule.dependsOn, v))
            .join(", ");

          diagnostics.push({
            key: "noMatchingParentValues",
            params: {
              child: attrName(childId),
              parent: attrName(rule.dependsOn),
              required: requiredLabels,
              available: availableLabels,
            },
          });
        }
      }
    }

    // 3. Check whether ALL parent values leave zero valid child options
    //    (multi-rule intersection can cause this even if each rule looks fine)
    const childOptions = attributeOptions[childId];
    if (!childOptions || childOptions.length === 0) continue;

    const primaryParentId = rules[0]?.dependsOn;
    if (!primaryParentId) continue;

    const primaryParentOptions = attributeOptions[primaryParentId];
    if (!primaryParentOptions || primaryParentOptions.length === 0) continue;

    let hasAnyValidChildOption = false;

    for (const parentValue of primaryParentOptions) {
      const resolvedValues: Record<string, string> = {
        [primaryParentId]: parentValue,
      };

      if (!areAllDependencyRulesMet(rules, resolvedValues)) {
        continue;
      }

      const disabled = new Set(
        getDisabledOptionsFromRules(rules, childOptions, resolvedValues),
      );
      const validCount = childOptions.filter((o) => !disabled.has(o)).length;

      if (validCount > 0) {
        hasAnyValidChildOption = true;
        break;
      }
    }

    if (!hasAnyValidChildOption) {
      diagnostics.push({
        key: "allChildOptionsDisabled",
        params: {
          child: attrName(childId),
          parent: attrName(primaryParentId),
        },
      });
    }
  }

  // Deduplicate by key + child + parent
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const fingerprint = `${d.key}:${d.params.child}:${d.params.parent}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
