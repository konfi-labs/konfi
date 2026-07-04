import type { Product } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  appendAttributeDependencyRule,
  filterConditionalOptionsByDependencyValues,
  getAvailableDependencyParentIds,
  removeAttributeDependencyRule,
  sortAttributeIdsWithDependencies,
  wouldCreateAttributeDependencyCycle,
} from "@/lib/attribute-dependency-editor";

describe("appendAttributeDependencyRule", () => {
  it("converts a single dependency into a multi-rule array for the same child", () => {
    const result = appendAttributeDependencyRule(
      {
        foil: {
          dependsOn: "paper",
          dependencyValues: ["mat250"],
        },
      },
      "foil",
      {
        dependsOn: "coating",
        dependencyValues: ["uv"],
      },
    );

    expect(result.foil).toEqual([
      {
        dependsOn: "paper",
        dependencyValues: ["mat250"],
      },
      {
        dependsOn: "coating",
        dependencyValues: ["uv"],
      },
    ]);
  });
});

describe("removeAttributeDependencyRule", () => {
  it("keeps the remaining rule as a single object when one rule is removed", () => {
    const result = removeAttributeDependencyRule(
      {
        foil: [
          {
            dependsOn: "paper",
            dependencyValues: ["mat250"],
          },
          {
            dependsOn: "coating",
            dependencyValues: ["uv"],
          },
        ],
      },
      "foil",
      0,
    );

    expect(result.foil).toEqual({
      dependsOn: "coating",
      dependencyValues: ["uv"],
    });
  });
});

describe("getAvailableDependencyParentIds", () => {
  it("allows additional unused parents for an already dependent attribute", () => {
    expect(
      getAvailableDependencyParentIds({
        attributeDependencies: {
          foil: {
            dependsOn: "paper",
            dependencyValues: ["mat250"],
          },
        },
        attributeId: "foil",
        availableAttributeIds: ["paper", "coating", "foil"],
      }),
    ).toEqual(["coating"]);
  });

  it("filters out parents that would create a dependency cycle", () => {
    expect(
      getAvailableDependencyParentIds({
        attributeDependencies: {
          coating: {
            dependsOn: "foil",
            dependencyValues: ["mat"],
          },
        },
        attributeId: "foil",
        availableAttributeIds: ["paper", "coating", "foil"],
      }),
    ).toEqual(["paper"]);
  });
});

describe("filterConditionalOptionsByDependencyValues", () => {
  it("keeps only conditional options for the selected dependency values", () => {
    expect(
      filterConditionalOptionsByDependencyValues(["mat130", "mat300"], {
        mat130: ["bok-a"],
        mat300: ["bok-b"],
        offset: ["bok-c"],
      }),
    ).toEqual({
      mat130: ["bok-a"],
      mat300: ["bok-b"],
    });
  });

  it("keeps all conditional options when dependency values are empty", () => {
    expect(
      filterConditionalOptionsByDependencyValues([], {
        mat130: ["bok-a"],
        mat300: ["bok-b"],
      }),
    ).toEqual({
      mat130: ["bok-a"],
      mat300: ["bok-b"],
    });
  });
});

describe("wouldCreateAttributeDependencyCycle", () => {
  it("detects indirect cycles through existing dependency chains", () => {
    expect(
      wouldCreateAttributeDependencyCycle(
        {
          coating: {
            dependsOn: "paper",
          },
          foil: {
            dependsOn: "coating",
          },
        },
        "paper",
        "foil",
      ),
    ).toBe(true);
  });
});

describe("sortAttributeIdsWithDependencies", () => {
  it("keeps parent attributes before a multi-parent child", () => {
    const attributeDependencies: Product["attributeDependencies"] = {
      foil: [
        {
          dependsOn: "paper",
          dependencyValues: ["mat250"],
        },
        {
          dependsOn: "coating",
          dependencyValues: ["uv"],
        },
      ],
    };

    expect(
      sortAttributeIdsWithDependencies(
        ["foil", "paper", "coating"],
        attributeDependencies,
      ),
    ).toEqual(["paper", "coating", "foil"]);
  });
});
