"use client";

import { getAdminConfigFlags } from "@/actions";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { DraftFakturowniaInvoiceDialog } from "@/components/fakturownia/DraftFakturowniaInvoiceDialog";
import type { FakturowniaInvoiceOrderDraft } from "@/components/fakturownia/FakturowniaInvoiceForm";
import type { QuoteFormLiveValues } from "@/components/quotes/QuoteForm";
import { useT } from "@/i18n/client";
import {
  extractQuoteAgentData,
  mapAgentItemsToFormattedOrderItems,
} from "@/lib/ai/agent-prefill";
import { firestore } from "@/lib/firebase/clientApp";
import { Grid, GridItem, Separator, VStack } from "@chakra-ui/react";
import {
  ApplyPromotionCode,
  ButtonLink,
  CustomHeading,
  Item,
  MaterialSymbol,
  OrderDetails,
  toaster,
} from "@konfi/components";
import type { AgentOrderItem } from "@/lib/ai/durable-agents/types";
import {
  Discount,
  FormattedOrderItem,
  isNestedCustomer,
  OrderItem,
  type PromotionRuleContext,
  Quote,
} from "@konfi/types";
import {
  ADMIN_QUOTES,
  getSubtotalPrice,
  getTotalPrice,
  isShippingFree,
} from "@konfi/utils";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import { useConfigurationSettings } from "context/configuration";
import { isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import useSWRImmutable from "swr/immutable";

const QuoteForm = dynamic(() => import("@/components/quotes/QuoteForm"), {
  ssr: false,
});
type QuoteValues = QuoteFormLiveValues;

type QuoteFormPrefill = {
  customer?: Quote["customer"];
  contact?: Quote["contact"];
  shippingOption?: Quote["shippingOption"];
  specialNotes?: Quote["specialNotes"];
};

const CreateQuote = ({ orderItems }: { orderItems?: FormattedOrderItem[] }) => {
  const { t, i18n } = useT();
  const { user } = useAuth();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided === true;
  const [values, setValues] = useState<QuoteValues | undefined>();
  const [freeShipping, setFreeShipping] = useState<boolean>(false);
  const [prefillItems, setPrefillItems] = useState<
    FormattedOrderItem[] | undefined
  >(orderItems);
  const [prefillValues, setPrefillValues] = useState<
    QuoteFormPrefill | undefined
  >();
  const { storeSettings } = useConfigurationSettings();
  const { channel } = useChannels();
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
  const mapAgentItems = useCallback(
    (agentItems: AgentOrderItem[]): FormattedOrderItem[] =>
      mapAgentItemsToFormattedOrderItems(agentItems, channel?.id),
    [channel?.id],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values?.items]);
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
      shippingOption: values?.shippingOption ?? null,
      shippingPrice,
      totalPrice: total,
      currency: channel?.currency,
      items,
      channelId: channel?.id,
      specialNotes: values?.specialNotes,
    }),
    [
      channel?.currency,
      channel?.id,
      items,
      shippingPrice,
      total,
      values?.contact,
      values?.customer,
      values?.shippingOption,
      values?.specialNotes,
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

  useEffect(() => {
    let cancelled = false;

    const fetchPrefill = async () => {
      if (!user) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const agentRunId = params.get("agentRunId");

      if (!agentRunId) {
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
            "[CreateQuote] Failed to fetch agent data",
            await response.text(),
          );
          return;
        }

        const data = await response.json();
        const collectedData = extractQuoteAgentData(data);

        if (!collectedData || cancelled) {
          return;
        }

        const collectedItems = collectedData.items
          ? mapAgentItems(collectedData.items)
          : undefined;

        if (collectedItems && collectedItems.length > 0) {
          setPrefillItems(collectedItems);
        }

        setPrefillValues({
          customer: collectedData.customer,
          contact: collectedData.contact,
          shippingOption: collectedData.shippingOption ?? undefined,
          specialNotes: collectedData.specialNotes ?? "",
        });
      } catch (error) {
        console.error(
          "[CreateQuote] Failed to prefill quote from agent",
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
        heading={t("quotes.newQuote")}
        mb="8"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Grid templateColumns="repeat(5, 1fr)" gap="32">
        <GridItem minW={"100%"} colSpan={3}>
          <QuoteForm
            type={"CREATE"}
            onValuesChange={(liveValues) =>
              startTransition(() => setValues(liveValues))
            }
            orderItems={prefillItems}
            prefill={prefillValues}
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
                href={ADMIN_QUOTES}
                w={"100%"}
                variant={"solid"}
                ariaLabel={t("admin.backToQuotes")}
              >
                <MaterialSymbol>arrow_back</MaterialSymbol>
                {t("admin.backToQuotes")}
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
              currency={channel?.currency}
              totalDiscount={totalDiscount}
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

export default CreateQuote;
