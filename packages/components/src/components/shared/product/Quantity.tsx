"use client";

import { Box, Button, Input, Text } from "@chakra-ui/react";
import {
  Configuration,
  CurrencyCode,
  CurrencyEnum,
  CurrencySettings,
  IDiscount,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  Product,
  QuantityOptions,
  SelectOption,
  SpecOverrides,
  Unit,
  type UnitId,
} from "@konfi/types";
import {
  applyProductPriceOffsets,
  calculateConfiguredProductPrice,
  DEFAULT_COMBINATION,
  getPageCountPricingMode,
  getPrintTypeIcon,
  isMatrixLikePriceType,
  type QuantityOptionPriceThreshold,
  isStepViolation,
  resolvePageCountConfigForSelection,
  scaleForStepValidation,
  validateQuantityOptions,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Firestore } from "firebase/firestore";
import { i18n, TFunction } from "i18next";
import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { Field } from "../../ui";
import { InputGroup } from "../../ui/input-group";
import { VolumeList } from "./VolumeList";

const MemoizedVolumeList = memo(VolumeList);

type QuantityListOption = {
  label: string;
  value: string;
  icon?: string;
  totalPrice?: number;
  currency?: CurrencyCode;
  unit?: UnitId;
  deliveryTime?: number;
  disabled?: boolean;
  priceThreshold?: QuantityOptionPriceThreshold;
};

function applyEffectivePrices(
  product: Product,
  prices: Product["prices"] | undefined,
  calculatedCombination: string,
  pageCount?: number | null,
  options?: {
    selectedAttributeOptions?: Record<string, string | number> | null;
    volume?: number;
  },
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

function hasExplicitUsableMatrixSelection(
  prices: Price[],
  combinationId: string | null | undefined,
  volumeValue: number | undefined,
): boolean {
  if (!combinationId || isUndefined(volumeValue)) {
    return false;
  }

  return prices.some(
    (price) =>
      price.combination?.id === combinationId &&
      price.volume?.value === volumeValue &&
      price.combination?.active !== false &&
      typeof price.value === "number" &&
      Number.isFinite(price.value) &&
      price.value >= 0,
  );
}

function hasExplicitUnavailableMatrixSelection(
  prices: Price[],
  combinationId: string | null | undefined,
  volumeValue: number | undefined,
): boolean {
  if (!combinationId || isUndefined(volumeValue)) {
    return false;
  }

  return prices.some(
    (price) =>
      price.combination?.id === combinationId &&
      price.volume?.value === volumeValue &&
      (price.combination?.active === false ||
        typeof price.value !== "number" ||
        !Number.isFinite(price.value) ||
        price.value <= 0),
  );
}

function findFirstUsableMatrixOption(
  options: SelectOption[],
  prices: Price[],
  combinationId: string | null | undefined,
): SelectOption | null {
  for (const option of options) {
    const optionVolume = Number(option.value);

    if (
      Number.isFinite(optionVolume) &&
      hasExplicitUsableMatrixSelection(prices, combinationId, optionVolume)
    ) {
      return option;
    }
  }

  return null;
}

type Props = {
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  product: Product;
  baseSpec?: Product["spec"];
  resolvedPrices?: Product["prices"];
  channelId?: string;
  firestore: Firestore;
  db?: typeof import("@konfi/firebase").db;
  getDoc?: typeof import("@konfi/firebase").getDoc;
  volume: Configuration["volume"];
  quantity: Configuration["quantity"];
  calculatedCombination: Configuration["calculatedCombination"];
  combination?: Configuration["combination"];
  selectedAttributeOptions?: Configuration["selectedAttributeOptions"];
  width: Configuration["width"];
  height: Configuration["height"];
  customFormat: Configuration["customFormat"];
  discount?: IDiscount;
  unit?: UnitId;
  customPrice?: number | null;
  customerDiscount?: number;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  expressPercent?: number;
  pageCount?: number | null;
  allowOutOfSpec?: boolean;
  onOverrideWarning?: (payload: {
    key: keyof SpecOverrides;
    value: number;
    min?: number;
    max?: number;
    step?: number;
  }) => Promise<void>;
  t: TFunction;
  i18n: i18n;
};

export const Quantity = memo(function Quantity({
  updateConfiguration,
  product,
  baseSpec,
  resolvedPrices,
  channelId,
  firestore,
  db,
  getDoc,
  volume,
  quantity,
  calculatedCombination,
  combination,
  selectedAttributeOptions,
  width,
  height,
  customFormat,
  discount,
  unit,
  customPrice,
  customerDiscount,
  displayCurrency,
  currencySettings,
  expressPercent,
  pageCount,
  allowOutOfSpec,
  onOverrideWarning,
  t,
  i18n,
}: Props) {
  const pageCountPricingMode = getPageCountPricingMode(
    product.pageCount?.pricing,
  );
  const shouldFetchPrices =
    !product.disablePriceFetch &&
    (!resolvedPrices ||
      product.priceType === PriceTypeEnum.DYNAMIC ||
      pageCountPricingMode === "exact" ||
      pageCountPricingMode === "segmented" ||
      Boolean(
        product.pageCount?.enabled &&
        pageCountPricingMode === "step" &&
        !product.pageCount.pricing?.stepPrices?.length,
      ));
  const dynamicPricingCacheKey = useMemo(() => {
    if (product.priceType !== PriceTypeEnum.DYNAMIC) return null;
    try {
      return JSON.stringify(product.dynamicPricing ?? null);
    } catch {
      return null;
    }
  }, [product.priceType, product.dynamicPricing]);
  const selectedAttributeOptionsKey = useMemo(() => {
    if (product.priceType !== PriceTypeEnum.DYNAMIC) return null;
    try {
      return JSON.stringify(selectedAttributeOptions ?? null);
    } catch {
      return null;
    }
  }, [product.priceType, selectedAttributeOptions]);
  const priceOffsetsCacheKey = useMemo(() => {
    try {
      return JSON.stringify(product.priceOffsets ?? null);
    } catch {
      return "unserializable-price-offsets";
    }
  }, [product.priceOffsets]);
  const dynamicPricingContextKey = useMemo(() => {
    if (product.priceType !== PriceTypeEnum.DYNAMIC) return null;
    try {
      return JSON.stringify({
        customFormat,
        height: height ?? null,
        pageCount: pageCount ?? null,
        quantity: quantity ?? null,
        volume: volume ?? null,
        width: width ?? null,
      });
    } catch {
      return null;
    }
  }, [
    customFormat,
    height,
    pageCount,
    product.priceType,
    quantity,
    volume,
    width,
  ]);
  const emptyPriceRetryRef = useRef(false);
  const {
    data: fetchedConfiguredPrices,
    isValidating,
    mutate,
  } = useSWR(
    shouldFetchPrices
      ? [
          product.id,
          channelId,
          calculatedCombination,
          product.priceType === PriceTypeEnum.DYNAMIC ||
          pageCountPricingMode === "exact" ||
          pageCountPricingMode === "segmented"
            ? (pageCount ?? null)
            : "base",
          dynamicPricingCacheKey,
          dynamicPricingContextKey,
          combination ?? null,
          selectedAttributeOptionsKey,
          priceOffsetsCacheKey,
        ]
      : null,
    async () =>
      await (
        await import("./Price")
      ).fetchConfiguredPrices(
        firestore,
        product,
        calculatedCombination || DEFAULT_COMBINATION,
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
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
      shouldRetryOnError: true,
      errorRetryCount: 2,
    },
  );
  const prices = useMemo(() => {
    if (shouldFetchPrices) return fetchedConfiguredPrices?.prices || [];
    if (resolvedPrices) {
      return (
        applyEffectivePrices(
          product,
          resolvedPrices,
          calculatedCombination || DEFAULT_COMBINATION,
          pageCount,
          {
            selectedAttributeOptions,
            volume,
          },
        ) ?? []
      );
    }

    // For external SINGLE products, synthesize a price from customPrice/defaultPrice
    if (product.priceType === PriceTypeEnum.SINGLE) {
      if (typeof customPrice === "number" && customPrice > 0) {
        return (
          applyEffectivePrices(
            product,
            [
              {
                value: customPrice,
                currency: product.defaultPrice?.currency ?? CurrencyEnum.PLN,
              } as Price,
            ],
            calculatedCombination || DEFAULT_COMBINATION,
            pageCount,
            {
              selectedAttributeOptions,
              volume,
            },
          ) ?? []
        );
      }
      if (product.defaultPrice) {
        return (
          applyEffectivePrices(
            product,
            [product.defaultPrice as unknown as Price],
            calculatedCombination || DEFAULT_COMBINATION,
            pageCount,
            {
              selectedAttributeOptions,
              volume,
            },
          ) ?? []
        );
      }
    }
    return [];
  }, [
    resolvedPrices,
    shouldFetchPrices,
    fetchedConfiguredPrices,
    product,
    customPrice,
    calculatedCombination,
    pageCount,
    selectedAttributeOptions,
    volume,
  ]);
  const pageCountConfig = useMemo(() => {
    if (!product.pageCount) {
      return undefined;
    }

    const stepPrices = fetchedConfiguredPrices?.pageCountStepPrices;
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
    fetchedConfiguredPrices?.pageCountStepPrices,
    pageCountPricingMode,
    product,
    selectedAttributeOptions,
  ]);
  const { spec, volumes, priceType, designSpec } = product;
  const base = baseSpec ?? product.spec;
  const [customVolume, setCustomVolume] = useState<string>("");
  const [options, setOptions] = useState<QuantityListOption[]>([]);
  const [_, updateQuantityOptions] = useReducer(
    (prev: QuantityOptions, next: Partial<QuantityOptions>) => {
      const updatedOptions = validateQuantityOptions(
        prev,
        next,
        options,
        setOptions,
      );
      return updatedOptions || prev; // Return prev if updatedOptions is undefined
    },
    {
      volume,
      volumes,
      quantity,
      prices,
      priceType,
      discount,
      calculatedCombination,
      customFormat,
      width,
      height,
      minimumOrder: spec.minimumOrder,
      customPrice,
      customVolumes: [],
      bleed: designSpec?.bleed,
      includeBleed: designSpec?.includeBleed,
      customerDiscount,
      expressPercent,
      pageCount,
      pageCountConfig,
      selectedAttributeOptions,
    },
  );
  const { minimumOrder, maximumOrder, step } = spec;
  const {
    minimumOrder: baseMinimumOrder,
    maximumOrder: baseMaximumOrder,
    step: baseStep,
  } = base;
  const [value, updateValue] = useReducer(
    (prev: SelectOption | null, next: SelectOption | null) => {
      if (isUndefined(next) || isNull(next)) return prev;
      if (
        typeof next === "object" &&
        next !== null &&
        "value" in next &&
        "label" in next
      ) {
        return next;
      }
      if (process.env.NODE_ENV === "development") {
        console.error("Reducer received invalid 'next' value:", next);
      }
      return prev;
    },
    null,
  );
  const [error, setError] = useState<string>("");
  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => Number(a.value) - Number(b.value)),
    [options],
  );
  const [customVolumes, setCustomVolumes] = useState<number[]>(
    volumes.find(
      (_volume) =>
        _volume.value ===
        Number(isMatrixLikePriceType(priceType) ? volume : quantity),
    )
      ? []
      : Number(isMatrixLikePriceType(priceType) ? volume : quantity)
        ? [Number(isMatrixLikePriceType(priceType) ? volume : quantity)]
        : [],
  );
  const addVolumeInFlightRef = useRef(false);

  useEffect(() => {
    emptyPriceRetryRef.current = false;
  }, [
    calculatedCombination,
    customFormat,
    dynamicPricingContextKey,
    pageCount,
    priceOffsetsCacheKey,
    product.id,
    selectedAttributeOptionsKey,
  ]);

  useEffect(() => {
    if (!shouldFetchPrices || isValidating) return;

    if (
      !isMatrixLikePriceType(product.priceType) &&
      product.priceType !== PriceTypeEnum.THRESHOLD
    ) {
      return;
    }

    const hasFetchedPrices =
      Array.isArray(fetchedConfiguredPrices?.prices) &&
      fetchedConfiguredPrices.prices.length > 0;

    if (hasFetchedPrices) {
      emptyPriceRetryRef.current = false;
      return;
    }

    if (emptyPriceRetryRef.current) return;

    emptyPriceRetryRef.current = true;
    void mutate();
  }, [
    shouldFetchPrices,
    isValidating,
    product.priceType,
    fetchedConfiguredPrices,
    mutate,
  ]);

  // Init
  useEffect(() => {
    if (isValidating) return;
    startTransition(() => {
      updateQuantityOptions({
        prices,
        volume,
        quantity,
        calculatedCombination,
        customFormat,
        width,
        height,
        discount,
        volumes,
        customVolumes,
        customPrice,
        unit,
        bleed: designSpec?.bleed,
        includeBleed: designSpec?.includeBleed,
        customerDiscount: customerDiscount,
        expressPercent,
        pageCount,
        pageCountConfig,
        selectedAttributeOptions,
      });
    });
  }, [
    prices,
    volume,
    quantity,
    isValidating,
    customPrice,
    discount,
    unit,
    volumes,
    product,
    width,
    height,
    pageCount,
    pageCountConfig,
    selectedAttributeOptions,
  ]);

  // Refresh
  useEffect(() => {
    if (isValidating) return;
    startTransition(() => {
      updateQuantityOptions({
        prices,
        volume,
        quantity,
        calculatedCombination,
        customFormat,
        width,
        height,
        discount,
        customVolumes,
        customPrice,
        unit,
        bleed: designSpec?.bleed,
        includeBleed: designSpec?.includeBleed,
        customerDiscount: customerDiscount,
        expressPercent,
        pageCount,
        pageCountConfig,
        selectedAttributeOptions,
      });
    });
  }, [
    prices,
    isValidating,
    volume,
    quantity,
    calculatedCombination,
    width,
    height,
    customFormat,
    customVolumes,
    discount,
    expressPercent,
    pageCount,
    pageCountConfig,
    selectedAttributeOptions,
  ]);

  useEffect(() => {
    if (isEmpty(options)) return; // Wait for options

    let initialOption: SelectOption | null = null;
    const currentPropValue = isMatrixLikePriceType(priceType)
      ? volume
      : quantity;
    const currentOption = !isUndefined(currentPropValue)
      ? (options.find(
          (opt) => String(opt.value) === String(currentPropValue),
        ) ?? null)
      : null;
    const currentMatrixSelectionUnavailable =
      isMatrixLikePriceType(priceType) &&
      hasExplicitUnavailableMatrixSelection(
        prices,
        calculatedCombination,
        volume,
      );
    const currentMatrixSelectionDisabled =
      isMatrixLikePriceType(priceType) && currentOption?.disabled === true;

    if (!isUndefined(currentPropValue)) {
      // Try to find an option matching the current prop (volume or quantity)
      initialOption = currentOption;
    }

    if (currentMatrixSelectionUnavailable || currentMatrixSelectionDisabled) {
      initialOption = null;
    }

    // If no match found from props, or props were undefined, select the first available option
    if (isNull(initialOption) && options.length > 0) {
      initialOption =
        (isMatrixLikePriceType(priceType)
          ? findFirstUsableMatrixOption(options, prices, calculatedCombination)
          : null) ??
        options.find((opt) => !opt.disabled) ??
        options[0];
    }

    if (
      isMatrixLikePriceType(priceType) &&
      (isNull(currentOption) ||
        currentMatrixSelectionUnavailable ||
        currentMatrixSelectionDisabled) &&
      !isNull(initialOption)
    ) {
      const nextVolume = Number(initialOption.value);

      if (Number.isFinite(nextVolume) && nextVolume > 0) {
        updateConfiguration({
          volume: nextVolume,
          selectedAttributeOptions: {
            volume: nextVolume,
          },
        });
      }
    }

    // Only update if the determined initialOption is different from the current value state
    if (value?.value !== initialOption?.value) {
      updateValue(initialOption);
    }

    // Dependencies: Run when options load, or relevant external props change
    // DO NOT include the local 'value' state here to avoid loops.
  }, [
    calculatedCombination,
    options,
    priceType,
    prices,
    quantity,
    updateConfiguration,
    volume,
  ]);

  if (
    (isMatrixLikePriceType(product.priceType) &&
      (isUndefined(volumes) || isUndefined(volume))) ||
    isUndefined(quantity)
  )
    return null;

  async function handleAddVolume() {
    if (isValidating || addVolumeInFlightRef.current) return;
    setError("");
    // Convert comma to dot and parse to number
    const sanitizedVolume = customVolume.replace(",", ".");
    const _customVolume = Number(sanitizedVolume);

    const hasMin = typeof baseMinimumOrder === "number";
    const hasMax = typeof baseMaximumOrder === "number";
    const scaledVolume = scaleForStepValidation(_customVolume);
    const scaledMin = hasMin ? scaleForStepValidation(baseMinimumOrder) : null;
    const scaledMax = hasMax ? scaleForStepValidation(baseMaximumOrder) : null;
    const violatesMin =
      hasMin && scaledMin !== null && scaledVolume < scaledMin;
    const violatesMax =
      hasMax && scaledMax !== null && scaledVolume > scaledMax;

    if ((violatesMin || violatesMax) && !allowOutOfSpec) {
      setError(t("quantity.error.inRange", { minimumOrder, maximumOrder }));
      return;
    }

    // Check if volume exists by comparing numeric values instead of strings
    if (options.some((option) => Number(option.value) === _customVolume)) {
      setError(t("quantity.error.alreadyExists"));
      return;
    }

    // Use a tolerance-based approach to handle floating-point precision issues
    const hasStep = typeof baseStep === "number";
    const isExactMin =
      typeof baseMinimumOrder === "number" &&
      scaledMin !== null &&
      scaledVolume === scaledMin;
    const violatesStep =
      hasStep && !isExactMin && isStepViolation(_customVolume, 0, baseStep);

    if (violatesStep && !allowOutOfSpec) {
      setError(t("quantity.error.steps", { step }));
      return;
    }

    const _totalPrice = calculateConfiguredProductPrice({
      quantity,
      prices,
      priceType: product.priceType,
      discount: discount?.discountValue ?? undefined,
      calculatedCombination: calculatedCombination ?? undefined,
      volume: _customVolume,
      customFormat,
      width,
      height,
      minimumOrder: product.spec.minimumOrder,
      customPrice,
      bleed: product.designSpec?.includeBleed
        ? product.designSpec.bleed
        : undefined,
      customerDiscount,
      expressPercent,
      pageCount,
      pageCountConfig,
      selectedAttributeOptions,
    }).result;
    const hasResolvedTotalPrice =
      typeof _totalPrice === "number" && Number.isFinite(_totalPrice);

    if (!hasResolvedTotalPrice) {
      setError(t("quantity.error.notAvailable"));
      return;
    }

    addVolumeInFlightRef.current = true;
    try {
      let _options = options;

      if (allowOutOfSpec && onOverrideWarning) {
        let overrideKey: keyof SpecOverrides | null = null;
        if (violatesMin) overrideKey = "minimumOrder";
        if (violatesMax) overrideKey = "maximumOrder";
        if (!overrideKey && violatesStep) overrideKey = "step";
        if (overrideKey) {
          await onOverrideWarning({
            key: overrideKey,
            value: _customVolume,
            min: baseMinimumOrder,
            max: baseMaximumOrder,
            step: baseStep,
          });
        }
      }

      const _volume = volumes.find((volume) => volume.value < _customVolume);

      const icon = getPrintTypeIcon(
        _volume?.printType ?? PrintingMethod.DIGITAL,
      );
      _options.push({
        label: sanitizedVolume,
        value: sanitizedVolume,
        icon,
        totalPrice: _totalPrice,
        currency:
          prices.find((price) => typeof price.currency === "string")
            ?.currency ??
          product.defaultPrice?.currency ??
          CurrencyEnum.PLN,
        unit: unit ?? Unit.PCS,
        deliveryTime:
          (prices &&
            prices.find(
              (price: Price) => price.combination?.id === calculatedCombination,
            )?.volume?.deliveryTime) ??
          2,
        disabled: false,
        priceThreshold: undefined,
      });
      startTransition(() => {
        setOptions(_options);
        setCustomVolumes((prev) => [...prev, _customVolume]);
        handleOnChange({ label: sanitizedVolume, value: sanitizedVolume });
        setCustomVolume("");
      });
    } finally {
      addVolumeInFlightRef.current = false;
    }
  }

  function handleOnChange(option: SelectOption | null) {
    if (isUndefined(option)) return;
    if (isMatrixLikePriceType(product.priceType)) {
      updateConfiguration({
        volume: Number(option?.value),
        selectedAttributeOptions: {
          volume: Number(option?.value),
        },
      });
    } else updateConfiguration({ quantity: Number(option?.value) });
    updateValue(option);
  }

  function handleOnKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Submit on Enter
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAddVolume();
      return;
    }

    // Allow common control combos (copy/paste/select-all/undo/redo)
    if (e.ctrlKey || e.metaKey) return;

    // Allow navigation and editing keys
    const navKeys = new Set([
      "Backspace",
      "Delete",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Escape",
    ]);
    if (navKeys.has(e.key)) return;

    // Allow only digits and a single decimal separator (comma or dot)
    const isDigit = /[0-9]/.test(e.key);
    const isSeparator = e.key === "," || e.key === ".";

    if (isDigit) return;

    if (isSeparator) {
      // Prevent entering more than one separator
      if (/[.,]/.test(customVolume)) {
        e.preventDefault();
      }
      return;
    }

    // Block any other characters
    e.preventDefault();
  }

  // Sanitize to keep only digits and at most one decimal separator
  function sanitizeNumericInput(input: string): string {
    if (!input) return "";
    let result = input.replace(/[^0-9.,]/g, "");
    const firstSepMatch = result.match(/[.,]/);
    if (!firstSepMatch) return result;
    const firstSep = firstSepMatch[0];
    const parts = result.split(firstSep);
    const head = parts.shift() ?? "";
    const tail = parts.join("");
    const tailDigitsOnly = tail.replace(/[.,]/g, "");
    return `${head}${firstSep}${tailDigitsOnly}`;
  }

  function handleBeforeInput(e: React.FormEvent<HTMLInputElement>) {
    const ne = (e as unknown as { nativeEvent?: unknown }).nativeEvent as
      | { data?: unknown }
      | undefined;
    const data =
      ne && typeof (ne as { data?: unknown }).data === "string"
        ? ((ne as { data?: unknown }).data as string)
        : null;
    if (!data) return;
    const isDigit = /[0-9]/.test(data);
    const isSeparator = data === "," || data === ".";
    if (isDigit) return;
    if (isSeparator) {
      if (/[.,]/.test(customVolume)) {
        e.preventDefault();
      }
      return;
    }
    e.preventDefault();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const sanitized = sanitizeNumericInput(text);
    if (sanitized !== text) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? customVolume.length;
      const end = target.selectionEnd ?? customVolume.length;
      const merged = `${customVolume.slice(0, start)}${sanitized}${customVolume.slice(end)}`;
      const finalValue = sanitizeNumericInput(merged);
      setCustomVolume(finalValue);
    }
  }

  return (
    <Box w={"100%"} pt={"2"} pb={"4"}>
      <Text mb={"2"} fontSize={"xl"} fontWeight={"600"}>
        {t("quantity.heading")}
      </Text>
      <Field invalid={!!error} errorText={error} mb={error ? "3" : "0"}>
        <InputGroup
          w={"100%"}
          mb={"2"}
          endElement={
            <Button
              mr={"-0.3rem"}
              px={"1rem"}
              h={"1.75rem"}
              size={"xs"}
              colorPalette={"primary"}
              onClick={() => void handleAddVolume()}
            >
              {t("common.add")}
            </Button>
          }
        >
          <Input
            type="text"
            inputMode="decimal"
            placeholder={`${t("quantity.placeholder", { minimumOrder, maximumOrder, step })}`}
            value={customVolume}
            onChange={(e) =>
              setCustomVolume(sanitizeNumericInput(e.target.value))
            }
            onKeyDown={(e) => handleOnKeyDown(e)}
            onBeforeInput={(e) => handleBeforeInput(e)}
            onPaste={(e) => handlePaste(e)}
            _invalid={{
              borderColor: customVolume !== "" ? "--error-color" : "gray.muted",
            }}
          />
        </InputGroup>
      </Field>
      <MemoizedVolumeList
        options={sortedOptions}
        handleOnChange={handleOnChange}
        value={value}
        displayCurrency={displayCurrency}
        currencySettings={currencySettings}
        t={t}
        i18n={i18n}
      />
    </Box>
  );
});

Quantity.displayName = "Quantity";
