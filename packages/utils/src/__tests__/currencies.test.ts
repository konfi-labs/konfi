import { describe, expect, it } from "vitest";

import {
  CURRENCIES_SETTINGS_DOC_ID,
  createDefaultCurrencySettings,
  createInitialCurrencySettings,
  DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
  DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES,
  getCurrencyDefinition,
  getCurrencyDefinitionOrFallback,
  getCurrencyLabel,
  getCurrencyMinorUnitDigits,
  getCurrencyOptions,
  getCurrencySymbol,
  getDefaultCurrencyDefinition,
  getEnabledCurrencyCodes,
  getEnabledCurrencyDefinitions,
  isValidCurrencyCode,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
  resolveDefaultCurrencyCode,
  validateCurrencySettings,
} from "../currencies";

const PLN = "PLN";

const euroDefinition = {
  code: "EUR",
  name: "Euro",
  symbol: "€",
  locale: "de-DE",
  minorUnitDigits: 2,
  enabled: true,
  archived: false,
  order: 2,
};

const usdDefinition = {
  code: "usd",
  name: "US Dollar",
  symbol: "$",
  locale: "en-US",
  minorUnitDigits: 2,
  enabled: true,
  archived: false,
  order: 1,
};

describe("currencies", () => {
  it("creates default settings with one enabled PLN currency", () => {
    const settings = createDefaultCurrencySettings();

    expect(CURRENCIES_SETTINGS_DOC_ID).toBe("currencies");
    expect(settings.defaultCurrencyCode).toBe(PLN);
    expect(settings.currencies).toEqual([
      {
        code: PLN,
        name: "Polish Zloty",
        symbol: "zł",
        locale: "pl-PL",
        minorUnitDigits: 2,
        enabled: true,
        archived: false,
        isDefault: true,
        order: 0,
      },
    ]);
    expect(settings.conversion).toEqual({
      enabled: false,
      mode: "disabled",
      baseCurrencyCode: PLN,
      rates: [],
      offsets: [],
    });
  });

  it("creates migration-safe initial settings from a legacy channel currency", () => {
    const settings = createInitialCurrencySettings(
      "eur",
      "2026-05-17T10:00:00.000Z",
    );

    expect(settings.defaultCurrencyCode).toBe("EUR");
    expect(settings.updatedAt).toBe("2026-05-17T10:00:00.000Z");
    expect(settings.conversion).toEqual({
      enabled: false,
      mode: "disabled",
      baseCurrencyCode: "EUR",
      rates: [],
      offsets: [],
    });
    expect(settings.currencies).toEqual([
      {
        code: "EUR",
        name: "EUR",
        symbol: "EUR",
        locale: "pl-PL",
        minorUnitDigits: 2,
        enabled: true,
        archived: false,
        order: 0,
        isDefault: true,
      },
      {
        code: PLN,
        name: "Polish Zloty",
        symbol: "zł",
        locale: "pl-PL",
        minorUnitDigits: 2,
        enabled: true,
        archived: false,
        isDefault: false,
        order: 0,
      },
    ]);
  });

  it("validates initialized settings before persistence", () => {
    expect(
      validateCurrencySettings(createInitialCurrencySettings("PLN")),
    ).toEqual([]);

    expect(
      validateCurrencySettings({
        defaultCurrencyCode: "EUR",
        currencies: [
          {
            code: "EUR",
            enabled: false,
            archived: true,
          },
        ],
        conversion: {
          enabled: false,
          mode: "disabled",
          baseCurrencyCode: "USD",
        },
      }),
    ).toEqual([
      {
        code: "DEFAULT_CURRENCY_DISABLED",
        currencyCode: "EUR",
        message: "Default currency EUR must be enabled and not archived.",
      },
      {
        code: "MISSING_BASE_CURRENCY",
        currencyCode: "USD",
        message:
          "Conversion base currency USD is not present in currency settings.",
      },
    ]);
  });

  it("normalizes settings in memory without requiring persisted fields", () => {
    const settings = normalizeCurrencySettings({
      tenantId: "tenant-1",
      defaultCurrencyCode: "eur",
      currencies: [
        {
          code: "eur",
          name: " Euro ",
          symbol: " € ",
          locale: " de-DE ",
          minorUnitDigits: 2,
          enabled: true,
          order: 3,
        },
        {
          code: "PLN",
          name: "Polski złoty",
          symbol: "PLN",
          locale: "pl-PL",
          minorUnitDigits: 2,
          enabled: false,
          order: 1,
        },
        {
          code: "not-a-code",
          name: "Invalid",
        },
      ],
      conversion: {
        enabled: true,
        mode: "manual",
        baseCurrencyCode: "usd",
        rates: [
          {
            fromCurrencyCode: "eur",
            toCurrencyCode: "pln",
            rate: 4.3,
          },
          {
            fromCurrencyCode: "eur",
            toCurrencyCode: "pln",
            rate: 0,
          },
        ],
      },
    });

    expect(settings.tenantId).toBe("tenant-1");
    expect(settings.defaultCurrencyCode).toBe("EUR");
    expect(settings.currencies.map((currency) => currency.code)).toEqual([
      "PLN",
      "EUR",
    ]);
    expect(getCurrencyDefinition("PLN", settings)).toMatchObject({
      code: "PLN",
      name: "Polski złoty",
      enabled: false,
      isDefault: true,
      order: 1,
    });
    expect(settings.conversion).toMatchObject({
      enabled: true,
      mode: "manual",
      baseCurrencyCode: "USD",
      rates: [
        {
          fromCurrencyCode: "EUR",
          toCurrencyCode: "PLN",
          rate: 4.3,
        },
      ],
    });
  });

  it("adds the default Frankfurter provider config for automatic conversion", () => {
    const settings = normalizeCurrencySettings({
      defaultCurrencyCode: "PLN",
      conversion: {
        enabled: true,
        mode: "automatic",
        baseCurrencyCode: "PLN",
      },
    });

    expect(settings.conversion.automatic).toMatchObject({
      enabled: true,
      provider: DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
      refreshIntervalMinutes:
        DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES,
    });
  });

  it("resolves default currency from settings, legacy channel currency, then PLN", () => {
    expect(
      resolveDefaultCurrencyCode(
        {
          defaultCurrencyCode: "eur",
          currencies: [euroDefinition],
        },
        "USD",
      ),
    ).toBe("EUR");
    expect(resolveDefaultCurrencyCode(undefined, "usd")).toBe("USD");
    expect(
      resolveDefaultCurrencyCode({ defaultCurrencyCode: "invalid" }, "usd"),
    ).toBe("USD");
    expect(resolveDefaultCurrencyCode(null, null)).toBe(PLN);
  });

  it("returns default definitions for legacy defaults missing from settings", () => {
    expect(getDefaultCurrencyDefinition(undefined, "usd")).toEqual({
      code: "USD",
      name: "USD",
      symbol: "USD",
      locale: "pl-PL",
      minorUnitDigits: 2,
      enabled: false,
      archived: true,
      order: Number.MAX_SAFE_INTEGER,
      isDefault: false,
    });
  });

  it("keeps archived currencies readable but removes them from enabled lists", () => {
    const settings = normalizeCurrencySettings({
      currencies: [
        {
          code: "EUR",
          name: "Legacy Euro",
          symbol: "€",
          locale: "de-DE",
          minorUnitDigits: 2,
          enabled: false,
          archived: true,
          order: 0,
        },
        usdDefinition,
      ],
    });

    expect(getCurrencyDefinition("eur", settings)?.name).toBe("Legacy Euro");
    expect(getCurrencyLabel("EUR", settings)).toBe("Legacy Euro");
    expect(getCurrencySymbol("EUR", settings)).toBe("€");
    expect(getCurrencyMinorUnitDigits("EUR", settings)).toBe(2);
    expect(getEnabledCurrencyCodes(settings)).toEqual(["PLN", "USD"]);
    expect(
      getEnabledCurrencyDefinitions(settings).some(
        (currency) => currency.code === "EUR",
      ),
    ).toBe(false);
    expect(getCurrencyOptions(settings)).not.toContainEqual({
      label: "Legacy Euro",
      value: "EUR",
    });
  });

  it("uses deterministic fallbacks for unknown and invalid codes", () => {
    const unknown = getCurrencyDefinitionOrFallback("jpy");

    expect(unknown).toEqual({
      code: "JPY",
      name: "JPY",
      symbol: "JPY",
      locale: "pl-PL",
      minorUnitDigits: 2,
      enabled: false,
      archived: true,
      order: Number.MAX_SAFE_INTEGER,
      isDefault: false,
    });
    expect(getCurrencyLabel("jpy")).toBe("JPY");
    expect(getCurrencySymbol("jpy")).toBe("JPY");
    expect(getCurrencyMinorUnitDigits("jpy")).toBe(2);
    expect(getCurrencyDefinitionOrFallback("not-valid").code).toBe(PLN);
  });

  it("validates and normalizes ISO-like currency codes", () => {
    expect(normalizeCurrencyCode(" pln ")).toBe("PLN");
    expect(normalizeCurrencyCode("EU")).toBeNull();
    expect(normalizeCurrencyCode("US1")).toBeNull();
    expect(isValidCurrencyCode("PLN")).toBe(true);
    expect(isValidCurrencyCode("pln")).toBe(false);
  });

  it("orders active currencies by order and pushes archived currencies last", () => {
    const settings = normalizeCurrencySettings({
      currencies: [
        {
          code: "GBP",
          name: "Pound Sterling",
          symbol: "£",
          locale: "en-GB",
          minorUnitDigits: 2,
          enabled: true,
          archived: false,
          order: 1,
        },
        {
          ...euroDefinition,
          order: 1,
        },
        {
          code: "CHF",
          name: "Swiss Franc",
          symbol: "CHF",
          locale: "de-CH",
          minorUnitDigits: 2,
          enabled: true,
          archived: true,
          order: 0,
        },
      ],
    });

    expect(settings.currencies.map((currency) => currency.code)).toEqual([
      "PLN",
      "EUR",
      "GBP",
      "CHF",
    ]);
  });
});
