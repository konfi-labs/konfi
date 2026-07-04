"use client";

import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { readRuntimeString } from "@/lib/runtime-config";
import {
  Box,
  Button,
  GridItem,
  Menu,
  Portal,
  Separator,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink, LinkOverlay, MaterialSymbol } from "@konfi/components";
import type {
  NavigationProductsMenuCategory,
  NavigationProductsMenuPayload,
  NavigationProductsMenuProduct,
} from "@konfi/types";
import { STORE_CONTACT, STORE_PRODUCTS } from "@konfi/utils";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";
import {
  ProductsMenuCategorySkeleton,
  ProductsMenuProductSkeleton,
} from "./ProductsMenuLoadingSkeleton";

async function fetchNavigationProducts(
  url: string,
): Promise<NavigationProductsMenuPayload | null> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load navigation products");
  }

  return (await response.json()) as NavigationProductsMenuPayload | null;
}

function flattenNavigationCategories(
  categories: NavigationProductsMenuCategory[],
): NavigationProductsMenuCategory[] {
  return categories.flatMap((category) => [
    category,
    ...flattenNavigationCategories(category.children),
  ]);
}

function findNavigationCategory(
  categories: NavigationProductsMenuCategory[],
  categoryId: string,
): NavigationProductsMenuCategory | undefined {
  for (const category of categories) {
    if (category.id === categoryId) {
      return category;
    }

    const child = findNavigationCategory(category.children, categoryId);

    if (child) {
      return child;
    }
  }

  return undefined;
}

function findNavigationRootCategoryId(
  categories: NavigationProductsMenuCategory[],
  categoryId: string,
): string {
  for (const category of categories) {
    if (category.id === categoryId) {
      return category.id;
    }

    if (findNavigationCategory(category.children, categoryId)) {
      return category.id;
    }
  }

  return "";
}

function getDefaultNavigationCategoryId(
  category: NavigationProductsMenuCategory | undefined,
): string {
  return category?.children[0]?.id ?? category?.id ?? "";
}

function collectNavigationProducts(
  category: NavigationProductsMenuCategory | undefined,
): NavigationProductsMenuProduct[] {
  if (!category) {
    return [];
  }

  const productsById = new Map<string, NavigationProductsMenuProduct>();

  for (const product of category.products) {
    productsById.set(product.id, product);
  }

  for (const child of category.children) {
    for (const product of collectNavigationProducts(child)) {
      productsById.set(product.id, product);
    }
  }

  return Array.from(productsById.values()).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export default function ProductsMenu({ lng }: { lng: string }) {
  const { t } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const pathname = usePathname();
  const [categoryId, setCategoryId] = useState("");
  const [open, setOpen] = useState(false);
  const { data: navigationProducts, isLoading } = useSWRImmutable(
    open ? `/api/navigation-products?lng=${encodeURIComponent(lng)}` : null,
    fetchNavigationProducts,
  );
  const rootCategoryItems = useMemo(
    () => navigationProducts?.categories ?? [],
    [navigationProducts],
  );
  const categoryItems = useMemo(
    () => flattenNavigationCategories(rootCategoryItems),
    [rootCategoryItems],
  );
  const activeRootCategoryId = useMemo(
    () => findNavigationRootCategoryId(rootCategoryItems, categoryId),
    [categoryId, rootCategoryItems],
  );
  const activeRootCategory = useMemo(
    () => findNavigationCategory(rootCategoryItems, activeRootCategoryId),
    [activeRootCategoryId, rootCategoryItems],
  );
  const visibleSubcategories = activeRootCategory?.children ?? [];
  const activeRootProducts = activeRootCategory?.products ?? [];
  const selectedCategory = useMemo(
    () => findNavigationCategory(rootCategoryItems, categoryId),
    [categoryId, rootCategoryItems],
  );
  const selectedProducts = useMemo(
    () => collectNavigationProducts(selectedCategory),
    [selectedCategory],
  );
  const middlePaneProducts =
    visibleSubcategories.length > 0 ? activeRootProducts : selectedProducts;
  const rightPaneProducts =
    visibleSubcategories.length > 0 ? selectedProducts : [];
  const contactMail =
    readRuntimeString(runtimeConfig.contact, "contactMail", "email", "mail") ??
    process.env.NEXT_PUBLIC_CONTACT_MAIL;

  useEffect(() => {
    if (categoryItems.length === 0) {
      setCategoryId("");
      return;
    }

    if (!categoryItems.some((category) => category.id === categoryId)) {
      setCategoryId(getDefaultNavigationCategoryId(rootCategoryItems[0]));
    }
  }, [categoryItems, categoryId, rootCategoryItems]);

  function handleCategoryChange(id: string) {
    setCategoryId(id);
  }

  function handleRootCategoryChange(category: NavigationProductsMenuCategory) {
    setCategoryId(getDefaultNavigationCategoryId(category));
  }

  return (
    <>
      <Menu.Root
        open={open}
        onOpenChange={({ open: isMenuOpen }) => setOpen(isMenuOpen)}
        lazyMount
      >
        <Menu.Trigger
          mx={2}
          asChild
          title={t("store.navigation.products", {
            defaultValue: "Products",
            lng,
          })}
        >
          <Button
            aria-label={t("store.navigation.products", {
              defaultValue: "Products",
              lng,
            })}
            variant={
              pathname?.includes(STORE_PRODUCTS)
                ? open
                  ? "ghost"
                  : "subtle"
                : "ghost"
            }
            colorPalette={
              pathname?.includes(STORE_PRODUCTS) || open ? "primary" : "gray"
            }
          >
            {t("store.navigation.products", { defaultValue: "Products", lng })}
            <MaterialSymbol
              data-state={open ? "open" : "closed"}
              rotate={open ? "180deg" : "0deg"}
              paddingTop={open ? "4px" : "0px"}
              transition={"rotate .3s"}
            >
              expand_more
            </MaterialSymbol>
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content
              p={0}
              aria-busy={isLoading}
              w={"min(1180px, calc(100vw - 2rem))"}
              maxW={"calc(100vw - 2rem)"}
            >
              <Box
                p={4}
                transition={
                  "width 180ms ease, height 180ms ease, inline-size 180ms ease, block-size 180ms ease"
                }
                _motionReduce={{ transition: "none" }}
                css={{
                  "@supports (interpolate-size: allow-keywords)": {
                    "&": {
                      interpolateSize: "allow-keywords",
                    },
                  },
                }}
              >
                <SimpleGrid columns={3} gap={0}>
                  <GridItem
                    colSpan={1}
                    borderRight={"1px solid"}
                    borderColor={{
                      base: "blackAlpha.200",
                      _dark: "whiteAlpha.200",
                    }}
                    pr={5}
                  >
                    <VStack align={"stretch"} gap={2}>
                      {isLoading ? (
                        <ProductsMenuCategorySkeleton
                          label={t("store.navigation.loadingProducts", {
                            defaultValue: "Loading products…",
                            lng,
                          })}
                        />
                      ) : (
                        rootCategoryItems.length > 0 &&
                        rootCategoryItems.map((category) => (
                          <Button
                            onMouseEnter={() =>
                              handleRootCategoryChange(category)
                            }
                            onFocus={() => handleRootCategoryChange(category)}
                            onClick={() => handleRootCategoryChange(category)}
                            key={category.id}
                            variant={
                              category.id === activeRootCategoryId
                                ? "solid"
                                : "ghost"
                            }
                            colorPalette={"gray"}
                            bg={
                              activeRootCategoryId === category.id
                                ? {
                                    base: "blackAlpha.200",
                                    _dark: "whiteAlpha.200",
                                  }
                                : "transparent"
                            }
                            color={{ base: "black", _dark: "white" }}
                            _hover={{
                              bg: {
                                base: "blackAlpha.200",
                                _dark: "whiteAlpha.200",
                              },
                            }}
                            _active={{
                              bg: {
                                base: "blackAlpha.200",
                                _dark: "whiteAlpha.200",
                              },
                            }}
                            _focus={{
                              bg: {
                                base: "blackAlpha.200",
                                _dark: "whiteAlpha.200",
                              },
                            }}
                            justifyContent={"space-between"}
                            pl={3}
                            textAlign={"left"}
                            whiteSpace={"normal"}
                            width={"100%"}
                          >
                            <Text as={"span"} flex={"1"} textAlign={"left"}>
                              {category.name}
                            </Text>
                            <Text
                              as={"span"}
                              fontSize={"xs"}
                              opacity={0.64}
                              pl={2}
                            >
                              {category.productCount}
                            </Text>
                          </Button>
                        ))
                      )}
                      <ButtonLink
                        lng={lng}
                        onClick={() => setOpen(false)}
                        mt={"4"}
                        href={STORE_PRODUCTS}
                        prefetch={true}
                        colorPalette={"primary"}
                        ariaLabel={t("store.navigation.allProducts", {
                          defaultValue: "All products",
                          lng,
                        })}
                      >
                        {t("store.navigation.allProducts", {
                          defaultValue: "All Products",
                          lng,
                        })}
                      </ButtonLink>
                    </VStack>
                  </GridItem>
                  <GridItem
                    colSpan={1}
                    borderRight={"1px solid"}
                    borderColor={{
                      base: "blackAlpha.200",
                      _dark: "whiteAlpha.200",
                    }}
                    px={5}
                  >
                    <VStack align={"stretch"} gap={2}>
                      {visibleSubcategories.map((category) => (
                        <Button
                          key={category.id}
                          onMouseEnter={() => handleCategoryChange(category.id)}
                          onFocus={() => handleCategoryChange(category.id)}
                          onClick={() => handleCategoryChange(category.id)}
                          variant={
                            category.id === categoryId ? "subtle" : "ghost"
                          }
                          colorPalette={"gray"}
                          justifyContent={"space-between"}
                          textAlign={"left"}
                          whiteSpace={"normal"}
                          width={"100%"}
                        >
                          <Text as={"span"} flex={"1"} textAlign={"left"}>
                            {category.name}
                          </Text>
                          <Text as={"span"} fontSize={"xs"} opacity={0.64}>
                            {category.productCount}
                          </Text>
                        </Button>
                      ))}
                      {middlePaneProducts.length > 0 && (
                        <>
                          {visibleSubcategories.length > 0 && (
                            <Separator my={1} />
                          )}
                          {middlePaneProducts.map((product) => (
                            <LinkOverlay
                              lng={lng}
                              key={product.id}
                              href={`${STORE_PRODUCTS}/${product.slug}`}
                              prefetch={true}
                              rel={"canonical"}
                            >
                              <Menu.Item
                                value={product.name}
                                bg={"transparent"}
                                whiteSpace={"normal"}
                                _hover={{
                                  bg: {
                                    base: "blackAlpha.200",
                                    _dark: "whiteAlpha.200",
                                  },
                                }}
                                _active={{
                                  bg: {
                                    base: "blackAlpha.200",
                                    _dark: "whiteAlpha.200",
                                  },
                                }}
                              >
                                {product.name}
                              </Menu.Item>
                            </LinkOverlay>
                          ))}
                        </>
                      )}
                    </VStack>
                  </GridItem>
                  <GridItem colSpan={1} pl={5}>
                    {isLoading ? (
                      <ProductsMenuProductSkeleton />
                    ) : (
                      <VStack align={"stretch"} gap={3}>
                        <Box>
                          <SimpleGrid columns={1} gap={2}>
                            {rightPaneProducts.map((product) => (
                              <LinkOverlay
                                lng={lng}
                                key={product.id}
                                href={`${STORE_PRODUCTS}/${product.slug}`}
                                prefetch={true}
                                rel={"canonical"}
                              >
                                <Menu.Item
                                  value={product.name}
                                  bg={"transparent"}
                                  whiteSpace={"normal"}
                                  _hover={{
                                    bg: {
                                      base: "blackAlpha.200",
                                      _dark: "whiteAlpha.200",
                                    },
                                  }}
                                  _active={{
                                    bg: {
                                      base: "blackAlpha.200",
                                      _dark: "whiteAlpha.200",
                                    },
                                  }}
                                >
                                  {product.name}
                                </Menu.Item>
                              </LinkOverlay>
                            ))}
                          </SimpleGrid>
                        </Box>
                        <Separator />
                        <Box minW={0}>
                          <Text fontWeight={600}>
                            {t("store.products.customProduct", {
                              defaultValue: "Custom Product",
                              lng,
                            })}
                          </Text>
                          <Text fontSize={"sm"} color={"fg.muted"}>
                            {t("store.cantFindProduct", {
                              defaultValue: "Can't find the right product?",
                              lng,
                            })}{" "}
                            {t("store.contactUs", {
                              defaultValue: "Contact us:",
                              lng,
                            })}{" "}
                            {contactMail}
                          </Text>
                        </Box>
                        <ButtonLink
                          lng={lng}
                          onClick={() => setOpen(false)}
                          href={STORE_CONTACT}
                          colorPalette={"primary"}
                          variant={"blurGlow"}
                          ariaLabel={t("store.contact", {
                            defaultValue: "Contact",
                            lng,
                          })}
                        >
                          {t("store.contact", { defaultValue: "Contact", lng })}
                        </ButtonLink>
                      </VStack>
                    )}
                  </GridItem>
                </SimpleGrid>
              </Box>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </>
  );
}
