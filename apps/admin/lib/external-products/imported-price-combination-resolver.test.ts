import { describe, expect, it } from "vitest";
import type {
  Attribute,
  AttributeMapping,
  ExternalAttribute,
  ExternalProductPricingExclusionRule,
  Product,
} from "@konfi/types";
import { createImportedMatrixCombinationResolver } from "./imported-price-combination-resolver";
import {
  buildProductAttributeDependenciesFromExternalPricing,
  sortAttributeIdsByDependencies,
} from "./product-attribute-dependencies";

function createInternalAttribute(
  id: string,
  options: Array<{ label: string; value: string }>,
): Attribute & { id: string } {
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

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const paperCoatingFoilExternalAttributes: ExternalAttribute[] = [
  {
    id: "paper-id",
    name: "Paper",
    options: [
      { label: "Matte 150g", value: "matt-150g" },
      { label: "Matte 250g", value: "matt-250g" },
    ],
    values: ["matt-150g", "matt-250g"],
  },
  {
    id: "coating-id",
    name: "Coating",
    options: [
      { label: "UV", value: "uv" },
      { label: "None", value: "no-coating" },
    ],
    values: ["uv", "no-coating"],
  },
  {
    id: "foil-id",
    name: "Foil",
    options: [
      { label: "Mat", value: "matt-front" },
      { label: "Gloss", value: "gloss-front" },
    ],
    values: ["matt-front", "gloss-front"],
  },
];

const paperCoatingFoilMappings: AttributeMapping[] = [
  {
    externalAttributeName: "Paper",
    internalAttributeId: "paper",
    optionMappings: {
      "matt-150g": "mat150",
      "matt-250g": "mat250",
    },
  },
  {
    externalAttributeName: "Coating",
    internalAttributeId: "coating",
    optionMappings: {
      uv: "uv",
      "no-coating": "none",
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

const paperCoatingFoilInternalAttributes = new Map<
  string,
  Attribute & { id: string }
>([
  [
    "paper",
    createInternalAttribute("paper", [
      { label: "Mat 150", value: "mat150" },
      { label: "Mat 250", value: "mat250" },
    ]),
  ],
  [
    "coating",
    createInternalAttribute("coating", [
      { label: "UV", value: "uv" },
      { label: "None", value: "none" },
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

const paperCoatingFoilOptions: Record<string, string[]> = {
  coating: ["uv", "none"],
  foil: ["mat", "gloss"],
  paper: ["mat150", "mat250"],
};

function buildResolverWithExclusions(
  exclusionRules: ExternalProductPricingExclusionRule[],
) {
  const attributeDependencies =
    buildProductAttributeDependenciesFromExternalPricing({
      attributeMappings: paperCoatingFoilMappings,
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: paperCoatingFoilInternalAttributes,
      pricingExclusionRules: exclusionRules,
      productAttributeOptions: paperCoatingFoilOptions,
    });

  const orderedProductAttributes = sortAttributeIdsByDependencies(
    ["paper", "foil", "coating"],
    attributeDependencies,
  );

  return createImportedMatrixCombinationResolver({
    attributeDependencies,
    externalAttributes: paperCoatingFoilExternalAttributes,
    internalAttributesById: paperCoatingFoilInternalAttributes,
    orderedProductAttributes,
    productAttributeOptions: paperCoatingFoilOptions,
    selectedMappings: paperCoatingFoilMappings,
  });
}

describe("createImportedMatrixCombinationResolver", () => {
  it("maps omitted supplier attributes to shorter internal combinations when scoped dependencies apply", () => {
    const resolveCombinationId = buildResolverWithExclusions([
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
          Coating: ["uv"],
        },
      },
    ]);

    expect(
      resolveCombinationId({
        "coating-id": "uv",
        "paper-id": "matt-150g",
      }),
    ).toBe("mat150-uv");
    expect(
      resolveCombinationId({
        Coating: "no-coating",
        Foil: "gloss-front",
        Paper: "matt-150g",
      }),
    ).toBe("mat150-none-gloss");
  });

  it("skips hidden attribute even when external config includes a value for it (was: return null)", () => {
    const resolveCombinationId = buildResolverWithExclusions([
      {
        omitAttributes: ["Foil"],
        when: {
          Paper: ["matt-150g"],
          Coating: ["uv"],
        },
      },
    ]);

    // External provider includes Foil despite exclusion rule saying it
    // should be omitted. The resolver must skip it, not fail.
    expect(
      resolveCombinationId({
        Coating: "uv",
        Foil: "gloss-front",
        Paper: "matt-150g",
      }),
    ).toBe("mat150-uv");
  });

  it("resolves all attributes when no dependency rules exist", () => {
    const resolve = createImportedMatrixCombinationResolver({
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: paperCoatingFoilInternalAttributes,
      orderedProductAttributes: ["paper", "coating", "foil"],
      productAttributeOptions: paperCoatingFoilOptions,
      selectedMappings: paperCoatingFoilMappings,
    });

    expect(
      resolve({ Paper: "matt-250g", Coating: "no-coating", Foil: "matt-front" }),
    ).toBe("mat250-none-mat");
  });

  it("returns DEFAULT_COMBINATION when no calculated attributes exist", () => {
    const nonCalculated = new Map(
      [...paperCoatingFoilInternalAttributes].map(([id, attr]) => [
        id,
        { ...attr, calculated: false },
      ]),
    );

    const resolve = createImportedMatrixCombinationResolver({
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: nonCalculated,
      orderedProductAttributes: ["paper", "coating", "foil"],
      productAttributeOptions: paperCoatingFoilOptions,
      selectedMappings: paperCoatingFoilMappings,
    });

    expect(resolve({ Paper: "matt-150g" })).toBe("default");
  });

  it("returns null when a required attribute cannot be resolved", () => {
    const resolve = createImportedMatrixCombinationResolver({
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: paperCoatingFoilInternalAttributes,
      orderedProductAttributes: ["paper", "coating", "foil"],
      productAttributeOptions: paperCoatingFoilOptions,
      selectedMappings: paperCoatingFoilMappings,
    });

    // Missing Coating and Foil → required but not resolvable
    expect(resolve({ Paper: "matt-150g" })).toBeNull();
  });

  it("returns null when resolved value is not in productAttributeOptions", () => {
    const restrictedOptions: Record<string, string[]> = {
      coating: ["uv", "none"],
      foil: ["mat", "gloss"],
      paper: ["mat250"], // mat150 deliberately excluded
    };

    const resolve = createImportedMatrixCombinationResolver({
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: paperCoatingFoilInternalAttributes,
      orderedProductAttributes: ["paper", "coating", "foil"],
      productAttributeOptions: restrictedOptions,
      selectedMappings: paperCoatingFoilMappings,
    });

    // Paper resolves to "mat150" which is not in restrictedOptions.paper
    expect(
      resolve({ Paper: "matt-150g", Coating: "uv", Foil: "matt-front" }),
    ).toBeNull();

    // Paper resolves to "mat250" which IS allowed
    expect(
      resolve({ Paper: "matt-250g", Coating: "uv", Foil: "matt-front" }),
    ).toBe("mat250-uv-mat");
  });

  it("returns null when resolved value is disabled by dependency rules", () => {
    const externalAttributes: ExternalAttribute[] = [
      {
        id: "size",
        name: "Size",
        options: [
          { label: "A3", value: "a3" },
          { label: "A4", value: "a4" },
        ],
        values: ["a3", "a4"],
      },
      {
        id: "finish",
        name: "Finish",
        options: [
          { label: "Gloss", value: "gloss" },
          { label: "Matte", value: "matte" },
        ],
        values: ["gloss", "matte"],
      },
    ];
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Size",
        internalAttributeId: "size",
        optionMappings: { a3: "a3", a4: "a4" },
      },
      {
        externalAttributeName: "Finish",
        internalAttributeId: "finish",
        optionMappings: { gloss: "gloss", matte: "matte" },
      },
    ];
    const internalAttrs = new Map<string, Attribute & { id: string }>([
      [
        "size",
        createInternalAttribute("size", [
          { label: "A3", value: "a3" },
          { label: "A4", value: "a4" },
        ]),
      ],
      [
        "finish",
        createInternalAttribute("finish", [
          { label: "Gloss", value: "gloss" },
          { label: "Matte", value: "matte" },
        ]),
      ],
    ]);

    // Finish depends on Size. When Size=a3, only "matte" is allowed.
    // When Size=a4, both are allowed.
    const attributeDependencies: Product["attributeDependencies"] = {
      finish: [
        {
          dependsOn: "size",
          dependencyValues: ["a3", "a4"],
          conditionalOptions: {
            a3: ["matte"],
            a4: ["gloss", "matte"],
          },
        },
      ],
    };

    const resolve = createImportedMatrixCombinationResolver({
      attributeDependencies,
      externalAttributes,
      internalAttributesById: internalAttrs,
      orderedProductAttributes: ["size", "finish"],
      productAttributeOptions: {
        finish: ["gloss", "matte"],
        size: ["a3", "a4"],
      },
      selectedMappings: mappings,
    });

    // Size=a3, Finish=gloss → gloss is disabled when size=a3
    expect(resolve({ Size: "a3", Finish: "gloss" })).toBeNull();
    // Size=a3, Finish=matte → OK
    expect(resolve({ Size: "a3", Finish: "matte" })).toBe("a3-matte");
    // Size=a4, Finish=gloss → OK (both allowed for a4)
    expect(resolve({ Size: "a4", Finish: "gloss" })).toBe("a4-gloss");
  });

  it("skips child when parent was skipped (chained dependency)", () => {
    // Paper → Coating (depends on paper) → Foil (depends on coating)
    // When paper=mat150, coating is hidden. When coating is hidden, foil
    // should also be hidden.
    const attributeDependencies: Product["attributeDependencies"] = {
      coating: [
        {
          dependsOn: "paper",
          dependencyValues: ["mat250"],
        },
      ],
      foil: [
        {
          dependsOn: "coating",
          dependencyValues: ["uv", "none"],
        },
      ],
    };

    const resolve = createImportedMatrixCombinationResolver({
      attributeDependencies,
      externalAttributes: paperCoatingFoilExternalAttributes,
      internalAttributesById: paperCoatingFoilInternalAttributes,
      orderedProductAttributes: ["paper", "coating", "foil"],
      productAttributeOptions: paperCoatingFoilOptions,
      selectedMappings: paperCoatingFoilMappings,
    });

    // Paper=mat150 → coating hidden → foil hidden → "mat150"
    expect(
      resolve({
        Paper: "matt-150g",
        Coating: "uv",
        Foil: "gloss-front",
      }),
    ).toBe("mat150");

    // Paper=mat250 → coating visible → foil visible → full combo
    expect(
      resolve({
        Paper: "matt-250g",
        Coating: "no-coating",
        Foil: "gloss-front",
      }),
    ).toBe("mat250-none-gloss");
  });

  it("uses attribute id to look up external values in configuration", () => {
    const resolveCombinationId = buildResolverWithExclusions([]);

    // Pass config values keyed by external attribute IDs
    // Shared fixture order (no deps) is: paper, foil, coating
    expect(
      resolveCombinationId({
        "coating-id": "no-coating",
        "foil-id": "matt-front",
        "paper-id": "matt-250g",
      }),
    ).toBe("mat250-mat-none");
  });
});
