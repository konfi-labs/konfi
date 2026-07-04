import { Base } from "./base";
import { Warehouse } from "./configuration/warehouse";
import type { CurrencyCode } from "./enums";
import { ChannelNotificationSettings } from "./notifications";
import type { TenantOwned } from "./tenant";

export interface Channel extends Base, TenantOwned {
  currency: CurrencyCode;
  warehouses: Warehouse["id"][];
  notifications?: ChannelNotificationSettings;
}

export interface ChannelCreate extends Channel {}

export interface ChannelCreateForm extends Omit<
  ChannelCreate,
  "id" | "updatedAt" | "updatedBy" | "createdAt" | "active" | "tenantId"
> {}

export interface ChannelUpdate extends Omit<
  Channel,
  "id" | "createdBy" | "createdAt" | "active"
> {}

export interface ChannelUpdateForm extends Omit<
  ChannelUpdate,
  "updatedAt" | "tenantId"
> {}
