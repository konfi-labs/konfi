"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Flex,
  Link,
  Separator,
  Text,
  parseDate,
} from "@chakra-ui/react";
import {
  DataTable,
  DatePickerInput,
  Empty,
  RefreshButton,
  toaster,
} from "@konfi/components";
import { createColumnHelper } from "@tanstack/react-table";
import type { DateValue } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

type PendingMonthlyInvoiceEstimate = {
  id: number;
  issueDate?: string;
  number?: string;
  viewUrl?: string;
};

type PendingMonthlyInvoiceCompany = {
  id: string;
  clientId?: string;
  company?: string;
  estimateCount: number;
  estimates: PendingMonthlyInvoiceEstimate[];
  latestIssueDate?: string;
};

type PendingMonthlyInvoicesResponse = {
  items: PendingMonthlyInvoiceCompany[];
  month: string;
  totalCompanies: number;
  totalEstimates: number;
  error?: string;
};

type PendingMonthlyInvoicesBulkUpdateResponse = {
  failedCount: number;
  updatedCount: number;
  error?: string;
};

const DEFAULT_PAGE_SIZE = 25;
const columnHelper = createColumnHelper<PendingMonthlyInvoiceCompany>();

function getCurrentMonthValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function getEmptyPendingMonthlyInvoicesResponse(
  month: string,
): PendingMonthlyInvoicesResponse {
  return {
    items: [],
    month,
    totalCompanies: 0,
    totalEstimates: 0,
  };
}

function getMonthDatePickerValue(value: string): string {
  return value ? `${value}-01` : "";
}

function formatMonthPickerValue(date: DateValue): string {
  const month = `${date.month}`.padStart(2, "0");
  return `${date.year}-${month}`;
}

function parseMonthPickerValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  try {
    return parseDate(`${match[1]}-${match[2]}-01`);
  } catch {
    return undefined;
  }
}

function formatMonthLabel(
  value: string,
  formatter: Intl.DateTimeFormat,
): string {
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatter.format(parsed);
}

function formatDateLabel(
  value: string | null | undefined,
  formatter: Intl.DateTimeFormat,
): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatter.format(parsed);
}

function buildEstimateLabel(
  estimate: PendingMonthlyInvoiceEstimate,
  t: TFunction,
): string {
  return (
    estimate.number ??
    t("fakturownia.pendingMonthlyInvoices.unknownEstimateNumber", {
      defaultValue: "Estimate #{{id}}",
      id: estimate.id,
    })
  );
}

function getCompanyLabel(
  company: PendingMonthlyInvoiceCompany,
  t: TFunction,
): string {
  return (
    company.company ??
    company.clientId ??
    t("fakturownia.documents.unknownBuyer", {
      defaultValue: "Unknown buyer",
    })
  );
}

function removeCompanyFromPendingMonthlyInvoices(
  data: PendingMonthlyInvoicesResponse,
  companyId: string,
): PendingMonthlyInvoicesResponse {
  const items = data.items.filter((item) => item.id !== companyId);
  if (items.length === data.items.length) {
    return data;
  }

  const totalEstimates = items.reduce(
    (sum, item) => sum + item.estimateCount,
    0,
  );

  return {
    ...data,
    items,
    totalCompanies: items.length,
    totalEstimates,
  };
}

export default function PendingMonthlyInvoicesTab() {
  const { t, i18n } = useT(["fakturownia", "translation"]);
  const [month, setMonth] = useState<string>(getCurrentMonthValue);
  const resolvedLocale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(resolvedLocale, {
        month: "long",
        year: "numeric",
      }),
    [resolvedLocale],
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(resolvedLocale, { dateStyle: "medium" }),
    [resolvedLocale],
  );

  const fetchPendingMonthlyInvoices = useCallback(
    async (url: string): Promise<PendingMonthlyInvoicesResponse> => {
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as PendingMonthlyInvoicesResponse;

      if (!response.ok || payload.error) {
        throw new Error(
          payload.error ??
          t("fakturownia.pendingMonthlyInvoices.errorGeneric", {
            defaultValue: "Failed to load pending monthly invoices",
          }),
        );
      }

      return payload;
    },
    [t],
  );

  const { data, error, isLoading, mutate } = useSWR<
    PendingMonthlyInvoicesResponse,
    Error
  >(
    `/api/fakturownia/pending-monthly-invoices?month=${encodeURIComponent(month)}`,
    fetchPendingMonthlyInvoices,
    {
      revalidateOnFocus: false,
    },
  );

  const monthLabel = useMemo(
    () => formatMonthLabel(month, monthFormatter),
    [month, monthFormatter],
  );

  const handleMarkCompanyAsCompleted = useCallback(
    async (company: PendingMonthlyInvoiceCompany) => {
      const estimateIds = company.estimates.map((estimate) => estimate.id);
      if (estimateIds.length === 0) {
        return;
      }

      const companyLabel = getCompanyLabel(company, t);
      const confirmed = window.confirm(
        t("fakturownia.pendingMonthlyInvoices.markCompletedConfirm", {
          defaultValue:
            "Mark {{count}} estimate(s) for {{company}} as completed?",
          company: companyLabel,
          count: estimateIds.length,
        }),
      );

      if (!confirmed) {
        return;
      }

      try {
        let shouldRefresh = false;
        const fallbackData =
          data ?? getEmptyPendingMonthlyInvoicesResponse(month);

        await mutate(
          async (currentData) => {
            const response = await fetch(
              "/api/fakturownia/pending-monthly-invoices",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ estimateIds }),
              },
            );
            const payload =
              (await response.json()) as PendingMonthlyInvoicesBulkUpdateResponse;

            if (!response.ok || payload.error) {
              throw new Error(
                payload.error ??
                t("fakturownia.pendingMonthlyInvoices.markCompletedError", {
                  defaultValue: "Failed to update estimate statuses",
                }),
              );
            }

            const resolvedData = currentData ?? fallbackData;

            if (payload.failedCount > 0) {
              shouldRefresh = true;
              toaster.warning({
                title: t("common.warning", { defaultValue: "Warning" }),
                description: t(
                  "fakturownia.pendingMonthlyInvoices.markCompletedPartial",
                  {
                    defaultValue:
                      "Marked {{updatedCount}} estimate(s) as completed for {{company}}. {{failedCount}} update(s) failed.",
                    company: companyLabel,
                    failedCount: payload.failedCount,
                    updatedCount: payload.updatedCount,
                  },
                ),
              });

              return resolvedData;
            } else {
              toaster.success({
                title: t("common.success", { defaultValue: "Success" }),
                description: t(
                  "fakturownia.pendingMonthlyInvoices.markCompletedSuccess",
                  {
                    defaultValue:
                      "Marked {{count}} estimate(s) as completed for {{company}}.",
                    company: companyLabel,
                    count: payload.updatedCount,
                  },
                ),
              });

              return removeCompanyFromPendingMonthlyInvoices(
                resolvedData,
                company.id,
              );
            }
          },
          {
            optimisticData: (currentData, displayedData) =>
              removeCompanyFromPendingMonthlyInvoices(
                currentData ?? displayedData ?? fallbackData,
                company.id,
              ),
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          },
        );

        if (shouldRefresh) {
          void mutate();
        }
      } catch (error) {
        console.error("Error updating estimate statuses:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("fakturownia.pendingMonthlyInvoices.markCompletedError", {
                defaultValue: "Failed to update estimate statuses",
              }),
        });
      }
    },
    [data, month, mutate, t],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.company ?? "", {
        id: "company",
        header: t("fakturownia.pendingMonthlyInvoices.columns.company", {
          defaultValue: "Company",
        }),
        cell: (info) => {
          const company = getCompanyLabel(info.row.original, t);

          return (
            <Box>
              <Text fontWeight="medium">{company}</Text>
              {info.row.original.clientId ? (
                <Text fontSize="xs" color="fg.muted">
                  {t("fakturownia.pendingMonthlyInvoices.clientIdLabel", {
                    defaultValue: "Client ID: {{id}}",
                    id: info.row.original.clientId,
                  })}
                </Text>
              ) : null}
            </Box>
          );
        },
        meta: {
          minWidth: "260px",
        },
      }),
      columnHelper.accessor("estimateCount", {
        id: "estimateCount",
        header: t("fakturownia.pendingMonthlyInvoices.columns.estimateCount", {
          defaultValue: "Estimates",
        }),
        cell: (info) => <Badge variant="surface">{info.getValue()}</Badge>,
        meta: {
          isNumeric: true,
          minWidth: "110px",
        },
      }),
      columnHelper.accessor((row) => row.latestIssueDate ?? "", {
        id: "latestIssueDate",
        header: t(
          "fakturownia.pendingMonthlyInvoices.columns.latestIssueDate",
          {
            defaultValue: "Latest estimate",
          },
        ),
        cell: (info) =>
          formatDateLabel(info.row.original.latestIssueDate, dateFormatter),
        meta: {
          minWidth: "160px",
        },
      }),
      columnHelper.display({
        id: "estimates",
        header: t("fakturownia.pendingMonthlyInvoices.columns.estimates", {
          defaultValue: "Estimate documents",
        }),
        cell: (info) => (
          <Flex wrap="wrap" gap="2">
            {info.row.original.estimates.map((estimate) => {
              const label = buildEstimateLabel(estimate, t);

              if (estimate.viewUrl) {
                return (
                  <Link
                    key={estimate.id}
                    href={estimate.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    borderWidth="1px"
                    borderRadius="md"
                    px="2"
                    py="1"
                    fontSize="sm"
                    whiteSpace="nowrap"
                    color="primary.solid"
                  >
                    {label}
                  </Link>
                );
              }

              return (
                <Box
                  key={estimate.id}
                  as="span"
                  borderWidth="1px"
                  borderRadius="md"
                  px="2"
                  py="1"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  {label}
                </Box>
              );
            })}
          </Flex>
        ),
        meta: {
          minWidth: "340px",
        },
      }),
      columnHelper.display({
        id: "actions",
        header: t("fakturownia.pendingMonthlyInvoices.columns.actions", {
          defaultValue: "Actions",
        }),
        cell: (info) => (
          <Button
            size="sm"
            variant="outline"
            colorPalette="primary"
            onClick={() => {
              void handleMarkCompanyAsCompleted(info.row.original);
            }}
          >
            {t("fakturownia.pendingMonthlyInvoices.markCompletedAction", {
              defaultValue: "Mark all as completed",
            })}
          </Button>
        ),
        meta: {
          minWidth: "190px",
        },
      }),
    ],
    [dateFormatter, handleMarkCompanyAsCompleted, t],
  );

  const items = data?.items ?? [];

  return (
    <Box>
      <Flex alignItems="flex-end" gap="3" flexWrap="wrap">
        <Box minW="180px">
          <Box mb="1">
            <label
              htmlFor="fakturownia-pending-month"
              style={{ display: "block" }}
            >
              <Text as="span" fontSize="sm">
                {t("fakturownia.pendingMonthlyInvoices.monthLabel", {
                  defaultValue: "Month",
                })}
              </Text>
            </label>
          </Box>
          <DatePickerInput
            size="sm"
            value={getMonthDatePickerValue(month)}
            onValueChange={(value) => {
              const normalizedValue = value.slice(0, 7);
              setMonth(normalizedValue || getCurrentMonthValue());
            }}
            defaultView="month"
            minView="month"
            maxView="year"
            format={formatMonthPickerValue}
            parse={parseMonthPickerValue}
            locale={i18n.resolvedLanguage}
            triggerLabel={t("fakturownia.pendingMonthlyInvoices.monthLabel", {
              defaultValue: "Month",
            })}
            inputProps={{
              id: "fakturownia-pending-month",
              placeholder: t(
                "fakturownia.pendingMonthlyInvoices.monthPlaceholder",
                {
                  defaultValue: "Select month",
                },
              ),
              "aria-label": t("fakturownia.pendingMonthlyInvoices.monthLabel", {
                defaultValue: "Month",
              }),
            }}
          />
        </Box>
        <RefreshButton
          label={t("fakturownia.actions.refresh", {
            defaultValue: "Refresh documents",
          })}
          refreshFunction={() => {
            void mutate();
          }}
        />
      </Flex>

      <Text mt="3" fontSize="sm" color="fg.muted">
        {t("fakturownia.pendingMonthlyInvoices.description", {
          defaultValue:
            "Shows companies with estimate documents from the selected month that are not marked as completed yet.",
        })}
      </Text>

      <Text mt="2" fontSize="sm" color="fg.muted">
        {t("fakturownia.pendingMonthlyInvoices.summary", {
          defaultValue:
            "{{companyCount}} companies • {{estimateCount}} estimates not marked as completed for {{month}}",
          companyCount: data?.totalCompanies ?? 0,
          estimateCount: data?.totalEstimates ?? 0,
          month: monthLabel,
        })}
      </Text>

      <Separator my="4" />

      {error ? (
        <Empty
          title={t("fakturownia.pendingMonthlyInvoices.errorTitle", {
            defaultValue: "Unable to load pending monthly invoices",
          })}
          description={error.message}
          icon="error"
        />
      ) : !isLoading && items.length === 0 ? (
        <Empty
          title={t("fakturownia.tabs.pendingMonthlyInvoices.emptyTitle", {
            defaultValue: "No companies to invoice",
          })}
          description={t(
            "fakturownia.tabs.pendingMonthlyInvoices.emptyDescription",
            {
              defaultValue:
                "All estimate documents from the selected month are already marked as completed.",
            },
          )}
          icon="receipt_long"
        />
      ) : (
        <DataTable<PendingMonthlyInvoiceCompany>
          data={items}
          columns={columns}
          loading={isLoading}
          paginationType="uncontrolled"
          defaultPageSize={DEFAULT_PAGE_SIZE}
          t={t}
          i18n={i18n}
        />
      )}
    </Box>
  );
}
