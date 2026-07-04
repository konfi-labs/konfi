import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import {
  buildManualPricingCombinationStrategy,
  buildPriceConfigurationInputs,
  convertStrategyRulesToExclusionRules,
  getPlannedPricingConfigurationCount,
  isConfigurationValidForStrategy,
  mergeExclusionRulesWithAiRules,
} from "./pricing-combination-planner";

describe("pricing combination planner", () => {
  const baseAttributes: ExternalAttribute[] = [
    {
      id: "paperFormat",
      name: "Format",
      values: ["a1", "a3"],
      affectsPricing: true,
    },
    {
      id: "paper",
      name: "Papier",
      values: ["matt", "gloss"],
      affectsPricing: true,
    },
    {
      id: "foil",
      name: "Folia",
      values: ["matt-front", "gloss-front"],
      affectsPricing: true,
    },
  ];

  it("can omit an attribute for some combinations and require it for others", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: baseAttributes,
      configurationParams: {
        paperFormat: "paperFormat",
        paper: "paper",
        foil: "foil",
      },
      strategy: {
        rules: [
          {
            when: { Format: "a1" },
            omitAttributes: ["Folia"],
          },
          {
            when: { Format: "a3" },
            requiredAttributes: ["Folia"],
            allowedValues: {
              Folia: ["matt-front"],
            },
          },
        ],
      },
    });

    expect(inputs).toEqual([
      { configuration: { paperFormat: "a1", paper: "matt" } },
      { configuration: { paperFormat: "a1", paper: "gloss" } },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          foil: "matt-front",
        },
      },
    ]);
  });

  it("intersects allowedValues and subtracts excludedValues across multiple rules", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: [
        {
          id: "paperFormat",
          name: "Format",
          values: ["a1", "a2", "a3", "a4"],
          affectsPricing: true,
        },
      ],
      configurationParams: {
        paperFormat: "paperFormat",
      },
      strategy: {
        rules: [
          {
            allowedValues: { Format: ["a1", "a2", "a3"] },
          },
          {
            allowedValues: { Format: ["a2", "a3", "a4"] },
          },
          {
            excludedValues: { Format: ["a3"] },
          },
        ],
      },
    });

    // allowed: {a1..a3} ∩ {a2..a4} = {a2, a3}, minus excluded {a3} = {a2}
    expect(inputs).toEqual([{ configuration: { paperFormat: "a2" } }]);
  });

  it("drops branches where combined rules allow no values", () => {
    const count = getPlannedPricingConfigurationCount({
      externalAttributes: baseAttributes,
      configurationParams: {
        paperFormat: "paperFormat",
        paper: "paper",
        foil: "foil",
      },
      strategy: {
        rules: [
          {
            when: { Format: "a1" },
            allowedValues: { Folia: ["matt-front"] },
          },
          {
            when: { Format: "a1" },
            excludedValues: { Folia: ["matt-front"] },
          },
        ],
      },
    });

    // For Format=a1 the allowed foil set is empty, so only a3 branches remain
    expect(count).toBe(4);
  });

  it("uses fixed provider selections when evaluating rules", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: [
        ...baseAttributes,
        {
          id: "delivery",
          name: "Wysyłka",
          values: ["standard", "express"],
          affectsPricing: true,
        },
      ],
      configurationParams: {
        paperFormat: "paperFormat",
        paper: "paper",
        foil: "foil",
        delivery: "delivery",
      },
      fixedSelections: {
        delivery: "express",
      },
      strategy: {
        rules: [
          {
            when: { Wysyłka: "express" },
            allowedValues: {
              Format: ["a3"],
            },
          },
        ],
      },
    });

    expect(
      inputs.every((input) => input.configuration.paperFormat === "a3"),
    ).toBe(true);
  });

  it("ignores invalid AI rules that reference unknown values", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: baseAttributes,
      configurationParams: {
        paperFormat: "paperFormat",
        paper: "paper",
      },
      strategy: {
        rules: [
          {
            when: { Format: "a9" },
            allowedValues: {
              Papier: ["invented-paper"],
            },
          },
        ],
      },
    });

    expect(inputs).toEqual([
      { configuration: { paperFormat: "a1", paper: "matt" } },
      { configuration: { paperFormat: "a1", paper: "gloss" } },
      { configuration: { paperFormat: "a3", paper: "matt" } },
      { configuration: { paperFormat: "a3", paper: "gloss" } },
    ]);
  });

  it("builds planned counts from persisted manual exclusion rules", () => {
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: {
          Format: ["a1", "a3"],
        },
        omitAttributes: ["Folia"],
      },
    ]);

    expect(
      getPlannedPricingConfigurationCount({
        externalAttributes: baseAttributes,
        configurationParams: {
          paperFormat: "paperFormat",
          paper: "paper",
          foil: "foil",
        },
        strategy,
      }),
    ).toBe(4);
  });

  it("can exclude exact values for an attribute without omitting the whole attribute", () => {
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: {
          Format: ["a3"],
        },
        excludeValues: {
          Folia: ["gloss-front"],
        },
      },
    ]);

    expect(
      buildPriceConfigurationInputs({
        externalAttributes: baseAttributes,
        configurationParams: {
          paperFormat: "paperFormat",
          paper: "paper",
          foil: "foil",
        },
        strategy,
      }),
    ).toEqual([
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          foil: "gloss-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          foil: "gloss-front",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          foil: "matt-front",
        },
      },
    ]);
  });

  it("applies persisted manual exclusion rules keyed by attribute id", () => {
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: {
          paperFormat: ["a3"],
        },
        excludeValues: {
          foil: ["gloss-front"],
        },
      },
    ]);

    expect(
      buildPriceConfigurationInputs({
        externalAttributes: baseAttributes,
        configurationParams: {
          paperFormat: "paperFormat",
          paper: "paper",
          foil: "foil",
        },
        strategy,
      }),
    ).toEqual([
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          foil: "gloss-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          foil: "gloss-front",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          foil: "matt-front",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          foil: "matt-front",
        },
      },
    ]);
  });

  it("rejects invalid configurations against id-keyed persisted manual exclusions", () => {
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: {
          "foil-header": ["glossy-front"],
        },
        excludeValues: {
          "varnish-header": ["uv-3d-selective-front"],
          "decorativeFoil-header": ["foil-gold"],
        },
      },
    ]);

    expect(
      isConfigurationValidForStrategy({
        externalAttributes: [
          ...baseAttributes,
          {
            id: "foil-header",
            name: "Folia",
            values: ["glossy-front", "soft-skin-front"],
            affectsPricing: true,
          },
          {
            id: "varnish-header",
            name: "Lakier",
            values: ["uv-selective-front", "uv-3d-selective-front"],
            affectsPricing: true,
          },
          {
            id: "decorativeFoil-header",
            name: "Folia wybiórcza",
            values: ["foil-gold", "foil-silver"],
            affectsPricing: true,
          },
        ],
        configuration: {
          "foil-header": "glossy-front",
          "varnish-header": "uv-3d-selective-front",
          "decorativeFoil-header": "foil-gold",
        },
        fixedSelections: {},
        strategy,
      }),
    ).toBe(false);
  });

  it("excludes combinations from buildPriceConfigurationInputs when manual id-keyed exclusion rules apply", () => {
    // Mirrors the real calendar product: foil-header=glossy-front should exclude
    // varnish-header=uv-3d-selective-front and decorativeFoil-header=foil-gold
    const calendarAttributes: ExternalAttribute[] = [
      {
        id: "foil-header",
        name: "Folia",
        values: ["glossy-front", "matt-front"],
        affectsPricing: true,
      },
      {
        id: "varnish-header",
        name: "Lakier",
        values: ["uv-selective-front", "uv-3d-selective-front"],
        affectsPricing: true,
      },
      {
        id: "decorativeFoil-header",
        name: "Folia wybiórcza",
        values: ["foil-gold", "foil-silver"],
        affectsPricing: true,
      },
    ];
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: { "foil-header": ["glossy-front"] },
        excludeValues: {
          "varnish-header": ["uv-3d-selective-front"],
          "decorativeFoil-header": ["foil-gold"],
        },
      },
    ]);

    const inputs = buildPriceConfigurationInputs({
      externalAttributes: calendarAttributes,
      configurationParams: {
        "foil-header": "foil-header",
        "varnish-header": "varnish-header",
        "decorativeFoil-header": "decorativeFoil-header",
      },
      strategy,
    });

    // When foil-header=glossy-front, varnish-header must NOT be uv-3d-selective-front
    // and decorativeFoil-header must NOT be foil-gold
    for (const input of inputs) {
      if (input.configuration["foil-header"] === "glossy-front") {
        expect(input.configuration["varnish-header"]).not.toBe(
          "uv-3d-selective-front",
        );
        expect(input.configuration["decorativeFoil-header"]).not.toBe(
          "foil-gold",
        );
      }
    }

    // matt-front combinations should remain unrestricted
    const mattFrontInputs = inputs.filter(
      (input) => input.configuration["foil-header"] === "matt-front",
    );
    expect(mattFrontInputs.length).toBe(4); // 2 Lakier * 2 Folia wybiórcza
  });

  it("omits only the targeted duplicate-name attributes for calendar rules", () => {
    const calendarAttributes: ExternalAttribute[] = [
      {
        id: "calendarPaperFormat",
        name: "Typ",
        values: [
          "calendar-format-flat-head-820-320",
          "calendar-format-convex-head-820-320",
        ],
        affectsPricing: true,
      },
      {
        id: "calendarPaperFlatHeadWeight",
        name: "Papier",
        values: ["flat-head-matt-170", "flat-head-gloss-170"],
        affectsPricing: true,
      },
      {
        id: "calendarPaperConvexHeadWeight",
        name: "Papier",
        values: ["convex-head-matt-170", "convex-head-gloss-170"],
        affectsPricing: true,
      },
      {
        id: "colorBothWithHeader",
        name: "Kolorystyka",
        values: ["4-4", "5-5"],
        affectsPricing: true,
      },
      {
        id: "color",
        name: "Kolorystyka",
        values: ["4-0", "1-0"],
        affectsPricing: true,
      },
    ];
    const strategy = buildManualPricingCombinationStrategy([
      {
        when: {
          calendarPaperFormat: ["calendar-format-convex-head-820-320"],
        },
        omitAttributes: ["calendarPaperFlatHeadWeight", "color"],
      },
    ]);

    const inputs = buildPriceConfigurationInputs({
      externalAttributes: calendarAttributes,
      configurationParams: {
        calendarPaperFormat: "calendarPaperFormat",
        calendarPaperFlatHeadWeight: "calendarPaperFlatHeadWeight",
        calendarPaperConvexHeadWeight: "calendarPaperConvexHeadWeight",
        colorBothWithHeader: "colorBothWithHeader",
        color: "color",
      },
      strategy,
    });

    const convexInputs = inputs.filter(
      (input) =>
        input.configuration.calendarPaperFormat ===
        "calendar-format-convex-head-820-320",
    );
    expect(convexInputs.length).toBeGreaterThan(0);
    expect(
      convexInputs.every(
        (input) =>
          input.configuration.calendarPaperFlatHeadWeight === undefined &&
          input.configuration.color === undefined &&
          input.configuration.calendarPaperConvexHeadWeight !== undefined &&
          input.configuration.colorBothWithHeader !== undefined,
      ),
    ).toBe(true);

    const flatInputs = inputs.filter(
      (input) =>
        input.configuration.calendarPaperFormat ===
        "calendar-format-flat-head-820-320",
    );
    expect(flatInputs.length).toBeGreaterThan(0);
    expect(
      flatInputs.some(
        (input) =>
          input.configuration.calendarPaperFlatHeadWeight !== undefined &&
          input.configuration.color !== undefined,
      ),
    ).toBe(true);
  });

  it("expands inferred width and height ranges into sampled pricing configurations", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: [
        ...baseAttributes,
        {
          id: "shapeWidth",
          name: "Width",
          values: [],
          affectsPricing: true,
          numberConfig: {
            minimum: 100,
            maximum: 500,
            step: 200,
          },
        },
        {
          id: "shapeHeight",
          name: "Height",
          values: [],
          affectsPricing: true,
          numberConfig: {
            minimum: 50,
            maximum: 250,
            step: 100,
          },
        },
      ],
      attributeMappings: [
        {
          externalAttributeName: "Format",
          internalAttributeId: "format",
        },
        {
          externalAttributeName: "Papier",
          internalAttributeId: "paper",
        },
      ],
      configurationParams: {
        paperFormat: "paperFormat",
        paper: "paper",
        shapeWidth: "shapeWidth",
        shapeHeight: "shapeHeight",
      },
    });

    expect(inputs).toEqual([
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a1",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "100",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "300",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "matt",
          shapeWidth: "500",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "100",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "300",
          shapeHeight: "250",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "50",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "150",
        },
      },
      {
        configuration: {
          paperFormat: "a3",
          paper: "gloss",
          shapeWidth: "500",
          shapeHeight: "250",
        },
      },
    ]);
  });
});

describe("convertStrategyRulesToExclusionRules", () => {
  it("converts omitAttributes rules", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { format: "a3" },
        omitAttributes: ["weight", "color"],
      },
    ]);

    expect(result).toEqual([
      {
        when: { format: ["a3"] },
        omitAttributes: ["weight", "color"],
        source: "ai",
      },
    ]);
  });

  it("converts excludedValues rules", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { paper: "matt" },
        excludedValues: { foil: ["gloss-front"] },
      },
    ]);

    expect(result).toEqual([
      {
        when: { paper: ["matt"] },
        excludeValues: { foil: ["gloss-front"] },
        source: "ai",
      },
    ]);
  });

  it("converts rules with both omitAttributes and excludedValues", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { format: "a1" },
        omitAttributes: ["weight"],
        excludedValues: { color: ["red"] },
      },
    ]);

    expect(result).toEqual([
      {
        when: { format: ["a1"] },
        omitAttributes: ["weight"],
        excludeValues: { color: ["red"] },
        source: "ai",
      },
    ]);
  });

  it("skips rules without when condition", () => {
    const result = convertStrategyRulesToExclusionRules([
      { omitAttributes: ["weight"] },
      { when: {}, omitAttributes: ["weight"] },
    ]);

    expect(result).toEqual([]);
  });

  it("skips rules with allowedValues only (not convertible)", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { format: "a3" },
        allowedValues: { paper: ["matt", "gloss"] },
      },
    ]);

    expect(result).toEqual([]);
  });

  it("converts allowedValues to excludeValues when attribute values are known", () => {
    const result = convertStrategyRulesToExclusionRules(
      [
        {
          when: { paper: "matt" },
          allowedValues: { foil: ["matt-front"] },
        },
      ],
      [
        {
          id: "paperFormat",
          name: "Format",
          values: ["a1", "a3"],
          affectsPricing: true,
        },
        {
          id: "paper",
          name: "Papier",
          values: ["matt", "gloss"],
          affectsPricing: true,
        },
        {
          id: "foil",
          name: "Folia",
          values: ["matt-front", "gloss-front"],
          affectsPricing: true,
        },
      ],
    );

    expect(result).toEqual([
      {
        when: { paper: ["matt"] },
        excludeValues: { foil: ["gloss-front"] },
        source: "ai",
      },
    ]);
  });

  it("preserves constrained finishing values when persisting AI rules", () => {
    const result = convertStrategyRulesToExclusionRules(
      [
        {
          when: { paperWeight: "lux-350g" },
          omitAttributes: ["varnish", "decorativeFoil"],
          requiredAttributes: ["foil"],
          allowedValues: { foil: ["none"] },
        },
      ],
      [
        {
          id: "paperWeight",
          name: "Papier",
          values: ["lux-350g", "lux-400g"],
          affectsPricing: true,
        },
        {
          id: "foil",
          name: "Folia",
          values: ["none", "matt-front", "gloss-front"],
          affectsPricing: true,
        },
        {
          id: "varnish",
          name: "Lakier",
          values: ["none", "uv", "3d"],
          affectsPricing: true,
        },
        {
          id: "decorativeFoil",
          name: "Folia wybiorcza",
          values: ["none", "gold", "silver"],
          affectsPricing: true,
        },
      ],
    );

    expect(result).toEqual([
      {
        when: { paperWeight: ["lux-350g"] },
        omitAttributes: ["varnish", "decorativeFoil"],
        excludeValues: { foil: ["matt-front", "gloss-front"] },
        source: "ai",
      },
    ]);
  });

  it("skips rules with requiredAttributes only (not convertible)", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { format: "a3" },
        requiredAttributes: ["paper"],
      },
    ]);

    expect(result).toEqual([]);
  });

  it("handles multi-key when condition", () => {
    const result = convertStrategyRulesToExclusionRules([
      {
        when: { format: "a3", paper: "matt" },
        omitAttributes: ["weight"],
      },
    ]);

    expect(result).toEqual([
      {
        when: { format: ["a3"], paper: ["matt"] },
        omitAttributes: ["weight"],
        source: "ai",
      },
    ]);
  });

  it("tags all rules with source: 'ai'", () => {
    const result = convertStrategyRulesToExclusionRules([
      { when: { a: "1" }, omitAttributes: ["b"] },
      { when: { c: "2" }, excludedValues: { d: ["3"] } },
    ]);

    expect(result.every((r: { source?: string }) => r.source === "ai")).toBe(
      true,
    );
  });
});

describe("mergeExclusionRulesWithAiRules", () => {
  it("preserves manual rules and appends AI rules", () => {
    const existing = [
      { when: { format: ["a1"] }, omitAttributes: ["x"] },
      {
        when: { format: ["a3"] },
        omitAttributes: ["y"],
        source: "ai" as const,
      },
    ];
    const newAi = [
      {
        when: { paper: ["matt"] },
        omitAttributes: ["z"],
        source: "ai" as const,
      },
    ];

    const result = mergeExclusionRulesWithAiRules(existing, newAi);

    expect(result).toEqual([
      { when: { format: ["a1"] }, omitAttributes: ["x"] },
      { when: { paper: ["matt"] }, omitAttributes: ["z"], source: "ai" },
    ]);
  });

  it("returns existing rules unchanged when new AI rules are empty", () => {
    const existing = [
      { when: { format: ["a1"] }, omitAttributes: ["x"] },
      {
        when: { format: ["a3"] },
        omitAttributes: ["y"],
        source: "ai" as const,
      },
    ];

    const result = mergeExclusionRulesWithAiRules(existing, []);

    expect(result).toBe(existing);
  });

  it("replaces old AI rules with new AI rules", () => {
    const existing = [
      {
        when: { format: ["a1"] },
        omitAttributes: ["old"],
        source: "ai" as const,
      },
      { when: { format: ["a3"] }, omitAttributes: ["manual"] },
    ];
    const newAi = [
      {
        when: { format: ["a1"] },
        omitAttributes: ["new"],
        source: "ai" as const,
      },
    ];

    const result = mergeExclusionRulesWithAiRules(existing, newAi);

    expect(result).toEqual([
      { when: { format: ["a3"] }, omitAttributes: ["manual"] },
      { when: { format: ["a1"] }, omitAttributes: ["new"], source: "ai" },
    ]);
  });

  it("handles empty existing rules", () => {
    const newAi = [
      { when: { a: ["1"] }, omitAttributes: ["b"], source: "ai" as const },
    ];

    const result = mergeExclusionRulesWithAiRules([], newAi);

    expect(result).toEqual(newAi);
  });
});
