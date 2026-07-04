import type { OrderItem, TaxSummarySnapshot } from "@konfi/types";
import { minorToMajor } from "@konfi/utils";

/**
 * Extract the original Fakturownia product ID from a Konfi Product.
 * Returns the raw numeric/string ID without the `fk_` prefix when possible.
 */
export function extractFakturowniaProductId(
  product?: {
    id?: string;
    provider?: { type?: string; productId?: string };
  } | null,
): string | undefined {
  if (!product) return undefined;
  const providerType = product.provider?.type?.toUpperCase?.();
  const providerId = product.provider?.productId?.toString().trim();
  if (providerType === "FAKTUROWNIA" && providerId) return providerId;
  const id = product.id?.toString() || "";
  if (id.toLowerCase().startsWith("fk_")) return id.slice(3);
  return undefined;
}

function resolveInvoiceTaxRate(
  item: OrderItem,
  taxSummary?: TaxSummarySnapshot,
): number {
  if (taxSummary?.enabled !== true) {
    return 23;
  }

  const taxLine = taxSummary?.lines.find(
    (line) =>
      line.sourceType === "item" &&
      (line.sourceId === item.id || line.id === `item:${item.id}`),
  );

  return taxLine?.taxRatePercent ?? 23;
}

/**
 * Map an OrderItem to a Fakturownia invoice position payload.
 * Includes productId when the item comes from Fakturownia integration.
 */
export function mapOrderItemToInvoicePosition(
  item: OrderItem,
  taxSummary?: TaxSummarySnapshot,
) {
  const productId = extractFakturowniaProductId(
    item.product as unknown as {
      id?: string;
      provider?: { type?: string; productId?: string };
    } | null,
  );
  // Ensure positive quantity; default to 1 if invalid/zero to avoid API rejection
  const rawQuantity = Number(item.quantity);
  const quantity =
    Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

  // Determine unit (net) price in minor units (prefer explicit customPrice, fallback to product default)
  const unitMinor =
    typeof item.customPrice === "number" && Number.isFinite(item.customPrice)
      ? item.customPrice
      : (item.product as unknown as { defaultPrice?: { minorUnits?: number } })
          ?.defaultPrice?.minorUnits;

  // Prefer provided totalPrice; if absent, derive from unit * quantity
  const totalMinor =
    typeof item.totalPrice === "number" && Number.isFinite(item.totalPrice)
      ? item.totalPrice
      : typeof unitMinor === "number" && Number.isFinite(unitMinor)
        ? unitMinor * quantity
        : undefined;

  const totalPriceGross = minorToMajor(totalMinor);

  const position = {
    name: item.name || item.product?.name || "Unknown product",
    quantity,
    tax: resolveInvoiceTaxRate(item, taxSummary),
    totalPriceGross,
    description: item.description || item.calculatedCombination || undefined,
    productId: productId || undefined,
  };
  return position;
}
