"use client";

import {
  searchProductSearchIndexAction,
  type ProductSearchIndexSearchHit,
} from "@/actions/product-search-index";
import { useTenantContext } from "@/context/tenant";
import {
  getProductGroupedSearchOptionKey,
  getSemanticSupplementalProductOptions,
  rankProductGroupedLocalSearchOptions,
} from "@/lib/products/product-grouped-local-search";
import {
  getProductById,
  isFakturowniaApiKeyProvided,
  searchFakturowniaProducts,
} from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Combobox,
  HStack,
  IconButton,
  Portal,
  RadioGroup,
  Text,
  VStack,
  useListCollection,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { getCategoryTranslation } from "@konfi/firebase";
import type { Attribute } from "@konfi/types";
import {
  CardProduct,
  CategorizedCardProducts,
  Category,
  Channel,
  CurrencyEnum,
  DEFAULT_LOCALE,
  FieldData,
  Locale,
  PriceTypeEnum,
  Product,
  SelectOption,
  ShippingTypes,
  type TenantContext,
  Unit,
} from "@konfi/types";
import {
  formatPrice,
  getProductListingPrices,
  getRandomId,
  isPurchasable,
  isWithinLastMonth,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useFakturowniaPricing } from "context/fakturownia-pricing";
import { isNull, isUndefined, orderBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Timestamp } from "firebase/firestore";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { default as useSWR, default as useSWRImmutable } from "swr";
import { getOrderItemConfigurationResetValues } from "./combination-input-utils";
import {
  clearKonfiProductUsageForChannel,
  incrementKonfiProductUsage,
  prioritizeMostOftenChosenOptions,
  readKonfiProductUsageForChannel,
} from "./product-grouped-indexed-search-usage";

interface IndexedSearchProps {
  fieldData: FieldData;
  fieldArrayIndex: number | undefined;
  lng?: Locale;
  update?: boolean;
}

type ExtendedCardProduct = CardProduct & {
  channelName?: string;
  attributeText?: string;
};

type GroupedSelectOption = SelectOption & {
  group: string;
  channelId?: string;
  channelName?: string;
  attributeText?: string;
  priceText?: string;
};

type FakturowniaProduct = import("@konfi/fakturownia/client/models").Product;

type CategorizedCardProductsResult =
  | Record<string, ExtendedCardProduct[]>
  | undefined;

type ProductDefaultPriceLike = {
  defaultPrice?: {
    minorUnits?: number;
    value?: number;
  };
};

function getActiveProductCollectionItems(
  useFakturownia: boolean,
  konfiItems: GroupedSelectOption[],
  fakturowniaItems: GroupedSelectOption[],
): GroupedSelectOption[] {
  return useFakturownia ? fakturowniaItems : konfiItems;
}

const EMPTY_PRODUCT_SEARCH_INDEX_HITS: ProductSearchIndexSearchHit[] = [];
const CATEGORIZED_PRODUCTS_CACHE_TTL_MS = 2 * 60 * 1000;
const DEDICATED_TENANT_CONTEXT: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
};
const categorizedProductsCache = new Map<
  string,
  { data: CategorizedCardProductsResult; expiresAt: number; }
>();
const categorizedProductsInFlight = new Map<
  string,
  Promise<CategorizedCardProductsResult>
>();

function getCategorizedProductsCacheKey(
  channelId: string,
  tenantContext: TenantContext,
  lng?: Locale,
): string {
  const tenantKey =
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
      ? (tenantContext.tenantId ?? "__missing_tenant__")
      : "__dedicated__";

  return [
    tenantContext.deploymentMode,
    tenantKey,
    channelId,
    lng ?? DEFAULT_LOCALE,
  ].join(":");
}

function getSemanticHitKey(
  hit: Pick<ProductSearchIndexSearchHit, "productId" | "sourceChannelId">,
): string {
  return `${hit.sourceChannelId}::${hit.productId}`;
}

function getGroupedOptionSignature(option: GroupedSelectOption): string {
  return [
    option.group,
    option.channelId ?? "",
    String(option.value),
    option.label,
    option.channelName ?? "",
    option.priceText ?? "",
  ].join("::");
}

function groupOptionsForDisplay(
  items: GroupedSelectOption[],
): Array<[string, GroupedSelectOption[]]> {
  const grouped = new Map<string, GroupedSelectOption[]>();

  for (const item of items) {
    const existing = grouped.get(item.group);
    if (existing) {
      existing.push(item);
      continue;
    }

    grouped.set(item.group, [item]);
  }

  return Array.from(grouped.entries());
}

function getProductDefaultPriceMinorUnits(product: Product): number {
  const defaultPrice = (product as ProductDefaultPriceLike).defaultPrice;
  return defaultPrice?.value ?? defaultPrice?.minorUnits ?? 0;
}

function resolveCategorizedProductsArgs(
  tenantContextOrLng?: TenantContext | Locale,
  lng?: Locale,
): { lng?: Locale; tenantContext: TenantContext; } {
  if (typeof tenantContextOrLng === "string") {
    return {
      lng: tenantContextOrLng,
      tenantContext: DEDICATED_TENANT_CONTEXT,
    };
  }

  return {
    ...(lng ? { lng } : {}),
    tenantContext: tenantContextOrLng ?? DEDICATED_TENANT_CONTEXT,
  };
}

async function fetchCategorizedCardProductsUncached(
  channelId: string,
  tenantContext: TenantContext,
  lng?: Locale,
): Promise<Record<string, ExtendedCardProduct[]> | undefined> {
  try {
    const where = (await import("firebase/firestore")).where;
    const firebaseHelpers = await import("@konfi/firebase");
    const db = firebaseHelpers.db;
    const get = firebaseHelpers.get;
    const tenantConstraints =
      firebaseHelpers.tenant.queryConstraints(tenantContext);
    const firestore = (await import("@/lib/firebase/clientApp")).firestore;
    const channelsResult = await get<Channel>(
      db.query<Channel>(firestore, "channels", 999, undefined, [
        ...tenantConstraints,
      ]),
    );
    const [channels] = channelsResult ? channelsResult : [];
    const result = await get<Product>(
      db.query<Product>(
        firestore,
        `/channels/${channelId}/products`,
        999,
        undefined,
        [
          ...tenantConstraints,
          where("active", "==", true),
          where("availability.published", "==", true),
        ],
      ),
    );
    const linkedResult = await get<Product>(
      db.collectionGroup<Product>(firestore, `products`, 999, [
        ...tenantConstraints,
        where("active", "==", true),
        where("availability.published", "==", true),
        where("linkedChannels", "array-contains", channelId),
      ]),
    );
    const dbCategoriesResult = await get<Category>(
      db.query<Category>(
        firestore,
        `/channels/${channelId}/categories`,
        99,
        undefined,
        [...tenantConstraints],
      ),
    );

    if (!dbCategoriesResult) return undefined;
    const [dbCategories] = dbCategoriesResult;

    // Fetch attributes to enable searching by attribute options
    const attributesResult = await get<Attribute>(
      db.query<Attribute>(firestore, `/attributes`, 999, undefined, [
        ...tenantConstraints,
      ]),
    );
    const [attributes] = attributesResult ? attributesResult : [];
    const attributeMap = new Map<string, Attribute>();
    const attributeOptionLabelMaps = new Map<string, Map<string, string>>();
    if (attributes) {
      for (const attr of attributes) {
        attributeMap.set(attr.id, attr);
        attributeOptionLabelMaps.set(
          attr.id,
          new Map(attr.options.map((option) => [option.value, option.label])),
        );
      }
    }
    if (!result) return undefined;
    // eslint-disable-next-line prefer-const
    let [products, , productRefs] = result;
    const productSourceChannelIds = new Map<Product, string>();
    products.forEach((product, index) => {
      const sourceChannelId = productRefs[index]?.parent.parent?.id;
      if (sourceChannelId)
        productSourceChannelIds.set(product, sourceChannelId);
    });
    const [linkedProducts, , linkedProductRefs] = linkedResult
      ? linkedResult
      : [];
    if (linkedProducts && !isEmpty(linkedProducts)) {
      linkedProducts.forEach((product, index) => {
        const sourceChannelId = linkedProductRefs?.[index]?.parent.parent?.id;
        if (sourceChannelId)
          productSourceChannelIds.set(product, sourceChannelId);
      });
      products = products.concat(linkedProducts);
    }
    const categoryIdByName = new Map(
      dbCategories.map((category) => [category.name, category.id]),
    );
    const channelsById = new Map(
      (channels ?? []).map((channel) => [channel.id, channel]),
    );
    const categoryTranslationById = new Map<string, string>();
    const categorizedCardProducts: CategorizedCardProducts = {};
    const productsByCategory = new Map<string, ExtendedCardProduct[]>();

    for (const product of products) {
      if (!isPurchasable(product)) {
        continue;
      }

      const categoryId = categoryIdByName.get(product.category.name);
      if (lng && lng !== DEFAULT_LOCALE && categoryId) {
        let translatedName = categoryTranslationById.get(categoryId);

        if (isUndefined(translatedName)) {
          const translation = await getCategoryTranslation(
            firestore,
            channelId,
            categoryId,
            lng,
          );

          translatedName = translation?.name ?? "";
          categoryTranslationById.set(categoryId, translatedName);
        }

        if (translatedName) {
          // Override product fields with translated values
          product.category.name = translatedName;
        }
      }

      const categoryName = product.category.name;
      const productChannelId =
        product.channelId || productSourceChannelIds.get(product);

      // Build searchable attribute text
      const attributeTexts: string[] = [];
      if (product.attributeOptions && attributeMap.size > 0) {
        for (const [attrId, optionValues] of Object.entries(
          product.attributeOptions,
        )) {
          const attribute = attributeMap.get(attrId);
          if (attribute) {
            // Add attribute name
            attributeTexts.push(attribute.name);
            // Add option labels for the selected values
            const optionLabels = attributeOptionLabelMaps.get(attrId);
            for (const optionValue of optionValues) {
              const optionLabel = optionLabels?.get(optionValue);
              if (optionLabel) {
                attributeTexts.push(optionLabel);
              }
            }
          }
        }
      }

      const cardProducts = productsByCategory.get(categoryName) ?? [];
      const effectivePrices = getProductListingPrices(product);
      cardProducts.push({
        id: product.id,
        slug: product.seo.slug,
        name: product.name,
        images: product.spec.images,
        isNew: isWithinLastMonth(product.availability.publication?.toDate()),
        attributes: product.attributes,
        attributeOptions: product.attributeOptions,
        categoryName,
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
        channelId: productChannelId,
        channelName: productChannelId
          ? channelsById.get(productChannelId)?.name
          : undefined,
        // Store attribute text for searching (only if we have attribute text)
        attributeText:
          attributeTexts.length > 0 ? attributeTexts.join(" ") : undefined,
      });

      if (!productsByCategory.has(categoryName)) {
        productsByCategory.set(categoryName, cardProducts);
      }
    }

    const categories = Array.from(productsByCategory.keys()).toSorted((a, b) =>
      a.localeCompare(b),
    );
    for (const category of categories) {
      const cardProducts = productsByCategory.get(category) ?? [];
      categorizedCardProducts[category] = orderBy(
        cardProducts,
        ["name"],
        ["asc"],
      );
    }
    return categorizedCardProducts;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function getCategorizedCardProducts(
  channelId: string,
  tenantContextOrLng?: TenantContext | Locale,
  lng?: Locale,
): Promise<CategorizedCardProductsResult> {
  const { tenantContext, lng: resolvedLng } = resolveCategorizedProductsArgs(
    tenantContextOrLng,
    lng,
  );
  const cacheKey = getCategorizedProductsCacheKey(
    channelId,
    tenantContext,
    resolvedLng,
  );
  const now = Date.now();

  const cached = categorizedProductsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const inFlight = categorizedProductsInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = fetchCategorizedCardProductsUncached(
    channelId,
    tenantContext,
    resolvedLng,
  );
  categorizedProductsInFlight.set(cacheKey, fetchPromise);

  try {
    const data = await fetchPromise;
    categorizedProductsCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + CATEGORIZED_PRODUCTS_CACHE_TTL_MS,
    });
    return data;
  } finally {
    categorizedProductsInFlight.delete(cacheKey);
  }
}

export function ProductGroupedIndexedSearch(props: IndexedSearchProps) {
  const { fieldData, update } = props;
  const { t } = useT(["translation"]);
  const selectedProduct: Product | undefined = useWatch({
    name: fieldData.name,
  });
  const [isEditing, setIsEditing] = useState(!update || !selectedProduct);

  useEffect(() => {
    if (!update || !selectedProduct) {
      setIsEditing(true);
    }
  }, [selectedProduct, update]);

  if (update && selectedProduct && !isEditing) {
    return (
      <HStack
        align="center"
        borderColor="border.muted"
        borderRadius="3xl"
        borderWidth="1px"
        gap={2}
        minH="10"
        px={3}
        py={2}
        width="100%"
      >
        <Text flex="1" fontSize="sm" truncate>
          {selectedProduct.name}
        </Text>
        <IconButton
          aria-label={t("admin.changeProduct", {
            defaultValue: "Change product",
          })}
          onClick={() => setIsEditing(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <MaterialSymbol>edit</MaterialSymbol>
        </IconButton>
      </HStack>
    );
  }

  return <ProductGroupedIndexedSearchEditor {...props} />;
}

function ProductGroupedIndexedSearchEditor({
  fieldData,
  fieldArrayIndex,
  lng,
}: IndexedSearchProps) {
  if (isUndefined(fieldArrayIndex)) throw "fieldArrayIndex is Undefined.";
  const { t } = useT(["fakturownia", "translation"]);
  // Persist search provider selection per item to avoid losing it when FieldArray reorders/unmounts
  // Use a distinct field name (searchProvider) to avoid any collision with product.provider
  const providerFieldName = `items[${fieldArrayIndex}].searchProvider`;
  const watchedProvider = useWatch({ name: providerFieldName }) as
    | string
    | undefined;
  const provider = watchedProvider ?? "konfi";
  const radioGroupName = useId();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSemanticQuery, setDebouncedSemanticQuery] =
    useState<string>("");
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const { setValue, control } = useFormContext();
  const [konfiUsageByProductId, setKonfiUsageByProductId] = useState<
    Record<string, number>
  >({});
  const {
    buyerNip,
    setBuyerNip,
    resolveClientByNip,
    computeGrossOverride,
    hasOverride,
    clearClient,
    positionMap,
  } = useFakturowniaPricing();
  const { data: categorizedCardProducts, isLoading } = useSWRImmutable(
    channel?.id
      ? [
        channel.id,
        lng ?? DEFAULT_LOCALE,
        tenantContext.deploymentMode,
        tenantContext.requireTenantId,
        tenantContext.tenantId ?? "",
      ]
      : null,
    ([channelId, locale]: [string, Locale]) =>
      getCategorizedCardProducts(channelId, tenantContext, locale),
  );
  // Whether Fakturownia is enabled in this app (env present)
  const { data: hasFakturowniaKey } = useSWRImmutable(
    "fakturownia-api-key",
    () => isFakturowniaApiKeyProvided(),
  );
  const availableProviders = useMemo(
    () => ["konfi", ...(hasFakturowniaKey ? (["fakturownia"] as const) : [])],
    [hasFakturowniaKey],
  );
  const selectedProduct: Product | undefined = useWatch({
    name: `items[${fieldArrayIndex}].product`,
  });
  const currentCustomPrice = useWatch({
    disabled: provider !== "fakturownia",
    name: `items[${fieldArrayIndex}].customPrice`,
  }) as unknown as number | undefined;
  const mostOftenChosenGroup = t("admin.mostOftenChosenProducts", {
    defaultValue: "Most often chosen",
  });
  const normalMatchesGroup = t("admin.normalMatches", {
    defaultValue: "Normal matches",
  });
  const semanticMatchesGroup = t("admin.semanticMatches", {
    defaultValue: "Semantic matches",
  });
  const lastAutoPriceRef = useRef<number | undefined>(undefined);

  const resetSelectedProductConfiguration = useCallback(
    (options?: { preserveCustomPrice?: boolean; }) => {
      for (const {
        field,
        value: resetValue,
      } of getOrderItemConfigurationResetValues(options)) {
        setValue(`items[${fieldArrayIndex}].${field}`, resetValue, {
          shouldDirty: true,
          shouldValidate: false,
          shouldTouch: false,
        });
      }
    },
    [fieldArrayIndex, setValue],
  );

  useEffect(() => {
    setKonfiUsageByProductId(readKonfiProductUsageForChannel(channel?.id));
  }, [channel?.id]);

  // Ensure default provider is stored in form state for persistence across mounts
  useEffect(() => {
    if (!watchedProvider) {
      setValue(providerFieldName, "konfi", {
        shouldDirty: false,
        shouldValidate: false,
        shouldTouch: false,
      });
    }
  }, [watchedProvider, providerFieldName, setValue]);
  // Debounced search for Fakturownia to avoid disabling typing and spamming requests
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  useEffect(() => {
    if (provider !== "fakturownia") {
      setDebouncedQuery("");
      return;
    }
    const q = searchQuery.trim();
    const handle = setTimeout(() => setDebouncedQuery(q), 300);
    return () => clearTimeout(handle);
  }, [provider, searchQuery]);

  useEffect(() => {
    if (provider !== "konfi") {
      setDebouncedSemanticQuery("");
      return;
    }

    const q = searchQuery.trim();
    if (q.length < 3) {
      setDebouncedSemanticQuery("");
      return;
    }

    const handle = setTimeout(() => setDebouncedSemanticQuery(q), 250);
    return () => clearTimeout(handle);
  }, [provider, searchQuery]);

  const billingNipField: string | undefined = useWatch({
    disabled: provider !== "fakturownia",
    name: "billing.nip",
  }) as unknown as string | undefined;

  useEffect(() => {
    if (provider !== "fakturownia") return;
    const candidate = (billingNipField || "").trim();
    if (candidate && candidate !== buyerNip) {
      setBuyerNip(candidate);
      // Fire and forget resolve, toast handled in context
      void resolveClientByNip(candidate);
    } else if (!candidate) {
      // If NIP cleared, also clear pricing context so any overrides disappear
      clearClient();
    }
  }, [
    billingNipField,
    buyerNip,
    clearClient,
    provider,
    resolveClientByNip,
    setBuyerNip,
  ]);

  // Recompute custom price when price list (positionMap) changes and a Fakturownia product is selected
  useEffect(() => {
    if (provider !== "fakturownia") return;
    if (!selectedProduct) return;
    const prov = (
      selectedProduct as unknown as {
        provider?: { type?: string; productId?: string | number; };
      }
    ).provider;
    if (!prov || prov.type !== "FAKTUROWNIA" || !prov.productId) return;
    // Use defaultPrice.value (types Price) OR defaultPrice.minorUnits (mapped external) as base
    const base = getProductDefaultPriceMinorUnits(selectedProduct);
    if (!base || base <= 0) return;
    const desired = computeGrossOverride(base, String(prov.productId));
    const shouldUpdate =
      currentCustomPrice === undefined ||
      currentCustomPrice === lastAutoPriceRef.current;
    if (shouldUpdate && desired !== currentCustomPrice) {
      setValue(`items[${fieldArrayIndex}].customPrice`, desired, {
        shouldDirty: true,
      });
      lastAutoPriceRef.current = desired;
    }
  }, [
    computeGrossOverride,
    currentCustomPrice,
    fieldArrayIndex,
    positionMap,
    provider,
    selectedProduct,
    setValue,
  ]);
  const groupedOptions = useMemo<GroupedSelectOption[]>(() => {
    if (fieldData.searchFor !== "products" || !categorizedCardProducts)
      return [];
    const baseOptions: GroupedSelectOption[] = [];
    const categories = Object.keys(categorizedCardProducts);
    categories.forEach((categoryName) => {
      const products = categorizedCardProducts[categoryName];
      const nameCount: Record<string, number> = {};
      products.forEach((p) => {
        nameCount[p.name] = (nameCount[p.name] || 0) + 1;
      });
      products.forEach((product) => {
        const shouldShowChannel =
          Boolean(product.channelName) && nameCount[product.name] > 1;
        baseOptions.push({
          label: product.name,
          value: product.id,
          group: categoryName,
          channelId: product.channelId,
          channelName: shouldShowChannel ? product.channelName : undefined,
          attributeText: product.attributeText,
          priceText: product.startingFrom?.formattedPrice,
        });
      });
    });

    return prioritizeMostOftenChosenOptions(
      baseOptions,
      konfiUsageByProductId,
      mostOftenChosenGroup,
    );
  }, [
    fieldData.searchFor,
    categorizedCardProducts,
    konfiUsageByProductId,
    mostOftenChosenGroup,
  ]);
  const groupedOptionsByKey = useMemo(
    () =>
      new Map(
        groupedOptions.map((option) => [
          getProductGroupedSearchOptionKey(option),
          option,
        ]),
      ),
    [groupedOptions],
  );
  const { data: semanticSearchResult } = useSWR(
    channel?.id && provider === "konfi" && debouncedSemanticQuery.length >= 3
      ? ["semantic-product-search", channel.id, debouncedSemanticQuery]
      : null,
    async ([, channelId, query]: [string, string, string]) =>
      searchProductSearchIndexAction({
        channelId,
        query,
        limit: 12,
      }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const semanticHits = useMemo(
    () =>
      semanticSearchResult?.ok
        ? semanticSearchResult.hits
        : EMPTY_PRODUCT_SEARCH_INDEX_HITS,
    [semanticSearchResult],
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const trimmedSearchQuery = deferredSearchQuery.trim();
  const fuzzyRankedKonfiOptions = useMemo(() => {
    if (!trimmedSearchQuery) return groupedOptions;

    return rankProductGroupedLocalSearchOptions(
      groupedOptions,
      trimmedSearchQuery,
      konfiUsageByProductId,
    );
  }, [trimmedSearchQuery, groupedOptions, konfiUsageByProductId]);
  const semanticRankedKonfiOptions = useMemo(() => {
    if (
      provider !== "konfi" ||
      !trimmedSearchQuery ||
      debouncedSemanticQuery !== trimmedSearchQuery ||
      semanticHits.length === 0
    ) {
      return [];
    }

    const seen = new Set<string>();
    const rankedOptions: GroupedSelectOption[] = [];

    for (const hit of semanticHits) {
      const option = groupedOptionsByKey.get(getSemanticHitKey(hit));
      if (!option) continue;

      const optionKey = getProductGroupedSearchOptionKey(option);
      if (seen.has(optionKey)) continue;

      seen.add(optionKey);
      rankedOptions.push(option);
    }

    return rankedOptions;
  }, [
    provider,
    trimmedSearchQuery,
    debouncedSemanticQuery,
    semanticHits,
    groupedOptionsByKey,
  ]);
  const semanticSupplementalKonfiOptions = useMemo(() => {
    if (semanticRankedKonfiOptions.length === 0) return [];

    return getSemanticSupplementalProductOptions({
      localOptions: fuzzyRankedKonfiOptions,
      semanticGroup: semanticMatchesGroup,
      semanticOptions: semanticRankedKonfiOptions,
    });
  }, [
    semanticRankedKonfiOptions,
    fuzzyRankedKonfiOptions,
    semanticMatchesGroup,
  ]);
  const konfiCollectionItems = useMemo(() => {
    if (!trimmedSearchQuery) return groupedOptions;
    return [...fuzzyRankedKonfiOptions, ...semanticSupplementalKonfiOptions];
  }, [
    trimmedSearchQuery,
    groupedOptions,
    fuzzyRankedKonfiOptions,
    semanticSupplementalKonfiOptions,
  ]);
  const normalKonfiOptionGroups = useMemo(
    () => groupOptionsForDisplay(fuzzyRankedKonfiOptions),
    [fuzzyRankedKonfiOptions],
  );
  const semanticKonfiOptionGroups = useMemo(
    () => groupOptionsForDisplay(semanticSupplementalKonfiOptions),
    [semanticSupplementalKonfiOptions],
  );
  const shouldSplitKonfiResults =
    provider === "konfi" &&
    trimmedSearchQuery.length > 0 &&
    fuzzyRankedKonfiOptions.length > 0 &&
    semanticSupplementalKonfiOptions.length > 0;
  const splitKonfiResultsContentHeight = "24rem";
  const splitKonfiResultsNormalPaneHeight = "15rem";
  const splitKonfiResultsSemanticPaneHeight = "9rem";
  const { collection, set } = useListCollection<GroupedSelectOption>({
    initialItems: konfiCollectionItems,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    groupBy: (item) => item.group,
  });
  const [inputValue, setInputValue] = useState<string>(
    selectedProduct?.name ?? "",
  );
  const lastAppliedCollectionSignatureRef = useRef<string>("");

  // If Fakturownia becomes unavailable while selected, reset to konfi and clear FK-specific state
  useEffect(() => {
    if (provider === "fakturownia" && !hasFakturowniaKey) {
      setValue(providerFieldName, "konfi", {
        shouldDirty: false,
        shouldValidate: false,
        shouldTouch: false,
      });
      setSearchQuery("");
      setInputValue("");
      set(groupedOptions);
      clearClient();
      // Also clear any selected product coming from FK
      resetSelectedProductConfiguration();
      setValue(`items[${fieldArrayIndex}].product`, undefined);
    }
  }, [
    clearClient,
    fieldArrayIndex,
    groupedOptions,
    hasFakturowniaKey,
    provider,
    providerFieldName,
    resetSelectedProductConfiguration,
    set,
    setValue,
  ]);

  useEffect(() => {
    if (!selectedProduct) {
      setInputValue("");
      return;
    }
    const matchedOption = groupedOptions.find(
      (option) => option.value === selectedProduct.id,
    );
    setInputValue(matchedOption?.label ?? selectedProduct.name ?? "");
  }, [selectedProduct, groupedOptions]);

  const handleSelectOption = async (
    _fieldName: string,
    option: SelectOption | null,
  ) => {
    if (isNull(option)) {
      console.error("Option is Null");
      return;
    }
    if (provider === "fakturownia") {
      try {
        const rawId = String(option.value).replace(/^fk_/i, "");
        const fkProduct: FakturowniaProduct | undefined =
          await getProductById(rawId);

        const grossStr = (fkProduct?.priceGross ?? "").toString().trim();
        let gross = grossStr
          ? convertPriceToMinorUnits(grossStr)
          : convertPriceToMinorUnits("1");
        if (!gross || gross <= 0) gross = convertPriceToMinorUnits("1");
        // Apply price list override if available
        gross = computeGrossOverride(
          gross,
          fkProduct?.id ? String(fkProduct.id) : undefined,
        );
        resetSelectedProductConfiguration({ preserveCustomPrice: true });
        setValue(`items[${fieldArrayIndex}].customPrice`, gross);
        lastAutoPriceRef.current = gross;
        const mapped = mapFakturowniaToNativeProduct(
          fkProduct,
          option.label || undefined,
        );
        setValue(
          `items[${fieldArrayIndex}].product`,
          mapped as unknown as Product,
        );
        setValue(`items[${fieldArrayIndex}].unit`, Unit.PCS);
        setValue(`items[${fieldArrayIndex}].id`, getRandomId());
        setInputValue(option.label ?? mapped.name ?? "");
        setSearchQuery("");
        // Reset list to current
        set(
          getActiveProductCollectionItems(
            true,
            groupedOptions,
            fakturowaniaOptions,
          ),
        );
      } catch (err) {
        console.error("Fakturownia select error", err);
      }
      return;
    }
    // Firestore mode
    try {
      if (isNull(channel)) {
        console.error("Channel is Null");
        return;
      }
      const where = (await import("firebase/firestore")).where;
      const firebaseHelpers = await import("@konfi/firebase");
      const db = firebaseHelpers.db;
      const get = firebaseHelpers.get;
      const tenantConstraints =
        firebaseHelpers.tenant.queryConstraints(tenantContext);
      const firestore = (await import("@/lib/firebase/clientApp")).firestore;
      const selectedOption = option as GroupedSelectOption;
      const productQuery = selectedOption.channelId
        ? db.query<Product>(
          firestore,
          `/channels/${selectedOption.channelId}/products`,
          1,
          undefined,
          [...tenantConstraints, where("id", "==", option.value)],
        )
        : db.collectionGroup<Product>(firestore, `products`, 1, [
          ...tenantConstraints,
          where("id", "==", option.value),
        ]);
      const result = await get<Product>(productQuery);
      const [products] = result ? result : [];
      const object: Product | undefined = products?.[0];
      if (object) {
        resetSelectedProductConfiguration();
        const sourceChannelId = selectedOption.channelId ?? object.channelId;
        // Ensure provider metadata exists for validation downstream
        const withProvider: Product = {
          ...object,
          channelId: sourceChannelId,
          provider:
            (object as Product).provider &&
              (object as Product).provider?.type &&
              (object as Product).provider?.productId
              ? (object as Product).provider
              : { type: "KONFI", productId: object.id },
        } as Product;
        setValue(`items[${fieldArrayIndex}].product`, withProvider);
        setValue(`items[${fieldArrayIndex}].id`, getRandomId());
        setInputValue(option.label ?? withProvider.name ?? "");
        setSearchQuery("");
        const nextUsage = incrementKonfiProductUsage(
          channel?.id,
          withProvider.id,
        );
        setKonfiUsageByProductId(nextUsage);
        set(konfiCollectionItems);
      }
    } catch (err) {
      console.error("Konfi product select error", err);
    }
  };

  if (isUndefined(fieldArrayIndex)) throw "fieldArrayIndex is Undefined.";

  // Fakturownia search via SWR (query-driven)
  const { data: fakturowniaProducts, isValidating: isLoadingFk } = useSWR<
    FakturowniaProduct[]
  >(
    hasFakturowniaKey &&
      provider === "fakturownia" &&
      debouncedQuery.length >= 2
      ? ["fk-products", debouncedQuery]
      : null,
    async ([, query]) => {
      try {
        const list = await searchFakturowniaProducts(query as string);
        return list ?? [];
      } catch (e) {
        console.error("Fakturownia fetch error", e);
        return [];
      }
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const fakturowaniaOptions: GroupedSelectOption[] = useMemo(() => {
    if (provider !== "fakturownia" || !hasFakturowniaKey) return [];
    const items: GroupedSelectOption[] = (fakturowniaProducts ?? []).map(
      (p) => {
        const grossStr = (p?.priceGross ?? "").toString().trim();
        const baseMinor = grossStr ? convertPriceToMinorUnits(grossStr) : 0;
        const overridden = computeGrossOverride(
          baseMinor,
          p?.id ? String(p.id) : undefined,
        );
        const priceText = overridden > 0 ? formatPLN(overridden) : undefined;
        return {
          label: p.name ?? `#${p.id}`,
          value: `fk_${p.id}`,
          group: "Fakturownia",
          channelName: undefined,
          priceText,
        };
      },
    );
    const q = debouncedQuery;
    if (!q) return items;
    return rankProductGroupedLocalSearchOptions(items, q, {});
  }, [
    provider,
    hasFakturowniaKey,
    fakturowniaProducts,
    computeGrossOverride,
    debouncedQuery,
  ]);

  const activeCollectionItems = useMemo(
    () =>
      getActiveProductCollectionItems(
        Boolean(hasFakturowniaKey) && provider === "fakturownia",
        konfiCollectionItems,
        fakturowaniaOptions,
      ),
    [hasFakturowniaKey, provider, konfiCollectionItems, fakturowaniaOptions],
  );

  const hasKonfiUsage = Object.keys(konfiUsageByProductId).length > 0;

  const handleResetMostOftenChosenProducts = () => {
    clearKonfiProductUsageForChannel(channel?.id);
    setKonfiUsageByProductId({});
  };

  // Keep collection in sync with toggle/data
  useEffect(() => {
    const nextSignature = activeCollectionItems
      .map(getGroupedOptionSignature)
      .join("|");

    if (lastAppliedCollectionSignatureRef.current === nextSignature) return;

    lastAppliedCollectionSignatureRef.current = nextSignature;
    set(activeCollectionItems);
  }, [activeCollectionItems, set]);

  return (
    <Controller
      name={fieldData.name}
      control={control}
      render={({ field }) => (
        <VStack align="stretch" width="100%">
          {availableProviders.length > 1 ||
            (provider === "konfi" && hasKonfiUsage) ? (
            <HStack
              justify={
                availableProviders.length > 1 ? "space-between" : "flex-end"
              }
              width="100%"
              pb={2}
            >
              {availableProviders.length > 1 ? (
                <Text fontSize="sm" color="gray.500">
                  {t("admin.searchSource", { defaultValue: "Search source" })}
                </Text>
              ) : null}
              <HStack gap={2}>
                {availableProviders.length > 1 ? (
                  <RadioGroup.Root
                    value={provider}
                    name={radioGroupName}
                    onValueChange={({ value }) => {
                      const next = value || "konfi";
                      // Disallow switching to unavailable providers
                      const safeNext =
                        next === "fakturownia" && !hasFakturowniaKey
                          ? "konfi"
                          : next;
                      setValue(providerFieldName, safeNext);
                      // Reset state when switching
                      setSearchQuery("");
                      setInputValue("");
                      set(
                        getActiveProductCollectionItems(
                          Boolean(hasFakturowniaKey) &&
                          safeNext === "fakturownia",
                          groupedOptions,
                          fakturowaniaOptions,
                        ),
                      );
                      // When switching away from Fakturownia, clear client/pricing context to avoid preserved price list
                      if (
                        provider === "fakturownia" &&
                        safeNext !== "fakturownia"
                      ) {
                        clearClient();
                      }
                      resetSelectedProductConfiguration();
                      setValue(`items[${fieldArrayIndex}].product`, undefined);
                    }}
                    orientation="horizontal"
                    colorPalette="primary"
                    size="sm"
                  >
                    <HStack gap="4">
                      <RadioGroup.Item key="konfi" value="konfi">
                        <RadioGroup.ItemHiddenInput />
                        <RadioGroup.ItemIndicator />
                        <RadioGroup.ItemText>Konfi</RadioGroup.ItemText>
                      </RadioGroup.Item>
                      {hasFakturowniaKey ? (
                        <RadioGroup.Item key="fakturownia" value="fakturownia">
                          <RadioGroup.ItemHiddenInput />
                          <RadioGroup.ItemIndicator />
                          <RadioGroup.ItemText>Fakturownia</RadioGroup.ItemText>
                        </RadioGroup.Item>
                      ) : null}
                    </HStack>
                  </RadioGroup.Root>
                ) : null}
                {provider === "konfi" && hasKonfiUsage ? (
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={handleResetMostOftenChosenProducts}
                    aria-label={t("admin.resetMostOftenChosenProducts", {
                      defaultValue: "Reset most often chosen",
                    })}
                    title={t("admin.resetMostOftenChosenProducts", {
                      defaultValue: "Reset most often chosen",
                    })}
                  >
                    <MaterialSymbol>restart_alt</MaterialSymbol>
                  </IconButton>
                ) : null}
              </HStack>
            </HStack>
          ) : null}
          <Combobox.Root
            colorPalette="primary"
            collection={collection}
            value={selectedProduct?.id ? [selectedProduct.id] : []}
            inputValue={inputValue}
            onValueChange={async (details) => {
              const selectedValue = details.value[0];
              if (!selectedValue) {
                resetSelectedProductConfiguration();
                setValue(`items[${fieldArrayIndex}].product`, undefined);
                setInputValue("");
                setSearchQuery("");
                set(
                  getActiveProductCollectionItems(
                    provider === "fakturownia",
                    konfiCollectionItems,
                    fakturowaniaOptions,
                  ),
                );
                return;
              }
              const selectedOption = collection.find(selectedValue);
              if (selectedOption) {
                await handleSelectOption(field.name, selectedOption);
              }
            }}
            onBlur={field.onBlur}
            // Keep input enabled for Fakturownia while searching to avoid blocking typing
            disabled={
              (!hasFakturowniaKey || provider !== "fakturownia") &&
              (!groupedOptions.length || isLoading)
            }
            placeholder={fieldData.placeholder}
            selectionBehavior="replace"
            closeOnSelect
            openOnClick
            width="100%"
            onInputValueChange={(details) => {
              setInputValue(details.inputValue);
              const query = details.inputValue.trim();
              if (provider === "fakturownia" && hasFakturowniaKey) {
                setSearchQuery(query);
                // Collection will be updated via fakturowaniaOptions effect
              } else {
                setSearchQuery(query);
              }
            }}
          >
            <Combobox.Control>
              <Combobox.Input placeholder={fieldData.placeholder} />
              <Combobox.IndicatorGroup>
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content
                  p={shouldSplitKonfiResults ? 0 : undefined}
                  h={
                    shouldSplitKonfiResults
                      ? splitKonfiResultsContentHeight
                      : undefined
                  }
                  overflow={shouldSplitKonfiResults ? "hidden" : undefined}
                >
                  <Combobox.Empty>
                    {provider === "fakturownia"
                      ? debouncedQuery.length < 2
                        ? t("admin.typeToSearchFakturownia", {
                          defaultValue:
                            "Type at least 2 characters to search Fakturownia",
                        })
                        : isLoadingFk
                          ? t("admin.searching", {
                            defaultValue: "Searching...",
                          })
                          : t("admin.noProductsFound", {
                            defaultValue: "No products found",
                          })
                      : t("admin.noProductsFound", {
                        defaultValue: "No products found",
                      })}
                  </Combobox.Empty>
                  {shouldSplitKonfiResults ? (
                    <VStack align="stretch" gap={0} p={0} h="full">
                      <Box
                        h={splitKonfiResultsNormalPaneHeight}
                        display="flex"
                        flexDirection="column"
                      >
                        <Text
                          px={3}
                          py={2}
                          fontSize="xs"
                          fontWeight="semibold"
                          color="fg.muted"
                          bg="bg.subtle"
                        >
                          {normalMatchesGroup}
                        </Text>
                        <Box
                          flex="1"
                          minH={0}
                          overflowY="auto"
                          overscrollBehaviorY="contain"
                        >
                          {normalKonfiOptionGroups.map(
                            ([groupLabel, items]) => (
                              <Combobox.ItemGroup key={groupLabel}>
                                <Combobox.ItemGroupLabel>
                                  {groupLabel}
                                </Combobox.ItemGroupLabel>
                                {items.map((item) => (
                                  <Combobox.Item key={item.value} item={item}>
                                    <Combobox.ItemText width="100%">
                                      <HStack gap={2} w="100%">
                                        <span>{item.label}</span>
                                        {item.channelName ? (
                                          <Badge
                                            colorPalette="gray"
                                            variant="surface"
                                          >
                                            {item.channelName}
                                          </Badge>
                                        ) : null}
                                        {item.priceText ? (
                                          <Text ml="auto" color="gray.600">
                                            {item.priceText}
                                          </Text>
                                        ) : null}
                                      </HStack>
                                    </Combobox.ItemText>
                                    <Combobox.ItemIndicator />
                                  </Combobox.Item>
                                ))}
                              </Combobox.ItemGroup>
                            ),
                          )}
                        </Box>
                      </Box>
                      <Box
                        h={splitKonfiResultsSemanticPaneHeight}
                        display="flex"
                        flexDirection="column"
                        borderTopWidth="1px"
                        borderColor="border.muted"
                      >
                        <Text
                          px={3}
                          py={2}
                          fontSize="xs"
                          fontWeight="semibold"
                          color="fg.muted"
                          bg="bg.subtle"
                        >
                          {semanticMatchesGroup}
                        </Text>
                        <Box
                          flex="1"
                          minH={0}
                          overflowY="auto"
                          overscrollBehaviorY="contain"
                        >
                          {semanticKonfiOptionGroups.map(
                            ([groupLabel, items]) => (
                              <Combobox.ItemGroup key={groupLabel}>
                                <Combobox.ItemGroupLabel>
                                  {groupLabel}
                                </Combobox.ItemGroupLabel>
                                {items.map((item) => (
                                  <Combobox.Item key={item.value} item={item}>
                                    <Combobox.ItemText width="100%">
                                      <HStack gap={2} w="100%">
                                        <span>{item.label}</span>
                                        {item.channelName ? (
                                          <Badge
                                            colorPalette="gray"
                                            variant="surface"
                                          >
                                            {item.channelName}
                                          </Badge>
                                        ) : null}
                                        <Badge
                                          colorPalette="purple"
                                          variant="surface"
                                        >
                                          {t("admin.semanticMatch", {
                                            defaultValue: "Semantic",
                                          })}
                                        </Badge>
                                        {item.priceText ? (
                                          <Text ml="auto" color="gray.600">
                                            {item.priceText}
                                          </Text>
                                        ) : null}
                                      </HStack>
                                    </Combobox.ItemText>
                                    <Combobox.ItemIndicator />
                                  </Combobox.Item>
                                ))}
                              </Combobox.ItemGroup>
                            ),
                          )}
                        </Box>
                      </Box>
                    </VStack>
                  ) : (
                    collection.group().map(([groupLabel, items]) => (
                      <Combobox.ItemGroup key={groupLabel}>
                        <Combobox.ItemGroupLabel>
                          {groupLabel}
                        </Combobox.ItemGroupLabel>
                        {items.map((item) => (
                          <Combobox.Item key={item.value} item={item}>
                            <Combobox.ItemText width="100%">
                              <HStack gap={2} w="100%">
                                <span>{item.label}</span>
                                {item.channelName ? (
                                  <Badge colorPalette="gray" variant="surface">
                                    {item.channelName}
                                  </Badge>
                                ) : null}
                                {provider === "konfi" &&
                                  item.group === semanticMatchesGroup ? (
                                  <Badge
                                    colorPalette="purple"
                                    variant="surface"
                                  >
                                    {t("admin.semanticMatch", {
                                      defaultValue: "Semantic",
                                    })}
                                  </Badge>
                                ) : null}
                                {/* Indicate price list override presence for Fakturownia items */}
                                {provider === "fakturownia" &&
                                  String(item.value).startsWith("fk_") &&
                                  hasOverride(
                                    String(item.value).replace(/^fk_/i, ""),
                                  ) ? (
                                  <Badge colorPalette="green" variant="surface">
                                    {t("fakturownia.invoiceCreate.priceList", {
                                      defaultValue: "Price list",
                                    })}
                                  </Badge>
                                ) : null}
                                {item.priceText ? (
                                  <Text ml="auto" color="gray.600">
                                    {item.priceText}
                                  </Text>
                                ) : null}
                              </HStack>
                            </Combobox.ItemText>
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        ))}
                      </Combobox.ItemGroup>
                    ))
                  )}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
        </VStack>
      )}
    />
  );
}

function normalizePriceString(value: string): string {
  // Replace commas with dots, strip currency symbols/letters, keep digits and dots
  const replaced = value.replace(/,/g, ".");
  // Remove everything except digits, dot, and minus
  const cleaned = replaced.replace(/[^0-9.-]/g, "");
  // If multiple dots, keep the first
  const parts = cleaned.split(".");
  if (parts.length <= 2) return cleaned.trim();
  return `${parts[0]}.${parts.slice(1).join("")}`.trim();
}

function convertPriceToMinorUnits(value: string): number {
  const fractionDigits = 2;
  const normalized = normalizePriceString(value);
  const num = Number(normalized);
  if (!isFinite(num) || isNaN(num)) return 0;
  if (num <= 0) return 0;
  return Math.round(num * Math.pow(10, fractionDigits));
}

function formatPLN(minorUnits: number): string {
  const zloty = minorUnits / 100;
  // Use Polish-style comma as decimal separator
  const formatted = zloty.toFixed(2).replace(".", ",");
  return `${formatted} zł`;
}

function mapFakturowniaToNativeProduct(
  p?: FakturowniaProduct,
  fallbackName?: string,
): Product {
  const now = Timestamp.now();
  const name = p?.name || fallbackName || "Fakturownia product";
  const id = `fk_${p?.id ?? "unknown"}`;
  // Try to derive a minorUnits price from Fakturownia gross price to prevent UI flicker before customPrice is applied.
  const grossStr = (p?.priceGross ?? "").toString().trim();
  let grossMinorUnits = grossStr
    ? convertPriceToMinorUnits(grossStr)
    : convertPriceToMinorUnits("1");
  if (!grossMinorUnits || grossMinorUnits <= 0)
    grossMinorUnits = convertPriceToMinorUnits("1");
  return {
    id,
    name,
    createdBy: { id: "system", name: "System" },
    createdAt: now,
    updatedBy: { id: "system", name: "System" },
    updatedAt: now,
    active: true,
    prices: [],
    defaultPrice: { currency: CurrencyEnum.PLN, minorUnits: grossMinorUnits },
    lowPrice: { currency: CurrencyEnum.PLN, minorUnits: grossMinorUnits },
    highPrice: { currency: CurrencyEnum.PLN, minorUnits: grossMinorUnits },
    provider: { type: "FAKTUROWNIA", productId: String(p?.id ?? "") },
    disablePriceFetch: true,
    description: p?.description || "",
    volumes: [{ value: 1 }],
    attributes: [],
    attributeOptions: {},
    attributeDependencies: {},
    customSize: false,
    allowCustomPrice: true,
    recommended: false,
    difficulty: 1,
    shipping: {
      types: [
        ShippingTypes.CUSTOM,
        ShippingTypes.PERSONAL_COLLECTION,
        ShippingTypes.COURIER,
        ShippingTypes.PARCEL_DELIVERY_LOCKER,
      ],
    },
    spec: {
      images: [],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 1000000,
      step: 1,
      minimumWidth: 0,
      minimumHeight: 0,
    },
    category: { id: "fk", name: "Fakturownia" },
    seo: { slug: id, title: name, description: name },
    productType: null,
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    availability: {
      published: true,
      availableForPurchase: true,
      publication: null,
      expiration: null,
    },
    keywords: [],
    threeDModel: null,
    linkedChannels: [],
    linkedWarehouses: [],
    channelId: undefined,
    specialNotes: undefined,
  } as unknown as Product;
}
