import { describe, expect, it, vi } from "vitest";
import { CurrencyEnum, PriceTypeEnum, Unit } from "@konfi/types";
import type { Product } from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import {
  rankProductSearchResults,
  scoreProductSearchMatch,
  selectProductSearchCandidates,
} from "./product-discovery";

vi.mock("server-only", () => ({}));

function purchasableProduct(overrides: Partial<Product> = {}): Product {
  return {
    active: true,
    allowCustomPrice: false,
    attributeOptions: {},
    attributes: [],
    availability: {
      availableForPurchase: true,
      published: true,
      publication: { toDate: () => new Date("2020-01-01") },
    },
    category: {
      id: "category-1",
      name: "Business cards",
    },
    channelId: "channel-1",
    createdAt: new Date(),
    createdBy: { id: "user-1", name: "Admin" },
    customSize: false,
    defaultPrice: {
      combination: { id: DEFAULT_COMBINATION, name: "Default" },
      currency: CurrencyEnum.PLN,
      value: 1000,
    },
    description: "Premium cards",
    difficulty: 1,
    highPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    id: "cards",
    keywords: [],
    linkedChannels: [],
    lowPrice: { currency: CurrencyEnum.PLN, value: 1000 },
    name: "Business cards",
    prefferedUnit: Unit.PCS,
    priceType: PriceTypeEnum.SINGLE,
    prices: [
      {
        combination: { id: DEFAULT_COMBINATION, name: "Default" },
        currency: CurrencyEnum.PLN,
        value: 1000,
      },
    ],
    productType: null,
    recommended: false,
    seo: {
      description: "",
      slug: "business-cards",
      title: "Business cards",
    },
    shipping: { types: [] },
    spec: {
      defaultOrder: 100,
      images: [],
      maximumOrder: 10000,
      minimumOrder: 1,
      step: 1,
    },
    updatedAt: new Date(),
    updatedBy: { id: "user-1", name: "Admin" },
    volumes: [],
    ...overrides,
  } as Product;
}

describe("product discovery", () => {
  it("scores product name, category, description, SEO, and keywords", () => {
    const product = purchasableProduct({
      category: { id: "posters", name: "Posters" },
      description: "Large format event prints",
      keywords: ["b1", "festival"],
      name: "Standard posters",
      seo: {
        description: "Promotional wall prints",
        slug: "standard-posters",
        title: "Poster printing",
      },
    });

    expect(
      scoreProductSearchMatch("festival b1 posters", product),
    ).toBeGreaterThan(0);
    expect(scoreProductSearchMatch("wall prints", product)).toBeGreaterThan(0);
  });

  it("ranks full-text matches before unrelated products", () => {
    const products = [
      purchasableProduct({
        id: "cards",
        name: "Business cards",
      }),
      purchasableProduct({
        category: { id: "posters", name: "Posters" },
        id: "posters",
        keywords: ["b1", "b2"],
        name: "Standard posters",
      }),
    ];

    expect(rankProductSearchResults("B1 poster", products)[0].id).toBe(
      "posters",
    );
  });

  it("uses full-text matching when indexed search has no hits", () => {
    const result = selectProductSearchCandidates({
      indexedProductIds: [],
      products: [
        purchasableProduct({ id: "cards", name: "Business cards" }),
        purchasableProduct({
          id: "leaflets",
          keywords: ["ulotki"],
          name: "Leaflets",
        }),
      ],
      query: "ulotki",
    });

    expect(result.fullTextMatched).toBe(true);
    expect(result.indexedMatched).toBe(false);
    expect(result.products.map((product) => product.id)).toEqual(["leaflets"]);
  });

  it("keeps linked-channel product candidates and filters inactive products", () => {
    const result = selectProductSearchCandidates({
      products: [
        purchasableProduct({
          channelId: "source-channel",
          id: "linked-poster",
          linkedChannels: ["channel-1"],
          name: "Linked posters",
        }),
        purchasableProduct({
          active: false,
          id: "inactive-poster",
          name: "Inactive posters",
        }),
      ],
      query: "posters",
    });

    expect(result.products.map((product) => product.id)).toEqual([
      "linked-poster",
    ]);
  });

  it("honors result limits", () => {
    const result = selectProductSearchCandidates({
      limit: 1,
      products: [
        purchasableProduct({ id: "poster-1", name: "Poster one" }),
        purchasableProduct({ id: "poster-2", name: "Poster two" }),
      ],
      query: "poster",
    });

    expect(result.products).toHaveLength(1);
  });
});
