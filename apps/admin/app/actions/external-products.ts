"use server";

import {
  buildConnectedProductImportUpdate,
  type ConnectedProductImportApplyDraft,
  type ConnectedProductImportTarget,
  groupProductPrices,
} from "@/lib/external-products/product-sync";
import {
  buildProductPageCountPriceBatchData,
  buildProductPageCountSegmentBasePriceBatchData,
  buildProductPageCountSegmentStepPriceBatchData,
} from "@/lib/product-price-sync";
import { enrichExtractedExternalAttributes } from "@/lib/external-products/extracted-attribute-enrichment";
import {
  findExternalAttributeByKey,
  getExternalAttributeKey,
} from "@/lib/external-products/external-attribute-key";
import { buildImportedProductSpec } from "@/lib/external-products/imported-product-spec";
import {
  buildProductAttributeDependenciesFromExternalPricing,
  collectMappedAttributeOptions,
  collectImpossibleDependentAttributeIds,
  sortAttributeIdsByDependencies,
} from "@/lib/external-products/product-attribute-dependencies";
import { filterProductAttributeMappings } from "@/lib/external-products/product-attribute-mapping-filters";
import {
  buildExternalPageCountConstraintsFromSourceRows,
  buildExternalDynamicPricingSourceRows,
  generateExternalProductDynamicPricingConfig,
} from "@/lib/external-products/external-product-dynamic-pricing-agent";
import { generatePricingExclusionRulesFromDescription } from "@/lib/external-products/pricing-exclusion-rule-assistant";
import { normalizeExtractedExternalPriceInfo } from "@/lib/external-products/normalize-extracted-price-info";
import { createImportedMatrixCombinationResolver } from "@/lib/external-products/imported-price-combination-resolver";
import { buildImportedMatrixRangeFallbackPrices } from "@/lib/external-products/imported-matrix-fallback";
import {
  buildRangedDimensionMatrixPrices,
  getRangedDimensionAttributeNames,
  inferExternalRangedDimensions,
} from "@/lib/external-products/ranged-dimensions";
import { normalizeExternalDeliveryTime } from "@/lib/external-products/delivery-time";
import { fetchExternalProviderUrl } from "@/lib/external-products/provider-url-policy";
import {
  checkExternalProductPriceChangesSystem as checkExternalProductPriceChangesSystemShared,
  fetchExternalProductPricesSystem as fetchExternalProductPricesSystemShared,
  stageExternalProductPricesForReviewSystem as stageExternalProductPricesForReviewSystemShared,
} from "@/lib/external-products/price-fetch-system";
import {
  movePendingToApplied,
  readPriceConfigurations,
} from "@/lib/external-products/price-configuration-storage";
import { getVertexThinkingProviderOptions } from "@/lib/ai/server-vertex";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
} from "@/lib/ai/usage-metering";
import type {
  AIAttributeMappingResult,
  AISuggestedAttributeMapping,
} from "@/lib/external-products/ai-mapping-types";
import {
  normalizeAiSuggestedAttributeMappings,
  normalizeAttributeMappings,
} from "@/lib/external-products/attribute-mapping-normalization";
import { getDuplicateInternalAttributeMappings } from "@/lib/external-products/attribute-mapping-validation";
import {
  getExpectedPricingConfigurationCount,
  getProviderOnlyPricingSelections,
} from "@/lib/external-products/provider-pricing";
import {
  ApiResponseSchema,
  Attribute,
  AttributeMapping,
  type CurrencyCode,
  CurrencyEnum,
  ExternalAttribute,
  ExternalImportConnection,
  ExternalPriceConfiguration,
  ExternalProduct,
  ExternalProductPricingExclusionRule,
  ExternalProvider,
  ExternalProviderEndpoint,
  FetchExternalProductRequest,
  FetchExternalProductResponse,
  ImportExternalProductRequest,
  ImportExternalProductResponse,
  ImportWarning,
  Price,
  PriceTypeEnum,
  Product,
  ProductPageCountPrice,
  ProductPrice,
  SaveExternalProviderRequest,
  SaveExternalProviderResponse,
} from "@konfi/types";
import {
  DEFAULT_PAGE_COUNT_COVER_PAGES,
  calculateDynamicListingPrices,
  getCombinations,
  getPageCountPricingMode,
  normalizeCurrencyCode,
  PAGE_COUNT_DIVISOR,
  updateCalculatedPrices,
} from "@konfi/utils";
import { generateText as aiGenerateText, tool } from "ai";
import crypto from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import { start } from "workflow/api";
import { z } from "zod";
import { checkAdmin, revalidateTagCache } from "@/actions";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import {
  getTenantAdminScopeTenantId,
  requireTenantPermission,
} from "@/actions/auth-utils";
import {
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@/lib/saas-runtime-quotas";
import {
  getDb,
  getAuthenticatedAdminMember,
  replaceProductPriceSubcollection,
  readProductPriceSubcollection,
  serializeFirestoreDeep,
  getVertexModel,
  getVertexHighPrecisionModel,
  removeUndefinedDeep,
} from "@/lib/external-products/external-products-firestore-helpers";
import { scheduleExternalProductChangeLog } from "@/lib/external-products/external-products-change-log";
import {
  getCurrentAdminLanguage,
  selectLocalizedTitle,
  normalizeOptionalString,
  toMinorUnits,
  getResolvedImportedDeliveryTime,
} from "@/lib/external-products/external-products-text-helpers";
import {
  type InternalAttributeForMapping,
  getInternalAttributesCached,
  formatDuplicateInternalAttributeMappings,
  buildExternalAttributeMappingPromptData,
  buildInternalAttributeMappingPromptData,
  ATTRIBUTE_MAPPING_RULES,
  type ExtractedAttributeCandidate,
  getAllExtractedAttributeIssues,
  toExtractedAttributeCandidates,
} from "@/lib/external-products/external-products-attribute-helpers";
import {
  generateContentHash,
  isRecord,
  extractStringId,
  buildRequestHeadersFromProvider,
  normalizeExternalProductPriceInfo,
  toExternalProductListItem,
} from "@/lib/external-products/external-products-misc-helpers";

const generateText: typeof aiGenerateText = (async (
  options: Parameters<typeof aiGenerateText>[0],
) => {
  const [tenantContext, member] = await Promise.all([
    getTenantContextForRequest(),
    getAuthenticatedAdminMember(),
  ]);

  return runMeteredAiText({
    estimatedTotalTokens: estimateAiUsageTextTokens(options),
    metering: {
      context: tenantContext,
      firestore: getDb(),
      provider: "google-vertex",
      source: "external-import",
      userId: member.id,
    },
    run: () => aiGenerateText(options),
  });
}) as typeof aiGenerateText;

const EXTERNAL_PROVIDERS_TAG = "external-providers";
const EXTERNAL_PRODUCTS_TAG = "external-products";

async function assertExternalProviderImportEnabled(operation: string) {
  await assertSaasRuntimeModuleEnabled({
    context: await getTenantContextForRequest(),
    firestore: getDb(),
    module: "externalProviderImport",
    operation,
  });
}

async function getRequestTenantScopeId(): Promise<string | undefined> {
  return getTenantAdminScopeTenantId(await getTenantContextForRequest());
}

function tenantOwnedDataMatches(
  data: { tenantId?: string | null } | undefined,
  tenantId?: string,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

async function assertExternalProductCreationAllowed(operation: string) {
  await assertSaasRuntimeQuota({
    context: await getTenantContextForRequest(),
    firestore: getDb(),
    operation,
    resource: "products",
  });
}

async function recordExternalProductCreated(operation: string) {
  await recordSaasRuntimeQuotaUsage({
    context: await getTenantContextForRequest(),
    firestore: getDb(),
    operation,
    resource: "products",
  });
}

type ParsedProviderInput = {
  name: string;
  logoUrl?: string;
  baseUrl?: string;
  allProductsEndpoint?: string;
  productEndpoint?: string;
  attributeAvailabilityEndpoint?: string;
  sampleProductId?: string;
  description?: string;
  endpoints?: Array<{
    name: string;
    url: string;
    sampleUrl?: string;
    description?: string;
  }>;
};

type ParsedProviderEndpoint = NonNullable<
  ParsedProviderInput["endpoints"]
>[number];

type ProviderCatalogItem = {
  id: string;
  name: string;
  imageUrl?: string;
  url?: string;
  hidden?: boolean;
};

type NormalizedPriceRange = {
  deliveryTime?: number;
  quantity: number;
  price: number;
};

type NormalizedPriceConfiguration = {
  configuration: Record<string, string>;
  priceRanges: NormalizedPriceRange[];
  currency?: string;
  sourceUrl?: string;
};

function normalizePriceRanges(
  priceInfo?: ExternalProduct["priceInfo"],
): NormalizedPriceRange[] {
  if (!priceInfo?.priceRanges?.length) return [];

  const normalizedRanges = priceInfo.priceRanges.flatMap((range) => {
    if (
      typeof range.quantity !== "number" ||
      !Number.isFinite(range.quantity) ||
      typeof range.price !== "number" ||
      !Number.isFinite(range.price)
    ) {
      return [];
    }

    return [
      {
        deliveryTime: normalizeExternalDeliveryTime(range.deliveryTime),
        quantity: range.quantity,
        price: toMinorUnits(range.price),
      },
    ] satisfies NormalizedPriceRange[];
  });

  return normalizedRanges.toSorted((a, b) => a.quantity - b.quantity);
}

function resolveImportedCurrency(
  priceInfo: ExternalProduct["priceInfo"] | undefined,
  warnings: ImportWarning[],
): CurrencyCode {
  const rawCurrency = priceInfo?.currency;
  const normalizedCurrency = normalizeCurrencyCode(rawCurrency);

  if (rawCurrency && !normalizedCurrency) {
    warnings.push({
      key: "unsupportedCurrency",
      params: { currency: rawCurrency },
    });
  }

  return normalizedCurrency ?? CurrencyEnum.PLN;
}

function normalizePriceConfigurations(
  configurations?: ExternalPriceConfiguration[],
): NormalizedPriceConfiguration[] {
  if (!configurations?.length) return [];

  const normalized = configurations
    .map((configuration: ExternalPriceConfiguration) => ({
      configuration: configuration.configuration,
      priceRanges: normalizePriceRanges(configuration.priceInfo),
      currency: configuration.priceInfo.currency,
      sourceUrl: configuration.sourceUrl,
    }))
    .filter(
      (item: NormalizedPriceConfiguration) => item.priceRanges.length > 0,
    );

  return normalized;
}

const PAGE_COUNT_ATTRIBUTE_PATTERN =
  /(page(?:s|number|count)?|liczba[\s_-]*stron|ilosc[\s_-]*stron|strony?)/i;
const PAGE_COUNT_BREAKDOWN_PATTERN = /^\s*(\d+)\s*\+\s*(\d+)\s*$/;
const INTEGER_ONLY_PATTERN = /^\s*(\d+)\s*$/;

type CompactPageCountConfigurationsResult = {
  baseConfigurations: NormalizedPriceConfiguration[];
  pageCount: NonNullable<Product["pageCount"]>;
  stepConfigurations: NormalizedPriceConfiguration[];
};

type PageCountCurvePoint = {
  deliveryTime?: number;
  pageCount: number;
  price: number;
};

type GroupedPageCountConfiguration = {
  configuration: Record<string, string>;
  currency?: string;
  pricePointsByQuantity: Map<
    number,
    Map<
      number,
      {
        deliveryTime?: number;
        price: number;
      }
    >
  >;
  sourceUrl?: string;
};

type PreparedPageCountConfigurationGroups = {
  groupedConfigurations: GroupedPageCountConfiguration[];
  passthroughConfigurations: NormalizedPriceConfiguration[];
  sortedPageCountValues: number[];
};

type SegmentedPageCountConfigurationSet = {
  baseConfigurations: NormalizedPriceConfiguration[];
  maximum: number;
  minimum: number;
  stepConfigurations: NormalizedPriceConfiguration[];
};

type SegmentedPageCountConfigurationsResult = {
  pageCount: NonNullable<Product["pageCount"]>;
  segmentConfigurationSets: SegmentedPageCountConfigurationSet[];
  segments: Array<{
    maximum: number;
    minimum: number;
  }>;
};

const PAGE_COUNT_SEGMENT_ABSOLUTE_TOLERANCE_MINOR_UNITS = 50;
const PAGE_COUNT_SEGMENT_RELATIVE_TOLERANCE_RATIO = 0.01;

function collectConfiguredPageCountValues(options: {
  configurations: NormalizedPriceConfiguration[];
  pageCountAttributeName: string;
}): number[] | null {
  const { configurations, pageCountAttributeName } = options;
  const values = new Set<number>();

  for (const configuration of configurations) {
    const rawPageCountValue =
      configuration.configuration[pageCountAttributeName];

    if (!rawPageCountValue) {
      continue;
    }

    const parsedPageCount = parseExternalPageCountValue(rawPageCountValue);

    if (!parsedPageCount || parsedPageCount % PAGE_COUNT_DIVISOR !== 0) {
      return null;
    }

    values.add(parsedPageCount);
  }

  return Array.from(values).toSorted((left, right) => left - right);
}

function stripPageCountPricingTables(
  pageCount?: Product["pageCount"],
): Product["pageCount"] | undefined {
  if (!pageCount) {
    return undefined;
  }

  const { pricing, ...rest } = pageCount;

  return {
    ...rest,
    pricing: pricing ? { mode: getPageCountPricingMode(pricing) } : undefined,
  };
}

function parseExternalPageCountValue(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const directMatch = value.match(INTEGER_ONLY_PATTERN);

  if (directMatch) {
    return Number.parseInt(directMatch[1], 10);
  }

  const breakdownMatch = value.match(PAGE_COUNT_BREAKDOWN_PATTERN);

  if (breakdownMatch) {
    return Number.parseInt(breakdownMatch[1], 10);
  }

  return undefined;
}

function getPageCountBreakdownValues(attribute: ExternalAttribute): {
  coverPages: number[];
  pageCounts: number[];
} {
  const pageCounts = new Set<number>();
  const coverPages = new Set<number>();
  const candidates = [
    ...attribute.values,
    ...(attribute.options ?? []).flatMap((option) =>
      [option.value, option.label].filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];

  for (const candidate of candidates) {
    const breakdownMatch = candidate.match(PAGE_COUNT_BREAKDOWN_PATTERN);

    if (breakdownMatch) {
      pageCounts.add(Number.parseInt(breakdownMatch[1], 10));
      coverPages.add(Number.parseInt(breakdownMatch[2], 10));
      continue;
    }

    const directValue = parseExternalPageCountValue(candidate);

    if (directValue !== undefined) {
      pageCounts.add(directValue);
    }
  }

  return {
    coverPages: Array.from(coverPages).toSorted((left, right) => left - right),
    pageCounts: Array.from(pageCounts).toSorted((left, right) => left - right),
  };
}

function getStepFromPageCountValues(values: number[]): number | undefined {
  if (values.length < 2) {
    return undefined;
  }

  const uniqueSortedValues = [...new Set(values)].toSorted(
    (left, right) => left - right,
  );
  const deltas = uniqueSortedValues
    .slice(1)
    .map((value, index) => value - uniqueSortedValues[index])
    .filter((delta) => Number.isFinite(delta) && delta > 0);

  if (deltas.length === 0) {
    return undefined;
  }

  const greatestCommonDivisor = (left: number, right: number): number => {
    let a = Math.abs(left);
    let b = Math.abs(right);

    while (b !== 0) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }

    return a;
  };

  return deltas.reduce((current, delta) =>
    greatestCommonDivisor(current, delta),
  );
}

function preparePageCountConfigurationGroups(options: {
  configurations: NormalizedPriceConfiguration[];
  pageCountAttributeName: string;
}): PreparedPageCountConfigurationGroups | null {
  const { configurations, pageCountAttributeName } = options;
  const groupedConfigurations = new Map<
    string,
    GroupedPageCountConfiguration
  >();
  const passthroughConfigurations: NormalizedPriceConfiguration[] = [];
  const allPageCountValues = new Set<number>();

  for (const configuration of configurations) {
    const rawPageCountValue =
      configuration.configuration[pageCountAttributeName];

    if (!rawPageCountValue) {
      passthroughConfigurations.push(configuration);
      continue;
    }

    const parsedPageCount = parseExternalPageCountValue(rawPageCountValue);

    if (!parsedPageCount || parsedPageCount % PAGE_COUNT_DIVISOR !== 0) {
      return null;
    }

    allPageCountValues.add(parsedPageCount);

    const strippedConfiguration = Object.fromEntries(
      Object.entries(configuration.configuration)
        .filter(([attributeName]) => attributeName !== pageCountAttributeName)
        .toSorted(([left], [right]) => left.localeCompare(right)),
    );
    const key = JSON.stringify(strippedConfiguration);
    const existingGroup = groupedConfigurations.get(key) ?? {
      configuration: strippedConfiguration,
      currency: configuration.currency,
      pricePointsByQuantity: new Map<
        number,
        Map<number, { deliveryTime?: number; price: number }>
      >(),
      sourceUrl: configuration.sourceUrl,
    };

    for (const range of configuration.priceRanges) {
      const existingPoints =
        existingGroup.pricePointsByQuantity.get(range.quantity) ??
        new Map<number, { deliveryTime?: number; price: number }>();
      const existingPoint = existingPoints.get(parsedPageCount);
      const existingPrice = existingPoint?.price;

      if (existingPrice !== undefined && existingPrice !== range.price) {
        return null;
      }

      existingPoints.set(parsedPageCount, {
        deliveryTime:
          typeof existingPoint?.deliveryTime === "number" &&
          typeof range.deliveryTime === "number"
            ? Math.max(existingPoint.deliveryTime, range.deliveryTime)
            : (range.deliveryTime ?? existingPoint?.deliveryTime),
        price: range.price,
      });
      existingGroup.pricePointsByQuantity.set(range.quantity, existingPoints);
    }

    groupedConfigurations.set(key, existingGroup);
  }

  const sortedPageCountValues = Array.from(allPageCountValues).toSorted(
    (left, right) => left - right,
  );

  if (sortedPageCountValues.length === 0) {
    return null;
  }

  return {
    groupedConfigurations: Array.from(groupedConfigurations.values()),
    passthroughConfigurations,
    sortedPageCountValues,
  };
}

function getSortedCurvePoints(
  pointsByPageCount: Map<number, { deliveryTime?: number; price: number }>,
  pageCountValues: number[],
): PageCountCurvePoint[] | null {
  const sortedPoints: PageCountCurvePoint[] = [];

  for (const pageCount of pageCountValues) {
    const point = pointsByPageCount.get(pageCount);

    if (!point) {
      return null;
    }

    sortedPoints.push({
      deliveryTime: point.deliveryTime,
      pageCount,
      price: point.price,
    });
  }

  return sortedPoints;
}

function getMaximumCurveDeliveryTime(
  points: PageCountCurvePoint[],
): number | undefined {
  const deliveryTimes = points
    .map((point) => normalizeExternalDeliveryTime(point.deliveryTime))
    .filter((value): value is number => typeof value === "number");

  return deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : undefined;
}

function getExactLinearPerStepPrice(
  points: PageCountCurvePoint[],
  step: number,
): number | null {
  if (points.length <= 1) {
    return 0;
  }

  const basePoint = points[0];
  let perStepSurcharge: number | undefined;

  for (const point of points) {
    const delta = point.pageCount - basePoint.pageCount;

    if (delta < 0 || delta % step !== 0) {
      return null;
    }

    if (delta === 0) {
      continue;
    }

    const stepCount = delta / step;
    const surcharge = point.price - basePoint.price;

    if (
      surcharge < 0 ||
      !Number.isFinite(surcharge) ||
      surcharge % stepCount !== 0
    ) {
      return null;
    }

    const candidatePerStepSurcharge = surcharge / stepCount;

    if (
      perStepSurcharge !== undefined &&
      perStepSurcharge !== candidatePerStepSurcharge
    ) {
      return null;
    }

    perStepSurcharge = candidatePerStepSurcharge;
  }

  return perStepSurcharge ?? 0;
}

function getApproximateSegmentPerStepPrice(
  points: PageCountCurvePoint[],
  step: number,
): number | null {
  if (points.length <= 1) {
    return 0;
  }

  const basePoint = points[0];
  const lastPoint = points[points.length - 1];
  const totalDelta = lastPoint.pageCount - basePoint.pageCount;

  if (totalDelta <= 0 || totalDelta % step !== 0) {
    return null;
  }

  const totalSteps = totalDelta / step;
  const candidatePerStepSurcharge = Math.round(
    (lastPoint.price - basePoint.price) / totalSteps,
  );

  if (
    !Number.isFinite(candidatePerStepSurcharge) ||
    candidatePerStepSurcharge < 0
  ) {
    return null;
  }

  for (const point of points) {
    const delta = point.pageCount - basePoint.pageCount;

    if (delta < 0 || delta % step !== 0) {
      return null;
    }

    const stepCount = delta / step;
    const predictedPrice =
      basePoint.price + candidatePerStepSurcharge * stepCount;
    const allowedDifference = Math.max(
      PAGE_COUNT_SEGMENT_ABSOLUTE_TOLERANCE_MINOR_UNITS,
      Math.round(point.price * PAGE_COUNT_SEGMENT_RELATIVE_TOLERANCE_RATIO),
    );

    if (Math.abs(predictedPrice - point.price) > allowedDifference) {
      return null;
    }
  }

  return candidatePerStepSurcharge;
}

function inferExternalProductPageCount(
  attributes?: ExternalAttribute[],
  externalAttributeName?: string,
): {
  attributeName: string;
  pageCount: NonNullable<Product["pageCount"]>;
} | null {
  for (const attribute of attributes ?? []) {
    const attributeName = getExternalAttributeKey(attribute);
    const isManuallyMarkedPageCount =
      externalAttributeName === attributeName ||
      externalAttributeName === attribute.name;
    const attributeTokens = [attribute.id, attribute.name, attribute.category]
      .filter(
        (token): token is string =>
          typeof token === "string" && token.trim().length > 0,
      )
      .join(" ");
    const { coverPages, pageCounts } = getPageCountBreakdownValues(attribute);
    const hasBreakdownValues = coverPages.length > 0;
    const looksLikePageCount =
      PAGE_COUNT_ATTRIBUTE_PATTERN.test(attributeTokens) || hasBreakdownValues;

    if (!isManuallyMarkedPageCount && !looksLikePageCount) {
      continue;
    }

    const minimum =
      attribute.numberConfig?.minimum ??
      (pageCounts.length > 0 ? pageCounts[0] : undefined);
    const maximum =
      attribute.numberConfig?.maximum ??
      (pageCounts.length > 0 ? pageCounts[pageCounts.length - 1] : undefined);
    const step =
      attribute.numberConfig?.step ?? getStepFromPageCountValues(pageCounts);
    const coverPagesValue =
      coverPages.length === 1 ? coverPages[0] : DEFAULT_PAGE_COUNT_COVER_PAGES;

    if (
      !minimum ||
      !maximum ||
      !step ||
      minimum > maximum ||
      minimum % PAGE_COUNT_DIVISOR !== 0 ||
      maximum % PAGE_COUNT_DIVISOR !== 0 ||
      step % PAGE_COUNT_DIVISOR !== 0 ||
      coverPagesValue % PAGE_COUNT_DIVISOR !== 0
    ) {
      continue;
    }

    return {
      attributeName,
      pageCount: {
        enabled: true,
        minimum,
        maximum,
        step,
        coverPages: coverPagesValue,
        externalAttributeName: attributeName,
        placement: {
          afterAttributeId: null,
        },
      },
    };
  }

  return null;
}

function compactPriceConfigurationsByPageCount(options: {
  configurations: NormalizedPriceConfiguration[];
  pageCount: NonNullable<Product["pageCount"]>;
  pageCountAttributeName: string;
}): CompactPageCountConfigurationsResult | null {
  const { configurations, pageCount, pageCountAttributeName } = options;
  if (!pageCount?.enabled) {
    return null;
  }
  const preparedGroups = preparePageCountConfigurationGroups({
    configurations,
    pageCountAttributeName,
  });

  if (!preparedGroups) {
    return null;
  }

  const {
    groupedConfigurations,
    passthroughConfigurations,
    sortedPageCountValues,
  } = preparedGroups;
  const minimumPageCount = sortedPageCountValues[0];
  const maximumPageCount =
    sortedPageCountValues[sortedPageCountValues.length - 1];
  const baseConfigurations: NormalizedPriceConfiguration[] = [
    ...passthroughConfigurations,
  ];
  const stepConfigurations: NormalizedPriceConfiguration[] = [];

  for (const group of groupedConfigurations.values()) {
    const basePriceRanges: NormalizedPriceRange[] = [];
    const stepPriceRanges: NormalizedPriceRange[] = [];

    for (const [quantity, points] of Array.from(
      group.pricePointsByQuantity.entries(),
    ).toSorted(([left], [right]) => left - right)) {
      const sortedPoints = getSortedCurvePoints(points, sortedPageCountValues);

      if (!sortedPoints) {
        return null;
      }

      const basePoint = sortedPoints[0];
      const perStepSurcharge = getExactLinearPerStepPrice(
        sortedPoints,
        pageCount.step,
      );
      const deliveryTime = getMaximumCurveDeliveryTime(sortedPoints);

      if (perStepSurcharge === null) {
        return null;
      }

      basePriceRanges.push({
        deliveryTime,
        quantity,
        price: basePoint.price,
      });

      if (
        perStepSurcharge !== undefined &&
        Number.isFinite(perStepSurcharge) &&
        perStepSurcharge > 0
      ) {
        stepPriceRanges.push({
          deliveryTime,
          quantity,
          price: perStepSurcharge,
        });
      }
    }

    baseConfigurations.push({
      configuration: group.configuration,
      priceRanges: basePriceRanges,
      currency: group.currency,
      sourceUrl: group.sourceUrl,
    });

    if (stepPriceRanges.length > 0) {
      stepConfigurations.push({
        configuration: group.configuration,
        priceRanges: stepPriceRanges,
        currency: group.currency,
        sourceUrl: group.sourceUrl,
      });
    }
  }

  return {
    baseConfigurations,
    pageCount: {
      ...pageCount,
      maximum: maximumPageCount,
      minimum: minimumPageCount,
    },
    stepConfigurations,
  };
}

function segmentPriceConfigurationsByPageCount(options: {
  configurations: NormalizedPriceConfiguration[];
  pageCount: NonNullable<Product["pageCount"]>;
  pageCountAttributeName: string;
}): SegmentedPageCountConfigurationsResult | null {
  const { configurations, pageCount, pageCountAttributeName } = options;

  if (!pageCount?.enabled) {
    return null;
  }

  const preparedGroups = preparePageCountConfigurationGroups({
    configurations,
    pageCountAttributeName,
  });

  if (!preparedGroups) {
    return null;
  }

  const {
    groupedConfigurations,
    passthroughConfigurations,
    sortedPageCountValues,
  } = preparedGroups;

  const segmentIndexes: Array<{ start: number; end: number }> = [];
  let startIndex = 0;

  while (startIndex < sortedPageCountValues.length) {
    let endIndex = startIndex;

    while (endIndex + 1 < sortedPageCountValues.length) {
      const nextEndIndex = endIndex + 1;
      const segmentPageCounts = sortedPageCountValues.slice(
        startIndex,
        nextEndIndex + 1,
      );
      const canExtend = groupedConfigurations.every((group) =>
        Array.from(group.pricePointsByQuantity.values()).every((points) => {
          const sortedPoints = getSortedCurvePoints(points, segmentPageCounts);

          if (!sortedPoints) {
            return false;
          }

          return (
            getApproximateSegmentPerStepPrice(sortedPoints, pageCount.step) !==
            null
          );
        }),
      );

      if (!canExtend) {
        break;
      }

      endIndex = nextEndIndex;
    }

    segmentIndexes.push({
      end: endIndex,
      start: startIndex,
    });
    startIndex = endIndex + 1;
  }

  const segmentConfigurationSetsWithNulls = segmentIndexes.map(
    ({ end, start }) => {
      const segmentPageCounts = sortedPageCountValues.slice(start, end + 1);
      const minimum = segmentPageCounts[0];
      const maximum = segmentPageCounts[segmentPageCounts.length - 1];
      const baseConfigurations: NormalizedPriceConfiguration[] = [
        ...passthroughConfigurations,
      ];
      const stepConfigurations: NormalizedPriceConfiguration[] = [];

      for (const group of groupedConfigurations) {
        const basePriceRanges: NormalizedPriceRange[] = [];
        const stepPriceRanges: NormalizedPriceRange[] = [];

        for (const [quantity, points] of Array.from(
          group.pricePointsByQuantity.entries(),
        ).toSorted(([left], [right]) => left - right)) {
          const sortedPoints = getSortedCurvePoints(points, segmentPageCounts);

          if (!sortedPoints) {
            return null;
          }

          const basePoint = sortedPoints[0];
          const perStepSurcharge = getApproximateSegmentPerStepPrice(
            sortedPoints,
            pageCount.step,
          );
          const deliveryTime = getMaximumCurveDeliveryTime(sortedPoints);

          if (perStepSurcharge === null) {
            return null;
          }

          basePriceRanges.push({
            deliveryTime,
            quantity,
            price: basePoint.price,
          });

          if (perStepSurcharge > 0) {
            stepPriceRanges.push({
              deliveryTime,
              quantity,
              price: perStepSurcharge,
            });
          }
        }

        baseConfigurations.push({
          configuration: group.configuration,
          priceRanges: basePriceRanges,
          currency: group.currency,
          sourceUrl: group.sourceUrl,
        });

        if (stepPriceRanges.length > 0) {
          stepConfigurations.push({
            configuration: group.configuration,
            priceRanges: stepPriceRanges,
            currency: group.currency,
            sourceUrl: group.sourceUrl,
          });
        }
      }

      return {
        baseConfigurations,
        maximum,
        minimum,
        stepConfigurations,
      };
    },
  );

  if (segmentConfigurationSetsWithNulls.some((segment) => segment === null)) {
    return null;
  }

  const segmentConfigurationSets = segmentConfigurationSetsWithNulls.filter(
    (segment): segment is SegmentedPageCountConfigurationSet =>
      segment !== null,
  );

  return {
    pageCount: {
      ...pageCount,
      maximum: sortedPageCountValues[sortedPageCountValues.length - 1],
      minimum: sortedPageCountValues[0],
    },
    segmentConfigurationSets,
    segments: segmentConfigurationSets.map(({ maximum, minimum }) => ({
      maximum,
      minimum,
    })),
  };
}

function resolveUrlWithProductId(
  url: string,
  productId?: string,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!ANY_PLACEHOLDER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!productId) {
    return null;
  }

  const { resolvedUrl, hasUnresolved } = replaceProductIdPlaceholders(
    trimmed,
    productId,
  );

  return hasUnresolved ? null : resolvedUrl;
}

function mergeProviderEndpoints(
  parsed?: ParsedProviderInput["endpoints"],
  provided?: ExternalProviderEndpoint[],
): ExternalProviderEndpoint[] | undefined {
  if (!parsed?.length && !provided?.length) {
    return undefined;
  }

  const merged: ExternalProviderEndpoint[] = [];
  const seen = new Set<string>();

  const pushEndpoint = (
    endpoint: ExternalProviderEndpoint | ParsedProviderEndpoint | undefined,
  ) => {
    if (!endpoint) {
      return;
    }
    const key = normalizeEndpointKey(endpoint.url);
    if (seen.has(key)) {
      return;
    }
    merged.push({
      id: "id" in endpoint ? endpoint.id : createEndpointId(),
      name: endpoint.name,
      url: endpoint.url,
      sampleUrl: endpoint.sampleUrl,
      description: endpoint.description,
    });
    seen.add(key);
  };

  for (const endpoint of parsed ?? []) {
    pushEndpoint(endpoint);
  }

  for (const endpoint of provided ?? []) {
    pushEndpoint(endpoint);
  }

  return merged.length > 0 ? merged : undefined;
}

async function parseProviderInput(
  input: string,
): Promise<ParsedProviderInput | null> {
  const model = await getVertexModel();

  const parseTool = tool({
    description:
      "Parse free-form provider details into structured endpoints and metadata",
    inputSchema: z.object({
      name: z.string().describe("Provider name"),
      logoUrl: z.string().optional().describe("Provider logo URL"),
      baseUrl: z.string().optional().describe("Base API URL"),
      allProductsEndpoint: z
        .string()
        .optional()
        .describe("Endpoint that lists all products"),
      productEndpoint: z
        .string()
        .optional()
        .describe("Endpoint template for a single product"),
      attributeAvailabilityEndpoint: z
        .string()
        .optional()
        .describe("Endpoint that returns attribute options/specs"),
      sampleProductId: z
        .string()
        .optional()
        .describe("Example product ID for {productId} placeholders"),
      description: z
        .string()
        .optional()
        .describe("General provider notes or description"),
      endpoints: z
        .array(
          z.object({
            name: z.string().describe("Endpoint name"),
            url: z.string().describe("Endpoint URL"),
            sampleUrl: z
              .string()
              .optional()
              .describe("Optional concrete sample URL"),
            description: z
              .string()
              .optional()
              .describe("What this endpoint returns"),
          }),
        )
        .optional()
        .describe("Additional provider endpoints"),
    }),
    execute: async (data) => data,
  });

  const prompt = `You are extracting provider configuration from free-form input.

Rules:
- The first clear brand/company line is the provider name.
- Lines with http(s) are URLs.
- Prefer the URL ending with /products (or listing) as allProductsEndpoint.
- Prefer URLs containing /product/{productId} as productEndpoint.
- Prefer URLs containing /spec/ or /attributes as attributeAvailabilityEndpoint.
- Lines after a section header like "Configuration" should be added as custom endpoints.
- A standalone product id (e.g. prod_*) should be sampleProductId.
- If a line describes the previous URL, store it as description.

Input:
${input}

Call the parse tool with the structured result.`;

  try {
    const { toolCalls } = await generateText({
      model,
      prompt,
      tools: { parseProvider: parseTool },
      temperature: 0.1,
    });

    if (toolCalls.length === 0) {
      return null;
    }

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "parseProvider",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    return toolCall.input as ParsedProviderInput;
  } catch (error) {
    console.error("Error parsing provider input:", error);
    return null;
  }
}

function mergeProviderInput(
  provider: SaveExternalProviderRequest["provider"],
  parsed?: ParsedProviderInput | null,
): SaveExternalProviderRequest["provider"] {
  if (!parsed) {
    return provider;
  }

  const mergedName = normalizeOptionalString(provider.name) ?? parsed.name;

  return {
    ...provider,
    name: mergedName,
    baseUrl: normalizeOptionalString(provider.baseUrl) ?? parsed.baseUrl,
    allProductsEndpoint:
      normalizeOptionalString(provider.allProductsEndpoint) ??
      parsed.allProductsEndpoint,
    productEndpoint:
      normalizeOptionalString(provider.productEndpoint) ??
      parsed.productEndpoint,
    attributeAvailabilityEndpoint:
      normalizeOptionalString(provider.attributeAvailabilityEndpoint) ??
      parsed.attributeAvailabilityEndpoint,
    sampleProductId:
      normalizeOptionalString(provider.sampleProductId) ??
      parsed.sampleProductId,
    logoUrl: normalizeOptionalString(provider.logoUrl) ?? parsed.logoUrl,
    description:
      normalizeOptionalString(provider.description) ?? parsed.description,
    endpoints: mergeProviderEndpoints(parsed.endpoints, provider.endpoints),
  };
}

function extractProductListFromResponse(
  data: unknown,
  limit: number,
): ProviderCatalogItem[] | null {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.products)
      ? data.products
      : null;

  if (!list) {
    return null;
  }

  const products: ProviderCatalogItem[] = [];

  for (const item of list) {
    if (!isRecord(item)) {
      continue;
    }
    const id = extractStringId(item.id);
    const name = typeof item.name === "string" ? item.name : undefined;
    if (!id || !name) {
      continue;
    }

    const imageUrl =
      typeof item.image === "string"
        ? item.image
        : typeof item.imageUrl === "string"
          ? item.imageUrl
          : undefined;

    const hidden = typeof item.hidden === "boolean" ? item.hidden : undefined;

    products.push({
      id,
      name,
      imageUrl,
      hidden,
    });

    if (products.length >= limit) {
      break;
    }
  }

  return products.length > 0 ? products : null;
}

async function extractProductListWithAI(
  data: unknown,
  limit: number,
): Promise<ProviderCatalogItem[]> {
  const model = await getVertexModel();

  const listTool = tool({
    description: "Extract a list of products with id and name from API data",
    inputSchema: z.object({
      products: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          imageUrl: z.string().optional(),
          hidden: z.boolean().optional(),
        }),
      ),
    }),
    execute: async (data) => data,
  });

  const prompt = `Extract up to ${limit} products from the API response.
Return only products that have a clear id and name.

API Response:
${JSON.stringify(data, null, 2)}

Call the list tool with the products array.`;

  try {
    const { toolCalls } = await generateText({
      model,
      prompt,
      tools: { listProducts: listTool },
      temperature: 0.1,
    });

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "listProducts",
    );

    if (!toolCall || toolCall.dynamic) {
      return [];
    }

    const products = toolCall.input.products as ProviderCatalogItem[];
    return products.slice(0, limit);
  } catch (error) {
    console.error("Error extracting product list:", error);
    return [];
  }
}

const PRODUCT_ID_PLACEHOLDER_PATTERN =
  /\{(productId|id|product_id|sku|code)\}/i;
const PRODUCT_ID_PLACEHOLDER_GLOBAL =
  /\{(productId|id|product_id|sku|code)\}/gi;
const ANY_PLACEHOLDER_PATTERN = /\{[^}]+\}/;

function hasProductIdPlaceholder(value: string): boolean {
  return PRODUCT_ID_PLACEHOLDER_PATTERN.test(value);
}

function replaceProductIdPlaceholders(
  url: string,
  sampleProductId: string,
): { resolvedUrl: string; hasUnresolved: boolean } {
  const resolvedUrl = url.replace(
    PRODUCT_ID_PLACEHOLDER_GLOBAL,
    sampleProductId,
  );

  return {
    resolvedUrl,
    hasUnresolved: ANY_PLACEHOLDER_PATTERN.test(resolvedUrl),
  };
}

function resolveUrlWithSampleProductId(
  url: string,
  sampleProductId?: string,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (!ANY_PLACEHOLDER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!sampleProductId || !hasProductIdPlaceholder(trimmed)) {
    return null;
  }

  const { resolvedUrl, hasUnresolved } = replaceProductIdPlaceholders(
    trimmed,
    sampleProductId,
  );

  if (hasUnresolved) {
    return null;
  }

  return resolvedUrl;
}

function normalizeEndpointKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Convert a string to camelCase value format for attribute options.
 * Only alphanumeric characters and + are allowed per schema validation.
 * Examples: "Matte Finish" -> "matteFinish", "A4 Size" -> "a4Size", "350g" -> "350g"
 */
function toCamelCaseValue(input: string): string {
  // Remove Polish diacritics
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");

  // Split by non-alphanumeric characters
  const words = normalized.split(/[^a-zA-Z0-9+]+/).filter(Boolean);

  if (words.length === 0) {
    return "value";
  }

  // First word lowercase, subsequent words capitalized
  return words
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
}

function createEndpointId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

/**
 * Extract product ID from URL using provider's product endpoint pattern
 */
function extractProductIdFromUrl(
  url: string,
  provider: ExternalProvider,
): string {
  if (!provider.productEndpoint) {
    // Fallback: try to get last path segment
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }

  // Find the position of {productId} in the template
  const template = provider.productEndpoint;
  const placeholderIndex = template.indexOf("{productId}");

  if (placeholderIndex === -1) {
    // No placeholder, use last segment
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }

  // Extract the part of the URL that corresponds to productId
  const beforePlaceholder = template.substring(0, placeholderIndex);
  const afterPlaceholder = template.substring(
    placeholderIndex + "{productId}".length,
  );

  // Find where the product ID starts in the URL
  const startIndex = url.indexOf(beforePlaceholder) + beforePlaceholder.length;

  if (afterPlaceholder) {
    const endIndex = url.indexOf(afterPlaceholder, startIndex);
    if (endIndex !== -1) {
      return url.substring(startIndex, endIndex);
    }
  }

  // Get everything after the prefix
  return url.substring(startIndex).split("/")[0].split("?")[0];
}

/**
 * Fetch data from external API endpoint
 */
async function fetchFromEndpoint(
  url: string,
  headers?: Record<string, string>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetchExternalProviderUrl(url, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error fetching from endpoint:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extract product data from API response using AI with function calling
 */
async function extractProductDataFromAPI(
  apiData: any,
  url: string,
  options?: {
    attributeAvailabilityData?: unknown;
    attributeSchema?: ApiResponseSchema | null;
    productSchema?: ApiResponseSchema | null;
  },
): Promise<{
  success: boolean;
  data?: {
    name: string;
    description?: string;
    images?: string[];
    attributes: ExternalAttribute[];
    priceInfo?: any;
    specifications?: Record<string, any>;
    keywords?: string[];
  };
  error?: string;
}> {
  const model = await getVertexHighPrecisionModel();
  const currentLanguage = await getCurrentAdminLanguage();

  const extractionTool = tool({
    description:
      "Extract structured product information from API response data",
    inputSchema: z.object({
      name: z.string().describe("Product name"),
      description: z.string().optional().describe("Product description"),
      images: z.array(z.string()).optional().describe("Product image URLs"),
      attributes: z
        .array(
          z.object({
            id: z
              .string()
              .optional()
              .describe(
                "Attribute id/key used by the API (e.g., 'color', 'paperFormat')",
              ),
            name: z
              .string()
              .describe("Attribute name (e.g., 'Paper Type', 'Size')"),
            options: z
              .array(
                z.object({
                  value: z
                    .string()
                    .describe(
                      "API value used in requests (e.g., 'both', 'left', 'A4', '350gsm')",
                    ),
                  label: z
                    .string()
                    .optional()
                    .describe(
                      "Human-readable display label, often localized (e.g., 'dwie strony', 'spirala po lewej')",
                    ),
                }),
              )
              .describe("Attribute options with API values and display labels"),
            category: z
              .string()
              .optional()
              .describe("Attribute category (e.g., 'paper', 'size')"),
            affectsPricing: z
              .boolean()
              .optional()
              .describe("Whether attribute affects pricing"),
          }),
        )
        .describe("Product attributes and options"),
      priceInfo: z
        .object({
          currency: z.string().optional(),
          priceText: z.string().optional(),
          priceRanges: z
            .array(
              z.object({
                deliveryTime: z.union([z.number(), z.string()]).optional(),
                quantity: z.number().optional(),
                price: z.number().optional(),
                unit: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional()
        .describe("Price information"),
      specifications: z
        .record(z.string(), z.any())
        .optional()
        .describe("Product specifications"),
      keywords: z
        .array(z.string())
        .optional()
        .describe("Product keywords/tags"),
    }),
    execute: async (data) => data,
  });

  // Build context sections for the prompt
  let attributeContext = "";

  if (options?.attributeAvailabilityData) {
    attributeContext += `\n\nATTRIBUTE AVAILABILITY DATA (separate endpoint with product-specific attribute options):
${JSON.stringify(options.attributeAvailabilityData, null, 2)}

IMPORTANT: The above data contains the product's available attributes and their options. Extract attributes from this data.`;
  }

  if (options?.attributeSchema) {
    attributeContext += `\n\nATTRIBUTE SCHEMA HINT (structure detected from provider):
${options.attributeSchema.description || "API endpoint contains attribute information"}
Example structure: ${JSON.stringify(options.attributeSchema.example || {}, null, 2)}`;
  }

  const prompt = `Extract product information from the following API response data from ${url}.

Current admin language: ${currentLanguage}

API Response Data:
${JSON.stringify(apiData, null, 2)}${attributeContext}

Please analyze the data and extract:
1. Product name
  - Return the product title in the current admin language only.
  - If the source contains bilingual names like "Ulotki (Flyers)" or "Flyers (Ulotki)", pick only the current-language variant.
  - Example for current language "pl": "Ulotki (Flyers)" -> "Ulotki"
  - Example for current language "en": "Ulotki (Flyers)" -> "Flyers"
2. Product description
3. Product images (URLs)
4. Product attributes/options (e.g., paper type, size, finish, color)
   - CRITICAL: each real attribute (identified by its unique technical id) must appear EXACTLY ONCE in the output array.
   - NEVER create one attribute from the API key/id and another attribute from the display label/name.
   - If the source contains both a technical key like "paperFormat" and a human label like "Format", output ONE attribute object:
     * id: "paperFormat"
     * name: "Format"
   - BAD: [{ name: "Format" }, { name: "paperFormat" }]
   - GOOD: [{ id: "paperFormat", name: "Format" }]
   - Multiple attributes MAY share the same display name as long as they have DIFFERENT technical ids.
     For example, two attributes both named "Papier" with ids "calendarPaperFlatHeadWeight" and "calendarPaperConvexHeadWeight" are TWO separate attributes and must BOTH appear in the output.
   - For each attribute option, extract BOTH in a single option object:
     * value: the technical API value used in requests (e.g., "both", "left", "a4", "350gsm")
     * label: the human-readable display text (e.g., "dwie strony", "spirala po lewej", "A4")
   - NEVER create duplicate options where one entry is just the API value and another is the display label for the same option.
   - Prefer localized or human-readable display text for attribute name when available.
  - The attribute name MUST follow the current admin language when a localized label exists.
  - Example in Polish admin mode: use "Kolor", "Format", "Papier", "Wysyłka" in name.
  - NEVER return raw English/API keys like "color", "paperFormat", "delivery" as the attribute name in Polish admin mode.
   - Use id only for the technical API key if present (e.g., "color", "paperFormat", "delivery").
   - API values are typically short codes in English, camelCase, or numeric identifiers.
   - Labels are often localized (e.g., Polish) descriptive text for the UI.
   - Look for patterns like: { value: "...", label: "..." }, { id: "...", name: "..." }, { key: "...", title: "..." }
   - Check nested objects like "availability", "options", "attributes", "variants", "configurations".
  - If a grouped option has empty: true and no nested values, treat that branch as a selectable terminal option.
  - If a nested value includes correspondingValue, that correspondingValue is also a valid API request value for the related alternate branch.
   - Attributes must be unique by their technical id; do not return semantic duplicates that lack distinct ids.
   - Multiple attributes MAY share the same display name if they have different technical ids.
   - Include whether each attribute affects pricing.
  5. Price information (currency, price text, price ranges by quantity, delivery times when available)
    - If delivery or lead time is present, return it as deliveryTime in days when possible.
    - If the source exposes an absolute delivery date or date-like text (for example estimatedShipmentAt or ETA), you may return that raw string in deliveryTime and the system will normalize it.
  6. Specifications (dimensions, weight, etc.)
  7. Keywords/tags

Call the extraction tool with the structured data.`;

  const runExtraction = async (currentPrompt: string) => {
    const { toolCalls } = await generateText({
      model,
      prompt: currentPrompt,
      tools: { extractProduct: extractionTool },
      temperature: 0.1,
      providerOptions: getVertexThinkingProviderOptions({
        thinkingLevel: "medium",
      }),
    });

    if (toolCalls.length === 0) {
      return null;
    }

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "extractProduct",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    return toolCall.input as {
      name?: string;
      description?: string;
      images?: string[];
      attributes?: ExtractedAttributeCandidate[];
      priceInfo?: unknown;
      specifications?: Record<string, unknown>;
      keywords?: string[];
    };
  };

  try {
    let extracted = await runExtraction(prompt);

    if (!extracted) {
      return {
        success: false,
        error: "AI did not extract product data",
      };
    }

    const extractionIssues = getAllExtractedAttributeIssues(
      extracted.attributes || [],
      currentLanguage,
    );

    if (extractionIssues.length > 0) {
      const correctionPrompt = `${prompt}

YOUR PREVIOUS OUTPUT WAS INVALID.

Previous attributes output:
${JSON.stringify(extracted.attributes || [], null, 2)}

Validation errors:
${extractionIssues.map((issue) => `- ${issue}`).join("\n")}

Return the corrected full product extraction now. Keep the same data, but fix the attribute structure so every attribute (by unique id) appears only once and technical ids stay inside the id field. Attributes with different ids MAY share the same display name.`;

      extracted = (await runExtraction(correctionPrompt)) ?? extracted;

      const remainingIssues = getAllExtractedAttributeIssues(
        extracted.attributes || [],
        currentLanguage,
      );

      if (remainingIssues.length > 0) {
        return {
          success: false,
          error: `AI returned duplicate attribute definitions: ${remainingIssues.join(" | ")}`,
        };
      }
    }

    // Transform extracted attributes to include both values (API values only) and options
    const transformedAttributes: ExternalAttribute[] = (
      extracted.attributes || []
    ).map((attr) => ({
      id: attr.id,
      name: attr.name,
      // values contains only API values for use in pricing queries
      values: (attr.options || []).map((opt) => opt.value),
      // options contains full value/label pairs for display and mapping
      options: attr.options || [],
      category: attr.category,
      affectsPricing: attr.affectsPricing,
    }));
    const enrichedAttributes = enrichExtractedExternalAttributes({
      attributes: transformedAttributes,
      payloads: [apiData, options?.attributeAvailabilityData],
    });

    return {
      success: true,
      data: {
        name: selectLocalizedTitle(
          extracted.name || "Unknown Product",
          currentLanguage,
        ),
        description: extracted.description,
        images: extracted.images || [],
        attributes: enrichedAttributes,
        priceInfo: normalizeExtractedExternalPriceInfo(extracted.priceInfo),
        specifications: extracted.specifications || {},
        keywords: extracted.keywords || [],
      },
    };
  } catch (error) {
    console.error("Error extracting product data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate AI-suggested attribute mappings
 */
async function suggestAttributeMappings(
  externalAttributes: ExternalAttribute[],
  internalAttributes: InternalAttributeForMapping[],
): Promise<AttributeMapping[]> {
  if (externalAttributes.length === 0 || internalAttributes.length === 0) {
    return [];
  }

  const model = await getVertexHighPrecisionModel();

  const mappingTool = tool({
    description:
      "Suggest attribute mappings from external to internal attributes",
    inputSchema: z.object({
      mappings: z.array(
        z.object({
          externalAttributeName: z.string(),
          internalAttributeId: z.string().optional(),
          confidence: z.number().min(0).max(1),
          optionMappings: z
            .record(z.string(), z.string())
            .optional()
            .describe(
              "External option.value to internal option.value mappings. Keys and values must be copied exactly from the provided option value fields.",
            ),
        }),
      ),
    }),
    execute: async (data) => data.mappings,
  });

  const prompt = `You are an expert at mapping product attributes from external sources to internal system attributes.

${ATTRIBUTE_MAPPING_RULES}

External Attributes:
${JSON.stringify(buildExternalAttributeMappingPromptData(externalAttributes), null, 2)}

Internal System Attributes:
${JSON.stringify(
  buildInternalAttributeMappingPromptData(internalAttributes),
  null,
  2,
)}

For each external attribute, suggest the best matching internal attribute ID and provide:
1. Confidence score (0-1)
2. Option value mappings (map external values to internal option values)

Important:
- For "externalAttributeName" in the output, use the exact externalAttributeKey.
- For optionMappings, use exact external option.value strings as keys and exact internal option.value strings as values.
- If a value is not an exact semantic match, omit it from optionMappings.
- If no internal attribute can be used without creating duplicate internalAttributeId usage, omit internalAttributeId.

Call the mapping tool with the suggested mappings.`;

  try {
    const { toolCalls } = await generateText({
      model,
      prompt,
      tools: { suggestMappings: mappingTool },
      toolChoice: { type: "tool", toolName: "suggestMappings" },
      temperature: 0.1,
      providerOptions: getVertexThinkingProviderOptions({
        thinkingLevel: "medium",
      }),
    });

    if (toolCalls.length === 0) {
      return [];
    }

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "suggestMappings",
    );

    if (!toolCall || toolCall.dynamic) {
      return [];
    }

    return normalizeAttributeMappings({
      externalAttributes,
      internalAttributes,
      mappings: toolCall.input.mappings as AttributeMapping[],
    });
  } catch (error) {
    console.error("Error generating attribute mappings:", error);
    return [];
  }
}

/**
 * AI-powered attribute mapping using Gemini 3 Flash
 * Maps external attributes to internal attributes with suggestions for missing data
 */
export async function aiMapAttributes(request: {
  externalProductId: string;
}): Promise<AIAttributeMappingResult> {
  try {
    await checkAdmin();
    const tenantId = await getRequestTenantScopeId();
    const { externalProductId } = request;
    const db = getDb();

    const externalProductResult = await getTenantScopedExternalProduct({
      db,
      externalProductId,
      ...(tenantId ? { tenantId } : {}),
    });

    if (!externalProductResult) {
      return {
        success: false,
        mappings: [],
        error: "External product not found",
      };
    }

    const externalProduct = externalProductResult.data;
    const externalAttributes = externalProduct.attributes ?? [];

    if (externalAttributes.length === 0) {
      return { success: true, mappings: [] };
    }

    // Get internal attributes (cached)
    const internalAttributes = await getInternalAttributesCached();

    if (internalAttributes.length === 0) {
      // No internal attributes - suggest creating all as new
      return {
        success: true,
        mappings: externalAttributes.map((ext) => ({
          externalAttributeName: ext.id || ext.name,
          confidence: 0,
          optionMappings: (
            ext.options ?? ext.values.map((value) => ({ value, label: value }))
          ).map((option) => ({
            externalValue: option.value,
            confidence: 0,
            suggestedNewOption: {
              label: option.label ?? option.value,
              value: toCamelCaseValue(option.label ?? option.value),
            },
          })),
          suggestedNewAttribute: {
            name: ext.name,
            type: "DROPDOWN" as const,
            options: (
              ext.options ??
              ext.values.map((value) => ({ value, label: value }))
            ).map((option) => ({
              label: option.label ?? option.value,
              value: toCamelCaseValue(option.label ?? option.value),
            })),
          },
        })),
      };
    }

    const model = await getVertexModel();

    const mappingTool = tool({
      description:
        "Map external product attributes to internal system attributes with AI suggestions",
      inputSchema: z.object({
        mappings: z.array(
          z.object({
            externalAttributeName: z
              .string()
              .describe(
                "Unique key of the external attribute: its id if present, otherwise its name",
              ),
            internalAttributeId: z
              .string()
              .optional()
              .describe(
                "ID of matched internal attribute, or undefined if no match",
              ),
            confidence: z
              .number()
              .min(0)
              .max(1)
              .describe("Confidence score for attribute match (0-1)"),
            optionMappings: z.array(
              z.object({
                externalValue: z
                  .string()
                  .describe("Exact external option.value copied verbatim"),
                internalValue: z
                  .string()
                  .optional()
                  .describe(
                    "Exact matched internal option.value, or undefined if no match",
                  ),
                suggestedNewOption: z
                  .object({
                    label: z.string().describe("Label for new option"),
                    value: z
                      .string()
                      .describe(
                        "Value for new option (camelCase, alphanumeric only, e.g. matteFinish, a4Size)",
                      ),
                  })
                  .optional()
                  .describe("Suggested new option if no match exists"),
                confidence: z
                  .number()
                  .min(0)
                  .max(1)
                  .describe("Confidence score for option match (0-1)"),
              }),
            ),
            suggestedNewAttribute: z
              .object({
                name: z.string().describe("Name for the new attribute"),
                type: z
                  .enum([
                    "DROPDOWN",
                    "DROPDOWN_COLOR",
                    "RADIO_GROUP",
                    "RADIO_GROUP_IMAGE",
                    "RADIO_GROUP_COLOR",
                  ])
                  .describe("Type of attribute based on content"),
                options: z.array(
                  z.object({
                    label: z.string().describe("Display label"),
                    value: z
                      .string()
                      .describe(
                        "Value (camelCase, alphanumeric only, e.g. matteFinish, a4Size)",
                      ),
                    color: z
                      .string()
                      .optional()
                      .describe("Color hex code if applicable"),
                  }),
                ),
              })
              .optional()
              .describe(
                "Suggested new attribute when no internal match exists",
              ),
          }),
        ),
      }),
      execute: async (data) => data.mappings,
    });

    const prompt = `You are an expert at mapping product attributes from external sources to internal system attributes.
Your goal is to find the best matches and suggest new options/attributes when needed.

${ATTRIBUTE_MAPPING_RULES}

EXTERNAL PRODUCT ATTRIBUTES (from imported product):
${JSON.stringify(
  buildExternalAttributeMappingPromptData(externalAttributes),
  null,
  2,
)}

INTERNAL SYSTEM ATTRIBUTES (our database):
${JSON.stringify(
  buildInternalAttributeMappingPromptData(internalAttributes),
  null,
  2,
)}

MAPPING RULES:
1. For each external attribute, try to find the best matching internal attribute by name/meaning
1a. ALWAYS return the exact externalAttributeKey value in externalAttributeName. Do not substitute the display name when a key is present.
1b. If you see a technical API-key attribute name like "color", "paperFormat", or "delivery" alongside a human-readable/localized attribute for the same meaning, ONLY map the human-readable/localized attribute.
2. IMPORTANT: Strongly prefer matching to attributes with calculated: true - these are configurable attributes used for pricing
3. Consider semantic similarity (e.g., "Paper Type" matches "Paper", "Papier", "Material")
4. For option values, match by:
   - Exact value/label match
   - Semantic similarity (e.g., "A4" matches "a4", "210x297mm" might match "A4")
   - Normalized matching (ignore case, spaces, hyphens)
   - Output exact provided option.value strings only. Never output normalized versions.
4a. CRITICAL: Each internal option value may be matched to AT MOST ONE external value.
   If multiple external values could map to the same internal option, only the single best match (highest confidence) wins.
   All other external values MUST get suggestedNewOption instead.
   Example: external ["kreda mat 300g", "kreda błysk 300g"] vs internal "kreda300g" →
     "kreda mat 300g" → internalValue: "kreda300g" (best match),
     "kreda błysk 300g" → suggestedNewOption: { label: "Kreda błysk 300g", value: "kredaBlysk300g" }
5. If an external value has no matching internal option, suggest a new option with:
   - label: human-readable name (can match external value)
   - value: camelCase format with only alphanumeric characters and + (e.g., "matteFinish", "a4Size", "350g")
6. If no internal attribute matches at all, set internalAttributeId to undefined and provide suggestedNewAttribute with:
   - name: proper attribute name
   - type: DROPDOWN_COLOR for colors, RADIO_GROUP for small sets (<5), DROPDOWN for larger sets
   - options: converted from external values with camelCase values
7. Confidence scores:
   - 1.0: Exact match
   - 0.7-0.9: High confidence semantic match
   - 0.4-0.6: Partial match, needs review
   - 0.0-0.3: Low confidence or no match

Call the mapping tool with ALL external attributes mapped.`;

    const { toolCalls } = await generateText({
      model,
      prompt,
      tools: { mapAttributes: mappingTool },
      toolChoice: { type: "tool", toolName: "mapAttributes" },
      temperature: 0.2,
    });

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "mapAttributes",
    );

    if (!toolCall || toolCall.dynamic) {
      return {
        success: false,
        mappings: [],
        error: "AI did not return attribute mappings",
      };
    }

    const aiMappings = normalizeAiSuggestedAttributeMappings({
      externalAttributes,
      internalAttributes,
      mappings: toolCall.input.mappings as AISuggestedAttributeMapping[],
    });

    return {
      success: true,
      mappings: aiMappings,
    };
  } catch (error) {
    console.error("Error in AI attribute mapping:", error);
    return {
      success: false,
      mappings: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Create a new attribute option in the database
 */
export async function createAttributeOption(request: {
  attributeId: string;
  option: {
    label: string;
    value: string;
    color?: string;
  };
}): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    const { attributeId, option } = request;
    const db = getDb();

    const attributeRef = db.collection("attributes").doc(attributeId);
    const attributeDoc = await attributeRef.get();

    if (!attributeDoc.exists) {
      return { success: false, error: "Attribute not found" };
    }

    const attributeData = attributeDoc.data() as Attribute;
    const existingOptions = attributeData.options ?? [];

    // Check if option already exists
    const exists = existingOptions.some(
      (opt) => opt.value === option.value || opt.label === option.label,
    );

    if (exists) {
      return { success: false, error: "Option already exists" };
    }

    const newOption = {
      label: option.label,
      value: option.value,
      customFormat: false,
      hidden: false,
      ...(option.color ? { color: option.color } : {}),
    };

    await attributeRef.update({
      options: [...existingOptions, newOption],
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error("Error creating attribute option:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get provider configuration
 */
async function getProvider(
  providerId: string,
  tenantId?: string,
): Promise<ExternalProvider | null> {
  try {
    const db = getDb();
    const doc = await db.collection("externalProviders").doc(providerId).get();

    if (
      !doc.exists ||
      !tenantOwnedDataMatches(
        doc.data() as { tenantId?: string | null } | undefined,
        tenantId,
      )
    ) {
      return null;
    }

    return { id: doc.id, ...doc.data() } as ExternalProvider;
  } catch (error) {
    console.error("Error getting provider:", error);
    return null;
  }
}

async function getTenantScopedExternalProduct(input: {
  db: FirebaseFirestore.Firestore;
  externalProductId: string;
  tenantId?: string;
}): Promise<{
  data: ExternalProduct;
  ref: FirebaseFirestore.DocumentReference;
} | null> {
  const ref = input.db
    .collection("externalProducts")
    .doc(input.externalProductId);
  const doc = await ref.get();

  if (
    !doc.exists ||
    !tenantOwnedDataMatches(
      doc.data() as { tenantId?: string | null } | undefined,
      input.tenantId,
    )
  ) {
    return null;
  }

  return {
    data: doc.data() as ExternalProduct,
    ref,
  };
}

/**
 * Fetch product data from external API endpoint
 */
export async function fetchExternalProduct(
  request: FetchExternalProductRequest,
): Promise<FetchExternalProductResponse> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled("admin.external-product.fetch");
    const tenantId = await getRequestTenantScopeId();
    const { url, providerId, forceRefresh = false } = request;
    const currentLanguage = await getCurrentAdminLanguage();

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: "Invalid URL" };
    }

    const db = getDb();

    // Get provider configuration if specified
    let provider: ExternalProvider | null = null;
    let requestHeaders: Record<string, string> = {};

    if (providerId) {
      provider = await getProvider(providerId, tenantId);
      if (!provider) {
        return { success: false, error: "Provider not found" };
      }

      requestHeaders = buildRequestHeadersFromProvider(provider);
    }

    // Check if already cached (unless force refresh)
    if (!forceRefresh) {
      let existingProductsQuery = db
        .collection("externalProducts")
        .where("source.url", "==", url);
      if (tenantId) {
        existingProductsQuery = existingProductsQuery.where(
          "tenantId",
          "==",
          tenantId,
        );
      }

      const existingQuery = await existingProductsQuery.limit(1).get();

      if (!existingQuery.empty) {
        const existing = existingQuery.docs[0];
        const data = existing.data() as ExternalProduct;

        // Return cached if less than 24 hours old
        const lastFetched = data.source.lastFetchedAt as any;
        const hoursSinceLastFetch = lastFetched
          ? (Date.now() - lastFetched.toMillis()) / (1000 * 60 * 60)
          : 999;

        const cachedAttributeIssues = getAllExtractedAttributeIssues(
          toExtractedAttributeCandidates(data.attributes ?? []),
          currentLanguage,
        );

        if (hoursSinceLastFetch < 24 && cachedAttributeIssues.length === 0) {
          return {
            success: true,
            externalProduct: serializeFirestoreDeep(
              normalizeExternalProductPriceInfo<
                ExternalProduct & { id: string }
              >({
                ...data,
                id: existing.id,
              }),
            ) as ExternalProduct,
          };
        }

        if (cachedAttributeIssues.length > 0) {
          console.warn(
            "[fetchExternalProduct] Ignoring cached external product because attribute extraction is invalid:",
            cachedAttributeIssues,
          );
        }
      }
    }

    // Fetch data from API endpoint
    const fetchResult = await fetchFromEndpoint(url, requestHeaders);

    if (!fetchResult.success || !fetchResult.data) {
      return {
        success: false,
        error: fetchResult.error || "Failed to fetch from endpoint",
      };
    }

    // Generate content hash for change detection
    const contentHash = generateContentHash(JSON.stringify(fetchResult.data));

    // Fetch attribute availability data if provider has endpoint
    // Run in parallel with internal attributes cache lookup
    const attributeAvailabilityPromise = (async () => {
      if (!provider?.attributeAvailabilityEndpoint) return null;
      const attrUrl = provider.attributeAvailabilityEndpoint.includes(
        "{productId}",
      )
        ? provider.attributeAvailabilityEndpoint.replace(
            "{productId}",
            extractProductIdFromUrl(url, provider),
          )
        : provider.attributeAvailabilityEndpoint;

      const attrResult = await fetchFromEndpoint(attrUrl, requestHeaders);
      return attrResult.success && attrResult.data ? attrResult.data : null;
    })();

    // Start loading internal attributes in parallel (cached)
    const internalAttributesPromise = getInternalAttributesCached();

    const [attributeAvailabilityData, internalAttributes] = await Promise.all([
      attributeAvailabilityPromise,
      internalAttributesPromise,
    ]);

    // Extract product data using AI with function calling
    const extractResult = await extractProductDataFromAPI(
      fetchResult.data,
      url,
      {
        attributeAvailabilityData,
        attributeSchema: provider?.attributeAvailabilitySchema,
        productSchema: provider?.productSchema,
      },
    );

    if (!extractResult.success || !extractResult.data) {
      return {
        success: false,
        error: extractResult.error || "Failed to extract product data",
      };
    }

    // Generate AI-suggested mappings (internal attributes already loaded)
    const suggestedMappings = await suggestAttributeMappings(
      extractResult.data.attributes,
      internalAttributes,
    );

    // Price fetching is triggered manually after import via "Fetch Prices" button
    // to avoid long import times (fetching all price configurations can take minutes)
    const priceConfigurations: ExternalPriceConfiguration[] | undefined =
      undefined;

    // Also log priceInfo from extraction
    console.log(
      "[fetchExternalProduct] Extracted priceInfo:",
      extractResult.data.priceInfo,
    );

    // Create external product record
    const externalProduct: Omit<ExternalProduct, "id"> = {
      source: {
        url,
        type: "api",
        platform: provider?.name || parsedUrl.hostname,
        providerId: providerId,
        lastFetchedAt: Timestamp.now() as any,
        accessible: true,
      },
      originalName: extractResult.data.name,
      originalDescription: extractResult.data.description,
      images: extractResult.data.images,
      attributes: extractResult.data.attributes,
      attributeMappings: suggestedMappings,
      priceInfo: normalizeExtractedExternalPriceInfo(
        extractResult.data.priceInfo,
      ),
      priceConfigurations,
      specifications: extractResult.data.specifications,
      keywords: extractResult.data.keywords,
      imported: false,
      importStatus: "pending",
      contentHash,
      name: extractResult.data.name,
      active: true,
      ...(tenantId ? { tenantId } : {}),
      createdAt: Timestamp.now() as any,
      updatedAt: Timestamp.now() as any,
      createdBy: { id: "system", name: "System" },
      updatedBy: { id: "system", name: "System" },
    };

    // Save to Firestore
    const sanitizedExternalProduct = removeUndefinedDeep(
      externalProduct,
    ) as Omit<ExternalProduct, "id">;
    const docRef = await db
      .collection("externalProducts")
      .add(sanitizedExternalProduct);

    updateTag(EXTERNAL_PRODUCTS_TAG);

    return {
      success: true,
      externalProduct: serializeFirestoreDeep({
        ...externalProduct,
        id: docRef.id,
      }) as ExternalProduct,
      suggestedMappings,
    };
  } catch (error) {
    console.error("Error fetching external product:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Fetch prices for an existing external product
 * This allows fetching prices separately from the initial import
 * @param externalProductId - The ID of the external product
 * @param marginPercent - Optional margin percentage to add to prices (e.g., 20 for 20%)
 * @param taxPercent - Optional tax percentage added after discount (e.g., 23 for 23%)
 * @param discountPercent - Optional discount percentage deducted before tax (e.g., 35 for 35%)
 */
export async function fetchExternalProductPrices(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: "reuse" | "full" = "reuse",
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled(
      "admin.external-product.fetch-prices",
    );
    return await fetchExternalProductPricesSystemShared(
      externalProductId,
      marginPercent,
      taxPercent,
      discountPercent,
      fetchStrategy,
    );
  } catch (error) {
    console.error("Error fetching external product prices:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * System/internal variant used by durable workflows and secure server-to-server callers.
 * This bypasses admin cookie auth because the caller is already trusted.
 */
export async function fetchExternalProductPricesSystem(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: "reuse" | "full" = "reuse",
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  return fetchExternalProductPricesSystemShared(
    externalProductId,
    marginPercent,
    taxPercent,
    discountPercent,
    fetchStrategy,
  );
}

export async function checkExternalProductPriceChangesSystem(
  externalProductId: string,
  marginPercent?: number,
  taxPercent?: number,
  discountPercent?: number,
): Promise<{
  success: boolean;
  hasPriceChanges?: boolean;
  currentCount?: number;
  fetchedCount?: number;
  error?: string;
}> {
  return checkExternalProductPriceChangesSystemShared(
    externalProductId,
    marginPercent,
    taxPercent,
    discountPercent,
  );
}

export async function stageExternalProductPricesForReview(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: "reuse" | "full" = "reuse",
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  await checkAdmin();
  await assertExternalProviderImportEnabled(
    "admin.external-product.stage-prices",
  );
  return stageExternalProductPricesForReviewSystemShared(
    externalProductId,
    marginPercent,
    taxPercent,
    discountPercent,
    fetchStrategy,
  );
}

/**
 * System/internal variant used by secure server-to-server route handlers.
 * This bypasses admin cookie auth because callers authenticate via shared secret.
 */
export async function stageExternalProductPricesForReviewSystem(
  externalProductId: string,
  marginPercent: number = 0,
  taxPercent: number = 0,
  discountPercent: number = 0,
  fetchStrategy: "reuse" | "full" = "reuse",
): Promise<{
  success: boolean;
  priceConfigurations?: ExternalPriceConfiguration[];
  error?: string;
}> {
  return stageExternalProductPricesForReviewSystemShared(
    externalProductId,
    marginPercent,
    taxPercent,
    discountPercent,
    fetchStrategy,
  );
}

export async function applyExternalProductPendingPrices(
  externalProductId: string,
): Promise<{
  success: boolean;
  appliedCount?: number;
  error?: string;
}> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled(
      "admin.external-product.apply-pending-prices",
    );
    const tenantId = await getRequestTenantScopeId();
    const db = getDb();
    const externalProductResult = await getTenantScopedExternalProduct({
      db,
      externalProductId,
      ...(tenantId ? { tenantId } : {}),
    });

    if (!externalProductResult) {
      return { success: false, error: "External product not found" };
    }

    const externalRef = externalProductResult.ref;
    const externalProduct = externalProductResult.data;

    const { updateFields, appliedCount } = await movePendingToApplied({
      docRef: externalRef,
      externalProduct,
      db,
    });

    if (appliedCount === 0) {
      return { success: false, error: "No pending prices to apply" };
    }

    await externalRef.update({
      ...updateFields,
      priceRefreshStatus: "applied",
      priceRefreshError: FieldValue.delete(),
      priceRefreshLastAppliedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    updateTag(EXTERNAL_PRODUCTS_TAG);

    return {
      success: true,
      appliedCount,
    };
  } catch (error) {
    console.error("Error applying pending external product prices:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getExternalImportConnectionForProduct(
  channelId: string,
  productId: string,
): Promise<{
  success: boolean;
  connection?: ExternalImportConnection;
  error?: string;
}> {
  try {
    await checkAdmin();

    if (!channelId || !productId) {
      return {
        success: false,
        error: "Channel ID and product ID are required",
      };
    }

    const db = getDb();
    const snapshot = await db
      .collection(`channels/${channelId}/products/${productId}/externalImports`)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { success: true };
    }

    const firstDoc = snapshot.docs[0];
    const connection = serializeFirestoreDeep({
      ...(firstDoc.data() as ExternalImportConnection),
      externalProductId:
        (firstDoc.data() as ExternalImportConnection).externalProductId ||
        firstDoc.id,
    }) as ExternalImportConnection;

    return {
      success: true,
      connection,
    };
  } catch (error) {
    console.error("Error getting external import connection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getStoredProductPriceSets(
  channelId: string,
  productId: string,
): Promise<{
  success: boolean;
  priceDocs?: ProductPrice[];
  pageCountStepPriceDocs?: ProductPrice[];
  pageCountPriceDocs?: ProductPageCountPrice[];
  pageCountSegmentStepPriceDocs?: ProductPageCountPrice[];
  error?: string;
}> {
  try {
    await checkAdmin();

    if (!channelId || !productId) {
      return {
        success: false,
        error: "Channel ID and product ID are required",
      };
    }

    const [
      priceDocs,
      pageCountStepPriceDocs,
      pageCountPriceDocs,
      pageCountSegmentStepPriceDocs,
    ] = await Promise.all([
      readProductPriceSubcollection<ProductPrice>({
        channelId,
        productId,
        subcollectionName: "prices",
      }),
      readProductPriceSubcollection<ProductPrice>({
        channelId,
        productId,
        subcollectionName: "pageCountStepPrices",
      }),
      readProductPriceSubcollection<ProductPageCountPrice>({
        channelId,
        productId,
        subcollectionName: "pageCountPrices",
      }),
      readProductPriceSubcollection<ProductPageCountPrice>({
        channelId,
        productId,
        subcollectionName: "pageCountSegmentStepPrices",
      }),
    ]);

    return {
      success: true,
      priceDocs,
      pageCountStepPriceDocs,
      pageCountPriceDocs,
      pageCountSegmentStepPriceDocs,
    };
  } catch (error) {
    console.error("Error getting stored product price sets:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function connectProductToExternalProduct(request: {
  channelId: string;
  externalProductId: string;
  productId: string;
}): Promise<{
  success: boolean;
  connection?: {
    externalProductId: string;
    externalProductName: string;
    providerId?: string;
    providerName?: string;
    sourceUrl?: string;
    importedAt: number;
    importedBy: {
      id: string;
      name: string;
    };
  };
  error?: string;
}> {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    const { channelId, externalProductId, productId } = request;

    if (!channelId || !externalProductId || !productId) {
      return {
        success: false,
        error: "Channel ID, product ID, and external product ID are required",
      };
    }

    const db = getDb();
    const [productDoc, externalDoc, adminMember] = await Promise.all([
      db.collection(`channels/${channelId}/products`).doc(productId).get(),
      db.collection("externalProducts").doc(externalProductId).get(),
      getAuthenticatedAdminMember(),
    ]);

    if (!productDoc.exists) {
      return { success: false, error: "Product not found" };
    }

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProductData = externalDoc.data();

    if (!isRecord(externalProductData)) {
      return { success: false, error: "External product not found" };
    }

    const externalSource = isRecord(externalProductData.source)
      ? externalProductData.source
      : undefined;
    const connection: Record<string, unknown> = {
      externalProductId,
      externalProductName:
        typeof externalProductData.originalName === "string"
          ? externalProductData.originalName
          : externalProductId,
      importedAt: Timestamp.now(),
      importedBy: adminMember,
      providerId:
        typeof externalSource?.providerId === "string"
          ? externalSource.providerId
          : undefined,
      providerName:
        typeof externalSource?.platform === "string"
          ? externalSource.platform
          : undefined,
      sourceUrl:
        typeof externalSource?.url === "string"
          ? externalSource.url
          : undefined,
    };
    const externalImportsCollection = db.collection(
      `channels/${channelId}/products/${productId}/externalImports`,
    );
    const existingConnectionDocuments =
      await externalImportsCollection.listDocuments();

    for (const documentRef of existingConnectionDocuments) {
      await documentRef.delete();
    }

    await externalImportsCollection
      .doc(externalProductId)
      .set(removeUndefinedDeep(connection) as Record<string, unknown>);

    return {
      success: true,
      connection: serializeFirestoreDeep(connection) as {
        externalProductId: string;
        externalProductName: string;
        providerId?: string;
        providerName?: string;
        sourceUrl?: string;
        importedAt: number;
        importedBy: {
          id: string;
          name: string;
        };
      },
    };
  } catch (error) {
    console.error("Error connecting product to external product:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

type PreparedConnectedProductImportResult =
  | {
      applyDraft: ConnectedProductImportApplyDraft;
      groupedPageCountPrices?: Array<{
        calculatedCombination: string;
        pageCount: number;
        prices: Price[];
      }>;
      groupedPageCountSegmentStepPrices?: Array<{
        calculatedCombination: string;
        pageCount: number;
        prices: Price[];
      }>;
      groupedPageCountStepPrices?: Array<{
        calculatedCombination: string;
        prices: Price[];
      }>;
      groupedPrices: Array<{
        calculatedCombination: string;
        prices: Price[];
      }>;
      importedPriceCount: number;
      importedPriceGroupCount: number;
      productUpdate: Partial<Product>;
      success: true;
    }
  | {
      duplicateMappingsSummary?: string;
      error: string;
      requiresAttributeSync?: boolean;
      success: false;
    };

async function prepareConnectedProductImport(options: {
  externalProductId: string;
  syncMappedAttributes: boolean;
  targetProduct: ConnectedProductImportTarget;
}): Promise<PreparedConnectedProductImportResult> {
  const { externalProductId, syncMappedAttributes, targetProduct } = options;
  const categoryId =
    typeof targetProduct.category?.id === "string" &&
    targetProduct.category.id.trim()
      ? targetProduct.category.id.trim()
      : undefined;
  const draftResult = await getExternalProductForCreate(
    externalProductId,
    categoryId,
    { skipAiEnhancements: true },
  );

  if (!draftResult.success || !draftResult.product) {
    return {
      success: false,
      duplicateMappingsSummary: draftResult.duplicateMappingsSummary,
      error: draftResult.error || "Failed to build external product draft",
    };
  }

  const importedProduct = draftResult.product;
  const importedPrices = importedProduct.prices ?? [];
  const importedPageCountExactPrices =
    importedProduct.pageCount?.pricing?.exactPrices ?? [];
  const importedPageCountSegmentPrices =
    importedProduct.pageCount?.pricing?.segmentPrices ?? [];
  const importedPageCountStepPrices =
    importedProduct.pageCount?.pricing?.stepPrices ?? [];
  const importedPageCountPricingMode = getPageCountPricingMode(
    importedProduct.pageCount?.pricing,
  );

  if (importedPrices.length === 0) {
    return {
      success: false,
      error:
        "No supplier prices are available yet. Fetch and apply supplier prices first.",
    };
  }

  const { applyDraft, groupedPrices, productUpdate, requiresAttributeSync } =
    buildConnectedProductImportUpdate({
      product: targetProduct,
      importedProduct,
      syncMappedAttributes,
    });

  if (requiresAttributeSync) {
    return {
      success: false,
      requiresAttributeSync: true,
      error:
        "Current product attributes do not match the mapped external attributes. Sync mapped attributes first or update the product manually.",
    };
  }

  return {
    success: true,
    applyDraft,
    groupedPageCountPrices: importedProduct.pageCount
      ? importedPageCountPricingMode === "segmented"
        ? buildProductPageCountSegmentBasePriceBatchData(
            importedPageCountSegmentPrices,
            importedProduct.pageCount.minimum,
          )
        : buildProductPageCountPriceBatchData(importedPageCountExactPrices)
      : undefined,
    groupedPageCountSegmentStepPrices:
      importedProduct.pageCount && importedPageCountPricingMode === "segmented"
        ? buildProductPageCountSegmentStepPriceBatchData(
            importedPageCountSegmentPrices,
            importedProduct.pageCount.minimum,
          )
        : undefined,
    groupedPageCountStepPrices: importedProduct.pageCount
      ? groupProductPrices(importedPageCountStepPrices)
      : undefined,
    groupedPrices,
    importedPriceCount: applyDraft.prices.length,
    importedPriceGroupCount: groupedPrices.length,
    productUpdate,
  };
}

export async function getExternalProductImportDraft(request: {
  currentProduct: ConnectedProductImportTarget;
  externalProductId: string;
  syncMappedAttributes?: boolean;
}): Promise<{
  success: boolean;
  draft?: ConnectedProductImportApplyDraft;
  importedPriceCount?: number;
  importedPriceGroupCount?: number;
  requiresAttributeSync?: boolean;
  syncMappedAttributesApplied?: boolean;
  duplicateMappingsSummary?: string;
  error?: string;
}> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled(
      "admin.external-product.import-draft",
    );
    const {
      currentProduct,
      externalProductId,
      syncMappedAttributes = false,
    } = request;

    if (!externalProductId) {
      return {
        success: false,
        error: "External product ID is required",
      };
    }

    if (
      !isRecord(currentProduct) ||
      !Array.isArray(currentProduct.attributes) ||
      !Array.isArray(currentProduct.volumes) ||
      !isRecord(currentProduct.attributeOptions) ||
      !isRecord(currentProduct.category) ||
      !isRecord(currentProduct.spec)
    ) {
      return {
        success: false,
        error: "Current product state is required",
      };
    }

    const preparedImport = await prepareConnectedProductImport({
      externalProductId,
      syncMappedAttributes,
      targetProduct: currentProduct,
    });

    if (!preparedImport.success) {
      return preparedImport;
    }

    return {
      success: true,
      draft: serializeFirestoreDeep(
        removeUndefinedDeep(preparedImport.applyDraft),
      ) as ConnectedProductImportApplyDraft,
      importedPriceCount: preparedImport.importedPriceCount,
      importedPriceGroupCount: preparedImport.importedPriceGroupCount,
      syncMappedAttributesApplied: syncMappedAttributes,
    };
  } catch (error) {
    console.error("Error building external product import draft:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function importExternalProductPricesToProduct(request: {
  channelId: string;
  externalProductId: string;
  productId: string;
  syncMappedAttributes?: boolean;
}): Promise<{
  success: boolean;
  importedPriceCount?: number;
  importedPriceGroupCount?: number;
  requiresAttributeSync?: boolean;
  syncMappedAttributesApplied?: boolean;
  error?: string;
}> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled(
      "admin.external-product.import-prices",
    );
    const {
      channelId,
      externalProductId,
      productId,
      syncMappedAttributes = false,
    } = request;

    if (!channelId || !externalProductId || !productId) {
      return {
        success: false,
        error: "Channel ID, product ID, and external product ID are required",
      };
    }

    const db = getDb();
    const [productDoc, adminMember] = await Promise.all([
      db.collection(`channels/${channelId}/products`).doc(productId).get(),
      getAuthenticatedAdminMember(),
    ]);

    if (!productDoc.exists) {
      return { success: false, error: "Product not found" };
    }

    const productSnapshotData = productDoc.data();

    if (!isRecord(productSnapshotData)) {
      return { success: false, error: "Product not found" };
    }

    const serializedProductData = serializeFirestoreDeep(productSnapshotData);

    if (!isRecord(serializedProductData)) {
      return { success: false, error: "Product not found" };
    }

    const product = {
      ...serializedProductData,
      id: productDoc.id,
    } as Product;

    const preparedImport = await prepareConnectedProductImport({
      externalProductId,
      syncMappedAttributes,
      targetProduct: product,
    });

    if (!preparedImport.success) {
      return preparedImport;
    }

    await db
      .collection(`channels/${channelId}/products`)
      .doc(productId)
      .update(
        removeUndefinedDeep({
          ...preparedImport.productUpdate,
          pageCount: stripPageCountPricingTables(
            preparedImport.productUpdate.pageCount,
          ),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminMember,
        }) as Partial<Product>,
      );
    await scheduleExternalProductChangeLog({
      before: product,
      channelId,
      productId,
    });

    await replaceProductPriceSubcollection({
      channelId,
      groupedPrices: preparedImport.groupedPrices,
      productId,
    });
    await replaceProductPriceSubcollection({
      channelId,
      groupedPrices: preparedImport.groupedPageCountStepPrices ?? [],
      productId,
      subcollectionName: "pageCountStepPrices",
    });
    await replaceProductPriceSubcollection({
      channelId,
      groupedPrices: preparedImport.groupedPageCountSegmentStepPrices ?? [],
      productId,
      subcollectionName: "pageCountSegmentStepPrices",
    });
    await replaceProductPriceSubcollection({
      channelId,
      groupedPrices: preparedImport.groupedPageCountPrices ?? [],
      productId,
      subcollectionName: "pageCountPrices",
    });

    try {
      await revalidateTagCache("products");
      await revalidateTagCache("categorizedCardProducts");
      await revalidateTagCache("productMetadata");
      await revalidateTagCache("featuredProducts");
      await revalidateTagCache("popularProducts");
      await revalidateTagCache(`storeProduct-${channelId}`);
      await revalidateTagCache(`storeProduct-${channelId}-${product.seo.slug}`);
      await revalidateTagCache(`storeProductMetadata-${channelId}`);
      await revalidateTagCache(
        `storeProductMetadata-${channelId}-${product.seo.slug}`,
      );
    } catch (error) {
      console.error(
        "Failed to revalidate product cache after price import:",
        error,
      );
    }

    return {
      success: true,
      importedPriceCount: preparedImport.importedPriceCount,
      importedPriceGroupCount: preparedImport.importedPriceGroupCount,
      syncMappedAttributesApplied: syncMappedAttributes,
    };
  } catch (error) {
    console.error(
      "Error importing external product prices into product:",
      error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getExternalProductById(
  externalProductId: string,
): Promise<{
  success: boolean;
  externalProduct?: ExternalProduct;
  error?: string;
}> {
  try {
    await checkAdmin();

    if (!externalProductId) {
      return { success: false, error: "External product ID is required" };
    }

    const db = getDb();
    const externalDoc = await db
      .collection("externalProducts")
      .doc(externalProductId)
      .get();

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProductData = externalDoc.data() as ExternalProduct;
    const normalizedAttributeMappings = normalizeAttributeMappings({
      externalAttributes: externalProductData.attributes ?? [],
      mappings: externalProductData.attributeMappings,
    });
    const externalProduct = serializeFirestoreDeep(
      normalizeExternalProductPriceInfo<ExternalProduct & { id: string }>({
        ...externalProductData,
        attributeMappings: normalizedAttributeMappings,
        id: externalDoc.id,
      }),
    ) as ExternalProduct;

    return {
      success: true,
      externalProduct,
    };
  } catch (error) {
    console.error("Error getting external product by ID:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Save or update external provider
 * Automatically fetches endpoints and generates schemas using AI
 */
export async function saveExternalProvider(
  request: SaveExternalProviderRequest,
): Promise<SaveExternalProviderResponse> {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    await assertExternalProviderImportEnabled("admin.external-provider.save");
    const tenantId = await getRequestTenantScopeId();
    const { provider, providerId, providerInput } = request;
    const db = getDb();

    const trimmedInput = providerInput?.trim();
    let parsedProvider: ParsedProviderInput | null = null;

    if (trimmedInput) {
      parsedProvider = await parseProviderInput(trimmedInput);

      if (!parsedProvider) {
        return {
          success: false,
          error: "Failed to parse provider input",
        };
      }
    }

    const mergedProvider = mergeProviderInput(provider, parsedProvider);

    const name = mergedProvider.name.trim();
    const allProductsEndpoint =
      mergedProvider.allProductsEndpoint?.trim() ?? "";
    const productEndpoint = mergedProvider.productEndpoint?.trim() ?? "";
    const attributeAvailabilityEndpoint =
      mergedProvider.attributeAvailabilityEndpoint?.trim() ?? "";
    const baseUrl = mergedProvider.baseUrl?.trim() ?? "";
    const sampleProductId = mergedProvider.sampleProductId?.trim() ?? "";
    const logoUrl = mergedProvider.logoUrl?.trim() ?? "";
    const description = mergedProvider.description?.trim() ?? "";

    const endpoints = (mergedProvider.endpoints ?? [])
      .map((endpoint) => {
        const trimmedName = endpoint.name.trim();
        const trimmedUrl = endpoint.url.trim();
        const trimmedSampleUrl = endpoint.sampleUrl?.trim();
        const trimmedDescription = endpoint.description?.trim();

        return {
          ...endpoint,
          name: trimmedName || trimmedUrl,
          url: trimmedUrl,
          sampleUrl: trimmedSampleUrl || undefined,
          description: trimmedDescription || undefined,
        };
      })
      .filter((endpoint) => endpoint.url.length > 0);

    if (!name) {
      return { success: false, error: "Provider name is required" };
    }

    if (
      !allProductsEndpoint &&
      !productEndpoint &&
      endpoints.length === 0 &&
      !baseUrl
    ) {
      return { success: false, error: "Provide at least one endpoint" };
    }

    const productIdRequired =
      !sampleProductId &&
      !allProductsEndpoint &&
      (hasProductIdPlaceholder(productEndpoint) ||
        hasProductIdPlaceholder(attributeAvailabilityEndpoint) ||
        endpoints.some(
          (endpoint) =>
            hasProductIdPlaceholder(endpoint.url) &&
            !endpoint.sampleUrl?.trim(),
        ));

    if (productIdRequired) {
      return {
        success: false,
        error:
          "Provide an all products endpoint or a sample product ID for {productId} endpoints",
      };
    }

    const resolvedProvider: SaveExternalProviderRequest["provider"] = {
      ...mergedProvider,
      name,
      baseUrl: baseUrl || undefined,
      allProductsEndpoint: allProductsEndpoint || undefined,
      productEndpoint: productEndpoint || undefined,
      attributeAvailabilityEndpoint: attributeAvailabilityEndpoint || undefined,
      sampleProductId: sampleProductId || undefined,
      logoUrl: logoUrl || undefined,
      description: description || undefined,
      endpoints: endpoints.length > 0 ? endpoints : undefined,
    };

    const providerData = {
      ...resolvedProvider,
      ...(tenantId ? { tenantId } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "system",
    };

    const sanitizedProviderData = removeUndefinedDeep(providerData) as Record<
      string,
      unknown
    >;

    if (providerId) {
      const existingProvider = await getProvider(providerId, tenantId);
      if (!existingProvider) {
        return { success: false, error: "Provider not found" };
      }

      await db
        .collection("externalProviders")
        .doc(providerId)
        .update({
          ...sanitizedProviderData,
          ...(tenantId ? { tenantId } : {}),
        });
    }

    const savedProviderId =
      providerId ??
      (
        await db.collection("externalProviders").add({
          ...sanitizedProviderData,
          ...(tenantId ? { tenantId } : {}),
          createdAt: FieldValue.serverTimestamp(),
          createdBy: "system",
        })
      ).id;

    try {
      const { processExternalProviderWorkflow } =
        await import("@/lib/ai/durable-agents/external-provider-workflow");
      await start(processExternalProviderWorkflow, [
        {
          providerId: savedProviderId,
          provider: resolvedProvider as ExternalProvider,
          ...(tenantId ? { tenantId } : {}),
          workflowStartedAtMs: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Failed to start external provider workflow:", error);
    }

    updateTag(EXTERNAL_PROVIDERS_TAG);

    return { success: true, providerId: savedProviderId };
  } catch (error) {
    console.error("Error saving provider:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Automatic provider setup - parses input, saves provider, fetches products
 * Returns provider ID and products in one step
 */
export async function setupExternalProviderAuto(input: string): Promise<{
  success: boolean;
  providerId?: string;
  providerName?: string;
  products: ProviderCatalogItem[];
  error?: string;
}> {
  await checkAdmin();
  await assertExternalProviderImportEnabled(
    "admin.external-provider.setup-auto",
  );
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return { success: false, products: [], error: "Input is required" };
  }

  // Step 1: Parse the input with AI
  const parsed = await parseProviderInput(trimmedInput);
  if (!parsed) {
    return {
      success: false,
      products: [],
      error: "Failed to parse provider input",
    };
  }

  const endpoints: ExternalProviderEndpoint[] =
    parsed.endpoints?.map((endpoint) => ({
      id: createEndpointId(),
      name: endpoint.name,
      url: endpoint.url,
      sampleUrl: endpoint.sampleUrl,
      description: endpoint.description,
    })) ?? [];

  const provider: SaveExternalProviderRequest["provider"] = {
    name: parsed.name,
    baseUrl: parsed.baseUrl,
    allProductsEndpoint: parsed.allProductsEndpoint,
    productEndpoint: parsed.productEndpoint,
    attributeAvailabilityEndpoint: parsed.attributeAvailabilityEndpoint,
    sampleProductId: parsed.sampleProductId,
    logoUrl: parsed.logoUrl,
    description: parsed.description,
    endpoints: endpoints.length > 0 ? endpoints : undefined,
    auth: { type: "none" },
    headers: undefined,
    active: true,
  };

  // Step 2: Save the provider
  const saveResult = await saveExternalProvider({ provider });

  if (!saveResult.success || !saveResult.providerId) {
    return {
      success: false,
      products: [],
      error: saveResult.error || "Failed to save provider",
    };
  }

  // Step 3: Fetch products if we have an all products endpoint
  let products: ProviderCatalogItem[] = [];

  if (parsed.allProductsEndpoint) {
    const catalogResult = await listExternalProviderCatalog(
      saveResult.providerId,
      200,
    );

    if (catalogResult.success) {
      products = catalogResult.products;
    }
  }

  return {
    success: true,
    providerId: saveResult.providerId,
    providerName: parsed.name,
    products,
  };
}

async function listExternalProvidersCached(tenantId?: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(EXTERNAL_PROVIDERS_TAG);

  const db = getDb();
  const providersCollection = db.collection("externalProviders");
  const query = tenantId
    ? providersCollection
        .where("tenantId", "==", tenantId)
        .orderBy("name", "asc")
    : providersCollection.orderBy("name", "asc");
  const snapshot = await query.get();

  return snapshot.docs.map((doc) =>
    serializeFirestoreDeep({ id: doc.id, ...doc.data() }),
  );
}

/**
 * List external providers
 */
export async function listExternalProviders() {
  try {
    await checkAdmin();
    const providers = await listExternalProvidersCached(
      await getRequestTenantScopeId(),
    );

    return { success: true, providers };
  } catch (error) {
    console.error("Error listing providers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      providers: [],
    };
  }
}

export async function listExternalProviderCatalog(
  providerId: string,
  limit: number = 200,
): Promise<{
  success: boolean;
  products: ProviderCatalogItem[];
  error?: string;
}> {
  try {
    await checkAdmin();
    const provider = await getProvider(
      providerId,
      await getRequestTenantScopeId(),
    );

    if (!provider) {
      return { success: false, products: [], error: "Provider not found" };
    }

    const allProductsEndpoint = provider.allProductsEndpoint?.trim();
    if (!allProductsEndpoint) {
      return {
        success: false,
        products: [],
        error: "All products endpoint is required",
      };
    }

    const requestHeaders = buildRequestHeadersFromProvider(provider);
    const fetchResult = await fetchFromEndpoint(
      allProductsEndpoint,
      requestHeaders,
    );

    if (!fetchResult.success || !fetchResult.data) {
      return {
        success: false,
        products: [],
        error: fetchResult.error || "Failed to fetch products",
      };
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    const heuristicProducts = extractProductListFromResponse(
      fetchResult.data,
      normalizedLimit,
    );

    const products =
      heuristicProducts ??
      (await extractProductListWithAI(fetchResult.data, normalizedLimit));

    const urlTemplate =
      provider.productEndpoint?.trim() ||
      provider.attributeAvailabilityEndpoint?.trim() ||
      undefined;

    const mapped = products
      .filter((product) => product.hidden !== true)
      .map((product) => ({
        ...product,
        url: urlTemplate
          ? (resolveUrlWithSampleProductId(urlTemplate, product.id) ??
            undefined)
          : undefined,
      }));

    return { success: true, products: mapped };
  } catch (error) {
    console.error("Error listing provider products:", error);
    return {
      success: false,
      products: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete external provider
 */
export async function deleteExternalProvider(id: string) {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    const tenantId = await getRequestTenantScopeId();
    const provider = await getProvider(id, tenantId);
    if (!provider) {
      return { success: false, error: "Provider not found" };
    }

    const db = getDb();
    await db.collection("externalProviders").doc(id).delete();
    updateTag(EXTERNAL_PROVIDERS_TAG);
    return { success: true };
  } catch (error) {
    console.error("Error deleting provider:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function listExternalProductsCached(tenantId?: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(EXTERNAL_PRODUCTS_TAG);

  const db = getDb();
  const productsCollection = db.collection("externalProducts");
  const query = tenantId
    ? productsCollection
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
    : productsCollection.orderBy("createdAt", "desc");
  const snapshot = await query.limit(50).get();

  return snapshot.docs.map((doc) =>
    serializeFirestoreDeep(
      toExternalProductListItem(
        normalizeExternalProductPriceInfo<ExternalProduct & { id: string }>({
          ...(doc.data() as ExternalProduct),
          id: doc.id,
        }),
      ),
    ),
  );
}

/**
 * List external products
 */
export async function listExternalProducts() {
  try {
    await checkAdmin();
    const products = await listExternalProductsCached(
      await getRequestTenantScopeId(),
    );

    return { success: true, products };
  } catch (error) {
    console.error("Error listing external products:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      products: [],
    };
  }
}

/**
 * Delete external product
 */
export async function deleteExternalProduct(id: string) {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    const tenantId = await getRequestTenantScopeId();
    const db = getDb();
    const docRef = db.collection("externalProducts").doc(id);
    const doc = await docRef.get();

    if (
      !doc.exists ||
      !tenantOwnedDataMatches(
        doc.data() as { tenantId?: string | null } | undefined,
        tenantId,
      )
    ) {
      return { success: false, error: "External product not found" };
    }

    await docRef.delete();
    updateTag(EXTERNAL_PRODUCTS_TAG);
    return { success: true };
  } catch (error) {
    console.error("Error deleting external product:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateExternalProductDeliveryTimeExtraDay(
  externalProductId: string,
  deliveryTimeExtraDay: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    const tenantId = await getRequestTenantScopeId();
    const db = getDb();
    const docRef = db.collection("externalProducts").doc(externalProductId);
    const doc = await docRef.get();

    if (
      !doc.exists ||
      !tenantOwnedDataMatches(
        doc.data() as { tenantId?: string | null } | undefined,
        tenantId,
      )
    ) {
      return { success: false, error: "External product not found" };
    }

    await docRef.update({
      deliveryTimeExtraDay: deliveryTimeExtraDay || FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    updateTag(EXTERNAL_PRODUCTS_TAG);
    return { success: true };
  } catch (error) {
    console.error(
      "Error updating external product delivery time extra day:",
      error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateExternalProductName(
  externalProductId: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    const tenantId = await getRequestTenantScopeId();

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: "Product name is required" };
    }

    const db = getDb();
    const docRef = db.collection("externalProducts").doc(externalProductId);
    const doc = await docRef.get();

    if (
      !doc.exists ||
      !tenantOwnedDataMatches(
        doc.data() as { tenantId?: string | null } | undefined,
        tenantId,
      )
    ) {
      return { success: false, error: "External product not found" };
    }

    await docRef.update({
      originalName: trimmedName,
      updatedAt: FieldValue.serverTimestamp(),
    });

    updateTag(EXTERNAL_PRODUCTS_TAG);
    return { success: true };
  } catch (error) {
    console.error("Error updating external product name:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update attribute mappings for an external product
 */
export async function updateExternalProductMappings(request: {
  externalProductId: string;
  attributeMappings: AttributeMapping[];
  pricingExclusionRules?: ExternalProductPricingExclusionRule[];
}) {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.update");
    await assertExternalProviderImportEnabled(
      "admin.external-product.update-mappings",
    );
    const tenantId = await getRequestTenantScopeId();
    const { externalProductId, attributeMappings, pricingExclusionRules } =
      request;
    const db = getDb();

    const externalDoc = await db
      .collection("externalProducts")
      .doc(externalProductId)
      .get();

    if (
      !externalDoc.exists ||
      !tenantOwnedDataMatches(
        externalDoc.data() as { tenantId?: string | null } | undefined,
        tenantId,
      )
    ) {
      return {
        success: false,
        error: "External product not found",
      };
    }

    const externalProduct = externalDoc.data() as ExternalProduct;
    const externalAttributeByKey = new Map<string, ExternalAttribute>();
    for (const attribute of externalProduct.attributes ?? []) {
      const key = attribute.id || attribute.name;
      externalAttributeByKey.set(key, attribute);
      if (key !== attribute.name) {
        externalAttributeByKey.set(attribute.name, attribute);
      }
    }
    const sanitizedMappings = normalizeAttributeMappings({
      externalAttributes: externalProduct.attributes ?? [],
      mappings: removeUndefinedDeep(attributeMappings) as AttributeMapping[],
    });
    const duplicateMappings =
      getDuplicateInternalAttributeMappings(sanitizedMappings);

    if (duplicateMappings.length > 0) {
      const internalAttributesById = new Map<string, Pick<Attribute, "name">>();
      const internalAttributes = await getInternalAttributesCached();

      for (const attribute of internalAttributes) {
        internalAttributesById.set(attribute.id, attribute);
      }

      const duplicateMappingsSummary = formatDuplicateInternalAttributeMappings(
        {
          duplicateMappings,
          internalAttributesById,
        },
      );

      return {
        success: false,
        duplicateMappingsSummary,
        error: `Each internal attribute can only be mapped once. ${duplicateMappingsSummary}.`,
      };
    }
    const sanitizedPricingExclusionRules = (pricingExclusionRules ?? [])
      .map((rule) => {
        const sanitizedWhen = Object.fromEntries(
          Object.entries(rule.when ?? {})
            .map(([attributeName, values]) => {
              const attribute = externalAttributeByKey.get(attributeName);

              if (!attribute) {
                return null;
              }

              const sanitizedValues = [...new Set(values ?? [])].filter(
                (value) => attribute.values.includes(value),
              );

              if (sanitizedValues.length === 0) {
                return null;
              }

              return [attributeName, sanitizedValues] as const;
            })
            .filter((entry): entry is readonly [string, string[]] =>
              Boolean(entry),
            ),
        );
        const conditionAttributeNames = new Set(Object.keys(sanitizedWhen));
        const sanitizedOmitAttributes = [...new Set(rule.omitAttributes ?? [])]
          .filter((attributeName) => externalAttributeByKey.has(attributeName))
          .filter(
            (attributeName) => !conditionAttributeNames.has(attributeName),
          );
        const sanitizedExcludeValues = Object.fromEntries(
          Object.entries(rule.excludeValues ?? {})
            .map(([attributeName, values]) => {
              const attribute = externalAttributeByKey.get(attributeName);

              if (!attribute || conditionAttributeNames.has(attributeName)) {
                return null;
              }

              const sanitizedValues = [...new Set(values ?? [])].filter(
                (value) => attribute.values.includes(value),
              );

              if (sanitizedValues.length === 0) {
                return null;
              }

              return [attributeName, sanitizedValues] as const;
            })
            .filter((entry): entry is readonly [string, string[]] =>
              Boolean(entry),
            ),
        );

        if (
          Object.keys(sanitizedWhen).length === 0 ||
          (sanitizedOmitAttributes.length === 0 &&
            Object.keys(sanitizedExcludeValues).length === 0)
        ) {
          return null;
        }

        return {
          when: sanitizedWhen,
          ...(sanitizedOmitAttributes.length > 0
            ? { omitAttributes: sanitizedOmitAttributes }
            : {}),
          ...(Object.keys(sanitizedExcludeValues).length > 0
            ? { excludeValues: sanitizedExcludeValues }
            : {}),
          ...(rule.source ? { source: rule.source } : {}),
        } satisfies ExternalProductPricingExclusionRule;
      })
      .filter((rule): rule is ExternalProductPricingExclusionRule =>
        Boolean(rule),
      );

    const updateData: Record<string, unknown> = {
      attributeMappings: sanitizedMappings,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (sanitizedPricingExclusionRules.length > 0) {
      updateData.pricingExclusionRules = removeUndefinedDeep(
        sanitizedPricingExclusionRules,
      );
    } else {
      updateData.pricingExclusionRules = FieldValue.delete();
    }

    await db
      .collection("externalProducts")
      .doc(externalProductId)
      .update(updateData);

    updateTag(EXTERNAL_PRODUCTS_TAG);

    return { success: true };
  } catch (error) {
    console.error("Error updating external product mappings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function suggestExternalProductPricingExclusionRules(request: {
  attributeMappings: AttributeMapping[];
  description: string;
  existingPricingExclusionRules?: ExternalProductPricingExclusionRule[];
  externalProductId: string;
}): Promise<{
  estimatedConfigurationCountBefore?: number;
  error?: string;
  rules: ExternalProductPricingExclusionRule[];
  success: boolean;
  summary?: string;
  warnings: string[];
}> {
  try {
    await checkAdmin();
    await assertExternalProviderImportEnabled(
      "admin.external-product.suggest-pricing-exclusions",
    );

    const description = request.description.trim();

    if (description.length === 0) {
      return {
        success: false,
        rules: [],
        warnings: [],
        error: "Describe supplier option exclusions first.",
      };
    }

    const tenantId = await getRequestTenantScopeId();
    const db = getDb();
    const externalProductResult = await getTenantScopedExternalProduct({
      db,
      externalProductId: request.externalProductId,
      ...(tenantId ? { tenantId } : {}),
    });

    if (!externalProductResult) {
      return {
        success: false,
        rules: [],
        warnings: [],
        error: "External product not found",
      };
    }

    const externalProduct = externalProductResult.data;
    const externalAttributes = externalProduct.attributes ?? [];
    const sanitizedMappings = normalizeAttributeMappings({
      externalAttributes,
      mappings: removeUndefinedDeep(
        request.attributeMappings,
      ) as AttributeMapping[],
    });
    const result = await generatePricingExclusionRulesFromDescription({
      attributeMappings: sanitizedMappings,
      description,
      existingRules:
        request.existingPricingExclusionRules ??
        externalProduct.pricingExclusionRules,
      externalAttributes,
      productName: externalProduct.originalName,
    });
    const configurationParams =
      externalProduct.pricingSelection?.configurationParams;
    const fixedSelections = getProviderOnlyPricingSelections(
      sanitizedMappings,
      externalAttributes,
    );
    const estimatedConfigurationCountBefore = configurationParams
      ? getExpectedPricingConfigurationCount({
          attributeMappings: sanitizedMappings,
          configurationParams,
          externalAttributes,
          fixedSelections,
        })
      : undefined;

    return {
      success: true,
      estimatedConfigurationCountBefore,
      rules: result.rules,
      summary: result.summary,
      warnings: result.warnings,
    };
  } catch (error) {
    console.error("Error suggesting pricing exclusion rules:", error);
    return {
      success: false,
      rules: [],
      warnings: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Suggest a ProductType based on external product data using LLM
 */
async function suggestProductType(
  externalProduct: ExternalProduct,
  productTypes: Array<{
    id: string;
    name: string;
    attributes?: string[];
    isShippable?: boolean;
  }>,
): Promise<{
  id: string;
  name: string;
  attributes: string[];
  isShippable: boolean;
} | null> {
  if (productTypes.length === 0) {
    return null;
  }

  try {
    const model = await getVertexModel();

    const suggestionTool = tool({
      description:
        "Suggest the best matching product type for an external product",
      inputSchema: z.object({
        productTypeId: z
          .string()
          .describe("ID of the best matching product type"),
        confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
      }),
      execute: async (data) => data,
    });

    const prompt = `You are matching an external product to internal product types.

External Product:
- Name: ${externalProduct.originalName}
- Description: ${externalProduct.originalDescription || "No description"}
- Attributes: ${JSON.stringify(externalProduct.attributes?.map((a) => a.name) || [])}
- Keywords: ${JSON.stringify(externalProduct.keywords || [])}

Available Product Types:
${JSON.stringify(
  productTypes.map((pt) => ({ id: pt.id, name: pt.name })),
  null,
  2,
)}

Select the best matching product type ID. If none match well, pick the most general one.
Call the suggestion tool with the productTypeId and confidence score.`;

    const { toolCalls } = await generateText({
      model,
      prompt,
      tools: { suggestProductType: suggestionTool },
      temperature: 0.2,
    });

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "suggestProductType",
    );

    if (!toolCall || toolCall.dynamic) {
      return productTypes[0]
        ? {
            id: productTypes[0].id,
            name: productTypes[0].name,
            attributes: productTypes[0].attributes || [],
            isShippable: productTypes[0].isShippable ?? true,
          }
        : null;
    }

    const suggestion = toolCall.input as {
      productTypeId: string;
      confidence: number;
    };
    const matchedType = productTypes.find(
      (pt) => pt.id === suggestion.productTypeId,
    );

    if (matchedType) {
      return {
        id: matchedType.id,
        name: matchedType.name,
        attributes: matchedType.attributes || [],
        isShippable: matchedType.isShippable ?? true,
      };
    }

    // Fallback to first product type
    return productTypes[0]
      ? {
          id: productTypes[0].id,
          name: productTypes[0].name,
          attributes: productTypes[0].attributes || [],
          isShippable: productTypes[0].isShippable ?? true,
        }
      : null;
  } catch (error) {
    console.error("Error suggesting product type:", error);
    // Fallback to first product type
    return productTypes[0]
      ? {
          id: productTypes[0].id,
          name: productTypes[0].name,
          attributes: productTypes[0].attributes || [],
          isShippable: productTypes[0].isShippable ?? true,
        }
      : null;
  }
}

/**
 * Get external product converted to Product format for the create page
 * This returns the data without saving it to the database
 * Uses MATRIX pricing when external product has mapped attributes
 */
type ExternalProductForCreateOptions = {
  skipAiEnhancements?: boolean;
};

export async function getExternalProductForCreate(
  externalProductId: string,
  categoryId?: string,
  options: ExternalProductForCreateOptions = {},
): Promise<{
  success: boolean;
  product?: Partial<Product>;
  externalProduct?: ExternalProduct;
  duplicateMappingsSummary?: string;
  error?: string;
  warnings?: ImportWarning[];
}> {
  try {
    const skipAiEnhancements = options.skipAiEnhancements === true;
    await checkAdmin();
    const db = getDb();

    // Get external product
    const externalDoc = await db
      .collection("externalProducts")
      .doc(externalProductId)
      .get();

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProduct = externalDoc.data() as ExternalProduct;

    // Validate that we have necessary data
    if (!externalProduct.originalName) {
      return { success: false, error: "Product name is required" };
    }

    const currentLanguage = await getCurrentAdminLanguage();
    const localizedOriginalName = selectLocalizedTitle(
      externalProduct.originalName,
      currentLanguage,
    );

    const sourceMappings = externalProduct.attributeMappings ?? [];
    const allAttributes =
      sourceMappings.length > 0 ? await getInternalAttributesCached() : [];
    const internalAttributesById = new Map<string, Attribute>();

    for (const attr of allAttributes) {
      internalAttributesById.set(attr.id, attr);
    }

    // Use suggested mappings from the external product
    const mappings = normalizeAttributeMappings({
      externalAttributes: externalProduct.attributes ?? [],
      internalAttributes: allAttributes,
      mappings: sourceMappings,
    });

    const selectedMappings = mappings.filter(
      (mapping) =>
        !mapping.ignored &&
        !mapping.providerOnlyPricing &&
        mapping.internalAttributeId &&
        mapping.verified !== false,
    );
    const manuallyMarkedPageCountAttributeName = mappings.find(
      (mapping) => mapping.specialRole === "pageCount",
    )?.externalAttributeName;
    const pageCountCandidate = inferExternalProductPageCount(
      externalProduct.attributes,
      manuallyMarkedPageCountAttributeName,
    );
    const pageCountAttributeName = pageCountCandidate?.attributeName;
    const rangedDimensions = inferExternalRangedDimensions(
      externalProduct.attributes,
    );
    const rangedDimensionAttributeNames =
      getRangedDimensionAttributeNames(rangedDimensions);
    const selectedMappingsForProduct = filterProductAttributeMappings({
      mappings: selectedMappings,
      pageCountAttributeName,
      rangedDimensionAttributeNames,
    });

    const duplicateMappings = getDuplicateInternalAttributeMappings(
      selectedMappingsForProduct,
    );

    if (duplicateMappings.length > 0) {
      const duplicateMappingsSummary = formatDuplicateInternalAttributeMappings(
        {
          duplicateMappings,
          internalAttributesById,
        },
      );

      return {
        success: false,
        duplicateMappingsSummary,
        error: `Each internal attribute can only be mapped once before creating the product. ${duplicateMappingsSummary}.`,
      };
    }

    // Extract mapped attribute IDs and options (all mapped attributes)
    const productAttributes: string[] = [];
    const productAttributeOptions: { [key: string]: string[] } = {};

    const addAttributeOptions = (attributeId: string, options: string[]) => {
      if (options.length === 0) return;
      const existing = productAttributeOptions[attributeId] || [];
      productAttributeOptions[attributeId] = [
        ...new Set([...existing, ...options]),
      ];
    };

    const skippedAttributeNames: string[] = [];

    for (const mapping of selectedMappingsForProduct) {
      if (!mapping.internalAttributeId) continue;

      const internalAttribute = internalAttributesById.get(
        mapping.internalAttributeId,
      );

      const externalAttr = findExternalAttributeByKey(
        externalProduct.attributes,
        mapping.externalAttributeName,
      );

      const mappedOptions = collectMappedAttributeOptions({
        externalAttribute: externalAttr,
        internalAttribute,
        mapping,
      });

      if (mappedOptions.length > 0) {
        if (!productAttributes.includes(mapping.internalAttributeId)) {
          productAttributes.push(mapping.internalAttributeId);
        }
        addAttributeOptions(mapping.internalAttributeId, mappedOptions);
      } else if (!internalAttribute?.options?.length) {
        // Attribute has no options (e.g. free-text) — still include it
        if (!productAttributes.includes(mapping.internalAttributeId)) {
          productAttributes.push(mapping.internalAttributeId);
        }
      } else {
        // Options exist but none could be resolved — track for warnings
        skippedAttributeNames.push(
          internalAttribute?.name ?? mapping.externalAttributeName,
        );
      }
    }

    const importWarnings: ImportWarning[] = [];

    for (const name of skippedAttributeNames) {
      importWarnings.push({
        key: "attributeSkippedNoOptions",
        params: { name },
      });
    }

    const normalizedPriceRanges = normalizePriceRanges(
      externalProduct.priceInfo,
    );
    const priceConfigurations = await readPriceConfigurations({
      docRef: externalDoc.ref,
      externalProduct,
    });

    if (
      normalizedPriceRanges.length === 0 &&
      priceConfigurations.length === 0
    ) {
      importWarnings.push({
        key: "noPriceData",
      });
    } else if (
      priceConfigurations.length === 0 &&
      normalizedPriceRanges.length > 0
    ) {
      importWarnings.push({
        key: "basePriceRangesOnly",
        params: { count: normalizedPriceRanges.length },
      });
    }

    if (
      priceConfigurations.length > 0 &&
      selectedMappingsForProduct.length === 0 &&
      !rangedDimensions &&
      !pageCountCandidate
    ) {
      importWarnings.push({
        key: "noAttributeMappings",
        params: { count: priceConfigurations.length },
      });
    }

    const normalizedPriceConfigurations =
      normalizePriceConfigurations(priceConfigurations);

    // Detect if supplier chunks store all-zero prices (likely a per-unit vs
    // total price extraction bug)
    if (normalizedPriceConfigurations.length > 0) {
      const allPricesZero = normalizedPriceConfigurations.every(
        (config) =>
          config.priceRanges.length > 0 &&
          config.priceRanges.every((range) => range.price === 0),
      );
      if (allPricesZero) {
        importWarnings.push({
          key: "allPricesZero",
        });
      }
    }
    const configuredPageCountValues =
      pageCountCandidate && normalizedPriceConfigurations.length > 0
        ? collectConfiguredPageCountValues({
            configurations: normalizedPriceConfigurations,
            pageCountAttributeName: pageCountCandidate.attributeName,
          })
        : [];
    const compactedPageCountConfigurations =
      pageCountCandidate &&
      normalizedPriceConfigurations.length > 0 &&
      configuredPageCountValues !== null
        ? compactPriceConfigurationsByPageCount({
            configurations: normalizedPriceConfigurations,
            pageCount: pageCountCandidate.pageCount,
            pageCountAttributeName: pageCountCandidate.attributeName,
          })
        : null;
    const segmentedPageCountConfigurations =
      pageCountCandidate &&
      normalizedPriceConfigurations.length > 0 &&
      configuredPageCountValues !== null
        ? segmentPriceConfigurationsByPageCount({
            configurations: normalizedPriceConfigurations,
            pageCount: pageCountCandidate.pageCount,
            pageCountAttributeName: pageCountCandidate.attributeName,
          })
        : null;
    const resolvedSegmentedPageCount:
      | NonNullable<Product["pageCount"]>
      | undefined =
      pageCountCandidate &&
      configuredPageCountValues &&
      configuredPageCountValues.length > 0
        ? {
            ...pageCountCandidate.pageCount,
            minimum: configuredPageCountValues[0],
            maximum:
              configuredPageCountValues[configuredPageCountValues.length - 1],
          }
        : pageCountCandidate?.pageCount;
    const effectivePageCount: NonNullable<Product["pageCount"]> | undefined =
      pageCountCandidate &&
      (normalizedPriceConfigurations.length === 0 ||
        compactedPageCountConfigurations ||
        segmentedPageCountConfigurations ||
        (configuredPageCountValues !== null &&
          Boolean(configuredPageCountValues?.length)))
        ? (compactedPageCountConfigurations?.pageCount ??
          segmentedPageCountConfigurations?.pageCount ??
          resolvedSegmentedPageCount)
        : undefined;
    const shouldUseSegmentedApproximation =
      !compactedPageCountConfigurations &&
      !!segmentedPageCountConfigurations &&
      segmentedPageCountConfigurations.segmentConfigurationSets.length > 1;
    const shouldUseApproximatedSingleStepModel =
      !compactedPageCountConfigurations &&
      !!segmentedPageCountConfigurations &&
      segmentedPageCountConfigurations.segmentConfigurationSets.length === 1;
    const pageCountPricingMode =
      effectivePageCount &&
      normalizedPriceConfigurations.length > 0 &&
      pageCountAttributeName &&
      !compactedPageCountConfigurations
        ? shouldUseSegmentedApproximation
          ? "segmented"
          : shouldUseApproximatedSingleStepModel
            ? "step"
            : "exact"
        : "step";
    const dimensionMappedAttributeIds = selectedMappings
      .filter(
        (mapping) =>
          rangedDimensionAttributeNames.has(mapping.externalAttributeName) &&
          Boolean(mapping.internalAttributeId),
      )
      .map((mapping) => mapping.internalAttributeId)
      .filter((attributeId): attributeId is string => Boolean(attributeId));

    const attributeDependencies =
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings: selectedMappingsForProduct,
        externalAttributes: externalProduct.attributes ?? [],
        internalAttributesById,
        pricingExclusionRules: externalProduct.pricingExclusionRules,
        productAttributeOptions,
      });
    const impossibleDependentAttributeIds =
      collectImpossibleDependentAttributeIds({
        attributeDependencies,
        attributeIds: productAttributes,
      });

    for (const attributeId of impossibleDependentAttributeIds) {
      const attr = internalAttributesById.get(attributeId);
      importWarnings.push({
        key: "attributeRemovedImpossible",
        params: { name: attr?.name ?? attributeId },
      });

      delete attributeDependencies[attributeId];
      delete productAttributeOptions[attributeId];

      const attributeIndex = productAttributes.indexOf(attributeId);

      if (attributeIndex >= 0) {
        productAttributes.splice(attributeIndex, 1);
      }
    }

    const orderedProductAttributes = sortAttributeIdsByDependencies(
      productAttributes,
      attributeDependencies,
    );
    const effectiveNormalizedPriceConfigurations =
      pageCountPricingMode === "exact"
        ? normalizedPriceConfigurations
        : shouldUseApproximatedSingleStepModel
          ? (segmentedPageCountConfigurations?.segmentConfigurationSets[0]
              ?.baseConfigurations ?? normalizedPriceConfigurations)
          : pageCountPricingMode === "segmented"
            ? (segmentedPageCountConfigurations?.segmentConfigurationSets[0]
                ?.baseConfigurations ?? normalizedPriceConfigurations)
            : (compactedPageCountConfigurations?.baseConfigurations ??
              normalizedPriceConfigurations);
    const effectivePageCountStepConfigurations =
      pageCountPricingMode === "step"
        ? shouldUseApproximatedSingleStepModel
          ? (segmentedPageCountConfigurations?.segmentConfigurationSets[0]
              ?.stepConfigurations ?? [])
          : (compactedPageCountConfigurations?.stepConfigurations ?? [])
        : pageCountPricingMode === "segmented"
          ? (segmentedPageCountConfigurations?.segmentConfigurationSets[0]
              ?.stepConfigurations ?? [])
          : [];
    const primaryPriceRanges =
      normalizedPriceRanges.length > 0
        ? normalizedPriceRanges
        : (effectiveNormalizedPriceConfigurations[0]?.priceRanges ?? []);
    const hasMappedAttributes = productAttributes.length > 0;
    const mappedExternalAttributeNames = new Set(
      selectedMappingsForProduct.map(
        (mapping) => mapping.externalAttributeName,
      ),
    );
    const hasMappedConfigurationDimensions =
      effectiveNormalizedPriceConfigurations.some((configuration) =>
        Object.keys(configuration.configuration).some((attributeName) =>
          mappedExternalAttributeNames.has(attributeName),
        ),
      );
    const shouldUseMatrix =
      Boolean(rangedDimensions) ||
      hasMappedAttributes ||
      hasMappedConfigurationDimensions;
    const hasConfigurationPrices =
      effectiveNormalizedPriceConfigurations.length > 0;

    // Extract volumes from price ranges or use defaults
    const configurationVolumes = effectiveNormalizedPriceConfigurations.flatMap(
      (configuration) =>
        configuration.priceRanges.map((range) => range.quantity),
    );

    const extractedVolumes = (
      configurationVolumes.length > 0
        ? configurationVolumes
        : primaryPriceRanges.map((range) => range.quantity)
    )
      .filter((q) => q > 0)
      .toSorted((a, b) => a - b);

    // Use extracted volumes or defaults
    const volumeValues =
      extractedVolumes.length > 0
        ? [...new Set(extractedVolumes)]
        : [1, 10, 50, 100];

    const volumes = volumeValues.map((value) => ({ value }));

    const currency = resolveImportedCurrency(
      externalProduct.priceInfo,
      importWarnings,
    );

    const hasPriceRanges =
      primaryPriceRanges.length > 0 || hasConfigurationPrices;
    const mappedAttributes = orderedProductAttributes
      .map((attributeId) => internalAttributesById.get(attributeId))
      .filter((attr): attr is Attribute => Boolean(attr));
    const basePriceConfigurations =
      pageCountPricingMode === "exact" &&
      pageCountAttributeName &&
      effectivePageCount
        ? normalizedPriceConfigurations.filter((configuration) => {
            const parsedPageCount = parseExternalPageCountValue(
              configuration.configuration[pageCountAttributeName],
            );

            return parsedPageCount === effectivePageCount.minimum;
          })
        : effectiveNormalizedPriceConfigurations;
    const dynamicPricingPriceConfigurations =
      effectivePageCount && pageCountAttributeName
        ? normalizedPriceConfigurations
        : basePriceConfigurations;
    const dynamicPricingSourceRows = buildExternalDynamicPricingSourceRows({
      configurations: dynamicPricingPriceConfigurations,
      externalAttributes: externalProduct.attributes ?? [],
      fallbackPriceRanges:
        pageCountPricingMode === "exact" ? [] : primaryPriceRanges,
      pageCountAttributeName,
      productAttributeOptions,
      resolvePageCountValue: parseExternalPageCountValue,
      selectedMappings: selectedMappingsForProduct,
    });
    const pageCountConstraints =
      buildExternalPageCountConstraintsFromSourceRows({
        pageCount: effectivePageCount,
        productAttributeOptions,
        rows: dynamicPricingSourceRows,
      });
    const effectivePageCountForProduct = effectivePageCount
      ? {
          ...effectivePageCount,
          ...(pageCountConstraints.length > 0
            ? { constraints: pageCountConstraints }
            : {}),
        }
      : undefined;
    const generatedDynamicPricing =
      !skipAiEnhancements &&
      shouldUseMatrix &&
      hasPriceRanges &&
      dynamicPricingSourceRows.length > 0
        ? await generateExternalProductDynamicPricingConfig({
            attributeDependencies,
            attributes: mappedAttributes,
            pageCount: effectivePageCountForProduct,
            productAttributeOptions,
            productName: localizedOriginalName,
            rows: dynamicPricingSourceRows,
            volumes: volumeValues,
            currency,
          })
        : undefined;

    // Determine price type
    const priceType: PriceTypeEnum = generatedDynamicPricing
      ? PriceTypeEnum.DYNAMIC
      : shouldUseMatrix
        ? PriceTypeEnum.MATRIX
        : hasPriceRanges && primaryPriceRanges.length > 1
          ? PriceTypeEnum.THRESHOLD
          : PriceTypeEnum.SINGLE;

    // Fetch product types for suggestion — use cached suggestion if available
    let productType: {
      id: string;
      name: string;
      attributes: string[];
      isShippable: boolean;
    } | null = null;

    if (priceType === PriceTypeEnum.MATRIX) {
      try {
        const productTypesQuery = await db.collection("productTypes").get();
        const productTypes = productTypesQuery.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Array<{
          id: string;
          name: string;
          attributes?: string[];
          isShippable?: boolean;
        }>;

        if (productTypes.length > 0) {
          // Reuse cached suggestion if present
          const cachedTypeId = externalProduct.suggestedProductTypeId;
          const cachedMatch = cachedTypeId
            ? productTypes.find((pt) => pt.id === cachedTypeId)
            : undefined;

          if (cachedMatch) {
            productType = {
              id: cachedMatch.id,
              name: cachedMatch.name,
              attributes: cachedMatch.attributes || [],
              isShippable: cachedMatch.isShippable ?? true,
            };
          } else if (!skipAiEnhancements) {
            productType = await suggestProductType(
              externalProduct,
              productTypes,
            );

            // Persist the suggestion for future loads
            if (productType) {
              try {
                await db
                  .collection("externalProducts")
                  .doc(externalProductId)
                  .update({ suggestedProductTypeId: productType.id });
              } catch {
                // Non-critical, ignore persistence failures
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching product types:", error);
      }
    }

    const productTypeAttributeIdsToRemove = new Set<string>(
      dimensionMappedAttributeIds,
    );

    if (productType && productTypeAttributeIdsToRemove.size > 0) {
      productType = {
        ...productType,
        attributes: productType.attributes.filter(
          (attributeId) => !productTypeAttributeIdsToRemove.has(attributeId),
        ),
      };
    }

    // Default placeholder price
    const defaultPriceObject: Price = {
      value: 0,
      threshold: 1,
      currency,
    };

    const resolveMatrixCombinationId =
      priceType !== PriceTypeEnum.MATRIX
        ? undefined
        : createImportedMatrixCombinationResolver({
            attributeDependencies,
            externalAttributes: externalProduct.attributes ?? [],
            internalAttributesById,
            orderedProductAttributes,
            productAttributeOptions,
            selectedMappings: selectedMappingsForProduct,
          });
    const buildImportedPricesFromNormalizedData = (params: {
      includeNonMatrixFallback?: boolean;
      priceConfigurations: NormalizedPriceConfiguration[];
      priceRanges: NormalizedPriceRange[];
    }): Price[] => {
      const {
        includeNonMatrixFallback = true,
        priceConfigurations: sourcePriceConfigurations,
        priceRanges: sourcePriceRanges,
      } = params;

      if (
        sourcePriceConfigurations.length === 0 &&
        sourcePriceRanges.length === 0
      ) {
        return [];
      }

      let resolvedPrices: Price[] = [];

      if (priceType === PriceTypeEnum.MATRIX) {
        if (sourcePriceConfigurations.length > 0) {
          if (rangedDimensions && resolveMatrixCombinationId) {
            resolvedPrices = buildRangedDimensionMatrixPrices({
              configurations: sourcePriceConfigurations,
              currency,
              dimensions: rangedDimensions,
              resolveCombinationId: resolveMatrixCombinationId,
            });
          }

          if (resolvedPrices.length === 0 && resolveMatrixCombinationId) {
            const resolvedPriceMap = new Map<string, Price>();
            let unmappedConfigurationCount = 0;

            for (const configuration of sourcePriceConfigurations) {
              const combinationId = resolveMatrixCombinationId(
                configuration.configuration,
              );

              if (!combinationId) {
                unmappedConfigurationCount++;
                continue;
              }

              for (const range of configuration.priceRanges) {
                const priceKey = `${combinationId}:${range.quantity}`;

                if (resolvedPriceMap.has(priceKey)) {
                  continue;
                }

                resolvedPriceMap.set(priceKey, {
                  combination: {
                    id: combinationId,
                    active: true,
                    customFormat: false,
                  },
                  volume: {
                    value: range.quantity,
                    deliveryTime: getResolvedImportedDeliveryTime(
                      range.deliveryTime,
                    ),
                  },
                  currency,
                  value: range.price,
                });
              }
            }

            resolvedPrices = Array.from(resolvedPriceMap.values());

            if (unmappedConfigurationCount > 0) {
              const mapped =
                sourcePriceConfigurations.length - unmappedConfigurationCount;
              importWarnings.push({
                key: "unmappedConfigurations",
                params: {
                  mapped,
                  total: sourcePriceConfigurations.length,
                  unmapped: unmappedConfigurationCount,
                },
              });
            }
          }
        }

        if (resolvedPrices.length === 0) {
          const combinationOptionValues: string[][] = [];

          for (const attributeId of orderedProductAttributes) {
            const attribute = internalAttributesById.get(attributeId);

            if (!attribute?.calculated) {
              continue;
            }

            const options = productAttributeOptions[attributeId];

            if (options && options.length > 0) {
              combinationOptionValues.push(options);
            }
          }

          const combinationIds = getCombinations(
            combinationOptionValues,
          ).filter((combinationId) => combinationId.length > 0);
          resolvedPrices = buildImportedMatrixRangeFallbackPrices({
            currency,
            priceConfigurationsCount: sourcePriceConfigurations.length,
            priceRanges: sourcePriceRanges,
            targetCombinationIds: combinationIds,
          });
        }

        return resolvedPrices;
      }

      const rangesSource =
        sourcePriceRanges.length > 0
          ? sourcePriceRanges
          : (sourcePriceConfigurations[0]?.priceRanges ?? []);

      if (priceType === PriceTypeEnum.THRESHOLD) {
        resolvedPrices = rangesSource.map((range) => ({
          value: range.price,
          threshold: range.quantity,
          currency,
        }));
      } else {
        const firstRange = rangesSource[0];

        if (firstRange) {
          resolvedPrices = [
            {
              value: firstRange.price,
              currency,
            },
          ];
        }
      }

      if (resolvedPrices.length === 0 && includeNonMatrixFallback) {
        return [defaultPriceObject];
      }

      return resolvedPrices;
    };

    const prices =
      priceType === PriceTypeEnum.DYNAMIC
        ? []
        : hasPriceRanges
          ? buildImportedPricesFromNormalizedData({
              priceConfigurations: basePriceConfigurations,
              priceRanges:
                pageCountPricingMode === "exact" ? [] : primaryPriceRanges,
            })
          : [];
    const pageCountStepPrices =
      priceType !== PriceTypeEnum.DYNAMIC && effectivePageCount
        ? buildImportedPricesFromNormalizedData({
            includeNonMatrixFallback: false,
            priceConfigurations: effectivePageCountStepConfigurations,
            priceRanges: [],
          })
        : [];
    const pageCountSegmentPrices =
      priceType !== PriceTypeEnum.DYNAMIC &&
      pageCountPricingMode === "segmented" &&
      segmentedPageCountConfigurations
        ? segmentedPageCountConfigurations.segmentConfigurationSets.map(
            (segment, index) => ({
              minimum: segment.minimum,
              maximum: segment.maximum,
              basePrices:
                index === 0
                  ? prices
                  : buildImportedPricesFromNormalizedData({
                      includeNonMatrixFallback: false,
                      priceConfigurations: segment.baseConfigurations,
                      priceRanges: [],
                    }),
              stepPrices:
                index === 0
                  ? pageCountStepPrices
                  : buildImportedPricesFromNormalizedData({
                      includeNonMatrixFallback: false,
                      priceConfigurations: segment.stepConfigurations,
                      priceRanges: [],
                    }),
            }),
          )
        : [];
    const pageCountExactPrices =
      priceType !== PriceTypeEnum.DYNAMIC &&
      pageCountPricingMode === "exact" &&
      effectivePageCount &&
      pageCountAttributeName &&
      Array.isArray(configuredPageCountValues)
        ? configuredPageCountValues.map((pageCountValue) => ({
            pageCount: pageCountValue,
            prices: buildImportedPricesFromNormalizedData({
              includeNonMatrixFallback: false,
              priceConfigurations: normalizedPriceConfigurations.filter(
                (configuration) => {
                  const parsedPageCount = parseExternalPageCountValue(
                    configuration.configuration[pageCountAttributeName],
                  );

                  return parsedPageCount === pageCountValue;
                },
              ),
              priceRanges: [],
            }),
          }))
        : [];

    // Collect diagnostic warnings about price resolution
    if (!hasPriceRanges) {
      importWarnings.push({
        key: "noPriceRanges",
      });
    } else if (priceType !== PriceTypeEnum.DYNAMIC && prices.length === 0) {
      importWarnings.push({
        key: "zeroPricesResolved",
        params: {
          priceType,
          configCount: basePriceConfigurations.length,
          rangeCount: primaryPriceRanges.length,
        },
      });
    }

    if (priceType === PriceTypeEnum.MATRIX && prices.length > 0) {
      const samplePrice = prices[0];
      const activeCombinations = new Set<string>();
      const sampleVolumeValues = new Set<number>();

      for (const p of prices) {
        const comboId =
          p.combination && "id" in p.combination
            ? (p.combination as { id: string }).id
            : undefined;
        const volValue =
          p.volume && "value" in p.volume
            ? (p.volume as { value: number }).value
            : undefined;

        if (comboId) activeCombinations.add(comboId);
        if (typeof volValue === "number") sampleVolumeValues.add(volValue);
      }

      if (activeCombinations.size === 0) {
        importWarnings.push({
          key: "noCombinationsMapped",
        });
      }

      importWarnings.push({
        key: "priceResolutionSummary",
        params: {
          priceCount: prices.length,
          combinationCount: activeCombinations.size,
          volumeCount: sampleVolumeValues.size,
          sampleValue: samplePrice?.value ?? 0,
        },
      });
    }

    if (volumes.length === 0) {
      importWarnings.push({
        key: "noVolumeTiers",
      });
    }

    if (
      orderedProductAttributes.length === 0 &&
      priceType === PriceTypeEnum.MATRIX
    ) {
      importWarnings.push({
        key: "matrixNoAttributes",
      });
    }

    const importedProductSpec = buildImportedProductSpec({
      defaultOrder: volumes[0]?.value || 1,
      rangedDimensions,
    });
    const calculatedPrices =
      priceType === PriceTypeEnum.DYNAMIC && generatedDynamicPricing
        ? calculateDynamicListingPrices({
            config: generatedDynamicPricing,
            currency,
            product: {
              attributeDependencies,
              attributeOptions: productAttributeOptions,
              attributes: orderedProductAttributes,
              customSize: Boolean(rangedDimensions),
              pageCount: effectivePageCountForProduct,
              spec: importedProductSpec,
              volumes,
            },
          })
        : updateCalculatedPrices(
            prices.length > 0 ? prices : [defaultPriceObject],
            mappedAttributes,
            volumes[0]?.value || 1,
            priceType,
            attributeDependencies,
          );

    // Create partial Product object for form prefill
    const product: Partial<Product> = {
      name: localizedOriginalName,
      description: externalProduct.originalDescription || "",

      // Pricing
      priceType,
      prices:
        priceType === PriceTypeEnum.DYNAMIC
          ? []
          : (prices as Product["prices"]),
      dynamicPricing: generatedDynamicPricing,
      defaultPrice: calculatedPrices.defaultPrice as Product["defaultPrice"],
      lowPrice: calculatedPrices.lowPrice as Product["lowPrice"],
      highPrice: calculatedPrices.highPrice as Product["highPrice"],

      // ProductType for MATRIX
      productType:
        priceType === PriceTypeEnum.MATRIX
          ? productType
            ? productType
            : skipAiEnhancements
              ? undefined
              : null
          : null,
      pageCount: effectivePageCountForProduct
        ? {
            ...effectivePageCountForProduct,
            pricing:
              priceType === PriceTypeEnum.DYNAMIC
                ? undefined
                : pageCountPricingMode === "exact"
                  ? {
                      mode: "exact",
                      exactPrices: pageCountExactPrices,
                    }
                  : pageCountPricingMode === "segmented"
                    ? {
                        mode: "segmented",
                        segments:
                          segmentedPageCountConfigurations?.segments ?? [],
                        stepPrices: pageCountStepPrices,
                        segmentPrices: pageCountSegmentPrices,
                      }
                    : pageCountStepPrices.length > 0
                      ? {
                          mode: "step",
                          stepPrices: pageCountStepPrices,
                        }
                      : {
                          mode: "step",
                        },
          }
        : undefined,

      // Attributes from mappings
      attributes: orderedProductAttributes,
      attributeOptions: productAttributeOptions,
      attributeDependencies,

      customSize: Boolean(rangedDimensions),
      customSizes: [],

      // Volumes for pricing tiers
      volumes: volumes as Product["volumes"],

      spec: importedProductSpec,

      // SEO configuration
      seo: {
        slug: localizedOriginalName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
        title: localizedOriginalName,
        description: externalProduct.originalDescription || "",
      },

      // Category if provided
      category: categoryId
        ? ({
            id: categoryId,
            name: "",
          } as Product["category"])
        : undefined,

      keywords: externalProduct.keywords || [],
    };

    // Serialize the response to avoid Firestore Timestamp issues
    return {
      success: true,
      product: serializeFirestoreDeep(product) as Partial<Product>,
      externalProduct: serializeFirestoreDeep(
        externalProduct,
      ) as ExternalProduct,
      warnings: importWarnings.length > 0 ? importWarnings : undefined,
    };
  } catch (error) {
    console.error("Error getting external product for create:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Import external product into system as a Product
 */
export async function importExternalProduct(
  request: ImportExternalProductRequest,
): Promise<ImportExternalProductResponse> {
  try {
    await checkAdmin();
    await requireTenantPermission("catalog.products.create");
    await assertExternalProviderImportEnabled("admin.external-product.import");
    await assertExternalProductCreationAllowed("admin.external-product.import");
    const { externalProductId, channelId, attributeMappings, overrides } =
      request;

    if (!channelId) {
      return {
        success: false,
        error: "Channel ID is required to import product",
      };
    }

    const db = getDb();

    // Get external product
    const externalDoc = await db
      .collection("externalProducts")
      .doc(externalProductId)
      .get();

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProduct = externalDoc.data() as ExternalProduct;

    // Validate that we have necessary data
    if (!externalProduct.originalName) {
      return { success: false, error: "Product name is required" };
    }

    const currentLanguage = await getCurrentAdminLanguage();
    const localizedOriginalName = selectLocalizedTitle(
      externalProduct.originalName,
      currentLanguage,
    );

    const sourceMappings =
      attributeMappings || externalProduct.attributeMappings || [];
    const allAttributes =
      sourceMappings.length > 0 ? await getInternalAttributesCached() : [];
    const internalAttributesById = new Map<string, Attribute>();

    for (const attr of allAttributes) {
      internalAttributesById.set(attr.id, attr);
    }

    // Use provided mappings or fall back to suggested mappings
    const mappings = normalizeAttributeMappings({
      externalAttributes: externalProduct.attributes ?? [],
      internalAttributes: allAttributes,
      mappings: sourceMappings,
    });
    const selectedMappings = mappings.filter(
      (mapping) =>
        !mapping.ignored &&
        !mapping.providerOnlyPricing &&
        mapping.internalAttributeId &&
        mapping.verified !== false,
    );
    const manuallyMarkedPageCountAttributeName = mappings.find(
      (mapping) => mapping.specialRole === "pageCount",
    )?.externalAttributeName;
    const pageCountCandidate = inferExternalProductPageCount(
      externalProduct.attributes,
      manuallyMarkedPageCountAttributeName,
    );
    const selectedMappingsForProduct = filterProductAttributeMappings({
      mappings: selectedMappings,
      pageCountAttributeName: pageCountCandidate?.attributeName,
    });
    const duplicateMappings = getDuplicateInternalAttributeMappings(
      selectedMappingsForProduct,
    );

    if (duplicateMappings.length > 0) {
      const duplicateMappingsSummary = formatDuplicateInternalAttributeMappings(
        {
          duplicateMappings,
          internalAttributesById,
        },
      );

      return {
        success: false,
        duplicateMappingsSummary,
        error: `Each internal attribute can only be mapped once before import. ${duplicateMappingsSummary}.`,
      };
    }

    // Extract mapped attribute IDs and options
    const productAttributes: string[] = [];
    const productAttributeOptions: { [key: string]: string[] } = {};

    const addAttributeOptions = (attributeId: string, options: string[]) => {
      if (options.length === 0) {
        return;
      }

      const existing = productAttributeOptions[attributeId] || [];
      productAttributeOptions[attributeId] = [
        ...new Set([...existing, ...options]),
      ];
    };

    const skippedAttributeNames: string[] = [];

    for (const mapping of selectedMappingsForProduct) {
      if (!mapping.internalAttributeId) continue;

      const internalAttribute = internalAttributesById.get(
        mapping.internalAttributeId,
      );

      // Map option values
      const externalAttr = findExternalAttributeByKey(
        externalProduct.attributes,
        mapping.externalAttributeName,
      );

      const mappedOptions = collectMappedAttributeOptions({
        externalAttribute: externalAttr,
        internalAttribute,
        mapping,
      });

      if (mappedOptions.length > 0) {
        if (!productAttributes.includes(mapping.internalAttributeId)) {
          productAttributes.push(mapping.internalAttributeId);
        }
        addAttributeOptions(mapping.internalAttributeId, mappedOptions);
      } else if (!internalAttribute?.options?.length) {
        // Attribute has no options (e.g. free-text) — still include it
        if (!productAttributes.includes(mapping.internalAttributeId)) {
          productAttributes.push(mapping.internalAttributeId);
        }
      } else {
        // Options exist but none could be resolved — track for warnings
        skippedAttributeNames.push(
          internalAttribute?.name ?? mapping.externalAttributeName,
        );
      }
    }

    const attributeDependencies =
      buildProductAttributeDependenciesFromExternalPricing({
        attributeMappings: selectedMappingsForProduct,
        externalAttributes: externalProduct.attributes ?? [],
        internalAttributesById,
        pricingExclusionRules: externalProduct.pricingExclusionRules,
        productAttributeOptions,
      });
    const impossibleDependentAttributeIds =
      collectImpossibleDependentAttributeIds({
        attributeDependencies,
        attributeIds: productAttributes,
      });

    for (const attributeId of impossibleDependentAttributeIds) {
      delete attributeDependencies[attributeId];
      delete productAttributeOptions[attributeId];

      const attributeIndex = productAttributes.indexOf(attributeId);

      if (attributeIndex >= 0) {
        productAttributes.splice(attributeIndex, 1);
      }
    }

    const orderedProductAttributes = sortAttributeIdsByDependencies(
      productAttributes,
      attributeDependencies,
    );
    const warnings: ImportWarning[] = [];
    const currency = resolveImportedCurrency(
      externalProduct.priceInfo,
      warnings,
    );

    // Create Product object
    const product: Omit<Product, "id"> = {
      name: overrides?.name || localizedOriginalName,
      description:
        overrides?.description || externalProduct.originalDescription || "",

      // Required fields with sensible defaults
      prices: [], // Will need to be configured manually
      defaultPrice: {
        value: 0,
        currency,
      },
      lowPrice: {
        value: 0,
        currency,
      },
      highPrice: {
        value: 0,
        currency,
      },

      // Attributes from mappings
      attributes: orderedProductAttributes,
      attributeOptions: productAttributeOptions,
      attributeDependencies,
      pageCount: pageCountCandidate?.pageCount,

      // Default product configuration
      volumes: [],
      customSize: false,
      allowCustomPrice: false,
      recommended: false,
      difficulty: 1,

      shipping: {
        types: [],
      },

      spec: buildImportedProductSpec({
        defaultOrder: 1,
      }),

      // SEO configuration
      seo: {
        slug: (overrides?.name || localizedOriginalName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
        title: overrides?.name || localizedOriginalName,
        description:
          overrides?.description || externalProduct.originalDescription || "",
      },

      // Category - must be provided
      category: overrides?.categoryId
        ? ({
            id: overrides.categoryId,
            name: "", // Will be populated by Firestore
          } as any)
        : (null as any),

      productType: null,
      priceType: "VOLUME" as any,
      prefferedUnit: "PCS" as any,

      availability: {
        published: false, // Keep unpublished until reviewed
        availableForPurchase: false,
      },

      keywords: externalProduct.keywords || [],

      // Metadata
      channelId,
      active: true,
      createdAt: Timestamp.now() as any,
      updatedAt: Timestamp.now() as any,
      createdBy: { id: "external-import", name: "External Import" },
      updatedBy: { id: "external-import", name: "External Import" },
    };

    for (const name of skippedAttributeNames) {
      warnings.push({
        key: "attributeSkippedNoOptions",
        params: { name },
      });
    }

    for (const attributeId of impossibleDependentAttributeIds) {
      const attr = internalAttributesById.get(attributeId);
      warnings.push({
        key: "attributeRemovedImpossible",
        params: { name: attr?.name ?? attributeId },
      });
    }

    // Validate and collect warnings
    if (!product.category || !overrides?.categoryId) {
      warnings.push({
        key: "categoryRequired",
      });
    }

    if (product.prices.length === 0) {
      warnings.push({
        key: "pricingRequired",
      });
    }

    if (productAttributes.length === 0) {
      warnings.push({
        key: "noAttributesMapped",
      });
    }

    // Only create product if we have minimum required data
    if (overrides?.categoryId) {
      // Save product to Firestore in the correct channel subcollection
      const productRef = await db
        .collection(`channels/${channelId}/products`)
        .add(product);
      await recordExternalProductCreated("admin.external-product.import");
      await scheduleExternalProductChangeLog({
        before: null,
        channelId,
        productId: productRef.id,
      });

      // Update external product record
      await db.collection("externalProducts").doc(externalProductId).update({
        imported: true,
        importStatus: "completed",
        productId: productRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      updateTag(EXTERNAL_PRODUCTS_TAG);

      return {
        success: true,
        productId: productRef.id,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } else {
      return {
        success: false,
        error: "Category ID is required to import product",
        warnings,
      };
    }
  } catch (error) {
    console.error("Error importing external product:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
