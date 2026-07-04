"use client";

import type {
  AdminPaymentListItem,
  AdminPaymentListResponse,
  PaymentProviderKey,
} from "@/lib/payments/admin-types";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Field,
  HStack,
  Input,
  SimpleGrid,
  Stat,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  DataTable,
  Empty,
  IconButtonLink,
  RefreshButton,
  toaster,
} from "@konfi/components";
import { getStatusColor } from "@konfi/utils";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import RefundPaymentDialog from "./components/RefundPaymentDialog";

const PER_PAGE = 25;
const columnHelper = createColumnHelper<AdminPaymentListItem>();

const PROVIDER_LABEL_KEYS: Record<PaymentProviderKey, string> = {
  stripe: "ROUTES.stripe",
  przelewy24: "ROUTES.przelewy24",
};

function formatCurrency(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRefundBadgeColor(status: AdminPaymentListItem["refundStatus"]) {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "PROCESSING":
    case "PENDING":
      return "yellow";
    case "FAILED":
      return "red";
    default:
      return "gray";
  }
}

type PaymentIntegrationPageProps = {
  provider: PaymentProviderKey;
};

export default function PaymentIntegrationPage({
  provider,
}: PaymentIntegrationPageProps) {
  const { t, i18n } = useT();
  const { isSuperAdminClient } = useAuth();
  const [response, setResponse] = useState<AdminPaymentListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [selectedPayment, setSelectedPayment] =
    useState<AdminPaymentListItem | null>(null);

  const providerLabel = t(PROVIDER_LABEL_KEYS[provider], {
    defaultValue: provider === "stripe" ? "Stripe" : "Przelewy24",
  });
  const providerDescription = t(
    `paymentIntegrations.providers.${provider}.description`,
    {
      defaultValue:
        provider === "stripe"
          ? "Monitor Stripe payments and issue audited refunds from the admin app."
          : "Monitor Przelewy24 payments and issue audited refunds from the admin app.",
    },
  );
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";
  const resolvedLanguage = i18n.resolvedLanguage;

  const loadPayments = useCallback(
    async (targetPage: number, targetSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(targetPage + 1),
          perPage: String(PER_PAGE),
        });
        if (targetSearch.trim()) {
          params.set("search", targetSearch.trim());
        }

        const paymentResponse = await fetch(
          `/api/payments/admin/${provider}?${params.toString()}`,
          { cache: "no-store" },
        );
        const payload = (await paymentResponse.json()) as
          | AdminPaymentListResponse
          | { error?: string };

        if (!paymentResponse.ok) {
          throw new Error(
            ("error" in payload && payload.error) || "Failed to load payments",
          );
        }

        if ("error" in payload) {
          throw new Error(payload.error || "Failed to load payments");
        }

        setResponse(payload as AdminPaymentListResponse);
        setPageIndex(targetPage);
        if (targetPage === 0) {
          setRefreshFlag((previousFlag) => !previousFlag);
        }
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load payments";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    void loadPayments(0, "");
  }, [loadPayments]);

  const handleRefresh = useCallback(async () => {
    await loadPayments(pageIndex, search);
  }, [loadPayments, pageIndex, search]);

  const handlePageChange = useCallback(
    async (type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST") => {
      if (!response) {
        return;
      }

      const totalPages = Math.max(Math.ceil(response.totalCount / PER_PAGE), 1);
      let targetPage = pageIndex;

      switch (type) {
        case "FIRST":
          targetPage = 0;
          break;
        case "PREVIOUS":
          targetPage = Math.max(pageIndex - 1, 0);
          break;
        case "NEXT":
          targetPage = Math.min(pageIndex + 1, totalPages - 1);
          break;
        case "LAST":
          targetPage = Math.max(totalPages - 1, 0);
          break;
      }

      if (targetPage !== pageIndex) {
        await loadPayments(targetPage, search);
      }
    },
    [loadPayments, pageIndex, response, search],
  );

  const columns = useMemo<ColumnDef<AdminPaymentListItem, unknown>[]>(
    () => [
      columnHelper.display({
        id: "order",
        header: t("paymentIntegrations.table.order", {
          defaultValue: "Order",
        }),
        cell: (info) => {
          const payment = info.row.original;
          return (
            <VStack align="start" gap={1}>
              <ButtonLink
                lng={resolvedLanguage}
                href={`/orders/${payment.orderId}` as Route}
                variant="ghost"
                p={0}
                minH="unset"
                ariaLabel={t("paymentIntegrations.table.openOrder", {
                  defaultValue: "Open order",
                })}
              >
                #{payment.orderNumber}
              </ButtonLink>
              <Text fontSize="sm" color="fg.muted">
                {payment.customerLabel}
              </Text>
            </VStack>
          );
        },
      }),
      columnHelper.display({
        id: "createdAt",
        header: t("paymentIntegrations.table.createdAt", {
          defaultValue: "Created",
        }),
        cell: (info) => formatDate(info.row.original.createdAt, locale),
      }),
      columnHelper.display({
        id: "reference",
        header: t("paymentIntegrations.table.reference", {
          defaultValue: "Reference",
        }),
        cell: (info) => {
          const payment = info.row.original;
          return (
            <VStack align="start" gap={1}>
              <Text>{payment.providerReference ?? "—"}</Text>
              <Text fontSize="sm" color="fg.muted">
                {payment.checkoutSessionId ?? "—"}
              </Text>
            </VStack>
          );
        },
      }),
      columnHelper.display({
        id: "paymentStatus",
        header: t("paymentIntegrations.table.paymentStatus", {
          defaultValue: "Payment status",
        }),
        cell: (info) => (
          <Badge colorPalette={getStatusColor(info.row.original.paymentStatus)}>
            {t(`PaymentStatus.${info.row.original.paymentStatus}`, {
              defaultValue: info.row.original.paymentStatus,
            })}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: "refundStatus",
        header: t("paymentIntegrations.table.refundStatus", {
          defaultValue: "Refund",
        }),
        cell: (info) => {
          const payment = info.row.original;
          return (
            <VStack align="start" gap={1}>
              <Badge colorPalette={getRefundBadgeColor(payment.refundStatus)}>
                {t(
                  `paymentIntegrations.refund.status.${payment.refundStatus}`,
                  {
                    defaultValue: payment.refundStatus,
                  },
                )}
              </Badge>
              {payment.refundAmount ? (
                <Text fontSize="xs" color="fg.muted">
                  {t("paymentIntegrations.refund.lastAmount", {
                    defaultValue: "Last refund: {{amount}}",
                    amount: formatCurrency(
                      payment.refundAmount,
                      payment.currency,
                      locale,
                    ),
                  })}
                </Text>
              ) : null}
              {payment.refundFailureReason ? (
                <Text fontSize="xs" color="fg.muted">
                  {payment.refundFailureReason}
                </Text>
              ) : null}
            </VStack>
          );
        },
      }),
      columnHelper.display({
        id: "amount",
        header: t("paymentIntegrations.table.amount", {
          defaultValue: "Amount",
        }),
        meta: { isNumeric: true },
        cell: (info) => {
          const payment = info.row.original;
          return (
            <VStack align="end" gap={1}>
              <Text>
                {formatCurrency(payment.totalAmount, payment.currency, locale)}
              </Text>
              {payment.refundedAmount > 0 ? (
                <>
                  <Text fontSize="xs" color="fg.muted">
                    {t("paymentIntegrations.table.refundedAmount", {
                      defaultValue: "Refunded: {{amount}}",
                      amount: formatCurrency(
                        payment.refundedAmount,
                        payment.currency,
                        locale,
                      ),
                    })}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {t("paymentIntegrations.table.remainingAmount", {
                      defaultValue: "Remaining: {{amount}}",
                      amount: formatCurrency(
                        payment.remainingRefundableAmount,
                        payment.currency,
                        locale,
                      ),
                    })}
                  </Text>
                </>
              ) : null}
            </VStack>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: t("paymentIntegrations.table.actions", {
          defaultValue: "Actions",
        }),
        meta: { isNumeric: true },
        cell: (info) => {
          const payment = info.row.original;
          return (
            <HStack justify="end" gap={2}>
              {payment.checkoutUrl ? (
                <IconButtonLink
                  href={payment.checkoutUrl}
                  icon="open_in_new"
                  ariaLabel={t("paymentIntegrations.table.openCheckout", {
                    defaultValue: "Open checkout session",
                  })}
                  tooltipLabel={t("paymentIntegrations.table.openCheckout", {
                    defaultValue: "Open checkout session",
                  })}
                  isExternal
                  prefetch={false}
                  variant="ghost"
                />
              ) : null}
              <Button
                size="sm"
                colorPalette="red"
                variant="outline"
                disabled={!payment.refundEligible}
                onClick={() => {
                  if (!isSuperAdminClient) {
                    toaster.error({
                      title: t("error.permissionDenied", {
                        defaultValue: "Permission denied",
                      }),
                      description: t(
                        "paymentIntegrations.refund.superAdminOnlyDescription",
                        {
                          defaultValue:
                            "Refunds are only available for super admins.",
                        },
                      ),
                    });
                    return;
                  }

                  setSelectedPayment(payment);
                }}
              >
                {t("paymentIntegrations.refund.action", {
                  defaultValue: "Refund",
                })}
              </Button>
            </HStack>
          );
        },
      }),
    ],
    [isSuperAdminClient, locale, resolvedLanguage, t],
  );

  const summary = response?.summary;

  return (
    <Box>
      <CustomHeading heading={providerLabel} breadcrumb goBack t={t} />
      <Text color="fg.muted" mb="6">
        {providerDescription}
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={4} mb={6}>
        <Stat.Root
          borderWidth="1px"
          borderColor="border.muted"
          rounded="xl"
          p={5}
        >
          <Stat.Label>
            {t("paymentIntegrations.summary.totalPayments", {
              defaultValue: "Total payments",
            })}
          </Stat.Label>
          <Stat.ValueText>{summary?.totalCount ?? 0}</Stat.ValueText>
        </Stat.Root>
        <Stat.Root
          borderWidth="1px"
          borderColor="border.muted"
          rounded="xl"
          p={5}
        >
          <Stat.Label>
            {t("paymentIntegrations.summary.refundable", {
              defaultValue: "Ready to refund",
            })}
          </Stat.Label>
          <Stat.ValueText>{summary?.refundableCount ?? 0}</Stat.ValueText>
        </Stat.Root>
        <Stat.Root
          borderWidth="1px"
          borderColor="border.muted"
          rounded="xl"
          p={5}
        >
          <Stat.Label>
            {t("paymentIntegrations.summary.refunded", {
              defaultValue: "Refunded",
            })}
          </Stat.Label>
          <Stat.ValueText>{summary?.refundedCount ?? 0}</Stat.ValueText>
        </Stat.Root>
        <Stat.Root
          borderWidth="1px"
          borderColor="border.muted"
          rounded="xl"
          p={5}
        >
          <Stat.Label>
            {t("paymentIntegrations.summary.totalAmount", {
              defaultValue: "Tracked amount",
            })}
          </Stat.Label>
          <Stat.ValueText>
            {formatCurrency(summary?.totalAmount ?? 0, "PLN", locale)}
          </Stat.ValueText>
        </Stat.Root>
      </SimpleGrid>
      <VStack align="stretch" gap={4} mb={6}>
        <HStack gap={3} align="end" flexWrap="wrap">
          <Field.Root flex="1" minW={{ base: "100%", md: "320px" }}>
            <Field.Label>
              {t("paymentIntegrations.search.label", {
                defaultValue: "Search payments",
              })}
            </Field.Label>
            <Input
              name="paymentSearch"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("paymentIntegrations.search.placeholder", {
                defaultValue:
                  "Search by order, customer, reference, or checkout session",
              })}
              autoComplete="off"
              spellCheck={false}
            />
          </Field.Root>
          <Button
            onClick={() => {
              setSearch(searchInput.trim());
              void loadPayments(0, searchInput.trim());
            }}
          >
            {t("paymentIntegrations.search.action", {
              defaultValue: "Search",
            })}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              void loadPayments(0, "");
            }}
          >
            {t("paymentIntegrations.search.clear", {
              defaultValue: "Clear",
            })}
          </Button>
          <RefreshButton
            label={t("paymentIntegrations.actions.refresh", {
              defaultValue: "Refresh payments",
            })}
            refreshFunction={handleRefresh}
          />
        </HStack>
      </VStack>
      {error ? (
        <Empty
          title={t("paymentIntegrations.error.title", {
            defaultValue: "Unable to load payments",
          })}
          description={error}
          icon="error"
        />
      ) : response && response.items.length === 0 && !loading ? (
        <Empty
          title={t("paymentIntegrations.empty.title", {
            defaultValue: "No payments found",
          })}
          description={
            search
              ? t("paymentIntegrations.empty.searchDescription", {
                  defaultValue: "No payments matched the current search query.",
                })
              : t("paymentIntegrations.empty.description", {
                  defaultValue: "Payments for this provider will appear here.",
                })
          }
          icon="payments"
        />
      ) : (
        <DataTable<AdminPaymentListItem>
          data={response?.items ?? []}
          columns={columns}
          loading={loading}
          paginationType="controlled"
          defaultPageIndex={pageIndex}
          refreshFlag={refreshFlag}
          setPageIndex={setPageIndex}
          itemsCount={response?.totalCount ?? 0}
          show={async (type) => {
            await handlePageChange(type);
          }}
          defaultPageSize={PER_PAGE}
          t={t}
          i18n={i18n}
        />
      )}
      <RefundPaymentDialog
        provider={provider}
        payment={selectedPayment}
        open={Boolean(selectedPayment)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedPayment(null);
          }
        }}
        onRefunded={handleRefresh}
      />
    </Box>
  );
}
