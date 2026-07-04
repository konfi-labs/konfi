"use client";

import { listFakturowniaDepartments } from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import {
  generateFakturowniaTurnoverReport,
  generateFakturowniaUnpaidReport,
} from "@/lib/firebase/functions";
import {
  Box,
  Button,
  chakra,
  Flex,
  HStack,
  Select,
  Separator,
  Spacer,
  Tabs,
  createListCollection,
} from "@chakra-ui/react";
import PaginatedReportList from "./PaginatedReportList";
import PendingMonthlyInvoicesTab from "./PendingMonthlyInvoicesTab";
import {
  ButtonLink,
  CustomHeading,
  DataTable,
  DatePickerInput,
  Empty,
  IconButtonLink,
  MaterialSymbol,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import type {
  BankingPayment,
  Department,
  Invoice,
  InvoiceKind,
} from "@konfi/fakturownia/out/client/models";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { i18n as I18nInstance, TFunction } from "i18next";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PER_PAGE = 25;

const columnHelper = createColumnHelper<Invoice>();

type FakturowniaTabKey =
  | "invoices"
  | "proforma"
  | "estimates"
  | "pendingMonthlyInvoices"
  | "receipts"
  | "payments"
  | "reports";

type DocumentsTabKey = "invoices" | "proforma" | "estimates" | "receipts";

type DocumentsTabProps = {
  tabKey: DocumentsTabKey;
  kind?: InvoiceKind;
  showCreateButton?: boolean;
  i18n: I18nInstance;
  t: TFunction;
  lng: string;
};

type FakturowniaInvoicesResponse = {
  items: Invoice[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalCountHint: number;
  error?: string;
  isSearchResult?: boolean;
};

type FakturowniaPaymentsResponse = {
  items: BankingPayment[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalCountHint: number;
  error?: string;
};

const isFakturowniaTabKey = (
  value: string | null,
): value is FakturowniaTabKey => {
  switch (value) {
    case "invoices":
    case "proforma":
    case "estimates":
    case "pendingMonthlyInvoices":
    case "receipts":
    case "payments":
    case "reports":
      return true;
    default:
      return false;
  }
};

const getFakturowniaTabFromSearchParams = (
  tabParam: string | null,
  kindParam: string | null,
): FakturowniaTabKey => {
  if (isFakturowniaTabKey(tabParam)) {
    return tabParam;
  }

  switch (kindParam) {
    case "proforma":
      return "proforma";
    case "estimate":
      return "estimates";
    case "receipt":
      return "receipts";
    case "vat":
    default:
      return "invoices";
  }
};

const setSearchParamsForFakturowniaTab = (
  params: URLSearchParams,
  tab: FakturowniaTabKey,
) => {
  params.delete("tab");
  params.delete("kind");

  switch (tab) {
    case "proforma":
      params.set("kind", "proforma");
      break;
    case "estimates":
      params.set("kind", "estimate");
      break;
    case "receipts":
      params.set("kind", "receipt");
      break;
    case "pendingMonthlyInvoices":
    case "payments":
    case "reports":
      params.set("tab", tab);
      break;
    case "invoices":
      break;
  }
};

const normalizeDate = (
  value: Invoice["issueDate"] | string | null | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    if ("toString" in value && typeof value.toString === "function") {
      const stringValue = value.toString();
      if (stringValue && stringValue !== "[object Object]") {
        return stringValue;
      }
    }
    const dateCandidate = value as {
      year?: number;
      month?: number;
      day?: number;
    };
    if (
      typeof dateCandidate.year === "number" &&
      typeof dateCandidate.month === "number" &&
      typeof dateCandidate.day === "number"
    ) {
      const year = dateCandidate.year.toString().padStart(4, "0");
      const month = dateCandidate.month.toString().padStart(2, "0");
      const day = dateCandidate.day.toString().padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }
  return undefined;
};

const formatDateField = (
  value: Invoice["issueDate"] | string | null | undefined,
  formatter: Intl.DateTimeFormat,
): string => {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return "—";
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  return formatter.format(parsed);
};

const formatCurrency = (
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
): string => {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "—";
  }
  const normalizedCurrency = currency?.toUpperCase() ?? "PLN";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const formatDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatKindLabel = (
  kind: InvoiceKind | null | undefined,
  t: TFunction,
): string => {
  if (!kind) {
    return t("fakturownia.documents.unknownKind", { defaultValue: "Unknown" });
  }
  return t(`fakturownia.invoiceCreate.kindOptions.${kind}`, {
    defaultValue: kind,
  });
};

const formatStatusLabel = (status: Invoice["status"], t: TFunction): string => {
  if (!status) {
    return t("fakturownia.documents.unknownStatus", {
      defaultValue: "Unknown status",
    });
  }
  return t(`fakturownia.invoiceCreate.status.${status}`, {
    defaultValue: status,
  });
};

const computeBuyerLabel = (invoice: Invoice, t: TFunction): string => {
  const explicitName = invoice.buyerName?.trim();
  if (explicitName) {
    return explicitName;
  }
  const composedName = [invoice.buyerFirstName, invoice.buyerLastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");
  if (composedName) {
    return composedName;
  }
  const email = invoice.buyerEmail?.trim();
  if (email) {
    return email;
  }
  if (typeof invoice.clientId === "number") {
    return t("fakturownia.documents.clientLabel", {
      defaultValue: "Client #{{id}}",
      id: invoice.clientId,
    });
  }
  return t("fakturownia.documents.unknownBuyer", {
    defaultValue: "Unknown buyer",
  });
};

const computeTotalCountHint = (
  pageIndex: number,
  perPage: number,
  hasMore: boolean,
  itemsLength: number,
): number => {
  if (hasMore) {
    return (pageIndex + 1) * perPage + 1;
  }
  return pageIndex * perPage + itemsLength;
};

const FakturowniaDocumentsTab = ({
  tabKey,
  kind,
  showCreateButton,
  i18n,
  t,
  lng,
}: DocumentsTabProps) => {
  const [documents, setDocuments] = useState<Invoice[]>([]);
  const [searchResults, setSearchResults] = useState<Invoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const requestIdRef = useRef(0);
  const resolvedLocale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(resolvedLocale, { dateStyle: "medium" }),
    [resolvedLocale],
  );

  const columns = useMemo<ColumnDef<Invoice, any>[]>(
    () => [
      columnHelper.display({
        id: "number",
        header: t("fakturownia.documents.columns.number", {
          defaultValue: "Number",
        }),
        cell: (info) => info.row.original.number ?? "—",
      }),
      columnHelper.display({
        id: "kind",
        header: t("fakturownia.documents.columns.kind", {
          defaultValue: "Type",
        }),
        cell: (info) => formatKindLabel(info.row.original.kind, t),
      }),
      columnHelper.display({
        id: "issueDate",
        header: t("fakturownia.documents.columns.issueDate", {
          defaultValue: "Issue date",
        }),
        cell: (info) =>
          formatDateField(
            info.row.original.issueDate ?? info.row.original.sellDate,
            dateFormatter,
          ),
      }),
      columnHelper.display({
        id: "buyer",
        header: t("fakturownia.documents.columns.buyer", {
          defaultValue: "Buyer",
        }),
        cell: (info) => computeBuyerLabel(info.row.original, t),
      }),
      columnHelper.display({
        id: "total",
        header: t("fakturownia.documents.columns.total", {
          defaultValue: "Total",
        }),
        meta: { isNumeric: true },
        cell: (info) =>
          formatCurrency(
            Number(info.row.original?.priceGross),
            info.row.original.currency,
            resolvedLocale,
          ),
      }),
      columnHelper.display({
        id: "status",
        header: t("fakturownia.documents.columns.status", {
          defaultValue: "Status",
        }),
        cell: (info) => formatStatusLabel(info.row.original.status, t),
      }),
      columnHelper.display({
        id: "actions",
        header: t("fakturownia.documents.columns.actions", {
          defaultValue: "Actions",
        }),
        cell: (info) => {
          const viewUrl = info.row.original.viewUrl;
          if (!viewUrl || typeof viewUrl !== "string") {
            return null;
          }
          return (
            <Flex justify="end" gap="1">
              <IconButtonLink
                href={viewUrl}
                icon="open_in_new"
                ariaLabel={t("fakturownia.documents.actions.view", {
                  defaultValue: "View",
                })}
                tooltipLabel={t("fakturownia.documents.actions.view", {
                  defaultValue: "View",
                })}
                isExternal
                prefetch={false}
                variant="ghost"
              />
            </Flex>
          );
        },
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [dateFormatter, resolvedLocale, t],
  );

  const loadPage = useCallback(
    async (targetIndex: number, searchQuery?: string) => {
      const nextRequestId = requestIdRef.current + 1;
      requestIdRef.current = nextRequestId;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(targetIndex + 1),
          perPage: String(PER_PAGE),
        });
        if (kind) {
          params.set("kind", kind);
        }
        if (searchQuery) {
          params.set("search", searchQuery);
        }

        const response = await fetch(
          `/api/fakturownia/invoices?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(
            t("fakturownia.documents.errorGeneric", {
              defaultValue: "Failed to load documents",
            }),
          );
        }

        const payload = (await response.json()) as FakturowniaInvoicesResponse;
        if (requestIdRef.current !== nextRequestId) {
          return;
        }

        if (payload.error) {
          throw new Error(payload.error);
        }

        if (payload.isSearchResult) {
          setSearchResults(payload.items ?? []);
          setDocuments([]);
        } else {
          setSearchResults(null);
          setDocuments(payload.items ?? []);
        }
        setItemsCount(
          computeTotalCountHint(
            targetIndex,
            PER_PAGE,
            payload.hasMore,
            payload.items?.length ?? 0,
          ),
        );
        setPageIndex(targetIndex);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (requestIdRef.current === nextRequestId) {
          setLoading(false);
        }
      }
    },
    [kind, t],
  );

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const handlePageChange = useCallback(
    async (type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST") => {
      const totalPages = Math.max(Math.ceil(itemsCount / PER_PAGE), 1);
      let targetIndex = pageIndex;

      switch (type) {
        case "FIRST":
          targetIndex = 0;
          break;
        case "PREVIOUS":
          targetIndex = Math.max(pageIndex - 1, 0);
          break;
        case "NEXT":
          targetIndex = Math.min(pageIndex + 1, totalPages - 1);
          break;
        case "LAST":
          targetIndex = Math.max(totalPages - 1, 0);
          break;
        default:
          targetIndex = pageIndex;
      }

      if (targetIndex !== pageIndex) {
        await loadPage(targetIndex);
      }
    },
    [itemsCount, loadPage, pageIndex],
  );

  const refreshCurrentPage = useCallback(() => {
    setSearchResults(null);
    void loadPage(0);
  }, [loadPage]);

  const searchDocuments = useCallback(
    async (searchKey: string) => {
      if (!searchKey || searchKey.length < 2) {
        return;
      }
      void loadPage(0, searchKey);
    },
    [loadPage],
  );

  const cleanSearchResults = useCallback(() => {
    setSearchResults(null);
    void loadPage(0);
  }, [loadPage]);

  const emptyTitle = t(`fakturownia.tabs.${tabKey}.emptyTitle`, {
    defaultValue: "No documents",
  });
  const emptyDescription = t(`fakturownia.tabs.${tabKey}.emptyDescription`, {
    defaultValue: "There are no documents to display yet.",
  });

  const displayData = searchResults ?? documents;
  const isSearchActive = searchResults !== null;

  return (
    <Box>
      <Flex alignItems="center" gap="2" flexWrap="wrap">
        <SearchInput
          placeholder={t("fakturownia.documents.searchPlaceholder", {
            defaultValue: "Search invoices...",
          })}
          searchFn={searchDocuments}
          cleanFn={cleanSearchResults}
          searchResults={searchResults}
          loading={loading}
          t={t}
        />
        <RefreshButton
          label={t("fakturownia.actions.refresh", {
            defaultValue: "Refresh documents",
          })}
          refreshFunction={refreshCurrentPage}
        />
        <Spacer />
        {showCreateButton && (
          <ButtonLink
            lng={lng}
            href={
              kind
                ? `/fakturownia/invoices/new?kind=${kind}`
                : "/fakturownia/invoices/new"
            }
            ariaLabel={t("fakturownia.actions.createDocument", {
              defaultValue: "Create document",
            })}
            colorPalette="primary"
            variant="solid"
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("fakturownia.actions.createDocument", {
              defaultValue: "Create document",
            })}
          </ButtonLink>
        )}
      </Flex>
      <Separator my="4" />
      {error ? (
        <Empty
          title={t("fakturownia.documents.errorTitle", {
            defaultValue: "Unable to load documents",
          })}
          description={error}
          icon="error"
        />
      ) : displayData.length === 0 && !loading ? (
        <Empty
          title={
            isSearchActive
              ? t("fakturownia.documents.noSearchResults", {
                defaultValue: "No results found",
              })
              : emptyTitle
          }
          description={
            isSearchActive
              ? t("fakturownia.documents.noSearchResultsDescription", {
                defaultValue: "No documents match your search query.",
              })
              : emptyDescription
          }
          icon={isSearchActive ? "search_off" : "orders"}
        />
      ) : (
        <DataTable<Invoice>
          data={displayData}
          columns={columns}
          loading={loading}
          paginationType={isSearchActive ? undefined : "controlled"}
          defaultPageIndex={pageIndex}
          setPageIndex={setPageIndex}
          itemsCount={isSearchActive ? displayData.length : itemsCount}
          show={
            isSearchActive
              ? undefined
              : async (type) => {
                switch (type) {
                  case "FIRST":
                    await handlePageChange("FIRST");
                    break;
                  case "NEXT":
                    await handlePageChange("NEXT");
                    break;
                  case "PREVIOUS":
                    await handlePageChange("PREVIOUS");
                    break;
                  case "LAST":
                    await handlePageChange("LAST");
                    break;
                  default:
                    break;
                }
              }
          }
          defaultPageSize={PER_PAGE}
          t={t}
          i18n={i18n}
        />
      )}
    </Box>
  );
};

const FakturowniaPaymentsTab = ({
  i18n,
  t,
}: {
  i18n: I18nInstance;
  t: TFunction;
}) => {
  const [payments, setPayments] = useState<BankingPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);
  const requestIdRef = useRef(0);

  const resolvedLocale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";

  const columns = useMemo<ColumnDef<BankingPayment, any>[]>(
    () => [
      {
        id: "id",
        header: t("fakturownia.payments.columns.id", { defaultValue: "ID" }),
        cell: (info) => info.row.original.id ?? "—",
      },
      {
        id: "name",
        header: t("fakturownia.payments.columns.name", {
          defaultValue: "Name",
        }),
        cell: (info) => info.row.original.name ?? "—",
      },
      {
        id: "kind",
        header: t("fakturownia.payments.columns.kind", {
          defaultValue: "Type",
        }),
        cell: (info) => info.row.original.kind ?? "—",
      },
      {
        id: "price",
        header: t("fakturownia.payments.columns.price", {
          defaultValue: "Amount",
        }),
        meta: { isNumeric: true },
        cell: (info) => {
          const raw = info.row.original.price ?? undefined;
          if (!raw) {
            return "—";
          }
          const normalized = Number.parseFloat(
            String(raw).replace(/\s+/g, "").replace(",", "."),
          );
          if (!Number.isFinite(normalized)) {
            return raw;
          }
          return formatCurrency(normalized, "PLN", resolvedLocale);
        },
      },
      {
        id: "paid",
        header: t("fakturownia.payments.columns.paid", {
          defaultValue: "Paid",
        }),
        cell: (info) =>
          info.row.original.paid
            ? t("common.yes", { defaultValue: "Yes" })
            : t("common.no", { defaultValue: "No" }),
      },
    ],
    [resolvedLocale, t],
  );

  const loadPage = useCallback(
    async (targetIndex: number) => {
      const nextRequestId = requestIdRef.current + 1;
      requestIdRef.current = nextRequestId;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(targetIndex + 1),
          perPage: String(PER_PAGE),
        });
        const response = await fetch(
          `/api/fakturownia/payments?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(
            t("fakturownia.payments.errorGeneric", {
              defaultValue: "Failed to load payments",
            }),
          );
        }
        const payload = (await response.json()) as FakturowniaPaymentsResponse;
        if (requestIdRef.current !== nextRequestId) {
          return;
        }
        if (payload.error) {
          throw new Error(payload.error);
        }
        setPayments(payload.items ?? []);
        setItemsCount(
          computeTotalCountHint(
            targetIndex,
            PER_PAGE,
            payload.hasMore,
            payload.items?.length ?? 0,
          ),
        );
        setPageIndex(targetIndex);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (requestIdRef.current === nextRequestId) {
          setLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const handlePageChange = useCallback(
    async (type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST") => {
      const totalPages = Math.max(Math.ceil(itemsCount / PER_PAGE), 1);
      let targetIndex = pageIndex;

      switch (type) {
        case "FIRST":
          targetIndex = 0;
          break;
        case "PREVIOUS":
          targetIndex = Math.max(pageIndex - 1, 0);
          break;
        case "NEXT":
          targetIndex = Math.min(pageIndex + 1, totalPages - 1);
          break;
        case "LAST":
          targetIndex = Math.max(totalPages - 1, 0);
          break;
        default:
          targetIndex = pageIndex;
      }

      if (targetIndex !== pageIndex) {
        await loadPage(targetIndex);
      }
    },
    [itemsCount, loadPage, pageIndex],
  );

  const refresh = useCallback(() => {
    void loadPage(pageIndex);
  }, [loadPage, pageIndex]);

  const emptyTitle = t("fakturownia.tabs.payments.emptyTitle", {
    defaultValue: "No payments",
  });
  const emptyDescription = t("fakturownia.tabs.payments.emptyDescription", {
    defaultValue: "There are no payments to display yet.",
  });

  return (
    <Box>
      <Flex alignItems="center" gap="2" flexWrap="wrap">
        <RefreshButton
          label={t("fakturownia.actions.refresh", { defaultValue: "Refresh" })}
          refreshFunction={refresh}
        />
        <Spacer />
      </Flex>
      <Separator my="4" />
      {error ? (
        <Empty
          title={t("fakturownia.payments.errorTitle", {
            defaultValue: "Unable to load payments",
          })}
          description={error}
          icon="error"
        />
      ) : payments.length === 0 && !loading ? (
        <Empty
          title={emptyTitle}
          description={emptyDescription}
          icon="payments"
        />
      ) : (
        <DataTable<BankingPayment>
          data={payments}
          columns={columns}
          loading={loading}
          paginationType="controlled"
          defaultPageIndex={pageIndex}
          setPageIndex={setPageIndex}
          itemsCount={itemsCount}
          show={async (type) => {
            switch (type) {
              case "FIRST":
                await handlePageChange("FIRST");
                break;
              case "NEXT":
                await handlePageChange("NEXT");
                break;
              case "PREVIOUS":
                await handlePageChange("PREVIOUS");
                break;
              case "LAST":
                await handlePageChange("LAST");
                break;
              default:
                break;
            }
          }}
          defaultPageSize={PER_PAGE}
          t={t}
          i18n={i18n}
        />
      )}
    </Box>
  );
};

const FakturowniaPage = () => {
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedLng = i18n.resolvedLanguage ?? i18n.language ?? "pl";
  const resolvedLocale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";
  const fakturowniaPath = `/${resolvedLng}/fakturownia`;
  const selectedTabFromUrl = useMemo(
    () =>
      getFakturowniaTabFromSearchParams(
        searchParams.get("tab"),
        searchParams.get("kind"),
      ),
    [searchParams],
  );
  const [activeTab, setActiveTab] =
    useState<FakturowniaTabKey>(selectedTabFromUrl);

  const [fromDate, setFromDate] = useState<string>(() => {
    const today = new Date();
    return formatDateInputValue(today);
  });

  const [toDate, setToDate] = useState<string>(() => {
    const today = new Date();
    return formatDateInputValue(today);
  });
  const [isGeneratingTurnover, setIsGeneratingTurnover] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDepartmentsLoading, setIsDepartmentsLoading] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

  // Unpaid report states
  const [unpaidFromDate, setUnpaidFromDate] = useState<string>(() => {
    const today = new Date();
    const yearAgo = new Date(
      today.getFullYear() - 1,
      today.getMonth(),
      today.getDate(),
    );
    return formatDateInputValue(yearAgo);
  });
  const [unpaidToDate, setUnpaidToDate] = useState<string>(() => {
    const today = new Date();
    return formatDateInputValue(today);
  });
  const [isGeneratingUnpaid, setIsGeneratingUnpaid] = useState(false);
  const [selectedUnpaidDepartmentId, setSelectedUnpaidDepartmentId] =
    useState<string>("");

  useEffect(() => {
    setActiveTab(selectedTabFromUrl);
  }, [selectedTabFromUrl]);

  useEffect(() => {
    let isMounted = true;
    const loadDepartments = async () => {
      setIsDepartmentsLoading(true);
      try {
        const departmentList = await listFakturowniaDepartments();
        if (!isMounted) {
          return;
        }
        setDepartments(departmentList ?? []);
      } catch (error) {
        console.error("FakturowniaPage: failed to load departments", error);
      } finally {
        if (isMounted) {
          setIsDepartmentsLoading(false);
        }
      }
    };

    void loadDepartments();

    return () => {
      isMounted = false;
    };
  }, []);

  const departmentCollection = useMemo(
    () =>
      createListCollection({
        items: departments.map((department) => ({
          value: department.id ? String(department.id) : "",
          label: department.shortcut || department.name || `#${department.id}`,
        })),
      }),
    [departments],
  );

  const handleGenerateTurnoverReport = useCallback(async () => {
    try {
      setIsGeneratingTurnover(true);

      const result = await generateFakturowniaTurnoverReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        departmentId: selectedDepartmentId || undefined,
      });

      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let index = 0; index < byteCharacters.length; index += 1) {
        byteNumbers[index] = byteCharacters.charCodeAt(index);
      }

      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.contentType });
      const blobUrl = URL.createObjectURL(blob);

      const newWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingTurnover(false);
    }
  }, [fromDate, selectedDepartmentId, toDate]);

  const handleGenerateUnpaidReport = useCallback(async () => {
    try {
      setIsGeneratingUnpaid(true);

      const result = await generateFakturowniaUnpaidReport({
        from: unpaidFromDate || undefined,
        to: unpaidToDate || undefined,
        departmentId: selectedUnpaidDepartmentId || undefined,
      });

      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let index = 0; index < byteCharacters.length; index += 1) {
        byteNumbers[index] = byteCharacters.charCodeAt(index);
      }

      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.contentType });
      const blobUrl = URL.createObjectURL(blob);

      const newWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingUnpaid(false);
    }
  }, [unpaidFromDate, selectedUnpaidDepartmentId, unpaidToDate]);

  const buildTabHref = useCallback(
    (tab: FakturowniaTabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      setSearchParamsForFakturowniaTab(params, tab);

      const nextSearch = params.toString();
      return nextSearch ? `${fakturowniaPath}?${nextSearch}` : fakturowniaPath;
    },
    [fakturowniaPath, searchParams],
  );

  const handleTabChange = useCallback(
    ({ value }: { value: string; }) => {
      if (!isFakturowniaTabKey(value) || value === activeTab) {
        return;
      }

      setActiveTab(value);
      router.push(buildTabHref(value) as Route, { scroll: false });
    },
    [activeTab, buildTabHref, router],
  );

  return (
    <Box>
      <CustomHeading
        heading={t("fakturownia.title", { defaultValue: "Fakturownia" })}
        breadcrumb
        goBack
        t={t}
      />
      <Tabs.Root
        value={activeTab}
        onValueChange={handleTabChange}
        variant="enclosed"
        lazyMount
        unmountOnExit
      >
        <HStack justifyContent="space-between" flexWrap="wrap" gap="4" mb="4">
          <Tabs.List>
            <Tabs.Trigger value="invoices">
              <MaterialSymbol>receipt_long</MaterialSymbol>
              {t("fakturownia.tabs.invoices.label", { defaultValue: "Invoices" })}
            </Tabs.Trigger>
            <Tabs.Trigger value="proforma">
              <MaterialSymbol>description</MaterialSymbol>
              {t("fakturownia.tabs.proforma.label", {
                defaultValue: "Pro forma",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="estimates">
              <MaterialSymbol>orders</MaterialSymbol>
              {t("fakturownia.tabs.estimates.label", {
                defaultValue: "Estimates",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="pendingMonthlyInvoices">
              <MaterialSymbol>pending_actions</MaterialSymbol>
              {t("fakturownia.tabs.pendingMonthlyInvoices.label", {
                defaultValue: "To invoice",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="receipts">
              <MaterialSymbol>receipt</MaterialSymbol>
              {t("fakturownia.tabs.receipts.label", { defaultValue: "Receipts" })}
            </Tabs.Trigger>
            <Tabs.Trigger value="payments">
              <MaterialSymbol>payments</MaterialSymbol>
              {t("fakturownia.tabs.payments.label", { defaultValue: "Payments" })}
            </Tabs.Trigger>
            <Tabs.Trigger value="reports">
              <MaterialSymbol>insights</MaterialSymbol>
              {t("fakturownia.tabs.reports.label", { defaultValue: "Reports" })}
            </Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>
          <ButtonLink
            lng={resolvedLng}
            href="/fakturownia/costs"
            ariaLabel={t("fakturownia.costs.title", {
              defaultValue: "Cost intelligence",
            })}
            variant="outline"
          >
            <MaterialSymbol>paid</MaterialSymbol>
            {t("fakturownia.costs.title", {
              defaultValue: "Cost intelligence",
            })}
          </ButtonLink>
        </HStack>
        <Tabs.Content value="invoices" pt="6">
          <FakturowniaDocumentsTab
            tabKey="invoices"
            kind="vat"
            showCreateButton
            i18n={i18n}
            t={t}
            lng={resolvedLng}
          />
        </Tabs.Content>
        <Tabs.Content value="proforma" pt="6">
          <FakturowniaDocumentsTab
            tabKey="proforma"
            kind="proforma"
            showCreateButton
            i18n={i18n}
            t={t}
            lng={resolvedLng}
          />
        </Tabs.Content>
        <Tabs.Content value="estimates" pt="6">
          <FakturowniaDocumentsTab
            tabKey="estimates"
            kind="estimate"
            showCreateButton
            i18n={i18n}
            t={t}
            lng={resolvedLng}
          />
        </Tabs.Content>
        <Tabs.Content value="pendingMonthlyInvoices" pt="6">
          <PendingMonthlyInvoicesTab />
        </Tabs.Content>
        <Tabs.Content value="receipts" pt="6">
          <FakturowniaDocumentsTab
            tabKey="receipts"
            kind="receipt"
            showCreateButton
            i18n={i18n}
            t={t}
            lng={resolvedLng}
          />
        </Tabs.Content>
        <Tabs.Content value="payments" pt="6">
          <FakturowniaPaymentsTab i18n={i18n} t={t} />
        </Tabs.Content>
        <Tabs.Content value="reports" pt="6">
          <Box mb="6">
            <Box mb="2" fontWeight="medium">
              {t("fakturownia.reports.turnover.title", {
                defaultValue: "Turnover summary (Fakturownia)",
              })}
            </Box>
            <Flex alignItems="flex-end" gap="3" flexWrap="wrap">
              <Box minW="150px">
                <chakra.label
                  htmlFor="fakturownia-turnover-from"
                  fontSize="sm"
                  display="block"
                  mb="1"
                >
                  {t("fakturownia.reports.turnover.from", {
                    defaultValue: "From",
                  })}
                </chakra.label>
                <DatePickerInput
                  size="sm"
                  value={fromDate}
                  onValueChange={setFromDate}
                  locale={resolvedLocale}
                  max={toDate || undefined}
                  triggerLabel={t("fakturownia.reports.turnover.from", {
                    defaultValue: "From",
                  })}
                  inputProps={{
                    id: "fakturownia-turnover-from",
                    "aria-label": t("fakturownia.reports.turnover.from", {
                      defaultValue: "From",
                    }),
                  }}
                />
              </Box>
              <Box minW="150px">
                <chakra.label
                  htmlFor="fakturownia-turnover-to"
                  fontSize="sm"
                  display="block"
                  mb="1"
                >
                  {t("fakturownia.reports.turnover.to", { defaultValue: "To" })}
                </chakra.label>
                <DatePickerInput
                  size="sm"
                  value={toDate}
                  onValueChange={setToDate}
                  locale={resolvedLocale}
                  min={fromDate || undefined}
                  triggerLabel={t("fakturownia.reports.turnover.to", {
                    defaultValue: "To",
                  })}
                  inputProps={{
                    id: "fakturownia-turnover-to",
                    "aria-label": t("fakturownia.reports.turnover.to", {
                      defaultValue: "To",
                    }),
                  }}
                />
              </Box>
              <Box minW="220px">
                <Box as="label" fontSize="sm" display="block" mb="1">
                  {t("fakturownia.reports.turnover.department", {
                    defaultValue: "Department",
                  })}
                </Box>
                {departments.length > 0 && (
                  <Select.Root
                    collection={departmentCollection}
                    value={selectedDepartmentId ? [selectedDepartmentId] : []}
                    onValueChange={({ value }) => {
                      const next = value[0] ?? "";
                      setSelectedDepartmentId(next);
                    }}
                    size="sm"
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText
                          placeholder={t(
                            "fakturownia.reports.turnover.allDepartments",
                            { defaultValue: "All departments" },
                          )}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        {departmentCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item}>
                            {item.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Select.Root>
                )}
              </Box>
              <Spacer />
              <Button
                size="sm"
                colorPalette="primary"
                variant="solid"
                onClick={handleGenerateTurnoverReport}
                disabled={isGeneratingTurnover}
              >
                {t("fakturownia.reports.turnover.generate", {
                  defaultValue: "Generate turnover PDF",
                })}
              </Button>
            </Flex>
          </Box>
          <PaginatedReportList
            storagePath="reports/fakturownia-turnover"
            translationPrefix="fakturownia.reports.turnover"
            i18n={i18n}
            t={t}
          />

          <Separator my="8" />

          <Box mb="6">
            <Box mb="2" fontWeight="medium">
              {t("fakturownia.reports.unpaid.title", {
                defaultValue: "Unpaid and Partially Paid VAT Invoices",
              })}
            </Box>
            <Flex alignItems="flex-end" gap="3" flexWrap="wrap">
              <Box minW="150px">
                <chakra.label
                  htmlFor="fakturownia-unpaid-from"
                  fontSize="sm"
                  display="block"
                  mb="1"
                >
                  {t("fakturownia.reports.unpaid.from", {
                    defaultValue: "From",
                  })}
                </chakra.label>
                <DatePickerInput
                  size="sm"
                  value={unpaidFromDate}
                  onValueChange={setUnpaidFromDate}
                  locale={resolvedLocale}
                  max={unpaidToDate || undefined}
                  triggerLabel={t("fakturownia.reports.unpaid.from", {
                    defaultValue: "From",
                  })}
                  inputProps={{
                    id: "fakturownia-unpaid-from",
                    "aria-label": t("fakturownia.reports.unpaid.from", {
                      defaultValue: "From",
                    }),
                  }}
                />
              </Box>
              <Box minW="150px">
                <chakra.label
                  htmlFor="fakturownia-unpaid-to"
                  fontSize="sm"
                  display="block"
                  mb="1"
                >
                  {t("fakturownia.reports.unpaid.to", { defaultValue: "To" })}
                </chakra.label>
                <DatePickerInput
                  size="sm"
                  value={unpaidToDate}
                  onValueChange={setUnpaidToDate}
                  locale={resolvedLocale}
                  min={unpaidFromDate || undefined}
                  triggerLabel={t("fakturownia.reports.unpaid.to", {
                    defaultValue: "To",
                  })}
                  inputProps={{
                    id: "fakturownia-unpaid-to",
                    "aria-label": t("fakturownia.reports.unpaid.to", {
                      defaultValue: "To",
                    }),
                  }}
                />
              </Box>
              <Box minW="220px">
                <Box as="label" fontSize="sm" display="block" mb="1">
                  {t("fakturownia.reports.unpaid.department", {
                    defaultValue: "Department",
                  })}
                </Box>
                {departments.length > 0 && (
                  <Select.Root
                    collection={departmentCollection}
                    value={
                      selectedUnpaidDepartmentId
                        ? [selectedUnpaidDepartmentId]
                        : []
                    }
                    onValueChange={({ value }) => {
                      const next = value[0] ?? "";
                      setSelectedUnpaidDepartmentId(next);
                    }}
                    size="sm"
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText
                          placeholder={t(
                            "fakturownia.reports.unpaid.allDepartments",
                            { defaultValue: "All departments" },
                          )}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        {departmentCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item}>
                            {item.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Select.Root>
                )}
              </Box>
              <Spacer />
              <Button
                size="sm"
                colorPalette="primary"
                variant="solid"
                onClick={handleGenerateUnpaidReport}
                disabled={isGeneratingUnpaid}
              >
                {t("fakturownia.reports.unpaid.generate", {
                  defaultValue: "Generate unpaid invoices PDF",
                })}
              </Button>
            </Flex>
          </Box>
          <PaginatedReportList
            storagePath="reports/fakturownia-unpaid"
            translationPrefix="fakturownia.reports.unpaid"
            i18n={i18n}
            t={t}
          />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
};

export default FakturowniaPage;
