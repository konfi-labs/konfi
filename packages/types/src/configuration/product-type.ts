import { Attribute } from "./attribute";
import { Base } from "../base";
import type { TenantOwned } from "../tenant";

export interface ProductType extends Base, TenantOwned {
  attributes: Attribute["id"][];
  isShippable: boolean;
  keywords: string[];
}

export interface CreateProductType extends ProductType {
  toChannel?: {
    id?: string;
  };
}

export interface ProductTypeCreateForm extends Omit<
  CreateProductType,
  "createdAt" | "updatedBy" | "updatedAt" | "keywords" | "active" | "tenantId"
> {}

export interface UpdateProductType extends Omit<ProductType, "id" | "active"> {}

export interface ProductTypeUpdateForm extends Omit<
  UpdateProductType,
  "createdAt" | "createdBy" | "updatedAt" | "keywords" | "tenantId"
> {
  id: ProductType["id"];
}

export type NestedProductType = Omit<
  ProductType,
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "keywords"
  | "active"
  | "tenantId"
>;
