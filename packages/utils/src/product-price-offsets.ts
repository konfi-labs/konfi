import { CurrencyEnum } from "@konfi/types";
import type {
  Price,
  Product,
  ProductPriceOffsetConfig,
  ProductPriceOffsetRule,
  ProductPriceOffsetRuleScope,
} from "@konfi/types";
import { getHighPriceWithObject, getLowPriceWithObject } from "./getters";

export type ProductPriceOffsetSelection =
  | Record<string, string | number>
  | null
  | undefined;

export type ProductPriceOffsetProduct = Pick<
  Product,
  "attributeOptions" | "attributes" | "priceOffsets"
>;

export type ApplyProductPriceOffsetsOptions = {
  product?: ProductPriceOffsetProduct | null;
  prices: Price[] | undefined;
  calculatedCombination?: string | null;
  selectedAttributeOptions?: ProductPriceOffsetSelection;
  volume?: number | null;
  pageCount?: number | null;
};

const PRICE_OFFSET_RULE_SCOPES: ProductPriceOffsetRuleScope[] = [
  "product",
  "attributeOption",
  "configuration",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOffsetRule(
  value: unknown,
): ProductPriceOffsetRule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = normalizeOptionalString(value.id);
  const scope =
    typeof value.scope === "string" &&
    PRICE_OFFSET_RULE_SCOPES.includes(
      value.scope as ProductPriceOffsetRuleScope,
    )
      ? (value.scope as ProductPriceOffsetRuleScope)
      : undefined;

  if (!id || !scope) {
    return undefined;
  }

  const rule: ProductPriceOffsetRule = {
    enabled: value.enabled !== false,
    id,
    scope,
  };
  const label = normalizeOptionalString(value.label);
  const percent = normalizeOptionalNumber(value.percent);
  const fixedValue = normalizeOptionalNumber(value.fixedValue);
  const attributeId = normalizeOptionalString(value.attributeId);
  const optionValue = normalizeOptionalString(value.optionValue);
  const calculatedCombination = normalizeOptionalString(
    value.calculatedCombination,
  );
  const volumeValue = normalizeOptionalNumber(value.volumeValue);
  const pageCount = normalizeOptionalNumber(value.pageCount);

  if (label) {
    rule.label = label;
  }
  if (percent !== undefined) {
    rule.percent = percent;
  }
  if (fixedValue !== undefined) {
    rule.fixedValue = fixedValue;
  }
  if (attributeId) {
    rule.attributeId = attributeId;
  }
  if (optionValue) {
    rule.optionValue = optionValue;
  }
  if (calculatedCombination) {
    rule.calculatedCombination = calculatedCombination;
  }
  if (volumeValue !== undefined) {
    rule.volumeValue = volumeValue;
  }
  if (pageCount !== undefined) {
    rule.pageCount = pageCount;
  }

  if (scope === "attributeOption" && (!rule.attributeId || !rule.optionValue)) {
    return undefined;
  }

  if (scope === "configuration" && !rule.calculatedCombination) {
    return undefined;
  }

  return rule;
}

export function normalizeProductPriceOffsetsConfig(
  value: unknown,
): ProductPriceOffsetConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rules = Array.isArray(value.rules)
    ? value.rules.flatMap((rule) => {
        const normalized = normalizeOffsetRule(rule);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    enabled: value.enabled === true,
    rules,
  };
}

export function hasEnabledProductPriceOffsets(
  product?: Pick<Product, "priceOffsets"> | null,
): boolean {
  return Boolean(
    product?.priceOffsets?.enabled &&
    (product.priceOffsets.rules ?? []).some((rule) => rule.enabled !== false),
  );
}

function clonePrice(price: Price): Price {
  return {
    ...price,
    combination: price.combination ? { ...price.combination } : undefined,
    volume: price.volume ? { ...price.volume } : undefined,
  };
}

function resolveSelectionFromPrice(
  product: ApplyProductPriceOffsetsOptions["product"],
  price: Price,
): Record<string, string> {
  const combinationId = price.combination?.id;
  if (!product || !combinationId) {
    return {};
  }

  const values = combinationId.split("-").filter((value) => value.length > 0);
  const selection: Record<string, string> = {};
  let valueIndex = 0;

  for (const attributeId of product.attributes ?? []) {
    const allowedValues = product.attributeOptions?.[attributeId] ?? [];
    const candidate = values[valueIndex];

    if (candidate && allowedValues.includes(candidate)) {
      selection[attributeId] = candidate;
      valueIndex += 1;
    }
  }

  return selection;
}

function getSelectedOptionValue({
  price,
  product,
  selectedAttributeOptions,
}: {
  price: Price;
  product: ApplyProductPriceOffsetsOptions["product"];
  selectedAttributeOptions: ProductPriceOffsetSelection;
}): Record<string, string | number> {
  if (selectedAttributeOptions) {
    return selectedAttributeOptions;
  }

  return resolveSelectionFromPrice(product, price);
}

function matchesAttributeOptionRule({
  price,
  product,
  rule,
  selectedAttributeOptions,
}: {
  price: Price;
  product: ApplyProductPriceOffsetsOptions["product"];
  rule: ProductPriceOffsetRule;
  selectedAttributeOptions: ProductPriceOffsetSelection;
}): boolean {
  if (!rule.attributeId || !rule.optionValue) {
    return false;
  }

  const selection = getSelectedOptionValue({
    price,
    product,
    selectedAttributeOptions,
  });

  return String(selection[rule.attributeId] ?? "") === rule.optionValue;
}

function matchesConfigurationRule({
  calculatedCombination,
  pageCount,
  price,
  rule,
  volume,
}: {
  calculatedCombination?: string | null;
  pageCount?: number | null;
  price: Price;
  rule: ProductPriceOffsetRule;
  volume?: number | null;
}): boolean {
  if (!rule.calculatedCombination) {
    return false;
  }

  const effectiveCombination =
    price.combination?.id ?? calculatedCombination ?? undefined;
  if (effectiveCombination !== rule.calculatedCombination) {
    return false;
  }

  if (rule.volumeValue !== undefined) {
    const effectiveVolume = price.volume?.value ?? volume ?? undefined;
    if (effectiveVolume !== rule.volumeValue) {
      return false;
    }
  }

  if (rule.pageCount !== undefined && pageCount !== rule.pageCount) {
    return false;
  }

  return true;
}

function getMatchingRules({
  calculatedCombination,
  pageCount,
  price,
  product,
  selectedAttributeOptions,
  volume,
}: Omit<ApplyProductPriceOffsetsOptions, "prices"> & {
  price: Price;
}): ProductPriceOffsetRule[] {
  const config = product?.priceOffsets;
  if (!config?.enabled) {
    return [];
  }

  const enabledRules = (config.rules ?? []).filter(
    (rule) => rule.enabled !== false,
  );
  const productRules = enabledRules.filter((rule) => rule.scope === "product");
  const attributeRules = enabledRules.filter(
    (rule) =>
      rule.scope === "attributeOption" &&
      matchesAttributeOptionRule({
        price,
        product,
        rule,
        selectedAttributeOptions,
      }),
  );
  const configurationRules = enabledRules.filter(
    (rule) =>
      rule.scope === "configuration" &&
      matchesConfigurationRule({
        calculatedCombination,
        pageCount,
        price,
        rule,
        volume,
      }),
  );

  return [...productRules, ...attributeRules, ...configurationRules];
}

function applyRuleToValue(value: number, rule: ProductPriceOffsetRule): number {
  const percent = rule.percent ?? 0;
  const fixedValue = rule.fixedValue ?? 0;
  const percentAdjusted = value * (1 + percent / 100);
  return Math.max(0, Math.round(percentAdjusted + fixedValue));
}

function applyRulesToPrice(
  price: Price,
  rules: ProductPriceOffsetRule[],
): Price {
  const cloned = clonePrice(price);

  if (
    typeof cloned.value !== "number" ||
    !Number.isFinite(cloned.value) ||
    rules.length === 0
  ) {
    return cloned;
  }

  cloned.value = rules.reduce(
    (currentValue, rule) => applyRuleToValue(currentValue, rule),
    cloned.value,
  );

  return cloned;
}

export function applyProductPriceOffsets({
  calculatedCombination,
  pageCount,
  prices,
  product,
  selectedAttributeOptions,
  volume,
}: ApplyProductPriceOffsetsOptions): Price[] {
  if (!prices?.length) {
    return [];
  }

  return prices.map((price) =>
    applyRulesToPrice(
      price,
      getMatchingRules({
        calculatedCombination,
        pageCount,
        price,
        product,
        selectedAttributeOptions,
        volume,
      }),
    ),
  );
}

export function getEffectiveProductListingPrices(
  product: Pick<
    Product,
    | "attributeOptions"
    | "attributes"
    | "defaultPrice"
    | "highPrice"
    | "lowPrice"
    | "priceOffsets"
    | "prices"
    | "spec"
  >,
): {
  defaultPrice: Price;
  highPrice: Price;
  lowPrice: Price;
} {
  const sourcePrices =
    product.prices && product.prices.length > 0
      ? product.prices
      : [product.defaultPrice, product.lowPrice, product.highPrice].filter(
          (price): price is Price => Boolean(price),
        );

  const effectivePrices = applyProductPriceOffsets({
    prices: sourcePrices,
    product,
  });
  const fallback: Price = {
    currency: product.defaultPrice?.currency ?? CurrencyEnum.PLN,
    value: 0,
  };
  const defaultPrice =
    applyProductPriceOffsets({
      prices: product.defaultPrice ? [product.defaultPrice] : [],
      product,
    })[0] ??
    effectivePrices[0] ??
    fallback;
  const { price: lowPrice } = getLowPriceWithObject(
    effectivePrices.length > 0 ? effectivePrices : [fallback],
    product.spec?.minimumOrder ?? 1,
  );
  const { price: highPrice } = getHighPriceWithObject(
    effectivePrices.length > 0 ? effectivePrices : [fallback],
    product.spec?.minimumOrder ?? 1,
  );

  return {
    defaultPrice,
    highPrice: highPrice ?? fallback,
    lowPrice: lowPrice ?? fallback,
  };
}
