import { describe, expect, it } from "vitest";

import type { CurrencySettings } from "@konfi/types";
import {
  fetchFrankfurterCurrencyRates,
  FRANKFURTER_API_BASE_URL,
  refreshAutomaticCurrencyRates,
} from "../currency-rate-refresh";
import {
  DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
  normalizeCurrencySettings,
} from "../currencies";

const automaticSettings: CurrencySettings = normalizeCurrencySettings({
  defaultCurrencyCode: "PLN",
  currencies: [
    {
      code: "EUR",
      name: "Euro",
      symbol: "EUR",
      locale: "de-DE",
      minorUnitDigits: 2,
      enabled: true,
      archived: false,
      order: 1,
    },
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      locale: "en-US",
      minorUnitDigits: 2,
      enabled: true,
      archived: false,
      order: 2,
    },
    {
      code: "CHF",
      name: "Swiss Franc",
      symbol: "CHF",
      locale: "de-CH",
      minorUnitDigits: 2,
      enabled: false,
      archived: true,
      order: 3,
    },
  ],
  conversion: {
    enabled: true,
    mode: "automatic",
    baseCurrencyCode: "PLN",
    rates: [
      {
        fromCurrencyCode: "PLN",
        toCurrencyCode: "EUR",
        rate: 0.2,
        source: "manual",
      },
      {
        fromCurrencyCode: "EUR",
        toCurrencyCode: "USD",
        rate: 1.1,
        source: "manual",
      },
    ],
    automatic: {
      enabled: true,
      provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
    },
  },
});

describe("fetchFrankfurterCurrencyRates", () => {
  it("fetches v2 Frankfurter rates for a base and quote list", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = input.toString();

      return new Response(
        JSON.stringify([
          {
            base: "PLN",
            date: "2026-05-17",
            quote: "EUR",
            rate: 0.23,
          },
          {
            base: "PLN",
            date: "2026-05-17",
            quote: "USD",
            rate: 0.26,
          },
          {
            base: "PLN",
            date: "2026-05-17",
            quote: "CHF",
            rate: "not-a-number",
          },
        ]),
        { status: 200 },
      );
    };

    const rates = await fetchFrankfurterCurrencyRates({
      baseCurrencyCode: "PLN",
      fetchImpl,
      targetCurrencyCodes: ["EUR", "USD", "CHF", "EUR"],
    });
    const url = new URL(requestedUrl);

    expect(`${url.origin}${url.pathname}`).toBe(
      `${FRANKFURTER_API_BASE_URL}/v2/rates`,
    );
    expect(url.searchParams.get("base")).toBe("PLN");
    expect(url.searchParams.get("quotes")).toBe("EUR,USD,CHF");
    expect(rates).toEqual({
      EUR: 0.23,
      USD: 0.26,
    });
  });

  it("accepts map-shaped rate responses for compatibility", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          rates: {
            EUR: 0.23,
          },
        }),
        { status: 200 },
      );

    await expect(
      fetchFrankfurterCurrencyRates({
        baseCurrencyCode: "PLN",
        fetchImpl,
        targetCurrencyCodes: ["EUR"],
      }),
    ).resolves.toEqual({
      EUR: 0.23,
    });
  });

  it("throws when Frankfurter returns a non-successful response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("rate limit", { status: 429 });

    await expect(
      fetchFrankfurterCurrencyRates({
        baseCurrencyCode: "PLN",
        fetchImpl,
        targetCurrencyCodes: ["EUR"],
      }),
    ).rejects.toThrow("HTTP 429");
  });
});

describe("refreshAutomaticCurrencyRates", () => {
  it("returns early when automatic conversion is disabled", async () => {
    const result = await refreshAutomaticCurrencyRates({
      settings: {
        ...automaticSettings,
        conversion: {
          ...automaticSettings.conversion,
          enabled: false,
          mode: "disabled",
        },
      },
    });

    expect(result).toMatchObject({
      refreshed: false,
      reason: "AUTOMATIC_DISABLED",
    });
  });

  it("returns early when no rate provider is configured", async () => {
    const result = await refreshAutomaticCurrencyRates({
      settings: automaticSettings,
    });

    expect(result).toMatchObject({
      refreshed: false,
      reason: "PROVIDER_NOT_CONFIGURED",
    });
  });

  it("returns early when there are no enabled target currencies", async () => {
    const result = await refreshAutomaticCurrencyRates({
      settings: normalizeCurrencySettings({
        defaultCurrencyCode: "PLN",
        conversion: {
          enabled: true,
          mode: "automatic",
          baseCurrencyCode: "PLN",
        },
      }),
      fetchRates: async () => ({}),
    });

    expect(result).toMatchObject({
      refreshed: false,
      reason: "NO_TARGET_CURRENCIES",
    });
  });

  it("replaces fetched base rates and snapshots Frankfurter metadata", async () => {
    const result = await refreshAutomaticCurrencyRates({
      settings: automaticSettings,
      now: "2026-05-17T12:00:00.000Z",
      provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
      fetchRates: async ({ baseCurrencyCode, targetCurrencyCodes }) => {
        expect(baseCurrencyCode).toBe("PLN");
        expect(targetCurrencyCodes).toEqual(["EUR", "USD"]);

        return {
          EUR: 0.24,
          USD: 0.27,
        };
      },
    });

    expect(result.refreshed).toBe(true);
    if (!result.refreshed) return;

    expect(result.settings.conversion.rates).toEqual([
      {
        fromCurrencyCode: "EUR",
        toCurrencyCode: "USD",
        rate: 1.1,
        source: "manual",
      },
      {
        fromCurrencyCode: "PLN",
        toCurrencyCode: "EUR",
        rate: 0.24,
        source: "automatic",
        fetchedAt: "2026-05-17T12:00:00.000Z",
        metadata: {
          provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
          source: "automatic",
          fetchedAt: "2026-05-17T12:00:00.000Z",
          updatedAt: "2026-05-17T12:00:00.000Z",
        },
        updatedAt: "2026-05-17T12:00:00.000Z",
      },
      {
        fromCurrencyCode: "PLN",
        toCurrencyCode: "USD",
        rate: 0.27,
        source: "automatic",
        fetchedAt: "2026-05-17T12:00:00.000Z",
        metadata: {
          provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
          source: "automatic",
          fetchedAt: "2026-05-17T12:00:00.000Z",
          updatedAt: "2026-05-17T12:00:00.000Z",
        },
        updatedAt: "2026-05-17T12:00:00.000Z",
      },
    ]);
    expect(result.settings.conversion.automatic).toMatchObject({
      enabled: true,
      lastAttemptAt: "2026-05-17T12:00:00.000Z",
      lastRefreshAt: "2026-05-17T12:00:00.000Z",
      provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
    });
  });

  it("retains existing base rates when the provider returns an invalid rate", async () => {
    const result = await refreshAutomaticCurrencyRates({
      settings: automaticSettings,
      now: "2026-05-17T12:00:00.000Z",
      provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
      fetchRates: async () => ({
        EUR: Number.NaN,
        USD: 0.27,
      }),
    });

    expect(result.refreshed).toBe(true);
    if (!result.refreshed) return;

    expect(result.settings.conversion.rates).toEqual([
      {
        fromCurrencyCode: "PLN",
        toCurrencyCode: "EUR",
        rate: 0.2,
        source: "manual",
      },
      {
        fromCurrencyCode: "EUR",
        toCurrencyCode: "USD",
        rate: 1.1,
        source: "manual",
      },
      expect.objectContaining({
        fromCurrencyCode: "PLN",
        toCurrencyCode: "USD",
        rate: 0.27,
        source: "automatic",
      }),
    ]);
  });
});
