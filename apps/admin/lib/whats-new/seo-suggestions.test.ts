import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  isSeoDraftGroundedInProduct,
  normalizeSeoDraft,
  sortSeoSuggestions,
} from "./seo-suggestions.utils";

describe("seo-suggestions", () => {
  it("normalizes empty SEO drafts with product defaults", () => {
    expect(normalizeSeoDraft(undefined, "Baner Reklamowy")).toEqual({
      title: "Baner Reklamowy",
      description: "",
    });
  });

  it("preserves provided title and description", () => {
    expect(
      normalizeSeoDraft(
        {
          title: "Baner premium",
          description: "Opis",
        },
        "Baner Reklamowy",
      ),
    ).toEqual({
      title: "Baner premium",
      description: "Opis",
    });
  });

  it("sorts SEO suggestions by product name", () => {
    const suggestions = sortSeoSuggestions([
      {
        productId: "2",
        productName: "Wizytówki",
        currentSeo: { title: "", description: "" },
        suggestedSeo: { title: "", description: "" },
        research: { [Locale.en]: "Cards", [Locale.pl]: "Wizytówki" },
      },
      {
        productId: "1",
        productName: "Banery",
        currentSeo: { title: "", description: "" },
        suggestedSeo: { title: "", description: "" },
        research: { [Locale.en]: "Banners", [Locale.pl]: "Banery" },
      },
    ]);

    expect(suggestions.map((suggestion) => suggestion.productId)).toEqual([
      "1",
      "2",
    ]);
  });

  it("accepts SEO drafts grounded in the product name", () => {
    expect(
      isSeoDraftGroundedInProduct(
        {
          title: "Banery reklamowe na wymiar",
          description: "Druk banerów do promocji lokalnej firmy.",
        },
        {
          name: "Banery reklamowe",
        },
      ),
    ).toBe(true);
  });

  it("rejects SEO drafts for product types outside the product facts", () => {
    expect(
      isSeoDraftGroundedInProduct(
        {
          title: "Fotoksiążki na Dzień Matki",
          description: "Personalizowane albumy ze zdjęciami.",
        },
        {
          name: "Banery reklamowe",
          category: "Reklama zewnętrzna",
          keywords: ["druk wielkoformatowy"],
        },
      ),
    ).toBe(false);
  });
});
