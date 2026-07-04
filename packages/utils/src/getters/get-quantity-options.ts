import {
  type CurrencyCode,
  CurrencyEnum,
  IDiscount,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  type PrintingMethodId,
  ProductPageCountConfig,
  Unit,
  type UnitId,
  Volume,
} from "@konfi/types";
import { calcPrice } from "../price";
import { calculateConfiguredProductPrice } from "../page-count";
import { isMatrixLikePriceType } from "../price-types";
import { getPrintTypeIcon } from "./get-print-type-icon";

export type QuantityOptionPriceThreshold = {
  value: number;
  unitPrice: number;
  currency: CurrencyCode;
  unit: UnitId;
  calculatedQuantity?: number;
  tiers: {
    value: number;
    unitPrice: number;
    currency: CurrencyCode;
    unit: UnitId;
  }[];
  next?: {
    value: number;
    unitPrice: number;
    currency: CurrencyCode;
    unit: UnitId;
    remainingQuantity?: number;
  };
  tierCount: number;
};

type ResolvedPriceTier = {
  value: number;
  unitPrice: number;
  currency: CurrencyCode;
  unit: UnitId;
};

function hasUsableSmallerMatrixPrice(
  prices: Price[] | undefined,
  calculatedCombination: string | null | undefined,
  volume: number,
) {
  if (!prices?.length || !calculatedCombination) {
    return false;
  }

  return prices.some(
    (price) =>
      price.combination?.id === calculatedCombination &&
      typeof price.volume?.value === "number" &&
      price.volume.value < volume &&
      price.combination?.active !== false &&
      typeof price.value === "number" &&
      Number.isFinite(price.value) &&
      price.value >= 0,
  );
}

function hasUsableExplicitMatrixPrice(
  prices: Price[] | undefined,
  calculatedCombination: string | null | undefined,
  volume: number,
) {
  if (!prices?.length || !calculatedCombination) {
    return false;
  }

  return prices.some(
    (price) =>
      price.combination?.id === calculatedCombination &&
      price.volume?.value === volume &&
      price.combination?.active !== false &&
      typeof price.value === "number" &&
      Number.isFinite(price.value) &&
      price.value >= 0,
  );
}

function hasExactMatrixPrice(
  prices: Price[] | undefined,
  calculatedCombination: string | null | undefined,
  volume: number,
) {
  if (!prices?.length || !calculatedCombination) {
    return false;
  }

  return prices.some(
    (price) =>
      price.combination?.id === calculatedCombination &&
      price.volume?.value === volume,
  );
}

function getPriceTierValue(price: Price, priceType: PriceTypeEnum) {
  const value = isMatrixLikePriceType(priceType)
    ? (price.threshold ?? price.volume?.value)
    : priceType === PriceTypeEnum.THRESHOLD
      ? price.threshold
      : undefined;

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getUsablePriceTiers({
  prices,
  priceType,
  calculatedCombination,
  unit,
}: {
  prices: Price[] | undefined;
  priceType: PriceTypeEnum;
  calculatedCombination?: string | null;
  unit: UnitId;
}) {
  if (!prices?.length) return [];

  const tiersByValue = new Map<number, ResolvedPriceTier>();

  for (const price of prices) {
    if (
      isMatrixLikePriceType(priceType) &&
      calculatedCombination &&
      price.combination?.id !== calculatedCombination
    ) {
      continue;
    }

    if (
      price.combination?.active === false ||
      typeof price.value !== "number" ||
      !Number.isFinite(price.value)
    ) {
      continue;
    }

    const value = getPriceTierValue(price, priceType);
    if (value === undefined || tiersByValue.has(value)) {
      continue;
    }

    tiersByValue.set(value, {
      value,
      unitPrice: price.value,
      currency: price.currency ?? CurrencyEnum.PLN,
      unit,
    });
  }

  return [...tiersByValue.values()].sort(
    (left, right) => left.value - right.value,
  );
}

function getNextPriceTier(
  tiers: ResolvedPriceTier[],
  calculatedQuantity: number | undefined,
) {
  if (
    typeof calculatedQuantity !== "number" ||
    !Number.isFinite(calculatedQuantity)
  ) {
    return undefined;
  }

  return tiers.find((tier) => tier.value > calculatedQuantity);
}

export function getQuantityOptions(
  volumes: Omit<Volume, "deliveryTime">[],
  quantity: number,
  priceType: PriceTypeEnum,
  customFormat: boolean,
  minimumOrder: number,
  discount?: IDiscount,
  calculatedCombination?: string | null,
  prices?: Price[],
  width?: number,
  height?: number,
  customPrice?: number | null,
  unit?: UnitId,
  bleed?: number,
  customerDiscount?: number,
  expressPercent?: number,
  pageCount?: number | null,
  pageCountConfig?: ProductPageCountConfig | null,
  selectedAttributeOptions?: Record<string, string | number> | null,
) {
  let options = [];
  for (let i = 0; i < volumes.length; i++) {
    const volume = volumes[i];
    options.push(
      getQuantityOption(
        volume.value,
        volume.printType ?? PrintingMethod.DIGITAL,
        quantity,
        priceType,
        customFormat,
        minimumOrder,
        discount,
        calculatedCombination,
        prices,
        width,
        height,
        customPrice,
        unit,
        bleed,
        customerDiscount,
        expressPercent,
        isMatrixLikePriceType(priceType),
        pageCount,
        pageCountConfig,
        selectedAttributeOptions,
      ),
    );
  }
  return options;
}

export function getQuantityOption(
  volume: number,
  volumePrintType: PrintingMethodId,
  quantity: number,
  priceType: PriceTypeEnum,
  customFormat: boolean,
  minimumOrder: number,
  discount?: IDiscount,
  calculatedCombination?: string | null,
  prices?: Price[],
  width?: number,
  height?: number,
  customPrice?: number | null,
  unit?: UnitId,
  bleed?: number,
  customerDiscount?: number,
  expressPercent?: number,
  requireExplicitMatrixPrice = false,
  pageCount?: number | null,
  pageCountConfig?: ProductPageCountConfig | null,
  selectedAttributeOptions?: Record<string, string | number> | null,
) {
  let _calcPrice:
    | ReturnType<typeof calculateConfiguredProductPrice>
    | undefined;
  try {
    _calcPrice = calculateConfiguredProductPrice({
      quantity: isMatrixLikePriceType(priceType) ? quantity : volume,
      prices,
      priceType,
      discount: discount?.discountValue ?? undefined,
      calculatedCombination: calculatedCombination ?? undefined,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      bleed,
      customerDiscount,
      expressPercent,
      pageCount,
      pageCountConfig,
      selectedAttributeOptions,
    });
  } catch {
    // calcPrice throws on invalid inputs (NaN volume, undefined prices, etc.)
  }

  const shouldDisableUnavailableBaseMatrixVolume =
    requireExplicitMatrixPrice &&
    isMatrixLikePriceType(priceType) &&
    !!calculatedCombination &&
    Array.isArray(prices) &&
    prices.length > 0 &&
    hasExactMatrixPrice(prices, calculatedCombination, volume) &&
    !hasUsableExplicitMatrixPrice(prices, calculatedCombination, volume) &&
    !hasUsableSmallerMatrixPrice(prices, calculatedCombination, volume);

  const _totalPrice = _calcPrice?.result;
  const _deliveryTime = _calcPrice?.deliveryTime;
  const hasResolvedTotalPrice =
    typeof _totalPrice === "number" && Number.isFinite(_totalPrice);
  const disabled =
    shouldDisableUnavailableBaseMatrixVolume || !hasResolvedTotalPrice;
  const selectedPrice =
    _calcPrice && "selectedPrice" in _calcPrice
      ? _calcPrice.selectedPrice
      : undefined;
  const calculatedQuantity =
    _calcPrice && "calculatedQuantity" in _calcPrice
      ? _calcPrice.calculatedQuantity
      : undefined;
  const selectedThreshold = selectedPrice
    ? getPriceTierValue(selectedPrice, priceType)
    : undefined;
  const selectedUnitPrice = selectedPrice?.value;
  const hasResolvedThreshold =
    typeof selectedThreshold === "number" && Number.isFinite(selectedThreshold);
  const hasResolvedUnitPrice =
    typeof selectedUnitPrice === "number" && Number.isFinite(selectedUnitPrice);
  const resolvedUnit = unit ?? Unit.PCS;
  const thresholdUnit = customFormat ? Unit.M2 : resolvedUnit;
  const tiers = getUsablePriceTiers({
    prices,
    priceType,
    calculatedCombination,
    unit: thresholdUnit,
  });
  const nextTier = getNextPriceTier(tiers, calculatedQuantity);
  const priceThreshold: QuantityOptionPriceThreshold | undefined =
    !disabled && hasResolvedThreshold && hasResolvedUnitPrice
      ? {
          value: selectedThreshold,
          unitPrice: selectedUnitPrice,
          currency: selectedPrice?.currency ?? CurrencyEnum.PLN,
          unit: thresholdUnit,
          calculatedQuantity,
          tiers,
          next: nextTier
            ? {
                ...nextTier,
                remainingQuantity:
                  typeof calculatedQuantity === "number" &&
                  Number.isFinite(calculatedQuantity)
                    ? Math.max(0, nextTier.value - calculatedQuantity)
                    : undefined,
              }
            : undefined,
          tierCount: tiers.length,
        }
      : undefined;

  return {
    label: `${volume}`,
    value: `${volume}`,
    icon: volumePrintType
      ? getPrintTypeIcon(volumePrintType)
      : getPrintTypeIcon(PrintingMethod.DIGITAL),
    totalPrice: disabled ? undefined : _totalPrice,
    currency: selectedPrice?.currency ?? CurrencyEnum.PLN,
    unit: resolvedUnit,
    deliveryTime: disabled ? undefined : (_deliveryTime ?? 2),
    disabled,
    priceThreshold,
  };
}
