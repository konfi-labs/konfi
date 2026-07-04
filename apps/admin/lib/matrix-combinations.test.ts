import { Attribute, AttributeInputTypeEnum } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  filterPricedMatrixCombinations,
  filterValidMatrixCombinations,
  generateDependencyAwareCombinations,
  getPricedMatrixCombinationIds,
  partitionMatrixPricesByVisibility,
} from "./matrix-combinations";
import { buildCombinationAttributes } from "./combination-parsing";

const MEMBER = {
  id: "member-1",
  name: "Admin",
};

const TIMESTAMP = Timestamp.now();

const createAttribute = ({
  calculated = true,
  id,
  optionValues,
}: {
  calculated?: boolean;
  id: string;
  optionValues: string[];
}): Attribute => ({
  id,
  name: id,
  createdBy: MEMBER,
  createdAt: TIMESTAMP,
  updatedBy: MEMBER,
  updatedAt: TIMESTAMP,
  active: true,
  calculated,
  required: false,
  format: false,
  options: optionValues.map((value) => ({
    label: value,
    value,
    customFormat: false,
    hidden: false,
  })),
  keywords: [],
  type: AttributeInputTypeEnum.DROPDOWN,
  trackStock: false,
});

describe("filterValidMatrixCombinations", () => {
  it("keeps valid chained dependent combinations even when global attribute order differs", () => {
    const combinations = [
      "matte-soft-gloss",
      "matte-hard-gloss",
      "gloss-soft-gloss",
    ];

    const result = filterValidMatrixCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["matte"],
        },
        lamination: {
          dependsOn: "finish",
          dependencyValues: ["soft"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish", "lamination"],
        attributeOptions: {
          finish: ["soft", "hard"],
          lamination: ["gloss"],
          paper: ["matte", "gloss"],
        },
        attributes: [
          createAttribute({ id: "lamination", optionValues: ["gloss"] }),
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
        ],
      }),
      combinations,
    });

    expect(result).toEqual(["matte-soft-gloss"]);
  });

  it("keeps shorter combinations when a dependent attribute is skipped before a later attribute", () => {
    const result = filterValidMatrixCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["gloss"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish", "varnish"],
        attributeOptions: {
          finish: ["soft", "hard"],
          paper: ["matte", "gloss"],
          varnish: ["spotUv"],
        },
        attributes: [
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
          createAttribute({ id: "varnish", optionValues: ["spotUv"] }),
        ],
      }),
      combinations: ["matte-spotUv", "gloss-soft-spotUv", "gloss-spotUv"],
    });

    expect(result).toEqual(["matte-spotUv", "gloss-soft-spotUv"]);
  });

  it("keeps combinations whose option values contain hyphens", () => {
    const result = filterValidMatrixCombinations({
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish"],
        attributeOptions: {
          finish: ["matt-front", "gloss-front"],
          paper: ["matt-150g", "gloss-250g"],
        },
        attributes: [
          createAttribute({
            id: "paper",
            optionValues: ["matt-150g", "gloss-250g"],
          }),
          createAttribute({
            id: "finish",
            optionValues: ["matt-front", "gloss-front"],
          }),
        ],
      }),
      combinations: ["matt-150g-gloss-front", "gloss-250g-matt-front"],
    });

    expect(result).toEqual(["matt-150g-gloss-front", "gloss-250g-matt-front"]);
  });

  it("keeps preserved priced combinations when a later calculated attribute no longer has explicit option selections", () => {
    const result = filterValidMatrixCombinations({
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["finish", "pages"],
        attributeOptions: {
          finish: ["matte"],
        },
        attributes: [
          createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "pages", optionValues: ["50", "100", "150"] }),
        ],
        missingOptionMode: "consume-single-token",
      }),
      combinations: ["matte-250"],
    });

    expect(result).toEqual(["matte-250"]);
  });
});

describe("filterPricedMatrixCombinations", () => {
  it("collects usable priced combinations without materializing the full matrix", () => {
    const result = getPricedMatrixCombinationIds({
      prices: [
        {
          value: 1000,
          combination: { id: "matte-soft", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: null,
          combination: { id: "gloss-soft", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: 900,
          combination: { id: "matte-hard", active: false, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
      ],
      volumes: [{ value: 10 }],
    });

    expect(result).toEqual(["matte-soft"]);
  });

  it("keeps combinations that have at least one usable price in the configured volume set", () => {
    const result = filterPricedMatrixCombinations({
      combinations: ["matte-soft", "matte-hard", "gloss-soft"],
      prices: [
        {
          value: 1000,
          combination: { id: "matte-soft", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: 1200,
          combination: { id: "matte-soft", active: true, customFormat: false },
          volume: { value: 20, deliveryTime: 2 },
        },
        {
          value: 1100,
          combination: { id: "matte-hard", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: null,
          combination: { id: "gloss-soft", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
      ],
      volumes: [{ value: 10 }, { value: 20 }],
    });

    expect(result).toEqual(["matte-soft", "matte-hard"]);
  });

  it("keeps partially priced combinations visible when later volumes have usable prices", () => {
    const result = filterPricedMatrixCombinations({
      combinations: ["a1"],
      prices: [
        {
          value: null,
          combination: { id: "a1", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: null,
          combination: { id: "a1", active: true, customFormat: false },
          volume: { value: 20, deliveryTime: 2 },
        },
        {
          value: 2500,
          combination: { id: "a1", active: true, customFormat: false },
          volume: { value: 30, deliveryTime: 2 },
        },
      ],
      volumes: [{ value: 10 }, { value: 20 }, { value: 30 }],
    });

    expect(result).toEqual(["a1"]);
  });

  it("falls back to all generated combinations when no combination has any usable price yet", () => {
    const combinations = ["matte-soft", "matte-hard", "gloss-soft"];

    const result = filterPricedMatrixCombinations({
      combinations,
      prices: [
        {
          value: null,
          combination: { id: "matte-soft", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: null,
          combination: { id: "matte-hard", active: true, customFormat: false },
          volume: { value: 20, deliveryTime: 2 },
        },
      ],
      volumes: [{ value: 10 }, { value: 20 }],
    });

    expect(result).toEqual(combinations);
  });
});

describe("partitionMatrixPricesByVisibility", () => {
  it("keeps hidden combination prices separate so editor filtering does not delete them", () => {
    const result = partitionMatrixPricesByVisibility({
      prices: [
        {
          value: 1000,
          combination: { id: "visible", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
        {
          value: 800,
          combination: { id: "hidden", active: true, customFormat: false },
          volume: { value: 10, deliveryTime: 2 },
        },
      ],
      visibleCombinations: ["visible"],
    });

    expect(result.visiblePrices).toHaveLength(1);
    expect(result.visiblePrices[0]?.combination?.id).toBe("visible");
    expect(result.hiddenPrices).toHaveLength(1);
    expect(result.hiddenPrices[0]?.combination?.id).toBe("hidden");
  });
});

describe("generateDependencyAwareCombinations", () => {
  it("generates full cross-product when there are no dependency rules", () => {
    const result = generateDependencyAwareCombinations({
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish"],
        attributeOptions: {
          paper: ["matte", "gloss"],
          finish: ["soft", "hard"],
        },
        attributes: [
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
        ],
      }),
    });

    expect(result).toEqual([
      "matte-soft",
      "matte-hard",
      "gloss-soft",
      "gloss-hard",
    ]);
  });

  it("generates shorter combos when a dependent attribute is skipped", () => {
    const result = generateDependencyAwareCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["gloss"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish", "varnish"],
        attributeOptions: {
          paper: ["matte", "gloss"],
          finish: ["soft", "hard"],
          varnish: ["spotUv"],
        },
        attributes: [
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
          createAttribute({ id: "varnish", optionValues: ["spotUv"] }),
        ],
      }),
    });

    // matte → finish skipped (matte not in dependencyValues) → varnish
    // gloss → finish active → varnish
    expect(result).toEqual([
      "matte-spotUv",
      "gloss-soft-spotUv",
      "gloss-hard-spotUv",
    ]);
  });

  it("excludes disabled child options via conditional options", () => {
    const result = generateDependencyAwareCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["matte", "gloss"],
          conditionalOptions: {
            matte: ["soft"],
          },
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish"],
        attributeOptions: {
          paper: ["matte", "gloss"],
          finish: ["soft", "hard"],
        },
        attributes: [
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
        ],
      }),
    });

    // matte → finish conditionalOptions restricts to ["soft"] → "hard" disabled
    // gloss → no conditionalOptions entry → both allowed
    expect(result).toEqual(["matte-soft", "gloss-soft", "gloss-hard"]);
  });

  it("handles chained dependencies across three attributes", () => {
    const result = generateDependencyAwareCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["matte"],
        },
        lamination: {
          dependsOn: "finish",
          dependencyValues: ["soft"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish", "lamination"],
        attributeOptions: {
          paper: ["matte", "gloss"],
          finish: ["soft", "hard"],
          lamination: ["glossy"],
        },
        attributes: [
          createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
          createAttribute({
            id: "lamination",
            optionValues: ["glossy"],
          }),
        ],
      }),
    });

    // matte → finish active (dependencyValues: ["matte"])
    //   matte-soft → lamination active (dependencyValues: ["soft"])
    //   matte-hard → lamination skipped (hard not in ["soft"])
    // gloss → finish skipped → lamination skipped (finish not resolved)
    expect(result).toEqual(["matte-soft-glossy", "matte-hard", "gloss"]);
  });

  it("handles values containing hyphens", () => {
    const result = generateDependencyAwareCombinations({
      attributeDependencies: {
        finish: {
          dependsOn: "paper",
          dependencyValues: ["matt-150g"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["paper", "finish"],
        attributeOptions: {
          paper: ["matt-150g", "gloss-250g"],
          finish: ["matt-front"],
        },
        attributes: [
          createAttribute({
            id: "paper",
            optionValues: ["matt-150g", "gloss-250g"],
          }),
          createAttribute({
            id: "finish",
            optionValues: ["matt-front"],
          }),
        ],
      }),
    });

    expect(result).toEqual(["matt-150g-matt-front", "gloss-250g"]);
  });

  it("returns empty array when all options are disabled by dependency rules", () => {
    const result = generateDependencyAwareCombinations({
      attributeDependencies: {
        paper: {
          dependsOn: "size",
          dependencyValues: ["__never__"],
        },
      },
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["size", "paper"],
        attributeOptions: {
          size: ["a4"],
          paper: ["matte"],
        },
        attributes: [
          createAttribute({ id: "size", optionValues: ["a4"] }),
          createAttribute({ id: "paper", optionValues: ["matte"] }),
        ],
      }),
    });

    // paper depends on size with value "__never__" → paper always skipped
    expect(result).toEqual(["a4"]);
  });

  it("deduplicates option values", () => {
    const result = generateDependencyAwareCombinations({
      combinationAttributes: [
        {
          id: "paper",
          name: "Paper",
          calculated: true,
          options: [
            { value: "matte", label: "Matte", customFormat: false },
            { value: "matte", label: "Matte Dup", customFormat: false },
            { value: "gloss", label: "Gloss", customFormat: false },
          ],
        },
      ],
    });

    expect(result).toEqual(["matte", "gloss"]);
  });

  it("skips consume-single-token attributes since they have no enumerable options", () => {
    const result = generateDependencyAwareCombinations({
      combinationAttributes: buildCombinationAttributes({
        attributeIds: ["finish", "pages"],
        attributeOptions: {
          finish: ["matte"],
        },
        attributes: [
          createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
          createAttribute({ id: "pages", optionValues: ["50", "100"] }),
        ],
        missingOptionMode: "consume-single-token",
      }),
    });

    // pages has no explicit selection → consume-single-token → skipped
    expect(result).toEqual(["matte"]);
  });

  it("all generated combos pass through filterValidMatrixCombinations", () => {
    const attributeDependencies = {
      finish: {
        dependsOn: "paper",
        dependencyValues: ["gloss"],
      },
    };
    const combinationAttributes = buildCombinationAttributes({
      attributeIds: ["paper", "finish", "varnish"],
      attributeOptions: {
        paper: ["matte", "gloss"],
        finish: ["soft", "hard"],
        varnish: ["spotUv"],
      },
      attributes: [
        createAttribute({ id: "paper", optionValues: ["matte", "gloss"] }),
        createAttribute({ id: "finish", optionValues: ["soft", "hard"] }),
        createAttribute({ id: "varnish", optionValues: ["spotUv"] }),
      ],
    });

    const generated = generateDependencyAwareCombinations({
      attributeDependencies,
      combinationAttributes,
    });

    const filtered = filterValidMatrixCombinations({
      attributeDependencies,
      combinationAttributes,
      combinations: generated,
    });

    // Every generated combo should survive the filter
    expect(filtered).toEqual(generated);
  });
});
