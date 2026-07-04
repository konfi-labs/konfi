"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CurrencyCode,
  CurrencyDefinition,
  CurrencySettings,
} from "@konfi/types";
import {
  convertMinorAmountForDisplay,
  createDefaultCurrencySettings,
  formatConvertedPrice,
  getCurrencyMinorUnitDigits,
  getEnabledCurrencyDefinitions,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
  type CurrencySettingsInput,
} from "@konfi/utils";

const SELECTED_CURRENCY_STORAGE_KEY = "konfi:selected-currency:v1";

type FormatSelectedCurrencyOptions = {
  baseCurrency?: CurrencyCode | null;
  unit?: string;
  volume?: number;
};

type StoreCurrencyContextValue = {
  convertAmount: (
    amountMinor: number,
    baseCurrency?: CurrencyCode | null,
  ) => ReturnType<typeof convertMinorAmountForDisplay>;
  enabledCurrencies: CurrencyDefinition[];
  formatPrice: (
    amountMinor: number,
    lng?: string,
    options?: FormatSelectedCurrencyOptions,
  ) => string;
  selectedCurrencyCode: CurrencyCode;
  selectedCurrency: CurrencyDefinition;
  setSelectedCurrencyCode: (currencyCode: CurrencyCode) => void;
  settings: CurrencySettings;
  toMajorAmount: (
    amountMinor: number,
    baseCurrency?: CurrencyCode | null,
  ) => number;
};

const defaultCurrencySettings = createDefaultCurrencySettings();
const defaultCurrency = defaultCurrencySettings.currencies[0];

const StoreCurrencyContext = createContext<StoreCurrencyContextValue>({
  convertAmount: (amountMinor) =>
    convertMinorAmountForDisplay({
      amountMinor,
      settings: defaultCurrencySettings,
      targetCurrency: defaultCurrencySettings.defaultCurrencyCode,
    }),
  enabledCurrencies: defaultCurrencySettings.currencies,
  formatPrice: (amountMinor, lng, options) =>
    formatConvertedPrice(
      amountMinor,
      defaultCurrencySettings.defaultCurrencyCode,
      defaultCurrencySettings,
      options?.volume,
      options?.unit,
      lng,
      options?.baseCurrency,
    ),
  selectedCurrencyCode: defaultCurrencySettings.defaultCurrencyCode,
  selectedCurrency: defaultCurrency,
  setSelectedCurrencyCode: () => {},
  settings: defaultCurrencySettings,
  toMajorAmount: (amountMinor) => amountMinor / 100,
});

export function StoreCurrencyProvider({
  children,
  currencySettings,
}: {
  children: React.ReactNode;
  currencySettings?: CurrencySettingsInput | null;
}) {
  const settings = useMemo(
    () => normalizeCurrencySettings(currencySettings),
    [currencySettings],
  );
  const enabledCurrencies = useMemo(
    () => getEnabledCurrencyDefinitions(settings),
    [settings],
  );
  const enabledCurrencyCodes = useMemo(
    () => new Set(enabledCurrencies.map((currency) => currency.code)),
    [enabledCurrencies],
  );
  const defaultCurrencyCode = settings.defaultCurrencyCode;
  const [selectedCurrencyCode, setSelectedCurrencyCodeState] =
    useState<CurrencyCode>(defaultCurrencyCode);

  useEffect(() => {
    try {
      const storedCurrencyCode = normalizeCurrencyCode(
        window.localStorage.getItem(SELECTED_CURRENCY_STORAGE_KEY),
      );

      if (storedCurrencyCode && enabledCurrencyCodes.has(storedCurrencyCode)) {
        setSelectedCurrencyCodeState(storedCurrencyCode);
      }
    } catch {
      setSelectedCurrencyCodeState(defaultCurrencyCode);
    }
  }, [defaultCurrencyCode, enabledCurrencyCodes]);

  useEffect(() => {
    if (enabledCurrencyCodes.has(selectedCurrencyCode)) {
      return;
    }

    setSelectedCurrencyCodeState(defaultCurrencyCode);
  }, [defaultCurrencyCode, enabledCurrencyCodes, selectedCurrencyCode]);

  const setSelectedCurrencyCode = useCallback(
    (currencyCode: CurrencyCode) => {
      const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode);

      if (
        !normalizedCurrencyCode ||
        !enabledCurrencyCodes.has(normalizedCurrencyCode)
      ) {
        return;
      }

      setSelectedCurrencyCodeState(normalizedCurrencyCode);

      try {
        window.localStorage.setItem(
          SELECTED_CURRENCY_STORAGE_KEY,
          normalizedCurrencyCode,
        );
      } catch {
        // Local storage can be unavailable in private or restricted contexts.
      }
    },
    [enabledCurrencyCodes],
  );

  const selectedCurrency =
    enabledCurrencies.find(
      (currency) => currency.code === selectedCurrencyCode,
    ) ??
    enabledCurrencies[0] ??
    defaultCurrency;

  const convertAmount = useCallback(
    (amountMinor: number, baseCurrency?: CurrencyCode | null) =>
      convertMinorAmountForDisplay({
        amountMinor,
        baseCurrency,
        settings,
        targetCurrency: selectedCurrency.code,
      }),
    [selectedCurrency.code, settings],
  );

  const toMajorAmount = useCallback(
    (amountMinor: number, baseCurrency?: CurrencyCode | null) => {
      const converted = convertAmount(amountMinor, baseCurrency);
      const minorUnitDigits = getCurrencyMinorUnitDigits(
        converted.currency,
        settings,
      );

      return converted.amountMinor / 10 ** minorUnitDigits;
    },
    [convertAmount, settings],
  );

  const formatPrice = useCallback(
    (
      amountMinor: number,
      lng?: string,
      options?: FormatSelectedCurrencyOptions,
    ) =>
      formatConvertedPrice(
        amountMinor,
        selectedCurrency.code,
        settings,
        options?.volume,
        options?.unit,
        lng,
        options?.baseCurrency,
      ),
    [selectedCurrency.code, settings],
  );

  return (
    <StoreCurrencyContext.Provider
      value={{
        convertAmount,
        enabledCurrencies,
        formatPrice,
        selectedCurrency,
        selectedCurrencyCode: selectedCurrency.code,
        setSelectedCurrencyCode,
        settings,
        toMajorAmount,
      }}
    >
      {children}
    </StoreCurrencyContext.Provider>
  );
}

export function useStoreCurrency() {
  return useContext(StoreCurrencyContext);
}
