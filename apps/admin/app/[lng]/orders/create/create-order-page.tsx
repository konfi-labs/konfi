"use client";

import { getAdminConfigFlags } from "@/actions";
import { useAuth } from "context/auth";
import { CatalogProvider } from "@/context/catalog";
import { CustomersProvider } from "@/context/customers";
import { useTenantContext } from "@/context/tenant";
import type { EmailOrderImportDraft } from "@/lib/ai/email-order-import";
import type { AgentOrderItem } from "@/lib/ai/durable-agents/types";
import { DraftFakturowniaInvoiceDialog } from "@/components/fakturownia/DraftFakturowniaInvoiceDialog";
import type { FakturowniaInvoiceOrderDraft } from "@/components/fakturownia/FakturowniaInvoiceForm";
import type { OrderFormLiveValues } from "@/components/orders/OrderForm";
import { OverdueInvoicesAlert } from "@/components/fakturownia/OverdueInvoicesAlert";
import { SaasRuntimeOnboarding } from "@/components/onboarding/SaasRuntimeOnboarding";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import {
  extractQuoteAgentData,
  mapAgentItemsToFormattedOrderItems,
} from "@/lib/ai/agent-prefill";
import { firestore } from "@/lib/firebase/clientApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  Alert,
  Grid,
  GridItem,
  Separator,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ApplyPromotionCode,
  ButtonLink,
  CustomHeading,
  Item,
  MaterialSymbol,
  OrderDetails,
  toaster,
} from "@konfi/components";
import { getCustomerInvoiceAutomation } from "@konfi/firebase";
import {
  Discount,
  FormattedOrderItem,
  isNestedCustomer,
  OrderItem,
  type PromotionRuleContext,
} from "@konfi/types";
import {
  ADMIN_ORDERS,
  getSubtotalPrice,
  getTotalPrice,
  isShippingFree,
  OrderCreateSchema,
  safeLocalStorage,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfigurationSettings } from "context/configuration";
import { isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import useSWRImmutable from "swr/immutable";
import { InferType } from "yup";
const OrderForm = dynamic(() => import("@/components/orders/OrderForm"), {
  ssr: false,
});
type CreateInput = InferType<typeof OrderCreateSchema>;
type OrderValues = OrderFormLiveValues;
type AdminOrderCreateMode = "standard" | "quick";
const ORDER_CREATE_MODE_STORAGE_KEY = "admin.orderCreate.createMode";

function getStoredOrderCreateMode(): AdminOrderCreateMode {
  const storedMode = safeLocalStorage.getItem(ORDER_CREATE_MODE_STORAGE_KEY);

  return storedMode === "quick" ? "quick" : "standard";
}

const CreateOrderPage = ({
  orderItems,
  initialEmailImport,
}: {
  orderItems?: FormattedOrderItem[];
  initialEmailImport?: {
    conversationId: string;
    subject: string;
    orderDraft: EmailOrderImportDraft;
  };
}) => {
  const { t, i18n } = useT(["order", "translation"]);
  const { user } = useAuth();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided === true;
  const tenantContext = useTenantContext();
  const [values, setValues] = useState<OrderValues | undefined>();
  const [createMode, setCreateMode] = useState<AdminOrderCreateMode>(
    getStoredOrderCreateMode,
  );
  const deferredCreateMode = useDeferredValue(createMode);
  const [freeShipping, setFreeShipping] = useState<boolean>(false);
  const [prefillItems, setPrefillItems] = useState<
    FormattedOrderItem[] | undefined
  >(initialEmailImport?.orderDraft.items ?? orderItems);
  const [prefillOverrides, setPrefillOverrides] = useState<
    Partial<CreateInput> | undefined
  >(
    initialEmailImport
      ? {
          customer: initialEmailImport.orderDraft.customer,
          contact: initialEmailImport.orderDraft.contact,
          email: initialEmailImport.orderDraft.email,
          shippingOption: initialEmailImport.orderDraft.shippingOption,
          specialNotes: initialEmailImport.orderDraft.specialNotes,
          mailLink: initialEmailImport.orderDraft.mailLink,
        }
      : undefined,
  );
  const { storeSettings } = useConfigurationSettings();
  const { channel } = useChannels();
  const shouldRenderSaasRuntimeOnboarding =
    isSharedSaasTenantRuntime(tenantContext);
  const customer = useMemo(() => values?.customer, [values]);
  const promotionRuleContext = useMemo<PromotionRuleContext>(
    () => ({
      channelId: channel?.id,
      customerGroupIds: isNestedCustomer(customer)
        ? customer.customerGroupIds
        : undefined,
    }),
    [channel?.id, customer],
  );
  const setItemsWithDiscount = useCallback((discountedItems: OrderItem[]) => {
    setValues((currentValues) => {
      if (isUndefined(currentValues)) return currentValues;
      return { ...currentValues, items: discountedItems };
    });
  }, []);
  const [appliedPromotionCodes, setAppliedPromotionCodes] = useState<string[]>(
    [],
  );
  const items = useMemo(() => values?.items ?? [], [values]);
  const [shippingPriceDiscount, setShippingPriceDiscount] =
    useState<Discount | null>(null);
  const [totalDiscount, settotalDiscount] = useState<Discount | null>(null);
  const mapAgentItems = useCallback(
    (agentItems: AgentOrderItem[]): FormattedOrderItem[] =>
      mapAgentItemsToFormattedOrderItems(agentItems, channel?.id),
    [channel?.id],
  );
  const shippingPrice = useMemo(() => {
    if (isUndefined(values)) return 0;
    let nextShippingPrice = values.shippingOption
      ? freeShipping
        ? 0
        : (storeSettings?.shippingOptionsPrices[values.shippingOption] ?? 0)
      : 0;
    if (shippingPriceDiscount) {
      nextShippingPrice =
        nextShippingPrice - shippingPriceDiscount.discountedAmount;
    }
    return nextShippingPrice;
  }, [
    values,
    freeShipping,
    storeSettings?.shippingOptionsPrices,
    shippingPriceDiscount,
  ]);
  const subtotal = useMemo(() => {
    if (isUndefined(values)) return 0;
    return isUndefined(values.items) ? 0 : getSubtotalPrice(values.items);
  }, [values]);
  const total = useMemo(() => {
    if (isUndefined(values)) return 0;
    let nextTotal = values.items
      ? getTotalPrice(values.items, shippingPrice)
      : NaN;
    if (totalDiscount) {
      nextTotal = nextTotal - totalDiscount.discountedAmount;
    }
    return nextTotal;
  }, [values, shippingPrice, totalDiscount]);
  const invoiceDraft = useMemo<FakturowniaInvoiceOrderDraft>(
    () => ({
      customer: values?.customer,
      contact: values?.contact,
      email: values?.email,
      shipping: values?.shipping ?? null,
      shippingOption: values?.shippingOption ?? null,
      shippingPrice,
      invoice: values?.invoice ?? false,
      billing: values?.billing ?? null,
      totalPrice: total,
      currency: channel?.currency,
      items,
      paymentType: values?.paymentType,
      paymentStatus: values?.paymentStatus,
      channelId: channel?.id,
      invoiceNotes: values?.invoiceNotes,
    }),
    [
      channel?.currency,
      channel?.id,
      items,
      shippingPrice,
      total,
      values?.billing,
      values?.contact,
      values?.customer,
      values?.email,
      values?.invoice,
      values?.paymentStatus,
      values?.invoiceNotes,
      values?.paymentType,
      values?.shipping,
      values?.shippingOption,
    ],
  );
  useEffect(() => {
    setFreeShipping(
      isShippingFree(
        subtotal,
        storeSettings?.freeShipping.enabled ?? false,
        storeSettings?.freeShipping.min ?? NaN,
      ),
    );
  }, [
    storeSettings?.freeShipping.enabled,
    storeSettings?.freeShipping.min,
    subtotal,
    values?.shippingOption,
  ]);

  // Track Fakturownia client ID from customer automation
  const [fakturowniaClientId, setFakturowniaClientId] = useState<
    string | undefined
  >(undefined);

  // Fetch customer automation when customer changes
  useEffect(() => {
    if (!hasFakturowniaKey) {
      setFakturowniaClientId(undefined);
      return;
    }

    const customerId = isNestedCustomer(customer)
      ? customer.id?.trim()
      : undefined;

    if (!customerId) {
      setFakturowniaClientId(undefined);
      return;
    }

    let cancelled = false;

    const fetchAutomation = async () => {
      try {
        const automation = await getCustomerInvoiceAutomation(
          firestore,
          customerId,
        );
        if (!cancelled) {
          setFakturowniaClientId(
            automation?.fakturowniaClientId?.trim() || undefined,
          );
        }
      } catch {
        if (!cancelled) {
          setFakturowniaClientId(undefined);
        }
      }
    };

    void fetchAutomation();

    return () => {
      cancelled = true;
    };
  }, [customer, hasFakturowniaKey]);

  useEffect(() => {
    let cancelled = false;

    const fetchPrefill = async () => {
      const params = new URLSearchParams(window.location.search);
      const agentRunId = params.get("agentRunId");

      if (!agentRunId || !user) {
        return;
      }

      try {
        const idToken = await user.getIdToken();
        if (!idToken) {
          return;
        }

        const response = await fetch(`/api/agents/status?runId=${agentRunId}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          console.error(
            "[CreateOrder] Failed to fetch agent data",
            await response.text(),
          );
          return;
        }

        const data = await response.json();
        const collectedData = extractQuoteAgentData(data);

        if (!collectedData || cancelled) {
          return;
        }

        if (collectedData.items?.length) {
          setPrefillItems(mapAgentItems(collectedData.items));
        }

        setPrefillOverrides((previous) => ({
          ...previous,
          customer: collectedData.customer ?? previous?.customer,
          contact: collectedData.contact ?? previous?.contact,
          paymentType: collectedData.paymentType ?? previous?.paymentType,
          shippingOption:
            collectedData.shippingOption ?? previous?.shippingOption,
          specialNotes: collectedData.specialNotes ?? previous?.specialNotes,
        }));
      } catch (error) {
        console.error(
          "[CreateOrder] Failed to prefill order from agent",
          error,
        );
      }
    };

    void fetchPrefill();

    return () => {
      cancelled = true;
    };
  }, [mapAgentItems, user]);

  return (
    <>
      <CustomHeading
        heading={t("order.new")}
        mb={8}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Grid templateColumns="repeat(5, 1fr)" gap="32">
        <GridItem minW={"100%"} colSpan={3}>
          {shouldRenderSaasRuntimeOnboarding && (
            <CatalogProvider>
              <CustomersProvider>
                <SaasRuntimeOnboarding intent="order" />
              </CustomersProvider>
            </CatalogProvider>
          )}
          {initialEmailImport && (
            <Alert.Root status="info" mb={6}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("emails.importOrderDraftReadyTitle", {
                    defaultValue: "Order draft ready",
                  })}
                </Alert.Title>
                <Alert.Description>
                  <Text>
                    {t("emails.importOrderDraftReadyDescription", {
                      defaultValue:
                        "The order form was pre-filled from the selected email conversation.",
                    })}
                  </Text>
                  <Text mt={2} fontWeight="medium">
                    {initialEmailImport.subject ||
                      t("emails.noSubject", {
                        defaultValue: "(No subject)",
                      })}
                  </Text>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          <Tabs.Root
            colorPalette="primary"
            mb={6}
            value={createMode}
            onValueChange={({ value }) => {
              if (value === "standard" || value === "quick") {
                safeLocalStorage.setItem(ORDER_CREATE_MODE_STORAGE_KEY, value);
                setCreateMode(value);
              }
            }}
          >
            <Tabs.List w="fit-content">
              <Tabs.Trigger value="standard">
                <MaterialSymbol>assignment</MaterialSymbol>
                {t("order.createMode.standard", {
                  defaultValue: "Full",
                })}
              </Tabs.Trigger>
              <Tabs.Trigger value="quick">
                <MaterialSymbol>bolt</MaterialSymbol>
                {t("order.createMode.quick", {
                  defaultValue: "Quick",
                })}
              </Tabs.Trigger>
              <Tabs.Indicator />
            </Tabs.List>
          </Tabs.Root>
          <OrderForm
            type={"CREATE"}
            createMode={deferredCreateMode}
            onValuesChange={(liveValues) =>
              startTransition(() => setValues(liveValues))
            }
            orderItems={prefillItems}
            createInitialOverrides={prefillOverrides}
          />
        </GridItem>
        <GridItem minW={"100%"} colSpan={2}>
          <OrderDetails
            subtotal={subtotal}
            total={total}
            shippingPrice={shippingPrice}
            currency={channel?.currency}
            freeShipping={freeShipping}
            t={t}
            i18n={i18n}
          >
            <VStack align="stretch" gap={3} mt={8} mb={8}>
              <ButtonLink
                lng={i18n.resolvedLanguage}
                href={ADMIN_ORDERS}
                w={"100%"}
                variant={"solid"}
                ariaLabel={t("order.backToOrders")}
              >
                <MaterialSymbol>arrow_back</MaterialSymbol>
                {t("order.backToOrders")}
              </ButtonLink>
              {hasFakturowniaKey && (
                <DraftFakturowniaInvoiceDialog
                  draftOrder={invoiceDraft}
                  disabled={items.length === 0}
                />
              )}
            </VStack>
            <ApplyPromotionCode
              appliedPromotionCodes={appliedPromotionCodes}
              items={items}
              shippingPrice={shippingPrice}
              shippingPriceDiscount={shippingPriceDiscount}
              total={total}
              totalDiscount={totalDiscount}
              currency={channel?.currency}
              revalidate={false}
              toast={toaster}
              setItemsWithDiscount={setItemsWithDiscount}
              setAppliedPromotionCodes={setAppliedPromotionCodes}
              setShippingPriceDiscount={setShippingPriceDiscount}
              setTotalDiscount={settotalDiscount}
              firestore={firestore}
              userId={isNestedCustomer(customer) ? customer.id : ""}
              ruleContext={promotionRuleContext}
              t={t}
            />
            {hasFakturowniaKey && (
              <OverdueInvoicesAlert clientId={fakturowniaClientId} mt={6} />
            )}
            <Separator mt={6} />
            <VStack
              separator={
                <Separator
                  borderColor={{
                    base: "blackAlpha.200",
                    _dark: "blackAlpha.700",
                  }}
                />
              }
              gap={2}
              pt={6}
            >
              {values?.items?.map((item, index) => (
                <Item
                  key={index}
                  item={item}
                  channelId={channel?.id ?? ""}
                  t={t}
                  i18n={i18n}
                />
              ))}
            </VStack>
          </OrderDetails>
        </GridItem>
      </Grid>
    </>
  );
};

export default CreateOrderPage;
