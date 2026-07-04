import { describe, expect, it } from "vitest";
import type {
  Attribute,
  AttributeMapping,
  ExternalAttribute,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import {
  buildProductAttributeDependenciesFromExternalPricing,
  collectMappedAttributeOptions,
  collectImpossibleDependentAttributeIds,
  resolveMappedInternalOptionValue,
  sortAttributeIdsByDependencies,
} from "./product-attribute-dependencies";
import {
  SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
  createSyntheticEmptyBranchExternalOptionValue,
} from "./option-mapping-utils";

function createInternalAttribute(
  id: string,
  options: Array<{ label: string; value: string; }>,
): Attribute & { id: string; } {
  return {
    id,
    active: true,
    calculated: true,
    createdAt: new Date() as never,
    createdBy: { id: "tester", name: "Tester" },
    format: false,
    keywords: [],
    name: id,
    options: options.map((option) => ({
      ...option,
      customFormat: false,
      hidden: false,
    })),
    required: false,
    trackStock: false,
    type: "DROPDOWN",
    updatedAt: new Date() as never,
    updatedBy: { id: "tester", name: "Tester" },
  };
}

describe("resolveMappedInternalOptionValue", () => {
  it("falls back to normalized label matching when no explicit option mapping exists", () => {
    const internalAttribute = createInternalAttribute("foil", [
      { label: "Mat", value: "mat" },
      { label: "Gloss", value: "gloss" },
    ]);

    expect(
      resolveMappedInternalOptionValue({
        externalAttribute: {
          name: "Folia",
          options: [{ label: "Mat", value: "matt-front" }],
          values: ["matt-front"],
        },
        externalValue: "matt-front",
        internalAttribute,
        mapping: {
          externalAttributeName: "Folia",
          internalAttributeId: "foil",
        },
      }),
    ).toBe("mat");
  });

  it("uses the synthetic empty option mapping when the provider omits a value", () => {
    const internalAttribute = createInternalAttribute("foil", [
      { label: "None", value: "none" },
      { label: "Mat", value: "mat" },
    ]);

    expect(
      resolveMappedInternalOptionValue({
        internalAttribute,
        mapping: {
          externalAttributeName: "Folia",
          internalAttributeId: "foil",
          optionMappings: {
            [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
          },
        },
      }),
    ).toBe("none");
  });

  it("ignores stale explicit mappings and falls back to normalized matching", () => {
    const internalAttribute = createInternalAttribute("foil", [
      { label: "Mat", value: "mat" },
      { label: "Gloss", value: "gloss" },
    ]);

    expect(
      resolveMappedInternalOptionValue({
        externalAttribute: {
          name: "Folia",
          options: [{ label: "Mat", value: "matt-front" }],
          values: ["matt-front"],
        },
        externalValue: "matt-front",
        internalAttribute,
        mapping: {
          externalAttributeName: "Folia",
          internalAttributeId: "foil",
          optionMappings: {
            "matt-front": "legacyMatValue",
          },
        },
      }),
    ).toBe("mat");
  });

  it("falls back to the generic synthetic empty mapping for derived empty branches", () => {
    const internalAttribute = createInternalAttribute("foil", [
      { label: "None", value: "none" },
      { label: "Mat", value: "mat" },
    ]);

    expect(
      resolveMappedInternalOptionValue({
        externalValue:
          createSyntheticEmptyBranchExternalOptionValue("Standardowy"),
        internalAttribute,
        mapping: {
          externalAttributeName: "Folia",
          internalAttributeId: "foil",
          optionMappings: {
            [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
          },
        },
      }),
    ).toBe("none");
  });
});

describe("collectMappedAttributeOptions", () => {
  it("includes full provider option catalogs even when values only contain a subset", () => {
    const internalAttribute = createInternalAttribute("paper", [
      { label: "Matte 150g", value: "mat150" },
      { label: "Matte 250g", value: "mat250" },
      { label: "Gloss 250g", value: "gloss250" },
    ]);

    expect(
      collectMappedAttributeOptions({
        externalAttribute: {
          name: "Paper",
          options: [
            { label: "Matte 150g", value: "matt-150g" },
            { label: "Matte 250g", value: "matt-250g" },
            { label: "Gloss 250g", value: "gloss-250g" },
          ],
          values: ["matt-150g"],
        },
        internalAttribute,
        mapping: {
          externalAttributeName: "Paper",
          internalAttributeId: "paper",
          optionMappings: {
            "gloss-250g": "gloss250",
            "matt-150g": "mat150",
            "matt-250g": "mat250",
          },
        },
      }),
    ).toEqual(["mat150", "mat250", "gloss250"]);
  });
});

describe("buildProductAttributeDependenciesFromExternalPricing", () => {
  const externalAttributes: ExternalAttribute[] = [
    {
      name: "Paper",
      options: [
        { label: "Matte 150g", value: "matt-150g" },
        { label: "Matte 250g", value: "matt-250g" },
        { label: "Gloss 250g", value: "gloss-250g" },
      ],
      values: ["matt-150g", "matt-250g", "gloss-250g"],
    },
    {
      name: "Foil",
      options: [
        { label: "Mat", value: "matt-front" },
        { label: "Gloss", value: "gloss-front" },
      ],
      values: ["matt-front", "gloss-front"],
    },
  ];
  const attributeMappings: AttributeMapping[] = [
    {
      externalAttributeName: "Paper",
      internalAttributeId: "paper",
      optionMappings: {
        "gloss-250g": "gloss250",
        "matt-150g": "mat150",
        "matt-250g": "mat250",
      },
    },
    {
      externalAttributeName: "Foil",
      internalAttributeId: "foil",
      optionMappings: {
        "gloss-front": "gloss",
        "matt-front": "mat",
      },
    },
  ];
  const internalAttributesById = new Map<string, Attribute & { id: string; }>([
    [
      "paper",
      createInternalAttribute("paper", [
        { label: "Mat 150", value: "mat150" },
        { label: "Mat 250", value: "mat250" },
        { label: "Gloss 250", value: "gloss250" },
      ]),
    ],
    [
      "foil",
      createInternalAttribute("foil", [
        { label: "Mat", value: "mat" },
        { label: "Gloss", value: "gloss" },
      ]),
    ],
  ]);

  it("creates dependency values for whole omitted attributes", () => {
    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
        },
      },
    ];

    expect(
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings,
        externalAttributes,
        internalAttributesById,
        pricingExclusionRules: rules,
        productAttributeOptions: {
          foil: ["mat", "gloss"],
          paper: ["mat150", "mat250", "gloss250"],
        },
      }),
    ).toEqual({
      foil: {
        dependsOn: "paper",
        dependencyValues: ["gloss250", "mat250"],
      },
    });
  });

  it("creates conditional options for exact excluded values", () => {
    const rules: ExternalProductPricingExclusionRule[] = [
      {
        excludeValues: {
          Foil: ["gloss-front"],
        },
        when: {
          Paper: ["matt-250g"],
        },
      },
    ];

    expect(
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings,
        externalAttributes,
        internalAttributesById,
        pricingExclusionRules: rules,
        productAttributeOptions: {
          foil: ["mat", "gloss"],
          paper: ["mat150", "mat250", "gloss250"],
        },
      }),
    ).toEqual({
      foil: {
        conditionalOptions: {
          mat250: ["mat"],
        },
        dependsOn: "paper",
      },
    });
  });

  it("ignores AI-only exclusion rules when building product dependencies", () => {
    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
        },
        source: "ai",
      },
    ];

    expect(
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings,
        externalAttributes,
        internalAttributesById,
        pricingExclusionRules: rules,
        productAttributeOptions: {
          foil: ["mat", "gloss"],
          paper: ["mat150", "mat250", "gloss250"],
        },
      }),
    ).toEqual({});
  });

  it("uses the synthetic empty mapping instead of hiding the attribute entirely", () => {
    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
        },
      },
    ];

    expect(
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings: [
          attributeMappings[0],
          {
            ...attributeMappings[1],
            optionMappings: {
              ...attributeMappings[1].optionMappings,
              [SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE]: "none",
            },
          },
        ],
        externalAttributes,
        internalAttributesById: new Map<string, Attribute & { id: string; }>([
          [
            "paper",
            createInternalAttribute("paper", [
              { label: "Mat 150", value: "mat150" },
              { label: "Mat 250", value: "mat250" },
              { label: "Gloss 250", value: "gloss250" },
            ]),
          ],
          [
            "foil",
            createInternalAttribute("foil", [
              { label: "None", value: "none" },
              { label: "Mat", value: "mat" },
              { label: "Gloss", value: "gloss" },
            ]),
          ],
        ]),
        pricingExclusionRules: rules,
        productAttributeOptions: {
          foil: ["none", "mat", "gloss"],
          paper: ["mat150", "mat250", "gloss250"],
        },
      }),
    ).toEqual({
      foil: {
        conditionalOptions: {
          mat150: ["none"],
        },
        dependsOn: "paper",
      },
    });
  });

  it("stores multi-when rules as a scoped dependency", () => {
    const coatingAttribute: ExternalAttribute = {
      name: "Coating",
      options: [
        { label: "UV", value: "uv" },
        { label: "None", value: "no-coating" },
      ],
      values: ["uv", "no-coating"],
    };

    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
          Coating: ["uv"],
        },
      },
    ];

    const result = buildProductAttributeDependenciesFromExternalPricing({
      attributeMappings: [
        ...attributeMappings,
        {
          externalAttributeName: "Coating",
          internalAttributeId: "coating",
        },
      ],
      externalAttributes: [...externalAttributes, coatingAttribute],
      internalAttributesById: new Map([
        ...internalAttributesById,
        [
          "coating",
          createInternalAttribute("coating", [
            { label: "UV", value: "uv" },
            { label: "None", value: "no-coating" },
          ]),
        ],
      ]),
      pricingExclusionRules: rules,
      productAttributeOptions: {
        coating: ["uv", "no-coating"],
        foil: ["mat", "gloss"],
        paper: ["mat150", "mat250", "gloss250"],
      },
    });

    expect(result.foil).toEqual({
      dependsOn: "paper",
      dependencyValues: ["gloss250", "mat250"],
      when: {
        coating: ["uv"],
      },
    });
  });

  it("collects impossible attributes when a dependency can never match", () => {
    const varnishAttribute: ExternalAttribute = {
      name: "Varnish",
      options: [{ label: "UV", value: "uv" }],
      values: ["uv"],
    };

    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g", "matt-250g", "gloss-250g"],
        },
      },
      {
        omitAttributes: ["Varnish"],
        when: {
          Foil: ["matt-front", "gloss-front"],
        },
      },
    ];

    const attributeDependencies =
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings: [
          ...attributeMappings,
          {
            externalAttributeName: "Varnish",
            internalAttributeId: "varnish",
            optionMappings: {
              uv: "uv",
            },
          },
        ],
        externalAttributes: [...externalAttributes, varnishAttribute],
        internalAttributesById: new Map([
          ...internalAttributesById,
          [
            "varnish",
            createInternalAttribute("varnish", [{ label: "UV", value: "uv" }]),
          ],
        ]),
        pricingExclusionRules: rules,
        productAttributeOptions: {
          paper: ["mat150", "mat250", "gloss250"],
          foil: ["mat", "gloss"],
          varnish: ["uv"],
        },
      });

    expect(
      collectImpossibleDependentAttributeIds({
        attributeDependencies,
        attributeIds: ["paper", "foil", "varnish"],
      }).toSorted(),
    ).toEqual(["foil", "varnish"]);
  });

  it("creates multi-parent array when different rules reference different parents for the same child", () => {
    const coatingAttribute: ExternalAttribute = {
      name: "Coating",
      options: [
        { label: "UV", value: "uv" },
        { label: "None", value: "no-coating" },
      ],
      values: ["uv", "no-coating"],
    };

    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
        },
      },
      {
        omitAttributes: ["Foil"],
        when: {
          Coating: ["uv"],
        },
      },
    ];

    const result = buildProductAttributeDependenciesFromExternalPricing({
      attributeMappings: [
        ...attributeMappings,
        {
          externalAttributeName: "Coating",
          internalAttributeId: "coating",
        },
      ],
      externalAttributes: [...externalAttributes, coatingAttribute],
      internalAttributesById: new Map([
        ...internalAttributesById,
        [
          "coating",
          createInternalAttribute("coating", [
            { label: "UV", value: "uv" },
            { label: "None", value: "no-coating" },
          ]),
        ],
      ]),
      pricingExclusionRules: rules,
      productAttributeOptions: {
        coating: ["uv", "no-coating"],
        foil: ["mat", "gloss"],
        paper: ["mat150", "mat250", "gloss250"],
      },
    });

    expect(Array.isArray(result.foil)).toBe(true);
    const foilRules = result.foil as Array<{
      dependsOn: string;
      dependencyValues?: string[];
    }>;
    expect(foilRules).toHaveLength(2);

    const paperRule = foilRules.find((r) => r.dependsOn === "paper");
    const coatingRule = foilRules.find((r) => r.dependsOn === "coating");

    expect(paperRule).toBeDefined();
    expect(paperRule!.dependencyValues).toEqual(["gloss250", "mat250"]);

    expect(coatingRule).toBeDefined();
    expect(coatingRule!.dependencyValues).toEqual(["no-coating"]);
  });

  it("keeps a single rule when same child depends on a single parent", () => {
    const rules: ExternalProductPricingExclusionRule[] = [
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
        },
      },
    ];

    const result = buildProductAttributeDependenciesFromExternalPricing({
      attributeMappings,
      externalAttributes,
      internalAttributesById,
      pricingExclusionRules: rules,
      productAttributeOptions: {
        foil: ["mat", "gloss"],
        paper: ["mat150", "mat250", "gloss250"],
      },
    });

    // Single parent → single rule object (not array)
    expect(Array.isArray(result.foil)).toBe(false);
    expect(result.foil).toEqual({
      dependsOn: "paper",
      dependencyValues: ["gloss250", "mat250"],
    });
  });
});

describe("sortAttributeIdsByDependencies", () => {
  it("moves dependency parents before child attributes", () => {
    expect(
      sortAttributeIdsByDependencies(
        ["typSkladania", "format", "papier", "kolorystyka"],
        {
          typSkladania: {
            dependsOn: "format",
            dependencyValues: ["dl"],
          },
        },
      ),
    ).toEqual(["format", "typSkladania", "papier", "kolorystyka"]);
  });

  it("moves scoped condition parents before the child attribute", () => {
    expect(
      sortAttributeIdsByDependencies(["foil", "paper", "coating"], {
        foil: {
          dependsOn: "paper",
          dependencyValues: ["mat250"],
          when: {
            coating: ["uv"],
          },
        },
      }),
    ).toEqual(["paper", "coating", "foil"]);
  });

  it("keeps unrelated attributes stable while satisfying multiple parents", () => {
    expect(
      sortAttributeIdsByDependencies(
        ["uszlachetnienie", "typSkladania", "format", "papier"],
        {
          typSkladania: [
            {
              dependsOn: "format",
              dependencyValues: ["dl"],
            },
            {
              dependsOn: "papier",
              dependencyValues: ["offset"],
            },
          ],
        },
      ),
    ).toEqual(["uszlachetnienie", "format", "papier", "typSkladania"]);
  });
});
