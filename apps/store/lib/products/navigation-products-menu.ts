import type {
  Category,
  NavigationProductsMenuCategory,
  NavigationProductsMenuProduct,
} from "@konfi/types";

type NavigationCategoryInput = Pick<
  Category,
  "id" | "name" | "parentId" | "path"
>;

function categorySort(
  left: NavigationProductsMenuCategory,
  right: NavigationProductsMenuCategory,
) {
  return left.name.localeCompare(right.name);
}

function productSort(
  left: NavigationProductsMenuProduct,
  right: NavigationProductsMenuProduct,
) {
  return left.name.localeCompare(right.name);
}

function withProductCounts(
  category: NavigationProductsMenuCategory,
): NavigationProductsMenuCategory | null {
  const children = category.children
    .map(withProductCounts)
    .filter((child): child is NavigationProductsMenuCategory => child !== null)
    .toSorted(categorySort);
  const productCount =
    category.products.length +
    children.reduce((count, child) => count + child.productCount, 0);

  if (productCount === 0) {
    return null;
  }

  return {
    ...category,
    children,
    productCount,
    products: category.products.toSorted(productSort),
  };
}

export function buildNavigationProductsMenuCategories(input: {
  categories: NavigationCategoryInput[];
  products: NavigationProductsMenuProduct[];
}): NavigationProductsMenuCategory[] {
  const nodes = new Map<string, NavigationProductsMenuCategory>();

  for (const category of input.categories) {
    nodes.set(category.id, {
      children: [],
      id: category.id,
      name: category.name,
      parentId: category.parentId ?? null,
      path: category.path,
      productCount: 0,
      products: [],
    });
  }

  for (const product of input.products) {
    const categoryId = product.categoryId ?? null;
    const categoryNode = categoryId ? nodes.get(categoryId) : undefined;

    if (categoryNode) {
      categoryNode.products.push(product);
      continue;
    }

    const fallbackCategoryName = product.categoryName?.trim();
    if (!fallbackCategoryName) {
      continue;
    }

    const fallbackId = `fallback:${fallbackCategoryName}`;
    const fallbackNode =
      nodes.get(fallbackId) ??
      ({
        children: [],
        id: fallbackId,
        name: fallbackCategoryName,
        parentId: null,
        productCount: 0,
        products: [],
      } satisfies NavigationProductsMenuCategory);

    fallbackNode.products.push(product);
    nodes.set(fallbackId, fallbackNode);
  }

  const roots: NavigationProductsMenuCategory[] = [];

  for (const category of nodes.values()) {
    if (
      category.parentId &&
      category.parentId !== category.id &&
      nodes.has(category.parentId)
    ) {
      nodes.get(category.parentId)?.children.push(category);
      continue;
    }

    roots.push(category);
  }

  return roots
    .map(withProductCounts)
    .filter(
      (category): category is NavigationProductsMenuCategory =>
        category !== null,
    )
    .toSorted(categorySort);
}
