import type { Price } from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import { normalizeExternalDeliveryTime } from "./delivery-time";

const DEFAULT_IMPORTED_DELIVERY_TIME_DAYS = 2;

export type ImportedMatrixFallbackPriceRange = {
  deliveryTime?: number;
  quantity: number;
  price: number;
};

function getResolvedImportedDeliveryTime(deliveryTime?: number): number {
  return (
    normalizeExternalDeliveryTime(deliveryTime) ??
    DEFAULT_IMPORTED_DELIVERY_TIME_DAYS
  );
}

export function buildImportedMatrixRangeFallbackPrices(options: {
  currency: Price["currency"];
  priceConfigurationsCount: number;
  priceRanges: ImportedMatrixFallbackPriceRange[];
  targetCombinationIds: string[];
}): Price[] {
  const {
    currency,
    priceConfigurationsCount,
    priceRanges,
    targetCombinationIds,
  } = options;

  if (priceConfigurationsCount > 0 || priceRanges.length === 0) {
    return [];
  }

  const resolvedCombinationIds =
    targetCombinationIds.length > 0
      ? targetCombinationIds
      : [DEFAULT_COMBINATION];

  return resolvedCombinationIds.flatMap((combinationId) =>
    priceRanges.map((range) => ({
      combination: {
        id: combinationId,
        active: true,
        customFormat: false,
      },
      volume: {
        value: range.quantity,
        deliveryTime: getResolvedImportedDeliveryTime(range.deliveryTime),
      },
      currency,
      value: range.price,
    })),
  );
}
