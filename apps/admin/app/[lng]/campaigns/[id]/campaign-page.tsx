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
import { ADMIN_CAMPAIGNS_UPDATE } from "@konfi/utils";

type CampaignBudgetType = NonNullable<Campaign["budget"]>["type"];
type PromotionApplicationMethodType = NonNullable<
  Promotion["applicationMethod"]
>["type"];

type CampaignPagePromotion = {
  id: string;
  code?: string;
  type?: Promotion["type"];
  active: boolean;
  applicationMethod?: {
    type?: PromotionApplicationMethodType;
    value?: number;
    currencyCode?: string;
  };
};

type CampaignPageCampaign = {
  id: string;
  name?: string;
  description?: string;
  campaignIdentifier?: string;
  startsAt?: string;
  endsAt?: string;
  availabilityTypes?: Campaign["availabilityTypes"];
  budget?: {
    type?: CampaignBudgetType;
    limit?: number | null;
    used?: number;
    currencyCode?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  promotions?: CampaignPagePromotion[];
};

type CampaignStatus = {
  colorPalette: "blue" | "gray" | "red" | "success";
  defaultValue: string;
  key: "alwaysAvailable" | "ended" | "running" | "upcoming";
};

function parseDateOnly(value: string, endOfDay = false) {
  const date = new Date(`${value}T00:00:00`);

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function getCampaignStatus(startsAt?: string, endsAt?: string): CampaignStatus {
  if (!startsAt && !endsAt) {
    return {
      key: "alwaysAvailable",
      defaultValue: "Always available",
      colorPalette: "gray",
    };
  }

  const now = new Date();

  if (startsAt) {
    const startsAtDate = parseDateOnly(startsAt);

    if (startsAtDate.getTime() > now.getTime()) {
      return {
        key: "upcoming",
        defaultValue: "Upcoming",
        colorPalette: "blue",
      };
    }
  }

  if (endsAt) {
    const endsAtDate = parseDateOnly(endsAt, true);

    if (endsAtDate.getTime() < now.getTime()) {
      return {
        key: "ended",
        defaultValue: "Ended",
        colorPalette: "red",
      };
    }
  }

  return {
    key: "running",
    defaultValue: "Running",
    colorPalette: "success",
  };
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

function formatPromotionValue(
  promotion: CampaignPagePromotion,
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

export default function CampaignPage({
  campaign,
}: {
  campaign?: CampaignPageCampaign;
}) {
  const { t, i18n } = useT();
  const unavailableLabel = t("common.unavailable", {
    defaultValue: "Unavailable",
  });

  if (!campaign) {
    return (
      <Empty
        title={t("campaigns.notExists", {
          defaultValue: "Campaign does not exist",
        })}
        description={t("campaigns.notFound", {
          defaultValue: "Campaign not found with the given identifier",
        })}
        icon="sell"
      />
    );
  }

  const resolvedLanguage = i18n.resolvedLanguage;
  const campaignStatus = getCampaignStatus(campaign.startsAt, campaign.endsAt);
  const availabilityLabels =
    campaign.availabilityTypes?.map((availabilityType) =>
      t(`CampaignAvailabilityTypeEnum.${availabilityType}`, {
        defaultValue: availabilityType,
      }),
    ) ?? [];
  const linkedPromotions = campaign.promotions ?? [];
  const promotionCountLabel =
    formatNumberValue(linkedPromotions.length, resolvedLanguage) ??
    String(linkedPromotions.length);
  const budgetTypeLabel = campaign.budget?.type
    ? t(`CampaignBudgetTypes.${campaign.budget.type}`, {
        defaultValue: campaign.budget.type,
      })
    : unavailableLabel;
  const budgetLimitLabel =
    formatCampaignBudgetValue(
      campaign.budget?.limit,
      campaign.budget?.type,
      campaign.budget?.currencyCode,
      resolvedLanguage,
    ) ?? unavailableLabel;
  const budgetUsedLabel =
    formatCampaignBudgetValue(
      campaign.budget?.used,
      campaign.budget?.type,
      campaign.budget?.currencyCode,
      resolvedLanguage,
    ) ?? unavailableLabel;
  const budgetRemaining =
    campaign.budget?.limit !== undefined &&
    campaign.budget?.limit !== null &&
    campaign.budget?.used !== undefined &&
    campaign.budget?.used !== null
      ? campaign.budget.limit - campaign.budget.used
      : undefined;
  const budgetRemainingLabel =
    formatCampaignBudgetValue(
      budgetRemaining,
      campaign.budget?.type,
      campaign.budget?.currencyCode,
      resolvedLanguage,
    ) ?? unavailableLabel;

  return (
    <>
      <Box>
        <CustomHeading
          heading={
            campaign.name ??
            t("campaigns.campaign", { defaultValue: "Campaign" })
          }
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
              colorPalette={campaignStatus.colorPalette}
            >
              {t(`campaigns.${campaignStatus.key}`, {
                defaultValue: campaignStatus.defaultValue,
              })}
            </Badge>
            {campaign.startsAt ? (
              <Badge pl={3} pr={4} size="lg">
                {t("common.startDate", { defaultValue: "Start date" })}:{" "}
                {formatDateValue(campaign.startsAt, resolvedLanguage) ??
                  unavailableLabel}
              </Badge>
            ) : null}
            {campaign.endsAt ? (
              <Badge pl={3} pr={4} size="lg">
                {t("common.endDate", { defaultValue: "End date" })}:{" "}
                {formatDateValue(campaign.endsAt, resolvedLanguage) ??
                  unavailableLabel}
              </Badge>
            ) : null}
            <Badge pl={3} pr={4} size="lg" colorPalette="primary">
              {promotionCountLabel}{" "}
              {t("campaigns.linkedPromotions", {
                defaultValue: "Linked promotions",
              })}
            </Badge>
          </HStack>
          <ButtonLink
            lng={resolvedLanguage}
            href={ADMIN_CAMPAIGNS_UPDATE(campaign.id)}
            variant="solid"
            colorPalette="primary"
            ariaLabel={t("admin.editCampaign", {
              defaultValue: "Edit Campaign",
            })}
            alignSelf={["start", "start"]}
            flexShrink={0}
          >
            <MaterialSymbol>edit_square</MaterialSymbol>
            {t("admin.editCampaign", {
              defaultValue: "Edit Campaign",
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
            title={t("campaigns.overview", { defaultValue: "Overview" })}
            description={campaign.description}
          >
            <DetailsGrid>
              <DetailsField
                label={t("campaigns.name", { defaultValue: "Name" })}
                value={
                  campaign.name ??
                  t("common.noName", { defaultValue: "No name" })
                }
              />
              <DetailsField
                label={t("forms.campaign.labels.campaignIdentifier", {
                  defaultValue: "Internal Identifier",
                })}
                value={campaign.campaignIdentifier ?? unavailableLabel}
              />
              <DetailsField
                label={t("campaigns.createdAt", {
                  defaultValue: "Created at",
                })}
                value={
                  formatDateTimeValue(campaign.createdAt, resolvedLanguage) ??
                  unavailableLabel
                }
              />
              <DetailsField
                label={t("campaigns.updatedAt", {
                  defaultValue: "Updated at",
                })}
                value={
                  formatDateTimeValue(campaign.updatedAt, resolvedLanguage) ??
                  unavailableLabel
                }
              />
            </DetailsGrid>
          </DetailsCard>

          <Box mt={[6, 8]}>
            <DetailsCard
              title={t("campaigns.linkedPromotions", {
                defaultValue: "Linked promotions",
              })}
              action={
                linkedPromotions.length > 0 ? (
                  <Badge colorPalette="primary" size="sm">
                    {promotionCountLabel}
                  </Badge>
                ) : undefined
              }
            >
              {linkedPromotions.length > 0 ? (
                <Table.ScrollArea>
                  <Table.Root size="sm" variant="line">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>
                          {t("table.code", { defaultValue: "Code" })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("forms.promotion.labels.type", {
                            defaultValue: "Type",
                          })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("table.value", { defaultValue: "Value" })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          {t("status", { defaultValue: "Status" })}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader textAlign="end">
                          {t("table.actions", { defaultValue: "Actions" })}
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {linkedPromotions.map((promotion) => (
                        <Table.Row key={promotion.id}>
                          <Table.Cell fontWeight="medium">
                            {promotion.code ?? unavailableLabel}
                          </Table.Cell>
                          <Table.Cell>
                            {promotion.type
                              ? t(`PromotionTypes.${promotion.type}`, {
                                  defaultValue: promotion.type,
                                })
                              : unavailableLabel}
                          </Table.Cell>
                          <Table.Cell>
                            {formatPromotionValue(
                              promotion,
                              resolvedLanguage,
                            ) ?? unavailableLabel}
                          </Table.Cell>
                          <Table.Cell>
                            <Badge
                              colorPalette={
                                promotion.active ? "success" : "gray"
                              }
                              variant="subtle"
                            >
                              {promotion.active
                                ? t("active", { defaultValue: "Active" })
                                : t("inactive", {
                                    defaultValue: "Inactive",
                                  })}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell textAlign="end">
                            <IconButtonLink
                              lng={resolvedLanguage}
                              href={`/promotions/${promotion.id}`}
                              icon="open_in_new"
                              size="sm"
                              ariaLabel={t("admin.promotionPreview", {
                                defaultValue: "Open promotion details",
                              })}
                              tooltipLabel={t("admin.promotionPreview", {
                                defaultValue: "Open promotion details",
                              })}
                            />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Table.ScrollArea>
              ) : (
                <Text color="fg.muted">
                  {t("campaigns.noLinkedPromotions", {
                    defaultValue:
                      "No promotions are linked to this campaign yet.",
                  })}
                </Text>
              )}
            </DetailsCard>
          </Box>
        </GridItem>

        <GridItem minW="100%" colSpan={[1, 2]}>
          <VStack align="stretch" gap={[6, 8]}>
            <DetailsCard
              title={t("campaigns.schedule", { defaultValue: "Schedule" })}
              action={
                <Badge colorPalette={campaignStatus.colorPalette}>
                  {t(`campaigns.${campaignStatus.key}`, {
                    defaultValue: campaignStatus.defaultValue,
                  })}
                </Badge>
              }
            >
              <VStack align="stretch" gap={4}>
                <DetailsField
                  label={t("common.startDate", { defaultValue: "Start date" })}
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
                    <Text fontWeight="medium">
                      {t("campaigns.alwaysAvailable", {
                        defaultValue: "Always available",
                      })}
                    </Text>
                  )}
                </DetailsField>
              </VStack>
            </DetailsCard>

            <DetailsCard
              title={t("forms.campaign.labels.budget", {
                defaultValue: "Budget",
              })}
            >
              <VStack align="stretch" gap={4}>
                <DetailsField
                  label={t("forms.campaign.labels.budgetType", {
                    defaultValue: "Budget Type",
                  })}
                  value={budgetTypeLabel}
                />
                <DetailsField
                  label={t("forms.campaign.labels.limit", {
                    defaultValue: "Budget Limit",
                  })}
                  value={budgetLimitLabel}
                />
                <DetailsField
                  label={t("campaigns.budgetUsed", {
                    defaultValue: "Used budget",
                  })}
                  value={budgetUsedLabel}
                />
                <DetailsField
                  label={t("campaigns.budgetRemaining", {
                    defaultValue: "Remaining budget",
                  })}
                  value={budgetRemainingLabel}
                />
              </VStack>
            </DetailsCard>
          </VStack>
        </GridItem>
      </Grid>
    </>
  );
}
