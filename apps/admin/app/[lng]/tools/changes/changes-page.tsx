"use client";

import { useT } from "@/i18n/client";
import { Badge, Card, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  MaterialSymbol,
} from "@konfi/components";
import { ChangeLogEntry, DEFAULT_LOCALE, EntityType } from "@konfi/types";
import {
  ADMIN_CAMPAIGNS_UPDATE,
  ADMIN_CATALOG,
  ADMIN_CATALOG_PRODUCTS_EDIT,
  ADMIN_CHANNELS,
  ADMIN_CONFIG,
  ADMIN_CONFIG_ATTRIBUTES,
  ADMIN_CONFIG_MEMBERS,
  ADMIN_CONFIG_WAREHOUSES,
  ADMIN_CUSTOMERS,
  ADMIN_ORDERS,
  ADMIN_ORDERS_COMPLAINTS,
  ADMIN_PROMOTIONS_UPDATE,
  ADMIN_QUOTES,
} from "@konfi/utils";
import { useChanges } from "context/changes";
import { useMemo } from "react";

function buildEntityHref(entry: ChangeLogEntry): string | null {
  if (!entry.entityId) {
    return null;
  }

  switch (entry.entityType) {
    case EntityType.Order:
      return `${ADMIN_ORDERS}/${entry.entityId}${entry.channelId ? `?channelId=${entry.channelId}` : ""}`;
    case EntityType.Customer:
      return `${ADMIN_CUSTOMERS}/${entry.entityId}`;
    case EntityType.Product:
      return `${ADMIN_CATALOG_PRODUCTS_EDIT}/${entry.entityId}`;
    case EntityType.Category:
      return ADMIN_CATALOG;
    case EntityType.Attribute:
      return ADMIN_CONFIG_ATTRIBUTES;
    case EntityType.Channel:
      return ADMIN_CHANNELS;
    case EntityType.Warehouse:
      return ADMIN_CONFIG_WAREHOUSES;
    case EntityType.Member:
      return ADMIN_CONFIG_MEMBERS;
    case EntityType.Promotion:
      return ADMIN_PROMOTIONS_UPDATE(entry.entityId);
    case EntityType.Campaign:
      return ADMIN_CAMPAIGNS_UPDATE(entry.entityId);
    case EntityType.Quote:
      return `${ADMIN_QUOTES}/${entry.entityId}`;
    case EntityType.Complaint:
      return `${ADMIN_ORDERS_COMPLAINTS}/${entry.entityId}`;
    case EntityType.Settings:
      return ADMIN_CONFIG;
    default:
      return null;
  }
}

function pickDescription(
  descriptions: Record<string, string>,
  locale: string,
): string | null {
  const normalized = locale?.split("-")[0] ?? locale;

  return (
    descriptions[locale] ??
    descriptions[normalized] ??
    descriptions[DEFAULT_LOCALE] ??
    descriptions[normalized?.toLowerCase() ?? ""] ??
    Object.values(descriptions)[0] ??
    null
  );
}

export default function ChangesPage() {
  const { t, i18n } = useT();
  const { changes, loading } = useChanges();
  const resolvedLocale = useMemo(
    () => i18n.resolvedLanguage?.split("-")[0] ?? DEFAULT_LOCALE,
    [i18n.resolvedLanguage],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LOCALE, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );

  return (
    <Skeleton loading={loading}>
      <CustomHeading
        heading={t("tools.changes", { defaultValue: "Changes" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      {changes.length === 0 ? (
        <Empty
          title={t("changes.emptyTitle", { defaultValue: "No changes yet" })}
          description={t("changes.emptyDescription", {
            defaultValue:
              "We will show generated change descriptions here once they appear.",
          })}
          icon={"history"}
        />
      ) : (
        <VStack gap={2} alignItems={"stretch"}>
          {changes.map((entry) => {
            const href = buildEntityHref(entry);
            const description = pickDescription(
              entry.descriptions ?? {},
              resolvedLocale,
            );
            const changeCountLabel =
              entry.changes.length === 1
                ? t("changes.singleChange", { defaultValue: "1 change" })
                : t("changes.multipleChanges", {
                  count: entry.changes.length,
                  defaultValue: "{{count}} changes",
                });

            return (
              <Card.Root
                key={entry.id}
                rounded={"2xl"}
                size={"sm"}
                variant={"outline"}
              >
                <Card.Header py={2} px={4}>
                  <HStack
                    gap={3}
                    justifyContent={"space-between"}
                    alignItems={"flex-start"}
                  >
                    <VStack
                      gap={0.5}
                      alignItems={"flex-start"}
                      minW={0}
                      flex={"1"}
                    >
                      <Card.Title truncate fontSize={"sm"} lineHeight={"short"}>
                        {entry.entityType ??
                          t("changes.unknownEntity", {
                            defaultValue: "Unknown entity",
                          })}
                      </Card.Title>
                      <HStack gap={2} flexWrap={"wrap"} color={"fg.muted"}>
                        <Text fontSize={"xs"} color={"fg.muted"}>
                          {t("changes.detectedAt", {
                            date: dateFormatter.format(entry.timestamp),
                            defaultValue: `Detected ${dateFormatter.format(entry.timestamp)}`,
                          })}
                        </Text>
                        {entry.entityId && (
                          <Text fontSize={"xs"} color={"fg.muted"}>
                            {t("changes.entityIdLabel", {
                              id: entry.entityId,
                              defaultValue: `ID: ${entry.entityId}`,
                            })}
                          </Text>
                        )}
                      </HStack>
                    </VStack>
                    <HStack
                      gap={1}
                      flexWrap={"wrap"}
                      justifyContent={"flex-end"}
                    >
                      <Badge size={"xs"}>{changeCountLabel}</Badge>
                      {entry.channelId && (
                        <Badge size={"xs"} variant={"subtle"}>
                          {t("changes.channelBadge", {
                            channelId: entry.channelId,
                            defaultValue: `Channel ${entry.channelId}`,
                          })}
                        </Badge>
                      )}
                      {href && (
                        <ButtonLink
                          lng={i18n.resolvedLanguage}
                          href={href}
                          ariaLabel={t("changes.viewEntity", {
                            defaultValue: "View entity",
                          })}
                          size={"xs"}
                          px={2}
                          py={1}
                        >
                          {t("changes.viewEntity", {
                            defaultValue: "View entity",
                          })}
                          <MaterialSymbol>
                            open_in_new
                          </MaterialSymbol>
                        </ButtonLink>
                      )}
                    </HStack>
                  </HStack>
                </Card.Header>
                <Card.Body pt={0} pb={3} px={4}>
                  <Card.Description asChild>
                    <Text fontSize={"sm"} color={"fg.muted"} lineClamp={2}>
                      {description ??
                        t("changes.descriptionUnavailable", {
                          defaultValue: "Description unavailable.",
                        })}
                    </Text>
                  </Card.Description>
                </Card.Body>
              </Card.Root>
            );
          })}
        </VStack>
      )}
    </Skeleton>
  );
}
