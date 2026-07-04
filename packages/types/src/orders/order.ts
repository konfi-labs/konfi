import { Timestamp } from "firebase/firestore";
import { PaymentStatus } from "../enums";
import type { CurrencyCode } from "../enums";
import type { CurrencyConversionSnapshot } from "../configuration/currencies";
import type {
  OrderFileStatusId,
  OrderWorkflowStatusId,
} from "../configuration/order-workflow-statuses";
import type { PaymentMethodId } from "../configuration/payment-methods";
import type { PrintingMethodId } from "../configuration/printing-methods";
import type { ShippingMethodId } from "../configuration/shipping-methods";
import type { ProofingMethodId } from "../configuration/units-proofing";
import { IActivity } from "./activity";
import { Address } from "../customers/address";
import { NestedCustomer } from "../customers/customer";
import { Message } from "./message";
import { OrderItem, FormattedOrderItem } from "./order-item";
import { Channel } from "../channel";
import type { OrderInternalTransit } from "../configuration/internal-transit";
import { Contact } from "../customers/contact";
import type { StoreCreditRedemption } from "../customers/store-credit";
import { Base } from "../base";
import type { TenantOwned } from "../tenant";
import type { TaxSummarySnapshot } from "../tax";
import { Tracking } from "./tracking";
import { IDiscount } from "../discount";

/**
 * Interface for storing item-level problems/issues.
 * Each problem is tied to an item ID and contains a description and resolved status.
 */
export interface ItemProblem {
  itemId: string;
  description: string;
  resolved: boolean;
  createdAt?: Timestamp;
  resolvedAt?: Timestamp;
}

export type ExternalOrderSourceProvider = "ALLEGRO";

export interface ExternalOrderLineItemSource {
  externalLineItemId: string;
  externalOfferId?: string;
  externalOfferName?: string;
}

export interface ExternalOrderSource {
  provider: ExternalOrderSourceProvider;
  externalOrderId: string;
  externalOrderRevision?: string;
  externalBuyerId?: string;
  externalBuyerLogin?: string;
  externalPaymentId?: string;
  externalDeliveryMethodId?: string;
  externalDeliveryMethodName?: string;
  externalStatus?: string;
  externalFulfillmentStatus?: string;
  externalPaymentStatus?: string;
  externalUpdatedAt?: string;
  fulfillmentProvider?: "SELLER" | "ALLEGRO";
  marketplaceId?: string;
  pickupPointId?: string;
  pickupPointName?: string;
  externallyFulfilled?: boolean;
  importedAt?: Omit<Timestamp, "toJSON">;
  lastSyncedAt?: Omit<Timestamp, "toJSON">;
  lineItems?: ExternalOrderLineItemSource[];
}

export interface AnonymousPackageLabelAddress {
  labelName?: string;
  company?: string;
  name?: string;
  street?: string;
  city?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

export function isAllegroExternalOrder(
  order?: { externalSource?: ExternalOrderSource | null } | null,
): boolean {
  return order?.externalSource?.provider === "ALLEGRO";
}

export function isAllegroFulfillmentManagedOrder(
  order?: { externalSource?: ExternalOrderSource | null } | null,
): boolean {
  const source = order?.externalSource;
  return (
    source?.provider === "ALLEGRO" && source.fulfillmentProvider === "ALLEGRO"
  );
}

export function isOrder(arg: unknown): arg is Order {
  if (!arg || typeof arg !== "object") {
    return false;
  }

  const candidate = arg as Record<string, unknown> & {
    billing?: unknown;
    customer?: { id?: unknown } | string;
    shipping?: unknown;
  };

  return (
    (typeof candidate.number === "number" &&
      (typeof candidate.customer === "string" ||
        Boolean(candidate.customer?.id)) &&
      (candidate.shipping === null ||
        (Boolean(candidate.shipping) &&
          typeof candidate.shipping === "object")) &&
      typeof candidate.invoice === "boolean") ||
    (candidate.invoice === undefined &&
      (candidate.billing === null ||
        (Boolean(candidate.billing) &&
          typeof candidate.billing === "object")) &&
      typeof candidate.deadlineString === "string" &&
      Boolean(candidate.deadline) &&
      typeof candidate.totalPrice === "number" &&
      typeof candidate.currency === "string" &&
      typeof candidate.specialNotes === "string" &&
      Array.isArray(candidate.items) &&
      typeof candidate.difficulty === "number" &&
      typeof candidate.priority === "number" &&
      typeof candidate.status === "string" &&
      typeof candidate.paymentType === "string" &&
      typeof candidate.paymentStatus === "string" &&
      Array.isArray(candidate.activities) &&
      Array.isArray(candidate.messages) &&
      Array.isArray(candidate.keywords) &&
      (typeof candidate.isFromStore === "boolean" ||
        candidate.isFromStore === undefined))
  );
}

export interface Order extends Base, TenantOwned {
  number: number;
  customer: NestedCustomer | string;
  contact: Contact;
  email?: string;
  externalSource?: ExternalOrderSource | null;
  shipping: Address | null;
  tracking?: Tracking;
  internalTransit?: OrderInternalTransit;
  mailLink?: string;
  sendStatusChangeEmail?: boolean;
  shippingOption: ShippingMethodId | null;
  anonymousPackageShipping?: boolean;
  anonymousPackageLabelAddress?: AnonymousPackageLabelAddress | null;
  shippingPrice: number;
  shippingPriceDiscount: IDiscount | null;
  designatedPickupAreaId?: string;
  invoice: boolean;
  billing: Address | null;
  exactTime: boolean;
  deadlineString: string;
  deadline: Omit<Timestamp, "toJSON">;
  totalPrice: number;
  totalPriceDiscount: IDiscount | null;
  storeCreditRedemption?: StoreCreditRedemption | null;
  currency: CurrencyCode;
  currencySnapshot?: CurrencyConversionSnapshot;
  specialNotes: string;
  invoiceNotes?: string;
  items: OrderItem[];
  fulfilledItems: string[];
  inProgressItems: string[];
  pickedUpItems?: string[];
  deliveredItems?: string[];
  priorityItems: string[];
  problemItems?: ItemProblem[];
  difficulty: number;
  priority: number;
  status: OrderWorkflowStatusId;
  paymentType: PaymentMethodId;
  paymentStatus: PaymentStatus;
  filesStatus: OrderFileStatusId;
  activities: IActivity[];
  messages: Message[];
  keywords: string[];
  isFromStore: boolean;
  checkoutSession?: {
    id: string;
    url: string;
    paymentIntent: string;
  };
  path?: string;
  isTest: boolean;
  channelId: Channel["id"];
  appliedPromotionCodes: string[];
  paymentDocumentId?: string;
  proformaDocumentId?: string;
  printingMethods?: PrintingMethodId[];
  carriedOutBy: string[];
  complaints?: string[];
  taxSummary?: TaxSummarySnapshot;
}

export interface OrderCreate extends Omit<Order, "items" | "complaints"> {
  items: FormattedOrderItem[];
  toChannel?: {
    id?: string;
    currency?: CurrencyCode;
  };
}

export interface OrderAddTracking {
  tracking: Tracking;
}

export interface OrderCreateForm extends Omit<
  OrderCreate,
  | "id"
  | "name"
  | "updatedAt"
  | "updatedBy"
  | "createdAt"
  | "number"
  | "currency"
  | "currencySnapshot"
  | "totalPrice"
  | "totalPriceDiscount"
  | "storeCreditRedemption"
  | "activities"
  | "messages"
  | "isFromStore"
  | "keywords"
  | "path"
  | "shippingPrice"
  | "shippingPriceDiscount"
  | "deadline"
  | "checkoutSession"
  | "channelId"
  | "tracking"
  | "internalTransit"
  | "fulfilledItems"
  | "inProgressItems"
  | "pickedUpItems"
  | "deliveredItems"
  | "priorityItems"
  | "problemItems"
  | "items"
  | "taxSummary"
  | "tenantId"
> {
  items: OrderItem[];
  saveCustomer: boolean;
  saveContact: boolean;
  saveShippingAddress: boolean;
  saveBillingAddress: boolean;
}

export interface OrderUpdate extends Omit<
  Order,
  | "id"
  | "name"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "currencySnapshot"
  | "totalPriceDiscount"
  | "activities"
  | "channelId"
  | "isFromStore"
  | "shippingPriceDiscount"
  | "tracking"
  | "internalTransit"
  | "fulfilledItems"
  | "inProgressItems"
  | "pickedUpItems"
  | "deliveredItems"
  | "priorityItems"
  | "problemItems"
  | "items"
  | "externalSource"
  | "complaints"
  | "tenantId"
> {
  items: FormattedOrderItem[];
  taxSummary?: TaxSummarySnapshot;
}

export interface OrderUpdateForm extends Omit<
  OrderUpdate,
  | "id"
  | "name"
  | "updatedAt"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "currencySnapshot"
  | "totalPrice"
  | "totalPriceDiscount"
  | "storeCreditRedemption"
  | "activities"
  | "messages"
  | "path"
  | "shippingPrice"
  | "shippingPriceDiscount"
  | "deadline"
  | "checkoutSession"
  | "channelId"
  | "shippingOptions"
  | "tracking"
  | "internalTransit"
  | "keywords"
  | "items"
  | "taxSummary"
  | "tenantId"
> {
  items: OrderItem[];
  saveCustomer: boolean;
  saveContact: boolean;
  saveShippingAddress: boolean;
  saveBillingAddress: boolean;
}

export interface OrderUpdateStore extends Omit<
  Order,
  | "id"
  | "name"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "currencySnapshot"
  | "keywords"
  | "totalPrice"
  | "totalPriceDiscount"
  | "storeCreditRedemption"
  | "customer"
  | "items"
  | "difficulty"
  | "activities"
  | "exactTime"
  | "deadline"
  | "channelId"
  | "contact"
  | "email"
  | "paymentType"
  | "isTest"
  | "isFromStore"
  | "invoice"
  | "billing"
  | "shippingPrice"
  | "shippingPriceDiscount"
  | "tracking"
  | "internalTransit"
  | "appliedPromotionCodes"
  | "fulfilledItems"
  | "inProgressItems"
  | "pickedUpItems"
  | "deliveredItems"
  | "priorityItems"
  | "problemItems"
  | "externalSource"
  | "complaints"
  | "taxSummary"
  | "tenantId"
> {}

export interface OrderUpdateFormStore extends Omit<
  OrderUpdateStore,
  | "id"
  | "name"
  | "updatedAt"
  | "createdBy"
  | "createdAt"
  | "number"
  | "currency"
  | "currencySnapshot"
  | "totalPrice"
  | "totalPriceDiscount"
  | "storeCreditRedemption"
  | "activities"
  | "messages"
  | "path"
  | "shippingPrice"
  | "shippingPriceDiscount"
  | "deadline"
  | "checkoutSession"
  | "channelId"
  | "customer"
  | "contact"
  | "items"
  | "shippingOptions"
  | "tracking"
  | "internalTransit"
  | "taxSummary"
  | "tenantId"
> {}

export interface StoreOrder extends Omit<
  Order,
  | "items"
  | "currency"
  | "currencySnapshot"
  | "fulfilledItems"
  | "inProgressItems"
  | "pickedUpItems"
  | "deliveredItems"
  | "priorityItems"
  | "problemItems"
  | "externalSource"
  | "exactTime"
> {
  userId: string;
  currency?: CurrencyCode;
  currencySnapshot?: CurrencyConversionSnapshot;
  contact: Contact;
  items: FormattedOrderItem[];
  saveShippingAddress: boolean;
  saveBillingAddress: boolean;
  proofing: ProofingMethodId;
  ratingsAdded?: boolean;
}

export interface StoreOrderUpdate extends Omit<
  StoreOrder,
  | "name"
  | "totalPrice"
  | "items"
  | "shipping"
  | "shippingOption"
  | "invoice"
  | "billing"
  | "deadlineString"
  | "specialNotes"
  | "paymentType"
  | "channelId"
  | "userId"
  | "contact"
  | "saveShippingAddress"
  | "saveBillingAddress"
  | "proofing"
  | "tracking"
  | "internalTransit"
  | "complaints"
> {}

export interface StoreOrderForm extends Omit<
  StoreOrder,
  | "id"
  | "number"
  | "userId"
  | "items"
  | "path"
  | "active"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
  | "keywords"
  | "name"
  | "customer"
  | "currency"
  | "currencySnapshot"
  | "shippingOption"
  | "shippingPrice"
  | "shippingPriceDiscount"
  | "totalPrice"
  | "totalPriceDiscount"
  | "storeCreditRedemption"
  | "difficulty"
  | "activities"
  | "deadline"
  | "messages"
  | "isFromStore"
  | "checkoutSession"
  | "channelId"
  | "deadlineString"
  | "priority"
  | "status"
  | "paymentType"
  | "paymentStatus"
  | "filesStatus"
  | "isTest"
  | "tracking"
  | "internalTransit"
  | "ratingsAdded"
  | "paymentDocumentId"
  | "proformaDocumentId"
  | "printingMethods"
  | "carriedOutBy"
  | "complaints"
  | "mailLink"
  | "taxSummary"
  | "tenantId"
> {
  storeCreditAmount?: number;
}

export function isStoreOrder(arg: unknown): arg is StoreOrder {
  if (!arg || typeof arg !== "object") {
    return false;
  }

  const candidate = arg as Record<string, unknown>;

  return (
    typeof candidate.userId === "string" &&
    typeof candidate.contact === "object" &&
    Array.isArray(candidate.items) &&
    typeof candidate.saveShippingAddress === "boolean" &&
    typeof candidate.saveBillingAddress === "boolean" &&
    typeof candidate.proofing === "string"
  );
}
