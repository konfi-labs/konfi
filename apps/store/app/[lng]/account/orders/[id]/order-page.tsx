"use client";

import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { useOrders } from "@/context/orders";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import { list } from "@/lib/firebase/storage";
import { initDoc, onFileDownload } from "@/lib/helpers";
import { useChangePaymentMethod } from "@/lib/hooks/use-change-payment-method";
import {
  Box,
  Grid,
  GridItem,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  Activity,
  Customer,
  CustomHeading,
  FileList,
  OrderItemsFileList,
  Payment,
  toaster,
} from "@konfi/components";
import { tenantStoragePaths } from "@konfi/firebase";
import {
  isNestedCustomer,
  ListResults,
  Order,
  OrderItem,
  type PaymentMethodId,
  PaymentStatus,
} from "@konfi/types";
import { formatDate } from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { getMetadata } from "firebase/storage";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWRImmutable from "swr";
import { RmaRequestPanel } from "./RmaRequestPanel";

const OrderPage = () => {
  const { t, i18n } = useT();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const runtimeConfig = useStoreRuntimeConfig();
  const tenantContext = useTenantContext();
  const { shippingMethodsSettings } = useCart();
  const action = searchParams.get("action");
  const id = params?.id;
  const { orders } = useOrders();
  const { user, customer } = useAuth();
  const [loadingOrder, setLoadingOrder] = useState<boolean>(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingOrderItems, setLoadingOrderItems] = useState<boolean>(true);
  const [orderItems, setOrderItems] = useState<OrderItem[] | null>(null);
  const componentRef = useRef(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const [shouldOpenPaymentDialog, setShouldOpenPaymentDialog] = useState(false);

  const { changePaymentMethod, isLoading: isChangingPaymentMethod } =
    useChangePaymentMethod();

  const { data: attachments } = useSWRImmutable(
    !isEmpty(order) && !isNull(order) && isNestedCustomer(order.customer)
      ? ["/order/attachments", order.id, order.customer.id, order.channelId]
      : null,
    ([_key, orderId, customerId, channelId]) =>
      fetchAttachments(channelId, orderId, customerId),
  );
  const borderColor = "gray.muted";

  async function fetchAttachments(
    channelId: string,
    orderId: string,
    customerId: string,
  ) {
    const _attachments: ListResults[] = [];
    const data = await list(
      `${tenantStoragePaths.orderAttachmentFolder(
        tenantContext,
        channelId,
        customerId,
        orderId,
      )}/`,
    );
    if (!isUndefined(data)) {
      for (let i = 0; i < data.length; i++) {
        const result = data[i];
        const metadata = await getMetadata(result);
        if (!isUndefined(metadata)) {
          _attachments.push({ storageReference: result, metadata });
        }
      }
    }
    return _attachments;
  }

  const handlePaymentMethodChange = async (paymentType: PaymentMethodId) => {
    if (!order) return;

    try {
      const result = await changePaymentMethod(order.id, paymentType);

      if (result.success) {
        toaster.success({
          title: t("orderPage.payment.changeSuccess", {
            defaultValue: "Payment method updated",
          }),
          description: result.checkoutSessionUrl
            ? t("orderPage.payment.redirectingToPayment", {
                defaultValue: "Redirecting to payment...",
              })
            : t("orderPage.payment.methodUpdated", {
                defaultValue: "Payment method has been updated",
              }),
        });

        // Update local order state
        setOrder((prevOrder) =>
          prevOrder
            ? {
                ...prevOrder,
                paymentType,
                paymentStatus: PaymentStatus.NEW,
                checkoutSession: result.checkoutSessionUrl
                  ? {
                      ...prevOrder.checkoutSession,
                      id: prevOrder.checkoutSession?.id ?? "",
                      paymentIntent:
                        prevOrder.checkoutSession?.paymentIntent ?? "",
                      url: result.checkoutSessionUrl,
                    }
                  : undefined,
              }
            : null,
        );

        // Redirect to payment link if it exists
        if (result.checkoutSessionUrl) {
          setTimeout(() => {
            window.location.href = result.checkoutSessionUrl!;
          }, 1500);
        }
      } else {
        throw new Error(result.error || "Failed to change payment method");
      }
    } catch (error) {
      console.error("Error changing payment method:", error);
      toaster.error({
        title: t("orderPage.payment.changeError", {
          defaultValue: "Failed to change payment method",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("common.unknownError", {
                defaultValue: "An unknown error occurred",
              }),
      });
    }
  };

  // Init order
  useEffect(() => {
    if (isNull(orders)) {
      initDoc(
        firestore,
        setLoadingOrder,
        "/channels/" + runtimeConfig.channelId + "/orders",
        id as string,
        setOrder,
        t("common.noOrder", { defaultValue: "No order" }),
      );
      return;
    }
    const _order = orders?.find(
      (candidateOrder: Order) => candidateOrder.id === id,
    );
    if (!isUndefined(_order)) {
      setLoadingOrder(true);
      setOrder(_order);
      setLoadingOrder(false);
    }
    initDoc(
      firestore,
      setLoadingOrder,
      "/channels/" + runtimeConfig.channelId + "/orders",
      id as string,
      setOrder,
      t("common.noOrder", { defaultValue: "No order" }),
    );
  }, [id, orders, runtimeConfig.channelId, t]);

  // Set order items
  useEffect(() => {
    if (isUndefined(order)) return;
    setLoadingOrderItems(true);
    const _orderItems = [];
    if (order?.items && !(order.items.length <= 0))
      _orderItems.push(...order.items);
    setOrderItems(_orderItems);
    setLoadingOrderItems(false);
  }, [order]);

  // Handle action query parameters
  useEffect(() => {
    if (!action || !order || loadingOrder || loadingOrderItems) return;

    if (action === "changePayment") {
      setShouldOpenPaymentDialog(true);
      // Remove the action parameter from the URL without reloading the page
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState({}, document.title, url.toString());
    } else if (action === "downloadInvoice" && attachmentsRef.current) {
      setTimeout(() => {
        attachmentsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 500);
    }
  }, [action, order, loadingOrder, loadingOrderItems]);

  if (isNull(order) || isNull(orderItems)) return null;

  // Calculate total without discounts (items + shipping + order level)
  const totalPriceWithoutDiscount = (() => {
    const itemsDiscount = orderItems.reduce(
      (sum, it) => sum + (it.discount?.discountedAmount ?? 0),
      0,
    );
    const shippingDiscount = order.shippingPriceDiscount?.discountedAmount ?? 0;
    const orderLevelDiscount = order.totalPriceDiscount?.discountedAmount ?? 0;
    const storeCreditAmount = order.storeCreditRedemption?.amount ?? 0;
    return Math.max(
      0,
      Math.floor(
        order.totalPrice +
          itemsDiscount +
          shippingDiscount +
          orderLevelDiscount +
          storeCreditAmount,
      ),
    );
  })();

  return (
    <Box ref={componentRef}>
      <Skeleton loading={loadingOrder || loadingOrderItems}>
        <Stack justifyContent={"space-between"} direction={["column", "row"]}>
          <CustomHeading heading={`#${order?.number}`} />
        </Stack>
        <Text pb={"8"}>
          {formatDate(order?.createdAt, i18n.resolvedLanguage)}
        </Text>
        <Grid
          templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
          columnGap={["0", "8"]}
          rowGap={["6", "8"]}
        >
          <GridItem minW={"100%"} colSpan={[1, 3]} overflowX={"auto"}>
            <Box
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Text as="h2" fontSize="lg" fontWeight="bold">
                {t("orderPage.items")}
              </Text>
              <Separator my={"6"} />
              {orderItems && !(orderItems.length <= 0) && (
                <OrderItemsFileList
                  storage={storage}
                  customerId={user?.uid}
                  channelId={order.channelId}
                  orderId={order.id}
                  orderStatus={order.status}
                  orderShippingOption={order.shippingOption}
                  shippingMethodsSettings={shippingMethodsSettings}
                  orderItems={orderItems}
                  isStore={order.isFromStore}
                  tenantContext={tenantContext}
                  t={t}
                  i18n={i18n}
                />
              )}
            </Box>
            <Box
              mb={["6", "0"]}
              mt={["6", "8"]}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Payment
                order={order}
                checkoutSessionUrl={order?.checkoutSession?.url}
                paymentStatus={order?.paymentStatus}
                paymentType={order?.paymentType}
                paymentDocumentId={order?.paymentDocumentId}
                items={orderItems}
                shippingPrice={order.shippingPrice ?? 0}
                totalPrice={order.totalPrice}
                totalPriceWithoutDiscount={totalPriceWithoutDiscount}
                taxSummary={order.taxSummary}
                currency={order.currency}
                customer={customer || undefined}
                onPaymentMethodChange={handlePaymentMethodChange}
                isChangingPaymentMethod={isChangingPaymentMethod}
                shouldOpenDialog={shouldOpenPaymentDialog}
                onDialogOpenChange={setShouldOpenPaymentDialog}
                t={t}
                i18n={i18n}
              />
            </Box>
            <Box
              className={"noprint"}
              mt={["6", "8"]}
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Activity
                activities={order?.activities}
                lng={i18n.resolvedLanguage}
                t={t}
              />
            </Box>
          </GridItem>
          <GridItem minW={"100%"} colSpan={[1, 2]}>
            <Box
              border={"1px solid"}
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Customer
                customer={order.customer}
                invoice={order.invoice}
                shipping={order.shipping}
                shippingOption={order.shippingOption}
                anonymousPackageShipping={order.anonymousPackageShipping}
                billing={order.billing}
                paymentType={order.paymentType}
                shippingMethodsSettings={shippingMethodsSettings}
                isShop
                t={t}
                i18n={i18n}
              />
            </Box>
            {!isNull(orderItems) &&
              !isUndefined(attachments) &&
              attachments.length > 0 && (
                <Box
                  ref={attachmentsRef}
                  mt={["6", "8"]}
                  border={"1px solid"}
                  borderColor={borderColor}
                  borderRadius={"3xl"}
                  p={"8"}
                >
                  <Text as="h2" fontSize="lg" fontWeight="bold">
                    {t("orderPage.attachments")}
                  </Text>
                  <Separator my={"6"} />
                  <FileList
                    listResults={attachments}
                    onFileDownload={onFileDownload}
                    t={t}
                    i18n={i18n}
                  />
                </Box>
              )}
            <RmaRequestPanel
              borderColor={borderColor}
              order={order}
              orderItems={orderItems}
            />
          </GridItem>
        </Grid>
      </Skeleton>
    </Box>
  );
};

export default OrderPage;
