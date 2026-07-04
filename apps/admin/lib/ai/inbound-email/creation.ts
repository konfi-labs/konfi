import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  CurrencyEnum,
  Discount,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  ShippingOptions,
  type Channel,
  type FormattedOrderItem,
  type NestedCustomer,
  type NestedMember,
  type OrderCreate,
  type QuoteCreate,
  type Settings,
  type TaxSettings,
} from "@konfi/types";
import {
  allocateOrderNumberInTransaction,
  QUOTE_COUNTER_DOCUMENT_ID,
  withTenantOwned,
} from "@konfi/firebase";
import {
  buildOrderTaxSummary,
  formatMailLink,
  generateKeywords,
  isShippingFree,
  TAX_SETTINGS_DOC_ID,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { InboundEmailRecord, InboundRoutingDecision } from "./types";

function getDb() {
  return getAdminDb();
}

function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleanedEntry = removeUndefinedDeep(entry);
      if (cleanedEntry !== undefined) {
        cleaned[key] = cleanedEntry;
      }
    }
    return cleaned;
  }

  return value;
}

function sanitizeItems(
  items: readonly FormattedOrderItem[],
): FormattedOrderItem[] {
  return items.map((item) => ({
    ...item,
    product: {
      id: item.product?.id ?? "",
      name: item.product?.name ?? "",
      channelId: item.product?.channelId ?? "",
      spec: {
        images: item.product?.spec?.images ?? [],
      },
    },
  }));
}

function getCustomerName(customer: NestedCustomer | string) {
  return typeof customer === "string" ? customer : customer.name;
}

function getItemsSubtotalPrice(items: readonly FormattedOrderItem[]) {
  return Math.floor(
    items.reduce((total, item) => total + Number(item.totalPrice ?? 0), 0),
  );
}

function getItemsTotalPrice(
  items: readonly FormattedOrderItem[],
  shippingPrice: number,
) {
  return Math.floor(getItemsSubtotalPrice(items) + shippingPrice);
}

function calculateShippingPrice({
  items,
  settings,
  shippingOption,
}: {
  items: readonly FormattedOrderItem[];
  settings: Settings;
  shippingOption: string;
}) {
  return isShippingFree(
    getItemsSubtotalPrice(items),
    settings.freeShipping.enabled,
    settings.freeShipping.min,
  )
    ? 0
    : ((settings.shippingOptionsPrices as Record<string, number>)[
        shippingOption
      ] ?? 0);
}

async function loadChannelTaxSettings(
  channelId: string,
): Promise<TaxSettings | undefined> {
  try {
    const snapshot = await getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc(TAX_SETTINGS_DOC_ID)
      .get();

    return snapshot.exists
      ? (snapshot.data() as TaxSettings | undefined)
      : undefined;
  } catch (error) {
    console.error("Failed to load inbound order tax settings:", error);
    return undefined;
  }
}

export function buildInboundSpecialNotes({
  decision,
  record,
}: {
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
}) {
  return [
    record.routingDecision?.model?.specialNotes,
    decision.model?.specialNotes,
    `Imported from inbound email ${record.resendEmailId}.`,
    `Email subject: ${record.subject || "(no subject)"}`,
    `Routing rationale: ${decision.rationale}`,
    decision.missingInformation.length > 0
      ? `Missing information: ${decision.missingInformation.join(", ")}`
      : undefined,
  ]
    .filter((line): line is string => Boolean(line?.trim()))
    .join("\n");
}

function getSafeDeadlineDate(deadlineString: string | null | undefined) {
  if (!deadlineString?.trim()) {
    return new Date();
  }

  const parsed = new Date(deadlineString);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function buildInboundQuoteCreate({
  channel,
  decision,
  record,
  settings,
}: {
  channel: Pick<Channel, "currency" | "id">;
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  settings: Settings;
}): QuoteCreate {
  if (!decision.customer || !decision.contact) {
    throw new Error(
      "Cannot create inbound quote without exact customer match.",
    );
  }

  const shippingOption =
    decision.model?.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION;
  const items = sanitizeItems(decision.items);
  const shippingPrice = calculateShippingPrice({
    items,
    settings,
    shippingOption,
  });
  const now = Timestamp.now();

  return {
    active: true,
    appliedPromotionCodes: [],
    contact: decision.contact,
    createdAt: now,
    createdBy: record.createdBy,
    currency: channel.currency ?? CurrencyEnum.PLN,
    customer: decision.customer,
    id: "",
    items,
    keywords: generateKeywords(getCustomerName(decision.customer)),
    mailLink: formatMailLink(record.resendEmailId),
    name: "",
    number: 0,
    shippingOption,
    shippingPrice,
    specialNotes: buildInboundSpecialNotes({ decision, record }),
    totalPrice: getItemsTotalPrice(items, shippingPrice),
    updatedAt: now,
    updatedBy: record.createdBy,
  };
}

export function buildInboundOrderCreate({
  channel,
  decision,
  record,
  settings,
  taxSettings,
}: {
  channel: Pick<Channel, "currency" | "id">;
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  settings: Settings;
  taxSettings?: TaxSettings | null;
}): OrderCreate {
  if (!decision.customer || !decision.contact || !decision.model) {
    throw new Error(
      "Cannot create inbound order without complete routing data.",
    );
  }

  if (!decision.model.paymentType) {
    throw new Error(
      "Cannot create inbound order without explicit payment type.",
    );
  }

  if (
    !decision.model.shippingOption ||
    (decision.model.shippingOption !== ShippingOptions.PERSONAL_COLLECTION &&
      !decision.model.shippingAddress)
  ) {
    throw new Error("Cannot create inbound order without shipping details.");
  }

  const items = sanitizeItems(decision.items);
  const shippingPrice = calculateShippingPrice({
    items,
    settings,
    shippingOption: decision.model.shippingOption,
  });
  const now = Timestamp.now();
  const customerName = getCustomerName(decision.customer);
  const currency = channel.currency ?? CurrencyEnum.PLN;
  const taxSummary = buildOrderTaxSummary({
    country:
      decision.model.billingAddress?.country ??
      decision.model.shippingAddress?.country,
    currency,
    items: decision.items,
    settings: taxSettings,
    shippingGrossAmount: shippingPrice,
  });

  return {
    active: true,
    activities: [
      {
        timestamp: now,
        type: "ORDER_STATUS_UPDATE",
        value: OrderStatus.NEW,
      },
      {
        timestamp: now,
        type: "PAYMENT_STATUS_UPDATE",
        value: PaymentStatus.NEW,
      },
    ],
    anonymousPackageLabelAddress: null,
    anonymousPackageShipping: false,
    appliedPromotionCodes: [],
    billing: decision.model.invoiceRequested
      ? decision.model.billingAddress
      : null,
    carriedOutBy: [],
    channelId: channel.id,
    contact: decision.contact,
    createdAt: now,
    createdBy: record.createdBy,
    currency,
    customer: decision.customer,
    deadline: Timestamp.fromDate(
      getSafeDeadlineDate(decision.model.deadlineString),
    ),
    deadlineString: decision.model.deadlineString ?? "",
    designatedPickupAreaId: "",
    difficulty: 5,
    email: decision.contact.email ?? "",
    exactTime: false,
    externalSource: null,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    fulfilledItems: [],
    id: "",
    inProgressItems: [],
    invoice: decision.model.invoiceRequested,
    isFromStore: false,
    isTest: false,
    items,
    keywords: generateKeywords(customerName),
    mailLink: formatMailLink(record.resendEmailId),
    messages: [],
    name: "",
    number: 0,
    paymentDocumentId: "",
    paymentStatus: PaymentStatus.NEW,
    paymentType: decision.model.paymentType,
    priority: 2,
    priorityItems: [],
    sendStatusChangeEmail: false,
    shipping: decision.model.shippingAddress,
    shippingOption: decision.model.shippingOption,
    shippingPrice,
    shippingPriceDiscount: new Discount().object,
    specialNotes: buildInboundSpecialNotes({ decision, record }),
    status: OrderStatus.NEW,
    totalPrice: getItemsTotalPrice(items, shippingPrice),
    totalPriceDiscount: new Discount().object,
    ...(taxSummary ? { taxSummary } : {}),
    updatedAt: now,
    updatedBy: record.createdBy,
  };
}

export async function createInboundQuote({
  channel,
  decision,
  record,
  settings,
  tenantContext,
}: {
  channel: Pick<Channel, "currency" | "id">;
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  settings: Settings;
  tenantContext: TenantContext;
}) {
  const db = getDb();
  const collectionRef = db
    .collection("channels")
    .doc(channel.id)
    .collection("quotes");
  const quote = buildInboundQuoteCreate({
    channel,
    decision,
    record,
    settings,
  });
  // Allocate the quote number transactionally against the shared per-channel
  // counter so concurrent inbound-email quote creations cannot duplicate it.
  const docRef = collectionRef.doc();
  await db.runTransaction(async (transaction) => {
    const { counterRef, nextNumber, orderNumber } =
      await allocateOrderNumberInTransaction(transaction, collectionRef, {
        counterDocumentId: QUOTE_COUNTER_DOCUMENT_ID,
      });

    // `counterRef` is the admin SDK DocumentReference produced from
    // `collectionRef`; the helper returns it via its structural type, so narrow
    // it back to the transaction's expected reference type here.
    transaction.set(
      counterRef as unknown as Parameters<typeof transaction.set>[0],
      withTenantOwned({ nextNumber }, tenantContext, "inbound quote counter"),
      { merge: true },
    );
    transaction.set(
      docRef,
      removeUndefinedDeep(
        withTenantOwned(
          {
            ...(quote as unknown as Record<string, unknown>),
            id: docRef.id,
            number: orderNumber,
          },
          tenantContext,
          "inbound quote",
        ),
      ) as Record<string, unknown>,
    );
  });
  const quoteId = docRef.id;

  await db
    .collection("inboundEmails")
    .doc(record.id)
    .set(
      withTenantOwned(
        {
          quoteId,
          status: "quote-created",
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email quote status",
      ),
      { merge: true },
    );

  return quoteId;
}

export async function createInboundOrder({
  channel,
  decision,
  record,
  settings,
  tenantContext,
}: {
  channel: Pick<Channel, "currency" | "id">;
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  settings: Settings;
  tenantContext: TenantContext;
}) {
  const db = getDb();
  const collectionRef = db
    .collection("channels")
    .doc(channel.id)
    .collection("orders");
  const taxSettings = await loadChannelTaxSettings(channel.id);
  const order = buildInboundOrderCreate({
    channel,
    decision,
    record,
    settings,
    taxSettings,
  });
  // Allocate the order number transactionally against the shared per-channel
  // counter so concurrent store + inbound-email creations cannot duplicate it.
  const docRef = collectionRef.doc();
  await db.runTransaction(async (transaction) => {
    const { counterRef, nextNumber, orderNumber } =
      await allocateOrderNumberInTransaction(transaction, collectionRef);

    // `counterRef` is the admin SDK DocumentReference produced from
    // `collectionRef`; the helper returns it via its structural type, so narrow
    // it back to the transaction's expected reference type here.
    transaction.set(
      counterRef as unknown as Parameters<typeof transaction.set>[0],
      withTenantOwned({ nextNumber }, tenantContext, "inbound order counter"),
      { merge: true },
    );
    transaction.set(
      docRef,
      removeUndefinedDeep(
        withTenantOwned(
          {
            ...(order as unknown as Record<string, unknown>),
            id: docRef.id,
            number: orderNumber,
          },
          tenantContext,
          "inbound order",
        ),
      ) as Record<string, unknown>,
    );
  });
  const orderId = docRef.id;

  if (decision.customer?.id) {
    await db
      .collection("customers")
      .doc(decision.customer.id)
      .set(
        withTenantOwned(
          {
            orders: FieldValue.arrayUnion(orderId),
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound customer order link",
        ),
        { merge: true },
      );
  }

  await db
    .collection("inboundEmails")
    .doc(record.id)
    .set(
      withTenantOwned(
        {
          orderId,
          status: "order-created",
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email order status",
      ),
      { merge: true },
    );

  return orderId;
}

export function createSystemInboundMember(): NestedMember {
  return {
    id: "inbound-email-agent",
    name: "Inbound email agent",
  };
}
