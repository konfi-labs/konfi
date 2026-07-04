"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { Flex, Separator, Skeleton, Spacer, Text } from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  CustomHeading,
  DataTable,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { isNestedCustomer, Quote } from "@konfi/types";
import { ADMIN_QUOTES_CREATE, formatPrice } from "@konfi/utils";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useQuotes } from "context/quotes";
import dynamic from "next/dynamic";
import React, { startTransition, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const QuoteForm = dynamic(() => import("@/components/quotes/QuoteForm"), {
  ssr: false,
});

const QuotesPage = () => {
  const { t, i18n } = useT();
  const {
    loadingQuotes,
    pageIndex,
    setPageIndex,
    quotes,
    quotesCount,
    showQuotes,
    quotesRefresh,
    dirtyRefreshQuotes,
    searchQuotes,
    quotesSearchResults,
    deactivateQuote,
  } = useQuotes();
  const columHelper = createColumnHelper<Quote>();
  const data = useMemo<Quote[] | undefined>(
    () =>
      quotesSearchResults
        ? quotesSearchResults?.map((quote) => quote)
        : quotes?.map((quote) => quote),
    [quotes, quotesSearchResults],
  );
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);

  function handleUpdateFormOpen(quote: Quote) {
    startTransition(() => {
      setCurrentQuote(quote);
      setShowUpdateForm(true);
    });
  }

  function handleConvertFormOpen(quote: Quote) {
    startTransition(() => {
      setCurrentQuote(quote);
      setShowConvertForm(true);
    });
  }

  function handleDuplicateFormOpen(quote: Quote) {
    startTransition(() => {
      setCurrentQuote(quote);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(quote: Quote) {
    startTransition(() => {
      setCurrentQuote(quote);
      setShowRemoveDialog(true);
    });
  }

  const columns = React.useMemo<ColumnDef<Quote, any>[]>(
    () => [
      columHelper.accessor("number", {
        cell: (info) => `#${info.getValue()}`,
        header: "#",
      }),
      columHelper.accessor("customer", {
        cell: (info) => {
          const value = info.getValue();
          return isNestedCustomer(value)
            ? value.name
              ? value.name
              : "-"
            : value
              ? value
              : "-";
        },
        header: t("admin.customer"),
      }),
      columHelper.accessor("totalPrice", {
        cell: (info) =>
          info.getValue()
            ? formatPrice(
                info.getValue(),
                info.row.original.currency,
                undefined,
                undefined,
                i18n.resolvedLanguage,
              )
            : "-",
        header: t("admin.total"),
        meta: {
          isNumeric: true,
        },
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/quotes/${props.row.original.id}`}
              icon={"open_in_new"}
              ariaLabel={t("admin.quotePreview")}
              tooltipLabel={t("admin.quotePreview")}
            />
            {props.row.original.mailLink && (
              <IconButtonLink
                href={`${props.row.original.mailLink}`}
                icon={"mail"}
                ariaLabel={t("admin.quotePreview")}
                tooltipLabel={t("admin.quotePreview")}
                isExternal={true}
              />
            )}
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"update-form"}
                onClick={() => handleUpdateFormOpen(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("admin.editQuote")}
              </MenuItem>
              <MenuItem
                value={"convert-form"}
                onClick={() => handleConvertFormOpen(props.row.original)}
              >
                <MaterialSymbol>conversion_path</MaterialSymbol>
                {t("admin.convertQuoteToOrder")}
              </MenuItem>
              <MenuItem
                value={"duplicate-form"}
                onClick={() => handleDuplicateFormOpen(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("admin.copyQuote")}
              </MenuItem>
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleRemove(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeQuote")}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  return (
    <>
      <CustomHeading
        heading={t("quotes.heading", { defaultValue: "Quotes" })}
        mb="8"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        <SearchInput
          placeholder={t("admin.searchQuotesByNumberOrCustomer", {
            defaultValue: "Search quotes by # or customer...",
          })}
          searchFn={searchQuotes}
          t={t}
        />
        <Spacer />
        <RefreshButton
          w={["100%", "auto"]}
          label={t("admin.refreshQuotes", { defaultValue: "Refresh Quotes" })}
          refreshFunction={quotesRefresh}
        />
        <ButtonLink
          lng={i18n.resolvedLanguage}
          ml={"2"}
          href={ADMIN_QUOTES_CREATE}
          variant="solid"
          colorPalette={"primary"}
          ariaLabel={t("quotes.newQuote", { defaultValue: "New Quote" })}
        >
          <MaterialSymbol>create</MaterialSymbol>
          {t("quotes.newQuote", { defaultValue: "New Quote" })}
        </ButtonLink>
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={quotesSearchResults ? "uncontrolled" : "controlled"}
          show={showQuotes}
          itemsCount={
            quotesSearchResults ? quotesSearchResults.length : quotesCount
          }
          loading={loadingQuotes}
          refreshFlag={dirtyRefreshQuotes}
          defaultPageIndex={pageIndex}
          setPageIndex={setPageIndex}
          enablePageSizeSelection
          t={t}
          i18n={i18n}
        />
      )}
      {showUpdateForm && (
        <QuoteForm
          quote={currentQuote!}
          asDrawer
          type={"UPDATE"}
          open={showUpdateForm}
          setOpen={setShowUpdateForm}
        />
      )}
      {showConvertForm && (
        <QuoteForm
          quote={currentQuote!}
          asDrawer
          type={"CONVERT"}
          open={showConvertForm}
          setOpen={setShowConvertForm}
        />
      )}
      {showDuplicateForm && (
        <QuoteForm
          quote={currentQuote!}
          asDrawer
          type={"DUPLICATE"}
          open={showDuplicateForm}
          setOpen={setShowDuplicateForm}
        />
      )}
      <AlertDialog
        header={t("admin.confirmDeactivateQuote", {
          defaultValue: "Are you sure you want to deactivate the quote?",
        })}
        handle={() => deactivateQuote(currentQuote!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("admin.deactivateQuoteDescription", {
            defaultValue:
              "After deactivation, the quote will only be visible under the filter - inactive.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
};

export default QuotesPage;
