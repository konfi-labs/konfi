import type { ProductAgentDraft } from "@/lib/ai/durable-agents/product-workflow.types";
import { Badge, Box, Card, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";

function formatMinorCurrency(value: number | null | undefined, locale: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat(locale, {
    currency: "PLN",
    style: "currency",
  }).format(value / 100);
}

export function ProductDraftPricePreview({
  draft,
  locale,
  pricePreview,
  t,
}: {
  draft?: ProductAgentDraft;
  locale: string;
  pricePreview?: string;
  t: TFunction;
}) {
  if (!draft) {
    return null;
  }

  const prices = draft.product.prices ?? [];
  const dynamicPricing = draft.product.dynamicPricing;
  const listingPrices = [
    {
      label: t("agents.productDraft.defaultPrice", {
        defaultValue: "Default",
      }),
      value: draft.product.defaultPrice?.value,
    },
    {
      label: t("agents.productDraft.lowPrice", { defaultValue: "Low" }),
      value: draft.product.lowPrice?.value,
    },
    {
      label: t("agents.productDraft.highPrice", { defaultValue: "High" }),
      value: draft.product.highPrice?.value,
    },
  ].flatMap((entry) => {
    const formatted = formatMinorCurrency(entry.value, locale);
    return formatted ? [{ ...entry, formatted }] : [];
  });

  return (
    <Card.Root variant="outline" borderRadius="xl">
      <Card.Body py={3} px={4}>
        <VStack align="stretch" gap={3}>
          <HStack justify="space-between" align="start" gap={3}>
            <Box>
              <Text fontSize="sm" fontWeight="medium">
                {t("agents.productDraft.pricePreview", {
                  defaultValue: "Price preview",
                })}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {draft.priceTypeReason}
              </Text>
            </Box>
            <Badge size="sm" variant="outline">
              {t(`PriceTypeEnum.${draft.priceType}`)}
            </Badge>
          </HStack>

          {prices.length > 0 && (
            <VStack align="stretch" gap={1}>
              {prices.slice(0, 6).map((price, index) => {
                const formatted = formatMinorCurrency(price.value, locale);
                const labelParts = [
                  price.combination?.id,
                  typeof price.volume?.value === "number"
                    ? t("agents.productDraft.volumeLabel", {
                        defaultValue: "{{value}} pcs",
                        value: price.volume.value,
                      })
                    : undefined,
                  typeof price.threshold === "number"
                    ? t("agents.productDraft.thresholdLabel", {
                        defaultValue: "from {{value}} pcs",
                        value: price.threshold,
                      })
                    : undefined,
                ].filter((value): value is string => Boolean(value));

                return (
                  <Flex
                    key={`${price.combination?.id ?? "price"}-${price.volume?.value ?? price.threshold ?? index}`}
                    justify="space-between"
                    gap={3}
                    fontSize="xs"
                  >
                    <Text color="fg.muted" truncate>
                      {labelParts.join(" · ") ||
                        t("agents.productDraft.singlePrice", {
                          defaultValue: "Single price",
                        })}
                    </Text>
                    <Text fontWeight="semibold" whiteSpace="nowrap">
                      {formatted ?? "—"}
                    </Text>
                  </Flex>
                );
              })}
              {prices.length > 6 && (
                <Text fontSize="xs" color="fg.muted">
                  {t("agents.productDraft.morePrices", {
                    defaultValue: "...and {{count}} more price rows",
                    count: prices.length - 6,
                  })}
                </Text>
              )}
            </VStack>
          )}

          {prices.length === 0 && listingPrices.length > 0 && (
            <HStack gap={2} flexWrap="wrap">
              {listingPrices.map((entry) => (
                <Badge key={entry.label} variant="outline" size="sm">
                  {entry.label}: {entry.formatted}
                </Badge>
              ))}
            </HStack>
          )}

          {prices.length === 0 && dynamicPricing && (
            <HStack gap={2} flexWrap="wrap">
              <Badge variant="outline" size="sm">
                {t("agents.productDraft.basePrice", {
                  defaultValue: "Base: {{value}}",
                  value:
                    formatMinorCurrency(dynamicPricing.basePrice, locale) ??
                    "—",
                })}
              </Badge>
              <Badge variant="outline" size="sm">
                {t("agents.productDraft.attributeRules", {
                  defaultValue: "Attribute rules: {{count}}",
                  count: dynamicPricing.attributeRules.length,
                })}
              </Badge>
              <Badge variant="outline" size="sm">
                {t("agents.productDraft.globalRules", {
                  defaultValue: "Global rules: {{count}}",
                  count: dynamicPricing.globalRules.length,
                })}
              </Badge>
            </HStack>
          )}

          {pricePreview && (
            <Text
              as="pre"
              fontSize="xs"
              color="fg.muted"
              whiteSpace="pre-wrap"
              m={0}
            >
              {pricePreview}
            </Text>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default ProductDraftPricePreview;
