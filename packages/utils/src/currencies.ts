import type {
  CurrencyCode,
  CurrencyConversionOffset,
  CurrencyConversionRate,
  CurrencyConversionSettings,
  CurrencyDefinition,
  CurrencySettings,
  SelectOption,
} from "@konfi/types";

export const CURRENCIES_SETTINGS_DOC_ID = "currencies";
export const DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER = "frankfurter";
export const DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES = 1440;

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "PLN";
const DEFAULT_CURRENCY_LOCALE = "pl-PL";
const DEFAULT_MINOR_UNIT_DIGITS = 2;
const MAX_CURRENCY_ORDER = Number.MAX_SAFE_INTEGER;

export const DEFAULT_CURRENCY_DEFINITIONS = [
  {
    code: DEFAULT_CURRENCY_CODE,
    name: "Polish Zloty",
    symbol: "zł",
    locale: DEFAULT_CURRENCY_LOCALE,
    minorUnitDigits: DEFAULT_MINOR_UNIT_DIGITS,
  },
] as const satisfies readonly Omit<
  CurrencyDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

type CurrencyConversionRateInput = Partial<CurrencyConversionRate>;
type CurrencyConversionOffsetInput = Partial<
  Omit<
    CurrencyConversionOffset,
    "fixedMinorUnits" | "percent" | "targetCurrencyCode"
  >
> & {
  targetCurrencyCode?: unknown;
  percent?: number | null;
  percentOffset?: number | null;
  fixedMinorUnits?: number | null;
  fixedOffsetMinor?: number | null;
  fixedMinor?: number | null;
};

type CurrencyConversionSettingsInput = Omit<
  Partial<CurrencyConversionSettings>,
  "offsets" | "rates"
> & {
  offsets?: readonly CurrencyConversionOffsetInput[];
  rates?: readonly CurrencyConversionRateInput[];
};

export type CurrencySettingsInput = Omit<
  Partial<CurrencySettings>,
  "conversion" | "currencies"
> & {
  conversion?: CurrencyConversionSettingsInput | null;
  currencies?: readonly Partial<CurrencyDefinition>[];
};

export type CurrencySettingsValidationIssueCode =
  | "MISSING_DEFAULT_CURRENCY"
  | "DEFAULT_CURRENCY_DISABLED"
  | "NO_ENABLED_CURRENCIES"
  | "MISSING_BASE_CURRENCY"
  | "BASE_CURRENCY_DISABLED";

export interface CurrencySettingsValidationIssue {
  code: CurrencySettingsValidationIssueCode;
  currencyCode?: CurrencyCode;
  message: string;
}

function cloneDefaultCurrency(
  currency: (typeof DEFAULT_CURRENCY_DEFINITIONS)[number],
  order: number,
): CurrencyDefinition {
  return {
    ...currency,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function isValidCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && normalizeCurrencyCode(value) === value;
}

export function humanizeCurrencyCode(code: CurrencyCode): string {
  return code.trim().toUpperCase();
}

function normalizeMinorUnitDigits(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 8
    ? value
    : DEFAULT_MINOR_UNIT_DIGITS;
}

function normalizeOrder(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCurrencyDefinition(
  currency: Partial<CurrencyDefinition> | undefined,
  order: number,
): CurrencyDefinition | null {
  const source = currency ?? {};
  const code = normalizeCurrencyCode(source.code);

  if (!code) {
    return null;
  }

  const name =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : humanizeCurrencyCode(code);
  const symbol =
    typeof source.symbol === "string" && source.symbol.trim()
      ? source.symbol.trim()
      : code;
  const locale =
    typeof source.locale === "string" && source.locale.trim()
      ? source.locale.trim()
      : DEFAULT_CURRENCY_LOCALE;

  return {
    code,
    name,
    symbol,
    locale,
    minorUnitDigits: normalizeMinorUnitDigits(source.minorUnitDigits),
    enabled: source.enabled !== false,
    archived: source.archived === true,
    order: normalizeOrder(source.order, order),
    isDefault: source.isDefault === true,
  };
}

function normalizeConversionRate(
  rate: CurrencyConversionRateInput,
): CurrencyConversionRate | null {
  const fromCurrencyCode = normalizeCurrencyCode(rate.fromCurrencyCode);
  const toCurrencyCode = normalizeCurrencyCode(rate.toCurrencyCode);

  if (
    !fromCurrencyCode ||
    !toCurrencyCode ||
    typeof rate.rate !== "number" ||
    !Number.isFinite(rate.rate) ||
    rate.rate <= 0
  ) {
    return null;
  }

  return {
    ...rate,
    fromCurrencyCode,
    toCurrencyCode,
    rate: rate.rate,
  };
}

function normalizeConversionOffset(
  offset: CurrencyConversionOffsetInput,
): CurrencyConversionOffset | null {
  const targetCurrencyCode = normalizeCurrencyCode(offset.targetCurrencyCode);

  if (!targetCurrencyCode) {
    return null;
  }

  return {
    ...offset,
    targetCurrencyCode,
    percent:
      typeof offset.percent === "number" && Number.isFinite(offset.percent)
        ? offset.percent
        : typeof offset.percentOffset === "number" &&
            Number.isFinite(offset.percentOffset)
          ? offset.percentOffset
          : undefined,
    fixedMinorUnits:
      typeof offset.fixedMinorUnits === "number" &&
      Number.isFinite(offset.fixedMinorUnits)
        ? Math.trunc(offset.fixedMinorUnits)
        : typeof offset.fixedOffsetMinor === "number" &&
            Number.isFinite(offset.fixedOffsetMinor)
          ? Math.trunc(offset.fixedOffsetMinor)
          : typeof offset.fixedMinor === "number" &&
              Number.isFinite(offset.fixedMinor)
            ? Math.trunc(offset.fixedMinor)
            : undefined,
  };
}

function createDefaultCurrencyConversionSettings(
  baseCurrencyCode: CurrencyCode = DEFAULT_CURRENCY_CODE,
): CurrencyConversionSettings {
  return {
    enabled: false,
    mode: "disabled",
    baseCurrencyCode,
    rates: [],
    offsets: [],
  };
}

function normalizeCurrencyConversionSettings(
  conversion: CurrencyConversionSettingsInput | null | undefined,
  defaultCurrencyCode: CurrencyCode,
): CurrencyConversionSettings {
  const baseCurrencyCode =
    normalizeCurrencyCode(conversion?.baseCurrencyCode) ?? defaultCurrencyCode;
  const rates = Array.isArray(conversion?.rates)
    ? conversion.rates
        .map(normalizeConversionRate)
        .filter((rate): rate is CurrencyConversionRate => rate !== null)
    : [];
  const offsets = Array.isArray(conversion?.offsets)
    ? conversion.offsets
        .map(normalizeConversionOffset)
        .filter((offset): offset is CurrencyConversionOffset => offset !== null)
    : [];
  const mode =
    conversion?.mode === "manual" || conversion?.mode === "automatic"
      ? conversion.mode
      : conversion?.enabled
        ? "manual"
        : "disabled";
  const automatic =
    mode === "automatic" || conversion?.automatic
      ? {
          ...conversion?.automatic,
          enabled:
            mode === "automatic"
              ? conversion?.automatic?.enabled !== false
              : conversion?.automatic?.enabled === true,
          provider:
            conversion?.automatic?.provider ??
            (mode === "automatic"
              ? DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER
              : undefined),
          refreshIntervalMinutes:
            conversion?.automatic?.refreshIntervalMinutes ??
            (mode === "automatic"
              ? DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES
              : undefined),
        }
      : undefined;

  return {
    ...conversion,
    enabled: mode !== "disabled" && conversion?.enabled !== false,
    mode,
    baseCurrencyCode,
    rates,
    offsets,
    ...(automatic ? { automatic } : {}),
  };
}

export function createDefaultCurrencySettings(): CurrencySettings {
  const defaultCurrencyCode = DEFAULT_CURRENCY_CODE;

  return {
    defaultCurrencyCode,
    currencies: DEFAULT_CURRENCY_DEFINITIONS.map((currency, index) =>
      cloneDefaultCurrency(currency, index),
    ),
    conversion: createDefaultCurrencyConversionSettings(defaultCurrencyCode),
  };
}

export function createInitialCurrencySettings(
  legacyDefaultCurrency?: CurrencyCode | null,
  updatedAt?: unknown,
): CurrencySettings {
  const defaultCurrencyCode =
    normalizeCurrencyCode(legacyDefaultCurrency) ?? DEFAULT_CURRENCY_CODE;
  const defaultSettings = createDefaultCurrencySettings();
  const currenciesByCode = new Map<CurrencyCode, CurrencyDefinition>();

  for (const currency of defaultSettings.currencies) {
    currenciesByCode.set(currency.code, {
      ...currency,
      isDefault: currency.code === defaultCurrencyCode,
    });
  }

  if (!currenciesByCode.has(defaultCurrencyCode)) {
    currenciesByCode.set(defaultCurrencyCode, {
      ...createUnknownCurrencyDefinition(defaultCurrencyCode),
      enabled: true,
      archived: false,
      order: 0,
      isDefault: true,
    });
  }

  return {
    defaultCurrencyCode,
    currencies: sortCurrencyDefinitions(Array.from(currenciesByCode.values())),
    conversion: createDefaultCurrencyConversionSettings(defaultCurrencyCode),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export function compareCurrencyDefinitions(
  left: CurrencyDefinition,
  right: CurrencyDefinition,
): number {
  if (left.archived !== right.archived) {
    return left.archived ? 1 : -1;
  }

  return (
    left.order - right.order ||
    left.name.localeCompare(right.name) ||
    left.code.localeCompare(right.code)
  );
}

export function sortCurrencyDefinitions(
  currencies: readonly CurrencyDefinition[],
): CurrencyDefinition[] {
  return [...currencies].sort(compareCurrencyDefinitions);
}

export function createUnknownCurrencyDefinition(
  code: CurrencyCode,
): CurrencyDefinition {
  const normalizedCode = normalizeCurrencyCode(code) ?? DEFAULT_CURRENCY_CODE;

  return {
    code: normalizedCode,
    name: humanizeCurrencyCode(normalizedCode),
    symbol: normalizedCode,
    locale: DEFAULT_CURRENCY_LOCALE,
    minorUnitDigits: DEFAULT_MINOR_UNIT_DIGITS,
    enabled: false,
    archived: true,
    order: MAX_CURRENCY_ORDER,
    isDefault: false,
  };
}

export function normalizeCurrencySettings(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencySettings {
  const defaults = createDefaultCurrencySettings();
  const currenciesByCode = new Map<CurrencyCode, CurrencyDefinition>();

  for (const currency of defaults.currencies) {
    currenciesByCode.set(currency.code, currency);
  }

  const sourceCurrencies = Array.isArray(settings?.currencies)
    ? settings.currencies
    : [];

  sourceCurrencies.forEach((currency, index) => {
    const normalized = normalizeCurrencyDefinition(currency, index);

    if (!normalized) {
      return;
    }

    const defaultCurrency = currenciesByCode.get(normalized.code);
    currenciesByCode.set(normalized.code, {
      ...defaultCurrency,
      ...normalized,
      isDefault: defaultCurrency?.isDefault ?? normalized.isDefault,
    });
  });

  const defaultCurrencyCode =
    normalizeCurrencyCode(settings?.defaultCurrencyCode) ??
    normalizeCurrencyCode(legacyDefaultCurrency) ??
    DEFAULT_CURRENCY_CODE;

  return {
    ...settings,
    defaultCurrencyCode,
    currencies: sortCurrencyDefinitions(Array.from(currenciesByCode.values())),
    conversion: normalizeCurrencyConversionSettings(
      settings?.conversion,
      defaultCurrencyCode,
    ),
  };
}

export function validateCurrencySettings(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencySettingsValidationIssue[] {
  const normalizedSettings = normalizeCurrencySettings(
    settings,
    legacyDefaultCurrency,
  );
  const issues: CurrencySettingsValidationIssue[] = [];
  const defaultCurrency = normalizedSettings.currencies.find(
    (currency) => currency.code === normalizedSettings.defaultCurrencyCode,
  );
  const baseCurrency = normalizedSettings.currencies.find(
    (currency) =>
      currency.code === normalizedSettings.conversion.baseCurrencyCode,
  );
  const enabledCurrencies = normalizedSettings.currencies.filter(
    (currency) => currency.enabled && !currency.archived,
  );

  if (!defaultCurrency) {
    issues.push({
      code: "MISSING_DEFAULT_CURRENCY",
      currencyCode: normalizedSettings.defaultCurrencyCode,
      message: `Default currency ${normalizedSettings.defaultCurrencyCode} is not present in currency settings.`,
    });
  } else if (!defaultCurrency.enabled || defaultCurrency.archived) {
    issues.push({
      code: "DEFAULT_CURRENCY_DISABLED",
      currencyCode: defaultCurrency.code,
      message: `Default currency ${defaultCurrency.code} must be enabled and not archived.`,
    });
  }

  if (enabledCurrencies.length === 0) {
    issues.push({
      code: "NO_ENABLED_CURRENCIES",
      message: "Currency settings must contain at least one enabled currency.",
    });
  }

  if (!baseCurrency) {
    issues.push({
      code: "MISSING_BASE_CURRENCY",
      currencyCode: normalizedSettings.conversion.baseCurrencyCode,
      message: `Conversion base currency ${normalizedSettings.conversion.baseCurrencyCode} is not present in currency settings.`,
    });
  } else if (!baseCurrency.enabled || baseCurrency.archived) {
    issues.push({
      code: "BASE_CURRENCY_DISABLED",
      currencyCode: baseCurrency.code,
      message: `Conversion base currency ${baseCurrency.code} must be enabled and not archived.`,
    });
  }

  return issues;
}

export function getCurrencyDefinitions(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition[] {
  return normalizeCurrencySettings(settings, legacyDefaultCurrency).currencies;
}

export function getEnabledCurrencyDefinitions(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition[] {
  return getCurrencyDefinitions(settings, legacyDefaultCurrency).filter(
    (currency) => currency.enabled && !currency.archived,
  );
}

export function getArchivedCurrencyDefinitions(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition[] {
  return getCurrencyDefinitions(settings, legacyDefaultCurrency).filter(
    (currency) => currency.archived === true,
  );
}

export function getCurrencyOptions(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): SelectOption[] {
  return getEnabledCurrencyDefinitions(settings, legacyDefaultCurrency).map(
    (currency) => ({
      label: currency.name,
      value: currency.code,
    }),
  );
}

export function getCurrencyDefinition(
  code: unknown,
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition | undefined {
  const normalizedCode = normalizeCurrencyCode(code);

  if (!normalizedCode) {
    return undefined;
  }

  return getCurrencyDefinitions(settings, legacyDefaultCurrency).find(
    (currency) => currency.code === normalizedCode,
  );
}

export function resolveDefaultCurrencyCode(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyCode {
  return normalizeCurrencySettings(settings, legacyDefaultCurrency)
    .defaultCurrencyCode;
}

export function getDefaultCurrencyDefinition(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition {
  const normalizedSettings = normalizeCurrencySettings(
    settings,
    legacyDefaultCurrency,
  );

  return (
    normalizedSettings.currencies.find(
      (currency) => currency.code === normalizedSettings.defaultCurrencyCode,
    ) ?? createUnknownCurrencyDefinition(normalizedSettings.defaultCurrencyCode)
  );
}

export function getCurrencyDefinitionOrFallback(
  code: unknown,
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyDefinition {
  const normalizedCode = normalizeCurrencyCode(code);

  if (!normalizedCode) {
    return getDefaultCurrencyDefinition(settings, legacyDefaultCurrency);
  }

  return (
    getCurrencyDefinition(normalizedCode, settings, legacyDefaultCurrency) ??
    createUnknownCurrencyDefinition(normalizedCode)
  );
}

export function getKnownCurrencyCodes(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyCode[] {
  return getCurrencyDefinitions(settings, legacyDefaultCurrency).map(
    (currency) => currency.code,
  );
}

export function getEnabledCurrencyCodes(
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): CurrencyCode[] {
  return getEnabledCurrencyDefinitions(settings, legacyDefaultCurrency).map(
    (currency) => currency.code,
  );
}

export function getCurrencyLabel(
  code: unknown,
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): string {
  return getCurrencyDefinitionOrFallback(code, settings, legacyDefaultCurrency)
    .name;
}

export function getCurrencySymbol(
  code: unknown,
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): string {
  return getCurrencyDefinitionOrFallback(code, settings, legacyDefaultCurrency)
    .symbol;
}

export function getCurrencyMinorUnitDigits(
  code: unknown,
  settings?: CurrencySettingsInput | null,
  legacyDefaultCurrency?: CurrencyCode | null,
): number {
  return getCurrencyDefinitionOrFallback(code, settings, legacyDefaultCurrency)
    .minorUnitDigits;
}
