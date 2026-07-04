import { describe, expect, it } from "vitest";
import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import {
  getExpectedPricingConfigurationCount,
  getProviderOnlyPricingSelections,
  getVariablePricingAttributes,
  isAttributeMappingReady,
} from "./provider-pricing";
import { SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE } from "./option-mapping-utils";

describe("provider pricing helpers", () => {
  it("treats provider-only pricing mappings with a fixed value as ready", () => {
    const mapping: AttributeMapping = {
      externalAttributeName: "Delivery",
      providerOnlyPricing: true,
      fixedExternalValue: "standard",
    };

    expect(isAttributeMappingReady(mapping)).toBe(true);
  });

  it("collects only complete provider-only pricing defaults", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Delivery",
        providerOnlyPricing: true,
        fixedExternalValue: "standard",
      },
      {
        externalAttributeName: "Paper",
        internalAttributeId: "paper",
      },
      {
        externalAttributeName: "Foil",
        providerOnlyPricing: true,
      },
    ];

    expect(getProviderOnlyPricingSelections(mappings)).toEqual({
      Delivery: "standard",
    });
  });

  it("treats ignored mappings as ready", () => {
    const mapping: AttributeMapping = {
      externalAttributeName: "Finishing",
      ignored: true,
    };

    expect(isAttributeMappingReady(mapping)).toBe(true);
  });

  it("skips ignored mappings when collecting provider-only pricing defaults", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Delivery",
        providerOnlyPricing: true,
        fixedExternalValue: "standard",
        ignored: true,
      },
      {
        externalAttributeName: "Paper",
        providerOnlyPricing: true,
        fixedExternalValue: "matte",
      },
    ];

    expect(getProviderOnlyPricingSelections(mappings)).toEqual({
      Paper: "matte",
    });
  });

  it("excludes fixed provider-only attributes from price combinations", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        name: "Delivery",
        values: ["standard", "express"],
        affectsPricing: true,
      },
      {
        name: "Paper",
        values: ["matte", "gloss"],
        affectsPricing: true,
      },
    ];

    expect(
      getVariablePricingAttributes({
        externalAttributes,
        configurationParams: {
          Delivery: "delivery",
          Paper: "paper",
        },
        fixedSelections: {
          Delivery: "standard",
        },
      }).map((attribute) => attribute.name),
    ).toEqual(["Paper"]);
  });

  it("reduces variable pricing values to explicitly mapped external options", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        name: "Paper",
        values: ["matt-150g", "matt-250g", "gloss-170g"],
        affectsPricing: true,
      },
      {
        name: "Foil",
        values: ["none", "matt-front", "gloss-front", "soft-touch"],
        affectsPricing: true,
      },
    ];

    const variableAttributes = getVariablePricingAttributes({
      externalAttributes,
      attributeMappings: [
        {
          externalAttributeName: "Paper",
          internalAttributeId: "paper",
          optionMappings: {
            "matt-150g": "mat150",
            "gloss-170g": "gloss170",
          },
        },
        {
          externalAttributeName: "Foil",
          internalAttributeId: "foil",
          optionMappings: {
            "matt-front": "matFront",
          },
        },
      ],
      configurationParams: {
        Paper: "paperWeight",
        Foil: "foil",
      },
    });

    expect(variableAttributes).toEqual([
      {
        name: "Paper",
        values: ["matt-150g", "gloss-170g"],
        affectsPricing: true,
      },
      {
        name: "Foil",
        values: ["matt-front"],
        affectsPricing: true,
      },
    ]);

    expect(
      getExpectedPricingConfigurationCount({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "Paper",
            internalAttributeId: "paper",
            optionMappings: {
              "matt-150g": "mat150",
              "gloss-170g": "gloss170",
            },
          },
          {
            externalAttributeName: "Foil",
            internalAttributeId: "foil",
            optionMappings: {
              "matt-front": "matFront",
            },
          },
        ],
        configurationParams: {
          Paper: "paperWeight",
          Foil: "foil",
        },
      }),
    ).toBe(2);
  });

  it("skips unmapped pricing attributes when mappings exist", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        name: "Paper",
        values: ["matt", "gloss"],
        affectsPricing: true,
      },
      {
        name: "Hidden provider attribute",
        values: ["a", "b", "c"],
        affectsPricing: true,
      },
    ];

    expect(
      getVariablePricingAttributes({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "Paper",
            internalAttributeId: "paper",
          },
        ],
        configurationParams: {
          Paper: "paper",
          "Hidden provider attribute": "hiddenAttribute",
        },
      }).map((attribute) => attribute.name),
    ).toEqual(["Paper"]);
  });

  it("keeps inferred width and height ranges in variable pricing even when they are unmapped", () => {
    const externalAttributes: ExternalAttribute[] = [
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
      {
        name: "Paper",
        values: ["matte", "gloss"],
        affectsPricing: true,
      },
    ];

    const variableAttributes = getVariablePricingAttributes({
      externalAttributes,
      attributeMappings: [
        {
          externalAttributeName: "Paper",
          internalAttributeId: "paper",
        },
      ],
      configurationParams: {
        Width: "shapeWidth",
        Height: "shapeHeight",
        Paper: "paper",
      },
    });

    expect(variableAttributes).toEqual([
      {
        id: "shapeWidth",
        name: "Width",
        values: ["100", "300", "500"],
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
        values: ["50", "150", "250"],
        affectsPricing: true,
        numberConfig: {
          minimum: 50,
          maximum: 250,
          step: 100,
        },
      },
      {
        name: "Paper",
        values: ["matte", "gloss"],
        affectsPricing: true,
      },
    ]);

    expect(
      getExpectedPricingConfigurationCount({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "Paper",
            internalAttributeId: "paper",
          },
        ],
        configurationParams: {
          Width: "shapeWidth",
          Height: "shapeHeight",
          Paper: "paper",
        },
      }),
    ).toBe(18);
  });

  it("matches id-keyed mappings for duplicate-name pricing attributes", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        id: "calendarPaperFlatHeadWeight",
        name: "Papier",
        values: ["130", "170"],
        affectsPricing: true,
      },
      {
        id: "calendarPaperConvexHeadWeight",
        name: "Papier",
        values: ["200", "250"],
        affectsPricing: true,
      },
    ];

    const variableAttributes = getVariablePricingAttributes({
      externalAttributes,
      attributeMappings: [
        {
          externalAttributeName: "calendarPaperFlatHeadWeight",
          internalAttributeId: "flat-paper",
          optionMappings: {
            "130": "130",
            "170": "170",
          },
        },
        {
          externalAttributeName: "calendarPaperConvexHeadWeight",
          internalAttributeId: "convex-paper",
          optionMappings: {
            "200": "200",
            "250": "250",
          },
        },
      ],
      configurationParams: {
        Papier: "paper",
      },
    });

    expect(variableAttributes).toEqual([
      {
        id: "calendarPaperFlatHeadWeight",
        name: "Papier",
        values: ["130", "170"],
        affectsPricing: true,
      },
      {
        id: "calendarPaperConvexHeadWeight",
        name: "Papier",
        values: ["200", "250"],
        affectsPricing: true,
      },
    ]);

    expect(
      getExpectedPricingConfigurationCount({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "calendarPaperFlatHeadWeight",
            internalAttributeId: "flat-paper",
            optionMappings: {
              "130": "130",
              "170": "170",
            },
          },
          {
            externalAttributeName: "calendarPaperConvexHeadWeight",
            internalAttributeId: "convex-paper",
            optionMappings: {
              "200": "200",
              "250": "250",
            },
          },
        ],
        configurationParams: {
          Papier: "paper",
        },
      }),
    ).toBe(4);
  });

  it("includes synthetic empty value when mapped to represent 'none' option", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        name: "Foil",
        values: ["glossy-front", "matt-front", "glossy-both-sides"],
        affectsPricing: true,
      },
      {
        name: "Paper",
        values: ["matt-150g", "gloss-170g"],
        affectsPricing: true,
      },
    ];

    const variableAttributes = getVariablePricingAttributes({
      externalAttributes,
      attributeMappings: [
        {
          externalAttributeName: "Foil",
          internalAttributeId: "foil",
          optionMappings: {
            "glossy-front": "glossy-front",
            "matt-front": "matt-front",
            "glossy-both-sides": "glossy-both-sides",
            [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
          },
        },
        {
          externalAttributeName: "Paper",
          internalAttributeId: "paper",
          optionMappings: {
            "matt-150g": "mat150",
            "gloss-170g": "gloss170",
          },
        },
      ],
      configurationParams: {
        Foil: "foil",
        Paper: "paperWeight",
      },
    });

    const foilAttribute = variableAttributes.find(
      (attribute) => attribute.name === "Foil",
    );
    expect(foilAttribute?.values).toEqual([
      "glossy-front",
      "matt-front",
      "glossy-both-sides",
      SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
    ]);

    expect(
      getExpectedPricingConfigurationCount({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "Foil",
            internalAttributeId: "foil",
            optionMappings: {
              "glossy-front": "glossy-front",
              "matt-front": "matt-front",
              "glossy-both-sides": "glossy-both-sides",
              [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
            },
          },
          {
            externalAttributeName: "Paper",
            internalAttributeId: "paper",
            optionMappings: {
              "matt-150g": "mat150",
              "gloss-170g": "gloss170",
            },
          },
        ],
        configurationParams: {
          Foil: "foil",
          Paper: "paperWeight",
        },
      }),
    ).toBe(8); // (3 foil + 1 none) × 2 paper = 8
  });

  it("includes synthetic empty for multiple independent attributes with 'none'", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        name: "Foil",
        values: ["glossy-front", "matt-front"],
        affectsPricing: true,
      },
      {
        name: "Varnish",
        values: ["uv-front", "uv-both"],
        affectsPricing: true,
      },
    ];

    const variableAttributes = getVariablePricingAttributes({
      externalAttributes,
      attributeMappings: [
        {
          externalAttributeName: "Foil",
          internalAttributeId: "foil",
          optionMappings: {
            "glossy-front": "glossy-front",
            "matt-front": "matt-front",
            [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
          },
        },
        {
          externalAttributeName: "Varnish",
          internalAttributeId: "varnish",
          optionMappings: {
            "uv-front": "uv-front",
            "uv-both": "uv-both",
            [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
          },
        },
      ],
      configurationParams: {
        Foil: "foil",
        Varnish: "varnish",
      },
    });

    expect(variableAttributes.find((a) => a.name === "Foil")?.values).toEqual([
      "glossy-front",
      "matt-front",
      SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
    ]);
    expect(
      variableAttributes.find((a) => a.name === "Varnish")?.values,
    ).toEqual(["uv-front", "uv-both", SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]);

    expect(
      getExpectedPricingConfigurationCount({
        externalAttributes,
        attributeMappings: [
          {
            externalAttributeName: "Foil",
            internalAttributeId: "foil",
            optionMappings: {
              "glossy-front": "glossy-front",
              "matt-front": "matt-front",
              [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
            },
          },
          {
            externalAttributeName: "Varnish",
            internalAttributeId: "varnish",
            optionMappings: {
              "uv-front": "uv-front",
              "uv-both": "uv-both",
              [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
            },
          },
        ],
        configurationParams: {
          Foil: "foil",
          Varnish: "varnish",
        },
      }),
    ).toBe(9); // (2 + 1) × (2 + 1) = 9
  });
});
