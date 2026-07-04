"use client";

import {
  Box,
  Button,
  FormatNumber,
  HStack,
  InputGroup,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  Configuration,
  CustomSizeWithQuantity,
  PriceTypeEnum,
  Product,
  SpecOverrides,
} from "@konfi/types";
import {
  calculateQuantityForMultipleSizes,
  getRatio,
  isMatrixLikePriceType,
  isStepViolation,
  isValidHeight,
  isValidRatio,
  isValidWidth,
} from "@konfi/utils";
import { debounce } from "es-toolkit";
import { TFunction } from "i18next";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Field } from "../../ui/field";
import { NumberInputField, NumberInputRoot } from "../../ui/number-input";
import { MaterialSymbol } from "../MaterialSymbol";

const DimensionInput = memo(
  ({
    value,
    isValid,
    min,
    max,
    step,
    inputMin,
    inputMax,
    inputStep,
    onChange,
    onCommit,
    label,
    placeholder,
  }: {
    value: number;
    isValid: boolean;
    min?: number;
    max?: number;
    step: number;
    inputMin?: number;
    inputMax?: number;
    inputStep?: number;
    onChange: (value: number) => void;
    onCommit?: () => void;
    label: string;
    placeholder: string;
  }) => (
    <Field
      label={label}
      invalid={!isValid}
      helperText={`min ${min}, max ${max}, co ${step}`}
    >
      <NumberInputRoot
        w={"100%"}
        step={inputStep}
        value={value.toString()}
        min={inputMin}
        max={inputMax}
        onValueChange={({ value }) => onChange(Number(value))}
      >
        <InputGroup endAddon="mm">
          <NumberInputField
            placeholder={placeholder}
            borderColor={isValid ? "primary.solid" : undefined}
            boxShadow={
              isValid
                ? {
                    base: "0 0 0 1px var(--chakra-colors-primary-500)",
                    _dark: "0 0 0 1px var(--chakra-colors-primary-300)",
                  }
                : undefined
            }
            _hover={{
              boxShadow: "none",
              border: "1px solid",
              borderColor: "gray.muted",
            }}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onCommit?.();
              }
            }}
          />
        </InputGroup>
      </NumberInputRoot>
    </Field>
  ),
);

DimensionInput.displayName = "DimensionInput";

const isStepViolated = (
  value: number,
  minValue?: number,
  stepValue?: number,
) => {
  if (typeof minValue !== "number" || typeof stepValue !== "number")
    return false;
  return isStepViolation(value, minValue, stepValue);
};

type Props = {
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  width: number;
  height: number;
  customSizes?: CustomSizeWithQuantity[];
  product: Product;
  baseSpec?: Product["spec"];
  configuration: Configuration;
  volume?: number;
  quantity?: number;
  isStore?: boolean;
  allowOutOfSpec?: boolean;
  onOverrideWarning?: (payload: {
    key: keyof SpecOverrides;
    value: number;
    min?: number;
    max?: number;
    step?: number;
  }) => Promise<void>;
  t: TFunction;
};

export const CustomFormatInput = memo(function CustomFormatInput({
  updateConfiguration,
  width,
  height,
  customSizes = [],
  product,
  baseSpec,
  configuration,
  volume,
  quantity,
  isStore = false,
  allowOutOfSpec,
  onOverrideWarning,
  t,
}: Props) {
  const { spec } = product;
  const bleed = product.designSpec?.includeBleed
    ? product.designSpec.bleed
    : undefined;
  const base = baseSpec ?? product.spec;
  const {
    minimumWidth,
    maximumWidth,
    widthStep,
    minimumHeight,
    maximumHeight,
    heightStep,
    minimumRatio,
    maximumRatio,
  } = spec;
  const {
    minimumWidth: baseMinimumWidth,
    maximumWidth: baseMaximumWidth,
    widthStep: baseWidthStep,
    minimumHeight: baseMinimumHeight,
    maximumHeight: baseMaximumHeight,
    heightStep: baseHeightStep,
    minimumRatio: baseMinimumRatio,
    maximumRatio: baseMaximumRatio,
  } = base;

  const [currentWidth, setCurrentWidth] = useState(width);
  const [currentHeight, setCurrentHeight] = useState(height);

  // Track initial values to only warn when user actually made changes
  const initialWidthRef = useRef(width);
  const initialHeightRef = useRef(height);
  const widthWasEditedRef = useRef(false);
  const heightWasEditedRef = useRef(false);

  const isLocalChangeRef = useRef(false);
  useEffect(() => {
    if (!isLocalChangeRef.current) {
      setCurrentWidth(width);
    }
  }, [width]);

  useEffect(() => {
    if (!isLocalChangeRef.current) {
      setCurrentHeight(height);
    }
  }, [height]);

  const ratio = useMemo(
    () => getRatio(currentWidth, currentHeight),
    [currentWidth, currentHeight],
  );
  const shouldValidateRatio = useMemo(
    () =>
      product.spec.validateRatio &&
      Number.isFinite(currentWidth) &&
      currentWidth > 0 &&
      Number.isFinite(currentHeight) &&
      currentHeight > 0,
    [product.spec.validateRatio, currentHeight, currentWidth],
  );
  const isValidHeightValue = useMemo(
    () => isValidHeight(currentHeight, product, configuration),
    [currentHeight, product, configuration],
  );
  const isValidWidthValue = useMemo(
    () => isValidWidth(currentWidth, product, configuration),
    [currentWidth, product, configuration],
  );

  // Debounced update function
  const debouncedUpdate = useMemo(
    () =>
      debounce((updates: Partial<Configuration>) => {
        isLocalChangeRef.current = false;
        updateConfiguration(updates);
      }, 300),
    [updateConfiguration],
  );

  // Try to flush/cancel debounced updates if the lib supports it
  const flushDebounced = useCallback(() => {
    const anyDebounced = debouncedUpdate as unknown as {
      flush?: () => void;
      cancel?: () => void;
    };
    anyDebounced.flush?.();
    anyDebounced.cancel?.();
  }, [debouncedUpdate]);

  useEffect(() => {
    // On unmount, flush/cancel pending updates so we don't lose the last typed value
    return () => {
      flushDebounced();
    };
  }, [flushDebounced]);

  const handleUpdateWidth = useCallback(
    (value: number) => {
      isLocalChangeRef.current = true;
      widthWasEditedRef.current = true;
      setCurrentWidth(value);

      debouncedUpdate({ width: value });
    },
    [debouncedUpdate],
  );

  const handleUpdateHeight = useCallback(
    (value: number) => {
      isLocalChangeRef.current = true;
      heightWasEditedRef.current = true;
      setCurrentHeight(value);

      debouncedUpdate({ height: value });
    },
    [debouncedUpdate],
  );

  // Immediate commits for blur/Enter
  const commitWidth = useCallback(async () => {
    // Commit immediately what the user sees
    flushDebounced();
    // Only check for overrides if:
    // 1. User actually edited this field AND value differs from initial
    // 2. BOTH dimensions are > 0 (don't bother user until they've entered both)
    const valueWasChanged =
      widthWasEditedRef.current && currentWidth !== initialWidthRef.current;
    const bothDimensionsSet = currentWidth > 0 && currentHeight > 0;
    if (
      allowOutOfSpec &&
      onOverrideWarning &&
      valueWasChanged &&
      bothDimensionsSet
    ) {
      let overrideKey: keyof SpecOverrides | null = null;
      if (
        typeof baseMinimumWidth === "number" &&
        typeof baseMaximumWidth === "number"
      ) {
        if (currentWidth < baseMinimumWidth) overrideKey = "minimumWidth";
        if (currentWidth > baseMaximumWidth) overrideKey = "maximumWidth";
      }
      if (
        !overrideKey &&
        typeof baseMinimumWidth === "number" &&
        typeof baseWidthStep === "number"
      ) {
        if (isStepViolated(currentWidth, baseMinimumWidth, baseWidthStep))
          overrideKey = "widthStep";
      }
      if (!overrideKey && shouldValidateRatio) {
        const ratioValue = Number(ratio);
        const ratioMin =
          typeof baseMinimumRatio === "number"
            ? baseMinimumRatio
            : minimumRatio;
        const ratioMax =
          typeof baseMaximumRatio === "number"
            ? baseMaximumRatio
            : maximumRatio;
        if (Number.isFinite(ratioValue) && ratioValue > 0) {
          if (typeof ratioMin === "number" && ratioValue < ratioMin)
            overrideKey = "minimumRatio";
          if (
            !overrideKey &&
            typeof ratioMax === "number" &&
            ratioValue > ratioMax
          )
            overrideKey = "maximumRatio";
        }
      }
      if (overrideKey) {
        const ratioValue = Number(ratio);
        await onOverrideWarning({
          key: overrideKey,
          value:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? ratioValue
              : currentWidth,
          min:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? baseMinimumRatio
              : baseMinimumWidth,
          max:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? baseMaximumRatio
              : baseMaximumWidth,
          step: overrideKey === "widthStep" ? baseWidthStep : undefined,
        });
      }
    }
    isLocalChangeRef.current = false;
    updateConfiguration({ width: currentWidth });
  }, [
    allowOutOfSpec,
    baseMaximumRatio,
    baseMaximumWidth,
    baseMinimumRatio,
    baseMinimumWidth,
    baseWidthStep,
    currentHeight,
    currentWidth,
    flushDebounced,
    maximumRatio,
    minimumRatio,
    onOverrideWarning,
    ratio,
    shouldValidateRatio,
    updateConfiguration,
  ]);

  const commitHeight = useCallback(async () => {
    flushDebounced();
    // Only check for overrides if:
    // 1. User actually edited this field AND value differs from initial
    // 2. BOTH dimensions are > 0 (don't bother user until they've entered both)
    const valueWasChanged =
      heightWasEditedRef.current && currentHeight !== initialHeightRef.current;
    const bothDimensionsSet = currentWidth > 0 && currentHeight > 0;
    if (
      allowOutOfSpec &&
      onOverrideWarning &&
      valueWasChanged &&
      bothDimensionsSet
    ) {
      let overrideKey: keyof SpecOverrides | null = null;
      if (
        typeof baseMinimumHeight === "number" &&
        typeof baseMaximumHeight === "number"
      ) {
        if (currentHeight < baseMinimumHeight) overrideKey = "minimumHeight";
        if (currentHeight > baseMaximumHeight) overrideKey = "maximumHeight";
      }
      if (
        !overrideKey &&
        typeof baseMinimumHeight === "number" &&
        typeof baseHeightStep === "number"
      ) {
        if (isStepViolated(currentHeight, baseMinimumHeight, baseHeightStep))
          overrideKey = "heightStep";
      }
      if (!overrideKey && shouldValidateRatio) {
        const ratioValue = Number(ratio);
        const ratioMin =
          typeof baseMinimumRatio === "number"
            ? baseMinimumRatio
            : minimumRatio;
        const ratioMax =
          typeof baseMaximumRatio === "number"
            ? baseMaximumRatio
            : maximumRatio;
        if (Number.isFinite(ratioValue) && ratioValue > 0) {
          if (typeof ratioMin === "number" && ratioValue < ratioMin)
            overrideKey = "minimumRatio";
          if (
            !overrideKey &&
            typeof ratioMax === "number" &&
            ratioValue > ratioMax
          )
            overrideKey = "maximumRatio";
        }
      }
      if (overrideKey) {
        const ratioValue = Number(ratio);
        await onOverrideWarning({
          key: overrideKey,
          value:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? ratioValue
              : currentHeight,
          min:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? baseMinimumRatio
              : baseMinimumHeight,
          max:
            overrideKey === "minimumRatio" || overrideKey === "maximumRatio"
              ? baseMaximumRatio
              : baseMaximumHeight,
          step: overrideKey === "heightStep" ? baseHeightStep : undefined,
        });
      }
    }
    isLocalChangeRef.current = false;
    updateConfiguration({ height: currentHeight });
  }, [
    allowOutOfSpec,
    baseHeightStep,
    baseMaximumHeight,
    baseMaximumRatio,
    baseMinimumHeight,
    baseMinimumRatio,
    currentHeight,
    currentWidth,
    flushDebounced,
    maximumRatio,
    minimumRatio,
    onOverrideWarning,
    ratio,
    shouldValidateRatio,
    updateConfiguration,
  ]);

  const handleAddCustomSize = useCallback(() => {
    // Use volume for matrix pricing, quantity for other pricing types
    const currentQuantity = isMatrixLikePriceType(product.priceType)
      ? volume
      : quantity;

    if (!currentQuantity || currentQuantity <= 0) {
      return; // Don't add if no valid quantity/volume selected
    }

    const newCustomSize: CustomSizeWithQuantity = {
      width: currentWidth,
      height: currentHeight,
      quantity: currentQuantity,
    };

    const updatedCustomSizes = [...customSizes, newCustomSize];
    startTransition(() => {
      updateConfiguration({ customSizes: updatedCustomSizes });
    });
  }, [
    currentWidth,
    currentHeight,
    product.priceType,
    volume,
    quantity,
    customSizes,
    updateConfiguration,
  ]);

  const handleRemoveCustomSize = useCallback(
    (index: number) => {
      const updatedCustomSizes = customSizes.filter((_, i) => i !== index);
      startTransition(() => {
        updateConfiguration({ customSizes: updatedCustomSizes });
      });
    },
    [customSizes, updateConfiguration],
  );

  const totalArea = useMemo(() => {
    if (customSizes.length === 0) {
      return 0;
    }

    return calculateQuantityForMultipleSizes(customSizes, bleed) * 1000000;
  }, [bleed, customSizes]);

  const hasValidDimensions = useMemo(() => {
    if (allowOutOfSpec) {
      return (
        Number.isFinite(currentWidth) &&
        currentWidth > 0 &&
        Number.isFinite(currentHeight) &&
        currentHeight > 0
      );
    }
    return isValidWidthValue && isValidHeightValue;
  }, [
    allowOutOfSpec,
    currentHeight,
    currentWidth,
    isValidHeightValue,
    isValidWidthValue,
  ]);

  const hasValidOrderAmount = useMemo(() => {
    const currentAmount = isMatrixLikePriceType(product.priceType)
      ? volume
      : quantity;
    return Boolean(currentAmount && currentAmount > 0);
  }, [product.priceType, quantity, volume]);

  const isAddSizeDisabled = useMemo(() => {
    return !hasValidDimensions || !hasValidOrderAmount;
  }, [hasValidDimensions, hasValidOrderAmount]);

  return (
    <Box w={"100%"} py={"2"}>
      <Text mb={"4"} fontSize={"xl"} fontWeight={"600"}>
        {t("customFormatInput.heading", { defaultValue: "Format" })}
      </Text>

      {/* Current Size Input */}
      <Stack direction={["column", "row"]}>
        <DimensionInput
          value={currentWidth}
          isValid={isValidWidthValue}
          min={minimumWidth}
          max={maximumWidth}
          step={widthStep || 1}
          inputMin={allowOutOfSpec ? undefined : minimumWidth}
          inputMax={allowOutOfSpec ? undefined : maximumWidth}
          inputStep={allowOutOfSpec ? undefined : widthStep || 1}
          onChange={handleUpdateWidth}
          onCommit={() => void commitWidth()}
          label={t("customFormatInput.width")}
          placeholder={t("customFormatInput.widthRange", {
            defaultValue: "Width range from {{minWidth}} to {{maxWidth}}",
            minWidth: minimumWidth || 0,
            maxWidth: maximumWidth || 99999,
          })}
        />
        <DimensionInput
          value={currentHeight}
          isValid={isValidHeightValue}
          min={minimumHeight}
          max={maximumHeight}
          step={heightStep || 1}
          inputMin={allowOutOfSpec ? undefined : minimumHeight}
          inputMax={allowOutOfSpec ? undefined : maximumHeight}
          inputStep={allowOutOfSpec ? undefined : heightStep || 1}
          onChange={handleUpdateHeight}
          onCommit={() => void commitHeight()}
          label={t("customFormatInput.height")}
          placeholder={t("customFormatInput.heightRange", {
            defaultValue: "Height range from {{minHeight}} to {{maxHeight}}",
            minHeight: minimumHeight || 0,
            maxHeight: maximumHeight || 99999,
          })}
        />
      </Stack>

      {/* Add Custom Size Button */}
      {!isStore && (
        <Button
          w={"100%"}
          mt={4}
          colorPalette="primary"
          onClick={handleAddCustomSize}
          disabled={isAddSizeDisabled}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("customFormatInput.addSize", { defaultValue: "Add size" })}
        </Button>
      )}

      {/* Custom Sizes List */}
      {customSizes.length > 0 && (
        <VStack align="start" mt={6} gap={3}>
          <Text fontSize={"lg"} fontWeight={"600"}>
            {t("customFormatInput.addedSizes", {
              defaultValue: "Added sizes ({{count}})",
              count: customSizes.length,
            })}
          </Text>
          {customSizes.map((size, index) => (
            <HStack
              key={index}
              w="100%"
              p={3}
              borderRadius="3xl"
              border="1px solid"
              borderColor="gray.muted"
              justify="space-between"
            >
              <HStack pl={2}>
                <Text fontSize="sm">
                  {size.width} × {size.height} mm
                </Text>
                <Text
                  fontSize="sm"
                  color={{ base: "gray.600", _dark: "gray.400" }}
                >
                  × {size.quantity} {t("Unit.PCS")}
                </Text>
                <Text
                  fontSize="sm"
                  color={{ base: "gray.500", _dark: "gray.400" }}
                >
                  <FormatNumber
                    value={calculateQuantityForMultipleSizes([size], bleed)}
                    style={"unit"}
                    unit={"meter"}
                  />
                  ²
                </Text>
              </HStack>
              <Button
                size="sm"
                variant="ghost"
                colorPalette="red"
                onClick={() => handleRemoveCustomSize(index)}
              >
                <MaterialSymbol>delete</MaterialSymbol>
              </Button>
            </HStack>
          ))}

          {/* Total Area Display */}
          <Box
            w="100%"
            p={3}
            borderRadius="3xl"
            bg={{ base: "gray.50", _dark: "gray.950" }}
            border="1px solid"
            borderColor="gray.muted"
          >
            <HStack justify="space-between" px={2}>
              <Text fontWeight="600">
                {t("customFormatInput.totalArea", {
                  defaultValue: "Total area",
                })}
              </Text>
              <Text fontWeight="600" color="primary.solid">
                <FormatNumber
                  value={totalArea / 1000000}
                  style={"unit"}
                  unit={"meter"}
                />
                ²
              </Text>
            </HStack>
          </Box>
        </VStack>
      )}

      {/* Ratio Validation */}
      {product.spec.validateRatio && (
        <VStack alignItems={"start"} mt={6}>
          <Text mb={"2"} fontSize={"xl"} fontWeight={"600"}>
            {t("customFormatInput.ratioHeading", { defaultValue: "Ratio" })}
          </Text>
          <Text mt={"2"}>
            {t("customFormatInput.ratioDescription", {
              defaultValue: "Result of dividing width by height",
            })}
          </Text>
          <Text
            color={
              isValidRatio(
                currentWidth,
                currentHeight,
                minimumRatio ?? 0.2,
                maximumRatio ?? 5,
                ratio,
              )
                ? "primary.solid"
                : "red.500"
            }
            mt={"2"}
            fontWeight={"600"}
            fontSize={"xl"}
          >
            <MaterialSymbol verticalAlign={"sub"} pr={"1"}>
              lock
            </MaterialSymbol>
            {ratio}
          </Text>
          <Text fontSize={"sm"}>
            {t("customFormatInput.ratioRange", {
              defaultValue:
                "Valid ratio range is from {{minRatio}} to {{maxRatio}}",
              minRatio: minimumRatio ?? 0.2,
              maxRatio: maximumRatio ?? 5,
            })}
          </Text>
        </VStack>
      )}
    </Box>
  );
});

CustomFormatInput.displayName = "CustomFormatInput";
