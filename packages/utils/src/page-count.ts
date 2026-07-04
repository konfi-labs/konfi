import {
  CustomSizeWithQuantity,
  Price,
  PriceTypeEnum,
  Product,
  ProductPageCountConfig,
  ProductPageCountConstraint,
  ProductPageCountExactPriceSet,
  ProductPageCountPricing,
  ProductPageCountPricingMode,
  ProductPageCountPricingSegment,
  ProductPageCountSegmentPriceSet,
} from "@konfi/types";
import { calcPrice } from "./price";

export const DEFAULT_PAGE_COUNT_COVER_PAGES = 4;
export const PAGE_COUNT_DIVISOR = 4;
export const PAGE_COUNT_PRICE_ID_SEPARATOR = "__pageCount__";
export type PageCountSelection =
  | Record<string, string | number>
  | null
  | undefined;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function isPageCountDivisibleByRule(value: number): boolean {
  return value % PAGE_COUNT_DIVISOR === 0;
}

export function isValidPageCountConfig(
  config?: ProductPageCountConfig | null,
): config is ProductPageCountConfig {
  if (!config?.enabled) {
    return false;
  }

  return (
    isPositiveInteger(config.minimum) &&
    isPositiveInteger(config.maximum) &&
    isPositiveInteger(config.step) &&
    isPositiveInteger(config.coverPages) &&
    config.minimum <= config.maximum &&
    isPageCountDivisibleByRule(config.minimum) &&
    isPageCountDivisibleByRule(config.maximum) &&
    isPageCountDivisibleByRule(config.step) &&
    isPageCountDivisibleByRule(config.coverPages)
  );
}

function normalizePageCountSelection(
  selection?: PageCountSelection,
): Record<string, string> {
  if (!selection) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(selection).map(([attributeId, value]) => [
      attributeId,
      String(value),
    ]),
  );
}

function matchesPageCountConstraint(
  constraint: ProductPageCountConstraint,
  selection?: PageCountSelection,
): boolean {
  const normalizedSelection = normalizePageCountSelection(selection);

  return constraint.conditions.every((condition) => {
    const selectedValue = normalizedSelection[condition.attributeId];

    return (
      typeof selectedValue === "string" &&
      condition.optionValues.includes(selectedValue)
    );
  });
}

function normalizeConstraintStep(
  baseStep: number,
  candidateStep?: number,
): number {
  if (
    typeof candidateStep !== "number" ||
    !Number.isInteger(candidateStep) ||
    candidateStep <= 0 ||
    candidateStep % PAGE_COUNT_DIVISOR !== 0
  ) {
    return baseStep;
  }

  return candidateStep;
}

export function resolvePageCountConfigForSelection(
  config?: ProductPageCountConfig | null,
  selection?: PageCountSelection,
): ProductPageCountConfig | undefined {
  if (!isValidPageCountConfig(config)) {
    return undefined;
  }

  const matchingConstraints = (config.constraints ?? []).filter((constraint) =>
    matchesPageCountConstraint(constraint, selection),
  );

  if (matchingConstraints.length === 0) {
    return config;
  }

  const minimum = Math.max(
    config.minimum,
    ...matchingConstraints.flatMap((constraint) =>
      typeof constraint.minimum === "number" &&
      Number.isFinite(constraint.minimum)
        ? [Math.trunc(constraint.minimum)]
        : [],
    ),
  );
  const maximum = Math.min(
    config.maximum,
    ...matchingConstraints.flatMap((constraint) =>
      typeof constraint.maximum === "number" &&
      Number.isFinite(constraint.maximum)
        ? [Math.trunc(constraint.maximum)]
        : [],
    ),
  );
  const step = matchingConstraints.reduce(
    (resolvedStep, constraint) =>
      normalizeConstraintStep(resolvedStep, constraint.step),
    config.step,
  );

  return {
    ...config,
    minimum,
    maximum: Math.max(minimum, maximum),
    step,
  };
}

export function getEnabledPageCountConfig(
  product?: Pick<Product, "pageCount"> | null,
  selection?: PageCountSelection,
): ProductPageCountConfig | undefined {
  return resolvePageCountConfigForSelection(product?.pageCount, selection);
}

export function getDefaultPageCount(
  config?: ProductPageCountConfig | null,
): number | undefined {
  if (!isValidPageCountConfig(config)) {
    return undefined;
  }

  return config.minimum;
}

export function buildPageCountPriceDocumentId(
  pageCount: number,
  calculatedCombination: string,
): string {
  return `${pageCount}${PAGE_COUNT_PRICE_ID_SEPARATOR}${calculatedCombination}`;
}

export function getPageCountValues(
  config?: ProductPageCountConfig | null,
  selection?: PageCountSelection,
): number[] {
  const resolvedConfig = resolvePageCountConfigForSelection(config, selection);

  if (!resolvedConfig) {
    return [];
  }

  const values: number[] = [];

  for (
    let pageCount = resolvedConfig.minimum;
    pageCount <= resolvedConfig.maximum;
    pageCount += resolvedConfig.step
  ) {
    values.push(pageCount);
  }

  return values;
}

export function getPageCountPricingMode(
  pricing?: ProductPageCountPricing | null,
): ProductPageCountPricingMode {
  if (pricing?.mode === "segmented") {
    return "segmented";
  }

  if (pricing?.mode === "exact") {
    return "exact";
  }

  if (pricing?.mode === "step") {
    return "step";
  }

  if (pricing?.exactPrices?.length) {
    return "exact";
  }

  if (pricing?.segments?.length || pricing?.segmentPrices?.length) {
    return "segmented";
  }

  return "step";
}

export function getPageCountSegment(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
): ProductPageCountPricingSegment | undefined {
  if (!isValidPageCountConfig(config)) {
    return undefined;
  }

  if (getPageCountPricingMode(config.pricing) !== "segmented") {
    return undefined;
  }

  const normalizedPageCount = normalizePageCount(pageCount, config);

  if (typeof normalizedPageCount !== "number") {
    return undefined;
  }

  const segments =
    config.pricing?.segments ??
    config.pricing?.segmentPrices?.map(({ maximum, minimum }) => ({
      maximum,
      minimum,
    })) ??
    [];

  return segments.find(
    (segment) =>
      normalizedPageCount >= segment.minimum &&
      normalizedPageCount <= segment.maximum,
  );
}

export function getSegmentedPageCountPriceSet(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
): ProductPageCountSegmentPriceSet | undefined {
  if (!isValidPageCountConfig(config)) {
    return undefined;
  }

  if (getPageCountPricingMode(config.pricing) !== "segmented") {
    return undefined;
  }

  const activeSegment = getPageCountSegment(pageCount, config);

  if (!activeSegment) {
    return undefined;
  }

  return config.pricing?.segmentPrices?.find(
    (segment) =>
      segment.minimum === activeSegment.minimum &&
      segment.maximum === activeSegment.maximum,
  );
}

export function getExactPageCountPriceSet(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
): ProductPageCountExactPriceSet | undefined {
  if (!isValidPageCountConfig(config)) {
    return undefined;
  }

  if (getPageCountPricingMode(config.pricing) !== "exact") {
    return undefined;
  }

  const normalizedPageCount = normalizePageCount(pageCount, config);

  if (typeof normalizedPageCount !== "number") {
    return undefined;
  }

  return config.pricing?.exactPrices?.find(
    (entry) => entry.pageCount === normalizedPageCount,
  );
}

export function normalizePageCount(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
  selection?: PageCountSelection,
): number | undefined {
  const resolvedConfig = resolvePageCountConfigForSelection(config, selection);

  if (!resolvedConfig) {
    return undefined;
  }

  const fallback = resolvedConfig.minimum;

  if (typeof pageCount !== "number" || !Number.isFinite(pageCount)) {
    return fallback;
  }

  const numericPageCount = Math.trunc(pageCount);

  if (numericPageCount <= resolvedConfig.minimum) {
    return resolvedConfig.minimum;
  }

  if (numericPageCount >= resolvedConfig.maximum) {
    return resolvedConfig.maximum;
  }

  const offset = numericPageCount - resolvedConfig.minimum;
  const normalizedOffset =
    Math.round(offset / resolvedConfig.step) * resolvedConfig.step;
  const normalized = resolvedConfig.minimum + normalizedOffset;

  if (normalized < resolvedConfig.minimum) {
    return resolvedConfig.minimum;
  }

  if (normalized > resolvedConfig.maximum) {
    return resolvedConfig.maximum;
  }

  return normalized;
}

export function isPageCountAllowed(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
  selection?: PageCountSelection,
): boolean {
  const resolvedConfig = resolvePageCountConfigForSelection(config, selection);

  if (!resolvedConfig) {
    return true;
  }

  if (typeof pageCount !== "number" || !Number.isFinite(pageCount)) {
    return false;
  }

  const numericPageCount = Math.trunc(pageCount);

  return (
    numericPageCount >= resolvedConfig.minimum &&
    numericPageCount <= resolvedConfig.maximum &&
    (numericPageCount - resolvedConfig.minimum) % resolvedConfig.step === 0
  );
}

export function getPageCountStepCount(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
): number {
  if (!isValidPageCountConfig(config)) {
    return 0;
  }

  const normalizedPageCount = normalizePageCount(pageCount, config);
  if (typeof normalizedPageCount !== "number") {
    return 0;
  }

  const activeSegmentMinimum =
    getPageCountPricingMode(config.pricing) === "segmented"
      ? (getPageCountSegment(normalizedPageCount, config)?.minimum ??
        config.minimum)
      : config.minimum;

  if (normalizedPageCount <= activeSegmentMinimum) {
    return 0;
  }

  return Math.max(
    0,
    (normalizedPageCount - activeSegmentMinimum) / config.step,
  );
}

export function formatPageCountBreakdown(
  pageCount: number | null | undefined,
  config?: ProductPageCountConfig | null,
): string | undefined {
  const enabledConfig = isValidPageCountConfig(config)
    ? config
    : pageCount && pageCount > 0
      ? {
          enabled: true,
          minimum: pageCount,
          maximum: pageCount,
          step: PAGE_COUNT_DIVISOR,
          coverPages: DEFAULT_PAGE_COUNT_COVER_PAGES,
        }
      : undefined;

  if (!enabledConfig) {
    return undefined;
  }

  const normalizedPageCount = normalizePageCount(pageCount, enabledConfig);
  if (typeof normalizedPageCount !== "number") {
    return undefined;
  }

  return `${normalizedPageCount} + ${enabledConfig.coverPages}`;
}

export type CalculateConfiguredProductPriceOptions = {
  quantity: number;
  prices: Price[] | undefined;
  priceType: PriceTypeEnum;
  discount?: number;
  calculatedCombination?: string;
  volume?: number;
  customFormat: boolean;
  width?: number;
  height?: number;
  minimumOrder?: number;
  customPrice?: number | null;
  bleed?: number;
  customerDiscount?: number;
  customSizes?: CustomSizeWithQuantity[];
  lng?: string;
  expressPercent?: number;
  pageCount?: number | null;
  pageCountConfig?: ProductPageCountConfig | null;
  selectedAttributeOptions?: PageCountSelection;
};

export function calculateConfiguredProductPrice(
  options: CalculateConfiguredProductPriceOptions,
) {
  const basePrice = calcPrice(
    options.quantity,
    options.prices,
    options.priceType,
    options.discount,
    options.calculatedCombination,
    options.volume,
    options.customFormat,
    options.width,
    options.height,
    options.minimumOrder,
    options.customPrice,
    options.bleed,
    options.customerDiscount,
    options.customSizes,
    options.lng,
    options.expressPercent,
  );

  if (
    !isValidPageCountConfig(options.pageCountConfig) ||
    typeof basePrice.result !== "number" ||
    !Number.isFinite(basePrice.result) ||
    (typeof options.customPrice === "number" && options.customPrice > 0)
  ) {
    return basePrice;
  }

  const activePageCountConfig = resolvePageCountConfigForSelection(
    options.pageCountConfig,
    options.selectedAttributeOptions,
  );

  if (!activePageCountConfig) {
    return basePrice;
  }

  if (
    typeof options.pageCount === "number" &&
    Number.isFinite(options.pageCount) &&
    !isPageCountAllowed(
      options.pageCount,
      activePageCountConfig,
      options.selectedAttributeOptions,
    )
  ) {
    return {
      ...basePrice,
      error: "Page count is not available for the selected options",
      result: undefined,
    };
  }

  const stepPrices = activePageCountConfig.pricing?.stepPrices;
  const stepCount = getPageCountStepCount(
    options.pageCount,
    activePageCountConfig,
  );

  if (!stepPrices?.length || stepCount <= 0) {
    return basePrice;
  }

  const stepSurcharge = calcPrice(
    options.quantity,
    stepPrices,
    options.priceType,
    options.discount,
    options.calculatedCombination,
    options.volume,
    options.customFormat,
    options.width,
    options.height,
    options.minimumOrder,
    null,
    options.bleed,
    options.customerDiscount,
    options.customSizes,
    options.lng,
    options.expressPercent,
  );

  if (
    typeof stepSurcharge.result !== "number" ||
    !Number.isFinite(stepSurcharge.result) ||
    stepSurcharge.result <= 0
  ) {
    return basePrice;
  }

  const baseResult = basePrice.result;
  const stepResult = stepSurcharge.result;

  return {
    ...basePrice,
    result: baseResult + stepResult * stepCount,
  };
}
