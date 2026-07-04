"use client";

import { fetchPricesForProduct } from "@konfi/components";
import { PriceTypeEnum, type OrderItem, type Product } from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import type { Firestore } from "firebase/firestore";

type CartPriceEntry = {
  item: OrderItem;
  product: Product;
};

type DynamicPricingBatchResult = {
  error?: string;
  prices?: Product["prices"];
};

type DynamicPricingBatchResponse = {
  results?: DynamicPricingBatchResult[];
};

function createCartItemPriceKey(item: OrderItem, index: number) {
  return item.id || `${item.product?.id ?? "unknown"}:${index}`;
}

function createDynamicPricingRequest(entry: CartPriceEntry) {
  const { item, product } = entry;

  return {
    calculatedCombination: item.calculatedCombination ?? DEFAULT_COMBINATION,
    channelId: product.channelId,
    combination: item.combination ?? null,
    customFormat: item.customFormat ?? false,
    height: item.height,
    pageCount: item.pageCount,
    priceOffsets: product.priceOffsets ?? null,
    productId: product.id,
    quantity: item.quantity,
    volume: item.volume ?? undefined,
    width: item.width,
  };
}

async function fetchDynamicPricesForCartEntries(
  entries: CartPriceEntry[],
): Promise<Array<Product["prices"] | undefined>> {
  if (entries.length === 0) {
    return [];
  }

  try {
    const response = await fetch("/api/products/dynamic-pricing/batch", {
      body: JSON.stringify({
        items: entries.map(createDynamicPricingRequest),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return entries.map(() => undefined);
    }

    const payload = (await response.json()) as DynamicPricingBatchResponse;
    const results = payload.results ?? [];

    return entries.map((_, index) => results[index]?.prices);
  } catch (error) {
    console.error("Error fetching batched dynamic cart prices:", error);
    return entries.map(() => undefined);
  }
}

export async function fetchPricesForCartItems(
  firestore: Firestore,
  entries: CartPriceEntry[],
): Promise<Map<string, Product["prices"] | undefined>> {
  const results = new Map<string, Product["prices"] | undefined>();
  const dynamicEntries = entries.filter(
    ({ product }) => product.priceType === PriceTypeEnum.DYNAMIC,
  );
  const dynamicEntryIndexes = new Map<CartPriceEntry, number>(
    dynamicEntries.map((entry, index) => [entry, index]),
  );
  const dynamicPrices = await fetchDynamicPricesForCartEntries(dynamicEntries);

  await Promise.all(
    entries.map(async (entry, index) => {
      const key = createCartItemPriceKey(entry.item, index);
      const dynamicIndex = dynamicEntryIndexes.get(entry);

      if (dynamicIndex !== undefined) {
        results.set(key, dynamicPrices[dynamicIndex]);
        return;
      }

      results.set(
        key,
        await fetchPricesForProduct(
          firestore,
          entry.product,
          entry.item.calculatedCombination ?? DEFAULT_COMBINATION,
          undefined,
          entry.item.pageCount,
          {
            combination: entry.item.combination,
            customFormat: entry.item.customFormat,
            height: entry.item.height,
            quantity: entry.item.quantity,
            volume: entry.item.volume ?? undefined,
            width: entry.item.width,
          },
        ),
      );
    }),
  );

  return results;
}
