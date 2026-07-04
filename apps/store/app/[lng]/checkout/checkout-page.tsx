"use client";

import { Separator, Grid, GridItem, Skeleton } from "@chakra-ui/react";
import { Empty, CustomHeading, OrderDetails } from "@konfi/components";
import { Settings, UnitsProofingSettings, Warehouse } from "@konfi/types";
import {
  getProofingMethodOptions,
  getShippingMethodPrice,
  isShippingFree,
} from "@konfi/utils";
import Loader from "app/[lng]/components/Loader";
import { useCart } from "@/context/cart";
import { getCartShippingRuleContext } from "@/context/cart-selections";
import { useStoreCurrency } from "@/context/currency";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/client";
const CheckoutForm = dynamic(
  () => import("app/[lng]/components/checkout/CheckoutForm"),
  {
    loading: () => <Skeleton height="100vh" w={"100%"} />,
    ssr: false,
  },
);
const CartItems = dynamic(() => import("app/[lng]/components/cart/CartItems"), {
  loading: () => <Skeleton height="100px" w={"100%"} />,
  ssr: false,
});
const Success = dynamic(() => import("app/[lng]/components/checkout/Success"), {
  ssr: false,
});
const Error = dynamic(() => import("app/[lng]/components/checkout/Error"), {
  ssr: false,
});
const Processing = dynamic(
  () => import("app/[lng]/components/checkout/Processing"),
  {
    ssr: false,
  },
);

interface Props {
  settings?: Settings;
  unitsProofingSettings?: UnitsProofingSettings;
  warehouses?: Warehouse[];
}

const CheckoutPage = ({
  settings,
  unitsProofingSettings,
  warehouses,
}: Props) => {
  const { t, i18n } = useT();
  const { channelId } = useStoreRuntimeConfig();
  const {
    loading,
    isEmpty,
    total,
    subtotal,
    shippingOption,
    shippingPrice,
    setShippingPrice,
    shippingPriceDiscount,
    shippingMethodsSettings,
    paymentType,
    discountAmount,
    items,
  } = useCart();
  const { selectedCurrencyCode, settings: currencySettings } =
    useStoreCurrency();
  const [freeShipping, setFreeShipping] = useState(false);
  const [error, setError] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [url, setUrl] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const proofingMethodOptions = useMemo(
    () => getProofingMethodOptions(unitsProofingSettings, t),
    [unitsProofingSettings, t],
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
        channelId,
        subtotal,
      }),
    );
    setShippingPrice(
      shippingFree
        ? 0
        : shippingPriceDiscount
          ? Math.max(
              0,
              ruleShippingPrice - shippingPriceDiscount.discountedAmount,
            )
          : ruleShippingPrice,
    );
    setFreeShipping(shippingFree);
  }, [
    channelId,
    items,
    setShippingPrice,
    shippingPriceDiscount,
    shippingMethodsSettings,
    settings,
    shippingOption,
    subtotal,
  ]);

  if (loading)
    return (
      <Loader text={t("common.loading", { defaultValue: "Loading..." })} />
    );

  if (!!isEmpty && !loading && !showSuccess)
    return (
      <Empty
        title={t("cart.empty", { defaultValue: "Cart is empty" })}
        description={t("cart.addProducts", {
          defaultValue: "Add products to cart",
        })}
        icon={"shopping_cart"}
      />
    );

  if (showSuccess) return <Success url={url} paymentType={paymentType} />;

  if (error) return <Error error={error} setError={setError} />;

  if (processing) return <Processing />;

  if (!settings || !warehouses)
    return (
      <Empty
        title={t("store.checkout.configurationUnavailableTitle", {
          defaultValue: "Checkout is unavailable",
        })}
        description={t("store.checkout.configurationUnavailableDescription", {
          defaultValue:
            "This storefront is missing checkout configuration. Please contact the store team before placing an order.",
        })}
        icon={"payments"}
      />
    );

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.checkout", { defaultValue: "Checkout" })}
      />
      <Grid templateColumns="repeat(5, 1fr)" gap={["8", "16"]}>
        <GridItem minW={"100%"} colSpan={[5, 3]}>
          <CheckoutForm
            channelId={channelId}
            warehouses={warehouses}
            shippingPrice={shippingPrice}
            setUrl={setUrl}
            setShowSuccess={setShowSuccess}
            setError={setError}
            setProcessing={setProcessing}
            proofingMethodOptions={proofingMethodOptions}
            checkoutInvoiceEnabled={settings.checkout?.invoiceEnabled ?? true}
          />
        </GridItem>
        <GridItem minW={"100%"} colSpan={[5, 2]}>
          <OrderDetails
            subtotal={subtotal}
            total={total}
            shippingPrice={shippingPrice}
            currency={selectedCurrencyCode}
            currencySettings={currencySettings}
            freeShipping={freeShipping}
            discountAmount={discountAmount}
            t={t}
            i18n={i18n}
          >
            <Separator my={8} />
            <CartItems minimal />
          </OrderDetails>
        </GridItem>
      </Grid>
    </>
  );
};

export default CheckoutPage;
