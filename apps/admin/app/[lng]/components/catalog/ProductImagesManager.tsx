"use client";

import { revalidateTagCache } from "@/actions";
import { syncProductSearchIndexAction } from "@/actions/product-search-index";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Badge,
  Box,
  createListCollection,
  Flex,
  HStack,
  IconButton,
  Select,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  EmptyState,
  FileManager,
  Image,
  MaterialSymbol,
  RefreshButton,
  SearchInput,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValueText,
  toaster,
  Tooltip,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import { FieldData, Product } from "@konfi/types";
import { isString } from "es-toolkit";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import {
  QueryDocumentSnapshot,
  Timestamp,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

const PRODUCT_BATCH_SIZE = 250;
const ROW_HEIGHT = 76;
const OVERSCAN_ROWS = 8;
const ALL_CATEGORY_VALUE = "__all__";
const UNCATEGORIZED_CATEGORY_VALUE = "__uncategorized__";

type ProductImageFormValues = {
  spec: {
    images: string[];
  };
};

type ProductImageRowDrafts = Record<string, string[]>;

type ProductImageListItem = {
  product: Product;
};

type CategoryOption = {
  label: string;
  value: string;
};

async function fetchChannelProducts(channelId: string): Promise<Product[]> {
  const products: Product[] = [];
  let cursor: QueryDocumentSnapshot<Product> | undefined;

  while (true) {
    const productsRef = db.collection<Product>(
      firestore,
      `/channels/${channelId}/products`,
    );
    const productsQuery = cursor
      ? query(
          productsRef,
          where("active", "==", true),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(PRODUCT_BATCH_SIZE),
        )
      : query(
          productsRef,
          where("active", "==", true),
          orderBy("createdAt", "desc"),
          limit(PRODUCT_BATCH_SIZE),
        );
    const snapshot = await getDocs(productsQuery);

    products.push(...snapshot.docs.map((product) => product.data()));

    if (snapshot.size < PRODUCT_BATCH_SIZE) {
      break;
    }

    const nextCursor = snapshot.docs[snapshot.docs.length - 1];
    if (!nextCursor) {
      break;
    }

    cursor = nextCursor;
  }

  return products;
}

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.filter(isString).map((item) => item.trim())),
    ).filter(Boolean);
  }

  if (isString(value)) {
    const trimmedValue = value.trim();
    return trimmedValue ? [trimmedValue] : [];
  }

  return [];
}

function getProductCategoryLabel(product: Product, fallback: string) {
  return product.category?.name?.trim() || fallback;
}

function getProductCategoryValue(product: Product) {
  return product.category?.id || UNCATEGORIZED_CATEGORY_VALUE;
}

function buildProductImageUrl({
  channelId,
  image,
  productId,
}: {
  channelId: string;
  image: string;
  productId: string;
}) {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!cdnUrl) {
    return undefined;
  }

  const imagePath = image.split("/").map(encodeURIComponent).join("/");

  return `https://${cdnUrl}/channels/${channelId}/products/${productId}/${imagePath}?fit=crop&auto=format,compress`;
}

function ProductImagesManager() {
  const { t, i18n } = useT();
  const { channel } = useChannels();
  const { userInfo } = useAuth();
  const tenantContext = useTenantContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<ProductImageRowDrafts>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY_VALUE);
  const [searchValue, setSearchValue] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue ?? "");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const viewportRef = useRef<HTMLDivElement>(null);
  const uncategorizedLabel = t("productImages.uncategorized", {
    defaultValue: "No Category",
  });

  const loadProducts = useCallback(async () => {
    if (!channel?.id) {
      setProducts([]);
      return;
    }

    setIsLoading(true);
    setHasLoadError(false);

    try {
      const nextProducts = await fetchChannelProducts(channel.id);
      setProducts(nextProducts);
      setDrafts({});
    } catch (error) {
      console.error("Error loading products for image manager:", error);
      setHasLoadError(true);
      toaster.error({
        title: t("productImages.loadErrorTitle", {
          defaultValue: "Unable to Load Products",
        }),
        description: t("productImages.loadErrorDescription", {
          defaultValue:
            "Refresh the page or check your connection before trying again.",
        }),
      });
    } finally {
      setIsLoading(false);
    }
  }, [channel?.id, t]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextHeight = Math.ceil(entry?.contentRect.height ?? 0);
      if (nextHeight > 0) {
        setViewportHeight(nextHeight);
      }
    });

    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const productCategoryValues = new Set(
      products.map((product) => getProductCategoryValue(product)),
    );

    if (
      selectedCategory !== ALL_CATEGORY_VALUE &&
      !productCategoryValues.has(selectedCategory)
    ) {
      setSelectedCategory(ALL_CATEGORY_VALUE);
    }
  }, [products, selectedCategory]);

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const categoryMap = new Map<string, { label: string; count: number }>();

    for (const product of products) {
      const value = getProductCategoryValue(product);
      const existing = categoryMap.get(value);

      categoryMap.set(value, {
        count: (existing?.count ?? 0) + 1,
        label: getProductCategoryLabel(product, uncategorizedLabel),
      });
    }

    return [
      {
        label: t("productImages.allCategories", {
          defaultValue: "All Categories",
        }),
        value: ALL_CATEGORY_VALUE,
      },
      ...Array.from(categoryMap.entries())
        .map(([value, { count, label }]) => ({
          label: t("productImages.categoryOption", {
            count,
            defaultValue: "{{label}} ({{count}})",
            label,
          }),
          value,
        }))
        .toSorted((left, right) =>
          left.label.localeCompare(right.label, i18n.resolvedLanguage),
        ),
    ];
  }, [i18n.resolvedLanguage, products, t, uncategorizedLabel]);

  const categoryCollection = useMemo(
    () =>
      createListCollection<CategoryOption>({
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
        items: categoryOptions,
      }),
    [categoryOptions],
  );

  const filteredProducts = useMemo<ProductImageListItem[]>(() => {
    const categoryProducts = products.filter((product) => {
      if (selectedCategory === ALL_CATEGORY_VALUE) {
        return true;
      }

      return getProductCategoryValue(product) === selectedCategory;
    });
    const sortedProducts = filterLocalFuseItems(
      categoryProducts,
      deferredSearchValue,
      {
        keys: [
          { name: "name", weight: 0.6 },
          { name: "category.name", weight: 0.25 },
          { name: "seo.slug", weight: 0.15 },
        ],
        threshold: 0.36,
      },
    ).toSorted((left, right) => {
      const leftCategory = getProductCategoryLabel(left, uncategorizedLabel);
      const rightCategory = getProductCategoryLabel(right, uncategorizedLabel);
      const categorySort = leftCategory.localeCompare(
        rightCategory,
        i18n.resolvedLanguage,
      );

      if (categorySort !== 0) {
        return categorySort;
      }

      return left.name.localeCompare(right.name, i18n.resolvedLanguage);
    });

    return sortedProducts.map((product) => ({
      product,
    }));
  }, [
    deferredSearchValue,
    i18n.resolvedLanguage,
    products,
    selectedCategory,
    uncategorizedLabel,
  ]);

  const imageCount = useMemo(
    () =>
      products.reduce(
        (total, product) =>
          total + normalizeImages(product.spec?.images ?? []).length,
        0,
      ),
    [products],
  );
  const dirtyProductCount = Object.keys(drafts).length;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
  );
  const endIndex = Math.min(
    filteredProducts.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
  );
  const visibleItems = filteredProducts.slice(startIndex, endIndex);
  const totalHeight = filteredProducts.length * ROW_HEIGHT;
  const topOffset = startIndex * ROW_HEIGHT;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const updateProductDraft = useCallback(
    (productId: string, images: string[]) => {
      setDrafts((current) => {
        const nextImages = normalizeImages(images);
        const currentImages = current[productId] ?? [];

        if (currentImages.join("\u0000") === nextImages.join("\u0000")) {
          return current;
        }

        return {
          ...current,
          [productId]: nextImages,
        };
      });
    },
    [],
  );

  const clearProductDraft = useCallback((productId: string) => {
    setDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, productId)) {
        return current;
      }

      const { [productId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const handleSaveImages = useCallback(
    async (product: Product, images: string[]) => {
      if (!channel?.id) {
        throw new Error("Channel is required before saving product images.");
      }

      const normalizedImages = normalizeImages(images);
      const productRef = doc(
        firestore,
        `/channels/${channel.id}/products/${product.id}`,
      );

      await update(
        {
          "spec.images": normalizedImages,
          updatedAt: Timestamp.now(),
          updatedBy: {
            id: userInfo?.uid ?? "",
            name: userInfo?.displayName ?? userInfo?.email ?? "",
          },
        },
        productRef,
        tenantContext,
      );

      const searchIndexResult = await syncProductSearchIndexAction({
        channelId: channel.id,
        productId: product.id,
        previousLinkedChannelIds: product.linkedChannels ?? [],
        previousProductState: {
          active: product.active,
          published: product.availability.published,
          slug: product.seo.slug,
          id: product.id,
        },
      });

      if (!searchIndexResult.ok) {
        console.error("Failed to sync product image search index:", {
          error: searchIndexResult.error,
          productId: product.id,
        });
      }

      try {
        await revalidateTagCache("products");
        await revalidateTagCache("categorizedCardProducts");
        await revalidateTagCache("productMetadata");
      } catch (error) {
        console.error("Failed to revalidate product image caches:", error);
      }

      setProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                spec: {
                  ...item.spec,
                  images: normalizedImages,
                },
              }
            : item,
        ),
      );
      clearProductDraft(product.id);
    },
    [channel?.id, clearProductDraft, tenantContext, userInfo],
  );

  if (!channel?.id) {
    return (
      <EmptyState
        icon={<MaterialSymbol>storefront</MaterialSymbol>}
        py="16"
        title={t("productImages.selectChannelTitle", {
          defaultValue: "No channel selected",
        })}
        description={t("productImages.selectChannel", {
          defaultValue: "Select a channel before managing product images.",
        })}
      />
    );
  }

  return (
    <>
      <Flex gap="2" align="center" flexWrap="wrap" mb="3">
        <SearchInput
          placeholder={t("productImages.searchPlaceholder", {
            defaultValue: "Search products…",
          })}
          searchKey={searchValue}
          setSearchKey={setSearchValue}
          searchMode="debounced"
          loading={isLoading}
          maxW="lg"
          t={t}
        />
        <Box flex={{ base: "1 1 15rem", md: "0 0 18rem" }}>
          <Select.Root
            aria-label={t("productImages.categoryLabel", {
              defaultValue: "Product Category",
            })}
            collection={categoryCollection}
            value={[selectedCategory]}
            onValueChange={(details) =>
              setSelectedCategory(details.value[0] ?? ALL_CATEGORY_VALUE)
            }
            width="full"
          >
            <Select.HiddenSelect />
            <SelectTrigger>
              <SelectValueText
                placeholder={t("productImages.categoryPlaceholder", {
                  defaultValue: "Filter by Category",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {categoryCollection.items.map((item) => (
                <SelectItem item={item} key={item.value}>
                  <SelectItemText>{item.label}</SelectItemText>
                </SelectItem>
              ))}
            </SelectContent>
          </Select.Root>
        </Box>
        <RefreshButton
          label={t("productImages.refresh", { defaultValue: "Refresh" })}
          refreshFunction={() => void loadProducts()}
          loading={isLoading}
          size="sm"
        />
        <SummaryText
          dirtyProductCount={dirtyProductCount}
          imageCount={imageCount}
          productCount={products.length}
          language={i18n.resolvedLanguage}
          t={t}
        />
      </Flex>
      <Separator mb="3" />
      {hasLoadError ? (
        <EmptyMessage
          icon="error"
          title={t("productImages.loadErrorTitle", {
            defaultValue: "Unable to Load Products",
          })}
          description={t("productImages.loadErrorDescription", {
            defaultValue:
              "Refresh the page or check your connection before trying again.",
          })}
        />
      ) : isLoading && products.length === 0 ? (
        <Stack gap="3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} h={`${ROW_HEIGHT - 8}px`} borderRadius="md" />
          ))}
        </Stack>
      ) : filteredProducts.length === 0 ? (
        <EmptyMessage
          icon="image_search"
          title={t("productImages.emptyTitle", {
            defaultValue: "No Products Found",
          })}
          description={t("productImages.emptyDescription", {
            defaultValue:
              "Change the search or category filter to show more products.",
          })}
        />
      ) : (
        <Box borderWidth="1px" borderRadius="md" overflow="hidden">
          <Box
            ref={viewportRef}
            h={{ base: "68vh", lg: "calc(100vh - 15rem)" }}
            minH="28rem"
            overflowY="auto"
            overscrollBehavior="contain"
            onScroll={handleScroll}
          >
            <Box h={`${totalHeight}px`} position="relative">
              <Stack
                gap="0"
                position="absolute"
                top={`${topOffset}px`}
                left="0"
                right="0"
              >
                {visibleItems.map((item) => (
                  <ProductImageRow
                    key={item.product.id}
                    channelId={channel.id}
                    draftImages={drafts[item.product.id]}
                    onDraftChange={updateProductDraft}
                    onDraftClear={clearProductDraft}
                    onSave={handleSaveImages}
                    product={item.product}
                    rowHeight={ROW_HEIGHT}
                    t={t}
                    uncategorizedLabel={uncategorizedLabel}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      )}
    </>
  );
}

function SummaryText({
  dirtyProductCount,
  imageCount,
  language,
  productCount,
  t,
}: {
  dirtyProductCount: number;
  imageCount: number;
  language?: string;
  productCount: number;
  t: ReturnType<typeof useT>["t"];
}) {
  return (
    <HStack
      color="fg.muted"
      fontSize="sm"
      gap="1.5"
      ms={{ base: "0", lg: "auto" }}
      whiteSpace="nowrap"
    >
      <Text as="span">
        {t("productImages.productsStat", {
          defaultValue: "Products",
        })}
        : {productCount.toLocaleString(language)}
      </Text>
      <Text as="span">/</Text>
      <Text as="span">
        {t("productImages.imagesStat", {
          defaultValue: "Selected Images",
        })}
        : {imageCount.toLocaleString(language)}
      </Text>
      <Text as="span">/</Text>
      <Text
        as="span"
        color={dirtyProductCount > 0 ? "orange.fg" : "fg.muted"}
        fontWeight={dirtyProductCount > 0 ? "medium" : "normal"}
      >
        {t("productImages.unsavedStat", {
          defaultValue: "Unsaved Rows",
        })}
        : {dirtyProductCount.toLocaleString(language)}
      </Text>
    </HStack>
  );
}

function EmptyMessage({
  description,
  icon,
  title,
}: {
  description: string;
  icon: string;
  title: string;
}) {
  return (
    <EmptyState
      icon={<MaterialSymbol>{icon}</MaterialSymbol>}
      py="16"
      title={title}
      description={description}
    />
  );
}

const ProductImageRow = memo(function ProductImageRow({
  channelId,
  draftImages,
  onDraftChange,
  onDraftClear,
  onSave,
  product,
  rowHeight,
  t,
  uncategorizedLabel,
}: {
  channelId: string;
  draftImages?: string[];
  onDraftChange: (productId: string, images: string[]) => void;
  onDraftClear: (productId: string) => void;
  onSave: (product: Product, images: string[]) => Promise<void>;
  product: Product;
  rowHeight: number;
  t: ReturnType<typeof useT>["t"];
  uncategorizedLabel: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const persistedImages = useMemo(
    () => normalizeImages(product.spec?.images),
    [product.spec?.images],
  );
  const initialImages = useMemo(
    () => draftImages ?? persistedImages,
    [draftImages, persistedImages],
  );
  const initialImagesKey = initialImages.join("\u0000");
  const methods = useForm<ProductImageFormValues>({
    defaultValues: {
      spec: {
        images: initialImages,
      },
    },
  });
  const watchedImages = useWatch({
    control: methods.control,
    name: "spec.images",
  });
  const selectedImages = useMemo(
    () => normalizeImages(watchedImages),
    [watchedImages],
  );
  const selectedImagesKey = selectedImages.join("\u0000");
  const persistedImagesKey = persistedImages.join("\u0000");
  const isDirty = selectedImagesKey !== persistedImagesKey;
  const selectedImageCountLabel = t("productImages.imageCount", {
    count: selectedImages.length,
    defaultValue: "{{count}} Images",
  });

  useEffect(() => {
    if (methods.formState.isDirty) {
      return;
    }

    methods.reset({
      spec: {
        images: initialImages,
      },
    });
  }, [initialImages, initialImagesKey, methods]);

  useEffect(() => {
    if (isDirty) {
      onDraftChange(product.id, selectedImages);
      return;
    }

    onDraftClear(product.id);
  }, [isDirty, onDraftChange, onDraftClear, product.id, selectedImages]);

  const fieldData = useMemo<FieldData>(
    () => ({
      imageProps: {
        acceptType: ["image/jpeg", "image/jpg", "image/png"],
        includePrefix: false,
        maxFileSize: 10,
        maxFiles: 10,
        maxNumber: 5,
        prefix: `channels/${channelId}/products/${product.id}`,
      },
      label: t("forms.labels.photos", { defaultValue: "Photos" }),
      name: "spec.images",
      type: "fileManager",
    }),
    [channelId, product.id, t],
  );

  const handleSave = methods.handleSubmit(async (data) => {
    setIsSaving(true);

    try {
      const images = normalizeImages(data.spec.images);
      await onSave(product, images);
      methods.reset({
        spec: {
          images,
        },
      });
      toaster.success({
        title: t("productImages.savedTitle", {
          defaultValue: "Product Images Saved",
        }),
        description: t("productImages.savedDescription", {
          defaultValue: "Updated images for {{name}}.",
          name: product.name,
        }),
      });
    } catch (error) {
      console.error("Error saving product images:", error);
      toaster.error({
        title: t("productImages.saveErrorTitle", {
          defaultValue: "Unable to Save Images",
        }),
        description: t("productImages.saveErrorDescription", {
          defaultValue: "Check the product and try saving images again.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <Box
      h={`${rowHeight}px`}
      borderBottomWidth="1px"
      px="3"
      py="2"
      _hover={{ bg: "bg.subtle" }}
    >
      <Flex align="center" gap="3" h="full" minW="0">
        <Box flex="1 1 18rem" minW="0">
          <HStack gap="2" minW="0">
            <Text fontSize="sm" fontWeight="medium" truncate>
              {product.name}
            </Text>
            {isDirty && (
              <Badge colorPalette="orange" variant="subtle">
                {t("productImages.unsavedBadge", {
                  defaultValue: "Unsaved",
                })}
              </Badge>
            )}
          </HStack>
          <HStack color="fg.muted" fontSize="xs" gap="1.5" mt="0.5" minW="0">
            <Text truncate>
              {getProductCategoryLabel(product, uncategorizedLabel)}
            </Text>
            <Text flex="0 0 auto">/</Text>
            <Text flex="0 0 auto">{selectedImageCountLabel}</Text>
          </HStack>
        </Box>
        <HStack
          display={{ base: "none", md: "flex" }}
          flex="0 1 18rem"
          gap="1.5"
          minW="10rem"
          overflow="hidden"
        >
          {selectedImages.length > 0 ? (
            selectedImages.map((image) => (
              <ProductImageThumb
                key={image}
                channelId={channelId}
                image={image}
                product={product}
                size={44}
                t={t}
              />
            ))
          ) : (
            <Text color="fg.muted" fontSize="xs">
              {t("productImages.noImages", {
                defaultValue: "No images selected",
              })}
            </Text>
          )}
        </HStack>
        <HStack flex="0 0 auto" gap="1.5">
          <FormProvider {...methods}>
            <FileManager
              fieldData={fieldData}
              t={t}
              showSelectedFiles={false}
              triggerAriaLabel={t("fileManager.selectFiles", {
                defaultValue: "Select files",
              })}
              triggerContent={<MaterialSymbol>folder_open</MaterialSymbol>}
              triggerSize="xs"
            />
          </FormProvider>
          <Tooltip content={t("common.save", { defaultValue: "Save" })}>
            <IconButton
              aria-label={t("common.save", { defaultValue: "Save" })}
              colorPalette="primary"
              disabled={!isDirty || isSaving}
              loading={isSaving}
              onClick={() => void handleSave()}
              size="xs"
              variant={isDirty ? "solid" : "outline"}
            >
              <MaterialSymbol>save</MaterialSymbol>
            </IconButton>
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
});

function ProductImageThumb({
  channelId,
  image,
  product,
  size,
  t,
}: {
  channelId: string;
  image: string;
  product: Product;
  size: number;
  t: ReturnType<typeof useT>["t"];
}) {
  const imageUrl = buildProductImageUrl({
    channelId,
    image,
    productId: product.id,
  });

  if (!imageUrl) {
    return (
      <Box
        alignItems="center"
        borderWidth="1px"
        borderRadius="md"
        display="flex"
        h={`${size}px`}
        justifyContent="center"
        w={`${size}px`}
      >
        <MaterialSymbol>image</MaterialSymbol>
      </Box>
    );
  }

  return (
    <Box flex="0 0 auto" position="relative">
      <Image
        alt={t("productImages.productImageAlt", {
          defaultValue: "{{name}} Product Image",
          name: product.name,
        })}
        borderRadius="md"
        height={size}
        objectFit="cover"
        priority={false}
        ratio={1}
        src={imageUrl}
        width={size}
      />
    </Box>
  );
}

export default ProductImagesManager;
