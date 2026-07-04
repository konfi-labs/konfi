import { Box, HStack, Separator, Text } from "@chakra-ui/react";
import { type CurrencyCode, type CurrencySettings } from "@konfi/types";
import { formatConvertedPrice } from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { i18n, TFunction } from "i18next";
import { FC } from "react";

type Props = {
  subtotal: number;
  total: number;
  shippingPrice: number;
  currency?: CurrencyCode;
  currencySettings?: CurrencySettings | null;
  freeShipping?: boolean;
  discountAmount?: number;
  storeCreditAmount?: number;
  children?: React.ReactNode;
  t: TFunction;
  i18n: i18n;
};

export const OrderDetails: FC<Props> = ({
  subtotal,
  total,
  shippingPrice,
  currency = "PLN",
  currencySettings,
  freeShipping,
  discountAmount,
  storeCreditAmount,
  children,
  t,
  i18n,
}) => {
  if (isUndefined(shippingPrice)) return null;
  return (
    <Box
      position={"sticky"}
      top={32}
      maxHeight={"calc(100vh - 8rem)"}
      display={"flex"}
      flexDirection={"column"}
    >
      <Box>
        <Text fontSize="2xl" fontWeight={"600"}>
          {t("orderDetails.heading")}
        </Text>
        <Separator my="4" />
        <HStack justifyContent="space-between" fontWeight="medium" mb={2}>
          <Text>
            {t("orderDetails.productValue", { defaultValue: "Product Value:" })}
          </Text>
          <Text>
            {formatConvertedPrice(
              subtotal,
              currency,
              currencySettings,
              undefined,
              undefined,
              i18n.resolvedLanguage,
              "PLN",
            )}
          </Text>
        </HStack>
        <HStack justifyContent="space-between" fontWeight="medium">
          <Text>
            {t("orderDetails.shippingValue", { defaultValue: "Shipping:" })}
          </Text>
          <Text
            color={freeShipping ? "green.solid" : undefined}
            fontWeight={freeShipping ? "600" : "medium"}
          >
            {freeShipping
              ? t("orderDetails.freeShipping", { defaultValue: "Free!" })
              : formatConvertedPrice(
                  shippingPrice,
                  currency,
                  currencySettings,
                  undefined,
                  undefined,
                  i18n.resolvedLanguage,
                  "PLN",
                )}
          </Text>
        </HStack>
        <Separator my="4" />
        {storeCreditAmount ? (
          <HStack justifyContent="space-between" fontWeight="medium" mb={2}>
            <Text>
              {t("orderDetails.storeCredit", {
                defaultValue: "Store Credit:",
              })}
            </Text>
            <Text color="green.solid">
              -
              {formatConvertedPrice(
                storeCreditAmount,
                currency,
                currencySettings,
                undefined,
                undefined,
                i18n.resolvedLanguage,
                "PLN",
              )}
            </Text>
          </HStack>
        ) : null}
        <HStack
          justifyContent="space-between"
          fontWeight={"600"}
          color={"primary.solid"}
        >
          <Text>{t("orderDetails.total", { defaultValue: "Total:" })}</Text>
          <Text fontSize={"2xl"}>
            {formatConvertedPrice(
              total,
              currency,
              currencySettings,
              undefined,
              undefined,
              i18n.resolvedLanguage,
              "PLN",
            )}
          </Text>
        </HStack>
        {discountAmount ? (
          <HStack justifyContent="space-between" fontWeight="medium">
            <Text>{t("orderDetails.saved", { defaultValue: "Saved:" })}</Text>
            <Text color="green.500">
              {formatConvertedPrice(
                discountAmount,
                currency,
                currencySettings,
                undefined,
                undefined,
                i18n.resolvedLanguage,
                "PLN",
              )}
            </Text>
          </HStack>
        ) : null}
        <Text mt={2} fontSize={"sm"}>
          {t("orderDetails.summaryInfo", {
            defaultValue: "*Prices include VAT.",
          })}
        </Text>
      </Box>
      <Box overflowY={"auto"} flex={1}>
        {children}
      </Box>
    </Box>
  );
};
