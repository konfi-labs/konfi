import type { CardProduct, CategorizedCardProducts } from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";

export const productFilterParamKeys = ["category", "isNew", "price"] as const;

export type ProductFilterParam = (typeof productFilterParamKeys)[number];
export type ProductFilterState = Partial<Record<ProductFilterParam, string>>;

type ProductFilterSearchParams =
  | URLSearchParams
  | Partial<Record<ProductFilterParam, string | string[] | undefined>>
  | undefined;

function readSearchParam(
  searchParams: ProductFilterSearchParams,
  key: ProductFilterParam,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  const value =
    searchParams instanceof URLSearchParams
      ? searchParams.get(key)
      : searchParams[key];
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed || undefined;
}

function readProductPrice(product: CardProduct): number | undefined {
  const priceText = product.startingFrom?.formattedPrice
    .replace(/[^\d.,]/g, "")
    .replace(",", ".");

  if (!priceText) {
    return undefined;
  }

  const price = Number.parseFloat(priceText);

  return Number.isNaN(price) ? undefined : price;
}

export function parseProductFilterSearchParams(
  searchParams: ProductFilterSearchParams,
): ProductFilterState {
  const filters: ProductFilterState = {};

  for (const key of productFilterParamKeys) {
    const value = readSearchParam(searchParams, key);

    if (value) {
      filters[key] = value;
    }
  }

  return filters;
}

export function filterCategorizedProducts(
  categorizedCardProducts: CategorizedCardProducts | undefined,
  filters: ProductFilterState,
): CategorizedCardProducts | undefined {
  if (!categorizedCardProducts) {
    return undefined;
  }

  let filtered: CategorizedCardProducts = Object.fromEntries(
    Object.entries(categorizedCardProducts).map(([category, products]) => [
      category,
      [...products],
    ]),
  ) as CategorizedCardProducts;

  if (filters.isNew) {
    const isNewValue = filters.isNew === "true";
    filtered = Object.fromEntries(
      Object.entries(filtered).map(([category, products]) => [
        category,
        products.filter((product) => product.isNew === isNewValue),
      ]),
    ) as CategorizedCardProducts;
  }

  if (filters.price) {
    const [minPriceText, maxPriceText] = filters.price.split("-");
    const minPrice = Number(minPriceText);
    const maxPrice = Number(maxPriceText);

    if (!Number.isNaN(minPrice) && !Number.isNaN(maxPrice)) {
      filtered = Object.fromEntries(
        Object.entries(filtered).map(([category, products]) => [
          category,
          products.filter((product) => {
            const price = readProductPrice(product);

            return (
              price !== undefined && price >= minPrice && price <= maxPrice
            );
          }),
        ]),
      ) as CategorizedCardProducts;
    }
  }

  if (filters.category) {
    filtered = {
      [filters.category]: filtered[filters.category] || [],
    };
  }

  return Object.entries(filtered).reduce<CategorizedCardProducts>(
    (result, [category, products]) => {
      if (!isEmpty(products)) {
        result[category] = products;
      }

      return result;
    },
    {},
  );
}
