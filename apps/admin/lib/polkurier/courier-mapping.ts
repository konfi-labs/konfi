import { ShippingOptions } from "@konfi/types";

type CourierOption = {
  value: string;
};

const DEFAULT_POLKURIER_COURIER = "DHL";

function normalizeCourierCode(value: string): string {
  return value.toUpperCase();
}

function isPolkurierLockerCourier(courierCode: string): boolean {
  const normalizedCode = normalizeCourierCode(courierCode);

  return (
    normalizedCode.includes("INPOST_PACZKOMAT") ||
    normalizedCode.includes("PACZKOMAT")
  );
}

export function mapShippingOptionToPolkurierCourier(
  shippingOption?: string | null,
): string {
  switch (shippingOption) {
    case ShippingOptions.INPOST:
      return "INPOST";
    case ShippingOptions.PACZKOMATY_INPOST:
      return "INPOST_PACZKOMAT";
    case ShippingOptions.DPD:
      return "DPD";
    case ShippingOptions.DHL:
      return "DHL";
    case ShippingOptions.FEDEX:
      return "FEDEX";
    default:
      return DEFAULT_POLKURIER_COURIER;
  }
}

export function findPolkurierCourierForShippingOption(
  shippingOption: string | null | undefined,
  options: CourierOption[],
): string | null {
  if (options.length === 0) {
    return null;
  }

  const preferredCourier = mapShippingOptionToPolkurierCourier(shippingOption);
  const exactMatch = options.find(
    (option) => option.value === preferredCourier,
  );
  if (exactMatch) {
    return exactMatch.value;
  }

  const preferredCourierCode = normalizeCourierCode(preferredCourier);
  const matchedOption = options.find((option) => {
    const optionCode = normalizeCourierCode(option.value);

    if (shippingOption === ShippingOptions.PACZKOMATY_INPOST) {
      return isPolkurierLockerCourier(optionCode);
    }

    if (shippingOption === ShippingOptions.INPOST) {
      return (
        optionCode.includes("INPOST") && !isPolkurierLockerCourier(optionCode)
      );
    }

    return optionCode.includes(preferredCourierCode);
  });

  return matchedOption?.value ?? null;
}
