import {
  type CurrencyCode,
  PrintingMethod,
  QuantityOptions,
  type UnitId,
} from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { findLast, isEmpty } from "es-toolkit/compat";
import { getQuantityOptions } from "../getters";
import {
  getQuantityOption,
  type QuantityOptionPriceThreshold,
} from "../getters/get-quantity-options";
import { isMatrixLikePriceType } from "../price-types";

export function validateQuantityOptions(
  prev: QuantityOptions,
  next: Partial<QuantityOptions>,
  options: {
    label: string;
    value: string;
    icon?: string;
    totalPrice?: number;
    currency?: CurrencyCode;
    unit?: UnitId;
    deliveryTime?: number;
    bleed?: number;
    includeBleed?: boolean;
    disabled?: boolean;
    priceThreshold?: QuantityOptionPriceThreshold;
  }[],
  setOptions: React.Dispatch<
    React.SetStateAction<
      {
        label: string;
        value: string;
        icon?: string;
        totalPrice?: number;
        currency?: CurrencyCode;
        unit?: UnitId;
        deliveryTime?: number;
        bleed?: number;
        includeBleed?: boolean;
        disabled?: boolean;
        priceThreshold?: QuantityOptionPriceThreshold;
      }[]
    >
  >,
) {
  const newQuantityOptions = { ...prev, ...next };

  if (isMatrixLikePriceType(newQuantityOptions.priceType)) {
    // For MATRIX-like price types (MATRIX, DYNAMIC), volume may be undefined
    // during initial hydration of a fresh preview or new-product form. We still
    // need to compute options so the caller can auto-select the first usable
    // one. Only require `quantity` to be defined.
    if (isUndefined(newQuantityOptions.quantity)) return prev;
  } else {
    if (isUndefined(newQuantityOptions.quantity)) return prev;
  }

  if (
    isUndefined(newQuantityOptions.volumes) ||
    isUndefined(newQuantityOptions.prices) ||
    isUndefined(newQuantityOptions.quantity) ||
    isUndefined(newQuantityOptions.priceType) ||
    isUndefined(newQuantityOptions.customFormat) ||
    isUndefined(newQuantityOptions.minimumOrder)
  )
    return prev;

  let _options = getQuantityOptions(
    newQuantityOptions.volumes,
    newQuantityOptions.quantity,
    newQuantityOptions.priceType,
    newQuantityOptions.customFormat,
    newQuantityOptions.minimumOrder,
    newQuantityOptions.discount,
    newQuantityOptions.calculatedCombination,
    newQuantityOptions.prices,
    newQuantityOptions.width,
    newQuantityOptions.height,
    newQuantityOptions.customPrice,
    newQuantityOptions.unit,
    newQuantityOptions.includeBleed ? newQuantityOptions.bleed : undefined,
    newQuantityOptions.customerDiscount,
    newQuantityOptions.expressPercent,
    newQuantityOptions.pageCount,
    newQuantityOptions.pageCountConfig,
    newQuantityOptions.selectedAttributeOptions,
  );

  const sortedVolumes = [...newQuantityOptions.volumes].sort(
    (left, right) => left.value - right.value,
  );
  const baseVolumeValues = new Set(sortedVolumes.map((volume) => volume.value));

  const getPrintTypeForVolume = (customVolume: number) => {
    const exactVolume = sortedVolumes.find(
      (volume) => volume.value === customVolume,
    );

    if (exactVolume?.printType) return exactVolume.printType;

    const lowerThreshold = findLast(
      sortedVolumes,
      (volume) => volume.value <= customVolume,
    );

    return (
      lowerThreshold?.printType ??
      sortedVolumes[0]?.printType ??
      PrintingMethod.DIGITAL
    );
  };

  const addCustomOption = (customVolume: number) => {
    if (
      isUndefined(_options.find((option) => option.value === `${customVolume}`))
    ) {
      _options.push(
        getQuantityOption(
          Number(customVolume),
          getPrintTypeForVolume(customVolume),
          newQuantityOptions.quantity,
          newQuantityOptions.priceType,
          newQuantityOptions.customFormat,
          newQuantityOptions.minimumOrder,
          newQuantityOptions.discount,
          newQuantityOptions.calculatedCombination,
          newQuantityOptions.prices,
          newQuantityOptions.width,
          newQuantityOptions.height,
          newQuantityOptions.customPrice,
          newQuantityOptions.unit,
          newQuantityOptions.includeBleed
            ? newQuantityOptions.bleed
            : undefined,
          newQuantityOptions.customerDiscount,
          newQuantityOptions.expressPercent,
          isMatrixLikePriceType(newQuantityOptions.priceType),
          newQuantityOptions.pageCount,
          newQuantityOptions.pageCountConfig,
          newQuantityOptions.selectedAttributeOptions,
        ),
      );
    }
  };

  const hasCurrentVolume = !isUndefined(newQuantityOptions.volume);
  // We use the currently selected volume in two different scenarios:
  // 1) Initial hydration (isEmpty(options)):
  //    When the component is first hydrated and no options have been built yet,
  //    we must preserve the existing volume selection from persisted state (e.g. cart, draft).
  //    This applies to all price types, because at this point the UI has no derived options
  //    to infer the selection from, so we need to synthesize one that matches `volume`.
  // 2) Existing options with MATRIX price type:
  //    For MATRIX price types, `volume` is an explicit selector into the price matrix and
  //    can represent a value that is not part of the base `volumes` list. Even after options
  //    have been generated, we still need to ensure that the currently selected `volume`
  //    is present as an option, so the user can re-select or keep it.
  //    For non‑MATRIX price types, once options exist they are fully determined by `volumes`
  //    and `quantity`, so the initial `volume` is only needed to seed the first set of options
  //    and should not force an extra ad‑hoc option afterwards.
  const shouldAddCurrentVolume =
    hasCurrentVolume &&
    (isEmpty(options) || isMatrixLikePriceType(newQuantityOptions.priceType));

  if (shouldAddCurrentVolume) {
    addCustomOption(Number(newQuantityOptions.volume));
  }

  if (
    newQuantityOptions.customVolumes &&
    !isEmpty(newQuantityOptions.customVolumes)
  ) {
    newQuantityOptions.customVolumes.forEach((customVolume) => {
      addCustomOption(Number(customVolume));
    });
  }

  _options = _options.filter((option) => {
    const optionVolume = Number(option.value);
    const isBaseMatrixOption =
      Number.isFinite(optionVolume) && baseVolumeValues.has(optionVolume);
    // A total price of exactly 0 is legitimate (e.g. a DYNAMIC product with a
    // zero base price and no rules yet). `disabled`/`undefined` already mark
    // truly unresolved options, so we do NOT treat 0 as invalid here.
    const hasValidTotalPrice =
      option.totalPrice !== undefined &&
      option.totalPrice !== null &&
      !isNaN(option.totalPrice);

    if (isMatrixLikePriceType(newQuantityOptions.priceType)) {
      return (
        (isBaseMatrixOption && option.disabled === true) || hasValidTotalPrice
      );
    }

    return hasValidTotalPrice;
  });

  setOptions(_options);

  return newQuantityOptions;
}
