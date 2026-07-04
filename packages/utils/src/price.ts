import {
  Campaign,
  type CurrencyCode,
  CurrencyEnum,
  CustomSizeWithQuantity,
  Discount,
  OrderItem,
  Price,
  PriceTypeEnum,
  Promotion,
  PromotionRule,
  type PromotionRuleContext,
} from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { formatPrice } from "./formatters";
import { getDiscountFromPromotion } from "./getters";
import { isMatrixLikePriceType } from "./price-types";
import { validatePromotion } from "./validators/validate-promotion";

export const FISCAL_UNIT_PRICE_PRECISION = 2;
export const FISCAL_QUANTITY_PRECISION = 3;
export const FISCAL_TOTAL_PRECISION = 2;

const pow10 = (precision: number): number => 10 ** precision;

const truncateDecimal = (value: number, precision: number): number => {
  if (!Number.isFinite(value)) return value;
  const factor = pow10(precision);
  return Math.trunc(value * factor) / factor;
};

/**
 * Rounds a number to the specified number of decimal places.
 *
 * @param value - The number to round.
 * @param precision - The number of decimal places to round to.
 * @returns The rounded number.
 *
 * Differs from {@link truncateDecimal} in that this function rounds the value
 * to the nearest value at the given precision, whereas {@link truncateDecimal}
 * simply removes digits beyond the specified precision (truncates towards zero).
 */
const roundDecimal = (value: number, precision: number): number => {
  if (!Number.isFinite(value)) return value;
  const factor = pow10(precision);
  return Math.round(value * factor) / factor;
};

const toMinorUnits = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100);

const fromMinorUnits = (value: number): number => value / 100;

export const toFiscalUnitPrice = (value: number): number =>
  truncateDecimal(value, FISCAL_UNIT_PRICE_PRECISION);

export const toFiscalQuantity = (value: number): number =>
  truncateDecimal(value, FISCAL_QUANTITY_PRECISION);

export const toFiscalTotal = (value: number): number =>
  truncateDecimal(value, FISCAL_TOTAL_PRECISION);
// Fiscal compliance requires two separate rounding steps:
//   1. The unit price must be rounded to 2 decimals after dividing total by quantity.
//   2. The total must then be recalculated as (rounded unit price * rounded quantity), and rounded again to 2 decimals.
// This matches the behaviour of fiscal printers and invoicing systems, and is required for legal/tax reporting.
const enforceFiscalTotalPrecision = (
  totalMinor: number,
  quantity: number,
): number => {
  if (!Number.isFinite(totalMinor)) return totalMinor;
  const normalizedQuantity = toFiscalQuantity(quantity);
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    return Math.floor(totalMinor);
  }

  // Work in major units for readability, then enforce fiscal rules based on a
  // 2-decimal unit price (like Fakturownia and fiscal printers do):
  //   unit = round(total / quantity, 2)
  //   total' = round(unit * quantity, 2)
  const totalMajor = fromMinorUnits(Math.floor(totalMinor));
  const unitMajor = roundDecimal(
    totalMajor / normalizedQuantity,
    FISCAL_UNIT_PRICE_PRECISION,
  );
  const adjustedTotalMajor = roundDecimal(
    unitMajor * normalizedQuantity,
    FISCAL_TOTAL_PRECISION,
  );

  return toMinorUnits(adjustedTotalMajor);
};

const MILLIMETERS_PER_SQUARE_METER = 1_000_000;
const MILLIMETERS_PER_METER = 1000;

const getBleedAdjustedDimension = (
  dimension: number,
  bleed?: number,
): number => {
  if (!Number.isFinite(dimension)) {
    return dimension;
  }

  if (!Number.isFinite(bleed) || isUndefined(bleed) || bleed <= 0) {
    return dimension;
  }

  return dimension + bleed;
};

const calculateGrossAreaQuantity = (
  width: number,
  height: number,
  quantity: number,
  bleed?: number,
): number => {
  const effectiveWidth = getBleedAdjustedDimension(width, bleed);
  const effectiveHeight = getBleedAdjustedDimension(height, bleed);

  return toFiscalQuantity(
    (effectiveWidth * effectiveHeight * quantity) /
      MILLIMETERS_PER_SQUARE_METER,
  );
};

const isMeterScaleCustomFormat = (width: number, height: number): boolean =>
  width >= MILLIMETERS_PER_METER && height >= MILLIMETERS_PER_METER;

const calculateLargeFormatAreaQuantity = (
  width: number,
  height: number,
  quantity: number,
  bleed?: number,
): number =>
  calculateGrossAreaQuantity(
    width,
    height,
    quantity,
    isMeterScaleCustomFormat(width, height) ? undefined : bleed,
  );

function getAdjustedQuantityForLargeFormat(
  width: number,
  height: number,
  baseQuantity: number,
  bleed: number,
): number | null {
  if (isNaN(bleed) || bleed <= 0 || isNaN(width) || isNaN(height)) {
    return null;
  }

  const effectiveWidth = getBleedAdjustedDimension(width, bleed);
  const effectiveHeight = getBleedAdjustedDimension(height, bleed);

  if (
    effectiveHeight < MILLIMETERS_PER_METER &&
    effectiveWidth < MILLIMETERS_PER_METER
  ) {
    const piecesPerMeterX = Math.floor(MILLIMETERS_PER_METER / effectiveWidth);
    const piecesPerMeterY = Math.floor(MILLIMETERS_PER_METER / effectiveHeight);
    const piecesPerMeter = piecesPerMeterX * piecesPerMeterY;

    if (piecesPerMeter === 1) {
      return calculateLargeFormatAreaQuantity(
        width,
        height,
        baseQuantity,
        bleed,
      );
    }
  }

  return null;
}

export function calcPrice(
  quantity: number,
  prices: Price[] | undefined,
  priceType: PriceTypeEnum,
  discount?: number,
  calculatedCombination?: string,
  volume?: number,
  customFormat?: boolean,
  width?: number,
  height?: number,
  minimumOrder?: number,
  customPrice?: number | null,
  bleed?: number,
  customerDiscount?: number,
  customSizes?: CustomSizeWithQuantity[],
  lng?: string,
  expressPercent?: number,
) {
  if (isUndefined(prices)) throw "Prices are undefined";
  if (isUndefined(priceType)) throw "Price type is undefined";
  if (isUndefined(customFormat)) throw "Custom format is undefined";

  const _quantity: number = Number(`${quantity}` === "." ? 0 : quantity);
  if (isNaN(_quantity)) throw "Quantity is NaN";

  volume = Number(`${volume}`.replace(",", "."));
  const _volume: number = Number(`${volume}` === "." ? 0 : volume);
  if (isNaN(_volume) && isMatrixLikePriceType(priceType)) throw "Volume is NaN";

  const _minimumOrder: number = Number(minimumOrder);
  if (isNaN(_minimumOrder)) throw "Minimum order is NaN";

  const _customPrice: number = Number(customPrice);

  const _discount: number = !isUndefined(discount) ? discount : 0;

  const _width: number = Number(width);
  const _height: number = Number(height);

  const _bleed: number = Number(bleed);

  const getCustomSizesTotalPieceCount = (): number => {
    if (!customSizes?.length) return 0;
    return customSizes.reduce((total, size) => {
      const sizeQuantity = Number(size.quantity);
      if (isNaN(sizeQuantity) || sizeQuantity <= 0) return total;
      return total + sizeQuantity;
    }, 0);
  };

  /**
   * Determines the actual physical quantity (pieces/units) for fiscal enforcement.
   * This is distinct from the calculated billing quantity, which may be in m² for custom formats.
   * - If custom sizes are provided, their total quantity is used.
   * - For MATRIX price type, volume is used for fiscal purposes, even with customFormat.
   * - Otherwise, falls back to the standard quantity.
   * This logic is critical for correct invoice generation and fiscal precision.
   */
  const getFiscalQuantity = (): number => {
    const customSizesQuantity = getCustomSizesTotalPieceCount();
    if (customSizesQuantity > 0) return customSizesQuantity;

    // For MATRIX type, volume represents the quantity used in calculations
    // even when customFormat is true, so we should use volume for fiscal purposes
    if (isMatrixLikePriceType(priceType)) {
      if (!isNaN(_volume) && _volume > 0) return _volume;
    }

    if (customFormat) return _quantity;

    return _quantity;
  };

  let calculatedPriceValue: { result: number; minimumOrderShort?: number } = {
    result: 0,
  };
  let priceObjects: Price[] = [];
  let priceObject: Price | undefined = undefined;
  let calculatedQuantity = 0;

  priceObjects = prices;
  const fiscalQuantity = getFiscalQuantity();

  if (priceType === PriceTypeEnum.SINGLE) {
    // Use multiple custom sizes if available and in custom format
    if (customFormat && customSizes && customSizes.length > 0) {
      calculatedQuantity = calculateQuantityForMultipleSizes(
        customSizes,
        _bleed,
      );
      if (_minimumOrder > 0 && calculatedQuantity < _minimumOrder) {
        calculatedQuantity = _minimumOrder;
      }
    } else {
      calculatedQuantity = calculateQuantity(
        customFormat,
        _quantity,
        _width,
        _height,
        _bleed,
      );
    }
    priceObject = priceObjects[0];
    if (isUndefined(priceObject)) {
      return { error: "Niepoprawna konfiguracja" };
    }
    if (
      !isNull(customPrice) &&
      Number.isFinite(_customPrice) &&
      _customPrice > 0
    )
      priceObject.value = _customPrice;
    calculatedPriceValue = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      _minimumOrder,
      _discount,
      customerDiscount,
      expressPercent,
      fiscalQuantity,
    );
  } else if (priceType === PriceTypeEnum.THRESHOLD) {
    // Use multiple custom sizes if available and in custom format
    if (customFormat && customSizes && customSizes.length > 0) {
      calculatedQuantity = calculateQuantityForMultipleSizes(
        customSizes,
        _bleed,
      );
      if (_minimumOrder > 0 && calculatedQuantity < _minimumOrder) {
        calculatedQuantity = _minimumOrder;
      }
      // For a single custom size, apply large-format adjustment when only
      // one piece fits per 1m^2 sheet by billing based on geometric area.
      if (customSizes.length === 1) {
        const size = customSizes[0];
        if (
          !isUndefined(size.width) &&
          !isUndefined(size.height) &&
          !isUndefined(size.quantity)
        ) {
          const adjusted = getAdjustedQuantityForLargeFormat(
            size.width,
            size.height,
            size.quantity,
            _bleed,
          );
          if (adjusted !== null) calculatedQuantity = adjusted;
        }
      }
    } else {
      calculatedQuantity = calculateQuantity(
        customFormat,
        _quantity,
        _width,
        _height,
        _bleed,
      );
      if (customFormat) {
        const adjusted = getAdjustedQuantityForLargeFormat(
          _width,
          _height,
          _quantity,
          _bleed,
        );
        if (adjusted !== null) calculatedQuantity = adjusted;
      }
    }
    priceObject = getThresholdsPrice(priceObjects, calculatedQuantity);
    if (isUndefined(priceObject)) {
      return { error: "Niepoprawna konfiguracja" };
    }
    if (
      !isNull(customPrice) &&
      Number.isFinite(_customPrice) &&
      _customPrice > 0
    )
      priceObject.value = _customPrice;
    calculatedPriceValue = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      _minimumOrder,
      _discount,
      customerDiscount,
      expressPercent,
      fiscalQuantity,
    );
  } else if (isMatrixLikePriceType(priceType)) {
    // Use multiple custom sizes if available and in custom format
    if (customFormat && customSizes && customSizes.length > 0) {
      calculatedQuantity = calculateQuantityForMultipleSizes(
        customSizes,
        _bleed,
      );
      if (_minimumOrder > 0 && calculatedQuantity < _minimumOrder) {
        calculatedQuantity = _minimumOrder;
      }
      // Apply large-format adjustment for a single custom size when only one
      // piece fits per 1m^2 sheet by billing based on geometric area.
      if (customSizes.length === 1) {
        const size = customSizes[0];
        if (
          !isUndefined(size.width) &&
          !isUndefined(size.height) &&
          !isUndefined(size.quantity)
        ) {
          const adjusted = getAdjustedQuantityForLargeFormat(
            size.width,
            size.height,
            size.quantity,
            _bleed,
          );
          if (adjusted !== null) calculatedQuantity = adjusted;
        }
      }
    } else {
      calculatedQuantity = calculateQuantity(
        customFormat,
        _volume,
        _width,
        _height,
        _bleed,
      );
      if (customFormat) {
        const adjusted = getAdjustedQuantityForLargeFormat(
          _width,
          _height,
          _volume,
          _bleed,
        );
        if (adjusted !== null) calculatedQuantity = adjusted;
      }
    }
    if (isUndefined(calculatedCombination))
      throw "Calculated combination is undefined";
    priceObject =
      getMatrixPrice(
        priceObjects,
        calculatedQuantity,
        calculatedCombination,
        customFormat,
      ) ?? undefined;
    if (isUndefined(priceObject)) {
      return { error: "Niepoprawna konfiguracja" };
    }
    if (
      !isNull(customPrice) &&
      Number.isFinite(_customPrice) &&
      _customPrice > 0
    )
      priceObject.value = _customPrice;
    if (priceObject.combination?.active === false) {
      calculatedPriceValue.result = NaN;
    } else
      calculatedPriceValue = calculatePriceValue(
        priceObject,
        calculatedQuantity,
        _minimumOrder,
        _discount,
        customerDiscount,
        expressPercent,
        fiscalQuantity,
      );
  }

  const normalizedCalculatedQuantity = toFiscalQuantity(calculatedQuantity);
  const normalizedMinimumOrderPrecision = toFiscalQuantity(_minimumOrder);
  const normalizedFiscalQuantity = toFiscalQuantity(fiscalQuantity);
  const quantityUsedForPrecision =
    normalizedFiscalQuantity > 0
      ? normalizedFiscalQuantity
      : normalizedCalculatedQuantity > 0
        ? Math.max(
            normalizedCalculatedQuantity,
            normalizedMinimumOrderPrecision,
          )
        : normalizedMinimumOrderPrecision;
  const finalResult = enforceFiscalTotalPrecision(
    calculatedPriceValue.result,
    quantityUsedForPrecision,
  );

  const formattedPrice = formatPrice(
    Math.floor(finalResult),
    priceObject?.currency ?? CurrencyEnum.PLN,
    calculatedPriceValue.minimumOrderShort,
    undefined,
    lng,
  );

  if (
    !isUndefined(priceObject?.combination?.active) &&
    !priceObject?.combination?.active
  )
    return { error: "Niepoprawna konfiguracja" };
  const result = Math.floor(finalResult);

  // Calculate delivery time with express mode reduction
  let deliveryTime = priceObject?.volume?.deliveryTime ?? null;
  if (deliveryTime && expressPercent && expressPercent > 0) {
    // expressPercent directly represents reduction percentage, capped at 50% max
    // e.g., 20% express = 20% time reduction, 50% express = 50% time reduction
    const reductionFactor = Math.min(expressPercent, 50) / 100;
    deliveryTime = Math.max(
      1,
      Math.round(deliveryTime * (1 - reductionFactor)),
    );
  }

  return {
    result,
    formattedPrice,
    deliveryTime,
    selectedPrice: priceObject,
    calculatedQuantity: normalizedCalculatedQuantity,
  };
}

export function calculateQuantity(
  customFormat: boolean,
  quantity: number,
  width?: number,
  height?: number,
  bleed?: number,
): number {
  if (customFormat) {
    if (isUndefined(width)) throw "Width is undefined";
    if (isUndefined(height)) throw "Height is undefined";

    const effectiveBleed = isMeterScaleCustomFormat(width, height)
      ? undefined
      : bleed;
    const effectiveWidth = getBleedAdjustedDimension(width, effectiveBleed);
    const effectiveHeight = getBleedAdjustedDimension(height, effectiveBleed);

    if (
      effectiveBleed &&
      effectiveHeight < MILLIMETERS_PER_METER &&
      effectiveWidth < MILLIMETERS_PER_METER
    ) {
      const piecesPerMeterX = Math.floor(
        MILLIMETERS_PER_METER / effectiveWidth,
      );
      const piecesPerMeterY = Math.floor(
        MILLIMETERS_PER_METER / effectiveHeight,
      );
      const piecesPerMeter = piecesPerMeterX * piecesPerMeterY;

      if (piecesPerMeter === 0) throw "Piece size is too large";

      // If only one (or fewer) piece fits per m², fall back to geometric area
      // instead of forcing a minimum of 1 m² per piece.
      if (piecesPerMeter <= 1) {
        return calculateLargeFormatAreaQuantity(width, height, quantity, bleed);
      }

      const totalArea = toFiscalQuantity(quantity / piecesPerMeter);

      return totalArea;
    } else {
      return calculateGrossAreaQuantity(
        width,
        height,
        quantity,
        effectiveBleed,
      );
    }
  } else if (!customFormat) {
    return toFiscalQuantity(quantity);
  }

  return NaN;
}

export function calculateQuantityForMultipleSizes(
  customSizes: CustomSizeWithQuantity[],
  bleed?: number,
): number {
  if (!customSizes || customSizes.length === 0) {
    throw "Custom sizes array is empty or undefined";
  }

  return toFiscalQuantity(
    customSizes.reduce((totalQuantity, size) => {
      const { width, height, quantity } = size;

      if (isUndefined(width)) throw "Width is undefined in custom size";
      if (isUndefined(height)) throw "Height is undefined in custom size";
      if (isUndefined(quantity) || quantity <= 0)
        throw "Invalid quantity in custom size";

      return (
        totalQuantity +
        calculateGrossAreaQuantity(width, height, quantity, bleed)
      );
    }, 0),
  );
}

export function getThresholdsPrice(
  priceObjects: Price[],
  calculatedQuantity: number,
): Price | undefined {
  let currentThreshold = 0;
  let minThreshold: number | undefined;
  let maxThreshold: number | undefined;
  let largestThresholdBelowQuantity: number | undefined;

  for (const priceObject of priceObjects) {
    if (isUndefined(priceObject.threshold)) {
      throw "Price object threshold is undefined";
    }

    if (
      priceObject.threshold <= calculatedQuantity &&
      (isUndefined(largestThresholdBelowQuantity) ||
        priceObject.threshold > largestThresholdBelowQuantity)
    ) {
      largestThresholdBelowQuantity = priceObject.threshold;
    }

    minThreshold =
      isUndefined(minThreshold) || priceObject.threshold < minThreshold
        ? priceObject.threshold
        : minThreshold;
    maxThreshold =
      isUndefined(maxThreshold) || priceObject.threshold > maxThreshold
        ? priceObject.threshold
        : maxThreshold;
  }

  if (!isUndefined(maxThreshold) && calculatedQuantity >= maxThreshold) {
    currentThreshold = maxThreshold;
  } else if (!isUndefined(minThreshold) && calculatedQuantity <= minThreshold) {
    currentThreshold = minThreshold;
  } else {
    currentThreshold = largestThresholdBelowQuantity ?? minThreshold ?? 0;
  }

  return priceObjects.find(
    (priceObject) => priceObject.threshold === currentThreshold,
  );
}

type MatrixVolumePrice = Price & {
  volume: NonNullable<Price["volume"]>;
};

type UsableMatrixVolumePrice = MatrixVolumePrice & {
  value: number;
};

const hasUsableMatrixPriceValue = (priceObject: Price): boolean => {
  return (
    priceObject.combination?.active !== false &&
    !isUndefined(priceObject.value) &&
    !isNull(priceObject.value) &&
    Number.isFinite(priceObject.value) &&
    priceObject.value >= 0
  );
};

const hasUsableMatrixVolumePrice = (
  priceObject: MatrixVolumePrice,
): priceObject is UsableMatrixVolumePrice => {
  return hasUsableMatrixPriceValue(priceObject);
};

const cloneMatrixFallbackPrice = (
  priceObject: MatrixVolumePrice,
  calculatedQuantity: number,
): Price => {
  return {
    value: priceObject.value,
    combination: priceObject.combination,
    volume: {
      value: calculatedQuantity,
      deliveryTime: priceObject.volume.deliveryTime,
    },
    currency: priceObject.currency ?? CurrencyEnum.PLN,
  };
};

const cloneInterpolatedMatrixPrice = (
  smallerVolumePrice: UsableMatrixVolumePrice,
  biggerVolumePrice: UsableMatrixVolumePrice,
  calculatedQuantity: number,
): Price | undefined => {
  const smallerVolume = smallerVolumePrice.volume.value;
  const biggerVolume = biggerVolumePrice.volume.value;

  if (biggerVolume <= smallerVolume) {
    return undefined;
  }

  const interpolationRatio =
    (calculatedQuantity - smallerVolume) / (biggerVolume - smallerVolume);
  const smallerTotalPrice = smallerVolumePrice.value * smallerVolume;
  const biggerTotalPrice = biggerVolumePrice.value * biggerVolume;
  const interpolatedTotalPrice =
    smallerTotalPrice +
    interpolationRatio * (biggerTotalPrice - smallerTotalPrice);

  return {
    value: interpolatedTotalPrice / calculatedQuantity,
    combination: smallerVolumePrice.combination,
    volume: {
      value: calculatedQuantity,
      deliveryTime: Math.max(
        smallerVolumePrice.volume.deliveryTime ?? 2,
        biggerVolumePrice.volume.deliveryTime ?? 2,
      ),
    },
    currency:
      smallerVolumePrice.currency ??
      biggerVolumePrice.currency ??
      CurrencyEnum.PLN,
  };
};

const isExplicitMatrixVolumeUnavailable = (
  priceObjects: MatrixVolumePrice[],
  volumeValue: number,
): boolean => {
  const exactVolumePrices = priceObjects.filter(
    (priceObject) => priceObject.volume.value === volumeValue,
  );

  if (exactVolumePrices.length === 0) {
    return false;
  }

  return exactVolumePrices.every(
    (priceObject) => !hasUsableMatrixVolumePrice(priceObject),
  );
};

const isDerivedMatrixVolumeBlocked = (
  priceObjects: MatrixVolumePrice[],
  calculatedQuantity: number,
): boolean => {
  let hasPriceDefinedBelow = false;
  let nextDefinedPrice: MatrixVolumePrice | undefined;

  for (const priceObject of priceObjects) {
    const volumeValue = priceObject.volume.value;

    if (volumeValue < calculatedQuantity) {
      hasPriceDefinedBelow = true;

      // If any usable (active) price exists below the requested quantity, the
      // derived quantity can fall back to it and is not blocked.
      if (hasUsableMatrixVolumePrice(priceObject)) {
        return false;
      }

      continue;
    }

    if (
      volumeValue > calculatedQuantity &&
      (isUndefined(nextDefinedPrice) ||
        volumeValue < nextDefinedPrice.volume.value)
    ) {
      nextDefinedPrice = priceObject;
    }
  }

  if (hasPriceDefinedBelow) {
    return true;
  }

  if (!isUndefined(nextDefinedPrice)) {
    return isExplicitMatrixVolumeUnavailable(
      priceObjects,
      nextDefinedPrice.volume.value,
    );
  }

  return false;
};

// Check if all paths in this function return a value
// eslint-disable-next-line consistent-return
export function getMatrixPrice(
  priceObjects: Price[],
  calculatedQuantity: number,
  calculatedCombination: string,
  customFormat: boolean,
): Price | undefined {
  let _priceObjects = priceObjects.filter(
    (priceObject: Price) =>
      priceObject.combination?.id === calculatedCombination,
  );

  if (_priceObjects.length <= 0) {
    return undefined;
  }

  // If price object do not have threshold property then the price type is SINGLE
  // we need to get priceObject matching volume (calculatedQuantity)
  if (isNaN(Number(_priceObjects[0]?.threshold))) {
    const combinationVolumePrices = _priceObjects.filter(
      (priceObject): priceObject is MatrixVolumePrice =>
        !isUndefined(priceObject.volume),
    );

    const exactPriceObject = combinationVolumePrices.find(
      (priceObject) => priceObject.volume.value === calculatedQuantity,
    );

    if (
      !isUndefined(exactPriceObject) &&
      hasUsableMatrixVolumePrice(exactPriceObject)
    ) {
      return exactPriceObject;
    }

    if (
      isUndefined(exactPriceObject) &&
      isDerivedMatrixVolumeBlocked(combinationVolumePrices, calculatedQuantity)
    ) {
      return undefined;
    }

    const sortedDefinedPrices = [...combinationVolumePrices].sort(
      (left, right) => left.volume.value - right.volume.value,
    );
    let nearestDefinedSmallerVolumePrice: MatrixVolumePrice | undefined;
    let nearestDefinedBiggerVolumePrice: MatrixVolumePrice | undefined;
    let smallerVolumePrice: UsableMatrixVolumePrice | undefined;
    let biggerVolumePrice: UsableMatrixVolumePrice | undefined;

    for (const priceObject of sortedDefinedPrices) {
      const volumeValue = priceObject.volume.value;

      if (volumeValue < calculatedQuantity) {
        nearestDefinedSmallerVolumePrice = priceObject;

        if (hasUsableMatrixVolumePrice(priceObject)) {
          smallerVolumePrice = priceObject;
        }

        continue;
      }

      if (volumeValue > calculatedQuantity) {
        nearestDefinedBiggerVolumePrice ??= priceObject;

        if (
          isUndefined(biggerVolumePrice) &&
          hasUsableMatrixVolumePrice(priceObject)
        ) {
          biggerVolumePrice = priceObject;
        }

        if (!isUndefined(biggerVolumePrice)) {
          break;
        }
      }
    }

    if (customFormat) {
      return smallerVolumePrice ?? biggerVolumePrice ?? exactPriceObject;
    }

    if (
      isUndefined(exactPriceObject) &&
      !isUndefined(smallerVolumePrice) &&
      !isUndefined(biggerVolumePrice) &&
      nearestDefinedSmallerVolumePrice === smallerVolumePrice &&
      nearestDefinedBiggerVolumePrice === biggerVolumePrice
    ) {
      return cloneInterpolatedMatrixPrice(
        smallerVolumePrice,
        biggerVolumePrice,
        calculatedQuantity,
      );
    }

    const fallbackPrice = smallerVolumePrice ?? biggerVolumePrice;

    if (!isUndefined(fallbackPrice)) {
      return cloneMatrixFallbackPrice(fallbackPrice, calculatedQuantity);
    }

    return exactPriceObject;
  }
  // If price objects have threshold property then the price type is THRESHOLDS
  // we need to filter out price objects with thresholds that already exist
  else if (
    !isNaN(Number(_priceObjects[0]?.threshold)) &&
    Number(_priceObjects[0].threshold) >= 0
  ) {
    const seenThresholds = new Set<number | undefined>();
    const filteredDupes: Price[] = [];

    for (const element of _priceObjects) {
      if (seenThresholds.has(element.threshold)) {
        continue;
      }

      seenThresholds.add(element.threshold);
      filteredDupes.push(element);
    }

    _priceObjects = filteredDupes;
    return getThresholdsPrice(_priceObjects, calculatedQuantity);
  }
}

export function calculatePriceValue(
  priceObject: Price,
  calculatedQuantity: number,
  minimumOrder: number,
  discount: number,
  customerDiscount?: number,
  expressPercent?: number,
  fiscalQuantityOverride?: number,
): {
  result: number;
  minimumOrderShort?: number;
} {
  if (isUndefined(priceObject.value) || isNull(priceObject.value)) {
    // console.error('Price object value is undefined')
    return { result: 0 };
  }
  const normalizedQuantity = toFiscalQuantity(calculatedQuantity);
  const normalizedMinimumOrder = toFiscalQuantity(minimumOrder);
  const isBelowMinimum = normalizedQuantity < normalizedMinimumOrder;
  const billingQuantity = isBelowMinimum
    ? normalizedMinimumOrder
    : normalizedQuantity;
  const minimumOrderShort = isBelowMinimum
    ? toFiscalQuantity(normalizedMinimumOrder - normalizedQuantity)
    : undefined;

  const unitPriceMajor = toFiscalUnitPrice(fromMinorUnits(priceObject.value));
  const subtotalMajor = toFiscalTotal(unitPriceMajor * billingQuantity);
  const subtotalMinor = toMinorUnits(subtotalMajor);

  const discountedTotal = calculateDiscount(
    subtotalMinor,
    discount,
    customerDiscount,
    expressPercent,
  );

  const fiscalQuantityForPrecision = (() => {
    if (!isUndefined(fiscalQuantityOverride) && fiscalQuantityOverride > 0)
      return toFiscalQuantity(fiscalQuantityOverride);
    return billingQuantity;
  })();

  const fiscalResult = enforceFiscalTotalPrecision(
    discountedTotal,
    fiscalQuantityForPrecision,
  );

  return { result: fiscalResult, minimumOrderShort };
}

export function calculateDiscount(
  calcPrice: number,
  discount: number,
  customerDiscount?: number,
  expressPercent?: number,
): number {
  // First apply express markup if provided
  let price = calcPrice;
  if (expressPercent && expressPercent > 0) {
    const expressMarkup = Math.floor(calcPrice * (expressPercent / 100));
    price = calcPrice + expressMarkup;
  }

  if (customerDiscount) {
    const customerDiscountValue = customerDiscount;
    const customerDiscountedAmount = Math.floor(
      price * (customerDiscountValue / 100),
    );

    if (!Number.isInteger(customerDiscountValue) || customerDiscountValue <= 0)
      return price;

    const calcDiscount = Math.floor(price - customerDiscountedAmount);
    if (calcDiscount <= 0) return 0;

    return calcDiscount;
  }

  if (isUndefined(discount) || discount === 0) return price;
  if (!Number.isInteger(discount) || discount <= 0) return price;

  const discountValue = discount;
  const discountedAmount = Math.floor(price * (discountValue / 100));

  const calcDiscount = Math.floor(price - discountedAmount);
  if (calcDiscount <= 0) return 0;

  return calcDiscount;
}

export function applyPromotion(
  promotion: Promotion,
  items?: OrderItem[],
  shippingCost?: number,
  total?: number,
  campaign?: Campaign,
  existingDiscount?: Discount | null,
  userId?: string,
  orderSubtotal?: number,
  currency?: CurrencyCode,
  ruleContext?: PromotionRuleContext,
): {
  itemsWithDiscount?: OrderItem[];
  discount?: Discount;
  removedCodes?: string[];
} {
  const isValid = validatePromotion(promotion, campaign);
  if (!isValid) return {};
  const { discount, itemsWithDiscount, removedCodes } =
    getDiscountFromPromotion(
      promotion,
      total ?? shippingCost,
      items,
      existingDiscount,
      userId,
      orderSubtotal,
      currency,
      ruleContext,
    );
  if (discount) return { discount, removedCodes };
  else if (itemsWithDiscount) return { itemsWithDiscount, removedCodes };
  return {};
}

export function validatePromotionRules(
  rules: PromotionRule[],
  productId: string,
  categoryId: string,
  currency: CurrencyCode,
  userId?: string,
  ruleContext?: PromotionRuleContext,
): boolean {
  const itemValues = {
    PRODUCT: productId,
    PRODUCT_TYPE: ruleContext?.productTypeId,
    CATEGORY: categoryId,
    CATEOGRY: categoryId,
    CHANNEL: ruleContext?.channelId,
    CURRENCY: currency,
    USER: userId,
    CUSTOMER_GROUP: ruleContext?.customerGroupIds,
    FIRST_ORDER: ruleContext?.isFirstOrder,
    USAGE_COUNT: ruleContext?.usageCount,
  };

  return rules.every((rule) => {
    const { attribute, operator, values } = rule;

    if (!attribute || !operator || !values || values.length === 0) {
      return false;
    }

    const value = itemValues[attribute as keyof typeof itemValues];
    if (value === undefined || value === null || values[0] === undefined) {
      return false;
    }

    return validatePromotionRuleValue(value, operator, values);
  });
}

type PromotionRuleComparableValue = string | number | boolean | string[];

function validatePromotionRuleValue(
  value: PromotionRuleComparableValue,
  operator: PromotionRule["operator"],
  values: string[],
): boolean {
  const firstValue = values[0];

  if (firstValue === undefined) return false;

  if (Array.isArray(value)) {
    const matchesAny = value.some((entry) => values.includes(entry));

    switch (operator) {
      case "EQ":
      case "IN":
        return matchesAny;
      case "NE":
        return !matchesAny;
      default:
        return false;
    }
  }

  if (typeof value === "number") {
    const numericValue = Number(firstValue);
    if (!Number.isFinite(numericValue)) return false;

    switch (operator) {
      case "GT":
        return value > numericValue;
      case "LT":
        return value < numericValue;
      case "EQ":
        return value === numericValue;
      case "NE":
        return value !== numericValue;
      case "IN":
        return values.some(
          (promotionValue) => Number(promotionValue) === value,
        );
      case "LTE":
        return value <= numericValue;
      case "GTE":
        return value >= numericValue;
      default:
        return false;
    }
  }

  if (typeof value === "boolean") {
    const formattedValue = String(value);

    switch (operator) {
      case "EQ":
        return formattedValue === firstValue;
      case "NE":
        return formattedValue !== firstValue;
      case "IN":
        return values.includes(formattedValue);
      default:
        return false;
    }
  }

  switch (operator) {
    case "GT":
      return value > firstValue;
    case "LT":
      return value < firstValue;
    case "EQ":
      return value === firstValue;
    case "NE":
      return value !== firstValue;
    case "IN":
      return values.some((promotionValue) => promotionValue === value);
    case "LTE":
      return value <= firstValue;
    case "GTE":
      return value >= firstValue;
    default:
      return false;
  }
}
