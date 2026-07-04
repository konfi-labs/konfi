"use client";

import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Grid,
  GridItem,
  IconButton,
  Separator,
  Show,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  Customer,
  CustomerInfo,
  CustomHeading,
  IconButtonLink,
  MaterialSymbol,
  OrderItemsFileList,
  Payment,
  SpecialNotes,
  Tooltip,
} from "@konfi/components";
import { db, getDoc } from "@konfi/firebase";
import { OrderItem, Quote } from "@konfi/types";
import { useChannels } from "context/channels";
import { useConfigurationSettings } from "context/configuration";
import { useQuotes } from "context/quotes";
import { isNull, isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import useSWR from "swr";
const QuoteForm = dynamic(() => import("@/components/quotes/QuoteForm"), {
  ssr: false,
});

const fetchQuote = async (
  id: string,
  channelId: string,
): Promise<Quote | undefined> => {
  if (!id) return undefined;

  const result = await getDoc<Quote>(
    db.doc(firestore, `/channels/${channelId}/quotes`, id),
  );
  if (!isUndefined(result)) {
    return result as Quote;
  }
  return undefined;
};

const QuotePage = () => {
  const { t, i18n } = useT(["order", "orders", "translation"]);
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { quotes } = useQuotes();
  const { channel } = useChannels();
  const { orderWorkflowStatusesSettings, shippingMethodsSettings } =
    useConfigurationSettings();
  const channelId = useMemo(() => channel?.id, [channel]);
  const {
    data: quote,
    mutate: mutateQuote,
    isLoading: loadingQuote,
  } = useSWR(
    id && channelId ? [id, channelId] : null,
    ([_id, _channelId]) => fetchQuote(_id, _channelId),
    {
      fallbackData: quotes?.find((quote) => quote.id === id),
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const validUntil = useMemo(() => {
    if (quote) {
      const createdAt = quote.createdAt.toDate();
      const validUntil = new Date(createdAt);
      validUntil.setDate(validUntil.getDate() + 7);
      return validUntil.toLocaleDateString(i18n.resolvedLanguage, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }, [quote, i18n.resolvedLanguage]);
  const [loadingOrderItems, setLoadingOrderItems] = useState<boolean>(true);
  const [orderItems, setOrderItems] = useState<OrderItem[] | null>(null);
  const componentRef = useRef(null);
  const borderColor = "gray.muted";
  const [textVersion, setTextVersion] = useState<boolean>(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);

  function handleUpdateFormOpen() {
    startTransition(() => {
      setShowUpdateForm(true);
    });
  }

  function handleConvertFormOpen() {
    startTransition(() => {
      setShowConvertForm(true);
    });
  }
  const handlePrint = useReactToPrint({
    documentTitle: `${t("quotes.number", { defaultValue: "Quote no." })} ${quote?.number}`,
    contentRef: componentRef,
    pageStyle: `
      @media print {
        html, body {
          width: 100% !important;
          height: initial !important;
          overflow: initial !important;
          background-image: none !important;
          print-color-adjust: exact !important;
          zoom: 80%;
        }
        grid-template-columns: repeat(5, 1fr) !important;
        grid-column: span 2 / span 2 !important;
      }
      .noprint {
        display: none !important;
      }
      .print-grid-template-columns {
        @media print {
          grid-template-columns: repeat(5, 1fr) !important;
          column-gap: 8px !important;
          row-gap: 8px !important;
        }
      }
      .print-grid-column-3 {
        @media print {
          grid-column: span 3 / span 3 !important;
        }
      }
      .print-grid-column-2 {
        @media print {
          grid-column: span 2 / span 2 !important;
        }
      }
      @page {
        size: a2 landscape;
      }
    `,
    onBeforePrint: () => {
      if (quote && channel) {
        document.title = `${t("ROUTES.quote")} ${channel.name}#${quote.number}`;
      }
      return Promise.resolve();
    },
    onAfterPrint: () => {
      document.title = t("ROUTES.quote");
    },
  });

  // Prevent default hotkey printing behavior and instead use handlePrint
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "p") {
        event.preventDefault();
        handlePrint();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlePrint]);

  // Set quote items
  useEffect(() => {
    if (isUndefined(quote)) return;
    setLoadingOrderItems(true);
    const _quoteItems = [];
    if (quote?.items && !(quote.items.length <= 0))
      _quoteItems.push(...quote.items);
    setOrderItems(_quoteItems);
    setLoadingOrderItems(false);
  }, [quote]);

  if (isUndefined(quote) || isNull(quote) || isNull(orderItems)) return null;

  return (
    <Box ref={componentRef}>
      <Skeleton loading={loadingQuote || loadingOrderItems}>
        <Grid
          className={"print-grid-template-columns"}
          templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
          columnGap={["0", "8"]}
          rowGap={["6", "8"]}
        >
          <GridItem
            className={"print-grid-column-3"}
            minW={"100%"}
            colSpan={[1, 3]}
          >
            <CustomHeading
              heading={`${channel?.name}#${quote?.number}`}
              mb={8}
              goBack={true}
              t={t}
            />
            {quote?.createdAt && (
              <Text pb={8}>
                {quote.createdAt
                  .toDate()
                  .toLocaleDateString(i18n.resolvedLanguage)}
                {validUntil &&
                  `, ${t("quotes.validUntil", { defaultValue: "Quote is valid until:" })} ${validUntil}`}
              </Text>
            )}
            <Show when={!textVersion}>
              <Box
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <Text as="h2" fontSize="lg" fontWeight="bold">
                  {t("order.items", { defaultValue: "Items" })}
                </Text>
                <Separator my={"6"} />
                {orderItems && !(orderItems.length <= 0) && (
                  <OrderItemsFileList
                    storage={storage}
                    orderItems={orderItems}
                    orderShippingOption={quote.shippingOption}
                    orderWorkflowStatusesSettings={
                      orderWorkflowStatusesSettings
                    }
                    shippingMethodsSettings={shippingMethodsSettings}
                    isStore={false}
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
                  items={orderItems}
                  shippingPrice={quote.shippingPrice ?? 0}
                  totalPrice={quote.totalPrice}
                  currency={quote.currency}
                  t={t}
                  i18n={i18n}
                />
              </Box>
            </Show>
          </GridItem>
          <GridItem
            className={"print-grid-column-2"}
            minW={"100%"}
            colSpan={[1, 2]}
            mt={8}
          >
            <Box className={"noprint"} pt={"8"} pb={"7"}>
              <Stack
                justifyContent={"flex-end"}
                direction={{ base: "row", xlDown: "column" }}
              >
                {quote.mailLink && (
                  <IconButtonLink
                    href={`${quote.mailLink}`}
                    icon={"mail"}
                    ariaLabel={t("orders.actions.preview")}
                    tooltipLabel={t("orders.actions.preview")}
                    isExternal={true}
                  />
                )}
                <Button
                  onClick={() => handleUpdateFormOpen()}
                  variant={"surface"}
                  colorPalette={"primary"}
                >
                  <MaterialSymbol>edit_square</MaterialSymbol>
                  {t("admin.editQuote", { defaultValue: "Edit quote" })}
                </Button>
                <Button
                  onClick={() => handleConvertFormOpen()}
                  variant={"outline"}
                  colorPalette="gray"
                >
                  <MaterialSymbol>conversion_path</MaterialSymbol>
                  {t("FormTypes.CONVERT", { defaultValue: "Convert" })}
                </Button>
                <Tooltip
                  content={t("quotes.textVersion", {
                    defaultValue: "Text version",
                  })}
                >
                  <IconButton
                    variant={"outline"}
                    colorPalette="gray"
                    onClick={() => setTextVersion(!textVersion)}
                  >
                    <MaterialSymbol>description</MaterialSymbol>
                  </IconButton>
                </Tooltip>
                <Button
                  colorPalette={"primary"}
                  variant="solid"
                  onClick={() => handlePrint()}
                >
                  <MaterialSymbol>print</MaterialSymbol>
                  {t("order.print", { defaultValue: "Print" })}
                </Button>
              </Stack>
            </Box>
            <Show when={!textVersion}>
              <Box
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <SpecialNotes specialNotes={quote.specialNotes} t={t} />
              </Box>
              <Box
                mt={["6", "8"]}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <Customer
                  customer={quote.customer}
                  contact={quote.contact}
                  shippingOption={quote.shippingOption}
                  shippingMethodsSettings={shippingMethodsSettings}
                  t={t}
                  i18n={i18n}
                />
              </Box>
            </Show>
          </GridItem>
        </Grid>
        <Show when={textVersion}>
          <Box>
            <Text>
              {t("quotes.greetingText", { defaultValue: "Good day," })}
              <br />
              {t("quotes.offerText", {
                defaultValue: "Below I am sending the quote.",
              })}
              <br />
              <br />
            </Text>
            {orderItems.map((item, index) => (
              <Box key={index}>
                <Text fontWeight={"bold"}>
                  {item.product?.name}{" "}
                  {item.volume ? item.volume : item.quantity}{" "}
                  {t(`Unit.${item.unit}`)}{" "}
                  {item.name && " (" + item.name + ") "} -{" "}
                  {item.totalPrice / 100}{" "}
                  {t("quotes.grossAmount", { defaultValue: "gross" })}
                </Text>
                <Text>
                  {item.customFormat &&
                    item.width + " x " + item.height + " mm, "}
                  {item.description}
                </Text>
              </Box>
            ))}
            {quote.shippingPrice > 0 && <br />}
            <Text>
              {quote.shippingPrice > 0 &&
                `${t("quotes.shippingCost", { defaultValue: "Shipping cost:" })} ${quote.shippingPrice / 100} ${t("quotes.grossAmount", { defaultValue: "gross" })}`}
            </Text>
            <br />
            <Text>
              {t("orderDetails.total", { defaultValue: "Total:" })}{" "}
              {quote.totalPrice / 100}{" "}
              {t("quotes.grossAmount", { defaultValue: "gross" })}
            </Text>
            <br />
            <Text>
              {validUntil &&
                `${t("quotes.number", { defaultValue: "Quote no." })} ${quote.number}, ${t("quotes.validUntilShort", { defaultValue: "valid until:" })} ${validUntil}`}
            </Text>
            <br />
            <Text>
              {t("quotes.regards", { defaultValue: "Best regards," })}
              <br />
              {quote.updatedBy?.name}
            </Text>
          </Box>
        </Show>
        {!textVersion && (
          <CustomerInfo
            id={quote.id}
            updatedAt={quote.updatedAt}
            updatedBy={quote.updatedBy}
            createdAt={quote.createdAt}
            createdBy={quote.createdBy}
            t={t}
            lng={i18n.resolvedLanguage}
          />
        )}
      </Skeleton>
      {showUpdateForm && (
        <QuoteForm
          asDrawer
          quote={quote}
          type={"UPDATE"}
          open={showUpdateForm}
          setOpen={setShowUpdateForm}
          mutate={mutateQuote}
        />
      )}
      {showConvertForm && (
        <QuoteForm
          asDrawer
          quote={quote}
          type={"CONVERT"}
          open={showConvertForm}
          setOpen={setShowConvertForm}
        />
      )}
    </Box>
  );
};

export default QuotePage;
