import { Timestamp } from "firebase/firestore";
import {
  Address,
  AddressTypeEnum,
  Channel,
  Contact,
  type CurrencyCode,
  CurrencyEnum,
  Discount,
  ExternalOrderSource,
  Order,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  Product,
  ShippingOptions,
  Unit,
} from "@konfi/types";

type AllegroPickupPointAddress =
  | string
  | {
      street?: string;
      city?: string;
      zipCode?: string;
      countryCode?: string;
    };

export interface AllegroAuthStatus {
  connected: boolean;
  missingScopes?: string[];
  scope?: string;
  user: {
    id: string;
    login: string;
    email: string;
  } | null;
  expiresAt?: number;
}

export interface AllegroPrice {
  amount: string;
  currency: string;
}

export interface AllegroOfferRef {
  id: string;
  name: string;
  external?: { id?: string } | null;
}

export interface AllegroLineItem {
  id: string;
  offer: AllegroOfferRef;
  quantity: number;
  originalPrice: AllegroPrice;
  price: AllegroPrice;
  boughtAt: string;
}

export interface AllegroBuyer {
  id: string;
  email: string;
  login: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phoneNumber?: string;
}

export interface AllegroInvoiceCompanyId {
  type?: string;
  value?: string;
}

export interface AllegroInvoiceCompany {
  name?: string;
  ids?: AllegroInvoiceCompanyId[];
  taxId?: string;
  vatPayerStatus?: string;
}

export interface AllegroInvoiceNaturalPerson {
  firstName?: string;
  lastName?: string;
}

export interface AllegroInvoiceAddress {
  street?: string;
  city?: string;
  zipCode?: string;
  countryCode?: string;
  company?: AllegroInvoiceCompany;
  naturalPerson?: AllegroInvoiceNaturalPerson;
}

export interface AllegroInvoice {
  required?: boolean;
  address?: AllegroInvoiceAddress;
  dueDate?: string;
  features?: string[];
}

export interface AllegroPayment {
  id: string;
  type: string;
  provider?: string;
  finishedAt?: string;
  paidAmount?: AllegroPrice;
  reconciliation?: { amount?: AllegroPrice };
}

export interface AllegroDelivery {
  address?: {
    firstName?: string;
    lastName?: string;
    street?: string;
    city?: string;
    zipCode?: string;
    countryCode?: string;
    companyName?: string;
  };
  method?: { id?: string; name?: string };
  cost?: AllegroPrice;
  pickupPoint?: {
    id?: string;
    name?: string;
    address?: AllegroPickupPointAddress;
  };
}

export interface AllegroFulfillment {
  provider?: { id?: "SELLER" | "ALLEGRO" | string };
  status?: string;
  shipmentSummary?: { lineItemsSent?: string };
}

export interface AllegroSummary {
  totalToPay?: AllegroPrice;
}

export interface AllegroOrder {
  id: string;
  revision?: string;
  marketplace?: { id?: string };
  status: string;
  buyer: AllegroBuyer;
  invoice?: AllegroInvoice;
  lineItems: AllegroLineItem[];
  payment: AllegroPayment;
  delivery: AllegroDelivery;
  fulfillment: AllegroFulfillment;
  summary: AllegroSummary;
  updatedAt: string;
  messageToSeller?: string;
}

export interface AllegroOrdersResponse {
  checkoutForms: AllegroOrder[];
  count: number;
  totalCount: number;
}

export interface MapAllegroOrderToDuplicateDraftOptions {
  allegroOrder: AllegroOrder;
  fallbackProduct: Product | null;
  channel: Pick<Channel, "id" | "currency">;
}

function parseAmount(price?: AllegroPrice): number {
  if (!price?.amount) {
    return 0;
  }

  const parsedValue = Number(price.amount);
  return Number.isFinite(parsedValue) ? Math.round(parsedValue * 100) : 0;
}

function buildFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .join(" ");
}

function buildBuyerName(buyer: AllegroBuyer): string {
  const fullName = buildFullName(buyer.firstName, buyer.lastName);

  if (fullName) {
    return fullName;
  }

  if (buyer.companyName?.trim()) {
    return buyer.companyName.trim();
  }

  return buyer.login || buyer.email;
}

function buildShippingAddress(order: AllegroOrder): Address | null {
  const address = order.delivery.address;
  if (!address) {
    return null;
  }

  const shippingName =
    buildFullName(address.firstName, address.lastName) ||
    buildBuyerName(order.buyer);

  return {
    name: shippingName,
    type: AddressTypeEnum.SHIPPING,
    companyName: address.companyName ?? "",
    street: address.street ?? "",
    zip: address.zipCode ?? "",
    city: address.city ?? "",
    country: address.countryCode ?? "PL",
    active: true,
  };
}

function resolveInvoiceTaxId(invoiceCompany?: AllegroInvoiceCompany): string {
  if (invoiceCompany?.taxId?.trim()) {
    return invoiceCompany.taxId.trim();
  }

  const nipIdentifier = invoiceCompany?.ids?.find(
    (identifier) =>
      identifier.type === "PL_NIP" && Boolean(identifier.value?.trim()),
  );

  if (nipIdentifier?.value?.trim()) {
    return nipIdentifier.value.trim();
  }

  const fallbackIdentifier = invoiceCompany?.ids?.find((identifier) =>
    Boolean(identifier.value?.trim()),
  );

  return fallbackIdentifier?.value?.trim() ?? "";
}

function buildBillingAddress(order: AllegroOrder): Address | null {
  const invoiceAddress = order.invoice?.address;

  if (!invoiceAddress) {
    return null;
  }

  const companyName = invoiceAddress.company?.name?.trim() ?? "";
  const naturalPersonName = buildFullName(
    invoiceAddress.naturalPerson?.firstName,
    invoiceAddress.naturalPerson?.lastName,
  );

  return {
    name: naturalPersonName || companyName || buildBuyerName(order.buyer),
    type: AddressTypeEnum.BILLING,
    nip: resolveInvoiceTaxId(invoiceAddress.company),
    companyName,
    street: invoiceAddress.street ?? "",
    zip: invoiceAddress.zipCode ?? "",
    city: invoiceAddress.city ?? "",
    country: invoiceAddress.countryCode ?? "PL",
    active: true,
  };
}

function mapShippingOption(methodName?: string): ShippingOptions {
  const normalizedMethodName = methodName?.trim().toLowerCase() ?? "";

  if (normalizedMethodName.includes("paczkomat")) {
    return ShippingOptions.PACZKOMATY_INPOST;
  }

  if (
    normalizedMethodName.includes("inpost") &&
    normalizedMethodName.includes("kurier")
  ) {
    return ShippingOptions.INPOST;
  }

  if (normalizedMethodName.includes("dhl")) {
    return ShippingOptions.DHL;
  }

  if (normalizedMethodName.includes("dpd")) {
    return ShippingOptions.DPD;
  }

  if (normalizedMethodName.includes("fedex")) {
    return ShippingOptions.FEDEX;
  }

  return ShippingOptions.CUSTOM;
}

function buildSpecialNotes(order: AllegroOrder): string {
  const notes = [order.messageToSeller?.trim()].filter(
    (value): value is string => Boolean(value),
  );

  if (order.delivery.pickupPoint?.name) {
    notes.push(`Punkt odbioru Allegro: ${order.delivery.pickupPoint.name}`);
  }

  const pickupPointAddress = order.delivery.pickupPoint?.address;
  if (typeof pickupPointAddress === "string" && pickupPointAddress.trim()) {
    notes.push(`Adres punktu odbioru Allegro: ${pickupPointAddress.trim()}`);
  } else if (pickupPointAddress && typeof pickupPointAddress === "object") {
    const formattedAddress = [
      pickupPointAddress.street,
      [pickupPointAddress.zipCode, pickupPointAddress.city]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" "),
      pickupPointAddress.countryCode,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(", ");

    if (formattedAddress) {
      notes.push(`Adres punktu odbioru Allegro: ${formattedAddress}`);
    }
  }

  return notes.join("\n\n");
}

function derivePaymentStatus(order: AllegroOrder): PaymentStatus {
  if (order.payment.finishedAt) {
    return PaymentStatus.COMPLETED;
  }

  const paidAmount = parseAmount(order.payment.paidAmount);
  const totalToPay = parseAmount(order.summary.totalToPay);

  if (paidAmount > 0 && totalToPay > 0 && paidAmount < totalToPay) {
    return PaymentStatus.PARTIALLY_PAID;
  }

  if (paidAmount > 0) {
    return PaymentStatus.COMPLETED;
  }

  return PaymentStatus.PENDING;
}

function deriveCurrency(
  order: AllegroOrder,
  channel: Pick<Channel, "currency">,
): CurrencyCode {
  // Allegro settlement currently imports prices only when Allegro reports PLN;
  // non-PLN marketplaces fall back to the channel currency until provider
  // support is expanded.
  return order.summary.totalToPay?.currency === CurrencyEnum.PLN
    ? CurrencyEnum.PLN
    : channel.currency;
}

export function createAllegroExternalSource(
  allegroOrder: AllegroOrder,
): ExternalOrderSource {
  const fulfillmentProvider =
    allegroOrder.fulfillment?.provider?.id === "ALLEGRO" ? "ALLEGRO" : "SELLER";

  return {
    provider: "ALLEGRO",
    externalOrderId: allegroOrder.id,
    externalOrderRevision: allegroOrder.revision,
    externalBuyerId: allegroOrder.buyer.id,
    externalBuyerLogin: allegroOrder.buyer.login,
    externalPaymentId: allegroOrder.payment.id,
    externalDeliveryMethodId: allegroOrder.delivery.method?.id,
    externalDeliveryMethodName: allegroOrder.delivery.method?.name,
    externalStatus: allegroOrder.status,
    externalFulfillmentStatus: allegroOrder.fulfillment?.status,
    externalPaymentStatus: allegroOrder.payment.finishedAt ? "PAID" : "UNPAID",
    externalUpdatedAt: allegroOrder.updatedAt,
    fulfillmentProvider,
    marketplaceId: allegroOrder.marketplace?.id,
    pickupPointId: allegroOrder.delivery.pickupPoint?.id,
    pickupPointName: allegroOrder.delivery.pickupPoint?.name,
    externallyFulfilled: fulfillmentProvider === "ALLEGRO",
    importedAt: Timestamp.now(),
    lastSyncedAt: Timestamp.now(),
    lineItems: allegroOrder.lineItems.map((lineItem) => ({
      externalLineItemId: lineItem.id,
      externalOfferId: lineItem.offer.id,
      externalOfferName: lineItem.offer.name,
    })),
  };
}

export function mapAllegroOrderToDuplicateDraft({
  allegroOrder,
  fallbackProduct,
  channel,
}: MapAllegroOrderToDuplicateDraftOptions): Order {
  const timestampNow = Timestamp.now();
  const shippingPrice = parseAmount(allegroOrder.delivery.cost);
  const billingAddress = buildBillingAddress(allegroOrder);
  const invoiceRequested = Boolean(allegroOrder.invoice?.required);
  const items = allegroOrder.lineItems.map((lineItem) => {
    const unitPrice = parseAmount(lineItem.price);
    const totalPrice = unitPrice * lineItem.quantity;

    return {
      id: lineItem.id,
      name: lineItem.offer.name,
      product: fallbackProduct
        ? {
            ...fallbackProduct,
            disablePriceFetch: true,
            provider:
              fallbackProduct.provider &&
              fallbackProduct.provider.type &&
              fallbackProduct.provider.productId
                ? fallbackProduct.provider
                : { type: "KONFI", productId: fallbackProduct.id },
          }
        : null,
      description: lineItem.offer.name,
      combination: "",
      calculatedCombination: "",
      volume: 0,
      customFormat: false,
      totalPrice,
      customPrice: unitPrice,
      width: 0,
      height: 0,
      quantity: lineItem.quantity,
      discount: new Discount().object,
      unit: Unit.PCS,
    };
  });

  const deadlineDate = new Date(
    allegroOrder.updatedAt || timestampNow.toDate(),
  );
  const deadlineString = deadlineDate.toISOString().slice(0, 10);
  const paymentStatus = derivePaymentStatus(allegroOrder);
  const orderStatus = OrderStatus.NEW;

  return {
    id: allegroOrder.id,
    name: `Allegro ${allegroOrder.id}`,
    number: 0,
    customer: buildBuyerName(allegroOrder.buyer),
    contact: {
      name: buildBuyerName(allegroOrder.buyer),
      email: allegroOrder.buyer.email,
      phone: allegroOrder.buyer.phoneNumber,
      active: true,
    } as Contact,
    email: allegroOrder.buyer.email,
    externalSource: createAllegroExternalSource(allegroOrder),
    shipping: buildShippingAddress(allegroOrder),
    shippingOption: mapShippingOption(allegroOrder.delivery.method?.name),
    shippingPrice,
    shippingPriceDiscount: new Discount().object,
    invoice: invoiceRequested,
    billing: billingAddress,
    exactTime: false,
    deadlineString,
    deadline: Timestamp.fromDate(deadlineDate),
    totalPrice:
      items.reduce((sum, item) => sum + item.totalPrice, 0) + shippingPrice,
    totalPriceDiscount: new Discount().object,
    currency: deriveCurrency(allegroOrder, channel),
    specialNotes: buildSpecialNotes(allegroOrder),
    items,
    fulfilledItems: [],
    inProgressItems: [],
    priorityItems: [],
    difficulty: 5,
    priority: 2,
    status: orderStatus,
    paymentType: PaymentType.ALLEGRO,
    paymentStatus,
    filesStatus: OrderFilesStatus.WAITING_FOR_FILES,
    activities: [
      {
        type: "ORDER_STATUS_UPDATE",
        value: orderStatus,
        timestamp: timestampNow,
      },
      {
        type: "PAYMENT_STATUS_UPDATE",
        value: paymentStatus,
        timestamp: timestampNow,
      },
    ],
    messages: [],
    keywords: [
      allegroOrder.id,
      allegroOrder.buyer.login,
      allegroOrder.buyer.email,
      buildBuyerName(allegroOrder.buyer),
    ].filter((value): value is string => Boolean(value)),
    isFromStore: false,
    isTest: false,
    createdBy: { id: "", name: "" },
    createdAt: timestampNow,
    updatedBy: { id: "", name: "" },
    updatedAt: timestampNow,
    active: true,
    channelId: channel.id,
    appliedPromotionCodes: [],
    printingMethods: [],
    carriedOutBy: [],
    mailLink: "",
    sendStatusChangeEmail: false,
  };
}
