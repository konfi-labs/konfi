"use client";

import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { analytics, firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  CloseButton,
  createListCollection,
  Heading,
  Presence,
  Show,
  SimpleGrid,
  Stack,
} from "@chakra-ui/react";
import {
  Empty,
  ProductCard,
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@konfi/components";
import {
  db,
  get,
  getCategoryTranslation,
  getProductTranslations,
} from "@konfi/firebase";
import {
  CardProduct,
  CategorizedCardProducts,
  Category,
  CurrencyEnum,
  Product,
} from "@konfi/types";
import {
  formatPrice,
  getProductListingPrices,
  isPurchasable,
  isWithinLastMonth,
} from "@konfi/utils";
import { groupBy, orderBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useReducer } from "react";
import useSWR from "swr";

const PRICE_RANGE_COUNT = 5;

function calculatePriceRanges(
  products: CardProduct[],
): { name: string; value: string }[] {
  const prices = products
    .map((p) => {
      const priceStr = p.startingFrom?.formattedPrice
        .replace(/[^\d.,]/g, "")
        .replace(",", ".");
      if (!priceStr) return NaN;
      return parseFloat(priceStr);
    })
    .filter((price) => !isNaN(price));

  if (prices.length === 0) return [];

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Avoid division by zero when all prices are the same
  if (minPrice === maxPrice) {
    return [
      {
        name: "price",
        value: `${Math.round(minPrice)}-${Math.round(maxPrice)}`,
      },
    ];
  }

  const step = (maxPrice - minPrice) / PRICE_RANGE_COUNT;

  return Array.from({ length: PRICE_RANGE_COUNT }, (_, i) => {
    const start = Math.round(minPrice + step * i);
    const end =
      i === PRICE_RANGE_COUNT - 1
        ? Math.round(maxPrice)
        : Math.round(minPrice + step * (i + 1));
    return {
      name: "price",
      value: `${start}-${end}`,
    };
  });
}

type FilterState = { [key: string]: string };
type FilterAction = [{ type: string; payload: FilterState }];

function reducer(state: FilterState, action: FilterAction[0]): FilterState {
  if (action.type === "init") {
    if (areFilterStatesEqual(state, action.payload)) {
      return state;
    }

    return action.payload;
  }

  if (action.type === "update") {
    const filterUpdate = Object.entries(action.payload)[0];

    if (!filterUpdate) {
      return state;
    }

    const [filterName, filterValue] = filterUpdate;

    if (state[filterName] === filterValue) {
      return state;
    }

    return {
      ...state,
      [filterName]: filterValue,
    };
  }

  return state;
}

function areFilterStatesEqual(left: FilterState, right: FilterState): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

async function getB2BCategorizedCardProducts(
  ids: string[],
  lng: string,
  storeChannelId: string,
) {
  try {
    const where = (await import("firebase/firestore")).where;

    const result = await get<Product>(
      db.collectionGroup<Product>(firestore, `products`, 99, [
        where("active", "==", true),
        where("availability.published", "==", true),
        where("id", "in", ids),
      ]),
    );
    if (!result) return undefined;
    const [products] = result;

    // Fetch categories for translation
    const dbCategoriesResult = await get(
      db.query(
        firestore,
        `/channels/${storeChannelId}/categories`,
        99,
        undefined,
      ),
    );
    const [dbCategories] = dbCategoriesResult || [[]];

    // Filter purchasable products first
    const purchasableProducts = products.filter((product) =>
      isPurchasable(product),
    );

    // Collect unique product IDs and category IDs for parallel translation fetching
    const productIds = purchasableProducts.map((p) => p.id);
    const categoryRecordMap = new Map<string, Category>();
    const uniqueCategoryIds = new Set<string>();

    for (const product of purchasableProducts) {
      const categoryRecord = (dbCategories as Category[]).find(
        (cat: Category) => cat.name === product.category.name,
      );
      if (categoryRecord?.id) {
        categoryRecordMap.set(product.category.name, categoryRecord);
        uniqueCategoryIds.add(categoryRecord.id);
      }
    }

    // Fetch all translations in parallel (only if store channel is defined)
    const translationPromises = storeChannelId
      ? {
          products: productIds.map((productId) =>
            getProductTranslations(firestore, storeChannelId, productId, lng)
              .then((translations) => ({
                productId,
                translation: translations[0] || null,
              }))
              .catch(() => ({ productId, translation: null })),
          ),
          categories: Array.from(uniqueCategoryIds).map((categoryId) =>
            getCategoryTranslation(firestore, storeChannelId, categoryId, lng)
              .then((translation) => ({ categoryId, translation }))
              .catch(() => ({ categoryId, translation: null })),
          ),
        }
      : {
          products: [],
          categories: [],
        };

    const [productTranslationsResults, categoryTranslationsResults] =
      await Promise.all([
        Promise.all(translationPromises.products),
        Promise.all(translationPromises.categories),
      ]);

    // Create lookup maps for efficient translation access
    const productTranslationsMap = new Map(
      productTranslationsResults.map(({ productId, translation }) => [
        productId,
        translation,
      ]),
    );

    const categoryTranslationsMap = new Map(
      categoryTranslationsResults.map(({ categoryId, translation }) => [
        categoryId,
        translation,
      ]),
    );

    const categorizedCardProducts: CategorizedCardProducts = {};
    const cardProducts: CardProduct[] = [];

    // Apply translations to products
    for (const product of purchasableProducts) {
      // Apply product translation
      const productTranslation = productTranslationsMap.get(product.id);
      if (productTranslation) {
        product.name = productTranslation.name || product.name;
        product.description =
          productTranslation.description || product.description;
        if (productTranslation.seo) {
          product.seo = {
            ...product.seo,
            title: productTranslation.seo.title || product.seo.title,
            description:
              productTranslation.seo.description || product.seo.description,
          };
        }
        product.specialNotes =
          productTranslation.specialNotes || product.specialNotes;
      }

      // Apply category translation
      const categoryRecord = categoryRecordMap.get(product.category.name);
      if (categoryRecord?.id) {
        const categoryTranslation = categoryTranslationsMap.get(
          categoryRecord.id,
        );
        if (categoryTranslation) {
          product.category.name =
            categoryTranslation.name || product.category.name;
        }
      }

      const effectivePrices = getProductListingPrices(product);

      cardProducts.push({
        id: product.id,
        slug: `/b2b/products/${product.channelId}--${product.seo.slug}`,
        name: product.name,
        images: product.spec.images,
        isNew: isWithinLastMonth(product.availability.publication?.toDate()),
        categoryName: product.category.name,
        startingFrom: {
          formattedPrice:
            effectivePrices.lowPrice.value && effectivePrices.lowPrice.volume
              ? formatPrice(
                  effectivePrices.lowPrice.value,
                  CurrencyEnum.PLN,
                  effectivePrices.lowPrice.volume.value,
                  undefined,
                  lng,
                )
              : "",
          unit: product.prefferedUnit,
        },
        channelId: product.channelId,
      });
    }

    categorizedCardProducts["B2B"] = orderBy(cardProducts, ["name"], ["asc"]);
    return categorizedCardProducts;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export default function B2BProductsPage() {
  const { t } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const { customer, loading: customerLoading } = useAuth();
  const params = useParams();
  const lng = params.lng as string;

  const { data: b2bCategorizedCardProducts, isLoading } = useSWR(
    customer?.b2b && !isEmpty(customer?.linkedProductsIds)
      ? [customer.linkedProductsIds, lng, runtimeConfig.channelId]
      : null,
    ([ids, language, channel]: [string[], string, string]) =>
      getB2BCategorizedCardProducts(ids, language, channel),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const filters = useMemo(() => {
    if (!b2bCategorizedCardProducts) return undefined;

    // Collect all unique filter options from the products
    const allProducts = Object.values(b2bCategorizedCardProducts).flat();
    const filterOptions: { name: string; value: string }[] = [];

    // Get unique categories and ensure they are defined
    const categories = [
      ...new Set(allProducts.map((product) => product.categoryName)),
    ].filter((category): category is string => category !== undefined);
    filterOptions.push(
      ...categories.map((category) => ({ name: "category", value: category })),
    );

    // Get unique isNew values
    const hasNewProducts = allProducts.some((product) => product.isNew);
    const hasOldProducts = allProducts.some((product) => !product.isNew);

    if (hasNewProducts) filterOptions.push({ name: "isNew", value: "true" });
    if (hasOldProducts) filterOptions.push({ name: "isNew", value: "false" });

    // Add price range filters
    const priceRanges = calculatePriceRanges(allProducts);
    filterOptions.push(...priceRanges);

    // Group filters by their names using es-toolkit
    return groupBy(filterOptions, (item) => item.name);
  }, [b2bCategorizedCardProducts]);

  const [filtersState, setFiltersState] = useReducer<FilterState, FilterAction>(
    reducer,
    {},
  );

  // Init filters state
  useEffect(() => {
    if (!filters) return;
    const nextFiltersState: FilterState = {};
    const params = new URLSearchParams(window.location.search);

    for (const filter of Object.values(filters)) {
      const paramValue = params.get(filter[0].name);
      nextFiltersState[filter[0].name] = paramValue || "";
    }
    setFiltersState({ type: "init", payload: nextFiltersState });
  }, [filters]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    for (const filterState of Object.keys(filtersState)) {
      if (filtersState[filterState] === "") {
        params.delete(filterState);
      } else {
        params.set(filterState, filtersState[filterState]);
      }
    }

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [filtersState]);

  const filteredCategorizedProducts = useMemo(() => {
    if (!b2bCategorizedCardProducts) return undefined;

    let filtered = { ...b2bCategorizedCardProducts };

    // Filter by isNew status first (applies across all categories)
    if (filtersState.isNew && filtersState.isNew !== "") {
      const isNewValue = filtersState.isNew === "true";
      Object.keys(filtered).forEach((category) => {
        if (Array.isArray(filtered[category])) {
          filtered[category] = filtered[category].filter(
            (product) => product.isNew === isNewValue,
          );
        }
      });
    }

    // Filter by price range (applies across all categories)
    if (filtersState.price && filtersState.price !== "") {
      const priceRange = filtersState.price.split("-");
      if (priceRange.length === 2) {
        const minPrice = Number(priceRange[0]);
        const maxPrice = Number(priceRange[1]);

        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
          Object.keys(filtered).forEach((category) => {
            if (Array.isArray(filtered[category])) {
              filtered[category] = filtered[category].filter((product) => {
                const priceStr = product.startingFrom?.formattedPrice
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".");
                if (!priceStr) return false;
                const price = parseFloat(priceStr);
                if (isNaN(price)) return false;
                return price >= minPrice && price <= maxPrice;
              });
            }
          });
        }
      }
    }

    // Filter by category last (narrows down to specific category)
    if (filtersState.category && filtersState.category !== "") {
      filtered = {
        [filtersState.category]: filtered[filtersState.category] || [],
      };
    }

    // Remove categories with no products
    const filteredWithProducts = Object.entries(filtered).reduce(
      (acc, [category, products]) => {
        if (!isEmpty(products)) {
          acc[category] = products;
        }
        return acc;
      },
      {} as CategorizedCardProducts,
    );

    return filteredWithProducts;
  }, [b2bCategorizedCardProducts, filtersState]);

  if (customerLoading || isLoading) {
    return (
      <Empty
        title={t("common.loading", { defaultValue: "Loading..." })}
        description={t("products.loadingProducts", {
          defaultValue: "Loading products",
        })}
        icon={"category"}
      />
    );
  }

  if (!customer?.b2b || isEmpty(customer?.linkedProductsIds)) {
    return (
      <Empty
        title={t("b2b.noProducts", {
          defaultValue: "No B2B products available",
        })}
        description={t("b2b.contactUs", {
          defaultValue: "Please contact us to get access to B2B products",
        })}
        icon={"category"}
      />
    );
  }

  if (!b2bCategorizedCardProducts || isEmpty(b2bCategorizedCardProducts)) {
    return (
      <Empty
        title={t("promotions.noItems", { defaultValue: "No products" })}
        description={t("promotions.checkOtherCategories", {
          defaultValue: "Check other categories",
        })}
        icon={"category"}
      />
    );
  }

  return (
    <>
      <Stack direction={["column", "row"]} mb={"6"} gap={4}>
        {filters &&
          Object.keys(filters)?.map((filterName: string) => {
            const isFilterActive =
              filtersState[filterName] && filtersState[filterName] !== "";
            return (
              <Show
                key={filterName}
                when={filtersState[filterName] !== undefined}
              >
                <Box position={"relative"}>
                  <SelectRoot
                    collection={createListCollection({
                      items:
                        filters[filterName]?.map((filter) => ({
                          label:
                            filterName === "isNew"
                              ? filter.value === "true"
                                ? t("ProductFiltersIsNew.true", {
                                    defaultValue: "New",
                                  })
                                : t("ProductFiltersIsNew.false", {
                                    defaultValue: "All",
                                  })
                              : filter.value,
                          value: filter.value,
                        })) || [],
                    })}
                    size={"xs"}
                    width={["full", "175px"]}
                    value={
                      filtersState[filterName] &&
                      filtersState[filterName] !== ""
                        ? [filtersState[filterName]]
                        : []
                    }
                    onValueChange={(details) =>
                      setFiltersState({
                        type: "update",
                        payload: { [filterName]: details.value[0] },
                      })
                    }
                    variant={"subtle"}
                  >
                    <SelectTrigger>
                      <SelectValueText
                        placeholder={`${t("ProductFilters." + filterName)}`}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filters[filterName]?.map((option) => (
                        <SelectItem item={option} key={option.value}>
                          {filterName === "isNew"
                            ? option.value === "true"
                              ? t("ProductFiltersIsNew.true", {
                                  defaultValue: "New",
                                })
                              : t("ProductFiltersIsNew.false", {
                                  defaultValue: "All",
                                })
                            : option.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                  {isFilterActive && (
                    <CloseButton
                      onClick={() =>
                        setFiltersState({
                          type: "update",
                          payload: { [filterName]: "" },
                        })
                      }
                      size={"2xs"}
                      colorPalette={"primary"}
                      position={"absolute"}
                      variant={"solid"}
                      top={-3}
                      left={-3}
                    />
                  )}
                </Box>
              </Show>
            );
          })}
      </Stack>
      {filteredCategorizedProducts && !isEmpty(filteredCategorizedProducts) ? (
        Object.keys(filteredCategorizedProducts).map(
          (category: string, index: number) => (
            <Box key={category} asChild mt={index !== 0 ? "16" : undefined}>
              <Presence
                present={true}
                animationName={{ _open: "fade-in" }}
                animationDuration="moderate"
              >
                <Heading size={["2xl", "lg"]} mb={"4"}>
                  {category}
                </Heading>
                <SimpleGrid columns={[1, 2, 4]} gap={4}>
                  <Show
                    when={!isEmpty(filteredCategorizedProducts?.[category])}
                  >
                    {filteredCategorizedProducts?.[category]?.map(
                      (cardProduct: CardProduct) => (
                        <ProductCard
                          key={cardProduct.id}
                          cardProduct={cardProduct}
                          ratio={[2, 2, 1, 1]}
                          analytics={analytics}
                          t={t}
                          lng={lng}
                        />
                      ),
                    )}
                  </Show>
                  <Show when={isEmpty(filteredCategorizedProducts?.[category])}>
                    <Empty
                      title={t("promotions.noItems", {
                        defaultValue: "No products",
                      })}
                      description={t("promotions.checkOtherCategories", {
                        defaultValue: "Check other categories",
                      })}
                      icon={"category"}
                    />
                  </Show>
                </SimpleGrid>
              </Presence>
            </Box>
          ),
        )
      ) : (
        <Empty
          title={t("promotions.noItems", { defaultValue: "No products" })}
          description={t("promotions.checkOtherCategories", {
            defaultValue: "Check other categories",
          })}
          icon={"category"}
        />
      )}
    </>
  );
}
