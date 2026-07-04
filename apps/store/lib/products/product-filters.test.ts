import type { CardProduct, CategorizedCardProducts } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  filterCategorizedProducts,
  parseProductFilterSearchParams,
} from "./product-filters";

function createProduct(params: {
  categoryName: string;
  formattedPrice: string;
  id: string;
  isNew: boolean;
}): CardProduct {
  return {
    categoryName: params.categoryName,
    id: params.id,
    isNew: params.isNew,
    name: params.id,
    startingFrom: {
      formattedPrice: params.formattedPrice,
    },
  } as CardProduct;
}

describe("parseProductFilterSearchParams", () => {
  it("keeps only supported non-empty filter params", () => {
    expect(
      parseProductFilterSearchParams({
        category: "Cards",
        isNew: " ",
        price: ["10-20", "20-30"],
      }),
    ).toEqual({
      category: "Cards",
      price: "10-20",
    });
  });
});

describe("filterCategorizedProducts", () => {
  it("filters products by category, newness, and price without mutating input", () => {
    const products: CategorizedCardProducts = {
      Cards: [
        createProduct({
          categoryName: "Cards",
          formattedPrice: "12,00 zł",
          id: "card-new",
          isNew: true,
        }),
        createProduct({
          categoryName: "Cards",
          formattedPrice: "40,00 zł",
          id: "card-old",
          isNew: false,
        }),
      ],
      Flyers: [
        createProduct({
          categoryName: "Flyers",
          formattedPrice: "15,00 zł",
          id: "flyer-new",
          isNew: true,
        }),
      ],
    };

    expect(
      filterCategorizedProducts(products, {
        category: "Cards",
        isNew: "true",
        price: "10-20",
      }),
    ).toEqual({
      Cards: [products.Cards[0]],
    });
    expect(products.Cards).toHaveLength(2);
    expect(products.Flyers).toHaveLength(1);
  });

  it("removes empty categories after filtering", () => {
    const products: CategorizedCardProducts = {
      Cards: [
        createProduct({
          categoryName: "Cards",
          formattedPrice: "40,00 zł",
          id: "card-old",
          isNew: false,
        }),
      ],
    };

    expect(
      filterCategorizedProducts(products, {
        isNew: "true",
      }),
    ).toEqual({});
  });
});
