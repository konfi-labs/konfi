import { Base } from "../base";
import type { TenantOwned } from "../tenant";
import { Timestamp } from "firebase/firestore";

export interface CustomerGroup extends Base, TenantOwned {
  description?: string | null;
  customerIds?: string[];
  archivedAt?: Omit<Timestamp, "toJSON"> | null;
}

export interface CustomerGroupCreateForm extends Omit<
  CustomerGroup,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "updatedBy"
  | "active"
  | "tenantId"
  | "archivedAt"
> {}

export interface CustomerGroupUpdateForm extends Omit<
  CustomerGroup,
  "createdAt" | "createdBy" | "updatedAt" | "active" | "tenantId"
> {}

export type NestedCustomerGroup = Pick<CustomerGroup, "id" | "name">;
