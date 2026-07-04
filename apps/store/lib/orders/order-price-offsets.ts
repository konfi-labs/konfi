import type { OrderItem, Price, Product } from "@konfi/types";
import { applyProductPriceOffsets, DEFAULT_COMBINATION } from "@konfi/utils";

export function applyOrderItemProductPriceOffsets({
  item,
  prices,
  product,
  selectedAttributeOptions,
}: {
  item: Pick<OrderItem, "calculatedCombination" | "pageCount" | "volume">;
  prices: Price[];
  product: Product;
  selectedAttributeOptions?: Record<string, string>;
}): Price[] {
  return applyProductPriceOffsets({
    calculatedCombination: item.calculatedCombination ?? DEFAULT_COMBINATION,
    pageCount: item.pageCount,
    prices,
    product,
    selectedAttributeOptions,
    volume: item.volume ?? undefined,
  });
}
