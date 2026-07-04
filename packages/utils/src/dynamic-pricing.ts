import {
  Attribute,
  type CurrencyCode,
  CurrencyEnum,
  DynamicPricingAttributeRule,
  DynamicPricingConfig,
  DynamicPricingGlobalRule,
  DynamicPricingPreset,
  Price,
  Product,
} from "@konfi/types";
import { getHighPriceWithObject, getLowPriceWithObject } from "./getters";
import {
  areAllDependencyRulesMet,
  getDisabledOptionsFromRules,
  normalizeAttributeDependency,
} from "./getters/normalize-attribute-dependency";
import {
  PAGE_COUNT_DIVISOR,
  normalizePageCount,
  resolvePageCountConfigForSelection,
} from "./page-count";
import { applyProductPriceOffsets } from "./product-price-offsets";
import {
  calculateSheetsNeeded,
  calculateUnitsPerSheet,
  extractPaperAndFormat,
} from "./sheet-calculations";

export type DynamicPricingSelection = Record<string, string>;

export type DynamicPricingContext = {
  attributes?: Pick<
    Attribute,
    "calculateStockFromSheet" | "format" | "id" | "options" | "trackStock"
  >[];
  customFormat?: boolean;
  height?: number;
  pageCount?: number | null;
  quantity?: number;
  volume?: number;
  width?: number;
};

type DynamicMetricContext = DynamicPricingContext & {
  baseSelection: DynamicPricingSelection;
  product: Pick<
    Product,
    | "attributeDependencies"
    | "attributeOptions"
    | "attributes"
    | "customSize"
    | "pageCount"
    | "spec"
  >;
};

const PRICE_ROUNDING_PRECISION = 100;
const MAX_DYNAMIC_PRICING_SELECTIONS = 250;

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toRoundedNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return (
    Math.round(value * PRICE_ROUNDING_PRECISION) / PRICE_ROUNDING_PRECISION
  );
}

function createDynamicListingFallbackPrice(currency: CurrencyCode): Price {
  return {
    currency,
    threshold: 0,
    value: 0,
  };
}

function getEffectiveDimensions(context: DynamicMetricContext): {
  height: number;
  width: number;
} {
  const useConfiguredSize = context.customFormat || context.product.customSize;
  const width = useConfiguredSize
    ? (context.width ?? context.product.spec.minimumWidth ?? 0)
    : 0;
  const height = useConfiguredSize
    ? (context.height ?? context.product.spec.minimumHeight ?? 0)
    : 0;

  return {
    height,
    width,
  };
}

function hasSheetMetric(
  config: Pick<DynamicPricingConfig, "globalRules">,
): boolean {
  return config.globalRules.some(
    (rule) => rule.metric === "itemsPerSheet" || rule.metric === "sheetsNeeded",
  );
}

function buildResolvedAttributeRules(
  config: DynamicPricingConfig,
  presets: DynamicPricingPreset[],
): DynamicPricingAttributeRule[] {
  const ruleMap = new Map<string, DynamicPricingAttributeRule>();

  for (const preset of presets) {
    if (
      preset.kind !== "attribute" ||
      !preset.attributeRule ||
      !preset.attributeRule.attributeId ||
      !Array.isArray(preset.attributeRule.adjustments)
    ) {
      continue;
    }

    ruleMap.set(preset.attributeRule.attributeId, preset.attributeRule);
  }

  for (const rule of config.attributeRules) {
    if (rule.mode !== "adjust") {
      if (!ruleMap.has(rule.attributeId)) {
        ruleMap.set(rule.attributeId, rule);
      }
      continue;
    }

    ruleMap.set(rule.attributeId, rule);
  }

  return Array.from(ruleMap.values());
}

function buildResolvedGlobalRules(
  config: DynamicPricingConfig,
  presets: DynamicPricingPreset[],
): DynamicPricingGlobalRule[] {
  const ruleMap = new Map<string, DynamicPricingGlobalRule>();

  for (const preset of presets) {
    if (
      preset.kind !== "global" ||
      !preset.globalRule ||
      !preset.globalRule.id ||
      !preset.globalRule.target ||
      !preset.globalRule.calculator
    ) {
      continue;
    }

    ruleMap.set(preset.globalRule.id, preset.globalRule);
  }

  for (const rule of config.globalRules) {
    ruleMap.set(rule.id, rule);
  }

  return Array.from(ruleMap.values());
}

export function resolveDynamicPricingConfig(
  config: DynamicPricingConfig,
  presets: DynamicPricingPreset[] = [],
): DynamicPricingConfig {
  if (presets.length === 0) {
    return config;
  }

  const linkedPresetIds = new Set(config.linkedPresetIds ?? []);
  const linkedPresets = presets.filter((preset) =>
    linkedPresetIds.has(preset.id),
  );

  return {
    ...config,
    attributeRules: buildResolvedAttributeRules(config, linkedPresets),
    globalRules: buildResolvedGlobalRules(config, linkedPresets),
  };
}

export function requiresRemoteDynamicPricingResolution(
  config: DynamicPricingConfig,
): boolean {
  return (config.linkedPresetIds?.length ?? 0) > 0 || hasSheetMetric(config);
}

function getSheetMetricValues(context: DynamicMetricContext): {
  itemsPerSheet: number;
  sheetsNeeded: number;
} {
  if (!context.attributes?.length) {
    return {
      itemsPerSheet: 0,
      sheetsNeeded: 0,
    };
  }

  const { paperAttribute, formatOption } = extractPaperAndFormat(
    context.attributes,
    context.baseSelection,
  );
  const { height, width } = getEffectiveDimensions(context);
  const itemWidth = formatOption?.formatWidth ?? width;
  const itemHeight = formatOption?.formatHeight ?? height;

  if (
    !paperAttribute?.calculateStockFromSheet?.enabled ||
    itemWidth <= 0 ||
    itemHeight <= 0
  ) {
    return {
      itemsPerSheet: 0,
      sheetsNeeded: 0,
    };
  }

  const {
    bleed = 3,
    margin = 3,
    sheetHeight,
    sheetWidth,
  } = paperAttribute.calculateStockFromSheet;
  const itemsPerSheet = calculateUnitsPerSheet({
    allowRotation: true,
    bleed,
    itemHeight,
    itemWidth,
    margin,
    sheetHeight,
    sheetWidth,
  });
  const sheetsNeeded = calculateSheetsNeeded(
    context.quantity ?? context.volume ?? 0,
    itemsPerSheet,
    0,
  );

  return {
    itemsPerSheet,
    sheetsNeeded,
  };
}

function getPageCountSheetMetricValues(context: DynamicMetricContext): {
  coverSheetsPerUnit: number;
  coverSheetVolume: number;
  innerSheetsPerUnit: number;
  innerSheetVolume: number;
  totalSheetsPerUnit: number;
  totalSheetVolume: number;
} {
  const config = resolvePageCountConfigForSelection(
    context.product.pageCount,
    context.baseSelection,
  );
  const innerPages = normalizePageCount(context.pageCount, config) ?? 0;
  const coverPages = config?.coverPages ?? 0;
  const volume = context.volume ?? context.quantity ?? 0;
  const innerSheetsPerUnit =
    innerPages > 0 ? innerPages / PAGE_COUNT_DIVISOR : 0;
  const coverSheetsPerUnit =
    coverPages > 0 ? coverPages / PAGE_COUNT_DIVISOR : 0;
  const totalSheetsPerUnit = innerSheetsPerUnit + coverSheetsPerUnit;

  return {
    coverSheetsPerUnit,
    coverSheetVolume: coverSheetsPerUnit * volume,
    innerSheetsPerUnit,
    innerSheetVolume: innerSheetsPerUnit * volume,
    totalSheetsPerUnit,
    totalSheetVolume: totalSheetsPerUnit * volume,
  };
}

export function getDynamicMetricValue(
  rule: Pick<DynamicPricingGlobalRule, "inputId" | "metric">,
  config: DynamicPricingConfig,
  context: DynamicMetricContext,
): number {
  if (rule.inputId) {
    return (
      config.inputs?.find((input) => input.id === rule.inputId)?.value ?? 0
    );
  }

  const metric = rule.metric ?? "quantity";

  if (metric === "volume") {
    return context.volume ?? 0;
  }

  if (metric === "pageCount") {
    return (
      normalizePageCount(
        context.pageCount,
        resolvePageCountConfigForSelection(
          context.product.pageCount,
          context.baseSelection,
        ),
      ) ?? 0
    );
  }

  if (metric === "quantity") {
    return context.quantity ?? context.volume ?? 0;
  }

  const { height, width } = getEffectiveDimensions(context);

  if (metric === "width") {
    return width;
  }

  if (metric === "height") {
    return height;
  }

  if (metric === "area") {
    return width > 0 && height > 0 ? (width * height) / 1000000 : 0;
  }

  if (metric === "perimeter") {
    return width > 0 && height > 0 ? width * 2 + height * 2 : 0;
  }

  if (metric === "itemsPerSheet" || metric === "sheetsNeeded") {
    const sheetMetrics = getSheetMetricValues(context);
    return metric === "itemsPerSheet"
      ? sheetMetrics.itemsPerSheet
      : sheetMetrics.sheetsNeeded;
  }

  if (
    metric === "innerSheetsPerUnit" ||
    metric === "coverSheetsPerUnit" ||
    metric === "totalSheetsPerUnit" ||
    metric === "innerSheetVolume" ||
    metric === "coverSheetVolume" ||
    metric === "totalSheetVolume"
  ) {
    return getPageCountSheetMetricValues(context)[metric];
  }

  return 0;
}

function matchesRuleConditions(
  conditions: DynamicPricingGlobalRule["conditions"],
  selectedAttributeOptions: DynamicPricingSelection,
): boolean {
  if (!conditions?.length) {
    return true;
  }

  return conditions.every((condition) => {
    const selectedValue = selectedAttributeOptions[condition.attributeId];

    if (!selectedValue) {
      return false;
    }

    return condition.optionValues.includes(selectedValue);
  });
}

function evaluateGlobalRule(
  rule: DynamicPricingGlobalRule,
  config: DynamicPricingConfig,
  context: DynamicMetricContext,
): number {
  const metricValue = getDynamicMetricValue(rule, config, context);
  const outputMultiplier =
    rule.outputMultiplierInputId || rule.outputMultiplierMetric
      ? getDynamicMetricValue(
          {
            inputId: rule.outputMultiplierInputId,
            metric: rule.outputMultiplierMetric,
          },
          config,
          context,
        )
      : 1;
  let outputValue: number;

  if (rule.calculator === "fixed") {
    outputValue = rule.fixedValue ?? 0;
    return outputValue * outputMultiplier;
  }

  if (rule.calculator === "multiplier") {
    outputValue = metricValue * (rule.multiplier ?? 0);
    return outputValue * outputMultiplier;
  }

  const minimumMetricValue = rule.minimumMetricValue ?? 0;
  const maximumMetricValue = rule.maximumMetricValue ?? minimumMetricValue;
  const minimumOutputValue = rule.minimumOutputValue ?? 0;
  const maximumOutputValue = rule.maximumOutputValue ?? minimumOutputValue;

  if (rule.calculator === "tier") {
    const resolvedMaximumMetricValue =
      rule.maximumMetricValue ?? Number.POSITIVE_INFINITY;

    if (
      metricValue < minimumMetricValue ||
      metricValue > resolvedMaximumMetricValue
    ) {
      return 0;
    }

    outputValue = rule.fixedValue ?? minimumOutputValue;
    return outputValue * outputMultiplier;
  }

  if (maximumMetricValue === minimumMetricValue) {
    outputValue = rule.inverse ? maximumOutputValue : minimumOutputValue;
    return outputValue * outputMultiplier;
  }

  const normalizedRatio = clampNumber(
    (metricValue - minimumMetricValue) /
      (maximumMetricValue - minimumMetricValue),
    0,
    1,
  );
  const ratio = rule.inverse ? 1 - normalizedRatio : normalizedRatio;

  outputValue =
    minimumOutputValue + (maximumOutputValue - minimumOutputValue) * ratio;
  return outputValue * outputMultiplier;
}

function evaluateAttributeRule(
  rule: DynamicPricingAttributeRule,
  selectedAttributeOptions: DynamicPricingSelection,
): { deliveryTime: number; price: number } {
  if (rule.mode === "ignore") {
    return {
      deliveryTime: 0,
      price: 0,
    };
  }

  const selectedValue = selectedAttributeOptions[rule.attributeId];

  if (!selectedValue) {
    return {
      deliveryTime: 0,
      price: 0,
    };
  }

  const adjustment = rule.adjustments.find(
    (entry) => entry.optionValue === selectedValue,
  );

  return {
    deliveryTime: adjustment?.deliveryTimeAdjustment ?? 0,
    price: adjustment?.priceAdjustment ?? 0,
  };
}

export function parseDynamicSelectionFromCombination(
  product: Pick<
    Product,
    "attributeDependencies" | "attributeOptions" | "attributes"
  >,
  combination?: string | null,
): DynamicPricingSelection {
  const values =
    combination?.split("-").filter((value) => value.length > 0) ?? [];
  const selection: DynamicPricingSelection = {};
  let nextValueIndex = 0;

  for (const attributeId of product.attributes) {
    const allowedValues = product.attributeOptions[attributeId] ?? [];

    if (allowedValues.length === 0) {
      continue;
    }

    const rules = normalizeAttributeDependency(
      product.attributeDependencies?.[attributeId],
    );

    if (rules.length > 0 && !areAllDependencyRulesMet(rules, selection)) {
      continue;
    }

    const disabledValues = getDisabledOptionsFromRules(
      rules,
      allowedValues,
      selection,
    );
    const usableValues = allowedValues.filter(
      (value) => !disabledValues.includes(value),
    );
    const preferredValue = values[nextValueIndex];

    const resolvedValue =
      preferredValue && usableValues.includes(preferredValue)
        ? preferredValue
        : usableValues[0];

    if (!resolvedValue) {
      continue;
    }

    selection[attributeId] = resolvedValue;
    nextValueIndex += 1;
  }

  return selection;
}

export function buildDynamicPricingSelections(
  product: Pick<
    Product,
    "attributeDependencies" | "attributeOptions" | "attributes"
  >,
): DynamicPricingSelection[] {
  const combinations: DynamicPricingSelection[] = [];
  let didHitSelectionLimit = false;

  const visit = (index: number, current: DynamicPricingSelection) => {
    if (didHitSelectionLimit) {
      return;
    }

    if (index >= product.attributes.length) {
      combinations.push({ ...current });

      if (combinations.length >= MAX_DYNAMIC_PRICING_SELECTIONS) {
        didHitSelectionLimit = true;
      }

      return;
    }

    const attributeId = product.attributes[index];
    const rules = normalizeAttributeDependency(
      product.attributeDependencies?.[attributeId],
    );

    if (rules.length > 0 && !areAllDependencyRulesMet(rules, current)) {
      visit(index + 1, current);
      return;
    }

    const allowedValues = product.attributeOptions[attributeId] ?? [];

    if (allowedValues.length === 0) {
      visit(index + 1, current);
      return;
    }

    const disabledValues = getDisabledOptionsFromRules(
      rules,
      allowedValues,
      current,
    );
    const usableValues = allowedValues.filter(
      (value) => !disabledValues.includes(value),
    );

    if (usableValues.length === 0) {
      visit(index + 1, current);
      return;
    }

    for (const optionValue of usableValues) {
      visit(index + 1, {
        ...current,
        [attributeId]: optionValue,
      });
    }
  };

  visit(0, {});

  if (didHitSelectionLimit) {
    console.warn(
      `Dynamic pricing selection generation hit the ${MAX_DYNAMIC_PRICING_SELECTIONS} combination guardrail.`,
    );
  }

  return combinations.length > 0 ? combinations : [{}];
}

export function buildDynamicPricesForSelection({
  calculatedCombination,
  config,
  context,
  currency,
  product,
  selectedAttributeOptions,
}: {
  calculatedCombination: string;
  config: DynamicPricingConfig;
  context?: DynamicPricingContext;
  currency?: CurrencyCode;
  product: Pick<
    Product,
    | "attributeDependencies"
    | "attributeOptions"
    | "attributes"
    | "customSize"
    | "pageCount"
    | "spec"
    | "volumes"
  >;
  selectedAttributeOptions: DynamicPricingSelection;
}): Price[] {
  const resolvedCurrency = currency ?? CurrencyEnum.PLN;

  return product.volumes.map((volume) => {
    const metricContext: DynamicMetricContext = {
      ...context,
      baseSelection: selectedAttributeOptions,
      product,
      quantity: volume.value,
      volume: volume.value,
    };

    let priceValue = config.basePrice;
    let deliveryTime = config.baseDeliveryTime ?? 0;

    for (const attributeRule of config.attributeRules) {
      const adjustment = evaluateAttributeRule(
        attributeRule,
        selectedAttributeOptions,
      );
      priceValue += adjustment.price;
      deliveryTime += adjustment.deliveryTime;
    }

    for (const globalRule of config.globalRules) {
      if (
        !matchesRuleConditions(globalRule.conditions, selectedAttributeOptions)
      ) {
        continue;
      }

      const adjustment = evaluateGlobalRule(globalRule, config, metricContext);

      if (globalRule.target === "deliveryTime") {
        deliveryTime += adjustment;
      } else {
        priceValue += adjustment;
      }
    }

    return {
      combination: {
        active: true,
        customFormat: false,
        id: calculatedCombination,
      },
      currency: resolvedCurrency,
      value: toRoundedNumber(Math.max(0, priceValue)),
      volume: {
        ...volume,
        deliveryTime: Math.max(0, Math.round(deliveryTime)),
      },
    } satisfies Price;
  });
}

function getDefaultDynamicSelection(
  product: Pick<
    Product,
    "attributeDependencies" | "attributeOptions" | "attributes"
  >,
): DynamicPricingSelection {
  return buildDynamicPricingSelections(product)[0] ?? {};
}

export function calculateDynamicListingPrices({
  applyPriceOffsets = false,
  config,
  context,
  currency,
  product,
}: {
  applyPriceOffsets?: boolean;
  config: DynamicPricingConfig;
  context?: DynamicPricingContext;
  currency?: CurrencyCode;
  product: Pick<
    Product,
    | "attributeDependencies"
    | "attributeOptions"
    | "attributes"
    | "customSize"
    | "pageCount"
    | "priceOffsets"
    | "spec"
    | "volumes"
  >;
}): {
  defaultPrice: Price;
  highPrice: Price;
  lowPrice: Price;
} {
  const resolvedCurrency = currency ?? CurrencyEnum.PLN;
  const selections = buildDynamicPricingSelections(product);
  const allPrices = selections.flatMap((selection, index) => {
    const calculatedCombination =
      index === 0 ? "__default__" : `__dynamic__${index}`;
    const prices = buildDynamicPricesForSelection({
      calculatedCombination,
      config,
      context,
      currency: resolvedCurrency,
      product,
      selectedAttributeOptions: selection,
    });

    return applyPriceOffsets
      ? applyProductPriceOffsets({
          calculatedCombination,
          pageCount: context?.pageCount,
          prices,
          product,
          selectedAttributeOptions: selection,
          volume: context?.volume,
        })
      : prices;
  });
  const defaultSelection = getDefaultDynamicSelection(product);
  const defaultPricesSource = buildDynamicPricesForSelection({
    calculatedCombination: "__default__",
    config,
    context,
    currency: resolvedCurrency,
    product,
    selectedAttributeOptions: defaultSelection,
  });
  const defaultPrices = applyPriceOffsets
    ? applyProductPriceOffsets({
        calculatedCombination: "__default__",
        pageCount: context?.pageCount,
        prices: defaultPricesSource,
        product,
        selectedAttributeOptions: defaultSelection,
        volume: context?.volume,
      })
    : defaultPricesSource;
  const defaultVolume =
    product.spec.defaultOrder ??
    product.volumes[0]?.value ??
    product.spec.minimumOrder;
  const defaultPrice =
    defaultPrices.find((price) => price.volume?.value === defaultVolume) ??
    defaultPrices[0] ??
    createDynamicListingFallbackPrice(resolvedCurrency);
  const { price: lowPrice } =
    allPrices.length > 0
      ? getLowPriceWithObject(allPrices, product.spec.minimumOrder ?? 1)
      : { price: undefined };
  const { price: highPrice } =
    allPrices.length > 0
      ? getHighPriceWithObject(allPrices, product.spec.minimumOrder ?? 1)
      : { price: undefined };

  return {
    defaultPrice,
    highPrice: highPrice ?? createDynamicListingFallbackPrice(resolvedCurrency),
    lowPrice: lowPrice ?? createDynamicListingFallbackPrice(resolvedCurrency),
  };
}
