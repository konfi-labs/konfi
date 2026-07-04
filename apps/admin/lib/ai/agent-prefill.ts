import type {
  AgentOrderItem,
  QuoteAgentData,
} from "@/lib/ai/durable-agents/types";
import type { FormattedOrderItem } from "@konfi/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksLikeQuoteAgentData(value: unknown): value is QuoteAgentData {
  if (!isRecord(value)) {
    return false;
  }

  return [
    "customer",
    "contact",
    "items",
    "paymentType",
    "shippingOption",
    "specialNotes",
    "totalPrice",
    "shippingPrice",
  ].some((key) => key in value);
}

export function extractQuoteAgentData(
  value: unknown,
): QuoteAgentData | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result = isRecord(value.result) ? value.result : undefined;

  const candidates: unknown[] = [
    value,
    result,
    value.collectedData,
    value.quoteData,
    value.orderData,
    result?.collectedData,
    result?.quoteData,
    result?.orderData,
  ];

  return candidates.find(looksLikeQuoteAgentData) as QuoteAgentData | undefined;
}

export function mapAgentItemsToFormattedOrderItems(
  items: AgentOrderItem[],
  channelId?: string,
): FormattedOrderItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.productName ?? item.description ?? "",
    product: {
      id: item.productId,
      name: item.productName,
      channelId,
      spec: {
        images: [],
      },
      ...item.productSnapshot,
    },
    description: item.description ?? item.productName,
    combination: item.calculatedCombination ?? undefined,
    calculatedCombination: item.calculatedCombination ?? undefined,
    volume: item.volume,
    customFormat: item.customFormat,
    totalPrice: item.totalPrice ?? 0,
    customPrice: item.customPrice ?? null,
    width: item.width,
    height: item.height,
    quantity: item.quantity ?? 1,
    customSizes: item.customSizes,
    discount: item.discount,
    unit: item.unit,
  }));
}
