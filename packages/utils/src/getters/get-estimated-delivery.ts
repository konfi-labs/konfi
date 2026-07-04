import { OrderItem, Price, PriceTypeEnum } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { calculateQuantity, getThresholdsPrice } from "../price";
import { isMatrixLikePriceType } from "../price-types";

export function calculateEstimatedDelivery(
  timeToDeliver: number,
  currentDate?: Date,
): Date | null {
  if (timeToDeliver === 0) return null;

  let workDay = currentDate || new Date();

  // Adjust for after-hours
  if (workDay.getHours() >= 16) {
    workDay.setDate(workDay.getDate() + 1);
  }

  // Public holidays
  const year = workDay.getFullYear();
  const publicHolidays = [
    new Date(year, 0, 1),
    new Date(year, 0, 6),
    new Date(year, 3, 21),
    new Date(year, 4, 1),
    new Date(year, 4, 3),
    new Date(year, 4, 19),
    new Date(year, 4, 30),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
  ];

  const isHoliday = (date: Date) => {
    return publicHolidays.some(
      (h) =>
        h.getDate() === date.getDate() &&
        h.getMonth() === date.getMonth() &&
        h.getFullYear() === date.getFullYear(),
    );
  };

  // Skip weekends and public holidays
  const skipNonWorkingDays = (date: Date) => {
    while (
      date.getDay() === 6 || // Saturday
      date.getDay() === 0 || // Sunday
      isHoliday(date)
    ) {
      date.setDate(date.getDate() + 1);
    }
  };

  skipNonWorkingDays(workDay);

  // Calculate estimated delivery date
  let estimatedDelivery = new Date(workDay);

  while (timeToDeliver > 0) {
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);

    // Skip weekends and public holidays
    if (
      estimatedDelivery.getDay() === 6 || // Saturday
      estimatedDelivery.getDay() === 0 || // Sunday
      isHoliday(estimatedDelivery)
    ) {
      continue;
    }

    timeToDeliver--;
  }

  return estimatedDelivery;
}

function shouldSkipMatrixItem(item: OrderItem): boolean {
  if (!isMatrixLikePriceType(item.product?.priceType)) {
    return false;
  }

  if (!item.product?.prices || item.product.prices.length === 0) {
    return true;
  }

  return !item.calculatedCombination;
}

function getDeadlineDeliveryTime(product: OrderItem["product"]): number {
  if (!product || !("deadlineDeliveryTime" in product)) {
    return 0;
  }

  const deadlineDeliveryTime = product.deadlineDeliveryTime;

  return typeof deadlineDeliveryTime === "number" &&
    Number.isFinite(deadlineDeliveryTime)
    ? deadlineDeliveryTime
    : 0;
}

export function getOrderItemDeliveryTime(item: OrderItem): number | undefined {
  if (shouldSkipMatrixItem(item)) {
    return undefined;
  }

  if (!isMatrixLikePriceType(item.product?.priceType)) {
    return undefined;
  }

  const product = item.product;
  if (!product) {
    return undefined;
  }

  let matchedPrice: Price | undefined;
  const matchedPrices = product.prices.filter(
    (price) => price.combination?.id === item.calculatedCombination,
  );
  if (matchedPrices.length === 0) {
    return undefined;
  }

  if (matchedPrices.length > 1) {
    if (isUndefined(item.volume)) throw new Error("Volume is undefined");
    if (!isUndefined(matchedPrices[0].threshold)) {
      const calculatedQuantity = calculateQuantity(
        item.customFormat,
        isMatrixLikePriceType(product.priceType) ? item.volume : item.quantity,
        item.width,
        item.height,
        product.designSpec?.bleed,
      );
      const thresholdPrice = getThresholdsPrice(
        matchedPrices,
        calculatedQuantity,
      );
      matchedPrice = matchedPrices.find(
        (price) => price.threshold === thresholdPrice?.threshold,
      );
    } else {
      matchedPrice = matchedPrices.find((price) => {
        return (
          !isUndefined(price.volume) &&
          !isUndefined(item.volume) &&
          price.volume.value <= item.volume
        );
      });
    }
  } else {
    matchedPrice = matchedPrices[0];
  }

  return Math.max(
    matchedPrice?.volume?.deliveryTime || 2,
    getDeadlineDeliveryTime(item.product),
  );
}

export function getEstimatedDelivery(
  items: OrderItem[] | null | undefined | number,
  processingQueue?: number,
): Date | null {
  if (isNull(items) && typeof items !== "number") return null;
  if (isUndefined(items) && typeof items !== "number") return null;
  if (isEmpty(items) && typeof items !== "number") return null;

  let timeToDeliver = 0;

  if (typeof items !== "number") {
    for (const item of items) {
      const _deliveryTime = getOrderItemDeliveryTime(item);

      if (_deliveryTime) {
        timeToDeliver = Math.max(timeToDeliver, _deliveryTime);
      }
    }
  } else {
    timeToDeliver = items;
  }

  if (processingQueue && processingQueue > timeToDeliver) {
    timeToDeliver = processingQueue;
  }

  return calculateEstimatedDelivery(timeToDeliver);
}
