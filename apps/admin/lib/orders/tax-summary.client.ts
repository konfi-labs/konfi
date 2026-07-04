import { loadTaxSettings } from "@/lib/tax-settings.client";
import type { Order, OrderItem } from "@konfi/types";
import { buildOrderTaxSummary } from "@konfi/utils";

export async function buildAdminOrderTaxSummary(params: {
  channelId: string;
  country?: string | null;
  currency: Order["currency"];
  items: readonly OrderItem[];
  shippingGrossAmount: number;
}): Promise<Order["taxSummary"]> {
  try {
    const taxSettings = await loadTaxSettings(params.channelId);

    return buildOrderTaxSummary({
      country: params.country,
      currency: params.currency,
      items: params.items,
      settings: taxSettings,
      shippingGrossAmount: params.shippingGrossAmount,
    });
  } catch (error) {
    console.error("Failed to build admin order tax summary:", error);
    return undefined;
  }
}
