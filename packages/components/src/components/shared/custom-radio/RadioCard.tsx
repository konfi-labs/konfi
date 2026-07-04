import {
  Box,
  Center,
  ColorPickerSwatch,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { CurrencyCode, CurrencySettings, UnitId } from "@konfi/types";
import {
  convertMinorAmountForDisplay,
  formatPrice,
  getEstimatedDelivery,
  getCurrencyMinorUnitDigits,
  getTodayWorkDay,
  toFiscalUnitPrice,
} from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { useMemo } from "react";
import { ColorPickerRoot, ColorPickerSwatchGroup } from "../../ui/color-picker";
import { RadioCardItem } from "../../ui/radio-card";
import {
  FormatPreview,
  hasFormatPreviewDimensions,
} from "../common/FormatPreview";
import { Image } from "../Image";
import { MaterialSymbol } from "../MaterialSymbol";

interface RadioCardProps {
  children: React.ReactNode;
  value: string;
  checked?: boolean;
  image?: string;
  icon?: string;
  totalPrice?: number;
  currency?: CurrencyCode;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  unit?: UnitId;
  deliveryTime?: number;
  disabled?: boolean;
  color?: string;
  formatWidth?: number | null;
  formatHeight?: number | null;
  showUnavailableLabel?: boolean;
  t: TFunction;
  i18n: i18n;
}

export function RadioCard(props: RadioCardProps) {
  const iconColor = useMemo(() => {
    return props.checked ? "primary.solid" : "rgba(0, 0, 0, 0.1)";
  }, [props.checked]);

  const materialSymbolColor = useMemo(() => {
    return props.checked
      ? "primary.solid"
      : { base: "gray.300", _dark: "gray.300" };
  }, [props.checked]);

  const convertedTotalPrice = useMemo(() => {
    return typeof props.totalPrice === "number" &&
      Number.isFinite(props.totalPrice) &&
      props.currency
      ? convertMinorAmountForDisplay({
          amountMinor: props.totalPrice,
          baseCurrency: props.currency,
          settings: props.currencySettings,
          targetCurrency: props.displayCurrency ?? props.currency,
        })
      : null;
  }, [
    props.currency,
    props.currencySettings,
    props.displayCurrency,
    props.totalPrice,
  ]);
  const totalPriceFormatted = useMemo(() => {
    if (!convertedTotalPrice) {
      return null;
    }

    return formatPrice(
      convertedTotalPrice.amountMinor,
      convertedTotalPrice.currency,
      undefined,
      undefined,
      props.i18n.resolvedLanguage,
      {
        minorUnitDigits: getCurrencyMinorUnitDigits(
          convertedTotalPrice.currency,
          props.currencySettings,
        ),
      },
    );
  }, [
    convertedTotalPrice,
    props.currencySettings,
    props.i18n.resolvedLanguage,
  ]);
  const unitPriceFormatted = useMemo(() => {
    if (!convertedTotalPrice || !props.unit) {
      return null;
    }

    const qty = Number(props.value);
    if (!Number.isFinite(qty) || qty <= 0) return null;

    const minorUnitDigits = getCurrencyMinorUnitDigits(
      convertedTotalPrice.currency,
      props.currencySettings,
    );
    const rawUnitMajor =
      convertedTotalPrice.amountMinor / qty / 10 ** minorUnitDigits;
    // fiscal truncation to 3 decimal places
    const fiscalUnitMajor = toFiscalUnitPrice(rawUnitMajor);

    const unitLabel = props.t
      ? props.t(`Unit.${props.unit}`)
      : `Unit.${props.unit}`;
    // If the 3rd digit after the comma is 0, show only 2 decimals; otherwise show 3
    const thousand = Math.round(fiscalUnitMajor * 1000);
    const thirdDecimalDigit = Math.abs(thousand) % 10;
    const fractionDigits = thirdDecimalDigit === 0 ? 2 : 3;

    const formatted = new Intl.NumberFormat(
      props.i18n.resolvedLanguage ?? "pl-PL",
      {
        style: "currency",
        currency: convertedTotalPrice.currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      },
    ).format(fiscalUnitMajor);

    return `${formatted}/${unitLabel}`;
  }, [
    convertedTotalPrice,
    props.currencySettings,
    props.unit,
    props.value,
    props.t,
    props.i18n.resolvedLanguage,
  ]);
  const estimatedDelivery = useMemo(() => {
    return props.deliveryTime
      ? getEstimatedDelivery(props.deliveryTime)?.toLocaleString(
          props.i18n.resolvedLanguage,
          {
            weekday: "long",
            month: "long",
            day: "numeric",
          },
        )
      : null;
  }, [props.deliveryTime, props.i18n.resolvedLanguage]);
  const orderByDate = useMemo(() => {
    return getTodayWorkDay().toLocaleString(props.i18n.resolvedLanguage, {
      month: "numeric",
      day: "numeric",
    });
  }, [props.i18n.resolvedLanguage]);
  const checkIcon = useMemo(
    () => (props.checked ? "check" : "circle"),
    [props.checked],
  );

  const color = useMemo(() => {
    return props.color ? props.color : undefined;
  }, [props.color]);

  return (
    <Box
      as="label"
      opacity={props.disabled ? 0.6 : 1}
      cursor={props.disabled ? "not-allowed" : "pointer"}
    >
      <RadioCardItem
        label={props.children}
        value={props.value}
        disabled={props.disabled}
        hidden
      />
      <Center
        minH={"100%"}
        textAlign={"center"}
        fontSize={"sm"}
        transitionProperty={"box-shadow, background"}
        transition={".15s ease-out"}
        cursor={props.disabled ? "not-allowed" : "pointer"} // Adjust cursor style for disabled state
        borderRadius="3xl"
        boxShadow={
          props.checked
            ? {
                base: `inset 0 0 0 2px var(--chakra-colors-primary-500)`,
                _dark: `inset 0 0 0 2px var(--chakra-colors-primary-300)`,
              }
            : {
                base: `inset 0 0 0 1px var(--chakra-colors-gray-300)`,
                _dark: `inset 0 0 0 1px var(--chakra-colors-gray-700)`,
              }
        }
        _hover={
          props.disabled
            ? {}
            : {
                boxShadow: props.checked
                  ? {
                      base: `inset 0 0 0 2px var(--chakra-colors-primary-500)`,
                      _dark: `inset 0 0 0 2px var(--chakra-colors-primary-300)`,
                    }
                  : {
                      base: `inset 0 0 0 1px rgba(0, 0, 0, 0.2)`,
                      _dark: `inset 0 0 0 1px rgba(255, 255, 255, 0.8)`,
                    },
              }
        } // Disable hover effect if disabled
        px={5}
        py={3}
      >
        <HStack w={"100%"} justify={"space-between"}>
          <HStack minW={"80px"} justify={"start"}>
            <MaterialSymbol color={iconColor}>{checkIcon}</MaterialSymbol>
            <VStack align="start" gap={0}>
              <Text
                fontWeight={600}
                textDecoration={props.disabled ? "line-through" : undefined}
              >
                {props.children}
              </Text>
              {props.showUnavailableLabel && props.disabled && (
                <Text
                  fontSize="xs"
                  color={{ base: "gray.500", _dark: "gray.400" }}
                >
                  {props.t("common.unavailable", {
                    defaultValue: "Unavailable",
                  })}
                </Text>
              )}
            </VStack>
          </HStack>
          {props.image && (
            <Image
              ratio={1}
              width={300}
              height={300}
              objectFit={"contain"}
              src={props.image}
              alt={`${props.children}`}
              priority={false}
              transparentBackground
            />
          )}
          {hasFormatPreviewDimensions(
            props.formatWidth,
            props.formatHeight,
          ) && (
            <FormatPreview
              formatWidth={props.formatWidth}
              formatHeight={props.formatHeight}
              showDimensions={false}
              textAlign="start"
            />
          )}
          {totalPriceFormatted && unitPriceFormatted && (
            <VStack align={"start"} minW={0}>
              <Text fontWeight={600}>
                {totalPriceFormatted} {props.t("common.gross")}
              </Text>
              <Text fontVariantNumeric="tabular-nums">
                {unitPriceFormatted} {props.t("common.gross")}
              </Text>
            </VStack>
          )}
          {estimatedDelivery && (
            <VStack>
              <Text>{estimatedDelivery}</Text>
              <Text>
                {props.t("common.orderBy")}: 16:00, {orderByDate}
              </Text>
            </VStack>
          )}
          {props.icon && (
            <MaterialSymbol
              color={materialSymbolColor}
              transition={"color .25s"}
            >
              {props.icon}
            </MaterialSymbol>
          )}
          {props.color && color && (
            <ColorPickerRoot size={"xs"} alignItems="flex-start">
              <ColorPickerSwatchGroup>
                <ColorPickerSwatch borderRadius={"full"} value={color} />
              </ColorPickerSwatchGroup>
            </ColorPickerRoot>
          )}
        </HStack>
      </Center>
    </Box>
  );
}
