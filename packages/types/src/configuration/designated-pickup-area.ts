import { Base } from "../base";
import { ShippingOptions } from "../enums";
import type { TenantOwned } from "../tenant";

export interface DesignatedPickupArea extends Base, TenantOwned {
  warehouseId: string;
  description?: string;
  shippingOptions?: string[];
  keywords: string[];
}

export interface CreateDesignatedPickupArea extends DesignatedPickupArea {}

export interface DesignatedPickupAreaCreateForm extends Omit<
  CreateDesignatedPickupArea,
  | "id"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "active"
  | "keywords"
  | "tenantId"
> {}

export interface UpdateDesignatedPickupArea extends Omit<
  DesignatedPickupArea,
  "id" | "createdAt" | "createdBy" | "active"
> {}

export interface DesignatedPickupAreaUpdateForm extends Omit<
  UpdateDesignatedPickupArea,
  "id" | "updatedAt" | "active" | "keywords" | "tenantId"
> {}
