import { Product, CurrencyEnum } from "@konfi/types";
import { formatPrice } from "../formatters";
import { isUndefined, isNull } from "es-toolkit";

export function getLowPrice(
  prices: Product["prices"],
  minOrder: number,
  pricePerMinOrder?: boolean,
  noCurrency?: boolean,
  lng?: string,
) {
  const pricesWithoutNaN = prices?.filter(
    (price) =>
      !isUndefined(price.value) && !isNull(price.value) && !isNaN(price.value),
  );
  const price = pricesWithoutNaN?.reduce((a, b) =>
    (a.threshold ?? 0) < (b.threshold ?? 0)
      ? a
      : (a.value ? a.value : 0) * (a.volume?.value ?? minOrder) <
          (b.value ? b.value : 0) * (b.volume?.value ?? minOrder)
        ? a
        : b,
  );
  if (isUndefined(price.value) || isNull(price.value))
    return formatPrice(0, CurrencyEnum.PLN, undefined, undefined, lng);
  const formattedPrice = formatPrice(
    pricePerMinOrder ? price.value * minOrder : price.value,
    noCurrency ? undefined : CurrencyEnum.PLN,
    undefined,
    undefined,
    lng,
  );
  return formattedPrice;
}

export function getLowPriceWithObject(
  prices: Product["prices"],
  minOrder: number,
  pricePerMinOrder?: boolean,
  noCurrency?: boolean,
  lng?: string,
) {
  const pricesWithoutNaN = prices?.filter(
    (price) =>
      !isUndefined(price.value) && !isNull(price.value) && !isNaN(price.value),
  );
  const price = pricesWithoutNaN?.reduce((a, b) =>
    (a.threshold ?? 0) < (b.threshold ?? 0)
      ? a
      : (a.value ? a.value : 0) * (a.volume?.value ?? minOrder) <
          (b.value ? b.value : 0) * (b.volume?.value ?? minOrder)
        ? a
        : b,
  );
  if (isUndefined(price.value) || isNull(price.value))
    return {
      formattedPrice: formatPrice(
        0,
        CurrencyEnum.PLN,
        undefined,
        undefined,
        lng,
      ),
      price,
    };
  const formattedPrice = formatPrice(
    pricePerMinOrder ? price.value * minOrder : price.value,
    noCurrency ? undefined : CurrencyEnum.PLN,
    undefined,
    undefined,
    lng,
  );
  return { formattedPrice, price };
}
