"use client";

import {
  getCustomerCarts,
  sendCustomerCartReminder,
  type CustomerCartSummary,
} from "@/actions/customer-carts";
import { useT } from "@/i18n/client";
import {
  Alert,
  Box,
  Button,
  HStack,
  Spacer,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Empty,
  RefreshButton,
  toaster,
} from "@konfi/components";
import { formatPrice } from "@konfi/utils";
import { startTransition, useMemo, useState } from "react";

function CustomerCartItemsList({ items }: Pick<CustomerCartSummary, "items">) {
  return (
    <VStack align="stretch" gap={1} minW="0">
      {items.map((item) => (
        <Text key={item.id} fontSize="sm" lineClamp={2}>
          {item.description} × {item.quantity}
        </Text>
      ))}
    </VStack>
  );
}

export default function CustomerCartsPage({
  initialCarts,
}: {
  initialCarts: CustomerCartSummary[];
}) {
  const { t, i18n } = useT();
  const locale = i18n.resolvedLanguage || "en";
  const [carts, setCarts] = useState(initialCarts);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCartIds, setPendingCartIds] = useState<string[]>([]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );

  const refreshCarts = () => {
    if (refreshing) {
      return;
    }

    startTransition(() => {
      setRefreshing(true);

      void getCustomerCarts(locale)
        .then((nextCarts) => {
          setCarts(nextCarts);
        })
        .catch((error) => {
          console.error("Failed to refresh customer carts:", error);
          toaster.error({
            title: t("common.error", { defaultValue: "Error!" }),
            description: t("customers.carts.refreshError", {
              defaultValue: "Failed to refresh customer carts.",
            }),
          });
        })
        .finally(() => {
          setRefreshing(false);
        });
    });
  };

  const handleSendReminder = (cartId: string) => {
    if (pendingCartIds.includes(cartId)) {
      return;
    }

    startTransition(() => {
      setPendingCartIds((current) => [...current, cartId]);

      void sendCustomerCartReminder(cartId, locale)
        .then((result) => {
          if (!result.sent) {
            toaster.error({
              title: t("common.error", { defaultValue: "Error!" }),
              description:
                result.error ||
                t("customers.carts.sendError", {
                  defaultValue: "Failed to send the cart reminder.",
                }),
            });
            return;
          }

          toaster.success({
            title: t("customers.carts.sentTitle", {
              defaultValue: "Reminder sent",
            }),
            description: t("customers.carts.sentDescription", {
              defaultValue: "The cart reminder email has been sent.",
            }),
          });
        })
        .catch((error) => {
          console.error("Failed to send customer cart reminder:", error);
          toaster.error({
            title: t("common.error", { defaultValue: "Error!" }),
            description: t("customers.carts.sendError", {
              defaultValue: "Failed to send the cart reminder.",
            }),
          });
        })
        .finally(() => {
          setPendingCartIds((current) =>
            current.filter((pendingCartId) => pendingCartId !== cartId),
          );
        });
    });
  };

  return (
    <Box>
      <CustomHeading
        heading={t("customers.carts.title", {
          defaultValue: "Customer carts",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <HStack gap={4} align="center" mb={4}>
        <Text color="fg.muted" fontSize="sm" fontVariantNumeric="tabular-nums">
          {t("customers.carts.count", {
            defaultValue: "{{count}} active carts",
            count: carts.length,
          })}
        </Text>
        <Spacer />
        <RefreshButton
          aria-busy={refreshing}
          disabled={refreshing}
          label={t("common.refresh", { defaultValue: "Refresh" })}
          refreshFunction={refreshCarts}
        />
      </HStack>
      <Alert.Root status="info" mb="6">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("customers.carts.manualSendingTitle", {
              defaultValue: "Automatic reminders enabled",
            })}
          </Alert.Title>
          <Alert.Description>
            {t("customers.carts.manualSendingDescription", {
              defaultValue:
                "Automatic cart reminders are sent by a scheduled job, and you can still trigger a manual reminder from this page.",
            })}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>

      {carts.length === 0 ? (
        <Empty
          title={t("customers.carts.emptyTitle", {
            defaultValue: "No customer carts",
          })}
          description={t("customers.carts.emptyDescription", {
            defaultValue:
              "Customer carts will appear here once products are left in carts.",
          })}
          icon="shopping_cart"
        />
      ) : (
        <Table.Root variant="outline" rounded="xl" size="sm" overflow="hidden">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>
                {t("customers.carts.customer", { defaultValue: "Customer" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("customers.carts.email", { defaultValue: "Email" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("customers.carts.items", { defaultValue: "Items" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("customers.carts.total", { defaultValue: "Total" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("customers.carts.lastUpdated", {
                  defaultValue: "Last updated",
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("customers.carts.actions", { defaultValue: "Actions" })}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {carts.map((cart) => (
              <Table.Row key={cart.cartId}>
                <Table.Cell minW="220px">
                  <VStack align="stretch" gap={1} minW="0">
                    <Text fontWeight="medium" lineClamp={2}>
                      {cart.customerName}
                    </Text>
                    <Text color="fg.muted" fontSize="xs">
                      {t("customers.carts.itemCount", {
                        defaultValue: "{{count}} items",
                        count: cart.itemCount,
                      })}
                    </Text>
                  </VStack>
                </Table.Cell>
                <Table.Cell maxW="220px">
                  <Text
                    color={cart.customerEmail ? "inherit" : "fg.muted"}
                    lineClamp={2}
                  >
                    {cart.customerEmail ||
                      t("customers.carts.noEmail", {
                        defaultValue: "No email available",
                      })}
                  </Text>
                </Table.Cell>
                <Table.Cell minW="280px">
                  <CustomerCartItemsList items={cart.items} />
                </Table.Cell>
                <Table.Cell textAlign="end" whiteSpace="nowrap">
                  {formatPrice(cart.totalPrice)}
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">
                  {cart.lastUpdatedAt
                    ? dateFormatter.format(new Date(cart.lastUpdatedAt))
                    : "—"}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <Button
                    colorPalette="primary"
                    loading={pendingCartIds.includes(cart.cartId)}
                    disabled={!cart.customerEmail}
                    onClick={() => handleSendReminder(cart.cartId)}
                  >
                    {t("customers.carts.sendReminder", {
                      defaultValue: "Send reminder",
                    })}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  );
}
