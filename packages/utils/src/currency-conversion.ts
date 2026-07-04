import type {
  CurrencyCode,
  CurrencyConversionOffset as ConfiguredCurrencyConversionOffset,
  CurrencyConversionRate,
  CurrencyConversionRateSource,
  CurrencyConversionSnapshot,
} from "@konfi/types";
import {
  getCurrencyDefinition,
  getCurrencyMinorUnitDigits,
  getEnabledCurrencyDefinitions,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
  type CurrencySettingsInput,
} from "./currencies";

export type CurrencyTimestamp = string | number | Date | { toDate: () => Date };

export type CurrencyConversionMode = "disabled" | "manual" | "automatic";

export type CurrencyConversionSource = CurrencyConversionRateSource;

export enum CurrencyConversionFailureReason {
  MISSING_TARGET_CURRENCY = "MISSING_TARGET_CURRENCY",
  TARGET_CURRENCY_MISSING = "TARGET_CURRENCY_MISSING",
  TARGET_CURRENCY_DISABLED = "TARGET_CURRENCY_DISABLED",
  CONVERSION_DISABLED = "CONVERSION_DISABLED",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  INVALID_RATE = "INVALID_RATE",
  MISSING_RATE = "MISSING_RATE",
  STALE_RATE = "STALE_RATE",
  INVALID_OFFSET = "INVALID_OFFSET",
}

export type CurrencyConversionOffsetInput = Partial<
  Omit<
    ConfiguredCurrencyConversionOffset,
    "fixedMinorUnits" | "percent" | "targetCurrencyCode"
  >
> & {
  targetCurrencyCode?: CurrencyCode | null;
  percent?: number | null;
  percentOffset?: number | null;
  fixedMinorUnits?: number | null;
  fixedMinor?: number | null;
  fixedOffsetMinor?: number | null;
};

export interface CurrencyConversionRateInput extends Partial<CurrencyConversionRate> {
  value?: number;
  source?: CurrencyConversionSource;
  fetchedAt?: unknown;
}

type BaseConversionSettingsInput = NonNullable<
  CurrencySettingsInput["conversion"]
>;

export type CurrencyConversionEngineSettings = Omit<
  CurrencySettingsInput,
  "conversion" | "version"
> & {
  conversion?:
    | (Omit<BaseConversionSettingsInput, "mode" | "offsets"> & {
        mode?: CurrencyConversionMode;
        source?: CurrencyConversionSource;
        rates?: readonly CurrencyConversionRateInput[];
        manualRates?: readonly CurrencyConversionRateInput[];
        automaticRates?: readonly CurrencyConversionRateInput[];
        offsets?: readonly CurrencyConversionOffsetInput[];
        rateMaxAgeMs?: number | null;
        automaticRateMaxAgeMs?: number | null;
        version?: string | number;
      })
    | null;
  offsets?: readonly CurrencyConversionOffsetInput[];
  version?: string | number;
};

export interface ConvertCurrencyMinorAmountInput {
  amountMinor: number;
  targetCurrency?: CurrencyCode | null;
  settings: CurrencyConversionEngineSettings;
  baseCurrency?: CurrencyCode | null;
  now?: CurrencyTimestamp;
  rateMaxAgeMs?: number | null;
}

export interface CurrencyConversionSuccess {
  ok: true;
  recoverable: false;
  amountMinor: number;
  snapshot: CurrencyConversionSnapshot;
}

export interface CurrencyConversionFailure {
  ok: false;
  recoverable: true;
  reason: CurrencyConversionFailureReason;
  baseCurrency: CurrencyCode;
  targetCurrency?: CurrencyCode;
}

export type CurrencyConversionResult =
  | CurrencyConversionSuccess
  | CurrencyConversionFailure;

interface SelectedCurrencyRate {
  rate: number;
  source: CurrencyConversionSource;
  fetchedAt?: unknown;
  expiresAt?: unknown;
}

export function convertCurrencyMinorAmount(
  input: ConvertCurrencyMinorAmountInput,
): CurrencyConversionResult {
  const normalizedSettings = normalizeCurrencySettings(input.settings);
  const baseCurrency =
    normalizeCurrencyCode(input.baseCurrency) ??
    normalizedSettings.conversion.baseCurrencyCode;
  const targetCurrency = normalizeCurrencyCode(input.targetCurrency);
  const mode = resolveConversionMode(input.settings);
  const snapshotMetadata = getSnapshotMetadata(input.settings);

  if (!targetCurrency) {
    return fail(CurrencyConversionFailureReason.MISSING_TARGET_CURRENCY, {
      baseCurrency,
    });
  }

  if (
    !Number.isFinite(input.amountMinor) ||
    input.amountMinor < 0 ||
    !Number.isInteger(input.amountMinor)
  ) {
    return fail(CurrencyConversionFailureReason.INVALID_AMOUNT, {
      baseCurrency,
      targetCurrency,
    });
  }

  if (targetCurrency === baseCurrency) {
    return success(input.amountMinor, {
      fromCurrencyCode: baseCurrency,
      toCurrencyCode: targetCurrency,
      amountMinor: input.amountMinor,
      convertedAmountMinor: input.amountMinor,
      rate: 1,
      rateSource: "default",
      percentOffset: 0,
      fixedOffsetMinorUnits: 0,
      ...snapshotMetadata,
    });
  }

  const targetDefinition = getCurrencyDefinition(
    targetCurrency,
    input.settings,
  );

  if (!targetDefinition) {
    return fail(CurrencyConversionFailureReason.TARGET_CURRENCY_MISSING, {
      baseCurrency,
      targetCurrency,
    });
  }

  if (!isEnabledTargetCurrency(input.settings, targetCurrency)) {
    return fail(CurrencyConversionFailureReason.TARGET_CURRENCY_DISABLED, {
      baseCurrency,
      targetCurrency,
    });
  }

  if (mode === "disabled") {
    return fail(CurrencyConversionFailureReason.CONVERSION_DISABLED, {
      baseCurrency,
      targetCurrency,
    });
  }

  const selectedRate = getRateForMode(
    input.settings,
    mode,
    baseCurrency,
    targetCurrency,
  );

  if (!selectedRate) {
    return fail(CurrencyConversionFailureReason.MISSING_RATE, {
      baseCurrency,
      targetCurrency,
    });
  }

  if (!Number.isFinite(selectedRate.rate) || selectedRate.rate <= 0) {
    return fail(CurrencyConversionFailureReason.INVALID_RATE, {
      baseCurrency,
      targetCurrency,
    });
  }

  if (isSelectedRateStale(input, selectedRate, mode)) {
    return fail(CurrencyConversionFailureReason.STALE_RATE, {
      baseCurrency,
      targetCurrency,
    });
  }

  const offset = resolveOffset(input.settings, targetCurrency);

  if (
    !Number.isFinite(offset.percentOffset) ||
    !Number.isFinite(offset.fixedOffsetMinor)
  ) {
    return fail(CurrencyConversionFailureReason.INVALID_OFFSET, {
      baseCurrency,
      targetCurrency,
    });
  }

  const baseMinorUnitDigits = getCurrencyMinorUnitDigits(
    baseCurrency,
    input.settings,
  );
  const targetMinorUnitDigits = getCurrencyMinorUnitDigits(
    targetCurrency,
    input.settings,
  );
  const rawTargetMinor =
    input.amountMinor *
    selectedRate.rate *
    10 ** (targetMinorUnitDigits - baseMinorUnitDigits);
  const withPercentOffset = rawTargetMinor * (1 + offset.percentOffset / 100);
  const withFixedOffset = withPercentOffset + offset.fixedOffsetMinor;
  const roundedAmountMinor = Math.max(
    0,
    Math.round(withFixedOffset + Number.EPSILON),
  );
  const fetchedAt = normalizeTimestamp(selectedRate.fetchedAt);

  return success(roundedAmountMinor, {
    fromCurrencyCode: baseCurrency,
    toCurrencyCode: targetCurrency,
    amountMinor: input.amountMinor,
    convertedAmountMinor: roundedAmountMinor,
    rate: selectedRate.rate,
    rateSource: selectedRate.source,
    percentOffset: offset.percentOffset,
    fixedOffsetMinorUnits: offset.fixedOffsetMinor,
    ...(fetchedAt ? { rateFetchedAt: fetchedAt } : {}),
    ...snapshotMetadata,
  });
}

function success(
  amountMinor: number,
  snapshot: CurrencyConversionSnapshot,
): CurrencyConversionSuccess {
  return {
    ok: true,
    recoverable: false,
    amountMinor,
    snapshot,
  };
}

function fail(
  reason: CurrencyConversionFailureReason,
  details: {
    baseCurrency: CurrencyCode;
    targetCurrency?: CurrencyCode;
  },
): CurrencyConversionFailure {
  return {
    ok: false,
    recoverable: true,
    reason,
    ...details,
  };
}

function resolveConversionMode(
  settings: CurrencyConversionEngineSettings,
): CurrencyConversionMode {
  const conversion = settings.conversion;

  if (conversion?.enabled !== true) {
    return "disabled";
  }

  return conversion.mode ?? "manual";
}

function isEnabledTargetCurrency(
  settings: CurrencyConversionEngineSettings,
  targetCurrency: CurrencyCode,
): boolean {
  return getEnabledCurrencyDefinitions(settings).some(
    (currency) => currency.code === targetCurrency,
  );
}

function getRateForMode(
  settings: CurrencyConversionEngineSettings,
  mode: "manual" | "automatic",
  baseCurrency: CurrencyCode,
  targetCurrency: CurrencyCode,
): SelectedCurrencyRate | undefined {
  const rates =
    mode === "automatic"
      ? (settings.conversion?.automaticRates ?? settings.conversion?.rates)
      : (settings.conversion?.manualRates ?? settings.conversion?.rates);
  const rate = rates?.find(
    (candidate) =>
      normalizeCurrencyCode(candidate.fromCurrencyCode) === baseCurrency &&
      normalizeCurrencyCode(candidate.toCurrencyCode) === targetCurrency,
  );

  if (!rate) return undefined;

  return {
    rate: rate.rate ?? rate.value ?? Number.NaN,
    source: resolveRateSource(rate, mode),
    fetchedAt:
      rate.fetchedAt ??
      rate.metadata?.fetchedAt ??
      rate.updatedAt ??
      rate.metadata?.updatedAt,
    expiresAt: rate.metadata?.expiresAt,
  };
}

function resolveRateSource(
  rate: CurrencyConversionRateInput,
  mode: "manual" | "automatic",
): CurrencyConversionSource {
  return (
    normalizeConversionSource(rate.source) ??
    normalizeConversionSource(rate.metadata?.source) ??
    mode
  );
}

function normalizeConversionSource(
  source: unknown,
): CurrencyConversionSource | undefined {
  return source === "default" || source === "manual" || source === "automatic"
    ? source
    : undefined;
}

function isSelectedRateStale(
  input: ConvertCurrencyMinorAmountInput,
  rate: SelectedCurrencyRate,
  mode: CurrencyConversionMode,
): boolean {
  if (mode !== "automatic") return false;

  const nowMs = timestampToMilliseconds(input.now) ?? Date.now();
  const expiresAtMs = timestampToMilliseconds(rate.expiresAt);

  if (expiresAtMs !== undefined && nowMs > expiresAtMs) {
    return true;
  }

  const maxRateAgeMs = resolveRateMaxAgeMs(input);

  if (maxRateAgeMs === undefined) return false;

  const fetchedAtMs = timestampToMilliseconds(rate.fetchedAt);
  return fetchedAtMs === undefined || nowMs - fetchedAtMs > maxRateAgeMs;
}

function resolveRateMaxAgeMs(
  input: ConvertCurrencyMinorAmountInput,
): number | undefined {
  const maxAgeMs =
    input.rateMaxAgeMs ??
    input.settings.conversion?.automaticRateMaxAgeMs ??
    input.settings.conversion?.rateMaxAgeMs;

  if (
    typeof maxAgeMs !== "number" ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 0
  ) {
    return undefined;
  }

  return maxAgeMs;
}

function resolveOffset(
  settings: CurrencyConversionEngineSettings,
  targetCurrency: CurrencyCode,
): {
  percentOffset: number;
  fixedOffsetMinor: number;
} {
  const offset =
    settings.conversion?.offsets?.find(
      (candidate) =>
        normalizeCurrencyCode(candidate.targetCurrencyCode) === targetCurrency,
    ) ??
    settings.offsets?.find(
      (candidate) =>
        normalizeCurrencyCode(candidate.targetCurrencyCode) === targetCurrency,
    );
  const percentOffset = offset?.percentOffset ?? offset?.percent ?? 0;
  const fixedOffsetMinor =
    offset?.fixedOffsetMinor ??
    offset?.fixedMinorUnits ??
    offset?.fixedMinor ??
    0;

  return {
    percentOffset,
    fixedOffsetMinor: Math.round(fixedOffsetMinor),
  };
}

function getSnapshotMetadata(
  settings: CurrencyConversionEngineSettings,
): Pick<CurrencyConversionSnapshot, "settingsVersion" | "settingsUpdatedAt"> {
  const settingsVersion = settings.version ?? settings.conversion?.version;
  const settingsUpdatedAt = normalizeTimestamp(
    settings.conversion?.updatedAt ?? settings.updatedAt,
  );

  return {
    ...(settingsVersion !== undefined ? { settingsVersion } : {}),
    ...(settingsUpdatedAt ? { settingsUpdatedAt } : {}),
  };
}

function normalizeTimestamp(value: unknown): string | undefined {
  const milliseconds = timestampToMilliseconds(value);
  return milliseconds === undefined
    ? undefined
    : new Date(milliseconds).toISOString();
}

function timestampToMilliseconds(value: unknown): number | undefined {
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }

  if (isTimestampLike(value)) {
    const milliseconds = value.toDate().getTime();
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }

  return undefined;
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}
