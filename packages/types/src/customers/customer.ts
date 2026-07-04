import { Timestamp } from "firebase/firestore";
import { Base } from "../base";
import { NestedMember } from "../configuration/member";
import { Order } from "../orders/order";
import type { TenantOwned } from "../tenant";
import { Address } from "./address";
import { Contact } from "./contact";

export interface Customer extends Base, TenantOwned {
  personName?: string;
  email?: string;
  nip?: string;
  allowedBankPayments: boolean;
  allowedOnPickupPayments: boolean;
  allowedDefferedPayments: boolean;
  contacts?: Contact[];
  addresses?: Address[];
  specialNotes: string;
  orders?: Order["id"][];
  loyaltyPoints?: number;
  storeCreditBalance?: number;
  discount?: number;
  b2b?: boolean;
  b2bInquiryId?: string;
  supportOwner?: NestedMember;
  linkedProductsIds?: string[];
  customerGroupIds?: string[];
  keywords: string[];
  linkedAuthId?: string;
  legacyMigratedAt?: Omit<Timestamp, "toJSON">;
}

export interface CustomerCreate extends Customer {}

export interface CustomerCreateForm extends Omit<
  CustomerCreate,
  | "id"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
  | "number"
  | "active"
  | "orders"
  | "keywords"
  | "loyaltyPoints"
  | "storeCreditBalance"
  | "linkedProductsIds"
  | "supportOwner"
  | "b2bInquiryId"
  | "linkedAuthId"
  | "legacyMigratedAt"
  | "tenantId"
> {}

export interface CustomerUpdate extends Omit<
  Customer,
  | "id"
  | "createdBy"
  | "createdAt"
  | "number"
  | "active"
  | "orders"
  | "loyaltyPoints"
  | "storeCreditBalance"
  | "linkedProductsIds"
  | "supportOwner"
  | "b2bInquiryId"
  | "linkedAuthId"
  | "legacyMigratedAt"
  | "tenantId"
> {}

export interface CustomerUpdateForm extends Omit<
  CustomerUpdate,
  "updatedAt" | "keywords" | "tenantId"
> {}

export type NestedCustomer = Omit<
  Customer,
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "orders"
  | "keywords"
  | "active"
  | "loyaltyPoints"
  | "storeCreditBalance"
  | "b2bInquiryId"
  | "supportOwner"
  | "linkedAuthId"
  | "legacyMigratedAt"
  | "tenantId"
>;

export const isNestedCustomer = (test: unknown): test is NestedCustomer => {
  return (
    typeof test === "object" &&
    test !== null &&
    "id" in test &&
    test.id !== undefined
  );
};
