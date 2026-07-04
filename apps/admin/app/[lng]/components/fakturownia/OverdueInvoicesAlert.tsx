"use client";

import { useOverdueInvoices } from "@/hooks/useOverdueInvoices";
import { useT } from "@/i18n/client";
import {
  Alert,
  Box,
  Button,
  Collapsible,
  HStack,
  List,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

interface OverdueInvoicesAlertProps {
  /**
   * Fakturownia client ID to check for overdue invoices.
   * When undefined or empty, no check is performed.
   */
  clientId: string | undefined;
  mt?: number | string;
}

/**
 * Displays a warning alert when a Fakturownia client has invoices
 * that are overdue by more than 14 days past the payment deadline.
 *
 * Shows a skeleton while loading and an expandable list of overdue invoices.
 */
export function OverdueInvoicesAlert({
  clientId,
  mt,
}: OverdueInvoicesAlertProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const { loading, error, overdueResult } = useOverdueInvoices(clientId);

  // Don't render anything if no clientId
  if (!clientId?.trim()) {
    return null;
  }

  // Don't show alert on error - silently fail
  if (error) {
    return null;
  }

  // Don't show alert if no overdue invoices
  if (
    !overdueResult?.hasOverdueInvoices ||
    overdueResult.overdueInvoices.length === 0
  ) {
    return null;
  }

  const overdueCount = overdueResult.overdueInvoices.length;

  // Calculate days overdue for each invoice
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoicesWithDays = overdueResult.overdueInvoices.map((invoice) => {
    let daysOverdue = 0;
    if (invoice.paymentTo) {
      const dueDate = new Date(invoice.paymentTo);
      dueDate.setHours(0, 0, 0, 0);
      daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    return { ...invoice, daysOverdue };
  });

  return (
    <Skeleton w="100%" loading={loading} mt={mt}>
      <Alert.Root variant="solid" status="warning" mb={4}>
        <Alert.Indicator />
        <Alert.Content flex="1">
          <Alert.Title>
            {t("fakturownia.overdueAlert.title", {
              defaultValue: "Overdue invoices detected",
            })}
          </Alert.Title>
          <Alert.Description>
            {t("fakturownia.overdueAlert.description", {
              defaultValue:
                "This client has {{count}} invoice(s) that are more than 14 days past the payment deadline.",
              count: overdueCount,
            })}
          </Alert.Description>

          <Collapsible.Root>
            <Collapsible.Trigger asChild>
              <Button size="sm" mt={2}>
                <Collapsible.Context>
                  {(api) =>
                    api.open
                      ? t("fakturownia.overdueAlert.hideDetails", {
                          defaultValue: "Hide details",
                        })
                      : t("fakturownia.overdueAlert.showDetails", {
                          defaultValue: "Show details",
                        })
                  }
                </Collapsible.Context>
                <Collapsible.Indicator
                  transition="transform 0.2s"
                  _open={{ transform: "rotate(180deg)" }}
                >
                  <MaterialSymbol pt={2}>expand_more</MaterialSymbol>
                </Collapsible.Indicator>
              </Button>
            </Collapsible.Trigger>

            <Collapsible.Content>
              <Box
                mt={3}
                pt={3}
                borderTopWidth="1px"
                borderColor="orange.200"
                _dark={{ borderColor: "orange.700" }}
              >
                <List.Root gap={2} variant="plain">
                  {invoicesWithDays.map((invoice, index) => (
                    <List.Item key={invoice.id ?? index}>
                      <HStack gap={2} align="flex-start">
                        <List.Indicator asChild color="orange.muted">
                          <MaterialSymbol>receipt_long</MaterialSymbol>
                        </List.Indicator>
                        <VStack align="flex-start" gap={0}>
                          <Text fontWeight="medium">
                            {invoice.number ??
                              t("fakturownia.overdueAlert.unknownInvoice", {
                                defaultValue: "Invoice #{{id}}",
                                id: invoice.id ?? "?",
                              })}
                          </Text>
                          <Text fontSize="sm">
                            {t("fakturownia.overdueAlert.invoiceLine", {
                              defaultValue:
                                "Due: {{dueDate}} • {{daysOverdue}} days overdue",
                              dueDate: invoice.paymentTo ?? "—",
                              daysOverdue: invoice.daysOverdue,
                            })}
                          </Text>
                        </VStack>
                      </HStack>
                    </List.Item>
                  ))}
                </List.Root>
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>
        </Alert.Content>
      </Alert.Root>
    </Skeleton>
  );
}
