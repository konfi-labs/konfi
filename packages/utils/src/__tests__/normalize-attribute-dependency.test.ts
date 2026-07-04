import { describe, expect, it } from "vitest";
import {
  areAllDependencyRulesMet,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "../getters/normalize-attribute-dependency";
import type { AttributeDependencyRule } from "@konfi/types";

describe("normalizeAttributeDependency", () => {
  it("returns empty array for undefined", () => {
    expect(normalizeAttributeDependency(undefined)).toEqual([]);
  });

  it("wraps a single rule in an array", () => {
    const rule: AttributeDependencyRule = { dependsOn: "paper" };
    expect(normalizeAttributeDependency(rule)).toEqual([rule]);
  });

  it("returns an array as-is", () => {
    const rules: AttributeDependencyRule[] = [
      { dependsOn: "paper" },
      { dependsOn: "coating" },
    ];
    expect(normalizeAttributeDependency(rules)).toBe(rules);
  });
});

describe("areAllDependencyRulesMet", () => {
  it("returns true when single rule is met", () => {
    const rules: AttributeDependencyRule[] = [
      { dependsOn: "paper", dependencyValues: ["mat250", "gloss250"] },
    ];
    expect(areAllDependencyRulesMet(rules, { paper: "mat250" })).toBe(true);
  });

  it("returns false when single rule is not met", () => {
    const rules: AttributeDependencyRule[] = [
      { dependsOn: "paper", dependencyValues: ["mat250", "gloss250"] },
    ];
    expect(areAllDependencyRulesMet(rules, { paper: "mat150" })).toBe(false);
  });

  it("returns false when parent value is missing", () => {
    const rules: AttributeDependencyRule[] = [
      { dependsOn: "paper", dependencyValues: ["mat250"] },
    ];
    expect(areAllDependencyRulesMet(rules, {})).toBe(false);
  });

  it("returns true when dependencyValues is undefined (any value allowed)", () => {
    const rules: AttributeDependencyRule[] = [{ dependsOn: "paper" }];
    expect(areAllDependencyRulesMet(rules, { paper: "anything" })).toBe(true);
  });

  it("requires ALL rules to pass for multi-parent", () => {
    const rules: AttributeDependencyRule[] = [
      { dependsOn: "paper", dependencyValues: ["mat250"] },
      { dependsOn: "coating", dependencyValues: ["none"] },
    ];
    expect(
      areAllDependencyRulesMet(rules, { paper: "mat250", coating: "none" }),
    ).toBe(true);
    expect(
      areAllDependencyRulesMet(rules, { paper: "mat250", coating: "uv" }),
    ).toBe(false);
    expect(
      areAllDependencyRulesMet(rules, { paper: "mat150", coating: "none" }),
    ).toBe(false);
  });

  it("treats scoped rules as inactive when their extra conditions do not match", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        dependencyValues: ["mat250"],
        when: {
          coating: ["uv"],
        },
      },
    ];

    expect(
      areAllDependencyRulesMet(rules, { paper: "mat150", coating: "none" }),
    ).toBe(true);
    expect(
      areAllDependencyRulesMet(rules, { paper: "mat150", coating: "uv" }),
    ).toBe(false);
  });
});

describe("getDisabledOptionsFromRules", () => {
  it("returns empty for no rules", () => {
    expect(getDisabledOptionsFromRules([], ["a", "b"], {})).toEqual([]);
  });

  it("returns disabled options from a single rule with conditionalOptions", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["none"] },
      },
    ];
    expect(
      getDisabledOptionsFromRules(rules, ["none", "mat", "gloss"], {
        paper: "mat150",
      }),
    ).toEqual(["mat", "gloss"]);
  });

  it("returns empty when parent value has no conditional restriction", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["none"] },
      },
    ];
    expect(
      getDisabledOptionsFromRules(rules, ["none", "mat", "gloss"], {
        paper: "mat250",
      }),
    ).toEqual([]);
  });

  it("intersects allowed sets across multiple rules", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["a", "b"] },
      },
      {
        dependsOn: "coating",
        conditionalOptions: { uv: ["b", "c"] },
      },
    ];
    // paper=mat150 allows [a, b], coating=uv allows [b, c]
    // intersection = [b], so disabled = [a, c]
    expect(
      getDisabledOptionsFromRules(rules, ["a", "b", "c"], {
        paper: "mat150",
        coating: "uv",
      }),
    ).toEqual(["a", "c"]);
  });

  it("disables everything when intersected rule sets are disjoint", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["a"] },
      },
      {
        dependsOn: "coating",
        conditionalOptions: { uv: ["b"] },
      },
    ];
    expect(
      getDisabledOptionsFromRules(rules, ["a", "b", "c"], {
        paper: "mat150",
        coating: "uv",
      }),
    ).toEqual(["a", "b", "c"]);
  });

  it("handles duplicate values in allowed lists and skips empty allowed lists", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["a", "a", "b"] },
      },
      {
        dependsOn: "coating",
        conditionalOptions: { uv: [] },
      },
    ];
    expect(
      getDisabledOptionsFromRules(rules, ["a", "b", "c"], {
        paper: "mat150",
        coating: "uv",
      }),
    ).toEqual(["c"]);
  });

  it("ignores scoped option restrictions when their extra conditions do not match", () => {
    const rules: AttributeDependencyRule[] = [
      {
        dependsOn: "paper",
        conditionalOptions: { mat150: ["none"] },
        when: {
          coating: ["uv"],
        },
      },
    ];

    expect(
      getDisabledOptionsFromRules(rules, ["none", "mat", "gloss"], {
        paper: "mat150",
        coating: "none",
      }),
    ).toEqual([]);
    expect(
      getDisabledOptionsFromRules(rules, ["none", "mat", "gloss"], {
        paper: "mat150",
        coating: "uv",
      }),
    ).toEqual(["mat", "gloss"]);
  });
});
