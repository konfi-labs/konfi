import { Base } from "../base";
import { NestedCustomer } from "../customers/customer";
import { FormattedOrderItem, OrderItem } from "../orders/order-item";
import { Contact } from "../customers";
import type { TenantOwned } from "../tenant";
import type { CurrencyCode } from "../enums";
import type { ShippingMethodId } from "../configuration/shipping-methods";

export interface Quote extends Base, TenantOwned {
  number: number;
  customer: NestedCustomer | string;
  contact: Contact;
  shippingOption: ShippingMethodId | null;
  shippingPrice: number;
  totalPrice: number;
  currency: CurrencyCode;
  specialNotes: string;
  items: OrderItem[];
  keywords: string[];
  mailLink?: string;
  appliedPromotionCodes: string[];
}

export interface QuoteCreate extends Omit<Quote, "items"> {
  items: FormattedOrderItem[];
}

export interface QuoteCreateForm extends Omit<
  QuoteCreate,
  | "id"
  | "name"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
  | "number"
  | "currency"
  | "active"
  | "totalPrice"
  | "keywords"
  | "shippingPrice"
  | "items"
  | "tenantId"
> {
  items: OrderItem[];
}

export interface QuoteUpdate extends Omit<
  Quote,
  | "id"
  | "name"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "active"
  | "items"
  | "tenantId"
> {
  items: FormattedOrderItem[];
}

export interface QuoteUpdateForm extends Omit<
  QuoteUpdate,
  | "updatedAt"
  | "totalPrice"
  | "keywords"
  | "shippingPrice"
  | "items"
  | "tenantId"
> {
  items: OrderItem[];
}

export type FormQuote = Omit<
  Quote,
  | "id"
  | "number"
  | "totalPrice"
  | "createdAt"
  | "updatedAt"
  | "keywords"
  | "tenantId"
>;
