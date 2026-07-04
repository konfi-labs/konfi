import { describe, expect, it } from "vitest";
import {
  getSemanticSupplementalProductOptions,
  rankProductGroupedLocalSearchOptions,
  type ProductGroupedLocalSearchOption,
} from "./product-grouped-local-search";

function option(
  value: string,
  label: string,
  overrides: Partial<ProductGroupedLocalSearchOption> = {},
): ProductGroupedLocalSearchOption {
  return {
    group: "Products",
    label,
    value,
    ...overrides,
  };
}

describe("product grouped local Fuse search", () => {
  it("keeps exact matches ahead of prefix and fuzzy matches", () => {
    const results = rankProductGroupedLocalSearchOptions(
      [
        option("prefix", "Business Cards Premium"),
        option("fuzzy", "Buisness Crads"),
        option("exact", "Business Cards"),
      ],
      "business cards",
    );

    expect(results.map((item) => item.value)).toEqual([
      "exact",
      "prefix",
      "fuzzy",
    ]);
  });

  it("matches initials before falling back to Fuse typo matches", () => {
    const results = rankProductGroupedLocalSearchOptions(
      [
        option("typo", "Buisness Crads"),
        option("initials", "Business Cards Premium"),
      ],
      "bcp",
    );

    expect(results.map((item) => item.value)).toEqual(["initials"]);
  });

  it("uses existing product usage as the tie-breaker within the same rank", () => {
    const results = rankProductGroupedLocalSearchOptions(
      [
        option("low-use", "Flyer", { channelName: "Retail" }),
        option("high-use", "Flyer", { channelName: "Wholesale" }),
      ],
      "flyer",
      { "high-use": 9, "low-use": 1 },
    );

    expect(results.map((item) => item.value)).toEqual(["high-use", "low-use"]);
  });

  it("searches channel and attribute text with weighted Fuse keys", () => {
    const results = rankProductGroupedLocalSearchOptions(
      [
        option("plain", "Poster"),
        option("attribute", "Poster", {
          attributeText: "Matte recycled paper",
        }),
      ],
      "recyled",
    );

    expect(results.map((item) => item.value)).toEqual(["attribute"]);
  });

  it("adds semantic-only hits after local Fuse matches with the semantic group", () => {
    const local = [option("local", "Business Cards")];
    const semantic = [
      option("local", "Business Cards"),
      option("semantic", "Corporate Stationery"),
    ];

    expect(
      getSemanticSupplementalProductOptions({
        localOptions: local,
        semanticGroup: "Semantic matches",
        semanticOptions: semantic,
      }),
    ).toEqual([
      {
        group: "Semantic matches",
        label: "Corporate Stationery",
        value: "semantic",
      },
    ]);
  });
});
