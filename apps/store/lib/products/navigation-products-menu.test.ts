import type { NavigationProductsMenuProduct } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { buildNavigationProductsMenuCategories } from "./navigation-products-menu";

function createProduct(
  id: string,
  categoryId: string,
): NavigationProductsMenuProduct {
  return {
    categoryId,
    categoryName: categoryId,
    id,
    images: [],
    isNew: false,
    name: id,
    slug: id,
  };
}

describe("buildNavigationProductsMenuCategories", () => {
  it("builds a pruned category tree with branch product counts", () => {
    const categories = buildNavigationProductsMenuCategories({
      categories: [
        { id: "root", name: "Root", parentId: null },
        { id: "child", name: "Child", parentId: "root" },
        { id: "empty", name: "Empty", parentId: null },
      ],
      products: [createProduct("child-product", "child")],
    });

    expect(categories).toEqual([
      expect.objectContaining({
        id: "root",
        productCount: 1,
        products: [],
        children: [
          expect.objectContaining({
            id: "child",
            productCount: 1,
            products: [expect.objectContaining({ id: "child-product" })],
          }),
        ],
      }),
    ]);
  });

  it("keeps products with missing category records under a fallback root", () => {
    const categories = buildNavigationProductsMenuCategories({
      categories: [],
      products: [createProduct("orphan-product", "Orphan")],
    });

    expect(categories).toEqual([
      expect.objectContaining({
        id: "fallback:Orphan",
        name: "Orphan",
        productCount: 1,
      }),
    ]);
  });
});
