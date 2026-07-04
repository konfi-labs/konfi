import type { Base } from "./base";
import type { CurrencyCode } from "./enums";
import type { Price } from "./price";
import type { TenantOwned } from "./tenant";

export enum PriceListAdjustmentType {
  FIXED_UNIT_PRICE = "FIXED_UNIT_PRICE",
  PERCENTAGE = "PERCENTAGE",
  PRICE_OVERRIDE = "PRICE_OVERRIDE",
}

export interface PriceListEntryTarget {
  categoryIds?: string[];
  productIds?: string[];
  productTypeIds?: string[];
}

export interface PriceListEntry {
  adjustmentType: PriceListAdjustmentType;
  currency?: CurrencyCode;
  id: string;
  name?: string;
  prices?: Price[];
  target: PriceListEntryTarget;
  value?: number;
}

export interface PriceList extends Base, TenantOwned {
  active: boolean;
  channelIds?: string[];
  currency: CurrencyCode;
  customerGroupIds?: string[];
  customerIds?: string[];
  description?: string;
  endsAt?: unknown;
  entries: PriceListEntry[];
  priority: number;
  startsAt?: unknown;
}

export interface PriceListApplication {
  entryId: string;
  priceListId: string;
}
