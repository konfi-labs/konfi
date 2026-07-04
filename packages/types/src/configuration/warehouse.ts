import { Address } from "../customers/address";
import { Contact } from "../customers/contact";
import { Base } from "../base";
import { DesignatedPickupArea } from "./designated-pickup-area";
import type { TenantOwned } from "../tenant";

export interface Warehouse extends Base, TenantOwned {
  contacts?: Contact[];
  address: Address | null;
  keywords: string[];
}

export interface CreateWarehouse extends Warehouse {}

export interface WarehouseCreateForm extends Omit<
  CreateWarehouse,
  | "id"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "active"
  | "keywords"
  | "tenantId"
> {}

export interface UpdateWarehouse extends Omit<
  Warehouse,
  "id" | "createdAt" | "createdBy" | "active"
> {}

export interface WarehouseUpdateForm extends Omit<
  UpdateWarehouse,
  "id" | "updatedAt" | "active" | "keywords" | "tenantId"
> {}
