"use client";

import { NestedProduct, Price, Product } from "@konfi/types";

/** External price fetcher signature for provider-backed products. */
export type ExternalPriceFetcher = (
  product: Product | NestedProduct,
  calculatedCombination: string,
  channelId?: string,
) => Promise<Price[] | undefined>;

/**
 * Provider registry for external price fetchers. Can be extended at runtime per app.
 */
const providerFetchers: Record<string, ExternalPriceFetcher> = {};

export function registerProviderFetcher(
  type: string,
  fetcher: ExternalPriceFetcher,
) {
  providerFetchers[type] = fetcher;
}

export async function fetchExternalPrices(
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
): Promise<Price[] | undefined> {
  if (!product || !(product as Product).provider) return undefined;
  const provider = (product as Product).provider;
  if (!provider || !provider.type) return undefined;
  const fetcher = provider && providerFetchers[provider.type];
  if (!fetcher) return undefined;
  return fetcher(product, calculatedCombination, channelId);
}
