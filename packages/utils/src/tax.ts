import type {
  CurrencyCode,
  Product,
  TaxCalculationMode,
  TaxLineSnapshot,
  TaxRateDefinition,
  TaxRegionDefinition,
  TaxSettings,
  TaxSummarySnapshot,
} from "@konfi/types";
import { CurrencyEnum } from "@konfi/types";

export const TAX_SETTINGS_DOC_ID = "tax";
export const DEFAULT_TAX_COUNTRY_CODE = "PL";
export const DEFAULT_TAX_RATE_ID = "pl-standard-vat";

export interface TaxableOrderLine {
  categoryId?: string | null;
  grossAmount: number;
  id?: string;
  productId?: string | null;
  productTypeId?: string | null;
  taxCategoryId?: string | null;
}

export interface BuildTaxSummaryOptions {
  country?: string | null;
  currency?: CurrencyCode | null;
  items: readonly TaxableOrderLine[];
  settings?: Partial<TaxSettings> | null;
  shippingGrossAmount?: number | null;
}

export interface OrderTaxSummaryProductSource {
  category?: { id?: string | null } | null;
  defaultPrice?: { taxCategoryId?: string | null } | null;
  id?: string | null;
  productType?: { id?: string | null } | null;
  taxCategoryId?: string | null;
}

export interface OrderTaxSummaryItem {
  id?: string;
  product?: OrderTaxSummaryProductSource | null;
  taxCategoryId?: string | null;
  totalPrice: number;
}

export type OrderItemTaxProductSource = Pick<
  Product,
  "category" | "defaultPrice" | "productType" | "taxCategoryId"
>;

export interface BuildOrderTaxSummaryOptions extends Omit<
  BuildTaxSummaryOptions,
  "items"
> {
  items: readonly OrderTaxSummaryItem[];
  productsById?: ReadonlyMap<string, OrderItemTaxProductSource>;
}

const COUNTRY_ALIASES: Record<string, string> = {
  poland: "PL",
  polska: "PL",
};

function normalizeTaxRatePercent(value: unknown, fallback = 23): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.round(value * 1000) / 1000;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return COUNTRY_ALIASES[
    trimmed
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
  ];
}

function normalizeRate(rate: Partial<TaxRateDefinition>): TaxRateDefinition {
  return {
    active: rate.active !== false,
    id:
      typeof rate.id === "string" && rate.id.trim()
        ? rate.id.trim()
        : DEFAULT_TAX_RATE_ID,
    name:
      typeof rate.name === "string" && rate.name.trim()
        ? rate.name.trim()
        : "Standard VAT",
    percent: normalizeTaxRatePercent(rate.percent),
    priority:
      typeof rate.priority === "number" && Number.isFinite(rate.priority)
        ? Math.round(rate.priority)
        : 0,
    target: {
      ...(normalizeStringList(rate.target?.categoryIds)
        ? { categoryIds: normalizeStringList(rate.target?.categoryIds) }
        : {}),
      ...(normalizeStringList(rate.target?.productIds)
        ? { productIds: normalizeStringList(rate.target?.productIds) }
        : {}),
      ...(normalizeStringList(rate.target?.productTypeIds)
        ? { productTypeIds: normalizeStringList(rate.target?.productTypeIds) }
        : {}),
      ...(normalizeStringList(rate.target?.taxCategoryIds)
        ? { taxCategoryIds: normalizeStringList(rate.target?.taxCategoryIds) }
        : {}),
    },
  };
}

function createDefaultTaxRate(): TaxRateDefinition {
  return {
    active: true,
    id: DEFAULT_TAX_RATE_ID,
    name: "Standard VAT",
    percent: 23,
    priority: 0,
  };
}

function normalizeRegion(
  region: Partial<TaxRegionDefinition>,
): TaxRegionDefinition {
  const rates =
    region.rates && region.rates.length > 0
      ? region.rates.map(normalizeRate)
      : [createDefaultTaxRate()];
  const defaultRate = rates.find((rate) => rate.id === region.defaultRateId);

  return {
    active: region.active !== false,
    calculationMode: region.calculationMode === "net" ? "net" : "gross",
    countryCodes: normalizeStringList(region.countryCodes)?.map(
      (country) => normalizeCountryCode(country) ?? country.toUpperCase(),
    ) ?? [DEFAULT_TAX_COUNTRY_CODE],
    defaultRateId: defaultRate?.id ?? rates[0]?.id ?? DEFAULT_TAX_RATE_ID,
    id:
      typeof region.id === "string" && region.id.trim()
        ? region.id.trim()
        : "pl",
    name:
      typeof region.name === "string" && region.name.trim()
        ? region.name.trim()
        : "Poland",
    pricesIncludeTax: region.pricesIncludeTax !== false,
    rates,
  };
}

export function createDefaultTaxSettings(): TaxSettings {
  return {
    defaultCountryCode: DEFAULT_TAX_COUNTRY_CODE,
    enabled: false,
    regions: [
      {
        active: true,
        calculationMode: "gross",
        countryCodes: [DEFAULT_TAX_COUNTRY_CODE],
        defaultRateId: DEFAULT_TAX_RATE_ID,
        id: "pl",
        name: "Poland",
        pricesIncludeTax: true,
        rates: [createDefaultTaxRate()],
      },
    ],
  };
}

export function normalizeTaxSettings(
  settings?: Partial<TaxSettings> | null,
): TaxSettings {
  const defaults = createDefaultTaxSettings();
  const regions =
    settings?.regions && settings.regions.length > 0
      ? settings.regions.map(normalizeRegion)
      : defaults.regions;

  return {
    defaultCountryCode:
      normalizeCountryCode(settings?.defaultCountryCode) ??
      defaults.defaultCountryCode,
    enabled: settings?.enabled === true,
    regions,
    ...(settings?.tenantId ? { tenantId: settings.tenantId } : {}),
    ...(settings?.updatedAt !== undefined
      ? { updatedAt: settings.updatedAt }
      : {}),
    ...(settings?.version !== undefined ? { version: settings.version } : {}),
  };
}

export function resolveTaxCountryCode(
  country: string | null | undefined,
  settings?: Partial<TaxSettings> | null,
): string {
  const normalizedSettings = normalizeTaxSettings(settings);
  return normalizeCountryCode(country) ?? normalizedSettings.defaultCountryCode;
}

function lineMatchesRate(
  line: TaxableOrderLine,
  rate: TaxRateDefinition,
): boolean {
  const target = rate.target;
  if (!target || Object.keys(target).length === 0) {
    return true;
  }

  const productMatches =
    line.productId && target.productIds?.includes(line.productId);
  const productTypeMatches =
    line.productTypeId && target.productTypeIds?.includes(line.productTypeId);
  const categoryMatches =
    line.categoryId && target.categoryIds?.includes(line.categoryId);
  const taxCategoryMatches =
    line.taxCategoryId && target.taxCategoryIds?.includes(line.taxCategoryId);

  return Boolean(
    productMatches ||
    productTypeMatches ||
    categoryMatches ||
    taxCategoryMatches,
  );
}

function resolveRate(
  region: TaxRegionDefinition,
  line: TaxableOrderLine,
): TaxRateDefinition {
  const activeRates = region.rates.filter((rate) => rate.active !== false);
  let bestMatchingRate: TaxRateDefinition | undefined;

  for (const rate of activeRates) {
    if (!lineMatchesRate(line, rate)) {
      continue;
    }

    if (
      !bestMatchingRate ||
      (rate.priority ?? 0) > (bestMatchingRate.priority ?? 0)
    ) {
      bestMatchingRate = rate;
    }
  }

  return (
    bestMatchingRate ??
    activeRates.find((rate) => rate.id === region.defaultRateId) ??
    activeRates[0] ??
    createDefaultTaxRate()
  );
}

function calculateTaxAmounts(
  amount: number,
  percent: number,
  mode: TaxCalculationMode,
  pricesIncludeTax: boolean,
) {
  const normalizedAmount = Math.max(0, Math.round(amount));

  if (mode === "net" && !pricesIncludeTax) {
    const taxAmount = Math.round(normalizedAmount * (percent / 100));
    return {
      grossAmount: normalizedAmount + taxAmount,
      netAmount: normalizedAmount,
      taxAmount,
    };
  }

  const taxAmount =
    percent > 0
      ? Math.round(normalizedAmount * (percent / (100 + percent)))
      : 0;

  return {
    grossAmount: normalizedAmount,
    netAmount: normalizedAmount - taxAmount,
    taxAmount,
  };
}

function resolveRegion(
  countryCode: string,
  settings: TaxSettings,
): TaxRegionDefinition {
  return (
    settings.regions.find(
      (region) =>
        region.active !== false && region.countryCodes.includes(countryCode),
    ) ??
    settings.regions.find((region) => region.active !== false) ??
    createDefaultTaxSettings().regions[0]
  );
}

function createTaxLine({
  countryCode,
  currency,
  index,
  line,
  pricesIncludeTax,
  region,
  sourceType,
}: {
  countryCode: string;
  currency: CurrencyCode;
  index: number;
  line: TaxableOrderLine;
  pricesIncludeTax: boolean;
  region: TaxRegionDefinition;
  sourceType: "item" | "shipping";
}): TaxLineSnapshot {
  const rate = resolveRate(region, line);
  const amounts = calculateTaxAmounts(
    line.grossAmount,
    rate.percent,
    region.calculationMode ?? "gross",
    pricesIncludeTax,
  );

  return {
    countryCode,
    currency,
    grossAmount: amounts.grossAmount,
    id: `${sourceType}:${line.id ?? index}`,
    netAmount: amounts.netAmount,
    rateId: rate.id,
    rateName: rate.name,
    regionId: region.id,
    sourceId: line.id,
    sourceType,
    taxAmount: amounts.taxAmount,
    ...(line.taxCategoryId ? { taxCategoryId: line.taxCategoryId } : {}),
    taxRatePercent: rate.percent,
  };
}

export function buildTaxSummary(
  options: BuildTaxSummaryOptions,
): TaxSummarySnapshot | undefined {
  const settings = normalizeTaxSettings(options.settings);
  if (!settings.enabled) {
    return undefined;
  }

  const countryCode = resolveTaxCountryCode(options.country, settings);
  const region = resolveRegion(countryCode, settings);
  const currency = options.currency ?? CurrencyEnum.PLN;
  const pricesIncludeTax = region.pricesIncludeTax !== false;
  const itemLines = options.items.map((line, index) =>
    createTaxLine({
      countryCode,
      currency,
      index,
      line,
      pricesIncludeTax,
      region,
      sourceType: "item",
    }),
  );
  const shippingGrossAmount = Math.max(
    0,
    Math.round(options.shippingGrossAmount ?? 0),
  );
  const shippingLines =
    shippingGrossAmount > 0
      ? [
          createTaxLine({
            countryCode,
            currency,
            index: 0,
            line: {
              grossAmount: shippingGrossAmount,
              id: "shipping",
              taxCategoryId: "shipping",
            },
            pricesIncludeTax,
            region,
            sourceType: "shipping",
          }),
        ]
      : [];
  const lines = [...itemLines, ...shippingLines];
  const subtotalGross = itemLines.reduce(
    (sum, line) => sum + line.grossAmount,
    0,
  );
  const shippingGross = shippingLines.reduce(
    (sum, line) => sum + line.grossAmount,
    0,
  );

  return {
    calculationMode: region.calculationMode ?? "gross",
    countryCode,
    currency,
    enabled: true,
    lines,
    pricesIncludeTax,
    regionId: region.id,
    shippingGross,
    subtotalGross,
    totalGross: subtotalGross + shippingGross,
    totalNet: lines.reduce((sum, line) => sum + line.netAmount, 0),
    totalTax: lines.reduce((sum, line) => sum + line.taxAmount, 0),
  };
}

export function buildOrderTaxSummary(
  options: BuildOrderTaxSummaryOptions,
): TaxSummarySnapshot | undefined {
  return buildTaxSummary({
    country: options.country,
    currency: options.currency,
    items: options.items.map((item) => {
      const productId = item.product?.id;
      const product = productId
        ? options.productsById?.get(productId)
        : undefined;

      return {
        categoryId: product?.category?.id ?? item.product?.category?.id,
        grossAmount: item.totalPrice,
        id: item.id,
        productId,
        productTypeId:
          product?.productType?.id ?? item.product?.productType?.id,
        taxCategoryId:
          item.taxCategoryId ??
          product?.taxCategoryId ??
          item.product?.taxCategoryId ??
          product?.defaultPrice?.taxCategoryId ??
          item.product?.defaultPrice?.taxCategoryId,
      };
    }),
    settings: options.settings,
    shippingGrossAmount: options.shippingGrossAmount,
  });
}
