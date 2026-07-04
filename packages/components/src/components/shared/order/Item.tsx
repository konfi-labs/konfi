"use client";

import { Badge, Box, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import {
  AdvancedAttributeSelection,
  AdvancedEdgeSide,
  type CurrencyCode,
  CurrencyEnum,
  type CurrencySettings,
  OrderItem,
} from "@konfi/types";
import {
  calculateQuantityForMultipleSizes,
  formatConvertedPrice,
  getCurrencyMinorUnitDigits,
  hasAnyGrommets,
  isMatrixLikePriceType,
  normalizeAdvancedSelection,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty, isNumber } from "es-toolkit/compat";
import { TFunction, i18n } from "i18next";
import { Tag } from "../../ui/tag";
import { Tooltip } from "../../ui/tooltip";
import { DiscountTag } from "../DiscountTag";
import { Image } from "../Image";
import { SummaryDescription } from "../SummaryDescription";
import { CustomFormatParameters } from "../product/CustomFormatParameters";

const SIDE_LABEL_KEYS: Record<AdvancedEdgeSide, string> = {
  top: "product.finishing.sides.top",
  right: "product.finishing.sides.right",
  bottom: "product.finishing.sides.bottom",
  left: "product.finishing.sides.left",
};

type AdvancedFinishingSummary = {
  badges: {
    key: string;
    colorPalette: "green" | "orange" | "primary" | "purple";
    label: string;
  }[];
  grommetsSummary?: string;
};

function formatSelectedSides(sides: AdvancedEdgeSide[], t: TFunction) {
  return sides
    .map((side) =>
      t(SIDE_LABEL_KEYS[side], {
        defaultValue: side.charAt(0).toUpperCase() + side.slice(1),
      }),
    )
    .join(", ");
}

function createAdvancedFinishingSummary(
  selection: AdvancedAttributeSelection,
  t: TFunction,
): AdvancedFinishingSummary | null {
  const normalizedSelection = normalizeAdvancedSelection(selection);
  const grommetsActive = hasAnyGrommets(normalizedSelection);
  const badges = [
    normalizedSelection.cutToSize
      ? {
        key: "cutToSize",
        colorPalette: "green" as const,
        label: t("product.finishing.cutToSize", {
          defaultValue: "Cut to size",
        }),
      }
      : null,
    normalizedSelection.reinforcementSides.length > 0
      ? {
        key: "reinforcement",
        colorPalette: "orange" as const,
        label: `${t("product.finishing.reinforcement", {
          defaultValue: "Reinforcement",
        })}: ${formatSelectedSides(
          normalizedSelection.reinforcementSides,
          t,
        )}`,
      }
      : null,
    grommetsActive
      ? {
        key: "grommets",
        colorPalette: "primary" as const,
        label: `${t("product.finishing.grommets", {
          defaultValue: "Grommets",
        })}: ${formatSelectedSides(
          normalizedSelection.grommets?.sides ?? [],
          t,
        )}`,
      }
      : null,
    normalizedSelection.tunnelSides.length > 0
      ? {
        key: "tunnel",
        colorPalette: "purple" as const,
        label: `${t("product.finishing.tunnel", {
          defaultValue: "Tunnel",
        })}: ${formatSelectedSides(normalizedSelection.tunnelSides, t)}`,
      }
      : null,
  ].filter((item) => item !== null);

  if (badges.length === 0) {
    return null;
  }

  return {
    badges,
    grommetsSummary: grommetsActive
      ? t("product.finishing.grommetsSummary", {
        defaultValue:
          "Spacing {{spacing}} cm • first corner {{offsetStart}} cm • last corner {{offsetEnd}} cm",
        spacing: normalizedSelection.grommets?.spacing ?? 50,
        offsetStart: normalizedSelection.grommets?.offsetStart ?? 0,
        offsetEnd: normalizedSelection.grommets?.offsetEnd ?? 0,
      })
      : undefined,
  };
}

export const Item = ({
  item,
  channelId,
  thumbnailURL,
  thumbnailLoading = false,
  children,
  t,
  i18n,
  highlightColor,
  amountCurrency,
  displayCurrency,
  currencySettings,
  isNameEditable = false,
  onNameChange,
  imageFetchPriority,
  imageLoading,
}: {
  item: OrderItem;
  channelId: string;
  thumbnailURL?: string;
  thumbnailLoading?: boolean;
  children?: React.ReactNode;
  t: TFunction;
  i18n: i18n;
  highlightColor?: string;
  amountCurrency?: CurrencyCode | null;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  isNameEditable?: boolean;
  onNameChange?: (value: string) => void;
  imageFetchPriority?: "high" | "low" | "auto";
  imageLoading?: "eager" | "lazy";
}) => {
  // Calculate the appropriate quantity to display
  const getDisplayQuantity = () => {
    // If custom sizes exist, calculate total quantity from them
    if (!isEmpty(item.customSizes)) {
      try {
        return calculateQuantityForMultipleSizes(
          item.customSizes ?? [],
          item.product?.designSpec?.includeBleed
            ? item.product?.designSpec?.bleed
            : undefined,
        );
      } catch (error) {
        console.error("Error calculating quantity from custom sizes:", error);
        // Fall back to default logic if calculation fails
      }
    }

    // Matrix-like products store the selected printed amount in volume, but
    // initial form hydration may only have quantity for a moment.
    if (isMatrixLikePriceType(item.product?.priceType)) {
      return isNumber(item.volume) && item.volume > 0
        ? item.volume
        : item.quantity;
    }

    // If we know it's not a matrix product, use quantity
    if (item.product?.priceType !== undefined) {
      return item.quantity;
    }

    // Default logic for items without custom sizes
    return isNumber(item.volume) ? item.volume : item.quantity;
  };

  // Create stable, safe snapshots to prevent race conditions during quick deletes/reorders
  const discountValue = Number(item?.discount?.discountValue ?? 0);
  const hasDiscount = discountValue > 0;
  const discountType = item?.discount?.type;
  const discountCode = item?.discount?.code;
  const totalPrice = Number(item?.totalPrice ?? 0);
  let originalPrice: number | null = null;
  if (hasDiscount && totalPrice > 0) {
    const denom = 1 - discountValue / 100;
    if (denom > 0) originalPrice = totalPrice / denom;
  }

  // Calculate per-unit price for tooltip
  const displayQuantity = getDisplayQuantity();
  const perUnitPrice = displayQuantity > 0 ? totalPrice / displayQuantity : 0;
  const perUnitOriginalPrice =
    originalPrice && displayQuantity > 0 ? originalPrice / displayQuantity : 0;
  const itemCurrency =
    amountCurrency ?? item.product?.defaultPrice?.currency ?? CurrencyEnum.PLN;
  const hasExpressPricing = Number(item?.expressPercent ?? 0) > 0;
  const advancedFinishingSummaries = Object.values(
    item.advancedAttributeSelections ?? {},
  )
    .map((selection) => createAdvancedFinishingSummary(selection, t))
    .filter((summary): summary is AdvancedFinishingSummary => summary !== null);

  return !isUndefined(item.product) && !isNull(item.product) ? (
    <VStack align={"flex-start"} gap={2} w={"100%"} px={2}>
      <HStack
        position={"relative"}
        align={"flex-start"}
        gap={6}
        w={"100%"}
        minW={0}
      >
        <Box flexShrink={0}>
          <Skeleton loading={thumbnailLoading}>
            {thumbnailURL ? (
              <Image
                borderRadius="3xl"
                objectFit={"contain"}
                minW={"24"}
                priority={false}
                fetchPriority={imageFetchPriority}
                loading={imageLoading}
                ratio={1}
                width={128}
                height={128}
                src={thumbnailURL}
                alt={item.product.name ?? ""}
              />
            ) : (
              <Image
                borderRadius="3xl"
                minW={"24"}
                priority={false}
                fetchPriority={imageFetchPriority}
                loading={imageLoading}
                ratio={1}
                width={128}
                height={128}
                src={
                  item.product.spec?.images[0]
                    ? `https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${item.product.channelId || channelId}/products/${item.product.id}/${item.product.spec?.images[0]}?fit=crop&auto=format,compress`
                    : "/assets/empty.avif"
                }
                alt={item.product.name ?? ""}
              />
            )}
          </Skeleton>
          <Skeleton loading={!totalPrice}>
            <VStack>
              <Tooltip
                content={
                  perUnitPrice > 0
                    ? `${formatConvertedPrice(perUnitPrice, displayCurrency ?? itemCurrency, currencySettings, undefined, undefined, i18n.resolvedLanguage, itemCurrency)}/${t(`Unit.${item.unit}`) ?? ""}`
                    : undefined
                }
                disabled={perUnitPrice <= 0}
              >
                <Tag
                  position={"relative"}
                  bottom={2}
                  left={-6}
                  size={"md"}
                  fontWeight={"bold"}
                  variant={"solid"}
                  colorPalette={"primary"}
                  borderRadius={"full"}
                >
                  {hasDiscount && originalPrice ? (
                    <Tooltip
                      content={
                        perUnitOriginalPrice > 0
                          ? `${formatConvertedPrice(perUnitOriginalPrice, displayCurrency ?? itemCurrency, currencySettings, undefined, undefined, i18n.resolvedLanguage, itemCurrency)}/${t(`Unit.${item.unit}`) ?? ""}`
                          : undefined
                      }
                      disabled={perUnitOriginalPrice <= 0}
                    >
                      <Tag
                        maxWidth={"fit-content"}
                        position={"absolute"}
                        top={-5}
                        left={-4}
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
                            originalPrice,
                            displayCurrency ?? itemCurrency,
                            currencySettings,
                            undefined,
                            undefined,
                            i18n.resolvedLanguage,
                            itemCurrency,
                          )}
                        </Text>
                      </Tag>
                    </Tooltip>
                  ) : null}
                  {totalPrice
                    ? formatConvertedPrice(
                      totalPrice,
                      displayCurrency ?? itemCurrency,
                      currencySettings,
                      undefined,
                      undefined,
                      i18n.resolvedLanguage,
                      itemCurrency,
                    )
                    : null}
                  {hasDiscount && (
                    <DiscountTag
                      type={discountType}
                      discountValue={discountValue}
                      code={discountCode}
                      currency={itemCurrency}
                      minorUnitDigits={getCurrencyMinorUnitDigits(
                        itemCurrency,
                        currencySettings,
                      )}
                      locale={i18n.resolvedLanguage}
                      top={-1}
                      right={-12}
                      minified
                    />
                  )}
                </Tag>
              </Tooltip>
            </VStack>
          </Skeleton>
        </Box>
        <Box flex="1" minW={0}>
          {hasExpressPricing ? (
            <HStack gap={2} mb={2} wrap="wrap">
              <Badge colorPalette="orange" variant="surface">
                {t("forms.labels.express", { defaultValue: "Express" })}
              </Badge>
            </HStack>
          ) : null}
          <SummaryDescription
            productName={item.product.name ?? ""}
            orderItemName={item.name}
            quantity={getDisplayQuantity()}
            unit={item.unit}
            descriptionCombination={item.description}
            t={t}
            highlightColor={highlightColor}
            isEditable={isNameEditable}
            onNameChange={onNameChange}
            containerProps={{ minW: 0, maxW: "none" }}
          />
          {advancedFinishingSummaries.length > 0 ? (
            <VStack align="stretch" gap={2} mt={2} minW={0}>
              <Text fontSize="xs" fontWeight={600} color="fg.muted">
                {t("product.finishing.currentConfiguration", {
                  defaultValue: "Current configuration",
                })}
              </Text>
              {advancedFinishingSummaries.map((summary, index) => (
                <VStack
                  key={`${summary.badges.map((badge) => badge.key).join("-")}-${index}`}
                  align="stretch"
                  gap={1}
                >
                  <HStack gap={2} flexWrap="wrap">
                    {summary.badges.map((badge) => (
                      <Badge
                        key={`${badge.key}-${badge.label}`}
                        colorPalette={badge.colorPalette}
                        variant="surface"
                        whiteSpace="normal"
                      >
                        {badge.label}
                      </Badge>
                    ))}
                  </HStack>
                  {summary.grommetsSummary ? (
                    <Text fontSize="xs" color="fg.muted">
                      {summary.grommetsSummary}
                    </Text>
                  ) : null}
                </VStack>
              ))}
            </VStack>
          ) : null}
        </Box>
        {children}
      </HStack>
      <CustomFormatParameters
        customFormat={item.customFormat}
        customSizes={item.customSizes}
        width={item.width}
        height={item.height}
        bleed={
          item.product?.designSpec?.includeBleed
            ? item.product.designSpec.bleed
            : undefined
        }
        t={t}
      />
    </VStack>
  ) : null;
};
