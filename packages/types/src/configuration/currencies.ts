import type { CurrencyCode } from "../enums";

export interface CurrencyDefinition {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
  minorUnitDigits: number;
  enabled: boolean;
  archived?: boolean;
  order: number;
  isDefault?: boolean;
}

export type CurrencyConversionMode = "disabled" | "manual" | "automatic";

export type CurrencyConversionRateSource = "manual" | "automatic" | "default";

export interface CurrencyConversionMetadata {
  provider?: string;
  providerRateId?: string;
  source?: string;
  fetchedAt?: unknown;
  effectiveAt?: unknown;
  expiresAt?: unknown;
  updatedAt?: unknown;
}

export interface CurrencyConversionRate {
  fromCurrencyCode: CurrencyCode;
  toCurrencyCode: CurrencyCode;
  rate: number;
  source?: CurrencyConversionRateSource;
  metadata?: CurrencyConversionMetadata;
  fetchedAt?: unknown;
  updatedAt?: unknown;
}

export interface CurrencyConversionOffset {
  targetCurrencyCode: CurrencyCode;
  percent?: number;
  fixedMinorUnits?: number;
  updatedAt?: unknown;
}

export interface CurrencyAutomaticRateProviderSettings {
  enabled: boolean;
  provider?: string;
  baseUrl?: string;
  apiKeyRef?: string;
  refreshIntervalMinutes?: number;
  lastRefreshAt?: unknown;
  lastAttemptAt?: unknown;
  lastError?: string;
}

export interface CurrencyConversionSnapshot {
  fromCurrencyCode: CurrencyCode;
  toCurrencyCode: CurrencyCode;
  amountMinor: number;
  convertedAmountMinor: number;
  rate: number;
  rateSource?: CurrencyConversionRateSource;
  percentOffset?: number;
  fixedOffsetMinorUnits?: number;
  metadata?: CurrencyConversionMetadata;
  rateFetchedAt?: unknown;
  settingsUpdatedAt?: unknown;
  settingsVersion?: string | number;
  capturedAt?: unknown;
}

export interface CurrencyConversionSettings {
  enabled: boolean;
  mode: CurrencyConversionMode;
  baseCurrencyCode: CurrencyCode;
  rates: CurrencyConversionRate[];
  offsets: CurrencyConversionOffset[];
  automatic?: CurrencyAutomaticRateProviderSettings;
  updatedAt?: unknown;
}

export interface CurrencySettings {
  defaultCurrencyCode: CurrencyCode;
  currencies: CurrencyDefinition[];
  conversion: CurrencyConversionSettings;
  version?: string | number;
  updatedAt?: unknown;
  tenantId?: string;
}
