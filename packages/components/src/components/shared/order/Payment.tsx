import { Badge, Button, Flex, HStack, Separator, Text } from "@chakra-ui/react";
import {
  type CurrencyCode,
  Customer,
  NestedCustomer,
  Order,
  OrderItem,
  type PaymentMethodId,
  PaymentStatus,
  type TaxSummarySnapshot,
} from "@konfi/types";
import {
  formatPrice,
  getOrderPaymentStatusColorPalette,
  getTotalPrice,
} from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { ReactNode } from "react";
import { ClipboardButton, ClipboardRoot } from "../../ui/clipboard";
import { PaymentMethodChanger } from "./PaymentMethodChanger";

interface Props {
  order?: Order;
  checkoutSessionUrl?: string;
  paymentStatus?: PaymentStatus;
  paymentType?: PaymentMethodId;
  items: OrderItem[];
  shippingPrice?: number;
  totalPriceWithoutDiscount?: number;
  totalPrice: number;
  taxSummary?: TaxSummarySnapshot;
  currency?: CurrencyCode;
  customer?: Customer | NestedCustomer;
  paymentDocumentId?: string;
  onPaymentMethodChange?: (paymentType: PaymentMethodId) => Promise<void>;
  isChangingPaymentMethod?: boolean;
  shouldOpenDialog?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
  paymentStatusControl?: ReactNode;
  t: TFunction;
  i18n: i18n;
}

export function Payment({
  order,
  checkoutSessionUrl,
  paymentStatus,
  paymentType,
  items,
  shippingPrice,
  totalPriceWithoutDiscount,
  totalPrice,
  taxSummary,
  currency,
  customer,
  paymentDocumentId,
  onPaymentMethodChange,
  isChangingPaymentMethod = false,
  shouldOpenDialog = false,
  onDialogOpenChange,
  paymentStatusControl,
  t,
  i18n,
}: Props) {
  const paymentStatusColorPalette = getOrderPaymentStatusColorPalette(
    paymentStatus,
    paymentDocumentId,
  );
  const paymentTypeLabel = paymentType ? t(`PaymentType.${paymentType}`) : null;
  const paymentCurrency = currency ?? order?.currency ?? "PLN";
  const storeCreditRedemption = order?.storeCreditRedemption;
  const resolvedTaxSummary = taxSummary ?? order?.taxSummary;
  const shouldShowTaxSummary =
    resolvedTaxSummary?.enabled === true && resolvedTaxSummary.totalTax > 0;

  return (
    <>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        mb={2}
        gap={3}
        wrap="wrap"
      >
        <Text as="h2" fontSize="lg" fontWeight="bold">
          {t("orderPage.payment.heading", { defaultValue: "Payment" })}
        </Text>
      </Flex>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        gap={3}
        wrap="wrap"
      >
        <HStack
          color="primary.solid"
          fontSize="sm"
          fontWeight="semibold"
          gap={2}
          wrap="wrap"
        >
          {order && customer && onPaymentMethodChange && paymentTypeLabel ? (
            <PaymentMethodChanger
              order={order}
              customer={customer}
              onPaymentMethodChange={onPaymentMethodChange}
              isLoading={isChangingPaymentMethod}
              shouldOpenDialog={shouldOpenDialog}
              onDialogOpenChange={onDialogOpenChange}
              trigger={
                <Button
                  className="noprint"
                  variant="ghost"
                  p={0}
                  h="auto"
                  minH="unset"
                  borderRadius="full"
                  _hover={{ bg: "transparent", opacity: 0.85 }}
                  _active={{ bg: "transparent" }}
                  aria-label={t("orderPage.payment.changeMethod", {
                    defaultValue: "Change payment method",
                  })}
                >
                  <Badge
                    colorPalette="primary"
                    px={3}
                    size="lg"
                    variant="surface"
                  >
                    {paymentTypeLabel}
                  </Badge>
                </Button>
              }
              t={t}
              i18n={i18n}
            />
          ) : (
            paymentTypeLabel && (
              <Badge
                colorPalette="primary"
                px={3}
                size="lg"
                variant="surface"
              >
                {paymentTypeLabel}
              </Badge>
            )
          )}
          {paymentStatus && (
            <Badge colorPalette={paymentStatusColorPalette} size="lg" variant="surface">
              {t(`PaymentStatus.${paymentStatus}`)}
            </Badge>
          )}
        </HStack>
        {paymentStatusControl}
      </Flex>
      {paymentStatus !== "COMPLETED" && checkoutSessionUrl && (
        <ClipboardRoot value={checkoutSessionUrl ?? ""} mt={4}>
          <ClipboardButton
            copyText={t("orderPage.payment.copyPaymentLink", {
              defaultValue: "Copy payment link",
            })}
          />
        </ClipboardRoot>
      )}
      <Separator my={"4"} />
      <Flex justifyContent={"space-between"}>
        <Text>
          {t("orderPage.payment.partial_sum", { defaultValue: "Partial sum" })}
        </Text>
        <Text>
          {formatPrice(
            getTotalPrice(items, 0),
            paymentCurrency,
            undefined,
            undefined,
            i18n.resolvedLanguage,
          )}
        </Text>
      </Flex>
      <Flex justifyContent={"space-between"}>
        <Text>
          {t("orderPage.payment.shipping", { defaultValue: "Shipping" })}
        </Text>
        <Text>
          {formatPrice(
            shippingPrice ?? 0,
            paymentCurrency,
            undefined,
            undefined,
            i18n.resolvedLanguage,
          )}
        </Text>
      </Flex>
      {totalPriceWithoutDiscount !== undefined &&
        totalPriceWithoutDiscount !== totalPrice && (
          <Flex fontSize={"lg"} justifyContent={"space-between"}>
            <Text>
              {t("orderPage.payment.totalBeforeDiscount", {
                defaultValue: "Total before discount",
              })}
            </Text>
            <Text>
              {formatPrice(
                totalPriceWithoutDiscount,
                paymentCurrency,
                undefined,
                undefined,
                i18n.resolvedLanguage,
              )}
            </Text>
          </Flex>
        )}
      {storeCreditRedemption && storeCreditRedemption.amount > 0 ? (
        <Flex justifyContent={"space-between"}>
          <Text>
            {t("orderPage.payment.storeCredit", {
              defaultValue: "Store credit",
            })}
          </Text>
          <Text color="green.solid">
            -
            {formatPrice(
              storeCreditRedemption.amount,
              storeCreditRedemption.currency,
              undefined,
              undefined,
              i18n.resolvedLanguage,
            )}
          </Text>
        </Flex>
      ) : null}
      {shouldShowTaxSummary ? (
        <>
          <Flex justifyContent={"space-between"}>
            <Text>
              {t("orderPage.payment.netTotal", {
                defaultValue: "Net total",
              })}
            </Text>
            <Text>
              {formatPrice(
                resolvedTaxSummary.totalNet,
                resolvedTaxSummary.currency,
                undefined,
                undefined,
                i18n.resolvedLanguage,
              )}
            </Text>
          </Flex>
          <Flex justifyContent={"space-between"}>
            <Text>
              {t("orderPage.payment.taxTotal", {
                defaultValue: "Tax",
              })}
            </Text>
            <Text>
              {formatPrice(
                resolvedTaxSummary.totalTax,
                resolvedTaxSummary.currency,
                undefined,
                undefined,
                i18n.resolvedLanguage,
              )}
            </Text>
          </Flex>
        </>
      ) : null}
      <Flex
        fontSize={"lg"}
        color="primary.solid"
        justifyContent={"space-between"}
        fontWeight={"600"}
      >
        <Text>{t("orderPage.payment.total", { defaultValue: "Total" })}</Text>
        <Text>
          {formatPrice(
            totalPrice,
            paymentCurrency,
            undefined,
            undefined,
            i18n.resolvedLanguage,
          )}
        </Text>
      </Flex>
    </>
  );
}
