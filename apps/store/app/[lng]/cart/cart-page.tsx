"use client";

import {
  Alert,
  Badge,
  Center,
  Checkbox,
  Grid,
  GridItem,
  Separator,
  Skeleton,
  Spinner,
  Text,
} from "@chakra-ui/react";
import {
  ApplyPromotionCode,
  ButtonLink,
  CustomHeading,
  Empty,
  Link,
  MaterialSymbol,
  OrderDetails,
  PreflightIssues,
  RadioGroup,
  toaster,
} from "@konfi/components";
import {
  PaymentType,
  type PromotionRuleContext,
  Settings,
  ShippingOptions,
} from "@konfi/types";
import * as ROUTES from "@konfi/utils";
import {
  getEstimatedDelivery,
  formatConvertedPrice,
  getPaymentMethodLabel,
  getShippingMethodLabel,
  getShippingMethodPrice,
  getStoreCreditRedemptionLimit,
  isShippingFree,
} from "@konfi/utils";
import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { getCartShippingRuleContext } from "@/context/cart-selections";
import { useStoreCurrency } from "@/context/currency";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { firestore } from "@/lib/firebase/clientApp";
import { buildRuntimeAssetUrl, readRuntimeString } from "@/lib/runtime-config";
import dynamic from "next/dynamic";
import { FC, useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/client";
const CartItems = dynamic(() => import("app/[lng]/components/cart/CartItems"), {
  loading: () => <Skeleton height={"100px"} w={"100%"} />,
  ssr: false,
});

interface Props {
  settings?: Settings;
}

const CartPage: FC<Props> = ({ settings }) => {
  const {
    loading,
    isEmpty: isEmptyCart,
    subtotal,
    total,
    totalBeforeStoreCredit,
    shippingOption,
    shippingPrice,
    setShippingPrice,
    isValid,
    validationErrors,
    availableShippingOptions,
    availablePaymentTypes,
    shippingMethodsSettings,
    paymentMethodsSettings,
    items,
    setShippingOption,
    setPaymentType,
    paymentType,
    preflightIssues,
    discountAmount,
    appliedPromotionCodes,
    setAppliedPromotionCodes,
    totalDiscount,
    shippingPriceDiscount,
    setItemsWithDiscount,
    setShippingPriceDiscount,
    setTotalDiscount,
    storeCreditAmount,
    setStoreCreditAmount,
  } = useCart();
  const { t, i18n } = useT();
  const { selectedCurrencyCode, settings: currencySettings } =
    useStoreCurrency();
  const runtimeConfig = useStoreRuntimeConfig();
  const [freeShipping, setFreeShipping] = useState(false);
  const [regulationAccept, setRegulationAccept] = useState(false);
  const [termsAccept, setTermsAccept] = useState(false);
  const { customer, user } = useAuth();
  const promotionRuleContext = useMemo<PromotionRuleContext>(
    () => ({
      channelId: runtimeConfig.channelId,
      customerGroupIds: customer?.customerGroupIds,
      isFirstOrder: !customer?.orders?.length,
    }),
    [
      customer?.customerGroupIds,
      customer?.orders?.length,
      runtimeConfig.channelId,
    ],
  );

  useEffect(() => {
    if (!settings) return;
    const shippingFree = isShippingFree(
      subtotal,
      settings.freeShipping.enabled,
      settings.freeShipping.min,
    );
    const ruleShippingPrice = getShippingMethodPrice(
      shippingOption,
      settings.shippingOptionsPrices[shippingOption],
      shippingMethodsSettings,
      getCartShippingRuleContext(items, {
        channelId: runtimeConfig.channelId,
        subtotal,
      }),
    );
    setShippingPrice(shippingFree ? 0 : ruleShippingPrice);
    setFreeShipping(shippingFree);
  }, [
    items,
    runtimeConfig.channelId,
    setShippingPrice,
    settings,
    shippingMethodsSettings,
    shippingOption,
    subtotal,
  ]);

  const orderCurrency = items?.[0]?.product?.defaultPrice?.currency ?? "PLN";
  const storeCreditRedemptionLimit =
    selectedCurrencyCode === orderCurrency
      ? getStoreCreditRedemptionLimit({
          balance: customer?.storeCreditBalance,
          orderTotal: totalBeforeStoreCredit,
        })
      : 0;

  useEffect(() => {
    if (
      storeCreditAmount > 0 &&
      (storeCreditRedemptionLimit === 0 ||
        storeCreditAmount > storeCreditRedemptionLimit)
    ) {
      setStoreCreditAmount(storeCreditRedemptionLimit);
    }
  }, [setStoreCreditAmount, storeCreditAmount, storeCreditRedemptionLimit]);

  if (!settings) return null;

  if (loading)
    return (
      <Center h="calc(100vh - 66px)">
        <Spinner color="primary.solid" />
      </Center>
    );

  if (!!isEmptyCart && !loading)
    return (
      <Empty
        title={t("store.cart.empty", { defaultValue: "Cart is empty" })}
        description={t("store.cart.addProducts", {
          defaultValue: "Add products to cart",
        })}
        icon={"shopping_cart"}
      >
        <ButtonLink
          lng={i18n.resolvedLanguage}
          href={ROUTES.STORE_PRODUCTS}
          colorPalette={"primary"}
          variant={"solid"}
          ariaLabel={t("store.cart.goToStore", { defaultValue: "Go to store" })}
        >
          <MaterialSymbol>shopping_cart</MaterialSymbol>
          {t("store.cart.goToStore", { defaultValue: "Go to store" })}
        </ButtonLink>
      </Empty>
    );

  const shippingOptions = availableShippingOptions ?? [];
  const paymentTypes = availablePaymentTypes ?? [];
  const filesMail =
    readRuntimeString(runtimeConfig.contact, "filesMail", "filesEmail") ??
    process.env.NEXT_PUBLIC_FILES_MAIL;

  const availableShippingOptionsAsOptions = shippingOptions.map((option) => ({
    value: option,
    label: getShippingMethodLabel(
      option,
      shippingMethodsSettings,
      t,
      i18n.resolvedLanguage ?? i18n.language,
    ),
    image:
      option !== ShippingOptions.PERSONAL_COLLECTION
        ? buildRuntimeAssetUrl(
            runtimeConfig.cdnUrl,
            `shippingOptions/${option}.png?fit=max&auto=format`,
          )
        : undefined,
  }));

  const availablePaymentTypesAsOptions = paymentTypes.map((option) => ({
    value: option,
    label: getPaymentMethodLabel(
      option,
      paymentMethodsSettings,
      t,
      i18n.resolvedLanguage ?? i18n.language,
    ),
    image: buildRuntimeAssetUrl(
      runtimeConfig.cdnUrl,
      `paymentTypes/${option}.png?fit=max&auto=format`,
    ),
  }));
  const paymentOptionsUnavailable = paymentTypes.length === 0;
  const selectedPaymentTypeUnavailable = !paymentTypes.includes(paymentType);

  if (!settings) return null;

  return (
    <>
      <CustomHeading
        heading={t("store.cart.label", { defaultValue: "Cart" })}
        mb={"8"}
      />
      {!settings.buying.enabled && (
        <Alert.Root status={"error"} mt={8} borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("store.cart.ordersDisabled", {
                defaultValue: "Orders are disabled!",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("store.cart.ordersDisabledDescription", {
                defaultValue:
                  "You can browse products, but you cannot place orders at the moment.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Grid templateColumns="repeat(5, 1fr)" gap={["8", "16"]}>
        <GridItem minW={"100%"} colSpan={[5, 3]}>
          <Text mb={"4"} fontSize="lg" fontWeight={"600"}>
            {t("store.cart.shipping", { defaultValue: "Shipping" })}
            <Badge ml={2} colorPalette={"primary"}>
              {t("store.cart.estimatedDelivery", {
                defaultValue: "Estimated shipping: ",
              })}{" "}
              {getEstimatedDelivery(items)?.toLocaleDateString(
                i18n.resolvedLanguage,
              )}
            </Badge>
          </Text>
          <Separator mb={6} />
          {availableShippingOptionsAsOptions.length > 0 ? (
            <RadioGroup
              mb={"6"}
              columns={[
                1,
                1,
                Math.round(availableShippingOptionsAsOptions.length / 2),
              ]}
              name={"shippingOption"}
              options={availableShippingOptionsAsOptions}
              setShippingOption={setShippingOption}
              value={shippingOption}
              t={t}
              i18n={i18n}
            />
          ) : (
            <Center py={8}>
              <Spinner size="sm" color="primary.solid" />
            </Center>
          )}
        </GridItem>
        <GridItem minW={"100%"} colSpan={[5, 2]}>
          <Text mb={"4"} fontSize="lg" fontWeight={"600"}>
            {t("store.cart.payment", { defaultValue: "Payment" })}
          </Text>
          <Separator mb={6} />
          {availablePaymentTypesAsOptions.length > 0 ? (
            <RadioGroup
              mb={"6"}
              columns={[
                1,
                1,
                availablePaymentTypesAsOptions.length === 2 ? 1 : 2,
              ]}
              name={"paymentType"}
              options={availablePaymentTypesAsOptions}
              setPaymentType={setPaymentType}
              value={paymentType}
              t={t}
              i18n={i18n}
            />
          ) : (
            <Alert.Root
              status="warning"
              mb={6}
              borderRadius="3xl"
              aria-live="polite"
            >
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("store.cart.paymentUnavailableTitle", {
                    defaultValue: "Checkout is unavailable",
                  })}
                </Alert.Title>
                <Alert.Description>
                  {t("store.cart.paymentUnavailableDescription", {
                    defaultValue:
                      "This storefront has no usable payment methods configured. Please contact the store team before placing an order.",
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
        </GridItem>
      </Grid>
      <Grid templateColumns="repeat(5, 1fr)" gap={["8", "16"]}>
        <GridItem minW={"100%"} colSpan={[5, 3]}>
          <Text mb={"4"} fontSize={["2xl", "lg"]} fontWeight={"600"}>
            {t("store.cart.products", { defaultValue: "Products" })}
          </Text>
          {validationErrors.length > 0 &&
            validationErrors.map((error, index) => (
              <Alert.Root
                key={index}
                status={"warning"}
                my={8}
                borderRadius="3xl"
              >
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{error.title}</Alert.Title>
                  <Alert.Description>{error.description}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ))}
          <CartItems />
          {filesMail && filesMail.includes("@") && (
            <Alert.Root status={"info"} my={8} borderRadius="3xl">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {t("store.cart.sendFilesViaMailInfo", {
                    defaultValue:
                      "If you have files larger than our limit, you can send them via services like WeTransfer, Google Drive, or other file sharing platforms to: {{email}}",
                    email: filesMail,
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          {preflightIssues && (
            <PreflightIssues issues={preflightIssues} t={t} />
          )}
        </GridItem>
        <GridItem
          id="order-details"
          minW={"100%"}
          colSpan={[5, 2]}
          scrollMarginTop="8rem"
        >
          <OrderDetails
            subtotal={subtotal}
            total={total}
            shippingPrice={shippingPrice}
            currency={selectedCurrencyCode}
            currencySettings={currencySettings}
            freeShipping={freeShipping}
            discountAmount={discountAmount}
            storeCreditAmount={storeCreditAmount}
            t={t}
            i18n={i18n}
          >
            <Text mt={2} mb={6} fontSize={"sm"} paddingInline={0}>
              {t("store.cart.calculationInfo", {
                defaultValue:
                  "*Shipping price may change during calculation in the next step.",
              })}
            </Text>
            <ApplyPromotionCode
              appliedPromotionCodes={appliedPromotionCodes}
              items={items}
              shippingPrice={shippingPrice}
              shippingPriceDiscount={shippingPriceDiscount}
              total={total}
              currency={items?.[0]?.product?.defaultPrice?.currency}
              totalDiscount={totalDiscount}
              revalidate={false}
              toast={toaster}
              setItemsWithDiscount={setItemsWithDiscount}
              setAppliedPromotionCodes={setAppliedPromotionCodes}
              setShippingPriceDiscount={setShippingPriceDiscount}
              setTotalDiscount={setTotalDiscount}
              firestore={firestore}
              userId={user?.uid}
              ruleContext={promotionRuleContext}
              t={t}
            />
            {storeCreditRedemptionLimit > 0 ? (
              <Checkbox.Root
                mt={6}
                checked={storeCreditAmount > 0}
                onCheckedChange={({ checked }) =>
                  setStoreCreditAmount(checked ? storeCreditRedemptionLimit : 0)
                }
                colorPalette={"primary"}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>
                  {t("store.cart.useStoreCredit", {
                    defaultValue: "Use {{amount}} store credit",
                    amount: formatConvertedPrice(
                      storeCreditRedemptionLimit,
                      selectedCurrencyCode,
                      currencySettings,
                      undefined,
                      undefined,
                      i18n.resolvedLanguage,
                      "PLN",
                    ),
                  })}
                </Checkbox.Label>
              </Checkbox.Root>
            ) : null}
            <Checkbox.Root
              mt={6}
              required={true}
              checked={termsAccept}
              onCheckedChange={({ checked }) =>
                setTermsAccept(checked as boolean)
              }
              colorPalette={"primary"}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                {t("store.cart.termsAccept1", {
                  defaultValue: "I have read and accept the ",
                })}
                <Link
                  lng={i18n.resolvedLanguage}
                  href={ROUTES.STORE_REGULATIONS}
                  color={"primary.solid"}
                >
                  {t("store.cart.termsAccept2", {
                    defaultValue: "terms and conditions",
                  })}
                </Link>
                {t("store.cart.termsAccept3", {
                  defaultValue: " of the service",
                })}
              </Checkbox.Label>
            </Checkbox.Root>
            {paymentType === PaymentType.PRZELEWY24 && (
              <Checkbox.Root
                mt={6}
                required={true}
                checked={regulationAccept}
                onCheckedChange={({ checked }) =>
                  setRegulationAccept(checked as boolean)
                }
                colorPalette={"primary"}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>
                  {t("store.cart.przelewy24Info1", {
                    defaultValue: "I declare that I have read the ",
                  })}
                  <Link
                    lng={i18n.resolvedLanguage}
                    href={`https://www.przelewy24.pl/regulamin`}
                    color={"primary.solid"}
                  >
                    {t("store.cart.przelewy24Info2", {
                      defaultValue: "terms and conditions",
                    })}
                  </Link>
                  <Link
                    lng={i18n.resolvedLanguage}
                    href={`https://www.przelewy24.pl/obowiazek-informacyjny-rodo-platnicy`}
                    color={"primary.solid"}
                  >
                    {t("store.cart.przelewy24Info3", {
                      defaultValue: "information obligation",
                    })}
                  </Link>{" "}
                  {t("store.cart.przelewy24Info4", {
                    defaultValue: "of the Przelewy24 service",
                  })}
                </Checkbox.Label>
              </Checkbox.Root>
            )}
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ROUTES.STORE_CHECKOUT}
              prefetch={true}
              rel={"nofollow"}
              mt="6"
              w="100%"
              colorPalette="primary"
              variant="solid"
              loading={!!loading}
              disabled={
                !settings.buying.enabled ||
                !isValid ||
                paymentOptionsUnavailable ||
                selectedPaymentTypeUnavailable ||
                !termsAccept ||
                (paymentType === PaymentType.PRZELEWY24 && !regulationAccept)
              }
              ariaLabel={t("store.cart.buyButton", {
                defaultValue: "Buy and pay",
              })}
            >
              <MaterialSymbol>shopping_cart_checkout</MaterialSymbol>
              {t("store.cart.buyButton", { defaultValue: "Buy and pay" })}
            </ButtonLink>
          </OrderDetails>
        </GridItem>
      </Grid>
    </>
  );
};

export default CartPage;
