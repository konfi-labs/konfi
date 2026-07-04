import { describe, expect, it } from "vitest";
import {
  convertCurrencyMinorAmount,
  CurrencyConversionFailureReason,
  type CurrencyConversionEngineSettings,
} from "../currency-conversion";

const baseSettings: CurrencyConversionEngineSettings = {
  defaultCurrencyCode: "PLN",
  currencies: [
    { code: "PLN", enabled: true, minorUnitDigits: 2, isDefault: true },
    { code: "EUR", enabled: true, minorUnitDigits: 2 },
    { code: "USD", enabled: true, minorUnitDigits: 2 },
    { code: "JPY", enabled: true, minorUnitDigits: 0 },
  ],
  conversion: {
    enabled: true,
    mode: "manual",
    baseCurrencyCode: "PLN",
    rates: [
      { fromCurrencyCode: "PLN", toCurrencyCode: "EUR", rate: 0.25 },
      { fromCurrencyCode: "PLN", toCurrencyCode: "USD", rate: 0.5 },
      { fromCurrencyCode: "PLN", toCurrencyCode: "JPY", rate: 150 },
    ],
  },
  version: "settings-v1",
  updatedAt: "2026-05-01T12:00:00.000Z",
};

describe("convertCurrencyMinorAmount", () => {
  it("returns a same-currency no-op snapshot without requiring a rate", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 12345,
      targetCurrency: "PLN",
      settings: {
        defaultCurrencyCode: "PLN",
        conversion: {
          enabled: false,
          baseCurrencyCode: "PLN",
          rates: [],
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      recoverable: false,
      amountMinor: 12345,
      snapshot: {
        fromCurrencyCode: "PLN",
        toCurrencyCode: "PLN",
        amountMinor: 12345,
        convertedAmountMinor: 12345,
        rate: 1,
        rateSource: "default",
        percentOffset: 0,
        fixedOffsetMinorUnits: 0,
      },
    });
  });

  it("converts minor-unit amounts using a manual base-to-target rate", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: baseSettings,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(2500);
    expect(result.snapshot).toMatchObject({
      fromCurrencyCode: "PLN",
      toCurrencyCode: "EUR",
      amountMinor: 10000,
      convertedAmountMinor: 2500,
      rate: 0.25,
      rateSource: "manual",
      percentOffset: 0,
      fixedOffsetMinorUnits: 0,
      settingsVersion: "settings-v1",
      settingsUpdatedAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("returns a recoverable result when the target currency is missing", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "CZK",
      settings: baseSettings,
    });

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      reason: CurrencyConversionFailureReason.TARGET_CURRENCY_MISSING,
      baseCurrency: "PLN",
      targetCurrency: "CZK",
    });
  });

  it("returns a recoverable result when no target currency is provided", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: null,
      settings: baseSettings,
    });

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      reason: CurrencyConversionFailureReason.MISSING_TARGET_CURRENCY,
      baseCurrency: "PLN",
    });
  });

  it("returns a recoverable result when a rate is missing", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "CZK",
      settings: {
        ...baseSettings,
        currencies: [
          ...(baseSettings.currencies ?? []),
          { code: "CZK", enabled: true, minorUnitDigits: 2 },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      reason: CurrencyConversionFailureReason.MISSING_RATE,
      baseCurrency: "PLN",
      targetCurrency: "CZK",
    });
  });

  it("returns a recoverable result for stale automatic rates", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      now: "2026-05-17T12:00:00.000Z",
      rateMaxAgeMs: 60 * 60 * 1000,
      settings: {
        ...baseSettings,
        conversion: {
          enabled: true,
          mode: "automatic",
          baseCurrencyCode: "PLN",
          rates: [
            {
              fromCurrencyCode: "PLN",
              toCurrencyCode: "EUR",
              rate: 0.25,
              metadata: {
                fetchedAt: "2026-05-17T10:00:00.000Z",
              },
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      reason: CurrencyConversionFailureReason.STALE_RATE,
      baseCurrency: "PLN",
      targetCurrency: "EUR",
    });
  });

  it("includes fresh automatic rate metadata in the conversion snapshot", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      now: "2026-05-17T12:00:00.000Z",
      rateMaxAgeMs: 3 * 60 * 60 * 1000,
      settings: {
        ...baseSettings,
        conversion: {
          enabled: true,
          mode: "automatic",
          baseCurrencyCode: "PLN",
          rates: [
            {
              fromCurrencyCode: "PLN",
              toCurrencyCode: "EUR",
              rate: 0.25,
              metadata: {
                fetchedAt: "2026-05-17T10:00:00.000Z",
              },
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(2500);
    expect(result.snapshot).toMatchObject({
      rate: 0.25,
      rateSource: "automatic",
      rateFetchedAt: "2026-05-17T10:00:00.000Z",
    });
  });

  it("applies a fixed target-currency minor-unit offset after conversion", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        conversion: {
          ...baseSettings.conversion,
          offsets: [
            {
              targetCurrencyCode: "EUR",
              fixedOffsetMinor: 125,
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(2625);
    expect(result.snapshot.fixedOffsetMinorUnits).toBe(125);
  });

  it("applies a percent offset after conversion", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        conversion: {
          ...baseSettings.conversion,
          offsets: [
            {
              targetCurrencyCode: "EUR",
              percentOffset: 10,
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(2750);
    expect(result.snapshot.percentOffset).toBe(10);
  });

  it("applies combined percent and fixed offsets", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        conversion: {
          ...baseSettings.conversion,
          offsets: [
            {
              targetCurrencyCode: "EUR",
              percentOffset: 10,
              fixedOffsetMinor: 125,
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(2875);
    expect(result.snapshot).toMatchObject({
      percentOffset: 10,
      fixedOffsetMinorUnits: 125,
    });
  });

  it("returns a recoverable result for disabled targets", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        currencies: [
          { code: "PLN", enabled: true, minorUnitDigits: 2, isDefault: true },
          { code: "EUR", enabled: false, minorUnitDigits: 2 },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      recoverable: true,
      reason: CurrencyConversionFailureReason.TARGET_CURRENCY_DISABLED,
      baseCurrency: "PLN",
      targetCurrency: "EUR",
    });
  });

  it("returns recoverable results for zero and negative rate guardrails", () => {
    const zeroRate = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        conversion: {
          ...baseSettings.conversion,
          rates: [
            {
              fromCurrencyCode: "PLN",
              toCurrencyCode: "EUR",
              rate: 0,
            },
          ],
        },
      },
    });

    const negativeRate = convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings: {
        ...baseSettings,
        conversion: {
          ...baseSettings.conversion,
          rates: [
            {
              fromCurrencyCode: "PLN",
              toCurrencyCode: "EUR",
              rate: -1,
            },
          ],
        },
      },
    });

    expect(zeroRate).toMatchObject({
      ok: false,
      reason: CurrencyConversionFailureReason.INVALID_RATE,
    });
    expect(negativeRate).toMatchObject({
      ok: false,
      reason: CurrencyConversionFailureReason.INVALID_RATE,
    });
  });

  it("allows zero amounts and rejects negative minor-unit amounts", () => {
    const zeroAmount = convertCurrencyMinorAmount({
      amountMinor: 0,
      targetCurrency: "EUR",
      settings: baseSettings,
    });
    const negativeAmount = convertCurrencyMinorAmount({
      amountMinor: -1,
      targetCurrency: "EUR",
      settings: baseSettings,
    });

    expect(zeroAmount.ok).toBe(true);
    if (zeroAmount.ok) {
      expect(zeroAmount.amountMinor).toBe(0);
    }
    expect(negativeAmount).toMatchObject({
      ok: false,
      reason: CurrencyConversionFailureReason.INVALID_AMOUNT,
    });
  });

  it("uses the target currency minor unit digits for zero-decimal currencies", () => {
    const result = convertCurrencyMinorAmount({
      amountMinor: 1234,
      targetCurrency: "JPY",
      settings: baseSettings,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.amountMinor).toBe(1851);
    expect(result.snapshot).toMatchObject({
      toCurrencyCode: "JPY",
      rate: 150,
      convertedAmountMinor: 1851,
    });
  });

  it("does not mutate the source settings object", () => {
    const settings: CurrencyConversionEngineSettings = {
      ...baseSettings,
      conversion: {
        ...baseSettings.conversion,
        rates: [{ fromCurrencyCode: "PLN", toCurrencyCode: "EUR", rate: 0.25 }],
        offsets: [
          {
            targetCurrencyCode: "EUR",
            percentOffset: 10,
            fixedOffsetMinor: 125,
          },
        ],
      },
    };
    const before = structuredClone(settings);

    convertCurrencyMinorAmount({
      amountMinor: 10000,
      targetCurrency: "EUR",
      settings,
    });

    expect(settings).toEqual(before);
  });
});
