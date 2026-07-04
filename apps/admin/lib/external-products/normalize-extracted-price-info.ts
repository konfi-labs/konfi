import { resolveExternalDeliveryTime } from "@/lib/external-products/delivery-time";
import type { ExternalProduct } from "@konfi/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeExtractedExternalPriceInfo(
  priceInfo: unknown,
): ExternalProduct["priceInfo"] | undefined {
  if (!isRecord(priceInfo)) {
    return undefined;
  }

  const currency = normalizeOptionalString(priceInfo.currency);
  const priceText = normalizeOptionalString(priceInfo.priceText);
  const priceRanges = Array.isArray(priceInfo.priceRanges)
    ? priceInfo.priceRanges.flatMap((range) => {
        if (!isRecord(range)) {
          return [];
        }

        const deliveryTime = resolveExternalDeliveryTime(range.deliveryTime);
        const price = parseFiniteNumber(range.price);
        const quantity = parseFiniteNumber(range.quantity);
        const unit = normalizeOptionalString(range.unit);

        if (
          deliveryTime === undefined &&
          price === undefined &&
          quantity === undefined &&
          unit === undefined
        ) {
          return [];
        }

        return [
          {
            ...(deliveryTime !== undefined ? { deliveryTime } : {}),
            ...(price !== undefined ? { price } : {}),
            ...(quantity !== undefined ? { quantity } : {}),
            ...(unit ? { unit } : {}),
          },
        ];
      })
    : undefined;

  if (!currency && !priceText && !priceRanges?.length) {
    return undefined;
  }

  return {
    ...(currency ? { currency } : {}),
    ...(priceText ? { priceText } : {}),
    ...(priceRanges?.length ? { priceRanges } : {}),
  };
}
