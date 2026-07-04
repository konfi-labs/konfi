"use client";

import { NestedProduct, PriceTypeEnum, Product } from "@konfi/types";
import {
  applyProductPriceOffsets,
  buildDynamicPricesForSelection,
  DEFAULT_COMBINATION,
  getExactPageCountPriceSet,
  getPageCountSegment,
  getPageCountPricingMode,
  parseDynamicSelectionFromCombination,
  requiresRemoteDynamicPricingResolution,
  getSegmentedPageCountPriceSet,
  normalizePageCount,
  resolvePageCountConfigForSelection,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Firestore } from "firebase/firestore";
import { fetchExternalPrices } from "./provider-prices";

export type ConfiguredProductPrices = {
  pageCountStepPrices?: Product["prices"];
  prices?: Product["prices"];
};

export type DynamicPriceFetchOptions = {
  combination?: string | null;
  customFormat?: boolean;
  height?: number;
  quantity?: number;
  selectedAttributeOptions?: Record<string, string | number> | null;
  volume?: number;
  width?: number;
};

type DynamicPriceRouteResponse = {
  prices?: Product["prices"];
};

function applyEffectiveProductPrices(
  product: Product | NestedProduct | undefined,
  prices: Product["prices"] | undefined,
  calculatedCombination: string,
  pageCount?: number | null,
  options?: DynamicPriceFetchOptions,
): Product["prices"] | undefined {
  if (isUndefined(prices)) {
    return undefined;
  }

  return applyProductPriceOffsets({
    calculatedCombination,
    pageCount,
    prices,
    product,
    selectedAttributeOptions: options?.selectedAttributeOptions,
    volume: options?.volume,
  });
}

async function fetchPageCountPricesByCombination(
  firestore: Firestore,
  channelId: string,
  productId: string,
  pageCount: number,
  calculatedCombination: string,
): Promise<Product["prices"] | undefined> {
  const { getProductPageCountPriceByCalculatedCombination } =
    await import("@konfi/firebase");

  const priceData = await getProductPageCountPriceByCalculatedCombination(
    firestore,
    channelId,
    productId,
    pageCount,
    calculatedCombination,
  );

  if (priceData?.prices?.length) {
    return priceData.prices;
  }

  if (calculatedCombination !== DEFAULT_COMBINATION) {
    const defaultPriceData =
      await getProductPageCountPriceByCalculatedCombination(
        firestore,
        channelId,
        productId,
        pageCount,
        DEFAULT_COMBINATION,
      );

    if (defaultPriceData?.prices?.length) {
      return defaultPriceData.prices;
    }
  }

  return undefined;
}

/**
 * Fetches prices for a product from subcollection or embedded prices
 * Based on the pattern from Price.tsx component
 */
export async function fetchPricesForProduct(
  firestore: Firestore,
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
  pageCount?: number | null,
  options?: DynamicPriceFetchOptions,
): Promise<Product["prices"] | undefined> {
  if (isUndefined(product)) return;

  const resolvedCombination = calculatedCombination || DEFAULT_COMBINATION;
  const resolvedChannelId = channelId || product.channelId || "";
  const activePageCountConfig = resolvePageCountConfigForSelection(
    product.pageCount,
    options?.selectedAttributeOptions,
  );
  const pageCountPricingMode = getPageCountPricingMode(
    activePageCountConfig?.pricing,
  );

  if (product.priceType === PriceTypeEnum.DYNAMIC) {
    const explicitSelectedAttributeOptions = options?.selectedAttributeOptions
      ? Object.fromEntries(
          Object.entries(options.selectedAttributeOptions).flatMap(
            ([key, value]) => (typeof value === "string" ? [[key, value]] : []),
          ),
        )
      : {};
    const selectedAttributeOptions =
      Object.keys(explicitSelectedAttributeOptions).length > 0
        ? explicitSelectedAttributeOptions
        : parseDynamicSelectionFromCombination(product, options?.combination);

    if (
      product.dynamicPricing?.enabled &&
      !requiresRemoteDynamicPricingResolution(product.dynamicPricing)
    ) {
      return applyEffectiveProductPrices(
        product,
        buildDynamicPricesForSelection({
          calculatedCombination: resolvedCombination,
          config: product.dynamicPricing,
          context: {
            customFormat: options?.customFormat,
            height: options?.height,
            pageCount,
            quantity: options?.quantity,
            volume: options?.volume,
            width: options?.width,
          },
          currency: product.defaultPrice?.currency,
          product,
          selectedAttributeOptions,
        }),
        resolvedCombination,
        pageCount,
        {
          ...options,
          selectedAttributeOptions,
        },
      );
    }

    try {
      const response = await fetch("/api/products/dynamic-pricing", {
        body: JSON.stringify({
          calculatedCombination: resolvedCombination,
          channelId: resolvedChannelId,
          combination: options?.combination ?? null,
          customFormat: options?.customFormat ?? false,
          height: options?.height,
          pageCount,
          priceOffsets: product.priceOffsets ?? null,
          productId: product.id,
          quantity: options?.quantity,
          selectedAttributeOptions:
            Object.keys(selectedAttributeOptions).length > 0
              ? selectedAttributeOptions
              : null,
          volume: options?.volume,
          width: options?.width,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        return undefined;
      }

      const payload = (await response.json()) as DynamicPriceRouteResponse;
      return payload.prices;
    } catch (error) {
      console.error("Error fetching dynamic product prices:", error);
      return undefined;
    }
  }

  if (activePageCountConfig?.enabled && pageCountPricingMode === "exact") {
    const exactPriceSet = getExactPageCountPriceSet(
      pageCount,
      activePageCountConfig,
    );

    if (exactPriceSet?.prices?.length) {
      return applyEffectiveProductPrices(
        product,
        exactPriceSet.prices,
        resolvedCombination,
        pageCount,
        options,
      );
    }

    const resolvedPageCount = normalizePageCount(
      pageCount,
      activePageCountConfig,
    );

    if (typeof resolvedPageCount === "number") {
      try {
        const exactPrices = await fetchPageCountPricesByCombination(
          firestore,
          resolvedChannelId,
          product.id,
          resolvedPageCount,
          resolvedCombination,
        );

        if (exactPrices?.length) {
          return applyEffectiveProductPrices(
            product,
            exactPrices,
            resolvedCombination,
            pageCount,
            options,
          );
        }
      } catch (error) {
        console.error(
          "Error fetching exact page-count prices for product:",
          product?.id,
          error,
        );
      }
    }
  }

  if (activePageCountConfig?.enabled && pageCountPricingMode === "segmented") {
    const segmentedPriceSet = getSegmentedPageCountPriceSet(
      pageCount,
      activePageCountConfig,
    );

    if (segmentedPriceSet?.basePrices?.length) {
      return applyEffectiveProductPrices(
        product,
        segmentedPriceSet.basePrices,
        resolvedCombination,
        pageCount,
        options,
      );
    }

    const activeSegment = getPageCountSegment(pageCount, activePageCountConfig);

    if (
      activeSegment &&
      activeSegment.minimum !== activePageCountConfig.minimum
    ) {
      try {
        const segmentedBasePrices = await fetchPageCountPricesByCombination(
          firestore,
          resolvedChannelId,
          product.id,
          activeSegment.minimum,
          resolvedCombination,
        );

        if (segmentedBasePrices?.length) {
          return applyEffectiveProductPrices(
            product,
            segmentedBasePrices,
            resolvedCombination,
            pageCount,
            options,
          );
        }

        return undefined;
      } catch (error) {
        console.error(
          "Error fetching segmented page-count base prices for product:",
          product?.id,
          error,
        );
        return undefined;
      }
    }
  }

  // External provider prices (if a provider is registered for this product type)
  const external = await fetchExternalPrices(
    product,
    resolvedCombination,
    channelId,
  );
  if (external && external.length > 0) {
    return applyEffectiveProductPrices(
      product,
      external,
      resolvedCombination,
      pageCount,
      options,
    );
  }

  // For non-matrix products, return embedded prices
  if (
    !isEmpty(product.defaultPrice) &&
    product.priceType === PriceTypeEnum.SINGLE
  ) {
    return applyEffectiveProductPrices(
      product,
      product.defaultPrice ? [product.defaultPrice] : [],
      resolvedCombination,
      pageCount,
      options,
    );
  }

  // For matrix products, try subcollection first
  if (
    (product.priceType === PriceTypeEnum.MATRIX ||
      product.priceType === PriceTypeEnum.THRESHOLD) &&
    resolvedCombination
  ) {
    try {
      const { getProductPriceByCalculatedCombination } =
        await import("@konfi/firebase");

      // First try to get the specific combination
      const priceData = await getProductPriceByCalculatedCombination(
        firestore,
        resolvedChannelId,
        product.id,
        resolvedCombination,
      );

      if (priceData && priceData.prices) {
        return applyEffectiveProductPrices(
          product,
          priceData.prices,
          resolvedCombination,
          pageCount,
          options,
        );
      }

      // If specific combination not found, try default
      const defaultPriceData = await getProductPriceByCalculatedCombination(
        firestore,
        resolvedChannelId,
        product.id,
        DEFAULT_COMBINATION,
      );

      if (defaultPriceData && defaultPriceData.prices) {
        return applyEffectiveProductPrices(
          product,
          defaultPriceData.prices,
          resolvedCombination,
          pageCount,
          options,
        );
      }
    } catch (error) {
      console.error("Error fetching prices from subcollection:", error);
    }
  }

  // Fallback: check embedded prices for specific combination
  if (
    product.prices &&
    product.prices.length > 0 &&
    product.prices.find(
      (price) => price.combination?.id === resolvedCombination,
    )
  )
    return applyEffectiveProductPrices(
      product,
      product.prices,
      resolvedCombination,
      pageCount,
      options,
    );

  // Last resort: fetch product from Firestore
  try {
    const get = (await import("@konfi/firebase")).get;
    const where = (await import("firebase/firestore")).where;
    const db = (await import("@konfi/firebase")).db;
    const result = await get<Product>(
      db.collectionGroup<Product>(firestore, `products`, 1, [
        where("id", "==", product.id),
      ]),
    );
    let _product: Product | undefined;
    const [products] = result ? result : [];
    if (products) _product = products[0];
    if (isUndefined(_product)) return;
    return applyEffectiveProductPrices(
      _product,
      _product.prices,
      resolvedCombination,
      pageCount,
      options,
    );
  } catch (error) {
    console.error("Error fetching prices for product:", product?.id, error);
  }
  return;
}

export async function fetchPageCountStepPricesForProduct(
  firestore: Firestore,
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
  pageCount?: number | null,
  options?: DynamicPriceFetchOptions,
): Promise<Product["prices"] | undefined> {
  if (isUndefined(product) || !product.pageCount?.enabled) {
    return;
  }

  const resolvedChannelId = channelId || product.channelId || "";

  // Dynamic pricing handles page-count metric via its own rules; skip
  // the firestore page-count step fetch to avoid unnecessary reads and
  // inconsistent delivery-time results.
  if (product.priceType === PriceTypeEnum.DYNAMIC) {
    return;
  }

  const activePageCountConfig = resolvePageCountConfigForSelection(
    product.pageCount,
    options?.selectedAttributeOptions,
  );
  const pricingMode = getPageCountPricingMode(activePageCountConfig?.pricing);

  if (pricingMode === "exact") {
    return;
  }

  const resolvedCombination = calculatedCombination || DEFAULT_COMBINATION;

  if (pricingMode === "segmented") {
    const inlineSegmentPriceSet = getSegmentedPageCountPriceSet(
      pageCount,
      activePageCountConfig,
    );

    if (inlineSegmentPriceSet?.stepPrices?.length) {
      return applyEffectiveProductPrices(
        product,
        inlineSegmentPriceSet.stepPrices,
        resolvedCombination,
        pageCount,
        options,
      );
    }

    const activeSegment = getPageCountSegment(pageCount, activePageCountConfig);

    if (
      activeSegment &&
      activePageCountConfig &&
      activeSegment.minimum !== activePageCountConfig.minimum
    ) {
      try {
        const { getProductPageCountSegmentStepPriceByCalculatedCombination } =
          await import("@konfi/firebase");
        const segmentStepPriceData =
          await getProductPageCountSegmentStepPriceByCalculatedCombination(
            firestore,
            resolvedChannelId,
            product.id,
            activeSegment.minimum,
            resolvedCombination,
          );

        if (segmentStepPriceData?.prices) {
          return applyEffectiveProductPrices(
            product,
            segmentStepPriceData.prices,
            resolvedCombination,
            pageCount,
            options,
          );
        }

        if (resolvedCombination !== DEFAULT_COMBINATION) {
          const defaultSegmentStepPriceData =
            await getProductPageCountSegmentStepPriceByCalculatedCombination(
              firestore,
              resolvedChannelId,
              product.id,
              activeSegment.minimum,
              DEFAULT_COMBINATION,
            );

          if (defaultSegmentStepPriceData?.prices) {
            return applyEffectiveProductPrices(
              product,
              defaultSegmentStepPriceData.prices,
              resolvedCombination,
              pageCount,
              options,
            );
          }
        }
      } catch (error) {
        console.error(
          "Error fetching segmented page-count step prices for product:",
          product?.id,
          error,
        );
      }

      return undefined;
    }
  } else if (activePageCountConfig?.pricing?.stepPrices?.length) {
    return applyEffectiveProductPrices(
      product,
      activePageCountConfig.pricing.stepPrices,
      resolvedCombination,
      pageCount,
      options,
    );
  }

  try {
    const { getProductPageCountStepPriceByCalculatedCombination } =
      await import("@konfi/firebase");
    const stepPriceData =
      await getProductPageCountStepPriceByCalculatedCombination(
        firestore,
        resolvedChannelId,
        product.id,
        resolvedCombination,
      );

    if (stepPriceData?.prices) {
      return applyEffectiveProductPrices(
        product,
        stepPriceData.prices,
        resolvedCombination,
        pageCount,
        options,
      );
    }

    if (resolvedCombination !== DEFAULT_COMBINATION) {
      const defaultStepPriceData =
        await getProductPageCountStepPriceByCalculatedCombination(
          firestore,
          resolvedChannelId,
          product.id,
          DEFAULT_COMBINATION,
        );

      if (defaultStepPriceData?.prices) {
        return applyEffectiveProductPrices(
          product,
          defaultStepPriceData.prices,
          resolvedCombination,
          pageCount,
          options,
        );
      }
    }
  } catch (error) {
    console.error(
      "Error fetching page-count step prices for product:",
      product?.id,
      error,
    );
  }

  return applyEffectiveProductPrices(
    product,
    activePageCountConfig?.pricing?.stepPrices,
    resolvedCombination,
    pageCount,
    options,
  );
}

export async function fetchConfiguredPricesForProduct(
  firestore: Firestore,
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
  pageCount?: number | null,
  options?: DynamicPriceFetchOptions,
): Promise<ConfiguredProductPrices> {
  const [prices, pageCountStepPrices] = await Promise.all([
    fetchPricesForProduct(
      firestore,
      product,
      calculatedCombination,
      channelId,
      pageCount,
      options,
    ),
    fetchPageCountStepPricesForProduct(
      firestore,
      product,
      calculatedCombination,
      channelId,
      pageCount,
      options,
    ),
  ]);

  return {
    prices,
    pageCountStepPrices:
      product?.priceType === PriceTypeEnum.DYNAMIC
        ? undefined
        : pageCountStepPrices,
  };
}
