import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { ensureEntityTranslationsAction } from "@/actions/managed-translations";
import { revalidateTagCache } from "@/actions";
import {
  assertSaasRuntimeModuleAction,
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { getStoredProductPriceSets } from "@/actions/external-products";
import { syncProductSearchIndexAction } from "@/actions/product-search-index";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useRealtimeFormDocument } from "@/hooks/useRealtimeFormDocument";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { firestore } from "@/lib/firebase/clientApp";
import { useTenantContext } from "@/context/tenant";
import {
  createFallbackProductPrice,
  getProductFormPreviewInitConfiguration,
  getInitialProductFormPrices,
} from "@/lib/product-form-prices";
import { validateDynamicProductPricing } from "@/lib/product-dynamic-pricing-validation";
import {
  buildAvailabilityPayload,
  isPublicationBeforeExpirationValid,
} from "@/lib/catalog/product-availability-form";
import {
  buildProductPriceBatchData,
  buildProductPageCountPriceBatchData,
  buildProductPageCountSegmentBasePriceBatchData,
  buildProductPageCountSegmentStepPriceBatchData,
  buildProductPageCountSegmentStepPriceSyncPlan,
  buildProductPageCountPriceSyncPlan,
  buildProductPriceSyncPlan,
} from "@/lib/product-price-sync";
import type {
  ConnectedProductImportApplyDraft,
  ConnectedProductImportTarget,
} from "@/lib/external-products/product-sync";
import { yupResolver } from "@hookform/resolvers/yup";
import { Container, Dialog, Portal, Skeleton } from "@chakra-ui/react";
import { CloseButton, FormController, toaster } from "@konfi/components";
import type { TFunction } from "i18next";
import {
  batchCreateProductPageCountPrices,
  batchCreateProductPageCountSegmentStepPrices,
  batchCreateProductPageCountStepPrices,
  batchDeleteProductPageCountPrices,
  batchDeleteProductPageCountSegmentStepPrices,
  batchDeleteProductPrices,
  batchDeleteProductPageCountStepPrices,
  batchCreateProductPrices,
  create,
  getDynamicPricingPresets,
  getDynamicPricingPresetsByIds,
  deleteProductDynamicPricing,
  getProductDynamicPricing,
  seoSlugExists,
  upsertProductDynamicPricing,
} from "@konfi/firebase";
import {
  Attribute,
  Channel,
  Configuration,
  type CurrencyCode,
  CurrencyEnum,
  EntityType,
  ExternalProduct,
  ExternalImportConnection,
  FormTypes,
  NestedCategory,
  NestedProductType,
  DynamicPricingPreset,
  Price,
  PriceTypeEnum,
  Product,
  ProductCreate,
  ProductPageCountExactPriceSet,
  ProductPageCountPrice,
  ProductPageCountSegmentPriceSet,
  ProductPriceOffsetConfig,
  ProductUpdate,
  TenantContext,
  Unit,
} from "@konfi/types";
import {
  cleanupNonMatrixProduct,
  calculateDynamicListingPrices,
  DEFAULT_COMBINATION,
  DEFAULT_PAGE_COUNT_COVER_PAGES,
  filterAttributes,
  fixPriceCombinations,
  generateKeywords,
  getPageCountPricingMode,
  getPageCountValues,
  getIconByFormType,
  getPrintingMethodOptions,
  getUnitOptions,
  isElectron,
  isMatrixLikePriceType,
  PAGE_COUNT_DIVISOR,
  ProductCreateSchema,
  productForm,
  ProductUpdateSchema,
  resolveDefaultCurrencyCode,
  resolveDynamicPricingConfig,
  toSlug,
  updateCalculatedPrices,
} from "@konfi/utils";
import { useCatalog } from "context/catalog";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isNull, isUndefined } from "es-toolkit";
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc as firestoreGetDoc,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import {
  ReadonlyURLSearchParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  ComponentType,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { KeyedMutator, mutate as swrMutate } from "swr";
import { InferType } from "yup";
import { AttributeDependencies } from "../form/field-controllers/AttributeDependencies";
import { Attributes } from "../form/field-controllers/Attributes";
import { By } from "../form/field-controllers/By";
import Generate from "../form/field-controllers/Generate";
import GenerateProduct from "../form/field-controllers/GenerateProduct";
import PricesMatrix from "../form/field-controllers/PricesMatrix";
import { ProductType } from "../form/field-controllers/ProductType";
import { PageCountConfig } from "../form/field-controllers/PageCountConfig";
import { DynamicPricingConfig as DynamicPricingConfigField } from "../form/field-controllers/DynamicPricingConfig";
import { PriceOffsets } from "../form/field-controllers/PriceOffsets";
import { ToChannel } from "../form/field-controllers/ToChannel";
import { ProductImageGeneratorFieldActions } from "./ProductImageGeneratorFieldActions";
import useSWRImmutable from "swr/immutable";

const Combination = dynamic<PreviewCombinationProps>(
  () =>
    import("@konfi/components").then(
      (mod) => mod.Combination as ComponentType<PreviewCombinationProps>,
    ),
  {
    loading: () => <Skeleton height={"100vh"} />,
    ssr: false,
  },
);

const Preview = dynamic(
  () => import("@konfi/components").then((mod) => mod.Preview),
  {
    loading: () => <Skeleton height={"100vh"} />,
    ssr: false,
  },
);

type CreateInput = InferType<typeof ProductCreateSchema>;
type UpdateInput = InferType<typeof ProductUpdateSchema>;
type ProductPreviewInput = Partial<CreateInput & UpdateInput>;

const externalImportFieldNames = [
  "priceType",
  "prices",
  "defaultPrice",
  "lowPrice",
  "highPrice",
  "volumes",
  "spec",
  "attributes",
  "attributeOptions",
  "attributeDependencies",
  "pageCount",
  "productType",
] as const satisfies ReadonlyArray<keyof UpdateInput>;

export type ProductPreviewControls = {
  applyExternalImportDraft?: (draft: ConnectedProductImportApplyDraft) => void;
  disabled: boolean;
  getExternalImportTargetState?: () => ConnectedProductImportTarget | null;
  openPreview: () => void;
};

function toPlainNestedProductType(
  productType: Product["productType"] | null | undefined,
): NestedProductType | null {
  if (!hasProductTypeSelection(productType)) {
    return null;
  }

  return {
    id: productType.id,
    name: productType.name,
    attributes: productType.attributes ?? [],
    isShippable: productType.isShippable ?? true,
  };
}

function hasProductTypeSelection(
  productType: Product["productType"] | null | undefined,
): productType is NestedProductType {
  return Boolean(productType?.id);
}

function toPlainNestedCategory(
  category: Product["category"] | null | undefined,
): NestedCategory {
  return {
    id: category?.id ?? "",
    name: category?.name ?? "",
  };
}

type PreviewCombinationProps = {
  router: unknown;
  pathname: string;
  params: { id: string };
  searchParams: ReadonlyURLSearchParams;
  product: Product;
  resolvedPrices?: Product["prices"];
  initConfiguration?: Configuration;
  syncQueryParams?: boolean;
  attributes: Attribute[];
  channelId?: string;
  firestore: Firestore;
  productId?: string;
  descriptionPreview?: ReactNode;
  storeSettings?: { express?: { enabled: boolean; percent: number } };
  allowOutOfSpec?: boolean;
  t: unknown;
  i18n: unknown;
};

const EMPTY_MEMBER = {
  id: "",
  name: "",
};

const DEFAULT_DESIGN_SPEC = {
  dpi: 300,
  bleed: 4,
  includeBleed: false,
};

const createDefaultPageCountConfig = (): NonNullable<Product["pageCount"]> => ({
  enabled: false,
  minimum: PAGE_COUNT_DIVISOR,
  maximum: PAGE_COUNT_DIVISOR,
  step: PAGE_COUNT_DIVISOR,
  coverPages: DEFAULT_PAGE_COUNT_COVER_PAGES,
  placement: {
    afterAttributeId: null,
  },
  pricing: {
    mode: "step",
    segments: [],
    segmentPrices: [],
    stepPrices: [],
    exactPrices: [],
  },
});

const getFormPageCountValue = (
  pageCount?: Product["pageCount"] | null,
): NonNullable<Product["pageCount"]> => {
  const fallback = createDefaultPageCountConfig();

  return {
    ...fallback,
    ...(pageCount ?? {}),
    placement: {
      ...fallback.placement,
      ...(pageCount?.placement ?? {}),
    },
    pricing: {
      ...fallback.pricing,
      ...(pageCount?.pricing ?? {}),
    },
  };
};

const getPersistedPageCountValue = (
  pageCount?: Product["pageCount"] | null,
): Product["pageCount"] | undefined => {
  if (!pageCount?.enabled) {
    return undefined;
  }

  const normalized = getFormPageCountValue(pageCount);
  const externalAttributeName =
    normalized.externalAttributeName?.trim() || undefined;
  const pricingMode = getPageCountPricingMode(normalized.pricing);

  return {
    enabled: true,
    minimum: normalized.minimum,
    maximum: normalized.maximum,
    step: normalized.step,
    coverPages: normalized.coverPages,
    externalAttributeName,
    placement: {
      afterAttributeId: normalized.placement?.afterAttributeId ?? null,
    },
    pricing:
      pricingMode === "exact"
        ? {
            mode: "exact" as const,
            exactPrices: normalized.pricing?.exactPrices ?? [],
          }
        : pricingMode === "segmented"
          ? {
              mode: "segmented" as const,
              segments: normalized.pricing?.segments?.length
                ? normalized.pricing.segments
                : (normalized.pricing?.segmentPrices ?? []).map((segment) => ({
                    maximum: segment.maximum,
                    minimum: segment.minimum,
                  })),
              segmentPrices: normalized.pricing?.segmentPrices ?? [],
              stepPrices: normalized.pricing?.stepPrices ?? [],
            }
          : {
              mode: "step" as const,
              stepPrices: normalized.pricing?.stepPrices ?? [],
            },
  };
};

const createDefaultDynamicPricingConfig = (): NonNullable<
  Product["dynamicPricing"]
> => ({
  attributeRules: [],
  baseDeliveryTime: 0,
  basePrice: 0,
  enabled: true,
  globalRules: [],
  inputs: [],
  linkedPresetIds: [],
});

const createDefaultPriceOffsetsConfig = (): ProductPriceOffsetConfig => ({
  enabled: false,
  rules: [],
});

const stripStoredPageCountPricingTables = (
  pageCount?: Product["pageCount"],
): Product["pageCount"] | undefined => {
  if (!pageCount) {
    return undefined;
  }

  const { pricing, ...rest } = pageCount;
  const pricingMode = getPageCountPricingMode(pricing);

  return {
    ...rest,
    pricing: pricing
      ? {
          mode: pricingMode,
          ...(pricingMode === "segmented"
            ? {
                segments: pricing.segments?.length
                  ? pricing.segments
                  : (pricing.segmentPrices ?? []).map((segment) => ({
                      maximum: segment.maximum,
                      minimum: segment.minimum,
                    })),
              }
            : {}),
        }
      : undefined,
  };
};

const calculateListingPricesForProductForm = ({
  attributeDefinitions,
  attributeDependencies,
  attributeOptions,
  attributes,
  currency,
  customSize,
  dynamicPricing,
  dynamicPricingPresets,
  pageCount,
  priceType,
  prices,
  spec,
  volumes,
}: {
  attributeDefinitions?: Pick<
    Attribute,
    "calculateStockFromSheet" | "format" | "id" | "options" | "trackStock"
  >[];
  attributeDependencies?: Product["attributeDependencies"];
  attributeOptions: Product["attributeOptions"];
  attributes: Product["attributes"];
  currency?: CurrencyCode;
  customSize?: boolean;
  dynamicPricing?: Product["dynamicPricing"];
  dynamicPricingPresets?: DynamicPricingPreset[];
  pageCount?: Product["pageCount"];
  priceType: PriceTypeEnum;
  prices: Price[];
  spec: Product["spec"];
  volumes: Product["volumes"];
}) => {
  if (priceType === PriceTypeEnum.DYNAMIC && dynamicPricing?.enabled) {
    const effectiveDynamicPricing = resolveDynamicPricingConfig(
      dynamicPricing,
      dynamicPricingPresets,
    );

    return calculateDynamicListingPrices({
      config: effectiveDynamicPricing,
      context: {
        attributes: attributeDefinitions,
        pageCount: pageCount?.enabled ? pageCount.minimum : undefined,
      },
      currency,
      product: {
        attributeDependencies: attributeDependencies ?? {},
        attributeOptions,
        attributes,
        customSize: customSize ?? false,
        pageCount,
        spec,
        volumes,
      },
    });
  }

  return updateCalculatedPrices(
    prices,
    [],
    spec.minimumOrder || 1,
    priceType,
    isMatrixLikePriceType(priceType) ? attributeDependencies : {},
  );
};

const hasPriceCurrency = (price: Price | undefined): price is Price =>
  typeof price?.currency === "string" && price.currency.length > 0;

const resolveProductFormListingPrice = (
  price: Price | undefined,
  fallback: Price,
): Price => (hasPriceCurrency(price) ? price : fallback);

const PRODUCT_CREATE_PROGRESS_TOAST_ID = "product-create-progress";

type ProductCreateProgressStep =
  | "checking"
  | "preparing"
  | "savingProduct"
  | "savingPricing"
  | "linkingExternal"
  | "syncingSearch"
  | "finishing";

function showProductCreateProgress(
  t: TFunction,
  step: ProductCreateProgressStep,
) {
  const toast = {
    id: PRODUCT_CREATE_PROGRESS_TOAST_ID,
    type: "loading" as const,
    title: t("admin.productCreateProgress.title", {
      defaultValue: "Creating product",
    }),
    description: t(`admin.productCreateProgress.${step}`, {
      defaultValue: "Working on the product...",
    }),
    duration: 120000,
  };

  if (toaster.isVisible(PRODUCT_CREATE_PROGRESS_TOAST_ID)) {
    toaster.update(PRODUCT_CREATE_PROGRESS_TOAST_ID, toast);
    return;
  }

  toaster.create(toast);
}

function clearProductCreateProgress() {
  toaster.dismiss(PRODUCT_CREATE_PROGRESS_TOAST_ID);
}

async function getLinkedDynamicPricingPresets(
  channelId: string,
  dynamicPricing?: Product["dynamicPricing"],
): Promise<DynamicPricingPreset[]> {
  const linkedPresetIds = dynamicPricing?.linkedPresetIds ?? [];

  if (linkedPresetIds.length === 0) {
    return [];
  }

  return getDynamicPricingPresetsByIds(firestore, channelId, linkedPresetIds);
}

async function getDynamicPricingAttributeDefinitions(
  attributeIds: Product["attributes"],
): Promise<
  Pick<
    Attribute,
    "calculateStockFromSheet" | "format" | "id" | "options" | "trackStock"
  >[]
> {
  const uniqueIds = Array.from(new Set(attributeIds));

  if (uniqueIds.length === 0) {
    return [];
  }

  const attributeSnapshots = await Promise.all(
    uniqueIds.map((attributeId) =>
      firestoreGetDoc(doc(firestore, "/attributes", attributeId)),
    ),
  );

  return attributeSnapshots.flatMap((snapshot) =>
    snapshot.exists()
      ? [
          snapshot.data() as Pick<
            Attribute,
            | "calculateStockFromSheet"
            | "format"
            | "id"
            | "options"
            | "trackStock"
          >,
        ]
      : [],
  );
}

const normalizePageCountExactPriceSets = (
  exactPrices: ProductPageCountExactPriceSet[] = [],
  priceType: PriceTypeEnum,
): ProductPageCountExactPriceSet[] => {
  return exactPrices
    .filter(
      (entry) =>
        Number.isFinite(entry.pageCount) && Math.trunc(entry.pageCount) > 0,
    )
    .map((entry) => ({
      pageCount: Math.trunc(entry.pageCount),
      prices: fixPriceCombinations(entry.prices ?? [], priceType),
    }))
    .sort((left, right) => left.pageCount - right.pageCount);
};

const normalizePageCountSegmentPriceSets = (
  segmentPrices: ProductPageCountSegmentPriceSet[] = [],
  priceType: PriceTypeEnum,
): ProductPageCountSegmentPriceSet[] => {
  return segmentPrices
    .filter(
      (segment) =>
        Number.isFinite(segment.minimum) &&
        Number.isFinite(segment.maximum) &&
        Math.trunc(segment.minimum) > 0 &&
        Math.trunc(segment.maximum) >= Math.trunc(segment.minimum),
    )
    .map((segment) => ({
      minimum: Math.trunc(segment.minimum),
      maximum: Math.trunc(segment.maximum),
      basePrices: fixPriceCombinations(segment.basePrices ?? [], priceType),
      stepPrices: fixPriceCombinations(segment.stepPrices ?? [], priceType),
    }))
    .sort((left, right) => left.minimum - right.minimum);
};

const groupStoredPageCountPrices = (
  pageCountPriceDocs: ProductPageCountPrice[],
): Map<number, Price[]> => {
  const grouped = new Map<number, Price[]>();

  for (const pageCountPriceDoc of pageCountPriceDocs) {
    const existing = grouped.get(pageCountPriceDoc.pageCount) ?? [];
    grouped.set(pageCountPriceDoc.pageCount, [
      ...existing,
      ...(pageCountPriceDoc.prices ?? []),
    ]);
  }

  return grouped;
};

const flattenStoredPageCountPrices = (
  pageCountPriceDocs: ProductPageCountPrice[],
): ProductPageCountExactPriceSet[] => {
  return Array.from(groupStoredPageCountPrices(pageCountPriceDocs).entries())
    .map(([pageCount, prices]) => ({
      pageCount,
      prices,
    }))
    .sort((left, right) => left.pageCount - right.pageCount);
};

const buildSegmentedPageCountPriceSets = (options: {
  pageCount?: Product["pageCount"];
  priceType: PriceTypeEnum;
  productPrices: Price[];
  segmentBasePriceDocs: ProductPageCountPrice[];
  segmentStepPriceDocs: ProductPageCountPrice[];
  stepPrices: Price[];
}): ProductPageCountSegmentPriceSet[] => {
  const {
    pageCount,
    priceType,
    productPrices,
    segmentBasePriceDocs,
    segmentStepPriceDocs,
    stepPrices,
  } = options;

  if (
    !pageCount?.enabled ||
    getPageCountPricingMode(pageCount.pricing) !== "segmented"
  ) {
    return [];
  }

  const segments = pageCount.pricing?.segments ?? [];
  const basePricesByPageCount =
    groupStoredPageCountPrices(segmentBasePriceDocs);
  const stepPricesByPageCount =
    groupStoredPageCountPrices(segmentStepPriceDocs);

  return normalizePageCountSegmentPriceSets(
    segments.map((segment) => ({
      minimum: segment.minimum,
      maximum: segment.maximum,
      basePrices:
        segment.minimum === pageCount.minimum
          ? productPrices
          : (basePricesByPageCount.get(segment.minimum) ?? []),
      stepPrices:
        segment.minimum === pageCount.minimum
          ? stepPrices
          : (stepPricesByPageCount.get(segment.minimum) ?? []),
    })),
    priceType,
  );
};

const normalizePageCountPricingForSave = (options: {
  pageCount?: Product["pageCount"];
  priceType: PriceTypeEnum;
}) => {
  const { pageCount, priceType } = options;
  if (priceType === PriceTypeEnum.DYNAMIC) {
    return {
      fixedPageCountExactPrices: [] as ProductPageCountExactPriceSet[],
      fixedPageCountSegmentPrices: [] as ProductPageCountSegmentPriceSet[],
      fixedPageCountStepPrices: [] as Price[],
      normalizedPageCountForPricing: pageCount
        ? {
            ...pageCount,
            pricing: undefined,
          }
        : undefined,
      pageCountPricingMode: "step" as const,
    };
  }

  const pageCountPricingMode = getPageCountPricingMode(pageCount?.pricing);
  const fixedPageCountStepPrices = fixPriceCombinations(
    pageCount?.pricing?.stepPrices ?? [],
    priceType,
  );
  const fixedPageCountExactPrices = normalizePageCountExactPriceSets(
    pageCount?.pricing?.exactPrices ?? [],
    priceType,
  );
  const fixedPageCountSegmentPrices = normalizePageCountSegmentPriceSets(
    pageCount?.pricing?.segmentPrices ?? [],
    priceType,
  );
  const normalizedPageCountForPricing = pageCount
    ? {
        ...pageCount,
        pricing:
          pageCountPricingMode === "exact"
            ? {
                mode: "exact" as const,
                exactPrices: fixedPageCountExactPrices,
              }
            : pageCountPricingMode === "segmented"
              ? {
                  mode: "segmented" as const,
                  segments: pageCount.pricing?.segments?.length
                    ? pageCount.pricing.segments
                    : fixedPageCountSegmentPrices.map((segment) => ({
                        maximum: segment.maximum,
                        minimum: segment.minimum,
                      })),
                  segmentPrices: fixedPageCountSegmentPrices,
                  stepPrices:
                    fixedPageCountSegmentPrices[0]?.stepPrices ??
                    fixedPageCountStepPrices,
                }
              : {
                  mode: "step" as const,
                  stepPrices: fixedPageCountStepPrices,
                },
      }
    : undefined;

  return {
    fixedPageCountExactPrices,
    fixedPageCountSegmentPrices,
    fixedPageCountStepPrices,
    normalizedPageCountForPricing,
    pageCountPricingMode,
  };
};

const getPreviewProductId = (
  product?: Product,
  draftProductId?: string | null,
) => {
  return `product-preview-${product?.id ?? draftProductId ?? "new"}`;
};

const getPreviewAssetProductId = (
  product?: Product,
  draftProductId?: string | null,
) => {
  return product?.id ?? draftProductId ?? "product-preview";
};

const buildPreviewProduct = ({
  channelId,
  draftProductId,
  fallbackTimestampMs,
  product,
  values,
}: {
  channelId?: string | null;
  draftProductId?: string | null;
  fallbackTimestampMs: number;
  product?: Product;
  values?: ProductPreviewInput;
}): Product | null => {
  if (!channelId || !values) {
    return null;
  }

  const productSpec = product?.spec;
  const productAvailability = product?.availability;
  const priceType =
    values.priceType ?? product?.priceType ?? PriceTypeEnum.SINGLE;
  const previewPrices = fixPriceCombinations(values.prices ?? [], priceType);
  const previewSpec = {
    images: values.spec?.images ?? productSpec?.images ?? [],
    defaultOrder: values.spec?.defaultOrder ?? productSpec?.defaultOrder ?? 1,
    minimumOrder: values.spec?.minimumOrder ?? productSpec?.minimumOrder ?? 1,
    maximumOrder: values.spec?.maximumOrder ?? productSpec?.maximumOrder ?? 100,
    step: values.spec?.step ?? productSpec?.step ?? 1,
    minimumWidth: values.spec?.minimumWidth ?? productSpec?.minimumWidth ?? 100,
    maximumWidth:
      values.spec?.maximumWidth ?? productSpec?.maximumWidth ?? 1000,
    widthStep: values.spec?.widthStep ?? productSpec?.widthStep ?? 1,
    minimumHeight:
      values.spec?.minimumHeight ?? productSpec?.minimumHeight ?? 100,
    maximumHeight:
      values.spec?.maximumHeight ?? productSpec?.maximumHeight ?? 1000,
    heightStep: values.spec?.heightStep ?? productSpec?.heightStep ?? 1,
    validateRatio:
      values.spec?.validateRatio ?? productSpec?.validateRatio ?? false,
    minimumRatio: values.spec?.minimumRatio ?? productSpec?.minimumRatio ?? 0.2,
    maximumRatio: values.spec?.maximumRatio ?? productSpec?.maximumRatio ?? 5,
  };
  const previewPageCount = getPersistedPageCountValue(
    values.pageCount ?? product?.pageCount,
  );
  const previewDynamicPricing =
    values.dynamicPricing ?? product?.dynamicPricing ?? undefined;
  const calculatedPrices = calculateListingPricesForProductForm({
    attributeDefinitions: undefined,
    attributeDependencies:
      values.attributeDependencies ?? product?.attributeDependencies,
    attributeOptions:
      values.attributeOptions ?? product?.attributeOptions ?? {},
    attributes: values.attributes ?? product?.attributes ?? [],
    currency: values.defaultPrice?.currency ?? product?.defaultPrice?.currency,
    customSize: values.customSize ?? product?.customSize ?? false,
    dynamicPricing: previewDynamicPricing,
    dynamicPricingPresets: [],
    pageCount: previewPageCount,
    priceType,
    prices: previewPrices,
    spec: previewSpec,
    volumes:
      values.volumes && values.volumes.length > 0
        ? values.volumes
        : (product?.volumes ?? [{ value: previewSpec.minimumOrder }]),
  });
  const createdBy =
    product?.createdBy ?? values.createdBy ?? values.updatedBy ?? EMPTY_MEMBER;
  const updatedBy =
    values.updatedBy ?? product?.updatedBy ?? values.createdBy ?? EMPTY_MEMBER;
  const fallbackTimestamp = Timestamp.fromMillis(fallbackTimestampMs);

  return cleanupNonMatrixProduct({
    id: getPreviewProductId(product, draftProductId),
    name: values.name ?? product?.name ?? "",
    description: values.description ?? product?.description ?? "",
    prices: previewPrices,
    defaultPrice: calculatedPrices.defaultPrice,
    lowPrice: calculatedPrices.lowPrice,
    highPrice: calculatedPrices.highPrice,
    provider: product?.provider,
    priceOffsets:
      values.priceOffsets ??
      product?.priceOffsets ??
      createDefaultPriceOffsetsConfig(),
    volumes:
      values.volumes && values.volumes.length > 0
        ? values.volumes
        : (product?.volumes ?? [{ value: previewSpec.minimumOrder }]),
    attributes: values.attributes ?? product?.attributes ?? [],
    attributeOptions:
      values.attributeOptions ?? product?.attributeOptions ?? {},
    attributeDependencies:
      values.attributeDependencies ?? product?.attributeDependencies ?? {},
    customSize: values.customSize ?? product?.customSize ?? false,
    customSizes: values.customSize
      ? (values.customSizes ?? product?.customSizes ?? [])
      : [],
    allowCustomPrice:
      values.allowCustomPrice ?? product?.allowCustomPrice ?? false,
    recommended: values.recommended ?? product?.recommended ?? false,
    difficulty: values.difficulty ?? product?.difficulty ?? 5,
    shipping: values.shipping ?? product?.shipping ?? { types: [] },
    spec: previewSpec,
    designSpec: values.designSpec ?? product?.designSpec ?? DEFAULT_DESIGN_SPEC,
    category: values.category ?? product?.category ?? { id: "", name: "" },
    seo: values.seo ?? product?.seo ?? { slug: "", title: "", description: "" },
    pageCount: previewPageCount,
    dynamicPricing: previewDynamicPricing,
    productType: isMatrixLikePriceType(priceType)
      ? (values.productType ?? product?.productType ?? null)
      : null,
    priceType,
    prefferedUnit: values.prefferedUnit ?? product?.prefferedUnit ?? Unit.PCS,
    availability: {
      published:
        values.availability?.published ??
        productAvailability?.published ??
        false,
      publicationString:
        values.availability?.publicationString ??
        productAvailability?.publicationString ??
        "",
      publication: null,
      availableForPurchase:
        values.availability?.availableForPurchase ??
        productAvailability?.availableForPurchase ??
        false,
      expirationString:
        values.availability?.expirationString ??
        productAvailability?.expirationString ??
        "",
      expiration: null,
    },
    keywords: generateKeywords(values.name ?? product?.name ?? ""),
    threeDModel: values.threeDModel ?? product?.threeDModel ?? null,
    averageRating: product?.averageRating,
    linkedChannels: product?.linkedChannels,
    linkedWarehouses: product?.linkedWarehouses,
    channelId,
    specialNotes: values.specialNotes ?? product?.specialNotes ?? "",
    createdBy,
    createdAt: product?.createdAt ?? fallbackTimestamp,
    updatedBy,
    updatedAt: product?.updatedAt ?? fallbackTimestamp,
    active: values.active ?? product?.active ?? true,
  });
};

// Helper function to validate and filter attributes against global attributes
const validateAttributesAndOptions = (
  productAttributes: string[],
  productAttributeOptions: { [key: string]: string[] },
  globalAttributes: any[],
) => {
  const validAttributes: string[] = [];
  const validAttributeOptions: { [key: string]: string[] } = {};

  // Filter attributes that exist in global attributes
  for (const attributeId of productAttributes) {
    const globalAttribute = globalAttributes.find(
      (attr) => attr.id === attributeId,
    );
    if (globalAttribute) {
      validAttributes.push(attributeId);

      // Filter options for this attribute
      const productOptions = productAttributeOptions[attributeId] || [];
      const validOptions = productOptions.filter((optionValue) =>
        globalAttribute.options.some((opt: any) => opt.value === optionValue),
      );

      if (validOptions.length > 0) {
        validAttributeOptions[attributeId] = validOptions;
      }
    }
  }

  return { validAttributes, validAttributeOptions };
};

const validateProductPrices = (
  prices: Price[] | undefined,
  priceType: PriceTypeEnum,
  t?: any,
): { isValid: boolean; error?: string } => {
  if (priceType === PriceTypeEnum.DYNAMIC) {
    return { isValid: true };
  }

  // Check if prices array exists and has at least one item
  if (!prices || prices.length === 0) {
    return {
      isValid: false,
      error: t?.("error.productMustHavePrice", {
        defaultValue: "Product must have at least one price",
      }),
    };
  }

  // Check if all prices have valid values (allowing null values for disabled combinations)
  const invalidPrices = prices.filter((price) => {
    if (price.combination?.active === false) {
      return false;
    }

    // Allow null values for disabled combinations in matrix products
    if (price.value === null && priceType === PriceTypeEnum.MATRIX) {
      return false; // null values are valid for matrix products
    }

    // For non-null values, validate they are positive numbers
    return (
      (price.value !== null &&
        (!price.value || price.value <= 0 || isNaN(price.value))) ||
      !price.currency ||
      (price.threshold !== undefined &&
        (price.threshold < 0 || isNaN(price.threshold)))
    );
  });

  if (invalidPrices.length > 0) {
    return {
      isValid: false,
      error: t?.("error.invalidPriceValues", {
        defaultValue:
          "All prices must have valid positive values and currency (except disabled combinations)",
      }),
    };
  }

  // For matrix products, ensure we have at least one non-null price
  if (priceType === PriceTypeEnum.MATRIX) {
    const hasValidPrices = prices.some(
      (price) =>
        price.value !== null && price.value !== undefined && price.value > 0,
    );
    if (!hasValidPrices) {
      return {
        isValid: false,
        error: t?.("error.matrixMustHaveValidPrice", {
          defaultValue:
            "Matrix products must have at least one enabled price combination",
        }),
      };
    }
  }

  // For matrix products, ensure we have prices for different combinations
  if (priceType === PriceTypeEnum.MATRIX) {
    const hasMultipleCombinations = prices.some(
      (price) =>
        price.combination &&
        price.combination.id &&
        price.combination.id !== DEFAULT_COMBINATION,
    );

    if (prices.length > 1 && !hasMultipleCombinations) {
      return {
        isValid: false,
        error: t?.("error.matrixMustHaveCombinations", {
          defaultValue:
            "Matrix products with multiple prices must have valid attribute combinations",
        }),
      };
    }
  }

  // For threshold products, ensure thresholds are properly ordered
  if (priceType === PriceTypeEnum.THRESHOLD && prices.length > 1) {
    const sortedPrices = [...prices].sort(
      (a, b) => (a.threshold || 0) - (b.threshold || 0),
    );
    const hasValidThresholds = sortedPrices.every((price, index) => {
      if (index === 0) return true; // First price can have any threshold
      return (price.threshold || 0) > (sortedPrices[index - 1].threshold || 0);
    });

    if (!hasValidThresholds) {
      return {
        isValid: false,
        error: t?.("error.invalidThresholdOrder", {
          defaultValue: "Threshold prices must be in ascending order",
        }),
      };
    }
  }

  return { isValid: true };
};

const validatePageCountPricing = (
  pageCount: Product["pageCount"] | undefined,
  priceType: PriceTypeEnum,
  t?: (key: string, options?: Record<string, unknown>) => string,
): { isValid: boolean; error?: string } => {
  if (priceType === PriceTypeEnum.DYNAMIC) {
    return { isValid: true };
  }

  if (!pageCount) {
    return { isValid: true };
  }

  const pricingMode = getPageCountPricingMode(pageCount.pricing);

  if (pricingMode === "step") {
    const stepPrices = pageCount.pricing?.stepPrices ?? [];

    if (stepPrices.length === 0) {
      return { isValid: true };
    }

    return validateProductPrices(stepPrices, priceType, t);
  }

  if (pricingMode === "segmented") {
    const expectedPageCounts = getPageCountValues(pageCount);
    const segments = [...(pageCount.pricing?.segments ?? [])].sort(
      (left, right) => left.minimum - right.minimum,
    );
    const segmentPrices = normalizePageCountSegmentPriceSets(
      pageCount.pricing?.segmentPrices ?? [],
      priceType,
    );

    if (segments.length === 0) {
      return {
        isValid: false,
        error:
          t?.("error.pageCountSegmentsMissing", {
            defaultValue:
              "Segmented page-count pricing requires at least one segment.",
          }) ?? "Segmented page-count pricing requires at least one segment.",
      };
    }

    if (
      segments[0]?.minimum !== pageCount.minimum ||
      segments[segments.length - 1]?.maximum !== pageCount.maximum
    ) {
      return {
        isValid: false,
        error:
          t?.("error.pageCountSegmentsRangeMismatch", {
            defaultValue:
              "Segmented page-count ranges must start at the minimum and end at the maximum page count.",
          }) ??
          "Segmented page-count ranges must start at the minimum and end at the maximum page count.",
      };
    }

    for (const [index, segment] of segments.entries()) {
      if (
        segment.minimum > segment.maximum ||
        !expectedPageCounts.includes(segment.minimum) ||
        !expectedPageCounts.includes(segment.maximum)
      ) {
        return {
          isValid: false,
          error:
            t?.("error.pageCountSegmentsInvalid", {
              defaultValue:
                "Segmented page-count ranges must align with the configured page-count values.",
            }) ??
            "Segmented page-count ranges must align with the configured page-count values.",
        };
      }

      if (
        index > 0 &&
        segment.minimum !== segments[index - 1]!.maximum + pageCount.step
      ) {
        return {
          isValid: false,
          error:
            t?.("error.pageCountSegmentsGap", {
              defaultValue:
                "Segmented page-count ranges must be continuous without overlaps or gaps.",
            }) ??
            "Segmented page-count ranges must be continuous without overlaps or gaps.",
        };
      }

      const priceSet = segmentPrices.find(
        (entry) =>
          entry.minimum === segment.minimum &&
          entry.maximum === segment.maximum,
      );

      if (!priceSet) {
        return {
          isValid: false,
          error:
            t?.("error.pageCountSegmentsPricesMissing", {
              defaultValue:
                "Missing price tables for the segment {{minimum}}-{{maximum}}.",
              maximum: segment.maximum,
              minimum: segment.minimum,
            }) ??
            `Missing price tables for the segment ${segment.minimum}-${segment.maximum}.`,
        };
      }

      const basePriceValidation = validateProductPrices(
        priceSet.basePrices,
        priceType,
        t,
      );

      if (!basePriceValidation.isValid) {
        return {
          isValid: false,
          error:
            t?.("error.pageCountSegmentBasePricesInvalid", {
              defaultValue:
                "Segment base prices for {{minimum}}-{{maximum}} are invalid: {{error}}",
              error: basePriceValidation.error,
              maximum: segment.maximum,
              minimum: segment.minimum,
            }) ??
            `Segment base prices for ${segment.minimum}-${segment.maximum} are invalid: ${basePriceValidation.error}`,
        };
      }

      if (priceSet.stepPrices.length > 0) {
        const stepPriceValidation = validateProductPrices(
          priceSet.stepPrices,
          priceType,
          t,
        );

        if (!stepPriceValidation.isValid) {
          return {
            isValid: false,
            error:
              t?.("error.pageCountSegmentStepPricesInvalid", {
                defaultValue:
                  "Segment step prices for {{minimum}}-{{maximum}} are invalid: {{error}}",
                error: stepPriceValidation.error,
                maximum: segment.maximum,
                minimum: segment.minimum,
              }) ??
              `Segment step prices for ${segment.minimum}-${segment.maximum} are invalid: ${stepPriceValidation.error}`,
          };
        }
      }
    }

    return { isValid: true };
  }

  const expectedPageCounts = getPageCountValues(pageCount);
  const exactPrices = normalizePageCountExactPriceSets(
    pageCount.pricing?.exactPrices ?? [],
    priceType,
  );
  const exactPricesByPageCount = new Map(
    exactPrices.map((entry) => [entry.pageCount, entry.prices]),
  );
  const missingPageCounts = expectedPageCounts.filter(
    (entry) => !exactPricesByPageCount.has(entry),
  );

  if (missingPageCounts.length > 0) {
    return {
      isValid: false,
      error:
        t?.("error.pageCountExactPricesMissing", {
          defaultValue:
            "Missing exact price tables for page counts: {{pageCounts}}",
          pageCounts: missingPageCounts.join(", "),
        }) ??
        `Missing exact price tables for page counts: ${missingPageCounts.join(", ")}`,
    };
  }

  const unexpectedPageCounts = exactPrices
    .map((entry) => entry.pageCount)
    .filter((entry) => !expectedPageCounts.includes(entry));

  if (unexpectedPageCounts.length > 0) {
    return {
      isValid: false,
      error:
        t?.("error.pageCountExactPricesUnexpected", {
          defaultValue:
            "Exact price tables contain page counts outside the configured range: {{pageCounts}}",
          pageCounts: unexpectedPageCounts.join(", "),
        }) ??
        `Exact price tables contain page counts outside the configured range: ${unexpectedPageCounts.join(", ")}`,
    };
  }

  for (const expectedPageCount of expectedPageCounts) {
    const prices = exactPricesByPageCount.get(expectedPageCount);
    const validation = validateProductPrices(prices, priceType, t);

    if (!validation.isValid) {
      return {
        isValid: false,
        error:
          t?.("error.pageCountExactPricesInvalid", {
            defaultValue:
              "Exact prices for {{pageCount}} pages are invalid: {{error}}",
            pageCount: expectedPageCount,
            error: validation.error,
          }) ??
          `Exact prices for ${expectedPageCount} pages are invalid: ${validation.error}`,
      };
    }
  }

  return { isValid: true };
};

export default function ProductForm({
  product,
  type,
  mutate,
  onCreateSuccess,
  onPreviewStateChange,
  externalProductId: externalProductIdProp,
  duplicateSourceProductId: duplicateSourceProductIdProp,
}: {
  product?: Product;
  type: keyof typeof FormTypes;
  mutate?: KeyedMutator<Product | undefined>;
  onCreateSuccess?: (productId: string, channelId: string) => void;
  onPreviewStateChange?: (controls: ProductPreviewControls | null) => void;
  externalProductId?: string | null;
  duplicateSourceProductId?: string | null;
}) {
  const { t, i18n } = useT();
  const { refreshProducts, searchCategoriesInput, categoryInputSearchResults } =
    useCatalog();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const {
    attributes: globalAttributes,
    currencySettings,
    storeSettings,
    printingMethodsSettings,
    unitsProofingSettings,
  } = useConfiguration();
  const defaultProductCurrency = useMemo(
    () => resolveDefaultCurrencyCode(currencySettings, channel?.currency),
    [channel?.currency, currencySettings],
  );
  const printingMethodOptions = useMemo(
    () => getPrintingMethodOptions(printingMethodsSettings, t),
    [printingMethodsSettings, t],
  );
  const unitOptions = useMemo(
    () => getUnitOptions(unitsProofingSettings, t),
    [unitsProofingSettings, t],
  );
  const activeDynamicPricingChannelId =
    channel?.id ?? product?.channelId ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const emptyPreviewSearchParams = useMemo(
    () => new URLSearchParams() as unknown as ReadonlyURLSearchParams,
    [],
  );
  const externalProductIdFromParams = useMemo(() => {
    const rawValue = searchParams?.get("externalProductId");
    return rawValue?.trim() ? rawValue.trim() : null;
  }, [searchParams]);
  const duplicateSourceProductIdFromParams = useMemo(() => {
    const rawValue = searchParams?.get("duplicate");
    return rawValue?.trim() ? rawValue.trim() : null;
  }, [searchParams]);
  const externalProductId =
    externalProductIdProp ?? externalProductIdFromParams;
  const duplicateSourceProductId =
    duplicateSourceProductIdProp ?? duplicateSourceProductIdFromParams;
  const persistedProductId = useMemo(() => {
    if (typeof product?.id === "string" && product.id.trim()) {
      return product.id;
    }

    if (type === "DUPLICATE") {
      return duplicateSourceProductId;
    }

    return null;
  }, [duplicateSourceProductId, product?.id, type]);
  const persistedChannelId = useMemo(() => {
    if (typeof product?.channelId === "string" && product.channelId.trim()) {
      return product.channelId;
    }

    return channel?.id ?? null;
  }, [channel?.id, product?.channelId]);
  const shouldLoadStoredPriceSets = useMemo(() => {
    if (!persistedChannelId || !persistedProductId) {
      return false;
    }

    if (type === "UPDATE") {
      return true;
    }

    return type === "DUPLICATE" && !externalProductId;
  }, [externalProductId, persistedChannelId, persistedProductId, type]);

  // Create a key for SWR that includes the product info needed for fetching
  const pricesFetchKey = useMemo(() => {
    if (
      !shouldLoadStoredPriceSets ||
      !persistedChannelId ||
      !persistedProductId
    ) {
      return null;
    }

    return `product-prices-${persistedChannelId}-${persistedProductId}`;
  }, [persistedChannelId, persistedProductId, shouldLoadStoredPriceSets]);

  // Fetch prices from subcollection using SWR
  const {
    data: productPriceSets,
    error: pricesError,
    isLoading: pricesLoading,
  } = useSWRImmutable(
    pricesFetchKey,
    async () => {
      const currentProduct = product;

      if (
        !shouldLoadStoredPriceSets ||
        !persistedChannelId ||
        !persistedProductId ||
        !currentProduct
      ) {
        return null;
      }

      const storedPriceSets = await getStoredProductPriceSets(
        persistedChannelId,
        persistedProductId,
      );
      const dynamicPricing = await getProductDynamicPricing(
        firestore,
        persistedChannelId,
        persistedProductId,
      );

      if (!storedPriceSets.success) {
        throw new Error(
          storedPriceSets.error || "Failed to load stored product prices.",
        );
      }

      const prices = storedPriceSets.priceDocs ?? [];
      const pageCountStepPrices = storedPriceSets.pageCountStepPriceDocs ?? [];
      const pageCountPrices = storedPriceSets.pageCountPriceDocs ?? [];
      const pageCountSegmentStepPrices =
        storedPriceSets.pageCountSegmentStepPriceDocs ?? [];
      const mergedPrices = prices.flatMap((priceDoc) => priceDoc.prices);
      const mergedPageCountStepPrices = pageCountStepPrices.flatMap(
        (priceDoc) => priceDoc.prices,
      );
      const pageCountPricingMode = getPageCountPricingMode(
        currentProduct.pageCount?.pricing,
      );

      return {
        dynamicPricing,
        prices: mergedPrices,
        pageCountStepPrices: mergedPageCountStepPrices,
        pageCountExactPrices:
          pageCountPricingMode === "exact"
            ? flattenStoredPageCountPrices(pageCountPrices)
            : [],
        pageCountSegmentPrices:
          pageCountPricingMode === "segmented"
            ? buildSegmentedPageCountPriceSets({
                pageCount: currentProduct.pageCount,
                priceType: currentProduct.priceType,
                productPrices: mergedPrices,
                segmentBasePriceDocs: pageCountPrices,
                segmentStepPriceDocs: pageCountSegmentStepPrices,
                stepPrices: mergedPageCountStepPrices,
              })
            : [],
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5 * 60 * 1000, // 5 minutes
    },
  );

  // Merge subcollection prices with product data
  const productWithPrices = useMemo(() => {
    if (!product) return product;

    const pricingMode = getPageCountPricingMode(product.pageCount?.pricing);

    return {
      ...product,
      dynamicPricing:
        productPriceSets?.dynamicPricing ?? product.dynamicPricing,
      prices:
        productPriceSets?.prices && productPriceSets.prices.length > 0
          ? productPriceSets.prices
          : product.prices,
      pageCount: product.pageCount
        ? {
            ...product.pageCount,
            pricing:
              pricingMode === "exact"
                ? {
                    ...(product.pageCount.pricing ?? {}),
                    mode: "exact" as const,
                    exactPrices:
                      productPriceSets?.pageCountExactPrices &&
                      productPriceSets.pageCountExactPrices.length > 0
                        ? productPriceSets.pageCountExactPrices
                        : product.pageCount.pricing?.exactPrices,
                  }
                : pricingMode === "segmented"
                  ? {
                      ...(product.pageCount.pricing ?? {}),
                      mode: "segmented" as const,
                      segmentPrices:
                        productPriceSets?.pageCountSegmentPrices &&
                        productPriceSets.pageCountSegmentPrices.length > 0
                          ? productPriceSets.pageCountSegmentPrices
                          : product.pageCount.pricing?.segmentPrices,
                      stepPrices:
                        productPriceSets?.pageCountStepPrices &&
                        productPriceSets.pageCountStepPrices.length > 0
                          ? productPriceSets.pageCountStepPrices
                          : product.pageCount.pricing?.stepPrices,
                    }
                  : productPriceSets?.pageCountStepPrices &&
                      productPriceSets.pageCountStepPrices.length > 0
                    ? {
                        ...(product.pageCount.pricing ?? {}),
                        mode: "step" as const,
                        stepPrices: productPriceSets.pageCountStepPrices,
                      }
                    : product.pageCount.pricing,
          }
        : product.pageCount,
    };
  }, [product, productPriceSets]);

  const draftProductId = useMemo(() => {
    if (
      (type !== "CREATE" && type !== "DUPLICATE") ||
      !channel ||
      productWithPrices?.id
    ) {
      return null;
    }

    const productsRef = collection(
      firestore,
      `/channels/${channel.id}/products`,
    );

    return doc(productsRef).id;
  }, [type, channel?.id, productWithPrices?.id]);

  const channelId = channel?.id ?? null;
  const { data: dynamicPricingPresets = [] } = useSWRImmutable(
    activeDynamicPricingChannelId
      ? `dynamic-pricing-presets-${activeDynamicPricingChannelId}`
      : null,
    () =>
      getDynamicPricingPresets(firestore, activeDynamicPricingChannelId ?? ""),
  );
  const imagePropsPrefix = channelId
    ? productWithPrices?.id
      ? `channels/${channelId}/products/${productWithPrices.id}`
      : draftProductId
        ? `channels/${channelId}/products/${draftProductId}`
        : undefined
    : undefined;

  const label = `${t(`FormTypes.${type}`)} ${t("common.product")}`;
  const CreateSchemaYupResolver = yupResolver(ProductCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(ProductUpdateSchema);

  const updateDefaultValues = useMemo<UpdateInput | undefined>(() => {
    if (type === "UPDATE" && !pricesLoading && productWithPrices) {
      return initialValuesUpdate(productWithPrices, globalAttributes, t);
    }
    return undefined;
  }, [type, pricesLoading, productWithPrices, globalAttributes, t]);

  const duplicateDefaultValues = useMemo<CreateInput | undefined>(() => {
    if (type === "DUPLICATE" && !pricesLoading && productWithPrices) {
      return initialValuesDuplicate(productWithPrices, globalAttributes);
    }
    return undefined;
  }, [type, pricesLoading, productWithPrices, globalAttributes]);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(defaultProductCurrency),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: updateDefaultValues,
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE" || pricesLoading,
  });

  const DuplicateForm = useForm({
    defaultValues: duplicateDefaultValues,
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE" || pricesLoading,
  });

  const activeForm =
    type === "CREATE"
      ? CreateForm
      : type === "UPDATE"
        ? UpdateForm
        : DuplicateForm;
  const watchCreateCategory = useWatch({
    name: "category",
    control: CreateForm.control,
    disabled: type !== "CREATE",
  });
  const watchUpdateCategory = useWatch({
    name: "category",
    control: UpdateForm.control,
    disabled: type !== "UPDATE",
  });
  const watchDuplicateCategory = useWatch({
    name: "category",
    control: DuplicateForm.control,
    disabled: type !== "DUPLICATE",
  });
  const watchCreateProductType = useWatch({
    name: "productType",
    control: CreateForm.control,
    disabled: type !== "CREATE",
  });
  const watchUpdateProductType = useWatch({
    name: "productType",
    control: UpdateForm.control,
    disabled: type !== "UPDATE",
  });
  const watchDuplicateProductType = useWatch({
    name: "productType",
    control: DuplicateForm.control,
    disabled: type !== "DUPLICATE",
  });
  const getSubscribedCategoryValue = useCallback(
    (
      value:
        | CreateInput["category"]
        | UpdateInput["category"]
        | undefined
        | null,
    ) =>
      !Array.isArray(value) && typeof value?.id === "string"
        ? value
        : undefined,
    [],
  );
  const getSubscribedProductTypeValue = useCallback(
    (
      value:
        | CreateInput["productType"]
        | UpdateInput["productType"]
        | undefined
        | null,
    ) =>
      !Array.isArray(value) && typeof value?.id === "string"
        ? (value as NestedProductType)
        : undefined,
    [],
  );
  const shouldSubscribeProductType = useCallback(
    (
      value:
        | CreateInput["productType"]
        | UpdateInput["productType"]
        | undefined
        | null,
    ) => Boolean(getSubscribedProductTypeValue(value)),
    [getSubscribedProductTypeValue],
  );
  const shouldSubscribeCategory = useCallback(
    (
      value:
        | CreateInput["category"]
        | UpdateInput["category"]
        | undefined
        | null,
    ) => Boolean(channel && getSubscribedCategoryValue(value)?.id?.trim()),
    [channel, getSubscribedCategoryValue],
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<
    ProductPreviewInput | undefined
  >(undefined);
  const previewValues = previewOpen ? previewSnapshot : undefined;

  const previewCreatedBy =
    type === "CREATE"
      ? previewValues?.createdBy
      : type === "DUPLICATE"
        ? previewValues?.createdBy
        : undefined;

  const previewUpdatedBy =
    type === "UPDATE" ? previewValues?.updatedBy : undefined;

  const previewTimestampMs = useMemo(
    () =>
      productWithPrices?.updatedAt?.toMillis() ??
      productWithPrices?.createdAt?.toMillis() ??
      Date.now(),
    [productWithPrices?.createdAt, productWithPrices?.updatedAt],
  );
  const shouldPreparePreview =
    previewOpen &&
    !pricesLoading &&
    Boolean(channelId) &&
    !isUndefined(previewValues);

  const previewProduct = useMemo(
    () =>
      shouldPreparePreview
        ? buildPreviewProduct({
            channelId,
            draftProductId,
            fallbackTimestampMs: previewTimestampMs,
            product: productWithPrices,
            values: previewValues,
          })
        : null,
    [
      channelId,
      draftProductId,
      previewTimestampMs,
      productWithPrices,
      shouldPreparePreview,
      previewValues?.active,
      previewValues?.allowCustomPrice,
      previewValues?.attributeDependencies,
      previewValues?.attributeOptions,
      previewValues?.attributes,
      previewValues?.availability,
      previewValues?.category,
      previewCreatedBy,
      previewValues?.customSize,
      previewValues?.customSizes,
      previewValues?.defaultPrice,
      previewValues?.description,
      previewValues?.dynamicPricing,
      previewValues?.designSpec,
      previewValues?.difficulty,
      previewValues?.highPrice,
      previewValues?.lowPrice,
      previewValues?.name,
      previewValues?.pageCount,
      previewValues?.priceOffsets,
      previewValues?.prefferedUnit,
      previewValues?.priceType,
      previewValues?.prices,
      previewValues?.productType,
      previewValues?.recommended,
      previewValues?.seo,
      previewValues?.shipping,
      previewValues?.spec,
      previewValues?.threeDModel,
      previewUpdatedBy,
      previewValues?.volumes,
    ],
  );
  const previewResolvedPrices = useMemo(() => {
    if (!shouldPreparePreview) {
      return [];
    }

    const previewPriceType =
      previewValues?.priceType ??
      previewProduct?.priceType ??
      PriceTypeEnum.SINGLE;
    const sourcePrices = previewValues?.prices ?? previewProduct?.prices ?? [];

    return fixPriceCombinations(sourcePrices, previewPriceType);
  }, [
    previewOpen,
    previewProduct?.pageCount,
    previewProduct?.priceType,
    previewProduct?.prices,
    previewValues?.pageCount,
    previewValues?.priceType,
    previewValues?.prices,
    shouldPreparePreview,
  ]);
  const previewResolvedPageCount = useMemo(() => {
    if (!shouldPreparePreview) {
      return undefined;
    }

    const previewPriceType =
      previewValues?.priceType ??
      previewProduct?.priceType ??
      PriceTypeEnum.SINGLE;
    const pageCount = getPersistedPageCountValue(
      previewValues?.pageCount ?? previewProduct?.pageCount,
    );

    if (!pageCount) {
      return undefined;
    }

    const pricingMode = getPageCountPricingMode(pageCount.pricing);
    const stepPrices = fixPriceCombinations(
      pageCount.pricing?.stepPrices ?? [],
      previewPriceType,
    );
    const exactPrices = normalizePageCountExactPriceSets(
      pageCount.pricing?.exactPrices ?? [],
      previewPriceType,
    );
    const segmentPrices = normalizePageCountSegmentPriceSets(
      pageCount.pricing?.segmentPrices ?? [],
      previewPriceType,
    );

    return {
      ...pageCount,
      pricing:
        pricingMode === "exact"
          ? {
              mode: "exact" as const,
              exactPrices,
            }
          : pricingMode === "segmented"
            ? {
                mode: "segmented" as const,
                segments: pageCount.pricing?.segments?.length
                  ? pageCount.pricing.segments
                  : segmentPrices.map((segment) => ({
                      maximum: segment.maximum,
                      minimum: segment.minimum,
                    })),
                segmentPrices,
                stepPrices,
              }
            : {
                mode: "step" as const,
                stepPrices,
              },
    };
  }, [
    previewProduct?.pageCount,
    previewProduct?.priceType,
    previewValues?.pageCount,
    previewValues?.priceType,
    shouldPreparePreview,
  ]);
  const previewCombinationProduct = useMemo(() => {
    if (!previewProduct) {
      return null;
    }

    return {
      ...previewProduct,
      pageCount: previewResolvedPageCount,
      prices: previewResolvedPrices,
    };
  }, [previewProduct, previewResolvedPageCount, previewResolvedPrices]);

  const previewAssetProductId = useMemo(
    () => getPreviewAssetProductId(productWithPrices, draftProductId),
    [draftProductId, productWithPrices],
  );

  const previewAttributes = useMemo(() => {
    if (!previewCombinationProduct || !globalAttributes) {
      return [];
    }

    return filterAttributes(globalAttributes, previewCombinationProduct);
  }, [globalAttributes, previewCombinationProduct]);
  const previewInitConfiguration = useMemo(
    () =>
      previewCombinationProduct
        ? (getProductFormPreviewInitConfiguration({
            attributes: previewAttributes,
            product: previewCombinationProduct,
            productId: previewAssetProductId,
          }) ?? undefined)
        : undefined,
    [previewAssetProductId, previewAttributes, previewCombinationProduct],
  );
  const previewDisabled = pricesLoading || !channelId;

  const getExternalImportTargetState = useCallback(() => {
    if (type !== "UPDATE") {
      return null;
    }

    const currentValues = UpdateForm.getValues();

    return {
      attributeOptions: currentValues.attributeOptions ?? {},
      attributes: currentValues.attributes ?? [],
      category: toPlainNestedCategory(currentValues.category),
      customSize: currentValues.customSize ?? false,
      customSizes: currentValues.customSizes ?? [],
      defaultPrice: currentValues.defaultPrice,
      highPrice: currentValues.highPrice,
      lowPrice: currentValues.lowPrice,
      pageCount: getPersistedPageCountValue(currentValues.pageCount),
      priceType: currentValues.priceType ?? PriceTypeEnum.SINGLE,
      productType: toPlainNestedProductType(currentValues.productType),
      spec: currentValues.spec,
      volumes: currentValues.volumes ?? [],
    } satisfies ConnectedProductImportTarget;
  }, [UpdateForm, type]);

  const applyExternalImportDraft = useCallback(
    (draft: ConnectedProductImportApplyDraft) => {
      if (type !== "UPDATE") {
        return;
      }

      const currentValues = UpdateForm.getValues();
      const nextSpec = draft.spec
        ? {
            ...currentValues.spec,
            ...draft.spec,
          }
        : currentValues.spec;
      const rawNextAttributes = draft.attributes ?? currentValues.attributes;
      const rawNextAttributeOptions =
        draft.attributeOptions ?? currentValues.attributeOptions;
      const nextAttributeDependencies =
        draft.attributeDependencies ?? currentValues.attributeDependencies;
      const nextProductType =
        draft.productType !== undefined
          ? draft.productType
          : currentValues.productType;
      const nextCustomSize =
        draft.customSize !== undefined
          ? draft.customSize
          : currentValues.customSize;
      const nextCustomSizes =
        draft.customSizes !== undefined
          ? draft.customSizes
          : nextCustomSize
            ? (currentValues.customSizes ?? [])
            : [];
      const nextPageCount =
        draft.pageCount !== undefined
          ? getFormPageCountValue(draft.pageCount)
          : currentValues.pageCount;
      const nextVolumes = draft.volumes ?? currentValues.volumes;
      const cleanedAttributeData =
        draft.priceType === PriceTypeEnum.MATRIX
          ? globalAttributes
            ? validateAttributesAndOptions(
                rawNextAttributes ?? [],
                rawNextAttributeOptions ?? {},
                globalAttributes,
              )
            : {
                validAttributes: rawNextAttributes ?? [],
                validAttributeOptions: rawNextAttributeOptions ?? {},
              }
          : {
              validAttributes: [],
              validAttributeOptions: {},
            };
      const nextAttributes = cleanedAttributeData.validAttributes;
      const nextAttributeOptions = cleanedAttributeData.validAttributeOptions;
      const nextPrices = fixPriceCombinations(draft.prices, draft.priceType);
      UpdateForm.reset(
        {
          ...currentValues,
          attributeDependencies: nextAttributeDependencies,
          attributeOptions: nextAttributeOptions,
          attributes: nextAttributes,
          customSize: nextCustomSize,
          customSizes: nextCustomSizes,
          defaultPrice: draft.defaultPrice ?? currentValues.defaultPrice,
          highPrice: draft.highPrice ?? currentValues.highPrice,
          lowPrice: draft.lowPrice ?? currentValues.lowPrice,
          pageCount: nextPageCount,
          priceType: draft.priceType,
          prices: nextPrices,
          productType: nextProductType ?? null,
          spec: nextSpec,
          volumes: nextVolumes,
        },
        {
          keepDefaultValues: true,
          keepErrors: true,
          keepIsSubmitted: true,
          keepSubmitCount: true,
        },
      );

      void UpdateForm.trigger([...externalImportFieldNames]);
    },
    [UpdateForm, globalAttributes, type],
  );

  const openPreview = useCallback(() => {
    setPreviewSnapshot(activeForm.getValues() as ProductPreviewInput);
    setPreviewOpen(true);
  }, [activeForm]);

  const handlePreviewOpenChange = useCallback(
    (details: { open: boolean }) => {
      if (details.open) {
        setPreviewSnapshot(activeForm.getValues() as ProductPreviewInput);
        setPreviewOpen(true);
        return;
      }

      setPreviewOpen(false);
      setPreviewSnapshot(undefined);
    },
    [activeForm],
  );

  const previewControls = useMemo<ProductPreviewControls>(
    () => ({
      applyExternalImportDraft:
        type === "UPDATE" ? applyExternalImportDraft : undefined,
      disabled: previewDisabled,
      getExternalImportTargetState:
        type === "UPDATE" ? getExternalImportTargetState : undefined,
      openPreview,
    }),
    [
      applyExternalImportDraft,
      getExternalImportTargetState,
      openPreview,
      previewDisabled,
      type,
    ],
  );

  useRealtimeFormDocument({
    collectionPath: channel ? `/channels/${channel.id}/categories` : null,
    enabled: type === "CREATE" && shouldSubscribeCategory(watchCreateCategory),
    fieldName: "category",
    form: CreateForm,
    value: getSubscribedCategoryValue(watchCreateCategory),
  });
  useRealtimeFormDocument({
    collectionPath: channel ? `/channels/${channel.id}/categories` : null,
    enabled: type === "UPDATE" && shouldSubscribeCategory(watchUpdateCategory),
    fieldName: "category",
    form: UpdateForm,
    value: getSubscribedCategoryValue(watchUpdateCategory),
  });
  useRealtimeFormDocument({
    collectionPath: channel ? `/channels/${channel.id}/categories` : null,
    enabled:
      type === "DUPLICATE" && shouldSubscribeCategory(watchDuplicateCategory),
    fieldName: "category",
    form: DuplicateForm,
    value: getSubscribedCategoryValue(watchDuplicateCategory),
  });
  useRealtimeFormDocument({
    collectionPath: "/productTypes",
    enabled:
      type === "CREATE" && shouldSubscribeProductType(watchCreateProductType),
    fieldName: "productType",
    form: CreateForm,
    value: getSubscribedProductTypeValue(watchCreateProductType),
  });
  useRealtimeFormDocument({
    collectionPath: "/productTypes",
    enabled:
      type === "UPDATE" && shouldSubscribeProductType(watchUpdateProductType),
    fieldName: "productType",
    form: UpdateForm,
    value: getSubscribedProductTypeValue(watchUpdateProductType),
  });
  useRealtimeFormDocument({
    collectionPath: "/productTypes",
    enabled:
      type === "DUPLICATE" &&
      shouldSubscribeProductType(watchDuplicateProductType),
    fieldName: "productType",
    form: DuplicateForm,
    value: getSubscribedProductTypeValue(watchDuplicateProductType),
  });

  useEffect(() => {
    onPreviewStateChange?.(previewControls);

    return () => {
      onPreviewStateChange?.(null);
    };
  }, [onPreviewStateChange, previewControls]);

  useEffect(() => {
    // Don't reset forms while prices are loading
    if (pricesLoading) return;

    if (type === "UPDATE" && updateDefaultValues) {
      UpdateForm.reset(updateDefaultValues);
    } else if (type === "DUPLICATE" && duplicateDefaultValues) {
      DuplicateForm.reset(duplicateDefaultValues);
    } else if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate(defaultProductCurrency));
    }
  }, [
    CreateForm,
    DuplicateForm,
    UpdateForm,
    defaultProductCurrency,
    duplicateDefaultValues,
    updateDefaultValues,
    type,
    pricesLoading,
  ]);

  // Show error if prices failed to load
  useEffect(() => {
    if (pricesError) {
      console.error("Error loading prices:", pricesError);
      toaster.error({
        title: t("error.pricesLoadError", {
          defaultValue: "Error loading prices",
        }),
        description: t("error.pricesLoadErrorDescription", {
          defaultValue:
            "Failed to load product prices. Using embedded prices as fallback.",
        }),
      });
    }
  }, [pricesError, t]);

  if (isNull(channel)) return null;

  // Show loading state while prices are being fetched
  if (pricesLoading && (type === "UPDATE" || type === "DUPLICATE")) {
    return (
      <AdminLoadingSkeleton variant="fields" showHeader={false} rows={8} />
    );
  }

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <>
      <FormController
        methods={activeForm}
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        formData={productForm(
          t,
          imagePropsPrefix,
          printingMethodOptions,
          unitOptions,
        )}
        update={type === "UPDATE"}
        searchFn={{ categories: searchCategoriesInput }}
        searchResults={{ categories: categoryInputSearchResults }}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateProduct(
                data,
                refreshProducts,
                channel.id,
                t,
                externalProductId,
                draftProductId,
                type === "CREATE" ? onCreateSuccess : undefined,
                tenantContext,
              )
            : await handleUpdateProduct(
                data,
                refreshProducts,
                channel.id,
                productWithPrices,
                mutate,
                t,
                tenantContext,
              )
        }
        isProductForm
        ProductType={<ProductType />}
        Attributes={Attributes}
        PageCountConfig={PageCountConfig}
        DynamicPricingConfig={DynamicPricingConfigField}
        PriceOffsets={PriceOffsets}
        AttributeDependencies={AttributeDependencies}
        By={<By update={type === "UPDATE"} />}
        ToChannel={type === "DUPLICATE" && <ToChannel />}
        pricesMatrix={<PricesMatrix />}
        Generate={Generate}
        FileManagerActions={ProductImageGeneratorFieldActions}
        t={t}
        i18n={i18n}
      >
        {type === "CREATE" && <GenerateProduct />}
      </FormController>
      {previewCombinationProduct && (
        <Dialog.Root
          size={"full"}
          open={previewOpen}
          onOpenChange={handlePreviewOpenChange}
        >
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner paddingTop={isElectron() ? 4 : 0}>
              <Dialog.Content>
                <Dialog.Body bgColor={{ base: "white", _dark: "black" }}>
                  <Container maxW={"7xl"} py={8}>
                    <Dialog.CloseTrigger asChild>
                      <CloseButton size="xs" />
                    </Dialog.CloseTrigger>
                    <Combination
                      router={router}
                      pathname={pathname}
                      params={{ id: previewAssetProductId }}
                      searchParams={emptyPreviewSearchParams}
                      product={previewCombinationProduct}
                      resolvedPrices={previewResolvedPrices}
                      initConfiguration={previewInitConfiguration}
                      syncQueryParams={false}
                      attributes={previewAttributes}
                      channelId={channel.id}
                      firestore={firestore}
                      productId={previewAssetProductId}
                      descriptionPreview={
                        <Preview
                          source={previewCombinationProduct.description}
                        />
                      }
                      storeSettings={
                        storeSettings
                          ? { express: storeSettings.express }
                          : undefined
                      }
                      allowOutOfSpec={false}
                      t={t}
                      i18n={i18n}
                    />
                  </Container>
                </Dialog.Body>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      )}
    </>
  );
}

const initialValuesCreate = (currency: CurrencyCode = CurrencyEnum.PLN) => {
  const defaultPrice = {
    value: 0,
    threshold: 0,
    currency,
  };

  const values: CreateInput = {
    name: "",
    description: "",
    prices: [defaultPrice],
    defaultPrice: defaultPrice,
    lowPrice: defaultPrice,
    highPrice: defaultPrice,
    volumes: [{ value: 1 }],
    attributes: [],
    attributeOptions: {},
    attributeDependencies: {},
    customSize: false,
    customSizes: [],
    allowCustomPrice: false,
    recommended: false,
    difficulty: 5,
    shipping: {
      types: [],
    },
    spec: {
      images: [],
      defaultOrder: 1,
      maximumOrder: 100,
      minimumOrder: 1,
      step: 1,
      minimumWidth: 100,
      maximumWidth: 1000,
      widthStep: 1,
      minimumHeight: 100,
      maximumHeight: 1000,
      heightStep: 1,
      validateRatio: false,
      minimumRatio: 0.2,
      maximumRatio: 5,
    },
    designSpec: {
      dpi: 300,
      bleed: 4,
      includeBleed: false,
    },
    pageCount: createDefaultPageCountConfig(),
    dynamicPricing: createDefaultDynamicPricingConfig(),
    priceOffsets: createDefaultPriceOffsetsConfig(),
    seo: {
      slug: "",
      title: "",
      description: "",
    },
    productType: null,
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    category: {
      id: "",
      name: "",
    },
    availability: {
      published: false,
      publicationString: "",
      availableForPurchase: false,
      expirationString: "",
    },
    createdBy: {
      id: "",
      name: "",
    },
    active: true,
    channelId: "",
    specialNotes: "",
  };
  return values;
};

async function syncProductSearchIndexForForm({
  channelId,
  productId,
  previousLinkedChannelIds,
  previousProductState,
}: {
  channelId: Channel["id"];
  productId: Product["id"];
  previousLinkedChannelIds?: readonly string[];
  previousProductState?: {
    active?: boolean;
    published?: boolean;
    slug?: string;
    id?: string;
  };
}) {
  const searchIndexResult = await syncProductSearchIndexAction({
    channelId,
    productId,
    previousLinkedChannelIds,
    previousProductState,
  });
  if (!searchIndexResult.ok) {
    console.error("[ProductForm] Failed to sync product search index", {
      error: searchIndexResult.error,
      channelId,
      productId,
    });
  }
}

function scheduleProductChangeLog({
  channelId,
  productId,
  before,
}: {
  channelId: Channel["id"];
  productId: Product["id"];
  before: unknown | null;
}) {
  const beforeSnapshot = before ? createChangeSnapshot(before) : null;
  if (before && !beforeSnapshot) {
    console.error("[ProductForm] Failed to serialize previous product", {
      channelId,
      productId,
    });
    return;
  }

  void scheduleChangeLogAfterFormSubmit({
    entityType: EntityType.Product,
    entityId: productId,
    channelId,
    before: beforeSnapshot,
  }).catch((error) => {
    console.error("[ProductForm] Failed to schedule change log", {
      error,
      channelId,
      productId,
    });
  });
}

const handleCreateProduct = async (
  data: CreateInput,
  refreshProducts: () => void,
  channelId: Channel["id"],
  t: TFunction,
  externalProductId?: string | null,
  draftProductId?: string | null,
  onCreateSuccess?: (productId: string, channelId: string) => void,
  tenantContext?: TenantContext,
) => {
  try {
    showProductCreateProgress(t, "checking");

    await assertSaasRuntimeQuotaAction({
      operation: "admin.product.create",
      resource: "products",
    });

    if (externalProductId) {
      await assertSaasRuntimeModuleAction({
        module: "externalProviderImport",
        operation: "admin.product.external-import.create",
      });
    }

    if (
      data.priceType === PriceTypeEnum.DYNAMIC &&
      data.dynamicPricing?.enabled
    ) {
      await assertSaasRuntimeModuleAction({
        module: "dynamicPrintPricing",
        operation: "admin.product.dynamic-pricing.create",
      });
    }

    showProductCreateProgress(t, "preparing");

    // Validate prices before proceeding
    const priceValidation = validateProductPrices(
      data.prices,
      data.priceType,
      t,
    );
    if (!priceValidation.isValid) {
      toaster.error({
        title: t("error.validationError", { defaultValue: "Validation error" }),
        description: priceValidation.error,
      });
      return;
    }

    if (!isPublicationBeforeExpirationValid(data.availability)) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("error.publicationDateAfterExpiration", {
          defaultValue: "Publication date cannot be later than expiration date",
        }),
      });
      return;
    }

    const _channelId = !isUndefined(data?.toChannel?.id)
      ? data?.toChannel?.id
      : channelId;
    const createProductId = draftProductId ?? "";
    const dynamicPricingPresets = await getLinkedDynamicPricingPresets(
      _channelId,
      data.dynamicPricing,
    );
    const dynamicPricingValidation = validateDynamicProductPricing({
      dynamicPricing: data.dynamicPricing,
      dynamicPricingPresets,
      priceType: data.priceType,
    });

    if (!dynamicPricingValidation.isValid) {
      toaster.error({
        title: t("error.validationError", {
          defaultValue: "Validation error",
        }),
        description: t(
          `error.${dynamicPricingValidation.errorKey}`,
          dynamicPricingValidation.errorKey === "dynamicPricingRequired"
            ? {
                defaultValue:
                  "Dynamic pricing products must have dynamic pricing enabled before saving.",
              }
            : {
                defaultValue:
                  "Dynamic pricing products must have at least one positive price rule, preset, or base price before saving.",
              },
        ),
      });
      return;
    }

    const dynamicPricingAttributeDefinitions =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? await getDynamicPricingAttributeDefinitions(data.attributes)
        : undefined;

    // Calculate default, low, and high prices based on the current form data
    const calculatedPrices = calculateListingPricesForProductForm({
      attributeDefinitions: dynamicPricingAttributeDefinitions,
      attributeDependencies: data.attributeDependencies,
      attributeOptions: data.attributeOptions,
      attributes: data.attributes,
      currency: data.defaultPrice?.currency,
      customSize: data.customSize,
      dynamicPricing: data.dynamicPricing,
      dynamicPricingPresets,
      pageCount: getPersistedPageCountValue(data.pageCount),
      priceType: data.priceType,
      prices: data.prices || [],
      spec: data.spec,
      volumes: data.volumes,
    });

    // Fix price combinations for non-matrix products
    const fixedPrices =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? []
        : fixPriceCombinations(data.prices || [], data.priceType);
    const normalizedPageCount = getPersistedPageCountValue(data.pageCount);
    const {
      fixedPageCountExactPrices,
      fixedPageCountSegmentPrices,
      fixedPageCountStepPrices,
      normalizedPageCountForPricing,
      pageCountPricingMode,
    } = normalizePageCountPricingForSave({
      pageCount: normalizedPageCount,
      priceType: data.priceType,
    });
    const pageCountPriceValidation = validatePageCountPricing(
      normalizedPageCountForPricing,
      data.priceType,
      t,
    );

    if (!pageCountPriceValidation.isValid) {
      toaster.error({
        title: t("error.validationError", {
          defaultValue: "Validation error",
        }),
        description: pageCountPriceValidation.error,
      });
      return;
    }

    const pageCountForSave =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? normalizedPageCountForPricing
          ? { ...normalizedPageCountForPricing, pricing: undefined }
          : undefined
        : normalizedPageCountForPricing
          ? stripStoredPageCountPricingTables(normalizedPageCountForPricing)
          : undefined;

    const product: ProductCreate = {
      id: createProductId,
      name: data.name,
      description: data.description,
      prices: [],
      volumes: data.volumes,
      attributes: data.attributes,
      attributeOptions: data.attributeOptions,
      attributeDependencies: data.attributeDependencies,
      customSize: data.customSize,
      customSizes: data.customSize ? data.customSizes : [],
      allowCustomPrice: data.allowCustomPrice,
      shipping: data.shipping,
      spec: data.spec,
      designSpec: data.designSpec,
      pageCount: pageCountForSave,
      seo: {
        ...data.seo,
        slug: toSlug(data.seo?.slug || ""),
      },
      difficulty: data.difficulty,
      recommended: data.recommended,
      productType:
        isMatrixLikePriceType(data.priceType) &&
        hasProductTypeSelection(data.productType)
          ? {
              id: data.productType.id,
              name: data.productType.name,
              attributes: data.productType.attributes,
              isShippable: data.productType.isShippable,
            }
          : null,
      priceType: data.priceType,
      prefferedUnit: data.prefferedUnit,
      category: {
        id: data.category.id,
        name: data.category.name,
      },
      availability: buildAvailabilityPayload(data.availability),
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
      active: data.active,
      defaultPrice: calculatedPrices.defaultPrice,
      lowPrice: calculatedPrices.lowPrice,
      highPrice: calculatedPrices.highPrice,
      priceOffsets: data.priceOffsets ?? createDefaultPriceOffsetsConfig(),
      channelId: _channelId,
      specialNotes: data.specialNotes,
    } as Product;

    if (data.threeDModel) {
      product.threeDModel = data.threeDModel;
    }

    // Clean up non-matrix products to ensure proper attribute configuration
    const finalProduct = cleanupNonMatrixProduct(product);
    finalProduct.dynamicPricing =
      data.priceType === PriceTypeEnum.DYNAMIC && data.dynamicPricing?.enabled
        ? data.dynamicPricing
        : undefined;

    if (draftProductId) {
      finalProduct.id = draftProductId;
    }

    showProductCreateProgress(t, "checking");

    try {
      const _seoSlugExists = await seoSlugExists(
        channelId,
        finalProduct.seo.slug,
        product.id,
      );
      if (_seoSlugExists) {
        toaster.error({
          title: t?.("error.productNotEdited", {
            defaultValue: "Product was not edited",
          }),
          description: t?.("error.seoSlugExists", {
            defaultValue: "SEO slug already exists",
          }),
        });
        return;
      }
    } catch (error) {
      toaster.error({
        title: t?.("error.productNotEdited", {
          defaultValue: "Product was not edited",
        }),
        description: t?.("error.seoSlugExistsError", {
          defaultValue: "Error checking SEO slug, error code: {{error}}",
          error,
        }),
      });
      console.error("Error checking SEO slug existence:", error);
      return;
    }

    const clientFirestore = (await import("@/lib/firebase/clientApp"))
      .firestore;
    const { db, getDoc } = await import("@konfi/firebase");
    showProductCreateProgress(t, "savingProduct");
    const productsRef = db.collection(
      clientFirestore,
      "/channels/" + _channelId + "/products",
    );
    const productRef = draftProductId
      ? db.doc(
          clientFirestore,
          "/channels/" + _channelId + "/products",
          draftProductId,
        )
      : undefined;
    const productId = await create(
      clientFirestore,
      finalProduct,
      productRef,
      productRef ? undefined : productsRef,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );

    if (productId) {
      await recordSaasRuntimeQuotaUsageAction({
        operation: "admin.product.create",
        resource: "products",
      });
    }

    showProductCreateProgress(t, "savingPricing");

    // Create prices in subcollection if needed
    if (
      productId &&
      data.priceType !== PriceTypeEnum.DYNAMIC &&
      fixedPrices &&
      fixedPrices.length > 0
    ) {
      const pricesToCreate = buildProductPriceBatchData(fixedPrices);

      await batchCreateProductPrices(
        clientFirestore,
        _channelId,
        productId,
        pricesToCreate,
        tenantContext,
      );
    }

    if (productId) {
      if (
        data.priceType === PriceTypeEnum.DYNAMIC &&
        data.dynamicPricing?.enabled
      ) {
        await upsertProductDynamicPricing(
          clientFirestore,
          _channelId,
          productId,
          data.dynamicPricing,
          tenantContext,
        );
      } else {
        await deleteProductDynamicPricing(
          clientFirestore,
          _channelId,
          productId,
          tenantContext,
        );
      }
    }

    if (productId) {
      if (pageCountPricingMode === "exact") {
        const pageCountPricesToCreate = buildProductPageCountPriceBatchData(
          fixedPageCountExactPrices,
        );

        if (pageCountPricesToCreate.length > 0) {
          await batchCreateProductPageCountPrices(
            clientFirestore,
            _channelId,
            productId,
            pageCountPricesToCreate,
            tenantContext,
          );
        }
      } else {
        const pageCountStepPricesToCreate = buildProductPriceBatchData(
          pageCountPricingMode === "segmented"
            ? (fixedPageCountSegmentPrices[0]?.stepPrices ??
                fixedPageCountStepPrices)
            : fixedPageCountStepPrices,
        );

        if (pageCountStepPricesToCreate.length > 0) {
          await batchCreateProductPageCountStepPrices(
            clientFirestore,
            _channelId,
            productId,
            pageCountStepPricesToCreate,
            tenantContext,
          );
        }

        if (pageCountPricingMode === "segmented") {
          const pageCountSegmentBasePricesToCreate =
            buildProductPageCountSegmentBasePriceBatchData(
              fixedPageCountSegmentPrices,
              normalizedPageCountForPricing?.minimum,
            );
          const pageCountSegmentStepPricesToCreate =
            buildProductPageCountSegmentStepPriceBatchData(
              fixedPageCountSegmentPrices,
              normalizedPageCountForPricing?.minimum,
            );

          if (pageCountSegmentBasePricesToCreate.length > 0) {
            await batchCreateProductPageCountPrices(
              clientFirestore,
              _channelId,
              productId,
              pageCountSegmentBasePricesToCreate,
              tenantContext,
            );
          }

          if (pageCountSegmentStepPricesToCreate.length > 0) {
            await batchCreateProductPageCountSegmentStepPrices(
              clientFirestore,
              _channelId,
              productId,
              pageCountSegmentStepPricesToCreate,
              tenantContext,
            );
          }
        }
      }
    }

    if (productId && externalProductId) {
      showProductCreateProgress(t, "linkingExternal");

      try {
        const externalProduct = await getDoc<ExternalProduct>(
          db.doc(clientFirestore, "/externalProducts", externalProductId),
        );

        if (externalProduct) {
          const importConnection: ExternalImportConnection = {
            externalProductId,
            externalProductName: externalProduct.originalName,
            importedAt: Timestamp.now(),
            importedBy: {
              id: data.createdBy.id,
              name: data.createdBy.name,
            },
          };

          if (externalProduct.source?.providerId) {
            importConnection.providerId = externalProduct.source.providerId;
          }
          if (externalProduct.source?.platform) {
            importConnection.providerName = externalProduct.source.platform;
          }
          if (externalProduct.source?.url) {
            importConnection.sourceUrl = externalProduct.source.url;
          }

          await create(
            clientFirestore,
            importConnection,
            db.doc(
              clientFirestore,
              `/channels/${_channelId}/products/${productId}/externalImports`,
              externalProductId,
            ),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            tenantContext,
          );
        }
      } catch (error) {
        console.error("Failed to link external product import:", error);
      }
    }

    if (productId) {
      void ensureEntityTranslationsAction({
        kind: "product",
        channelId: _channelId,
        entityId: productId,
      })
        .then((result) => {
          if (!result.ok) {
            toaster.warning({
              title: t("translations.managed.toasts.autoWarning", {
                defaultValue: "Created, but auto-translation failed",
              }),
            });
          }
        })
        .catch((error) => {
          console.error("[ProductForm] Auto-translation failed", error);
          toaster.warning({
            title: t("translations.managed.toasts.autoWarning", {
              defaultValue: "Created, but auto-translation failed",
            }),
          });
        });

      scheduleProductChangeLog({
        channelId: _channelId,
        productId,
        before: null,
      });

      showProductCreateProgress(t, "syncingSearch");

      await syncProductSearchIndexForForm({
        channelId: _channelId,
        productId,
        // Newly created products have no previous linked channels to clean up.
        previousLinkedChannelIds: [],
      });
    }

    showProductCreateProgress(t, "finishing");

    try {
      await revalidateTagCache("products");
      await revalidateTagCache("categorizedCardProducts");
      await revalidateTagCache("productMetadata");
      await revalidateTagCache("featuredProducts");
      await revalidateTagCache("popularProducts");
      if (productId) {
        await revalidateTagCache(`storeProduct-${_channelId}`);
        await revalidateTagCache(
          `storeProduct-${_channelId}-${product.seo.slug}`,
        );
        await revalidateTagCache(`storeProductMetadata-${_channelId}`);
        await revalidateTagCache(
          `storeProductMetadata-${_channelId}-${product.seo.slug}`,
        );
      }
    } catch (error) {
      console.error("Failed to revalidate cache:", error);
    }

    toaster.success({
      title: t("error.productCreated", { defaultValue: "Product created" }),
      description: t("error.productCreatedSuccess", {
        defaultValue: "Successfully created new Product",
      }),
    });

    if (productId && onCreateSuccess) {
      setTimeout(() => onCreateSuccess(productId, _channelId), 600);
    }

    if (channelId === _channelId) refreshProducts();
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("error.productNotCreated", {
        error,
        defaultValue: "Product was not created, error code: {{error}}",
      }),
    });
  } finally {
    clearProductCreateProgress();
  }
};

const initialValuesUpdate = (
  product?: Product,
  globalAttributes?: Attribute[] | null,
  t?: any,
) => {
  if (isUndefined(product)) {
    console.error("product was not provided to initialValuesUpdate");
    return;
  }

  // Validate attributes and options against global attributes
  const { validAttributes, validAttributeOptions } = globalAttributes
    ? validateAttributesAndOptions(
        product.attributes || [],
        product.attributeOptions || {},
        globalAttributes,
      )
    : {
        validAttributes: product.attributes || [],
        validAttributeOptions: product.attributeOptions || {},
      };

  // For non-matrix products, reset attribute-related properties
  const cleanedAttributeData = !isMatrixLikePriceType(product.priceType)
    ? { validAttributes: [], validAttributeOptions: {} }
    : { validAttributes, validAttributeOptions };

  const fixedPrices = getInitialProductFormPrices({
    cleanedAttributeData,
    globalAttributes,
    product,
  });

  // Ensure we have at least one valid price - critical safety check
  const finalPrices =
    fixedPrices.length > 0
      ? fixedPrices
      : [createFallbackProductPrice(product.defaultPrice?.currency)];

  // Show warning if we had to add fallback prices
  if (fixedPrices.length === 0 && product.prices && product.prices.length > 0) {
    toaster.warning({
      title: t("error.priceValidationWarning", {
        defaultValue: "Price validation warning",
      }),
      description: t("error.priceValidationWarningDescription", {
        defaultValue:
          "Some product prices were invalid and have been reset. Please review and update the pricing.",
      }),
    });
    console.warn(
      "Product had prices but all were invalid - added fallback price",
    );
  }

  // For matrix products, ensure we have at least one non-null price
  const hasValidNonNullPrices = finalPrices.some(
    (price) =>
      price.value !== null && price.value !== undefined && price.value > 0,
  );

  if (product.priceType === PriceTypeEnum.MATRIX && !hasValidNonNullPrices) {
    toaster.warning({
      title: t("error.matrixPriceWarning", {
        defaultValue: "Matrix price warning",
      }),
      description: t("error.matrixPriceWarningDescription", {
        defaultValue:
          "Matrix product had no enabled prices. A default price has been added. Please configure proper pricing.",
      }),
    });
    console.warn(
      "Matrix product has no valid non-null prices - adding fallback",
    );
    // Add a fallback price for matrix products if all prices are null
    finalPrices.push({
      value: 0,
      threshold: 0,
      currency: product.defaultPrice?.currency ?? CurrencyEnum.PLN,
      combination: { id: "fallback", active: true, customFormat: false },
    });
  }

  // Calculate prices using the utility function with validated data
  const calculatedPrices = calculateListingPricesForProductForm({
    attributeDefinitions: undefined,
    attributeDependencies: product.attributeDependencies,
    attributeOptions: cleanedAttributeData.validAttributeOptions,
    attributes: cleanedAttributeData.validAttributes,
    currency: product.defaultPrice?.currency,
    customSize: product.customSize ?? false,
    dynamicPricing: product.dynamicPricing,
    dynamicPricingPresets: [],
    pageCount: getPersistedPageCountValue(product.pageCount),
    priceType: product.priceType || PriceTypeEnum.SINGLE,
    prices: finalPrices,
    spec: product.spec,
    volumes:
      product.volumes && product.volumes.length > 0
        ? product.volumes
        : [{ value: 1 }],
  });

  const values: UpdateInput = {
    name: product.name ?? "",
    description: product.description ?? "",
    prices: finalPrices, // Use the validated and fallback-protected prices
    // Use valid saved listing prices or fallback to freshly calculated values.
    defaultPrice: resolveProductFormListingPrice(
      product.defaultPrice,
      calculatedPrices.defaultPrice,
    ),
    lowPrice: resolveProductFormListingPrice(
      product.lowPrice,
      calculatedPrices.lowPrice,
    ),
    highPrice: resolveProductFormListingPrice(
      product.highPrice,
      calculatedPrices.highPrice,
    ),
    volumes:
      product.volumes && product.volumes.length > 0
        ? product.volumes
        : [{ value: 1 }],
    attributes: cleanedAttributeData.validAttributes,
    attributeOptions: cleanedAttributeData.validAttributeOptions,
    attributeDependencies: isMatrixLikePriceType(product.priceType)
      ? product.attributeDependencies || {}
      : {},
    customSize: product.customSize ?? false,
    customSizes: product.customSize ? product.customSizes : [],
    allowCustomPrice: product.allowCustomPrice ?? false,
    recommended: product.recommended ?? false,
    difficulty: product.difficulty ?? 5,
    shipping: {
      types:
        product.shipping?.types && product.shipping.types.length > 0
          ? product.shipping.types
          : [],
    },
    spec: {
      images:
        product.spec.images && product.spec.images.length > 0
          ? product.spec.images
          : [],
      defaultOrder: product.spec.defaultOrder ?? 1,
      maximumOrder: product.spec.maximumOrder ?? 100,
      minimumOrder: product.spec.minimumOrder ?? 1,
      step: product.spec.step ?? 1,
      minimumWidth: product.spec.minimumWidth ?? 100,
      maximumWidth: product.spec.maximumWidth ?? 1000,
      widthStep: product.spec.widthStep ?? 1,
      minimumHeight: product.spec.minimumHeight ?? 100,
      maximumHeight: product.spec.maximumHeight ?? 1000,
      heightStep: product.spec.heightStep ?? 1,
      validateRatio: product.spec.validateRatio ?? false,
      minimumRatio: product.spec.minimumRatio ?? 0.2,
      maximumRatio: product.spec.maximumRatio ?? 5,
    },
    designSpec: product.designSpec
      ? product.designSpec
      : {
          dpi: 300,
          bleed: 4,
          includeBleed: false,
        },
    pageCount: getFormPageCountValue(product.pageCount),
    dynamicPricing: product.dynamicPricing,
    priceOffsets: product.priceOffsets ?? createDefaultPriceOffsetsConfig(),
    seo: {
      slug: product.seo?.slug || "",
      title: product.seo?.title || "",
      description: product.seo?.description || "",
    },
    productType: hasProductTypeSelection(product.productType)
      ? product.productType
      : null,
    priceType: product.priceType ?? PriceTypeEnum.SINGLE,
    prefferedUnit: product.prefferedUnit ?? Unit.PCS,
    category: product.category ?? {
      id: "",
      name: "",
    },
    availability: product.availability ?? {
      published: false,
      publicationString: "",
      availableForPurchase: false,
      expirationString: "",
    },
    updatedBy: {
      id: "",
      name: "",
    },
    active: product.active,
    threeDModel: product.threeDModel ?? null,
    channelId: product.channelId ?? "",
    specialNotes: product.specialNotes ?? "",
  };
  return values;
};

const handleUpdateProduct = async (
  data: UpdateInput,
  refreshProducts: () => void,
  channelId?: Channel["id"],
  product?: Product,
  mutate?: KeyedMutator<Product | undefined>,
  t?: any,
  tenantContext?: TenantContext,
) => {
  try {
    if (!channelId) throw "channelId is undefined";
    if (isUndefined(product)) throw "product is undefined";

    if (
      data.priceType === PriceTypeEnum.DYNAMIC &&
      data.dynamicPricing?.enabled
    ) {
      await assertSaasRuntimeModuleAction({
        module: "dynamicPrintPricing",
        operation: "admin.product.dynamic-pricing.update",
      });
    }

    // Validate prices before proceeding
    const priceValidation = validateProductPrices(
      data.prices,
      data.priceType,
      t,
    );
    if (!priceValidation.isValid) {
      toaster.error({
        title: t?.("error.validationError", {
          defaultValue: "Validation error",
        }),
        description: priceValidation.error,
      });
      return;
    }

    if (!isPublicationBeforeExpirationValid(data.availability)) {
      toaster.error({
        title: t?.("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t?.("error.publicationDateAfterExpiration", {
          defaultValue: "Publication date cannot be later than expiration date",
        }),
      });
      return;
    }

    const dynamicPricingPresets = await getLinkedDynamicPricingPresets(
      channelId,
      data.dynamicPricing,
    );
    const dynamicPricingValidation = validateDynamicProductPricing({
      dynamicPricing: data.dynamicPricing,
      dynamicPricingPresets,
      priceType: data.priceType,
    });

    if (!dynamicPricingValidation.isValid) {
      toaster.error({
        title: t("error.validationError", {
          defaultValue: "Validation error",
        }),
        description: t(
          `error.${dynamicPricingValidation.errorKey}`,
          dynamicPricingValidation.errorKey === "dynamicPricingRequired"
            ? {
                defaultValue:
                  "Dynamic pricing products must have dynamic pricing enabled before saving.",
              }
            : {
                defaultValue:
                  "Dynamic pricing products must have at least one positive price rule, preset, or base price before saving.",
              },
        ),
      });
      return;
    }

    const dynamicPricingAttributeDefinitions =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? await getDynamicPricingAttributeDefinitions(data.attributes)
        : undefined;
    const calculatedPrices = calculateListingPricesForProductForm({
      attributeDefinitions: dynamicPricingAttributeDefinitions,
      attributeDependencies: data.attributeDependencies,
      attributeOptions: data.attributeOptions,
      attributes: data.attributes,
      currency: data.defaultPrice?.currency,
      customSize: data.customSize,
      dynamicPricing: data.dynamicPricing,
      dynamicPricingPresets,
      pageCount: getPersistedPageCountValue(data.pageCount),
      priceType: data.priceType,
      prices: data.prices || [],
      spec: data.spec,
      volumes: data.volumes,
    });

    // Fix price combinations for non-matrix products
    const fixedPrices =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? []
        : fixPriceCombinations(data.prices || [], data.priceType);
    const normalizedPageCount = getPersistedPageCountValue(data.pageCount);
    const {
      fixedPageCountExactPrices,
      fixedPageCountSegmentPrices,
      fixedPageCountStepPrices,
      normalizedPageCountForPricing,
      pageCountPricingMode,
    } = normalizePageCountPricingForSave({
      pageCount: normalizedPageCount,
      priceType: data.priceType,
    });
    const pageCountPriceValidation = validatePageCountPricing(
      normalizedPageCountForPricing,
      data.priceType,
      t,
    );

    if (!pageCountPriceValidation.isValid) {
      toaster.error({
        title: t?.("error.validationError", {
          defaultValue: "Validation error",
        }),
        description: pageCountPriceValidation.error,
      });
      return;
    }

    const pageCountForSave =
      data.priceType === PriceTypeEnum.DYNAMIC
        ? normalizedPageCountForPricing
          ? { ...normalizedPageCountForPricing, pricing: undefined }
          : undefined
        : normalizedPageCountForPricing
          ? stripStoredPageCountPricingTables(normalizedPageCountForPricing)
          : undefined;

    const _product: ProductUpdate = {
      name: data.name,
      description: data.description,
      volumes: data.volumes,
      attributes: data.attributes,
      attributeOptions: data.attributeOptions,
      attributeDependencies: data.attributeDependencies,
      customSize: data.customSize,
      customSizes: data.customSize ? data.customSizes : [],
      allowCustomPrice: data.allowCustomPrice,
      shipping: data.shipping,
      spec: data.spec,
      designSpec: data.designSpec,
      pageCount: pageCountForSave,
      seo: {
        ...data.seo,
        slug: toSlug(data.seo?.slug || ""),
      },
      difficulty: data.difficulty,
      recommended: data.recommended,
      productType:
        isMatrixLikePriceType(data.priceType) &&
        hasProductTypeSelection(data.productType)
          ? {
              id: data.productType.id,
              name: data.productType.name,
              attributes: data.productType.attributes,
              isShippable: data.productType.isShippable,
            }
          : null,
      priceType: data.priceType,
      prefferedUnit: data.prefferedUnit,
      category: {
        id: data.category.id,
        name: data.category.name,
      },
      availability: buildAvailabilityPayload(data.availability),
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
      active: data.active,
      prices: [],
      threeDModel: data.threeDModel,
      channelId: data.channelId ?? "",
      specialNotes: data.specialNotes,
      defaultPrice: calculatedPrices.defaultPrice,
      lowPrice: calculatedPrices.lowPrice,
      highPrice: calculatedPrices.highPrice,
      priceOffsets: data.priceOffsets ?? createDefaultPriceOffsetsConfig(),
    };

    // Clean up non-matrix products to ensure proper attribute configuration
    const finalProduct = cleanupNonMatrixProduct(_product);
    finalProduct.dynamicPricing =
      data.priceType === PriceTypeEnum.DYNAMIC && data.dynamicPricing?.enabled
        ? data.dynamicPricing
        : undefined;
    const currentSeoSlug = toSlug(product.seo?.slug || "");
    const nextSeoSlug = finalProduct.seo.slug;

    if (nextSeoSlug !== currentSeoSlug) {
      try {
        const _seoSlugExists = await seoSlugExists(
          channelId,
          nextSeoSlug,
          product.id,
        );
        if (_seoSlugExists) {
          toaster.error({
            title: t?.("error.productNotEdited", {
              defaultValue: "Product was not edited",
            }),
            description: t?.("error.seoSlugExists", {
              defaultValue: "SEO slug already exists",
            }),
          });
          return;
        }
      } catch (error) {
        toaster.error({
          title: t?.("error.productNotEdited", {
            defaultValue: "Product was not edited",
          }),
          description: t?.("error.seoSlugExistsError", {
            defaultValue: "Error checking SEO slug, error code: {{error}}",
            error,
          }),
        });
        console.error("Error checking SEO slug existence:", error);
        return;
      }
    }

    const clientFirestore = (await import("@/lib/firebase/clientApp"))
      .firestore;
    const update = (await import("@konfi/firebase")).update;
    const db = (await import("@konfi/firebase")).db;
    const productRef = db.doc<Product>(
      clientFirestore,
      "/channels/" + channelId + "/products",
      product.id,
    );
    const previousProductSnapshot = await firestoreGetDoc(productRef);
    const previousProduct = previousProductSnapshot.exists()
      ? previousProductSnapshot.data()
      : product;

    await update(finalProduct, productRef, tenantContext);
    scheduleProductChangeLog({
      channelId,
      productId: product.id,
      before: previousProduct,
    });

    if (
      data.priceType === PriceTypeEnum.DYNAMIC &&
      data.dynamicPricing?.enabled
    ) {
      await upsertProductDynamicPricing(
        clientFirestore,
        channelId,
        product.id,
        data.dynamicPricing,
        tenantContext,
      );
    } else {
      await deleteProductDynamicPricing(
        clientFirestore,
        channelId,
        product.id,
        tenantContext,
      );
    }

    const originalProductForSync = product;
    const originalPageCountPricingMode = getPageCountPricingMode(
      originalProductForSync.pageCount?.pricing,
    );
    const priceSyncPlan = buildProductPriceSyncPlan(
      originalProductForSync.prices ?? [],
      fixedPrices,
    );
    const pageCountStepPriceSyncPlan = buildProductPriceSyncPlan(
      originalPageCountPricingMode === "segmented"
        ? (originalProductForSync.pageCount?.pricing?.stepPrices ??
            originalProductForSync.pageCount?.pricing?.segmentPrices?.[0]
              ?.stepPrices ??
            [])
        : (originalProductForSync.pageCount?.pricing?.stepPrices ?? []),
      pageCountPricingMode === "step"
        ? fixedPageCountStepPrices
        : pageCountPricingMode === "segmented"
          ? (fixedPageCountSegmentPrices[0]?.stepPrices ??
            fixedPageCountStepPrices)
          : [],
    );
    const pageCountPriceSyncPlan = buildProductPageCountPriceSyncPlan(
      originalPageCountPricingMode === "exact"
        ? (originalProductForSync.pageCount?.pricing?.exactPrices ?? [])
        : originalPageCountPricingMode === "segmented"
          ? (originalProductForSync.pageCount?.pricing?.segmentPrices ?? [])
              .filter(
                (segment) =>
                  segment.minimum !== originalProductForSync.pageCount?.minimum,
              )
              .map((segment) => ({
                pageCount: segment.minimum,
                prices: segment.basePrices,
              }))
          : [],
      pageCountPricingMode === "exact"
        ? fixedPageCountExactPrices
        : pageCountPricingMode === "segmented"
          ? fixedPageCountSegmentPrices
              .filter(
                (segment) =>
                  segment.minimum !== normalizedPageCountForPricing?.minimum,
              )
              .map((segment) => ({
                pageCount: segment.minimum,
                prices: segment.basePrices,
              }))
          : [],
    );
    const pageCountSegmentStepPriceSyncPlan =
      buildProductPageCountSegmentStepPriceSyncPlan(
        originalPageCountPricingMode === "segmented"
          ? (originalProductForSync.pageCount?.pricing?.segmentPrices ?? [])
          : [],
        pageCountPricingMode === "segmented" ? fixedPageCountSegmentPrices : [],
        normalizedPageCountForPricing?.minimum,
      );

    if (pageCountSegmentStepPriceSyncPlan.deletes.length > 0) {
      await batchDeleteProductPageCountSegmentStepPrices(
        firestore,
        channelId,
        product.id,
        pageCountSegmentStepPriceSyncPlan.deletes,
      );
    }

    if (pageCountSegmentStepPriceSyncPlan.upserts.length > 0) {
      await batchCreateProductPageCountSegmentStepPrices(
        firestore,
        channelId,
        product.id,
        pageCountSegmentStepPriceSyncPlan.upserts,
        tenantContext,
      );
    }

    if (pageCountPriceSyncPlan.deletes.length > 0) {
      await batchDeleteProductPageCountPrices(
        firestore,
        channelId,
        product.id,
        pageCountPriceSyncPlan.deletes,
      );
    }

    if (pageCountPriceSyncPlan.upserts.length > 0) {
      await batchCreateProductPageCountPrices(
        firestore,
        channelId,
        product.id,
        pageCountPriceSyncPlan.upserts,
        tenantContext,
      );
    }

    if (pageCountStepPriceSyncPlan.deletes.length > 0) {
      await batchDeleteProductPageCountStepPrices(
        firestore,
        channelId,
        product.id,
        pageCountStepPriceSyncPlan.deletes,
      );
    }

    if (pageCountStepPriceSyncPlan.upserts.length > 0) {
      await batchCreateProductPageCountStepPrices(
        firestore,
        channelId,
        product.id,
        pageCountStepPriceSyncPlan.upserts,
        tenantContext,
      );
    }

    if (priceSyncPlan.deletes.length > 0) {
      await batchDeleteProductPrices(
        firestore,
        channelId,
        product.id,
        priceSyncPlan.deletes,
      );
    }

    if (priceSyncPlan.upserts.length > 0) {
      await batchCreateProductPrices(
        firestore,
        channelId,
        product.id,
        priceSyncPlan.upserts,
        tenantContext,
      );
    }

    await syncProductSearchIndexForForm({
      channelId,
      productId: product.id,
      previousLinkedChannelIds: product.linkedChannels ?? [],
      previousProductState: {
        active: previousProduct.active,
        published: previousProduct.availability.published,
        slug: previousProduct.seo.slug,
        id: previousProduct.id,
      },
    });

    toaster.success({
      title: t?.("error.productEdited", { defaultValue: "Product edited" }),
      description: t?.("error.productEditedSuccess", {
        name: data.name,
        defaultValue: "Successfully edited Product {{name}}",
      }),
    });

    try {
      await revalidateTagCache("products");
      await revalidateTagCache("categorizedCardProducts");
      await revalidateTagCache("productMetadata");
      await revalidateTagCache("featuredProducts");
      await revalidateTagCache("popularProducts");
      await revalidateTagCache(`storeProduct-${channelId}`);
      await revalidateTagCache(`storeProduct-${channelId}-${product.seo.slug}`);
      await revalidateTagCache(
        `storeProduct-${channelId}-${_product.seo.slug}`,
      );
      await revalidateTagCache(`storeProductMetadata-${channelId}`);
      await revalidateTagCache(
        `storeProductMetadata-${channelId}-${product.seo.slug}`,
      );
      await revalidateTagCache(
        `storeProductMetadata-${channelId}-${_product.seo.slug}`,
      );
    } catch (error) {
      console.error("Failed to revalidate cache:", error);
    }

    swrMutate(
      `product-prices-${channelId}-${product.id}`,
      {
        prices: fixedPrices,
        pageCountExactPrices:
          pageCountPricingMode === "exact" ? fixedPageCountExactPrices : [],
        pageCountSegmentPrices:
          pageCountPricingMode === "segmented"
            ? fixedPageCountSegmentPrices
            : [],
        pageCountStepPrices:
          pageCountPricingMode === "step"
            ? fixedPageCountStepPrices
            : pageCountPricingMode === "segmented"
              ? (fixedPageCountSegmentPrices[0]?.stepPrices ??
                fixedPageCountStepPrices)
              : [],
      },
      {
        revalidate: false,
      },
    );

    if (mutate)
      mutate(
        {
          ...product,
          ...finalProduct,
          dynamicPricing:
            data.priceType === PriceTypeEnum.DYNAMIC
              ? data.dynamicPricing
              : undefined,
          prices: fixedPrices,
          pageCount: normalizedPageCount
            ? {
                ...(stripStoredPageCountPricingTables(normalizedPageCount) ??
                  {}),
                pricing:
                  pageCountPricingMode === "exact"
                    ? {
                        mode: "exact" as const,
                        exactPrices: fixedPageCountExactPrices,
                      }
                    : pageCountPricingMode === "segmented"
                      ? {
                          mode: "segmented" as const,
                          segments:
                            normalizedPageCountForPricing?.pricing?.segments ??
                            [],
                          segmentPrices: fixedPageCountSegmentPrices,
                          stepPrices:
                            fixedPageCountSegmentPrices[0]?.stepPrices ??
                            fixedPageCountStepPrices,
                        }
                      : {
                          mode: "step" as const,
                          stepPrices: fixedPageCountStepPrices,
                        },
              }
            : undefined,
        } as Product,
        {
          revalidate: false,
        },
      );
    refreshProducts();
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t?.("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t?.("error.productNotEditedError", {
        error,
        defaultValue: "Product was not edited, error code: {{error}}",
      }),
    });
  }
};

const initialValuesDuplicate = (
  product?: Product,
  globalAttributes?: Attribute[] | null,
) => {
  if (isUndefined(product)) {
    console.error("product was not provided to initialValuesUpdate");
    return;
  }

  // Validate attributes and options against global attributes
  const { validAttributes, validAttributeOptions } = globalAttributes
    ? validateAttributesAndOptions(
        product.attributes || [],
        product.attributeOptions || {},
        globalAttributes,
      )
    : {
        validAttributes: product.attributes || [],
        validAttributeOptions: product.attributeOptions || {},
      };

  // For non-matrix products, reset attribute-related properties during duplication
  const cleanedAttributeData = !isMatrixLikePriceType(product.priceType)
    ? { validAttributes: [], validAttributeOptions: {} }
    : { validAttributes, validAttributeOptions };

  const fixedPrices = getInitialProductFormPrices({
    cleanedAttributeData,
    globalAttributes,
    product,
  });

  const finalPrices =
    fixedPrices.length > 0
      ? fixedPrices
      : [createFallbackProductPrice(product.defaultPrice?.currency)];
  const duplicateVolumes =
    product.volumes && product.volumes.length > 0
      ? product.volumes
      : [{ value: 1 }];
  const calculatedPrices = calculateListingPricesForProductForm({
    attributeDefinitions: undefined,
    attributeDependencies: product.attributeDependencies,
    attributeOptions: cleanedAttributeData.validAttributeOptions,
    attributes: cleanedAttributeData.validAttributes,
    currency: hasPriceCurrency(product.defaultPrice)
      ? product.defaultPrice.currency
      : finalPrices[0]?.currency,
    customSize: product.customSize ?? false,
    dynamicPricing: product.dynamicPricing,
    dynamicPricingPresets: [],
    pageCount: getPersistedPageCountValue(product.pageCount),
    priceType: product.priceType || PriceTypeEnum.SINGLE,
    prices: finalPrices,
    spec: product.spec,
    volumes: duplicateVolumes,
  });

  const values: CreateInput = {
    name: product.name ?? "",
    description: product.description ?? "",
    prices: finalPrices,
    defaultPrice: resolveProductFormListingPrice(
      product.defaultPrice,
      calculatedPrices.defaultPrice,
    ),
    lowPrice: resolveProductFormListingPrice(
      product.lowPrice,
      calculatedPrices.lowPrice,
    ),
    highPrice: resolveProductFormListingPrice(
      product.highPrice,
      calculatedPrices.highPrice,
    ),
    volumes: duplicateVolumes,
    attributes: cleanedAttributeData.validAttributes,
    attributeOptions: cleanedAttributeData.validAttributeOptions,
    attributeDependencies: isMatrixLikePriceType(product.priceType)
      ? product.attributeDependencies || {}
      : {},
    customSize: product.customSize ?? false,
    customSizes: product.customSizes ?? [],
    allowCustomPrice: product.allowCustomPrice ?? false,
    recommended: product.recommended ?? false,
    difficulty: product.difficulty ?? 5,
    shipping: {
      types:
        product.shipping?.types && product.shipping.types.length > 0
          ? product.shipping.types
          : [],
    },
    spec: {
      images: [],
      defaultOrder: product.spec.defaultOrder ?? 1,
      maximumOrder: product.spec.maximumOrder ?? 100,
      minimumOrder: product.spec.minimumOrder ?? 1,
      step: product.spec.step ?? 1,
      minimumWidth: product.spec.minimumWidth ?? 100,
      maximumWidth: product.spec.maximumWidth ?? 1000,
      widthStep: product.spec.widthStep ?? 1,
      minimumHeight: product.spec.minimumHeight ?? 100,
      maximumHeight: product.spec.maximumHeight ?? 1000,
      heightStep: product.spec.heightStep ?? 1,
      validateRatio: product.spec.validateRatio ?? false,
      minimumRatio: product.spec.minimumRatio ?? 0.2,
      maximumRatio: product.spec.maximumRatio ?? 5,
    },
    designSpec: product.designSpec
      ? product.designSpec
      : {
          dpi: 300,
          bleed: 4,
          includeBleed: false,
        },
    pageCount: getFormPageCountValue(product.pageCount),
    dynamicPricing: product.dynamicPricing,
    priceOffsets: product.priceOffsets ?? createDefaultPriceOffsetsConfig(),
    seo: {
      slug: product.seo?.slug || "",
      title: product.seo?.title || "",
      description: product.seo?.description || "",
    },
    productType: hasProductTypeSelection(product.productType)
      ? product.productType
      : null,
    priceType: product.priceType ?? PriceTypeEnum.SINGLE,
    prefferedUnit: product.prefferedUnit ?? Unit.PCS,
    category: product.category ?? {
      id: "",
      name: "",
    },
    availability: product.availability ?? {
      published: false,
      publicationString: "",
      availableForPurchase: false,
      expirationString: "",
    },
    createdBy: {
      id: "",
      name: "",
    },
    active: product.active ?? true,
    channelId: product.channelId ?? "",
    specialNotes: product.specialNotes ?? "", // P63a6
  };
  return values;
};
