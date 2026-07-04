import type { Base } from "./base";
import type { CurrencyCode } from "./enums";
import type { TenantOwned } from "./tenant";

export type TaxCalculationMode = "gross" | "net";

export type TaxLineSourceType = "item" | "shipping";

export interface TaxRateTarget {
  categoryIds?: string[];
  productIds?: string[];
  productTypeIds?: string[];
  taxCategoryIds?: string[];
}

export interface TaxRateDefinition {
  active?: boolean;
  id: string;
  name: string;
  percent: number;
  priority?: number;
  target?: TaxRateTarget;
}

export interface TaxRegionDefinition {
  active?: boolean;
  calculationMode?: TaxCalculationMode;
  countryCodes: string[];
  defaultRateId: string;
  id: string;
  name: string;
  pricesIncludeTax?: boolean;
  rates: TaxRateDefinition[];
}

export interface TaxSettings {
  defaultCountryCode: string;
  enabled: boolean;
  regions: TaxRegionDefinition[];
  tenantId?: string;
  updatedAt?: unknown;
  version?: string | number;
}

export interface TaxLineSnapshot {
  countryCode: string;
  currency: CurrencyCode;
  grossAmount: number;
  id: string;
  netAmount: number;
  rateId: string;
  rateName: string;
  regionId: string;
  sourceId?: string;
  sourceType: TaxLineSourceType;
  taxAmount: number;
  taxCategoryId?: string;
  taxRatePercent: number;
}

export interface TaxSummarySnapshot {
  calculationMode: TaxCalculationMode;
  countryCode: string;
  currency: CurrencyCode;
  enabled: boolean;
  lines: TaxLineSnapshot[];
  pricesIncludeTax: boolean;
  regionId: string;
  shippingGross: number;
  subtotalGross: number;
  totalGross: number;
  totalNet: number;
  totalTax: number;
}

export interface TaxRegion
  extends Omit<Base, "active">, TenantOwned, TaxRegionDefinition {}
