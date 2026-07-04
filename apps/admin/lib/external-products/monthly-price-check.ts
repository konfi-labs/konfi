import "server-only";

import { createImportedMatrixCombinationResolver } from "@/lib/external-products/imported-price-combination-resolver";
import {
  normalizeExternalDeliveryTime,
  resolveExternalDeliveryTime,
} from "@/lib/external-products/delivery-time";
import {
  buildProductAttributeDependenciesFromExternalPricing,
  sortAttributeIdsByDependencies,
} from "@/lib/external-products/product-attribute-dependencies";
import {
  normalizeExternalPriceConfigurationSelection,
  normalizeExternalPriceConfigurations,
} from "@/lib/external-products/price-configuration-normalization";
import { fetchExternalProviderUrl } from "@/lib/external-products/provider-url-policy";
import {
  getRangedDimensionAttributeNames,
  inferExternalRangedDimensions,
} from "@/lib/external-products/ranged-dimensions";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { publishCreatedAppNotification } from "@/lib/notifications/app-notifications";
import type {
  Attribute,
  ExternalImportConnection,
  ExternalPriceConfiguration,
  ExternalProduct,
  ExternalProvider,
  Notification,
  PriceExtractionSchema,
  Product,
  ProductPrice,
  PriceTypeEnum,
} from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";

const MAX_SAMPLED_PRICE_CONFIGURATIONS = 3;
const PRICE_COMPARISON_MULTIPLIER = 10_000;
const PRICE_MAX_FRACTION_DIGITS = 4;
const PRODUCT_PRICE_MINOR_UNITS_MULTIPLIER = 100;
const PRICE_CHANGE_NOTIFICATION_TITLE =
  "Wykryto zmianę cen produktu zewnętrznego";

type ExternalImportLink = {
  channelId: string;
  productId: string;
  externalProductName?: string;
};

type SampledPriceConfiguration = {
  configuration: Record<string, string>;
  configurationKey: string;
  priceInfo: NonNullable<ExternalProduct["priceInfo"]>;
  sourceUrl: string;
};

type ComparableSampledPriceConfiguration = SampledPriceConfiguration & {
  currentPrices: Map<number, number>;
  resolvedCombinationId: string;
};

type NormalizedPriceRange = {
  deliveryTime?: number;
  price: number;
  quantity?: number;
  unit?: string;
};

type NormalizedPriceInfo = {
  currency?: string;
  priceRanges: NormalizedPriceRange[];
};

type SampledFetchedPriceConfiguration = ComparableSampledPriceConfiguration & {
  adjustedFetchedPriceInfo: NonNullable<ExternalProduct["priceInfo"]>;
  fetchedPriceInfo: NonNullable<ExternalProduct["priceInfo"]>;
  minimumProfitableFetchedPriceInfo: NonNullable<ExternalProduct["priceInfo"]>;
};

type SampledFetchResult =
  | {
      samples: SampledFetchedPriceConfiguration[];
      status: "ready";
      requestFailures: number;
      sampledCount: number;
    }
  | {
      status: "failed";
      reason: string;
      requestFailures: number;
      sampledCount: number;
    }
  | {
      status: "skipped";
      reason: string;
    };

export type ProductPriceComparisonEntry = {
  currentPrice: number;
  currentPriceMinorUnits: number;
  fetchedPrice: number;
  fetchedPriceMinorUnits: number;
  quantity: number;
};

type ProductProfitabilityComparisonEntry = {
  currentPrice: number;
  currentPriceMinorUnits: number;
  minimumProfitablePrice: number;
  minimumProfitablePriceMinorUnits: number;
  quantity: number;
};

type LinkedProductComparisonContext = {
  priceMap: Map<string, Map<number, number>>;
  priceType?: PriceTypeEnum;
  product: Product;
  resolveCombinationId: (
    configuration: Record<string, string>,
  ) => string | null;
};

type LinkedProductComparisonResult =
  | {
      status: "matched";
    }
  | {
      comparedPrices: ProductProfitabilityComparisonEntry[];
      mismatch: SampledFetchedPriceConfiguration;
      resolvedCombinationId: string;
      status: "mismatch";
    }
  | {
      reason: string;
      status: "skipped";
    };

function isSkippedComparisonContext(
  context:
    | LinkedProductComparisonContext
    | { reason: string; status: "skipped" },
): context is { reason: string; status: "skipped" } {
  return "status" in context && context.status === "skipped";
}

type ExternalProductCheckResult = {
  failed: number;
  matched: number;
  mismatched: number;
  notifications: number;
  processed: number;
  requestFailures: number;
  sampledCount: number;
  skipped: number;
};

export type MonthlyExternalProductPriceCheckSummary = {
  failedCount: number;
  matchedCount: number;
  mismatchedCount: number;
  notificationCount: number;
  processedCount: number;
  sampledConfigurationCount: number;
  sampledRequestFailureCount: number;
  skippedCount: number;
};

function getDb() {
  return getAdminDb();
}

function normalizeString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCurrency(value?: string): string | undefined {
  const trimmed = normalizeString(value);
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function normalizePercent(value?: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeUnit(value?: string): string | undefined {
  const trimmed = normalizeString(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function clampPriceFractionDigits(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** PRICE_MAX_FRACTION_DIGITS;
  return Math.trunc(value * factor) / factor;
}

function toComparisonUnits(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Math.round((value + Number.EPSILON) * PRICE_COMPARISON_MULTIPLIER);
}

function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Math.round(
    (value + Number.EPSILON) * PRODUCT_PRICE_MINOR_UNITS_MULTIPLIER,
  );
}

function normalizeFetchedPriceInfoForCurrentProductComparison(options: {
  fetchedPriceInfo?: ExternalProduct["priceInfo"] | null;
  priceType?: PriceTypeEnum;
}): Array<{
  fetchedPrice: number;
  fetchedPriceMinorUnits: number;
  quantity: number;
}> {
  const { fetchedPriceInfo, priceType } = options;

  if (!fetchedPriceInfo) {
    return [];
  }

  if (priceType === "SINGLE") {
    const firstPrice = fetchedPriceInfo.priceRanges?.find(
      (range) =>
        typeof range.price === "number" && Number.isFinite(range.price),
    )?.price;

    if (typeof firstPrice !== "number" || !Number.isFinite(firstPrice)) {
      return [];
    }

    return [
      {
        fetchedPrice: firstPrice,
        fetchedPriceMinorUnits: toMinorUnits(firstPrice),
        quantity: 1,
      },
    ];
  }

  return (fetchedPriceInfo.priceRanges ?? [])
    .map((range) => {
      if (
        typeof range.price !== "number" ||
        !Number.isFinite(range.price) ||
        typeof range.quantity !== "number" ||
        !Number.isFinite(range.quantity)
      ) {
        return null;
      }

      return {
        fetchedPrice: range.price,
        fetchedPriceMinorUnits: toMinorUnits(range.price),
        quantity: range.quantity,
      };
    })
    .filter(
      (
        range,
      ): range is {
        fetchedPrice: number;
        fetchedPriceMinorUnits: number;
        quantity: number;
      } => range !== null,
    )
    .toSorted((left, right) => left.quantity - right.quantity);
}

export function compareFetchedPriceInfoToCurrentProductPrices(options: {
  currentPrices: Map<number, number>;
  fetchedPriceInfo?: ExternalProduct["priceInfo"] | null;
  priceType?: PriceTypeEnum;
}): {
  comparablePrices: ProductPriceComparisonEntry[];
  matches: boolean;
} | null {
  const { currentPrices, fetchedPriceInfo, priceType } = options;
  const normalizedFetchedPrices =
    normalizeFetchedPriceInfoForCurrentProductComparison({
      fetchedPriceInfo,
      priceType,
    });

  if (normalizedFetchedPrices.length === 0) {
    return null;
  }

  const comparablePrices = normalizedFetchedPrices
    .map((range) => {
      const currentPriceMinorUnits = currentPrices.get(range.quantity);

      if (
        typeof currentPriceMinorUnits !== "number" ||
        !Number.isFinite(currentPriceMinorUnits)
      ) {
        return null;
      }

      return {
        currentPrice:
          currentPriceMinorUnits / PRODUCT_PRICE_MINOR_UNITS_MULTIPLIER,
        currentPriceMinorUnits,
        fetchedPrice: range.fetchedPrice,
        fetchedPriceMinorUnits: range.fetchedPriceMinorUnits,
        quantity: range.quantity,
      } satisfies ProductPriceComparisonEntry;
    })
    .filter((price): price is ProductPriceComparisonEntry => price !== null);

  if (comparablePrices.length === 0) {
    return null;
  }

  return {
    comparablePrices,
    matches: comparablePrices.every(
      (price) => price.currentPriceMinorUnits === price.fetchedPriceMinorUnits,
    ),
  };
}

export function compareCurrentProductPricesToMinimumProfitablePrice(options: {
  currentPrices: Map<number, number>;
  minimumProfitablePriceInfo?: ExternalProduct["priceInfo"] | null;
  priceType?: PriceTypeEnum;
}): {
  comparablePrices: ProductProfitabilityComparisonEntry[];
  profitable: boolean;
} | null {
  const { currentPrices, minimumProfitablePriceInfo, priceType } = options;
  const normalizedFetchedPrices =
    normalizeFetchedPriceInfoForCurrentProductComparison({
      fetchedPriceInfo: minimumProfitablePriceInfo,
      priceType,
    });

  if (normalizedFetchedPrices.length === 0) {
    return null;
  }

  const comparablePrices = normalizedFetchedPrices
    .map((range) => {
      const currentPriceMinorUnits = currentPrices.get(range.quantity);

      if (
        typeof currentPriceMinorUnits !== "number" ||
        !Number.isFinite(currentPriceMinorUnits)
      ) {
        return null;
      }

      return {
        currentPrice:
          currentPriceMinorUnits / PRODUCT_PRICE_MINOR_UNITS_MULTIPLIER,
        currentPriceMinorUnits,
        minimumProfitablePrice: range.fetchedPrice,
        minimumProfitablePriceMinorUnits: range.fetchedPriceMinorUnits,
        quantity: range.quantity,
      } satisfies ProductProfitabilityComparisonEntry;
    })
    .filter(
      (price): price is ProductProfitabilityComparisonEntry => price !== null,
    );

  if (comparablePrices.length === 0) {
    return null;
  }

  return {
    comparablePrices,
    profitable: comparablePrices.every(
      (price) =>
        price.currentPriceMinorUnits >= price.minimumProfitablePriceMinorUnits,
    ),
  };
}

let internalAttributesPromise: Promise<Map<string, Attribute>> | null = null;

async function getInternalAttributesMap(): Promise<Map<string, Attribute>> {
  if (!internalAttributesPromise) {
    internalAttributesPromise = getDb()
      .collection("attributes")
      .get()
      .then((snapshot) => {
        const attributes = new Map<string, Attribute>();

        for (const doc of snapshot.docs) {
          attributes.set(doc.id, doc.data() as Attribute);
        }

        return attributes;
      });
  }

  return internalAttributesPromise;
}

async function readCurrentProduct(
  link: ExternalImportLink,
): Promise<Product | null> {
  const productDoc = await getDb()
    .collection(`channels/${link.channelId}/products`)
    .doc(link.productId)
    .get();

  if (!productDoc.exists) {
    return null;
  }

  return productDoc.data() as Product;
}

async function readCurrentProductPriceDocs(
  link: ExternalImportLink,
): Promise<ProductPrice[]> {
  const snapshot = await getDb()
    .collection(`channels/${link.channelId}/products/${link.productId}/prices`)
    .orderBy("id", "desc")
    .get();

  return snapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        ...(doc.data() as Omit<ProductPrice, "id">),
      }) as ProductPrice,
  );
}

function buildCurrentProductPriceMap(
  priceDocs: ProductPrice[],
): Map<string, Map<number, number>> {
  const priceMap = new Map<string, Map<number, number>>();

  for (const priceDoc of priceDocs) {
    const resolvedDocId = normalizeString(priceDoc.id) ?? DEFAULT_COMBINATION;
    const currentPrices = new Map<number, number>();

    for (const price of priceDoc.prices ?? []) {
      const quantity =
        typeof price.volume?.value === "number" &&
        Number.isFinite(price.volume.value)
          ? price.volume.value
          : typeof price.threshold === "number" &&
              Number.isFinite(price.threshold)
            ? price.threshold
            : undefined;
      const value =
        typeof price.value === "number" && Number.isFinite(price.value)
          ? price.value
          : undefined;

      if (quantity === undefined || value === undefined) {
        continue;
      }

      currentPrices.set(quantity, value);
    }

    if (currentPrices.size > 0) {
      priceMap.set(resolvedDocId, currentPrices);
    }
  }

  return priceMap;
}

async function buildLinkedProductComparisonContext(options: {
  externalProduct: ExternalProduct;
  link: ExternalImportLink;
}): Promise<
  LinkedProductComparisonContext | { reason: string; status: "skipped" }
> {
  const { externalProduct, link } = options;
  const product = await readCurrentProduct(link);

  if (!product) {
    return {
      status: "skipped",
      reason: "Linked product could not be loaded for sampled comparison",
    };
  }

  if (product.pageCount?.pricing) {
    return {
      status: "skipped",
      reason:
        "Page-count pricing products are skipped by the lightweight sampled comparison",
    };
  }

  const priceDocs = await readCurrentProductPriceDocs(link);
  const priceMap = buildCurrentProductPriceMap(priceDocs);

  if (priceMap.size === 0) {
    return {
      status: "skipped",
      reason: "Current product has no stored live price groups to compare",
    };
  }

  if (product.priceType !== "MATRIX") {
    return {
      priceMap,
      priceType: product.priceType,
      product,
      resolveCombinationId: () => DEFAULT_COMBINATION,
    };
  }

  const productAttributeIds = Array.isArray(product.attributes)
    ? product.attributes
    : [];

  if (productAttributeIds.length === 0) {
    return {
      status: "skipped",
      reason: "Matrix product has no attributes available for price comparison",
    };
  }

  const internalAttributesById = await getInternalAttributesMap();
  const rangedDimensionAttributeNames = getRangedDimensionAttributeNames(
    inferExternalRangedDimensions(externalProduct.attributes ?? []),
  );
  const selectedMappingsForProduct = (
    externalProduct.attributeMappings ?? []
  ).filter(
    (mapping) =>
      !mapping.ignored &&
      mapping.internalAttributeId &&
      mapping.verified !== false &&
      !rangedDimensionAttributeNames.has(mapping.externalAttributeName) &&
      productAttributeIds.includes(mapping.internalAttributeId),
  );

  if (selectedMappingsForProduct.length === 0) {
    return {
      status: "skipped",
      reason:
        "No verified attribute mappings were available for sampled comparison",
    };
  }

  const productAttributeOptions = product.attributeOptions ?? {};
  const attributeDependencies =
    buildProductAttributeDependenciesFromExternalPricing({
      attributeMappings: selectedMappingsForProduct,
      externalAttributes: externalProduct.attributes ?? [],
      internalAttributesById,
      pricingExclusionRules: externalProduct.pricingExclusionRules,
      productAttributeOptions,
    });
  const orderedProductAttributes = sortAttributeIdsByDependencies(
    productAttributeIds,
    attributeDependencies,
  );
  const resolveCombinationId = createImportedMatrixCombinationResolver({
    attributeDependencies,
    externalAttributes: externalProduct.attributes ?? [],
    internalAttributesById,
    orderedProductAttributes,
    productAttributeOptions,
    selectedMappings: selectedMappingsForProduct,
  });

  if (
    orderedProductAttributes.every(
      (attributeId) => !internalAttributesById.get(attributeId)?.calculated,
    )
  ) {
    return {
      priceMap,
      priceType: product.priceType,
      product,
      resolveCombinationId: () => DEFAULT_COMBINATION,
    };
  }

  return {
    priceMap,
    priceType: product.priceType,
    product,
    resolveCombinationId,
  };
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== "object" || obj === null) {
    return undefined;
  }

  let current: unknown = obj;

  for (const part of path.split(".")) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== "object" || !(part in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function extractPriceWithSchema(
  apiData: unknown,
  schema: PriceExtractionSchema,
): ExternalProduct["priceInfo"] | null {
  const currency =
    schema.staticCurrency ||
    (schema.currencyPath
      ? String(getByPath(apiData, schema.currencyPath) || "")
      : undefined);
  const divisor = schema.priceDivisor || 1;

  if (schema.singlePricePath) {
    const rawPrice = getByPath(apiData, schema.singlePricePath);
    const parsedPrice = parsePrice(rawPrice);
    const price =
      parsedPrice !== undefined
        ? clampPriceFractionDigits(parsedPrice / divisor)
        : undefined;
    const deliveryTime = schema.deliveryTimePath
      ? resolveExternalDeliveryTime(
          getByPath(apiData, schema.deliveryTimePath),
          {
            format: schema.deliveryTimeFormat,
          },
        )
      : undefined;

    if (price === undefined) {
      return null;
    }

    return {
      currency,
      priceRanges: [
        {
          price,
          ...(deliveryTime !== undefined ? { deliveryTime } : {}),
        },
      ],
    };
  }

  if (!schema.priceRangesPath) {
    return null;
  }

  const ranges = getByPath(apiData, schema.priceRangesPath);

  if (!Array.isArray(ranges)) {
    return null;
  }

  const priceRanges = ranges
    .map((range) => {
      const rawPrice = schema.pricePath
        ? getByPath(range, schema.pricePath)
        : undefined;
      const rawQuantity = schema.quantityPath
        ? getByPath(range, schema.quantityPath)
        : undefined;
      const rawUnit = schema.unitPath
        ? getByPath(range, schema.unitPath)
        : undefined;
      const rawDeliveryTime = schema.deliveryTimePath
        ? (getByPath(range, schema.deliveryTimePath) ??
          getByPath(apiData, schema.deliveryTimePath))
        : undefined;

      const parsedTotalPrice = parsePrice(rawPrice);
      const parsedQuantity = parsePrice(rawQuantity);
      const deliveryTime = resolveExternalDeliveryTime(rawDeliveryTime, {
        format: schema.deliveryTimeFormat,
      });

      let perUnitPrice: number = Number.NaN;

      if (
        parsedTotalPrice !== undefined &&
        parsedQuantity !== undefined &&
        parsedQuantity > 0
      ) {
        perUnitPrice = parsedTotalPrice / divisor / parsedQuantity;
      } else if (parsedTotalPrice !== undefined) {
        perUnitPrice = parsedTotalPrice / divisor;
      }

      perUnitPrice = clampPriceFractionDigits(perUnitPrice);

      const result: {
        deliveryTime?: number;
        price: number;
        quantity?: number;
        unit?: string;
      } = {
        price: perUnitPrice,
      };

      if (parsedQuantity !== undefined) {
        result.quantity = parsedQuantity;
      }

      if (typeof rawUnit === "string" && rawUnit.trim().length > 0) {
        result.unit = rawUnit.trim();
      }

      if (deliveryTime !== undefined) {
        result.deliveryTime = deliveryTime;
      }

      return result;
    })
    .filter((range) => !Number.isNaN(range.price));

  if (priceRanges.length === 0) {
    return null;
  }

  return {
    currency,
    priceRanges,
  };
}

function normalizeConfiguration(
  configuration: Record<string, string>,
): Record<string, string> {
  return normalizeExternalPriceConfigurationSelection(
    Object.fromEntries(
      Object.entries(configuration).map(
        ([key, value]) => [key, value.trim()] as const,
      ),
    ),
  );
}

function buildConfigurationKey(configuration: Record<string, string>): string {
  return JSON.stringify(normalizeConfiguration(configuration));
}

function normalizePriceInfoForComparison(
  priceInfo?: ExternalProduct["priceInfo"] | null,
): NormalizedPriceInfo | null {
  if (!priceInfo) {
    return null;
  }

  const priceRanges: NormalizedPriceRange[] = [];

  for (const range of priceInfo.priceRanges ?? []) {
    if (typeof range.price !== "number" || !Number.isFinite(range.price)) {
      continue;
    }

    priceRanges.push({
      deliveryTime: normalizeExternalDeliveryTime(range.deliveryTime),
      price: toComparisonUnits(range.price),
      quantity:
        typeof range.quantity === "number" && Number.isFinite(range.quantity)
          ? range.quantity
          : undefined,
      unit: normalizeUnit(range.unit),
    });
  }

  priceRanges.sort((a, b) => {
    const quantityA = a.quantity ?? Number.POSITIVE_INFINITY;
    const quantityB = b.quantity ?? Number.POSITIVE_INFINITY;

    if (quantityA !== quantityB) {
      return quantityA - quantityB;
    }

    if (a.price !== b.price) {
      return a.price - b.price;
    }

    const deliveryTimeA = a.deliveryTime ?? Number.POSITIVE_INFINITY;
    const deliveryTimeB = b.deliveryTime ?? Number.POSITIVE_INFINITY;

    if (deliveryTimeA !== deliveryTimeB) {
      return deliveryTimeA - deliveryTimeB;
    }

    return (a.unit ?? "").localeCompare(b.unit ?? "");
  });

  if (priceRanges.length === 0) {
    return null;
  }

  return {
    currency: normalizeCurrency(priceInfo.currency),
    priceRanges,
  };
}

export function applyConfiguredPriceAdjustments(
  priceInfo: ExternalProduct["priceInfo"] | null | undefined,
  options?: {
    discountPercent?: number;
    marginPercent?: number;
    taxPercent?: number;
  },
): ExternalProduct["priceInfo"] | null {
  if (!priceInfo) {
    return null;
  }

  const discountPercent = normalizePercent(options?.discountPercent);
  const marginPercent = normalizePercent(options?.marginPercent);
  const taxPercent = normalizePercent(options?.taxPercent);

  if (discountPercent === 0 && marginPercent === 0 && taxPercent === 0) {
    return priceInfo;
  }

  const discountMultiplier = 1 - discountPercent / 100;
  const marginMultiplier = 1 + marginPercent / 100;
  const taxMultiplier = 1 + taxPercent / 100;

  return {
    ...priceInfo,
    priceRanges: (priceInfo.priceRanges ?? []).map((range) => ({
      ...range,
      price:
        typeof range.price === "number" && Number.isFinite(range.price)
          ? clampPriceFractionDigits(
              Math.max(
                0,
                range.price *
                  discountMultiplier *
                  marginMultiplier *
                  taxMultiplier,
              ),
            )
          : range.price,
    })),
  };
}

export function sampledPriceInfoDiffers(
  current?: ExternalProduct["priceInfo"] | null,
  next?: ExternalProduct["priceInfo"] | null,
): boolean {
  const normalizedCurrent = normalizePriceInfoForComparison(current);
  const normalizedNext = normalizePriceInfoForComparison(next);

  if (!normalizedCurrent || !normalizedNext) {
    return normalizedCurrent !== normalizedNext;
  }

  return JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNext);
}

function buildComparableStoredPriceConfigurations(
  configurations: ExternalPriceConfiguration[],
): SampledPriceConfiguration[] {
  const comparableConfigurations = configurations
    .map((configuration) => {
      const sourceUrl = normalizeString(configuration.sourceUrl);
      const storedPriceInfo = configuration.priceInfo;
      const normalizedPriceInfo =
        normalizePriceInfoForComparison(storedPriceInfo);

      if (!sourceUrl || !storedPriceInfo || !normalizedPriceInfo) {
        return null;
      }

      return {
        configuration: normalizeConfiguration(configuration.configuration),
        configurationKey: buildConfigurationKey(configuration.configuration),
        priceInfo: storedPriceInfo,
        sourceUrl,
      } satisfies SampledPriceConfiguration;
    })
    .filter(
      (configuration): configuration is SampledPriceConfiguration =>
        configuration !== null,
    );

  comparableConfigurations.sort((a, b) => {
    const configDiff = a.configurationKey.localeCompare(b.configurationKey);

    if (configDiff !== 0) {
      return configDiff;
    }

    return a.sourceUrl.localeCompare(b.sourceUrl);
  });

  const uniqueBySourceUrl: SampledPriceConfiguration[] = [];
  const seenSourceUrls = new Set<string>();

  for (const configuration of comparableConfigurations) {
    if (seenSourceUrls.has(configuration.sourceUrl)) {
      continue;
    }

    seenSourceUrls.add(configuration.sourceUrl);
    uniqueBySourceUrl.push(configuration);
  }

  return uniqueBySourceUrl;
}

function pickRepresentativeSampledConfigurations<
  T extends { configurationKey: string; sourceUrl: string },
>(configurations: T[]): T[] {
  if (configurations.length <= MAX_SAMPLED_PRICE_CONFIGURATIONS) {
    return configurations;
  }

  const indices = [
    0,
    Math.floor((configurations.length - 1) / 2),
    configurations.length - 1,
  ];

  return [...new Set(indices)].map((index) => configurations[index]);
}

export function pickSampledPriceConfigurations(
  configurations: ExternalPriceConfiguration[],
): SampledPriceConfiguration[] {
  return pickRepresentativeSampledConfigurations(
    buildComparableStoredPriceConfigurations(configurations),
  );
}

export function pickComparableSampledPriceConfigurations(options: {
  configurations: ExternalPriceConfiguration[];
  context: LinkedProductComparisonContext;
}): ComparableSampledPriceConfiguration[] {
  const { configurations, context } = options;
  const comparableConfigurations =
    buildComparableStoredPriceConfigurations(configurations);
  const fallbackCurrentPrices =
    context.priceType !== "MATRIX"
      ? [...context.priceMap.values()][0]
      : undefined;

  return pickRepresentativeSampledConfigurations(
    comparableConfigurations
      .map((configuration) => {
        const resolvedCombinationId = context.resolveCombinationId(
          configuration.configuration,
        );
        const currentPrices =
          (resolvedCombinationId
            ? context.priceMap.get(resolvedCombinationId)
            : undefined) ?? fallbackCurrentPrices;

        if (!resolvedCombinationId || !currentPrices) {
          return null;
        }

        return {
          ...configuration,
          currentPrices,
          resolvedCombinationId,
        } satisfies ComparableSampledPriceConfiguration;
      })
      .filter(
        (configuration): configuration is ComparableSampledPriceConfiguration =>
          configuration !== null,
      ),
  );
}

function buildRequestHeadersFromProvider(
  provider?: ExternalProvider | null,
): Record<string, string> {
  let requestHeaders: Record<string, string> = {};

  if (provider?.auth && provider.auth.type !== "none") {
    if (provider.auth.type === "bearer") {
      requestHeaders.Authorization = `Bearer ${provider.auth.tokenValue}`;
    } else if (provider.auth.headerName) {
      requestHeaders[provider.auth.headerName] = provider.auth.tokenValue || "";
    }
  }

  if (provider?.headers) {
    requestHeaders = { ...requestHeaders, ...provider.headers };
  }

  return requestHeaders;
}

async function getProvider(
  providerId?: string,
): Promise<ExternalProvider | null> {
  if (!providerId) {
    return null;
  }

  const providerDoc = await getDb()
    .collection("externalProviders")
    .doc(providerId)
    .get();

  if (!providerDoc.exists) {
    return null;
  }

  return { ...(providerDoc.data() as ExternalProvider), id: providerDoc.id };
}

async function readStoredPriceConfigurations(options: {
  docRef: DocumentReference;
  externalProduct: ExternalProduct;
}): Promise<ExternalPriceConfiguration[]> {
  const { docRef, externalProduct } = options;
  const inlineConfigurations = externalProduct.priceConfigurations ?? [];

  if (inlineConfigurations.length > 0) {
    return normalizeExternalPriceConfigurations(inlineConfigurations);
  }

  const snapshot = await docRef
    .collection("priceConfigChunks")
    .orderBy("chunkIndex", "asc")
    .get();

  if (snapshot.empty) {
    return [];
  }

  const configurations: ExternalPriceConfiguration[] = [];

  for (const chunkDoc of snapshot.docs) {
    const data = chunkDoc.data() as {
      configurations?: ExternalPriceConfiguration[];
    };

    configurations.push(...(data.configurations ?? []));
  }

  return normalizeExternalPriceConfigurations(configurations);
}

function parseExternalImportPath(path: string): {
  channelId?: string;
  productId?: string;
} {
  const segments = path.split("/").filter(Boolean);
  const channelsIndex = segments.indexOf("channels");

  if (channelsIndex < 0 || segments.length <= channelsIndex + 3) {
    return {};
  }

  const channelId = segments[channelsIndex + 1];
  const productsSegment = segments[channelsIndex + 2];
  const productId = segments[channelsIndex + 3];

  if (!channelId || productsSegment !== "products" || !productId) {
    return {};
  }

  return { channelId, productId };
}

function buildProductEditUrl(channelId: string, productId: string): string {
  return `/catalog/products/edit/${productId}?channelId=${channelId}`;
}

async function fetchSampledPriceInfo(options: {
  requestHeaders: Record<string, string>;
  schema: PriceExtractionSchema;
  sourceUrl: string;
}): Promise<ExternalProduct["priceInfo"] | null> {
  const { requestHeaders, schema, sourceUrl } = options;

  try {
    const response = await fetchExternalProviderUrl(sourceUrl, {
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return extractPriceWithSchema(payload, schema);
  } catch {
    return null;
  }
}

async function fetchSampledLivePriceSamples(options: {
  discountPercent?: number;
  marginPercent?: number;
  requestHeaders: Record<string, string>;
  sampledConfigurations: ComparableSampledPriceConfiguration[];
  schema: PriceExtractionSchema;
  taxPercent?: number;
}): Promise<SampledFetchResult> {
  const {
    discountPercent,
    marginPercent,
    requestHeaders,
    sampledConfigurations,
    schema,
    taxPercent,
  } = options;

  if (sampledConfigurations.length === 0) {
    return {
      status: "skipped",
      reason: "No stored supplier price samples with URLs were available",
    };
  }

  let requestFailures = 0;
  const samples: SampledFetchedPriceConfiguration[] = [];

  for (const sampledConfiguration of sampledConfigurations) {
    const fetchedPriceInfo = await fetchSampledPriceInfo({
      requestHeaders,
      schema,
      sourceUrl: sampledConfiguration.sourceUrl,
    });

    if (!fetchedPriceInfo) {
      requestFailures += 1;
      continue;
    }

    const adjustedFetchedPriceInfo = applyConfiguredPriceAdjustments(
      fetchedPriceInfo,
      {
        discountPercent,
        marginPercent,
        taxPercent,
      },
    );
    const minimumProfitableFetchedPriceInfo = applyConfiguredPriceAdjustments(
      fetchedPriceInfo,
      {
        discountPercent,
        taxPercent,
      },
    );

    samples.push({
      ...sampledConfiguration,
      adjustedFetchedPriceInfo: adjustedFetchedPriceInfo as NonNullable<
        ExternalProduct["priceInfo"]
      >,
      fetchedPriceInfo: fetchedPriceInfo as NonNullable<
        ExternalProduct["priceInfo"]
      >,
      minimumProfitableFetchedPriceInfo:
        minimumProfitableFetchedPriceInfo as NonNullable<
          ExternalProduct["priceInfo"]
        >,
    });
  }

  if (samples.length === 0) {
    return {
      status: "failed",
      reason: "Unable to fetch any sampled supplier prices",
      requestFailures,
      sampledCount: sampledConfigurations.length,
    };
  }

  if (requestFailures > 0) {
    return {
      status: "failed",
      reason: "Unable to verify all sampled supplier prices",
      requestFailures,
      sampledCount: sampledConfigurations.length,
    };
  }

  return {
    samples,
    status: "ready",
    requestFailures: 0,
    sampledCount: sampledConfigurations.length,
  };
}

async function compareLinkedProductPriceSamples(options: {
  context: LinkedProductComparisonContext;
  sampledLivePrices: SampledFetchedPriceConfiguration[];
}): Promise<LinkedProductComparisonResult> {
  const { context, sampledLivePrices } = options;

  let comparedSampleCount = 0;
  let skipReason =
    "No comparable sampled supplier prices matched the current product price buckets";

  for (const sampledLivePrice of sampledLivePrices) {
    const profitabilityComparison =
      compareCurrentProductPricesToMinimumProfitablePrice({
        currentPrices: sampledLivePrice.currentPrices,
        minimumProfitablePriceInfo:
          sampledLivePrice.minimumProfitableFetchedPriceInfo,
        priceType: context.priceType,
      });

    if (!profitabilityComparison) {
      skipReason =
        "No overlapping quantity tiers were available between the sampled supplier response and the current product prices";
      continue;
    }

    comparedSampleCount += 1;

    if (!profitabilityComparison.profitable) {
      return {
        status: "mismatch",
        comparedPrices: profitabilityComparison.comparablePrices,
        mismatch: sampledLivePrice,
        resolvedCombinationId: sampledLivePrice.resolvedCombinationId,
      };
    }
  }

  if (comparedSampleCount === 0) {
    return {
      status: "skipped",
      reason: skipReason,
    };
  }

  return {
    status: "matched",
  };
}

async function hasOpenPriceChangeNotification(url: string): Promise<boolean> {
  const existingNotifications = await getDb()
    .collection("notifications")
    .where("url", "==", url)
    .limit(25)
    .get();

  return existingNotifications.docs.some((doc) => {
    const notification = doc.data() as Notification;
    return (
      notification.title === PRICE_CHANGE_NOTIFICATION_TITLE &&
      notification.archived !== true
    );
  });
}

async function createPriceChangeNotification(
  link: ExternalImportLink,
): Promise<boolean> {
  const url = buildProductEditUrl(link.channelId, link.productId);

  if (await hasOpenPriceChangeNotification(url)) {
    return false;
  }

  const notificationRef = getDb().collection("notifications").doc();
  const productName =
    normalizeString(link.externalProductName) || "produkt zewnętrzny";

  const notification: Notification = {
    id: notificationRef.id,
    title: PRICE_CHANGE_NOTIFICATION_TITLE,
    options: {
      body: `Wykryto ryzyko nieopłacalnej ceny dla ${productName}. Otwórz produkt i zdecyduj, czy odświeżyć ceny dostawcy.`,
    },
    archived: false,
    channelId: link.channelId,
    url,
    createdAt: Timestamp.now(),
  };

  await notificationRef.set(notification);
  await publishCreatedAppNotification(notification);

  return true;
}

async function checkExternalProduct(options: {
  externalProductId: string;
  links: ExternalImportLink[];
}): Promise<ExternalProductCheckResult> {
  const { externalProductId, links } = options;
  const linkedProductCount = links.length > 0 ? links.length : 1;
  const externalProductRef = getDb()
    .collection("externalProducts")
    .doc(externalProductId);
  const externalProductDoc = await externalProductRef.get();

  if (!externalProductDoc.exists) {
    return {
      failed: linkedProductCount,
      matched: 0,
      mismatched: 0,
      notifications: 0,
      processed: linkedProductCount,
      requestFailures: 0,
      sampledCount: 0,
      skipped: 0,
    };
  }

  const externalProduct = externalProductDoc.data() as ExternalProduct;
  const provider = await getProvider(externalProduct.source?.providerId);

  if (!provider) {
    return {
      failed: 0,
      matched: 0,
      mismatched: 0,
      notifications: 0,
      processed: linkedProductCount,
      requestFailures: 0,
      sampledCount: 0,
      skipped: linkedProductCount,
    };
  }

  const endpointId = normalizeString(
    externalProduct.pricingSelection?.endpointId,
  );
  const schema = endpointId ? provider.priceSchemas?.[endpointId] : undefined;

  if (!endpointId || !schema) {
    return {
      failed: 0,
      matched: 0,
      mismatched: 0,
      notifications: 0,
      processed: linkedProductCount,
      requestFailures: 0,
      sampledCount: 0,
      skipped: linkedProductCount,
    };
  }

  const storedConfigurations = await readStoredPriceConfigurations({
    docRef: externalProductRef,
    externalProduct,
  });
  const comparableStoredConfigurations =
    pickSampledPriceConfigurations(storedConfigurations);

  if (comparableStoredConfigurations.length === 0) {
    return {
      failed: 0,
      matched: 0,
      mismatched: 0,
      notifications: 0,
      processed: linkedProductCount,
      requestFailures: 0,
      sampledCount: 0,
      skipped: linkedProductCount,
    };
  }

  const requestHeaders = buildRequestHeadersFromProvider(provider);
  let failed = 0;
  let matched = 0;
  let mismatched = 0;
  let skipped = 0;
  let notifications = 0;
  let requestFailures = 0;
  let sampledCount = 0;

  for (const link of links) {
    const context = await buildLinkedProductComparisonContext({
      externalProduct,
      link,
    });

    if (isSkippedComparisonContext(context)) {
      skipped += 1;
      continue;
    }

    const sampledConfigurations = pickComparableSampledPriceConfigurations({
      configurations: storedConfigurations,
      context,
    });

    if (sampledConfigurations.length === 0) {
      skipped += 1;
      continue;
    }

    const fetchResult = await fetchSampledLivePriceSamples({
      discountPercent: externalProduct.priceDiscountPercent,
      marginPercent: externalProduct.priceMarginPercent,
      requestHeaders,
      sampledConfigurations,
      schema,
      taxPercent: externalProduct.priceTaxPercent,
    });

    if (fetchResult.status === "failed") {
      failed += 1;
      requestFailures += fetchResult.requestFailures;
      sampledCount += fetchResult.sampledCount;
      continue;
    }

    if (fetchResult.status === "skipped") {
      skipped += 1;
      continue;
    }

    sampledCount += fetchResult.sampledCount;

    const comparisonResult = await compareLinkedProductPriceSamples({
      context,
      sampledLivePrices: fetchResult.samples,
    });

    if (comparisonResult.status === "matched") {
      matched += 1;
      continue;
    }

    if (comparisonResult.status === "skipped") {
      skipped += 1;
      continue;
    }

    mismatched += 1;

    const notificationCreated = await createPriceChangeNotification({
      ...link,
      externalProductName:
        link.externalProductName || externalProduct.originalName,
    });

    if (notificationCreated) {
      notifications += 1;
    }
  }

  return {
    failed,
    matched,
    mismatched,
    notifications,
    processed: linkedProductCount,
    requestFailures,
    sampledCount,
    skipped,
  };
}

export async function runMonthlyExternalProductPriceCheck(): Promise<MonthlyExternalProductPriceCheckSummary> {
  const externalImportsSnapshot = await getDb()
    .collectionGroup("externalImports")
    .select("externalProductId", "externalProductName")
    .get();

  if (externalImportsSnapshot.empty) {
    return {
      failedCount: 0,
      matchedCount: 0,
      mismatchedCount: 0,
      notificationCount: 0,
      processedCount: 0,
      sampledConfigurationCount: 0,
      sampledRequestFailureCount: 0,
      skippedCount: 0,
    };
  }

  const linksByExternalProductId = new Map<string, ExternalImportLink[]>();

  for (const doc of externalImportsSnapshot.docs) {
    const data = doc.data() as Partial<ExternalImportConnection>;
    const externalProductId = normalizeString(data.externalProductId);
    const { channelId, productId } = parseExternalImportPath(doc.ref.path);

    if (!externalProductId || !channelId || !productId) {
      continue;
    }

    const links = linksByExternalProductId.get(externalProductId) ?? [];
    const alreadyLinked = links.some(
      (link) => link.channelId === channelId && link.productId === productId,
    );

    if (!alreadyLinked) {
      links.push({
        channelId,
        productId,
        externalProductName: data.externalProductName,
      });
    }

    linksByExternalProductId.set(externalProductId, links);
  }

  const externalProductIds = [...linksByExternalProductId.keys()];

  if (externalProductIds.length === 0) {
    return {
      failedCount: 0,
      matchedCount: 0,
      mismatchedCount: 0,
      notificationCount: 0,
      processedCount: 0,
      sampledConfigurationCount: 0,
      sampledRequestFailureCount: 0,
      skippedCount: 0,
    };
  }

  let processedCount = 0;
  let matchedCount = 0;
  let mismatchedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let notificationCount = 0;
  let sampledConfigurationCount = 0;
  let sampledRequestFailureCount = 0;

  const concurrency = 5;

  for (let index = 0; index < externalProductIds.length; index += concurrency) {
    const batch = externalProductIds.slice(index, index + concurrency);
    const batchResults = await Promise.all(
      batch.map((externalProductId) =>
        checkExternalProduct({
          externalProductId,
          links: linksByExternalProductId.get(externalProductId) ?? [],
        }),
      ),
    );

    for (const result of batchResults) {
      processedCount += result.processed;
      matchedCount += result.matched;
      mismatchedCount += result.mismatched;
      skippedCount += result.skipped;
      failedCount += result.failed;
      notificationCount += result.notifications;
      sampledConfigurationCount += result.sampledCount;
      sampledRequestFailureCount += result.requestFailures;
    }
  }

  const summary = {
    failedCount,
    matchedCount,
    mismatchedCount,
    notificationCount,
    processedCount,
    sampledConfigurationCount,
    sampledRequestFailureCount,
    skippedCount,
  } satisfies MonthlyExternalProductPriceCheckSummary;

  return summary;
}
