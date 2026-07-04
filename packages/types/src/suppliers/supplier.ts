import { Contact } from "../customers/contact";
import { Address } from "../customers/address";
import { Base } from "../base";
import type { TenantOwned } from "../tenant";

export interface SupplierAttributeOption {
  attributeId: string;
  optionValue: string;
}

export interface Supplier extends Base, TenantOwned {
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  nip?: string; // Tax ID
  regon?: string; // Business registry number
  krs?: string; // Court register number
  contacts?: Contact[];
  addresses?: Address[];
  specialNotes: string;
  linkedProductsIds?: string[];
  linkedAttributeOptions?: SupplierAttributeOption[];
  paymentTerms?: string; // e.g., "NET30", "NET15"
  currency?: string; // Default currency for this supplier
  isPreferred: boolean; // Mark as preferred supplier
  rating?: number; // Supplier rating 1-5
  leadTime?: number; // Default lead time in days
  minimumOrder?: number; // Minimum order value
  keywords: string[];
  supplierCode?: string; // Internal supplier code
}

export interface SupplierCreate extends Supplier {}

export interface SupplierCreateForm extends Omit<
  SupplierCreate,
  | "id"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
  | "number"
  | "active"
  | "keywords"
  | "linkedProductsIds"
  | "linkedAttributeOptions"
  | "tenantId"
> {}

export interface SupplierUpdate extends Omit<
  Supplier,
  | "id"
  | "createdBy"
  | "createdAt"
  | "number"
  | "active"
  | "linkedProductsIds"
  | "linkedAttributeOptions"
  | "tenantId"
> {}

export interface SupplierUpdateForm extends Omit<
  SupplierUpdate,
  "updatedAt" | "keywords" | "tenantId"
> {}

export type NestedSupplier = Omit<
  Supplier,
  | "number"
  | "contacts"
  | "addresses"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "keywords"
  | "active"
  | "linkedProductsIds"
  | "linkedAttributeOptions"
  | "specialNotes"
  | "tenantId"
>;

export const isNestedSupplier = (test: unknown): test is NestedSupplier => {
  return (
    typeof test === "object" &&
    test !== null &&
    "id" in test &&
    test.id !== undefined
  );
};
