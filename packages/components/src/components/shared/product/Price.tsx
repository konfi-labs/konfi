"use client";

import { Skeleton, Text } from "@chakra-ui/react";
import {
  type CurrencyCode,
  CurrencyEnum,
  type CurrencySettings,
  CustomSizeWithQuantity,
  Discount,
  NestedProduct,
  Price as PriceModel,
  PriceTypeEnum,
  Product,
  Promotion,
} from "@konfi/types";
import {
  applyProductPriceOffsets,
  calculateConfiguredProductPrice,
  convertMinorAmountForDisplay,
  formatConvertedPrice,
  getDiscountFromPromotion,
  getCurrencyMinorUnitDigits,
  getPageCountPricingMode,
  isMatrixLikePriceType,
  resolvePageCountConfigForSelection,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Analytics, logEvent } from "firebase/analytics";
import { DocumentData, DocumentReference, Firestore } from "firebase/firestore";
import { i18n, TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  fetchConfiguredPricesForProduct,
  fetchPricesForProduct,
} from "../../../utils/fetch-prices";
import { Tag } from "../../ui";
import { toaster } from "../../ui/toaster";
import { DiscountTag } from "../DiscountTag";

type Props = {
  combination?: string | null;
  product: NestedProduct | Product | undefined;
  calculatedCombination: string;
  resolvedPrices?: Product["prices"];
  customFormat: boolean;
  width?: number | undefined;
  height?: number | undefined;
  pageCount?: number | null;
  quantity: number;
  volume: number | undefined;
  selectedAttributeOptions?: Record<string, string | number> | null;
  customDiscount?: Discount | null;
  setIsValidating?: React.Dispatch<React.SetStateAction<boolean>>;
  setBadConfiguration?: React.Dispatch<React.SetStateAction<boolean>>;
  descriptionCombination: string | null;
  analytics?: Analytics;
  channelId?: string;
  firestore: Firestore;
  db?: typeof import("@konfi/firebase").db;
  getDoc?: <T>(
    docRef: DocumentReference<T, DocumentData>,
  ) => Promise<T | undefined>;
  customPrice?: number | null;
  promotions?: Promotion[];
  customerDiscount?: number;
  customSizes?: CustomSizeWithQuantity[];
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  expressPercent?: number;
  t: TFunction;
  i18n: i18n;
};

type EffectivePriceOptions = {
  combination?: string | null;
  customFormat?: boolean;
  height?: number;
  quantity?: number;
  selectedAttributeOptions?: Record<string, string | number> | null;
  volume?: number;
  width?: number;
};

function applyEffectivePrices(
  product: Product | NestedProduct | undefined,
  prices: Product["prices"] | undefined,
  calculatedCombination: string,
  pageCount?: number | null,
  options?: EffectivePriceOptions,
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

export async function fetchPrices(
  firestore: Firestore,
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
  resolvedPrices?: Product["prices"],
  pageCount?: number | null,
  options?: {
    combination?: string | null;
    customFormat?: boolean;
    height?: number;
    quantity?: number;
    selectedAttributeOptions?: Record<string, string | number> | null;
    volume?: number;
    width?: number;
  },
): Promise<Product["prices"] | undefined> {
  if (
    resolvedPrices &&
    getPageCountPricingMode(product?.pageCount?.pricing) === "step"
  ) {
    return applyEffectivePrices(
      product,
      resolvedPrices,
      calculatedCombination,
      pageCount,
      options,
    );
  }

  return fetchPricesForProduct(
    firestore,
    product,
    calculatedCombination,
    channelId,
    pageCount,
    options,
  );
}

export async function fetchConfiguredPrices(
  firestore: Firestore,
  product: Product | NestedProduct | undefined,
  calculatedCombination: string,
  channelId?: string,
  resolvedPrices?: Product["prices"],
  pageCount?: number | null,
  options?: {
    combination?: string | null;
    customFormat?: boolean;
    height?: number;
    quantity?: number;
    selectedAttributeOptions?: Record<string, string | number> | null;
    volume?: number;
    width?: number;
  },
) {
  const configuredPrices = await fetchConfiguredPricesForProduct(
    firestore,
    product,
    calculatedCombination,
    channelId,
    pageCount,
    options,
  );
  const pageCountPricingMode = getPageCountPricingMode(
    product?.pageCount?.pricing,
  );
  const isDynamicProduct =
    (product as Product)?.priceType === PriceTypeEnum.DYNAMIC;
  const shouldUseResolvedPrices =
    pageCountPricingMode === "step" && !isDynamicProduct
      ? Boolean(resolvedPrices)
      : !configuredPrices.prices && Boolean(resolvedPrices);
  const prices = shouldUseResolvedPrices
    ? applyEffectivePrices(
        product,
        resolvedPrices,
        calculatedCombination,
        pageCount,
        options,
      )
    : configuredPrices.prices;

  return {
    ...configuredPrices,
    prices,
  };
}

export function Price({
  combination,
  product,
  calculatedCombination,
  resolvedPrices,
  customFormat,
  width,
  height,
  pageCount,
  quantity,
  volume,
  selectedAttributeOptions,
  customDiscount,
  setIsValidating,
  setBadConfiguration,
  descriptionCombination,
  analytics,
  channelId,
  firestore,
  db,
  getDoc,
  customPrice,
  promotions,
  customerDiscount,
  customSizes,
  displayCurrency,
  currencySettings,
  expressPercent,
  t,
  i18n,
}: Props) {
  void db;
  void getDoc;
  const pageCountPricingMode = getPageCountPricingMode(
    product?.pageCount?.pricing,
  );
  const dynamicPricingCacheKey = useMemo(() => {
    if ((product as Product)?.priceType !== PriceTypeEnum.DYNAMIC) {
      return null;
    }
    const cfg = (product as Product)?.dynamicPricing;
    if (!cfg) return "no-config";
    try {
      return JSON.stringify(cfg);
    } catch {
      return "unserializable";
    }
  }, [product]);
  const selectedAttributeOptionsKey = useMemo(() => {
    if ((product as Product)?.priceType !== PriceTypeEnum.DYNAMIC) {
      return null;
    }
    try {
      return JSON.stringify(selectedAttributeOptions ?? null);
    } catch {
      return "unserializable-selected-attributes";
    }
  }, [product, selectedAttributeOptions]);
  const priceOffsetsCacheKey = useMemo(() => {
    try {
      return JSON.stringify(
        (product as Product | undefined)?.priceOffsets ?? null,
      );
    } catch {
      return "unserializable-price-offsets";
    }
  }, [product]);
  const shouldFetch =
    !isUndefined(product) &&
    !(product as Product)?.disablePriceFetch &&
    !isUndefined(channelId) &&
    !isUndefined(calculatedCombination) &&
    (!resolvedPrices ||
      (product as Product)?.priceType === PriceTypeEnum.DYNAMIC ||
      pageCountPricingMode === "exact" ||
      pageCountPricingMode === "segmented" ||
      Boolean(
        product?.pageCount?.enabled &&
        pageCountPricingMode === "step" &&
        !product.pageCount.pricing?.stepPrices?.length,
      ));
  const { data: fetchedPrices, isValidating } = useSWR(
    shouldFetch
      ? [
          product?.id,
          channelId,
          calculatedCombination,
          combination ?? null,
          customFormat,
          width ?? null,
          height ?? null,
          volume ?? null,
          (product as Product)?.priceType === PriceTypeEnum.DYNAMIC ||
          pageCountPricingMode === "exact" ||
          pageCountPricingMode === "segmented"
            ? (pageCount ?? null)
            : "base",
          dynamicPricingCacheKey,
          selectedAttributeOptionsKey,
          priceOffsetsCacheKey,
        ]
      : null,
    () =>
      fetchConfiguredPrices(
        firestore,
        product,
        calculatedCombination,
        channelId,
        resolvedPrices,
        pageCount,
        {
          combination,
          customFormat,
          height,
          quantity,
          selectedAttributeOptions,
          volume,
          width,
        },
      ),
    { revalidateOnFocus: false },
  );

  // Resolve prices: prefer fetched when enabled, otherwise synthesize for SINGLE using customPrice/defaultPrice
  const prices: Product["prices"] | undefined = useMemo(() => {
    if (shouldFetch) return fetchedPrices?.prices;
    if (resolvedPrices) {
      return applyEffectivePrices(
        product,
        resolvedPrices,
        calculatedCombination,
        pageCount,
        {
          selectedAttributeOptions,
          volume,
        },
      );
    }
    // No remote fetching (e.g., external products)
    if (product && (product as Product).priceType === PriceTypeEnum.SINGLE) {
      if (typeof customPrice === "number" && customPrice > 0) {
        return applyEffectivePrices(
          product,
          [
            {
              value: customPrice,
              currency:
                (product as Product).defaultPrice?.currency ?? CurrencyEnum.PLN,
            } as PriceModel,
          ],
          calculatedCombination,
          pageCount,
          {
            selectedAttributeOptions,
            volume,
          },
        );
      }
      if ((product as Product).defaultPrice) {
        return applyEffectivePrices(
          product,
          [(product as Product).defaultPrice as unknown as PriceModel],
          calculatedCombination,
          pageCount,
          {
            selectedAttributeOptions,
            volume,
          },
        );
      }
    }
    return [];
  }, [
    resolvedPrices,
    shouldFetch,
    fetchedPrices,
    product,
    customPrice,
    calculatedCombination,
    pageCount,
    selectedAttributeOptions,
    volume,
  ]);
  const priceSourceCurrency = useMemo(
    () =>
      prices?.find((price) => typeof price.currency === "string")?.currency ??
      (product as Product | undefined)?.defaultPrice?.currency ??
      CurrencyEnum.PLN,
    [prices, product],
  );
  const pageCountConfig = useMemo(() => {
    if (!product?.pageCount) {
      return undefined;
    }

    const stepPrices = fetchedPrices?.pageCountStepPrices;
    const activePageCount = resolvePageCountConfigForSelection(
      product.pageCount,
      selectedAttributeOptions,
    );

    if (!activePageCount) {
      return undefined;
    }

    if (pageCountPricingMode === "exact") {
      return activePageCount;
    }

    return {
      ...activePageCount,
      pricing:
        stepPrices && stepPrices.length > 0
          ? {
              ...(activePageCount.pricing ?? {}),
              stepPrices,
            }
          : activePageCount.pricing,
    };
  }, [
    fetchedPrices?.pageCountStepPrices,
    pageCountPricingMode,
    product,
    selectedAttributeOptions,
  ]);
  const [discountsFromPromotions, setDiscountsFromPromotions] = useState<
    Discount[]
  >([]);
  const hasLoadedPrices = Array.isArray(prices) && prices.length > 0;

  useEffect(() => {
    if (!isUndefined(setIsValidating)) {
      setIsValidating(isValidating);
    }
  }, [isValidating, setIsValidating]);

  const bestDiscountFromPromotions: Discount | null = useMemo(() => {
    if (discountsFromPromotions.length === 0) return null;
    if (discountsFromPromotions.length === 1) return discountsFromPromotions[0];
    return discountsFromPromotions.reduce((prev, current) =>
      prev.discountedAmount > current.discountedAmount ? prev : current,
    );
  }, [discountsFromPromotions]);

  const basePriceCalculation = useMemo(() => {
    if (isUndefined(product)) return undefined;
    if (isUndefined(prices) || prices.length === 0) return undefined;
    if (isUndefined(width) || isUndefined(height)) return undefined;

    return calculateConfiguredProductPrice({
      quantity,
      prices,
      priceType: product?.priceType,
      discount: 0,
      calculatedCombination: calculatedCombination ?? undefined,
      volume,
      customFormat,
      width,
      height,
      minimumOrder: product?.spec?.minimumOrder,
      customPrice: customPrice ?? null,
      bleed: product?.designSpec?.includeBleed
        ? product?.designSpec?.bleed
        : undefined,
      customerDiscount: 0,
      customSizes,
      expressPercent,
      pageCount,
      pageCountConfig,
      selectedAttributeOptions,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    product,
    width,
    height,
    quantity,
    calculatedCombination,
    volume,
    customFormat,
    customPrice,
    prices,
    customSizes,
    expressPercent,
    pageCount,
    pageCountConfig,
  ]);
  const hasResolvedBaseItemPrice =
    typeof basePriceCalculation?.result === "number" &&
    Number.isFinite(basePriceCalculation.result);
  const baseItemPrice = hasResolvedBaseItemPrice
    ? basePriceCalculation.result
    : 0;

  // Update discounts when base price or promotions change
  useEffect(() => {
    if (isValidating) return;
    if (isUndefined(promotions) || isEmpty(promotions)) return;

    let _discounts: Discount[] = [];
    for (const promotion of promotions) {
      const { discount } = getDiscountFromPromotion(promotion, baseItemPrice); // Use baseItemPrice
      if (discount) _discounts.push(discount);
    }
    setDiscountsFromPromotions(_discounts);
  }, [isValidating, baseItemPrice, promotions]);

  // Calculate the item price with the best discount applied
  const itemPrice: number = useMemo(() => {
    if (baseItemPrice === 0) return 0;
    let _discountAmount = 0;
    if (customerDiscount) {
      _discountAmount = Math.floor(baseItemPrice * (customerDiscount / 100));
    } else if (customDiscount && !bestDiscountFromPromotions) {
      _discountAmount = Math.floor(
        baseItemPrice * (customDiscount.discountValue / 100),
      );
    } else if (
      bestDiscountFromPromotions &&
      bestDiscountFromPromotions?.discountedAmount > 0
    ) {
      _discountAmount = Math.floor(
        baseItemPrice * (bestDiscountFromPromotions.discountValue / 100),
      );
    }
    return baseItemPrice - _discountAmount;
  }, [
    baseItemPrice,
    customDiscount,
    customerDiscount,
    bestDiscountFromPromotions,
  ]);

  useEffect(() => {
    if (!isUndefined(setIsValidating)) {
      setIsValidating(
        isValidating || (shouldFetch && isUndefined(fetchedPrices)),
      );
    }
  }, [fetchedPrices, isValidating, setIsValidating, shouldFetch]);

  useEffect(() => {
    if (isUndefined(setBadConfiguration)) return;
    if (isValidating) return;
    if (shouldFetch && isUndefined(fetchedPrices)) return;
    if (!isMatrixLikePriceType(product?.priceType)) return;
    if (customFormat && (isUndefined(width) || isUndefined(height))) {
      setBadConfiguration(false);
      return;
    }
    if (isUndefined(volume)) {
      setBadConfiguration(false);
      return;
    }
    if (isUndefined(prices) || prices.length === 0) {
      setBadConfiguration(true);
      return;
    }
    if (!hasResolvedBaseItemPrice) {
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("price.noConfiguration", {
          defaultValue: "No configuration found",
        }),
        type: "warning",
        duration: 2000,
      });
      setBadConfiguration(true);
    } else {
      setBadConfiguration(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseItemPrice,
    calculatedCombination,
    customFormat,
    height,
    isValidating,
    hasResolvedBaseItemPrice,
    prices,
    product?.priceType,
    fetchedPrices,
    setBadConfiguration,
    shouldFetch,
    t,
    volume,
    width,
  ]);

  // Log view_item
  useEffect(() => {
    if (itemPrice <= 0) return;
    if (isNull(descriptionCombination)) return;
    if (!isUndefined(analytics)) {
      const displayItemPrice = convertMinorAmountForDisplay({
        amountMinor: itemPrice,
        baseCurrency: priceSourceCurrency,
        settings: currencySettings,
        targetCurrency: displayCurrency,
      });
      const displayItemPriceMajor =
        displayItemPrice.amountMinor /
        10 **
          getCurrencyMinorUnitDigits(
            displayItemPrice.currency,
            currencySettings,
          );
      const displayItemPriceMinorUnitDigits = getCurrencyMinorUnitDigits(
        displayItemPrice.currency,
        currencySettings,
      );

      logEvent(analytics, "view_item", {
        currency: displayItemPrice.currency,
        value: Number(
          displayItemPriceMajor.toFixed(displayItemPriceMinorUnitDigits),
        ),
        items: [
          {
            id: product?.id ?? "",
            name: product?.name ?? "",
            index: 0,
            item_category: product?.category.name ?? "",
            item_variant: descriptionCombination,
            price: Number(
              displayItemPriceMajor.toFixed(displayItemPriceMinorUnitDigits),
            ),
            quantity: quantity,
          },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currencySettings,
    descriptionCombination,
    displayCurrency,
    itemPrice,
    priceSourceCurrency,
  ]);

  return (
    <>
      <Skeleton
        loading={isValidating || (shouldFetch && isUndefined(fetchedPrices))}
        borderRadius={"full"}
      >
        {(customerDiscount ||
          customDiscount?.discountedAmount ||
          bestDiscountFromPromotions?.discountedAmount) && (
          <Tag
            position={"absolute"}
            top={-2}
            right={-4}
            size={"md"}
            fontWeight={"bold"}
            variant={"surface"}
            colorPalette={"gray"}
            borderRadius={"full"}
          >
            <Text
              fontSize={"xs"}
              fontWeight={"bold"}
              textDecoration={"line-through"}
              textDecorationSkipInk="all"
              textDecorationColor="gray.700/30"
              textDecorationThickness={1}
            >
              {formatConvertedPrice(
                baseItemPrice,
                displayCurrency,
                currencySettings,
                undefined,
                undefined,
                i18n.resolvedLanguage,
                priceSourceCurrency,
              )}
            </Text>
          </Tag>
        )}
        <Text fontSize={"xl"} fontWeight={"600"} color="primary.solid">
          {formatConvertedPrice(
            itemPrice,
            displayCurrency,
            currencySettings,
            undefined,
            undefined,
            i18n.resolvedLanguage,
            priceSourceCurrency,
          )}
        </Text>
        {customerDiscount ? (
          <DiscountTag
            discountValue={customerDiscount}
            type={"PERCENTAGE"}
            code={""}
            currency={priceSourceCurrency}
            minorUnitDigits={getCurrencyMinorUnitDigits(
              priceSourceCurrency,
              currencySettings,
            )}
            locale={i18n.resolvedLanguage}
            right={4}
            top={2}
          />
        ) : customDiscount &&
          !isNull(customDiscount) &&
          customDiscount.discountValue > 0 ? (
          <DiscountTag
            discountValue={customDiscount.discountValue}
            type={customDiscount.type}
            code={customDiscount.code}
            currency={priceSourceCurrency}
            minorUnitDigits={getCurrencyMinorUnitDigits(
              priceSourceCurrency,
              currencySettings,
            )}
            label={
              customDiscount.code
                ? t("discount.withCode", {
                    defaultValue: 'With code "{{code}}" cheaper by',
                    code: customDiscount.code,
                  })
                : undefined
            }
            locale={i18n.resolvedLanguage}
            right={4}
            top={2}
          />
        ) : !isNull(bestDiscountFromPromotions) &&
          bestDiscountFromPromotions.discountValue > 0 ? (
          <DiscountTag
            discountValue={bestDiscountFromPromotions.discountValue}
            type={bestDiscountFromPromotions.type}
            code={bestDiscountFromPromotions.code}
            currency={priceSourceCurrency}
            minorUnitDigits={getCurrencyMinorUnitDigits(
              priceSourceCurrency,
              currencySettings,
            )}
            label={
              bestDiscountFromPromotions.code
                ? t("discount.withCode", {
                    defaultValue: 'With code "{{code}}" cheaper by',
                    code: bestDiscountFromPromotions.code,
                  })
                : undefined
            }
            locale={i18n.resolvedLanguage}
            right={-3}
            top={-2}
          />
        ) : null}
      </Skeleton>
    </>
  );
}
