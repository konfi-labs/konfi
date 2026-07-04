"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { analytics } from "@/lib/firebase/clientApp";
import {
  filterCategorizedProducts,
  parseProductFilterSearchParams,
  productFilterParamKeys,
  type ProductFilterParam,
} from "@/lib/products/product-filters";
import {
  Alert,
  Box,
  Button,
  CloseButton,
  createListCollection,
  HStack,
  Heading,
  Link,
  Presence,
  Show,
  SimpleGrid,
  Stack,
  Text,
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
import { CardProduct, CategorizedCardProducts } from "@konfi/types";
import { groupBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

interface Props {
  categorizedCardProducts?: CategorizedCardProducts;
  lng: string;
}

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

export default function ProductsPage({ categorizedCardProducts, lng }: Props) {
  const { t } = useT();
  const { customer } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtersState = useMemo(
    () => parseProductFilterSearchParams(searchParams),
    [searchParams],
  );

  const filters = useMemo(() => {
    if (!categorizedCardProducts) return undefined;

    // Collect all unique filter options from the products
    const allProducts = Object.values(categorizedCardProducts).flat();
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
  }, [categorizedCardProducts]);

  const updateFilter = (filterName: ProductFilterParam, value?: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    const trimmed = value?.trim();

    if (trimmed) {
      nextParams.set(filterName, trimmed);
    } else {
      nextParams.delete(filterName);
    }

    const queryString = nextParams.toString();
    const target = queryString ? `${pathname}?${queryString}` : pathname;

    router.replace(target as Route, { scroll: false });
  };

  const clearFilters = () => {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const key of productFilterParamKeys) {
      nextParams.delete(key);
    }

    const queryString = nextParams.toString();
    const target = queryString ? `${pathname}?${queryString}` : pathname;

    router.replace(target as Route, { scroll: false });
  };

  const filteredCategorizedProducts = useMemo(
    () => filterCategorizedProducts(categorizedCardProducts, filtersState),
    [categorizedCardProducts, filtersState],
  );

  const hasActiveFilters = useMemo(
    () => Object.values(filtersState).some(Boolean),
    [filtersState],
  );

  const filteredProductCount = useMemo(() => {
    if (!filteredCategorizedProducts) return 0;
    return Object.values(filteredCategorizedProducts).reduce(
      (sum, products) => sum + products.length,
      0,
    );
  }, [filteredCategorizedProducts]);

  if (!categorizedCardProducts) return null;

  return (
    <>
      {customer?.b2b && (
        <Alert.Root status="info" mb={6} borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("products.b2bCustomerNotice.title", {
                defaultValue: "B2B Customer",
              })}
            </Alert.Title>
            <Alert.Description
              justifyContent="space-between"
              display="flex"
              flexDirection={["column", "row"]}
              gap={2}
            >
              {t("products.b2bCustomerNotice.description", {
                defaultValue: "You have access to special B2B pricing. ",
              })}
              <Link
                fontSize={"xl"}
                mr={2}
                href={`/${lng}/b2b/products`}
                colorPalette="blue"
                fontWeight="semibold"
              >
                {t("products.b2bCustomerNotice.link", {
                  defaultValue: "View B2B Products",
                })}
              </Link>
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Stack direction={["column", "row"]} mb={"6"} gap={4}>
        {filters &&
          Object.keys(filters)
            .filter((filterName): filterName is ProductFilterParam =>
              productFilterParamKeys.includes(filterName as ProductFilterParam),
            )
            .map((filterName) => {
              const isFilterActive =
                filtersState[filterName] && filtersState[filterName] !== "";
              return (
                <Show key={filterName} when={Boolean(filters[filterName])}>
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
                        updateFilter(filterName, details.value[0])
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
                        onClick={() => updateFilter(filterName)}
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
        {hasActiveFilters && (
          <Button
            size={"xs"}
            variant={"ghost"}
            colorPalette={"primary"}
            onClick={clearFilters}
          >
            {t("products.clearAllFilters", {
              defaultValue: "Clear all",
            })}
          </Button>
        )}
      </Stack>
      {hasActiveFilters && (
        <HStack mb={4}>
          <Text fontSize={"sm"} color={"gray.500"}>
            {t("products.filteredCount", {
              defaultValue: "{{count}} products found",
              count: filteredProductCount,
            })}
          </Text>
        </HStack>
      )}
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
                      (cardProduct: CardProduct, productIndex: number) => (
                        <ProductCard
                          key={cardProduct.id}
                          cardProduct={cardProduct}
                          ratio={[2, 2, 1, 1]}
                          analytics={analytics}
                          prioritizeImage={index === 0 && productIndex === 0}
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
          title={t("products.noResults", {
            defaultValue: "No products match your filters",
          })}
          description={t("products.noResultsDescription", {
            defaultValue:
              "Try removing some filters or check other categories.",
          })}
          icon={"category"}
        />
      )}
    </>
  );
}
