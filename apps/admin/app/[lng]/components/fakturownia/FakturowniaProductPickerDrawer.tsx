"use client";

import {
  getProductsPageAction,
  listFakturowniaCategories,
} from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Drawer,
  HStack,
  IconButton,
  Input,
  Portal,
  Separator,
  Spinner,
  Text,
  TreeView,
  VStack,
  createTreeCollection,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import type { Category, Product } from "@konfi/fakturownia/client/models";
import { isNull, isUndefined } from "es-toolkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatFakturowniaIntegrationActionError } from "./FakturowniaErrors";

const FAVORITES_STORAGE_KEY = "fakturownia-product-favorites";

type PickerMode = "category" | "favorites";

type PickerNode = {
  id: string;
  name: string;
  type: "root" | "letter" | "category" | "favorites" | "product" | "group";
  categoryId?: string;
  product?: Product;
  children?: PickerNode[];
  childrenCount?: number;
};

type StoredProduct = {
  id?: string | number | null;
  name?: string | null;
  code?: string | null;
  priceNet?: number | string | null;
  priceGross?: number | string | null;
  tax?: string | number | null;
  quantityUnit?: string | null;
  currency?: string | null;
  description?: string | null;
};

const toSafeId = (product: Product | StoredProduct): string => {
  const rawId = (product as Product).id ?? (product as StoredProduct).id;
  if (!isNull(rawId) && !isUndefined(rawId)) {
    return String(rawId);
  }

  const code = (product as Product).code ?? (product as StoredProduct).code;
  if (code) {
    return `code-${code}`;
  }

  const name = (product as Product).name ?? (product as StoredProduct).name;
  if (name) {
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, "-");
    return `name-${normalizedName}`;
  }

  const serialized: StoredProduct = serializeProduct(product as Product);
  const fingerprintSource = JSON.stringify(serialized);
  let hash = 0;

  for (let index = 0; index < fingerprintSource.length; index += 1) {
    hash = (hash * 31 + fingerprintSource.charCodeAt(index)) >>> 0;
  }

  return `product-${hash.toString(16)}`;
};

const toProductNode = (product: Product | StoredProduct): PickerNode => ({
  id: `product-${toSafeId(product)}`,
  name: (product as Product).name ?? (product as StoredProduct).name ?? "",
  type: "product",
  product: product as Product,
});

const serializeProduct = (product: Product): StoredProduct => ({
  id: product.id ?? null,
  name: product.name ?? null,
  code: product.code ?? null,
  priceNet: (product as Record<string, unknown>).priceNet as
    | number
    | string
    | null,
  priceGross: (product as Record<string, unknown>).priceGross as
    | number
    | string
    | null,
  tax: (product as Record<string, unknown>).tax as string | number | null,
  quantityUnit: (product as Record<string, unknown>).quantityUnit as
    | string
    | null,
  currency: (product as Record<string, unknown>).currency as string | null,
  description: product.description ?? null,
});

const deserializeProduct = (stored: StoredProduct): Product => {
  const parsedId =
    typeof stored.id === "string" ? Number(stored.id) : stored.id;
  return {
    id: Number.isFinite(parsedId) ? (parsedId ?? undefined) : undefined,
    name: stored.name ?? undefined,
    code: stored.code ?? undefined,
    priceNet: stored.priceNet ?? undefined,
    priceGross: stored.priceGross ?? undefined,
    tax: stored.tax ?? undefined,
    quantityUnit: stored.quantityUnit ?? undefined,
    currency: stored.currency ?? undefined,
    description: stored.description ?? undefined,
  } as Product;
};

const formatPrice = (product: Product | StoredProduct): string | undefined => {
  const rawNet =
    (product as Product).priceNet ?? (product as StoredProduct).priceNet;
  const rawGross =
    (product as Product).priceGross ?? (product as StoredProduct).priceGross;
  const currency =
    (product as Product).currency ??
    (product as StoredProduct).currency ??
    "PLN";
  const numericNet = typeof rawNet === "string" ? Number(rawNet) : rawNet;
  const numericGross =
    typeof rawGross === "string" ? Number(rawGross) : rawGross;

  if (Number.isFinite(numericNet)) {
    return `${Number(numericNet).toFixed(2)} ${currency}`;
  }
  if (Number.isFinite(numericGross)) {
    return `${Number(numericGross).toFixed(2)} ${currency}`;
  }
  return undefined;
};

const buildGroupId = (key: string): string =>
  key.trim().toLowerCase().replace(/\s+/g, "-");

const groupProductsByWords = (
  products: (Product | StoredProduct)[],
  maxDepth = 2,
  depth = 1,
): PickerNode[] => {
  const grouped: Record<string, (Product | StoredProduct)[]> = {};
  const ungrouped: (Product | StoredProduct)[] = [];

  products.forEach((product) => {
    const name =
      (product as Product).name ?? (product as StoredProduct).name ?? "";
    const words = name.trim().split(/\s+/).filter(Boolean);

    if (words.length >= depth) {
      const key = words.slice(0, depth).join(" ");
      grouped[key] = grouped[key] ? [...grouped[key], product] : [product];
      return;
    }

    ungrouped.push(product);
  });

  const nodes: PickerNode[] = [];

  Object.entries(grouped).forEach(([key, list]) => {
    if (list.length > 1) {
      const children =
        depth < maxDepth
          ? groupProductsByWords(list, maxDepth, depth + 1)
          : list.map(toProductNode);
      nodes.push({
        id: `group-${buildGroupId(key)}`,
        name: key,
        type: "group",
        children,
        childrenCount: list.length,
      });
      return;
    }
    ungrouped.push(...list);
  });

  nodes.push(...ungrouped.map(toProductNode));
  return nodes;
};

const buildInitialCollection = (
  mode: PickerMode,
  favorites: StoredProduct[],
  categories: Category[],
  categoryCache: Record<string, Product[]>,
) => {
  const favoriteNodes = favorites.map(toProductNode);

  const categoryNodes: PickerNode[] = categories.map((category) => {
    const cacheKey = category.id ? String(category.id) : (category.name ?? "");
    return {
      id: `category-${category.id ?? category.name ?? "unknown"}`,
      name: category.name ?? "",
      type: "category",
      categoryId: category.id ? String(category.id) : undefined,
      children: categoryCache[cacheKey]
        ? groupProductsByWords(categoryCache[cacheKey])
        : undefined,
      childrenCount: categoryCache[cacheKey]?.length ?? 1,
    } as PickerNode;
  });

  const branchNodes = mode === "category" ? categoryNodes : [];

  const rootChildren: PickerNode[] = [
    {
      id: "favorites",
      name: "favorites",
      type: "favorites",
      children: groupProductsByWords(favorites),
      childrenCount: favoriteNodes.length,
    },
    ...branchNodes,
  ];

  return createTreeCollection<PickerNode>({
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
    rootNode: {
      id: "ROOT",
      name: "",
      type: "root",
      children: rootChildren,
    },
  });
};

interface FakturowniaProductPickerDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export function FakturowniaProductPickerDrawer({
  open,
  onClose,
  onSelect,
}: FakturowniaProductPickerDrawerProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const [mode, setMode] = useState<PickerMode>("category");
  const [collection, setCollection] = useState(() =>
    buildInitialCollection("category", [], [], {}),
  );
  const [categoryProducts, setCategoryProducts] = useState<
    Record<string, Product[]>
  >({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [favorites, setFavorites] = useState<StoredProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rebuildCollection = useCallback(
    (
      nextMode: PickerMode,
      nextFavorites: StoredProduct[],
      nextCategories: Category[],
      nextCategoryCache: Record<string, Product[]>,
    ) => {
      setCollection(
        buildInitialCollection(
          nextMode,
          nextFavorites,
          nextCategories,
          nextCategoryCache,
        ),
      );
    },
    [],
  );

  useEffect(
    () => () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredProduct[];
        setFavorites(parsed);
      }
    } catch (error) {
      console.error("Failed to load favorites from localStorage", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rebuildCollection(mode, favorites, categories, categoryProducts);
  }, [categoryProducts, categories, favorites, mode, rebuildCollection]);

  useEffect(() => {
    if (mode !== "category" || categories.length > 0) {
      return;
    }

    void (async () => {
      try {
        const nextCategories = await listFakturowniaCategories();
        setCategories(nextCategories ?? []);
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("fakturownia.invoiceCreate.categoryLoadError", {
            defaultValue: "Unable to load categories",
          }),
        });
      }
    })();
  }, [categories.length, mode, t]);

  const persistFavorites = useCallback((nextFavorites: StoredProduct[]) => {
    setFavorites(nextFavorites);
    try {
      localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(nextFavorites),
      );
    } catch (error) {
      console.error("Failed to persist favorites", error);
    }
  }, []);

  const handleToggleFavorite = useCallback(
    (product: Product | StoredProduct) => {
      const targetId = toSafeId(product);
      const nextFavorites = favorites.some((fav) => toSafeId(fav) === targetId)
        ? favorites.filter((fav) => toSafeId(fav) !== targetId)
        : [serializeProduct(product as Product), ...favorites];
      persistFavorites(nextFavorites);
    },
    [favorites, persistFavorites],
  );

  const loadProductsForCategory = useCallback(
    async (categoryId?: string, categoryName?: string | null) => {
      const cacheKey = categoryId ?? categoryName ?? "";
      const cached = categoryProducts[cacheKey];
      if (cached) {
        return cached;
      }
      const productsResult = await getProductsPageAction({
        page: 1,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      if (!productsResult.ok) {
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: formatFakturowniaIntegrationActionError(
            productsResult.error,
            t,
          ),
        });
        setCategoryProducts((prev) => ({ ...prev, [cacheKey]: [] }));
        return [];
      }
      const products = productsResult.data;
      setCategoryProducts((prev) => ({ ...prev, [cacheKey]: products ?? [] }));
      return products ?? [];
    },
    [categoryProducts, t],
  );

  const loadChildren = useCallback(
    async (details: TreeView.LoadChildrenDetails<PickerNode>) => {
      const node = details.node;
      if (node.type === "category") {
        setLoadingNodeId(node.id);
        const products = await loadProductsForCategory(
          node.categoryId,
          node.name,
        );
        setLoadingNodeId(null);
        return groupProductsByWords(products);
      }
      if (node.type === "favorites") {
        return groupProductsByWords(favorites);
      }
      return [];
    },
    [favorites, loadProductsForCategory],
  );

  const handleProductSelect = useCallback(
    (product: Product | StoredProduct) => {
      const asProduct = product as Product;
      const normalized: Product =
        typeof asProduct.id === "number"
          ? asProduct
          : deserializeProduct(product as StoredProduct);
      onSelect(normalized);
    },
    [onSelect],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (value.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      searchTimeoutRef.current = setTimeout(() => {
        setIsSearching(true);
        void (async () => {
          try {
            const productsResult = await getProductsPageAction({
              query: value.trim(),
              page: 1,
            });
            if (!productsResult.ok) {
              toaster.error({
                title: t("common.error", { defaultValue: "Error" }),
                description: formatFakturowniaIntegrationActionError(
                  productsResult.error,
                  t,
                ),
              });
              setSearchResults([]);
              return;
            }
            setSearchResults(productsResult.data ?? []);
          } catch (error) {
            console.error(error);
            toaster.error({
              title: t("common.error", { defaultValue: "Error" }),
              description: t("fakturownia.invoiceCreate.productSearchError", {
                defaultValue: "Unable to search products",
              }),
            });
          } finally {
            setIsSearching(false);
          }
        })();
      }, 350);
    },
    [t],
  );

  const renderProductRow = useCallback(
    (product: Product | StoredProduct) => {
      const priceLabel = formatPrice(product);
      const code = (product as Product).code ?? (product as StoredProduct).code;
      const isFavorite = favorites.some(
        (fav) => toSafeId(fav) === toSafeId(product),
      );

      return (
        <HStack justify="space-between" w="100%" align="center" gap={2} py={1}>
          <VStack align="start" gap={1} flex="1">
            <HStack gap={2} align="center">
              <Text fontWeight="medium">
                {(product as Product).name ??
                  (product as StoredProduct).name ??
                  ""}
              </Text>
              {priceLabel && <Badge>{priceLabel}</Badge>}
            </HStack>
            <HStack gap={2} align="center">
              {code && (
                <Badge variant="subtle" colorPalette="gray">
                  {code}
                </Badge>
              )}
              {((product as Product).quantityUnit ??
                (product as StoredProduct).quantityUnit) && (
                <Badge variant="outline" colorPalette="gray">
                  {(product as Product).quantityUnit ??
                    (product as StoredProduct).quantityUnit}
                </Badge>
              )}
            </HStack>
          </VStack>
          <HStack gap={2}>
            <IconButton
              size="sm"
              variant={isFavorite ? "solid" : "ghost"}
              colorPalette={isFavorite ? "yellow" : "gray"}
              aria-label={
                isFavorite
                  ? t("common.remove", { defaultValue: "Remove" })
                  : t("common.add", { defaultValue: "Add" })
              }
              onClick={(event) => {
                event.stopPropagation();
                handleToggleFavorite(product);
              }}
            >
              <MaterialSymbol>
                {isFavorite ? "star" : "star_border"}
              </MaterialSymbol>
            </IconButton>
            <Button
              size="sm"
              variant="solid"
              onClick={(event) => {
                event.stopPropagation();
                handleProductSelect(product);
              }}
            >
              {t("fakturownia.invoiceCreate.useProduct", {
                defaultValue: "Use",
              })}
            </Button>
          </HStack>
        </HStack>
      );
    },
    [favorites, handleProductSelect, handleToggleFavorite, t],
  );

  return (
    <Drawer.Root
      open={open}
      size="lg"
      onOpenChange={({ open: nextOpen }) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      closeOnInteractOutside={false}
      modal={false}
    >
      <Portal>
        <Drawer.Positioner pointerEvents="none">
          <Drawer.Content>
            <Drawer.Header>
              <HStack justify="space-between" align="center" w="100%">
                <Drawer.Title>
                  {t("fakturownia.invoiceCreate.productPicker.title", {
                    defaultValue: "Fakturownia products",
                  })}
                </Drawer.Title>
                <HStack gap={2}>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    aria-label={t("common.close", { defaultValue: "Close" })}
                  >
                    <MaterialSymbol>close</MaterialSymbol>
                  </IconButton>
                </HStack>
              </HStack>
            </Drawer.Header>
            <Drawer.Body>
              <VStack align="stretch" gap={4} w="100%">
                <HStack
                  gap={2}
                  justify="space-between"
                  align="center"
                  flexWrap="wrap"
                >
                  <VStack gap={2} w="100%">
                    <Button
                      w="100%"
                      variant={mode === "category" ? "solid" : "outline"}
                      size="xs"
                      onClick={() => setMode("category")}
                    >
                      <MaterialSymbol>category</MaterialSymbol>
                      {t("fakturownia.invoiceCreate.productPicker.byCategory", {
                        defaultValue: "By category",
                      })}
                    </Button>
                    <Button
                      w="100%"
                      variant={mode === "favorites" ? "solid" : "outline"}
                      size="xs"
                      onClick={() => setMode("favorites")}
                    >
                      <MaterialSymbol>star</MaterialSymbol>
                      {t("fakturownia.invoiceCreate.productPicker.favorites", {
                        defaultValue: "Favorites",
                      })}
                    </Button>
                  </VStack>
                  <Input
                    size="xs"
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder={t(
                      "fakturownia.invoiceCreate.productPicker.searchPlaceholder",
                      { defaultValue: "Search products" },
                    )}
                  />
                  {isSearching && <Spinner size="sm" />}
                </HStack>

                <Box borderWidth="1px" borderRadius="3xl" p={3}>
                  <TreeView.Root
                    collection={collection}
                    animateContent
                    loadChildren={loadChildren}
                    onLoadChildrenComplete={(event) =>
                      setCollection(event.collection)
                    }
                    expandOnClick
                  >
                    <TreeView.Label srOnly>
                      {t("fakturownia.invoiceCreate.productPicker.treeLabel", {
                        defaultValue: "Product tree",
                      })}
                    </TreeView.Label>
                    <TreeView.Tree>
                      <TreeView.Node
                        indentGuide={<TreeView.BranchIndentGuide />}
                        render={({ node, nodeState }) => {
                          if (node.type === "product" && node.product) {
                            return (
                              <TreeView.Item>
                                {renderProductRow(node.product)}
                              </TreeView.Item>
                            );
                          }
                          if (node.type === "favorites") {
                            return (
                              <TreeView.BranchControl>
                                <MaterialSymbol>{"star"}</MaterialSymbol>
                                <TreeView.BranchText>
                                  {t(
                                    "fakturownia.invoiceCreate.productPicker.favorites",
                                    { defaultValue: "Favorites" },
                                  )}
                                </TreeView.BranchText>
                              </TreeView.BranchControl>
                            );
                          }
                          if (node.type === "group") {
                            return (
                              <TreeView.BranchControl>
                                <MaterialSymbol>
                                  {nodeState.expanded
                                    ? "expand_more"
                                    : "chevron_right"}
                                </MaterialSymbol>
                                <MaterialSymbol>folder</MaterialSymbol>
                                <TreeView.BranchText>
                                  {node.name}
                                </TreeView.BranchText>
                              </TreeView.BranchControl>
                            );
                          }
                          return (
                            <TreeView.BranchControl>
                              {loadingNodeId === node.id &&
                              nodeState.loading ? (
                                <Spinner size="xs" />
                              ) : (
                                <MaterialSymbol>
                                  {nodeState.expanded
                                    ? "expand_more"
                                    : "chevron_right"}
                                </MaterialSymbol>
                              )}
                              <TreeView.BranchText>
                                {node.name}
                              </TreeView.BranchText>
                            </TreeView.BranchControl>
                          );
                        }}
                      />
                    </TreeView.Tree>
                  </TreeView.Root>
                </Box>

                <Separator />

                <VStack align="stretch" gap={2}>
                  <HStack justify="space-between" align="center">
                    <Text fontWeight="semibold">
                      {t(
                        "fakturownia.invoiceCreate.productPicker.searchResults",
                        { defaultValue: "Search results" },
                      )}
                    </Text>
                    {isSearching && <Spinner size="sm" />}
                  </HStack>
                  {searchTerm.trim().length < 2 && (
                    <Text color="fg.muted" textStyle="sm">
                      {t("fakturownia.invoiceCreate.productPicker.searchHint", {
                        defaultValue: "Type at least 2 characters to search",
                      })}
                    </Text>
                  )}
                  {searchResults.map((product) => (
                    <Box
                      key={toSafeId(product)}
                      borderWidth="1px"
                      borderRadius="lg"
                      p={3}
                    >
                      {renderProductRow(product)}
                    </Box>
                  ))}
                  {!isSearching &&
                    searchTerm.trim().length >= 2 &&
                    searchResults.length === 0 && (
                      <Text color="fg.muted" textStyle="sm">
                        {t(
                          "fakturownia.invoiceCreate.productPicker.noResults",
                          { defaultValue: "No products found" },
                        )}
                      </Text>
                    )}
                </VStack>
              </VStack>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
