import type {
  CurrencyCode,
  CurrencyConversionRate,
  CurrencySettings,
} from "@konfi/types";
import {
  DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
  getEnabledCurrencyDefinitions,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
} from "./currencies";
import type { CurrencyConversionEngineSettings } from "./currency-conversion";

export const FRANKFURTER_API_BASE_URL = "https://api.frankfurter.dev";

export type CurrencyRateFetchResult = Record<CurrencyCode, number>;

export type CurrencyRateFetcher = (params: {
  baseCurrencyCode: CurrencyCode;
  targetCurrencyCodes: CurrencyCode[];
}) => Promise<CurrencyRateFetchResult>;

export interface FrankfurterCurrencyRateFetchInput {
  baseCurrencyCode: CurrencyCode;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  targetCurrencyCodes: CurrencyCode[];
}

export type CurrencyRateRefreshReason =
  | "AUTOMATIC_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "NO_TARGET_CURRENCIES";

export interface RefreshAutomaticCurrencyRatesInput {
  settings?: CurrencyConversionEngineSettings | null;
  fetchRates?: CurrencyRateFetcher;
  now?: unknown;
  provider?: string;
}

export type RefreshAutomaticCurrencyRatesResult =
  | {
      refreshed: true;
      settings: CurrencySettings;
    }
  | {
      refreshed: false;
      settings: CurrencySettings;
      reason: CurrencyRateRefreshReason;
    };

export async function refreshAutomaticCurrencyRates(
  params: RefreshAutomaticCurrencyRatesInput,
): Promise<RefreshAutomaticCurrencyRatesResult> {
  const settings = normalizeCurrencySettings(params.settings);
  const mode = params.settings?.conversion?.mode;

  if (settings.conversion.enabled !== true || mode !== "automatic") {
    return {
      settings,
      refreshed: false,
      reason: "AUTOMATIC_DISABLED",
    };
  }

  if (!params.fetchRates) {
    return {
      settings,
      refreshed: false,
      reason: "PROVIDER_NOT_CONFIGURED",
    };
  }

  const baseCurrencyCode = settings.conversion.baseCurrencyCode;
  const targetCurrencyCodes = getEnabledCurrencyDefinitions(settings)
    .filter((currency) => currency.code !== baseCurrencyCode)
    .map((currency) => currency.code);

  if (targetCurrencyCodes.length === 0) {
    return {
      settings,
      refreshed: false,
      reason: "NO_TARGET_CURRENCIES",
    };
  }

  const fetchedRates = await params.fetchRates({
    baseCurrencyCode,
    targetCurrencyCodes,
  });
  const refreshedTargetCodes = new Set(
    Object.entries(fetchedRates)
      .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
      .map(([currencyCode]) => currencyCode),
  );
  const retainedRates = settings.conversion.rates.filter(
    (rate) =>
      rate.fromCurrencyCode !== baseCurrencyCode ||
      !refreshedTargetCodes.has(rate.toCurrencyCode),
  );
  const nextRates: CurrencyConversionRate[] = [...retainedRates];

  for (const targetCurrencyCode of targetCurrencyCodes) {
    const rate = fetchedRates[targetCurrencyCode];

    if (!Number.isFinite(rate) || rate <= 0) {
      continue;
    }

    nextRates.push({
      fromCurrencyCode: baseCurrencyCode,
      toCurrencyCode: targetCurrencyCode,
      rate,
      source: "automatic",
      fetchedAt: params.now,
      metadata: {
        provider: params.provider,
        source: "automatic",
        fetchedAt: params.now,
        updatedAt: params.now,
      },
      updatedAt: params.now,
    });
  }

  return {
    refreshed: true,
    settings: {
      ...settings,
      conversion: {
        ...settings.conversion,
        rates: nextRates,
        automatic: {
          ...settings.conversion.automatic,
          enabled: true,
          lastRefreshAt: params.now,
          lastAttemptAt: params.now,
          lastError: undefined,
        },
        updatedAt: params.now,
      },
      updatedAt: params.now,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function appendFrankfurterRate(params: {
  fetchedRates: CurrencyRateFetchResult;
  rawCode: unknown;
  rawRate: unknown;
  targetCurrencyCodeSet: ReadonlySet<CurrencyCode>;
}): void {
  const code = normalizeCurrencyCode(params.rawCode);
  if (
    !code ||
    !params.targetCurrencyCodeSet.has(code) ||
    typeof params.rawRate !== "number" ||
    !Number.isFinite(params.rawRate) ||
    params.rawRate <= 0
  ) {
    return;
  }

  params.fetchedRates[code] = params.rawRate;
}

function buildFrankfurterRatesUrl(params: {
  baseCurrencyCode: CurrencyCode;
  baseUrl?: string;
  targetCurrencyCodes: CurrencyCode[];
}): string {
  const normalizedBaseUrl = (
    params.baseUrl?.trim() || FRANKFURTER_API_BASE_URL
  ).replace(/\/+$/g, "");
  const endpoint = normalizedBaseUrl.endsWith("/v2")
    ? `${normalizedBaseUrl}/rates`
    : `${normalizedBaseUrl}/v2/rates`;
  const url = new URL(endpoint);

  url.searchParams.set("base", params.baseCurrencyCode);
  url.searchParams.set("quotes", params.targetCurrencyCodes.join(","));

  return url.toString();
}

export async function fetchFrankfurterCurrencyRates(
  params: FrankfurterCurrencyRateFetchInput,
): Promise<CurrencyRateFetchResult> {
  const baseCurrencyCode = normalizeCurrencyCode(params.baseCurrencyCode);
  const targetCurrencyCodes = Array.from(
    new Set(
      params.targetCurrencyCodes
        .map((code) => normalizeCurrencyCode(code))
        .filter((code): code is CurrencyCode => code !== null),
    ),
  ).filter((code) => code !== baseCurrencyCode);

  if (!baseCurrencyCode || targetCurrencyCodes.length === 0) {
    return {};
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildFrankfurterRatesUrl({
      baseCurrencyCode,
      baseUrl: params.baseUrl,
      targetCurrencyCodes,
    }),
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Frankfurter rate fetch failed with HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as unknown;
  const fetchedRates: CurrencyRateFetchResult = {};
  const targetCurrencyCodeSet = new Set(targetCurrencyCodes);

  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (!isRecord(row)) {
        continue;
      }

      appendFrankfurterRate({
        fetchedRates,
        rawCode: row.quote,
        rawRate: row.rate,
        targetCurrencyCodeSet,
      });
    }

    return fetchedRates;
  }

  if (isRecord(payload) && isRecord(payload.rates)) {
    for (const [rawCode, rawRate] of Object.entries(payload.rates)) {
      appendFrankfurterRate({
        fetchedRates,
        rawCode,
        rawRate,
        targetCurrencyCodeSet,
      });
    }

    return fetchedRates;
  }

  throw new Error("Frankfurter rate response did not include rates.");
}

export const FRANKFURTER_CURRENCY_RATE_PROVIDER =
  DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER;
