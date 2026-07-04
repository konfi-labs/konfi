import { CurrencyEnum } from "../enums";
import { Order } from "./order";

export interface InternalOrder extends Omit<
  Order,
  | "shippingPrice"
  | "invoice"
  | "difficulty"
  | "priority"
  | "isFromStore"
  | "checkoutSession"
  | "path"
> {}

export interface InternalOrderCreate extends InternalOrder {
  toChannel?: {
    id?: string;
    currency?: CurrencyEnum;
  };
}

export interface InternalOrderCreateForm extends Omit<
  InternalOrderCreate,
  | "id"
  | "name"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
  | "number"
  | "currency"
  | "active"
  | "totalPrice"
  | "activities"
  | "messages"
  | "isFromStore"
  | "keywords"
  | "path"
  | "shippingPrice"
  | "deadline"
  | "checkoutSession"
  | "channelId"
> {}

export interface InternalOrderUpdate extends Omit<
  InternalOrder,
  | "id"
  | "name"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "active"
  | "keywords"
  | "totalPrice"
  | "customer"
  | "shippingOption"
  | "items"
  | "difficulty"
  | "activities"
  | "deadline"
  | "channelId"
  | "email"
  | "paymentType"
  | "isTest"
  | "active"
  | "shipping"
  | "billing"
> {}

export interface InternalOrderUpdateForm extends Omit<
  InternalOrderUpdate,
  | "id"
  | "name"
  | "updatedAt"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "active"
  | "totalPrice"
  | "activities"
  | "messages"
  | "isFromStore"
  | "path"
  | "shippingPrice"
  | "deadline"
  | "checkoutSession"
  | "channelId"
  | "customer"
  | "contact"
  | "invoice"
  | "items"
  | "shippingOptions"
  | "shipping"
  | "billing"
  | "paymentType"
  | "isTest"
  | "shippingOption"
  | "active"
> {}
