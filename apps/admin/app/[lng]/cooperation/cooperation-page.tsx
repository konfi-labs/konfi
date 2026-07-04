"use client";

import { useT } from "@/i18n/client";
import type { ProductionCooperationRequestView } from "@/lib/production-cooperation/types";
import {
  Badge,
  Box,
  Card,
  HStack,
  SimpleGrid,
  Spacer,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  MaterialSymbol,
} from "@konfi/components";
import { useMemo } from "react";
import {
  formatCooperationDate,
  getCooperationStatusColorPalette,
} from "./cooperation-formatters";

function RequestCards({
  dateFormatter,
  lng,
  requests,
  unavailableLabel,
}: {
  dateFormatter: Intl.DateTimeFormat;
  lng: string;
  requests: ProductionCooperationRequestView[];
  unavailableLabel: string;
}) {
  const { t } = useT();

  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4}>
      {requests.map((request) => (
        <Card.Root key={request.id} variant="outline" overflow="hidden">
          <Card.Body>
            <VStack align="stretch" gap={4} minW="0">
              <HStack align="start" gap={3}>
                <Box minW="0">
                  <Text fontWeight="semibold" lineClamp={2}>
                    {request.item.name}
                  </Text>
                  <Text color="fg.muted" fontSize="sm" translate="no">
                    {t("productionCooperation.orderNumber", {
                      defaultValue: "Order #{{number}}",
                      number: request.order.number,
                    })}
                  </Text>
                </Box>
                <Spacer />
                <Badge
                  colorPalette={getCooperationStatusColorPalette(
                    request.status,
                  )}
                >
                  {t(`productionCooperation.status.${request.status}`, {
                    defaultValue: request.status,
                  })}
                </Badge>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.customer", {
                      defaultValue: "Customer",
                    })}
                  </Text>
                  <Text lineClamp={2}>
                    {request.order.customerName ||
                      request.order.customerEmail ||
                      unavailableLabel}
                  </Text>
                </Box>
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.quantity", {
                      defaultValue: "Quantity",
                    })}
                  </Text>
                  <Text fontVariantNumeric="tabular-nums">
                    {request.item.quantity} {request.item.unit ?? ""}
                  </Text>
                </Box>
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.createdAt", {
                      defaultValue: "Created",
                    })}
                  </Text>
                  <Text>
                    {formatCooperationDate(
                      request.createdAt,
                      dateFormatter,
                      unavailableLabel,
                    )}
                  </Text>
                </Box>
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.transport", {
                      defaultValue: "Transport",
                    })}
                  </Text>
                  <Text>
                    {t(
                      `productionCooperation.transportValue.${request.transport}`,
                      { defaultValue: request.transport },
                    )}
                  </Text>
                </Box>
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.expiresAt", {
                      defaultValue: "Expires",
                    })}
                  </Text>
                  <Text>
                    {formatCooperationDate(
                      request.expiresAt,
                      dateFormatter,
                      unavailableLabel,
                    )}
                  </Text>
                </Box>
              </SimpleGrid>
              <ButtonLink
                lng={lng}
                href={`/cooperation/review?requestId=${encodeURIComponent(
                  request.id,
                )}`}
                alignSelf="start"
                ariaLabel={t("productionCooperation.review.open", {
                  defaultValue: "Open Request",
                })}
                size="sm"
                variant="outline"
              >
                <MaterialSymbol>open_in_new</MaterialSymbol>
                {t("productionCooperation.review.open", {
                  defaultValue: "Open Request",
                })}
              </ButtonLink>
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}
    </SimpleGrid>
  );
}

export default function CooperationPage({
  requests,
}: {
  requests: ProductionCooperationRequestView[];
}) {
  const { t, i18n } = useT();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );
  const unavailableLabel = t("common.unavailable", {
    defaultValue: "Unavailable",
  });

  return (
    <Box>
      <CustomHeading
        heading={t("productionCooperation.title", {
          defaultValue: "Production Cooperation",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <HStack gap={3} mb={4} align="center">
        <Text color="fg.muted" fontSize="sm" fontVariantNumeric="tabular-nums">
          {t("productionCooperation.count", {
            defaultValue: "{{count}} requests",
            count: requests.length,
          })}
        </Text>
      </HStack>
      {requests.length === 0 ? (
        <Empty
          title={t("productionCooperation.emptyTitle", {
            defaultValue: "No cooperation requests",
          })}
          description={t("productionCooperation.emptyDescription", {
            defaultValue:
              "Incoming production cooperation requests will appear here.",
          })}
          icon="assignment"
        />
      ) : (
        <>
          <Box display={{ base: "block", lg: "none" }}>
            <RequestCards
              dateFormatter={dateFormatter}
              lng={i18n.resolvedLanguage ?? "en"}
              requests={requests}
              unavailableLabel={unavailableLabel}
            />
          </Box>
          <Box display={{ base: "none", lg: "block" }}>
            <Table.Root
              variant="outline"
              rounded="xl"
              size="sm"
              overflow="hidden"
            >
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>
                    {t("productionCooperation.item", {
                      defaultValue: "Item",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.order", {
                      defaultValue: "Order",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.customer", {
                      defaultValue: "Customer",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.quantity", {
                      defaultValue: "Quantity",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.expiresAt", {
                      defaultValue: "Expires",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.transport", {
                      defaultValue: "Transport",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.statusLabel", {
                      defaultValue: "Status",
                    })}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>
                    {t("productionCooperation.actions", {
                      defaultValue: "Actions",
                    })}
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {requests.map((request) => (
                  <Table.Row key={request.id}>
                    <Table.Cell maxW="360px">
                      <Text fontWeight="medium" lineClamp={2}>
                        {request.item.name}
                      </Text>
                      {request.item.description ? (
                        <Text color="fg.muted" fontSize="sm" lineClamp={1}>
                          {request.item.description}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell translate="no">
                      {request.order.number}
                    </Table.Cell>
                    <Table.Cell maxW="260px">
                      <Text lineClamp={2}>
                        {request.order.customerName ||
                          request.order.customerEmail ||
                          unavailableLabel}
                      </Text>
                    </Table.Cell>
                    <Table.Cell fontVariantNumeric="tabular-nums">
                      {request.item.quantity} {request.item.unit ?? ""}
                    </Table.Cell>
                    <Table.Cell>
                      {formatCooperationDate(
                        request.expiresAt,
                        dateFormatter,
                        unavailableLabel,
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {t(
                        `productionCooperation.transportValue.${request.transport}`,
                        { defaultValue: request.transport },
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge
                        colorPalette={getCooperationStatusColorPalette(
                          request.status,
                        )}
                      >
                        {t(`productionCooperation.status.${request.status}`, {
                          defaultValue: request.status,
                        })}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <ButtonLink
                        lng={i18n.resolvedLanguage ?? "en"}
                        href={`/cooperation/review?requestId=${encodeURIComponent(
                          request.id,
                        )}`}
                        ariaLabel={t("productionCooperation.review.open", {
                          defaultValue: "Open Request",
                        })}
                        size="xs"
                        variant="outline"
                      >
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                        {t("productionCooperation.review.open", {
                          defaultValue: "Open Request",
                        })}
                      </ButtonLink>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </>
      )}
    </Box>
  );
}
