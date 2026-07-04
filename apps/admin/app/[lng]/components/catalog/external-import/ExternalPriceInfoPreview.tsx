import { Badge, HStack, Text, VStack } from "@chakra-ui/react";
import type { ExternalProduct } from "@konfi/types";
import type { TranslateFn } from "./types";

type ExternalPriceInfoPreviewProps = {
  priceInfo?: ExternalProduct["priceInfo"];
  t: TranslateFn;
};

const MAX_VISIBLE_PRICE_RANGES = 3;
const DECIMAL_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

function formatPrice(value: number, currency?: string): string {
  const normalizedCurrency = currency?.trim().toUpperCase();

  if (normalizedCurrency && /^[A-Z]{3}$/.test(normalizedCurrency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: normalizedCurrency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${DECIMAL_FORMATTER.format(value)} ${normalizedCurrency}`;
    }
  }

  return DECIMAL_FORMATTER.format(value);
}

export default function ExternalPriceInfoPreview({
  priceInfo,
  t,
}: ExternalPriceInfoPreviewProps) {
  const priceRanges =
    priceInfo?.priceRanges?.filter((range) => {
      return (
        typeof range.deliveryTime === "number" ||
        typeof range.price === "number" ||
        typeof range.quantity === "number" ||
        (typeof range.unit === "string" && range.unit.trim().length > 0)
      );
    }) ?? [];

  if (!priceInfo?.priceText && priceRanges.length === 0) {
    return null;
  }

  const visibleRanges = priceRanges.slice(0, MAX_VISIBLE_PRICE_RANGES);
  const remainingRangeCount = priceRanges.length - visibleRanges.length;

  return (
    <VStack
      alignItems="stretch"
      gap={2}
      p={3}
      borderWidth="1px"
      borderColor="gray.muted"
      borderRadius="2xl"
    >
      <Text fontSize="sm" fontWeight="medium">
        {t("externalProducts.pricePreviewTitle", {
          defaultValue: "Price preview",
        })}
      </Text>

      {priceInfo?.priceText ? (
        <Text fontSize="xs" color="fg.muted">
          {priceInfo.priceText}
        </Text>
      ) : null}

      {visibleRanges.map((range, index) => {
        const quantityLabel =
          typeof range.quantity === "number"
            ? t("externalProducts.pricePreviewQuantity", {
                defaultValue: "Qty {{quantity}}",
                quantity: range.quantity,
              })
            : t("externalProducts.pricePreviewBase", {
                defaultValue: "Base",
              });
        const unit = range.unit?.trim();

        return (
          <HStack
            key={`${range.quantity ?? "base"}-${range.price ?? "na"}-${index}`}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap={2}
          >
            <HStack gap={2} flexWrap="wrap">
              <Badge colorPalette="gray">{quantityLabel}</Badge>
              {unit ? (
                <Badge colorPalette="gray" variant="subtle">
                  {unit}
                </Badge>
              ) : null}
            </HStack>

            <HStack gap={2} flexWrap="wrap">
              {typeof range.price === "number" ? (
                <Text fontSize="sm" fontWeight="medium">
                  {formatPrice(range.price, priceInfo?.currency)}
                </Text>
              ) : null}
              {typeof range.deliveryTime === "number" ? (
                <Text fontSize="xs" color="fg.muted">
                  {t("externalProducts.pricePreviewDeliveryTime", {
                    defaultValue: "{{count}}d",
                    count: range.deliveryTime,
                  })}
                </Text>
              ) : null}
            </HStack>
          </HStack>
        );
      })}

      {remainingRangeCount > 0 ? (
        <Text fontSize="xs" color="fg.muted">
          {t("externalProducts.pricePreviewMoreRanges", {
            defaultValue: "+{{count}} more ranges",
            count: remainingRangeCount,
          })}
        </Text>
      ) : null}
    </VStack>
  );
}
