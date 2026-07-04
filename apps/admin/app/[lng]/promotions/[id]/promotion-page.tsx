"use client";

import {
  DetailsCard,
  DetailsField,
  DetailsGrid,
  formatDateTimeValue,
  formatDateValue,
  formatMinorCurrency,
  formatNumberValue,
} from "@/components/promotions/details-helpers";
import { useT } from "@/i18n/client";
import {
  Alert,
  Badge,
  Box,
  Flex,
  Grid,
  GridItem,
  HStack,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  Empty,
  IconButtonLink,
  MaterialSymbol,
} from "@konfi/components";
import { Campaign, CurrencyEnum, Promotion } from "@konfi/types";
import { ADMIN_PROMOTIONS_UPDATE } from "@konfi/utils";

type CampaignBudgetType = NonNullable<Campaign["budget"]>["type"];

type PromotionPageRule = {
  id: string;
  description?: string | null;
  attribute?: NonNullable<Promotion["rules"]>[number]["attribute"];
  operator?: NonNullable<Promotion["rules"]>[number]["operator"];
  values: string[];
};

type PromotionPagePromotion = {
  id: string;
  code?: string;
  type?: Promotion["type"];
  isAutomatic?: boolean;
  isOneTime?: boolean;
  minimumOrderValue?: number | null;
  active: boolean;
  campaignId?: string | null;
  applicationMethod?: {
    type?: NonNullable<Promotion["applicationMethod"]>["type"];
    targetType?: NonNullable<Promotion["applicationMethod"]>["targetType"];
    allocation?: NonNullable<Promotion["applicationMethod"]>["allocation"];
    value?: number;
    currencyCode?: string;
    maxQuantity?: number | null;
    buyRulesMinQuantity?: number | null;
    applyToQuantity?: number | null;
  };
  rules?: PromotionPageRule[];
  createdAt?: string;
  updatedAt?: string;
};

type PromotionPageCampaign = {
  id: string;
  name?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  availabilityTypes?: Campaign["availabilityTypes"];
  budget?: {
    type?: CampaignBudgetType;
    limit?: number | null;
    used?: number;
    currencyCode?: string;
  };
};

function formatPromotionValue(
  promotion: PromotionPagePromotion,
  locale?: string,
): string | undefined {
  const applicationMethod = promotion.applicationMethod;

  if (!applicationMethod) {
    return undefined;
  }

  if (
    applicationMethod.value === undefined ||
    applicationMethod.value === null
  ) {
    return undefined;
  }

  if (applicationMethod.type === "PERCENTAGE") {
    return `${applicationMethod.value}%`;
  }

  return formatMinorCurrency(
    applicationMethod.value,
    applicationMethod.currencyCode ?? CurrencyEnum.PLN,
    locale,
  );
}

function formatCampaignBudgetValue(
  value: number | null | undefined,
  budgetType: CampaignBudgetType | undefined,
  currencyCode: string | undefined,
  locale?: string,
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (budgetType === "SPEND") {
    return formatMinorCurrency(value, currencyCode ?? CurrencyEnum.PLN, locale);
  }

  return formatNumberValue(value, locale);
}

export default function PromotionPage({
  promotion,
  campaign,
}: {
  promotion?: PromotionPagePromotion;
  campaign?: PromotionPageCampaign;
}) {
  const { t, i18n } = useT();
  const unavailableLabel = t("common.unavailable", {
    defaultValue: "Unavailable",
  });

  if (!promotion) {
    return (
      <Empty
        title={t("promotions.notFound", {
          defaultValue: "Promotion does not exist",
        })}
        description={t("promotions.notFoundDescription", {
          defaultValue: "Promotion not found with the given identifier",
        })}
        icon="sell"
      />
    );
  }

  const resolvedLanguage = i18n.resolvedLanguage;
  const rules = promotion.rules ?? [];
  const rulesCountLabel =
    formatNumberValue(rules.length, resolvedLanguage) ?? String(rules.length);
  const applicationMethodValue =
    formatPromotionValue(promotion, resolvedLanguage) ?? unavailableLabel;
  const minimumOrderValue =
    formatMinorCurrency(
      promotion.minimumOrderValue,
      promotion.applicationMethod?.currencyCode ?? CurrencyEnum.PLN,
      resolvedLanguage,
    ) ?? unavailableLabel;
  const relatedCampaignBudgetLimit =
    formatCampaignBudgetValue(
      campaign?.budget?.limit,
      campaign?.budget?.type,
      campaign?.budget?.currencyCode,
      resolvedLanguage,
    ) ?? unavailableLabel;
  const availabilityLabels =
    campaign?.availabilityTypes?.map((availabilityType) =>
      t(`CampaignAvailabilityTypeEnum.${availabilityType}`, {
        defaultValue: availabilityType,
      }),
    ) ?? [];

  return (
    <>
      <Box>
        <CustomHeading
          heading={promotion.code ?? ""}
          mb={8}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Flex
          mb={7}
          gap={3}
          direction={["column", "row"]}
          justify="space-between"
          align={["stretch", "start"]}
        >
          <HStack gap={2} flexWrap="wrap">
            <Badge
              pl={3}
              pr={4}
              size="lg"
              colorPalette={promotion.active ? "success" : "gray"}
            >
              {promotion.active
                ? t("active", { defaultValue: "Active" })
                : t("inactive", { defaultValue: "Inactive" })}
            </Badge>
            {promotion.type ? (
              <Badge pl={3} pr={4} size="lg" colorPalette="primary">
                {t(`PromotionTypes.${promotion.type}`, {
                  defaultValue: promotion.type,
                })}
              </Badge>
            ) : null}
            {promotion.isAutomatic ? (
              <Badge pl={3} pr={4} size="lg" colorPalette="blue">
                {t("forms.promotion.labels.isAutomatic", {
                  defaultValue: "Apply automatically",
                })}
              </Badge>
            ) : null}
            {promotion.isOneTime ? (
              <Badge pl={3} pr={4} size="lg" colorPalette="purple">
                {t("forms.promotion.labels.isOneTime", {
                  defaultValue: "One-time use",
                })}
              </Badge>
            ) : null}
            {campaign?.name ? (
              <Badge pl={3} pr={4} size="lg" variant="outline">
                {campaign.name}
              </Badge>
            ) : null}
          </HStack>
          <ButtonLink
            lng={resolvedLanguage}
            href={ADMIN_PROMOTIONS_UPDATE(promotion.id)}
            variant="solid"
            colorPalette="primary"
            ariaLabel={t("admin.editPromotion", {
              defaultValue: "Edit Promotion",
            })}
            alignSelf={["start", "start"]}
            flexShrink={0}
          >
            <MaterialSymbol>edit_square</MaterialSymbol>
            {t("admin.editPromotion", {
              defaultValue: "Edit Promotion",
            })}
          </ButtonLink>
        </Flex>
      </Box>

      <Grid
        templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
        columnGap={["0", "8"]}
        rowGap={["6", "8"]}
      >
        <GridItem minW="100%" colSpan={[1, 3]} overflowX="auto">
          <DetailsCard
            title={t("promotions.overview", { defaultValue: "Overview" })}
          >
            <DetailsGrid>
              <DetailsField
                label={t("table.code", { defaultValue: "Code" })}
                value={promotion.code ?? unavailableLabel}
              />
              <DetailsField
                label={t("forms.promotion.labels.type", {
                  defaultValue: "Type",
                })}
                value={
                  promotion.type
                    ? t(`PromotionTypes.${promotion.type}`, {
                        defaultValue: promotion.type,
                      })
                    : unavailableLabel
                }
              />
              <DetailsField
                label={t("status", { defaultValue: "Status" })}
                value={
                  promotion.active
                    ? t("active", { defaultValue: "Active" })
                    : t("inactive", { defaultValue: "Inactive" })
                }
              />
              <DetailsField
                label={t("forms.promotion.labels.isAutomatic", {
                  defaultValue: "Apply automatically",
                })}
                value={
                  promotion.isAutomatic
                    ? t("common.yes", { defaultValue: "Yes" })
                    : t("common.no", { defaultValue: "No" })
                }
              />
              <DetailsField
                label={t("forms.promotion.labels.isOneTime", {
                  defaultValue: "One-time use",
                })}
                value={
                  promotion.isOneTime
                    ? t("common.yes", { defaultValue: "Yes" })
                    : t("common.no", { defaultValue: "No" })
                }
              />
              <DetailsField
                label={t("forms.promotion.labels.minOrderValue", {
                  defaultValue: "Minimum order total",
                })}
                value={minimumOrderValue}
              />
              <DetailsField
                label={t("promotions.createdAt", {
                  defaultValue: "Created at",
                })}
                value={
                  formatDateTimeValue(promotion.createdAt, resolvedLanguage) ??
                  unavailableLabel
                }
              />
              <DetailsField
                label={t("promotions.updatedAt", {
                  defaultValue: "Updated at",
                })}
                value={
                  formatDateTimeValue(promotion.updatedAt, resolvedLanguage) ??
                  unavailableLabel
                }
              />
            </DetailsGrid>
          </DetailsCard>

          <Box mt={[6, 8]}>
            <DetailsCard
              title={t("promotions.applicationMethod", {
                defaultValue: "Application method",
              })}
            >
              <DetailsGrid>
                <DetailsField
                  label={t("forms.promotion.labels.applicationType", {
                    defaultValue: "Discount Type",
                  })}
                  value={
                    promotion.applicationMethod?.type
                      ? t(
                          `ApplicationMethodTypes.${promotion.applicationMethod.type}`,
                          {
                            defaultValue: promotion.applicationMethod.type,
                          },
                        )
                      : unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.promotion.labels.value", {
                    defaultValue: "Value",
                  })}
                  value={applicationMethodValue}
                />
                <DetailsField
                  label={t("forms.promotion.labels.applicationTarget", {
                    defaultValue: "Apply To",
                  })}
                  value={
                    promotion.applicationMethod?.targetType
                      ? t(
                          `ApplicationMethodTargetTypes.${promotion.applicationMethod.targetType}`,
                          {
                            defaultValue:
                              promotion.applicationMethod.targetType,
                          },
                        )
                      : unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.promotion.labels.applicationAllocation", {
                    defaultValue: "Discount Distribution",
                  })}
                  value={
                    promotion.applicationMethod?.allocation
                      ? t(
                          `ApplicationMethodAllocation.${promotion.applicationMethod.allocation}`,
                          {
                            defaultValue:
                              promotion.applicationMethod.allocation,
                          },
                        )
                      : unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.promotion.labels.currencyCode", {
                    defaultValue: "Currency",
                  })}
                  value={
                    promotion.applicationMethod?.currencyCode
                      ? t(
                          `Currency.${promotion.applicationMethod.currencyCode}`,
                          {
                            defaultValue:
                              promotion.applicationMethod.currencyCode,
                          },
                        )
                      : unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.promotion.labels.maxQuantity", {
                    defaultValue: "Quantity Limit",
                  })}
                  value={
                    formatNumberValue(
                      promotion.applicationMethod?.maxQuantity,
                      resolvedLanguage,
                    ) ?? unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.labels.minimumOrder", {
                    defaultValue: "Minimum Order",
                  })}
                  value={
                    formatNumberValue(
                      promotion.applicationMethod?.buyRulesMinQuantity,
                      resolvedLanguage,
                    ) ?? unavailableLabel
                  }
                />
                <DetailsField
                  label={t("forms.labels.quantity", {
                    defaultValue: "Quantity",
                  })}
                  value={
                    formatNumberValue(
                      promotion.applicationMethod?.applyToQuantity,
                      resolvedLanguage,
                    ) ?? unavailableLabel
                  }
                />
              </DetailsGrid>
            </DetailsCard>
          </Box>

          {!rules.length ? (
            <Alert.Root status="warning" mt={[6, 8]}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("promotions.noRules", {
                    defaultValue: "No rules configured for this promotion.",
                  })}
                </Alert.Title>
                <Alert.Description>
                  {t("forms.promotion.descriptions.rules", {
                    defaultValue:
                      "Add at least one rule. Promotions without rules are not applied, even when a minimum order total is set. If the code should work for all PLN orders, add a currency rule for PLN.",
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}

          <Box mt={[6, 8]}>
            <DetailsCard
              title={t("forms.headings.promotionRules", {
                defaultValue: "Promotion Rules",
              })}
              action={
                rules.length > 0 ? (
                  <Badge colorPalette="primary" size="sm">
                    {rulesCountLabel}
                  </Badge>
                ) : undefined
              }
            >
              {rules.length > 0 ? (
                <Table.ScrollArea>
                  <Table.Root size="sm" variant="line">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>
                          {t("forms.labels.attribute", {
                            defaultValue: "Attribute",
                          })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("forms.labels.operator", {
                            defaultValue: "Operator",
                          })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("table.value", { defaultValue: "Value" })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("common.description", {
                            defaultValue: "Description",
                          })}
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {rules.map((rule) => (
                        <Table.Row key={rule.id}>
                          <Table.Cell>
                            {rule.attribute
                              ? t(`PromotionRuleAttributes.${rule.attribute}`, {
                                  defaultValue: rule.attribute,
                                })
                              : unavailableLabel}
                          </Table.Cell>
                          <Table.Cell>
                            {rule.operator
                              ? t(`PromotionRuleOperators.${rule.operator}`, {
                                  defaultValue: rule.operator,
                                })
                              : unavailableLabel}
                          </Table.Cell>
                          <Table.Cell>
                            {rule.values.length > 0 ? (
                              <HStack gap={2} flexWrap="wrap">
                                {rule.values.map((value) => (
                                  <Badge
                                    key={`${rule.id}-${value}`}
                                    colorPalette="primary"
                                    variant="subtle"
                                  >
                                    {rule.attribute === "CURRENCY"
                                      ? t(`Currency.${value}`, {
                                          defaultValue: value,
                                        })
                                      : value}
                                  </Badge>
                                ))}
                              </HStack>
                            ) : (
                              unavailableLabel
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            {rule.description || unavailableLabel}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Table.ScrollArea>
              ) : (
                <Text color="fg.muted">
                  {t("promotions.noRules", {
                    defaultValue: "No rules configured for this promotion.",
                  })}
                </Text>
              )}
            </DetailsCard>
          </Box>
        </GridItem>

        <GridItem minW="100%" colSpan={[1, 2]}>
          <VStack align="stretch" gap={[6, 8]}>
            <DetailsCard
              title={t("promotions.linkedCampaign", {
                defaultValue: "Linked campaign",
              })}
              description={campaign?.description}
              action={
                campaign ? (
                  <IconButtonLink
                    lng={resolvedLanguage}
                    href={`/campaigns/${campaign.id}`}
                    icon="open_in_new"
                    ariaLabel={t("admin.campaignPreview", {
                      defaultValue: "Open campaign details",
                    })}
                    tooltipLabel={t("admin.campaignPreview", {
                      defaultValue: "Open campaign details",
                    })}
                  />
                ) : undefined
              }
            >
              {campaign ? (
                <VStack align="stretch" gap={4}>
                  <DetailsField
                    label={t("campaigns.name", { defaultValue: "Name" })}
                    value={campaign.name ?? unavailableLabel}
                  />
                  <DetailsField
                    label={t("common.startDate", {
                      defaultValue: "Start date",
                    })}
                    value={
                      formatDateValue(campaign.startsAt, resolvedLanguage) ??
                      unavailableLabel
                    }
                  />
                  <DetailsField
                    label={t("common.endDate", { defaultValue: "End date" })}
                    value={
                      formatDateValue(campaign.endsAt, resolvedLanguage) ??
                      unavailableLabel
                    }
                  />
                  <DetailsField
                    label={t("forms.campaign.labels.availability", {
                      defaultValue: "Available In",
                    })}
                  >
                    {availabilityLabels.length > 0 ? (
                      <HStack gap={2} flexWrap="wrap">
                        {availabilityLabels.map((availabilityLabel) => (
                          <Badge key={availabilityLabel} colorPalette="primary">
                            {availabilityLabel}
                          </Badge>
                        ))}
                      </HStack>
                    ) : (
                      <Text fontWeight="medium">{unavailableLabel}</Text>
                    )}
                  </DetailsField>
                  <DetailsField
                    label={t("forms.campaign.labels.limit", {
                      defaultValue: "Budget Limit",
                    })}
                    value={relatedCampaignBudgetLimit}
                  />
                </VStack>
              ) : (
                <Text color="fg.muted">
                  {t("promotions.noLinkedCampaign", {
                    defaultValue: "This promotion is not linked to a campaign.",
                  })}
                </Text>
              )}
            </DetailsCard>
          </VStack>
        </GridItem>
      </Grid>
    </>
  );
}
