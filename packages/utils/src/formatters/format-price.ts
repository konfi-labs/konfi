import {
  type CurrencyCode,
  type CurrencyConversionSnapshot,
  DEFAULT_LOCALE,
  Locale,
} from "@konfi/types";
import {
  convertCurrencyMinorAmount,
  type CurrencyConversionEngineSettings,
} from "../currency-conversion";
import {
  DEFAULT_CURRENCY_CODE,
  getCurrencyMinorUnitDigits,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
  type CurrencySettingsInput,
} from "../currencies";

const SUPPORTED_LOCALES = new Set<string>(Object.values(Locale));

function getSupportedLocale(lng?: string): Locale {
  return lng && SUPPORTED_LOCALES.has(lng) ? (lng as Locale) : DEFAULT_LOCALE;
}

function getFractionDigits(value: number): number {
  if (value === 0 || !isFinite(value)) return 2;
  const absValue = Math.abs(value);
  if (absValue >= 0.01) return 2;
  return Math.ceil(-Math.log10(absValue));
}

export interface FormatPriceOptions {
  minorUnitDigits?: number;
  locale?: string;
}

export type DisplayCurrencyAmount = {
  amountMinor: number;
  currency: CurrencyCode;
  snapshot?: CurrencyConversionSnapshot;
};

export function convertMinorAmountForDisplay({
  amountMinor,
  baseCurrency,
  settings,
  targetCurrency,
}: {
  amountMinor: number;
  baseCurrency?: CurrencyCode | null;
  settings?: CurrencyConversionEngineSettings | CurrencySettingsInput | null;
  targetCurrency?: CurrencyCode | null;
}): DisplayCurrencyAmount {
  const normalizedSettings = normalizeCurrencySettings(settings);
  const resolvedTargetCurrency =
    normalizeCurrencyCode(targetCurrency) ??
    normalizedSettings.defaultCurrencyCode ??
    DEFAULT_CURRENCY_CODE;
  const sign = amountMinor < 0 ? -1 : 1;
  const roundedAmountMinor = Math.round(Math.abs(amountMinor));
  const result = convertCurrencyMinorAmount({
    amountMinor: roundedAmountMinor,
    baseCurrency,
    settings: normalizedSettings,
    targetCurrency: resolvedTargetCurrency,
  });

  if (result.ok) {
    return {
      amountMinor: result.amountMinor * sign,
      currency: result.snapshot.toCurrencyCode,
      snapshot: {
        ...result.snapshot,
        amountMinor: result.snapshot.amountMinor * sign,
        convertedAmountMinor: result.snapshot.convertedAmountMinor * sign,
      },
    };
  }

  const fallbackCurrency =
    normalizeCurrencyCode(baseCurrency) ??
    normalizedSettings.conversion.baseCurrencyCode ??
    DEFAULT_CURRENCY_CODE;

  return {
    amountMinor,
    currency: fallbackCurrency,
  };
}

export function formatConvertedPrice(
  price: number,
  targetCurrency?: CurrencyCode | null,
  settings?: CurrencyConversionEngineSettings | CurrencySettingsInput | null,
  volume?: number,
  unit?: string,
  lng?: string,
  baseCurrency?: CurrencyCode | null,
): string {
  const normalizedSettings = normalizeCurrencySettings(settings);
  const converted = convertMinorAmountForDisplay({
    amountMinor: price,
    baseCurrency,
    settings: normalizedSettings,
    targetCurrency,
  });

  return formatPrice(
    converted.amountMinor,
    converted.currency,
    volume,
    unit,
    lng,
    {
      minorUnitDigits: getCurrencyMinorUnitDigits(
        converted.currency,
        normalizedSettings,
      ),
    },
  );
}

export function formatPrice(
  price: number,
  currency?: CurrencyCode,
  volume?: number,
  unit?: string,
  lng?: string,
  options?: FormatPriceOptions,
): string {
  const minorUnitDigits =
    typeof options?.minorUnitDigits === "number" &&
    Number.isInteger(options.minorUnitDigits) &&
    options.minorUnitDigits >= 0
      ? options.minorUnitDigits
      : 2;
  const calc = price / (volume ?? 1) / 10 ** minorUnitDigits;
  const minorUnitStep = 1 / 10 ** minorUnitDigits;
  const fractionDigits =
    Math.abs(calc) > 0 && Math.abs(calc) < minorUnitStep
      ? Math.max(minorUnitDigits, getFractionDigits(calc))
      : minorUnitDigits;
  const locale = options?.locale ?? getSupportedLocale(lng);
  let formattedPrice = currency
    ? formatCurrency(calc, currency, locale, fractionDigits)
    : calc.toFixed(fractionDigits);
  formattedPrice += unit ? `/${unit}` : "";
  return formattedPrice;
}

function formatCurrency(
  value: number,
  currency: CurrencyCode,
  locale: string,
  fractionDigits: number,
): string {
  try {
    return Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `${value.toFixed(fractionDigits)} ${currency}`;
  }
}
