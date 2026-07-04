import {
  Attribute,
  DynamicPricingConfig,
  DynamicPricingPreset,
  Price,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import { DEFAULT_COMBINATION } from "./constants";
import {
  buildDynamicPricesForSelection,
  parseDynamicSelectionFromCombination,
  resolveDynamicPricingConfig,
} from "./dynamic-pricing";
import { isPageCountAllowed } from "./page-count";
import {
  applyProductPriceOffsets,
  normalizeProductPriceOffsetsConfig,
} from "./product-price-offsets";
import { isPurchasable } from "./validators";

export type DynamicPricingRouteBody = {
  calculatedCombination?: string | null;
  channelId?: string;
  combination?: string | null;
  customFormat?: boolean;
  height?: number;
  pageCount?: number | null;
  productId?: string;
  quantity?: number;
  priceOffsets?: Product["priceOffsets"];
  selectedAttributeOptions?: Record<string, string> | null;
  volume?: number;
  width?: number;
};

export type DynamicPricingRouteReaders = {
  getDynamicPricingAttributes: (
    attributes: Product["attributes"],
  ) => Promise<Attribute[]>;
  getDynamicPricingPresetsByIds: (
    channelId: string,
    presetIds: string[],
  ) => Promise<DynamicPricingPreset[]>;
  getProduct: (
    channelId: string,
    productId: string,
  ) => Promise<Product | undefined>;
  getProductDynamicPricing: (
    channelId: string,
    productId: string,
  ) => Promise<DynamicPricingConfig | undefined>;
};

export type DynamicPricingRouteResolutionResult =
  | {
      error: string;
      kind: "bad-request";
    }
  | {
      kind: "prices";
      prices: Price[];
    };

export const MAX_DYNAMIC_PRICING_ROUTE_BODY_BYTES = 64 * 1024;

const MAX_STRING_LENGTH = 200;
const MAX_NUMERIC_VALUE = 1_000_000;
const MIN_NUMERIC_VALUE = 0;
const MAX_ATTRIBUTE_OPTIONS = 100;
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH;
}

function isSafeNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_NUMERIC_VALUE &&
    value <= MAX_NUMERIC_VALUE
  );
}

export function sanitizeDynamicPricingRouteBody(
  raw: unknown,
): DynamicPricingRouteBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const sanitized: DynamicPricingRouteBody = {};

  if (input.channelId !== undefined) {
    if (!isSafeString(input.channelId)) return null;
    sanitized.channelId = input.channelId;
  }
  if (input.productId !== undefined) {
    if (!isSafeString(input.productId)) return null;
    sanitized.productId = input.productId;
  }
  if (
    input.calculatedCombination !== undefined &&
    input.calculatedCombination !== null
  ) {
    if (!isSafeString(input.calculatedCombination)) return null;
    sanitized.calculatedCombination = input.calculatedCombination;
  } else if (input.calculatedCombination === null) {
    sanitized.calculatedCombination = null;
  }
  if (input.combination !== undefined && input.combination !== null) {
    if (!isSafeString(input.combination)) return null;
    sanitized.combination = input.combination;
  } else if (input.combination === null) {
    sanitized.combination = null;
  }
  if (input.customFormat !== undefined) {
    if (typeof input.customFormat !== "boolean") return null;
    sanitized.customFormat = input.customFormat;
  }
  for (const key of ["height", "width", "quantity", "volume"] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (!isSafeNumber(value)) return null;
      sanitized[key] = value;
    }
  }
  if (input.pageCount !== undefined && input.pageCount !== null) {
    if (!isSafeNumber(input.pageCount)) return null;
    sanitized.pageCount = input.pageCount;
  } else if (input.pageCount === null) {
    sanitized.pageCount = null;
  }
  if (input.priceOffsets !== undefined && input.priceOffsets !== null) {
    const priceOffsets = normalizeProductPriceOffsetsConfig(input.priceOffsets);
    if (priceOffsets) {
      sanitized.priceOffsets = priceOffsets;
    }
  }
  if (
    input.selectedAttributeOptions !== undefined &&
    input.selectedAttributeOptions !== null
  ) {
    const options = input.selectedAttributeOptions;
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      return null;
    }

    const entries = Object.entries(options as Record<string, unknown>);
    if (entries.length > MAX_ATTRIBUTE_OPTIONS) return null;

    const safeOptions = Object.create(null) as Record<string, string>;
    for (const [key, value] of entries) {
      if (
        !isSafeString(key) ||
        !isSafeString(value) ||
        BLOCKED_OBJECT_KEYS.has(key)
      ) {
        return null;
      }

      safeOptions[key] = value;
    }
    sanitized.selectedAttributeOptions = safeOptions;
  } else if (input.selectedAttributeOptions === null) {
    sanitized.selectedAttributeOptions = null;
  }

  return sanitized;
}

export async function resolveDynamicPricingRoutePrices({
  allowAdminPreview,
  body,
  readers,
}: {
  allowAdminPreview: boolean;
  body: DynamicPricingRouteBody;
  readers: DynamicPricingRouteReaders;
}): Promise<DynamicPricingRouteResolutionResult> {
  if (!body.channelId || !body.productId) {
    return {
      error: "Missing product pricing context",
      kind: "bad-request",
    };
  }

  const product = await readers.getProduct(body.channelId, body.productId);

  if (!product) {
    return {
      error: "Product not found",
      kind: "bad-request",
    };
  }

  if (!allowAdminPreview && !isPurchasable(product)) {
    return {
      kind: "prices",
      prices: [],
    };
  }

  const config =
    product.dynamicPricing ??
    (await readers.getProductDynamicPricing(body.channelId, body.productId));

  if (!config?.enabled || product.priceType !== PriceTypeEnum.DYNAMIC) {
    return {
      kind: "prices",
      prices: [],
    };
  }

  const dynamicPricingPresets =
    config.linkedPresetIds && config.linkedPresetIds.length > 0
      ? await readers.getDynamicPricingPresetsByIds(
          body.channelId,
          config.linkedPresetIds,
        )
      : [];
  const dynamicPricingAttributes = await readers.getDynamicPricingAttributes(
    product.attributes,
  );
  const effectiveConfig = resolveDynamicPricingConfig(
    config,
    dynamicPricingPresets,
  );
  const selectedAttributeOptions =
    body.selectedAttributeOptions &&
    Object.keys(body.selectedAttributeOptions).length > 0
      ? body.selectedAttributeOptions
      : parseDynamicSelectionFromCombination(product, body.combination);

  if (
    product.pageCount?.enabled &&
    typeof body.pageCount === "number" &&
    !isPageCountAllowed(
      body.pageCount,
      product.pageCount,
      selectedAttributeOptions,
    )
  ) {
    return {
      kind: "prices",
      prices: [],
    };
  }

  const calculatedCombination =
    body.calculatedCombination ?? DEFAULT_COMBINATION;
  const priceOffsetProduct =
    allowAdminPreview && body.priceOffsets
      ? {
          ...product,
          priceOffsets: body.priceOffsets,
        }
      : product;
  const prices = applyProductPriceOffsets({
    calculatedCombination,
    pageCount: body.pageCount,
    prices: buildDynamicPricesForSelection({
      calculatedCombination,
      config: effectiveConfig,
      context: {
        attributes: dynamicPricingAttributes,
        customFormat: body.customFormat,
        height: body.height,
        pageCount: body.pageCount,
        quantity: body.quantity,
        volume: body.volume,
        width: body.width,
      },
      currency: product.defaultPrice?.currency,
      product,
      selectedAttributeOptions,
    }),
    product: priceOffsetProduct,
    selectedAttributeOptions,
    volume: body.volume,
  });

  return {
    kind: "prices",
    prices,
  };
}
