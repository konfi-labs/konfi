import { CurrencyEnum, DEFAULT_LOCALE } from "@konfi/types";
import { formatPrice } from "@konfi/utils";
import type { TFunction } from "i18next";
import type {
  AgentOrderItem,
  QuoteAgentData,
} from "@/lib/ai/durable-agents/types";
import type { InboundRoutingDecision } from "./types";

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getAgentItemName(item: AgentOrderItem) {
  return item.productName || item.description || item.productId || item.id;
}

function getAgentItemOrderedAmount(item: AgentOrderItem) {
  return isPositiveFiniteNumber(item.volume) ? item.volume : item.quantity;
}

function getItemsSubtotalPrice(items: readonly AgentOrderItem[]) {
  return Math.floor(
    items.reduce((total, item) => total + Number(item.totalPrice ?? 0), 0),
  );
}

function formatInboundPrice({
  currency,
  locale,
  value,
}: {
  currency: CurrencyEnum;
  locale: string;
  value: number;
}) {
  return formatPrice(value, currency, undefined, undefined, locale);
}

export function buildInboundPricedCustomerDraft({
  collectedData,
  currency = CurrencyEnum.PLN,
  decision,
  locale = DEFAULT_LOCALE,
  t,
}: {
  collectedData?: QuoteAgentData;
  currency?: CurrencyEnum;
  decision: InboundRoutingDecision;
  locale?: string;
  t: TFunction;
}) {
  const items = collectedData?.items ?? [];
  const pricedItems = items.filter((item) =>
    isPositiveFiniteNumber(item.totalPrice),
  );

  if (pricedItems.length === 0) {
    return null;
  }

  const subtotal = getItemsSubtotalPrice(pricedItems);
  const shippingPrice = collectedData?.shippingPrice ?? 0;
  const totalPrice =
    collectedData?.totalPrice ?? Math.floor(subtotal + shippingPrice);
  const formatDraftPrice = (value: number) =>
    formatInboundPrice({ currency, locale, value });
  const lines = [
    t("agents.inboundEmail.customerDraft.pricedQuoteIntro", {
      defaultValue: "Hello, we prepared the quote:",
    }),
    ...pricedItems.map((item) =>
      t("agents.inboundEmail.customerDraft.itemLine", {
        defaultValue: "- {{name}}, volume {{amount}}: {{price}}",
        amount: getAgentItemOrderedAmount(item),
        name: getAgentItemName(item),
        price: formatDraftPrice(item.totalPrice),
      }),
    ),
    t("agents.inboundEmail.customerDraft.itemsSubtotal", {
      defaultValue: "Items subtotal: {{price}}",
      price: formatDraftPrice(subtotal),
    }),
  ];

  if (isPositiveFiniteNumber(shippingPrice)) {
    lines.push(
      t("agents.inboundEmail.customerDraft.shipping", {
        defaultValue: "Shipping: {{price}}",
        price: formatDraftPrice(shippingPrice),
      }),
      t("agents.inboundEmail.customerDraft.total", {
        defaultValue: "Total: {{price}}",
        price: formatDraftPrice(totalPrice),
      }),
    );
  }

  lines.push(
    decision.missingInformation.length > 0
      ? t("agents.inboundEmail.customerDraft.missingDetails", {
          defaultValue: "To finalize, we still need: {{details}}.",
          details: decision.missingInformation.join(", "),
        })
      : t("agents.inboundEmail.customerDraft.readyForReview", {
          defaultValue: "If everything is correct, we can continue.",
        }),
  );

  return lines.join("\n");
}

export function buildInboundCustomerDraft({
  collectedData,
  currency = CurrencyEnum.PLN,
  decision,
  locale = DEFAULT_LOCALE,
  t,
}: {
  collectedData?: QuoteAgentData;
  currency?: CurrencyEnum;
  decision: InboundRoutingDecision;
  locale?: string;
  t: TFunction;
}) {
  const aiGeneratedDraft = decision.model?.responseDraft.body.trim();

  if (aiGeneratedDraft) {
    return aiGeneratedDraft;
  }

  return buildInboundPricedCustomerDraft({
    collectedData,
    currency,
    decision,
    locale,
    t,
  });
}
