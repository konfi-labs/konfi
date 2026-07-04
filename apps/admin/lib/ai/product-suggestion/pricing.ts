import {
  Attribute,
  DynamicPricingConfig,
  DynamicPricingPreset,
  Price,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  resolveDynamicPricingRoutePrices,
} from "@konfi/utils";

export type ProductSuggestionDynamicPricingReaders = {
  getDynamicPricingAttributes: (
    attributes: Product["attributes"],
  ) => Promise<Attribute[]>;
  getDynamicPricingPresetsByIds: (
    channelId: string,
    presetIds: string[],
  ) => Promise<DynamicPricingPreset[]>;
  getProductDynamicPricing: (
    channelId: string,
    productId: string,
  ) => Promise<DynamicPricingConfig | undefined>;
};

export async function resolveDynamicProductSuggestionPrices({
  calculatedCombination,
  channelId,
  combination,
  customFormat,
  height,
  product,
  quantity,
  readers,
  selectedAttributeOptions,
  volume,
  width,
}: {
  calculatedCombination?: string;
  channelId: string;
  combination?: string;
  customFormat: boolean;
  height: number;
  product: Product;
  quantity: number;
  readers: ProductSuggestionDynamicPricingReaders;
  selectedAttributeOptions: Record<string, string>;
  volume: number;
  width: number;
}): Promise<Price[] | undefined> {
  if (product.priceType !== PriceTypeEnum.DYNAMIC) {
    return undefined;
  }

  const resolvedChannelId = product.channelId || channelId;
  const resolvedCombination =
    calculatedCombination || combination || DEFAULT_COMBINATION;
  const result = await resolveDynamicPricingRoutePrices({
    allowAdminPreview: true,
    body: {
      calculatedCombination: resolvedCombination,
      channelId: resolvedChannelId,
      combination: combination ?? resolvedCombination,
      customFormat,
      height,
      productId: product.id,
      quantity,
      selectedAttributeOptions:
        Object.keys(selectedAttributeOptions).length > 0
          ? selectedAttributeOptions
          : null,
      volume,
      width,
    },
    readers: {
      getDynamicPricingAttributes: readers.getDynamicPricingAttributes,
      getDynamicPricingPresetsByIds: readers.getDynamicPricingPresetsByIds,
      getProduct: async (requestedChannelId, requestedProductId) =>
        requestedChannelId === resolvedChannelId &&
        requestedProductId === product.id
          ? product
          : undefined,
      getProductDynamicPricing: readers.getProductDynamicPricing,
    },
  });

  if (result.kind === "bad-request") {
    console.warn("[productsSuggestionFlow] Dynamic pricing error for product", {
      productId: product.id,
      reason: result.error,
    });
    return undefined;
  }

  return result.prices.length > 0 ? result.prices : undefined;
}
