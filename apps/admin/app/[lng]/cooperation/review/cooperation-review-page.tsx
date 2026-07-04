"use client";

import { useT } from "@/i18n/client";
import type { ProductionCooperationReviewState } from "@/lib/production-cooperation/types";
import {
  Alert,
  Badge,
  Box,
  Card,
  Code,
  HStack,
  SimpleGrid,
  Text,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { useMemo } from "react";
import {
  formatCooperationDate,
  getCooperationStatusColorPalette,
} from "../cooperation-formatters";
import { CooperationReviewActions } from "./cooperation-review-actions";

function Detail({
  fallback,
  label,
  translate,
  value,
}: {
  fallback: string;
  label: string;
  translate?: "no";
  value: string | number | undefined;
}) {
  return (
    <Box minW="0">
      <Text color="fg.muted" fontSize="xs">
        {label}
      </Text>
      <Text fontWeight="medium" lineClamp={2} translate={translate}>
        {value ?? fallback}
      </Text>
    </Box>
  );
}

function hasConfigurationDetails(
  item: Extract<
    ProductionCooperationReviewState,
    { kind: "ready" }
  >["request"]["item"],
) {
  const configuration = item.configuration;
  return Boolean(
    configuration?.combination ||
    configuration?.calculatedCombination ||
    configuration?.pageCount ||
    configuration?.volume ||
    configuration?.selectedAttributes?.length ||
    configuration?.customSizes?.length ||
    Object.keys(configuration?.advancedAttributeSelections ?? {}).length ||
    item.product?.attributes?.some((attribute) => attribute.required),
  );
}

function ConfigurationDetails({
  fallback,
  item,
}: {
  fallback: string;
  item: Extract<
    ProductionCooperationReviewState,
    { kind: "ready" }
  >["request"]["item"];
}) {
  const { t } = useT();
  const configuration = item.configuration;
  const selectedAttributes = configuration?.selectedAttributes ?? [];
  const requiredAttributes =
    item.product?.attributes?.filter((attribute) => attribute.required) ?? [];
  const advancedAttributeCount = Object.keys(
    configuration?.advancedAttributeSelections ?? {},
  ).length;

  if (!hasConfigurationDetails(item)) {
    return null;
  }

  return (
    <Box>
      <Text fontWeight="semibold" mb={3}>
        {t("productionCooperation.configuration.title", {
          defaultValue: "Configuration",
        })}
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Detail
          fallback={fallback}
          label={t("productionCooperation.configuration.combination", {
            defaultValue: "Combination",
          })}
          translate="no"
          value={configuration?.combination ?? undefined}
        />
        <Detail
          fallback={fallback}
          label={t(
            "productionCooperation.configuration.calculatedCombination",
            {
              defaultValue: "Calculated combination",
            },
          )}
          translate="no"
          value={configuration?.calculatedCombination ?? undefined}
        />
        <Detail
          fallback={fallback}
          label={t("productionCooperation.configuration.pageCount", {
            defaultValue: "Page count",
          })}
          value={configuration?.pageCount ?? undefined}
        />
        <Detail
          fallback={fallback}
          label={t("productionCooperation.configuration.volume", {
            defaultValue: "Volume",
          })}
          value={configuration?.volume ?? undefined}
        />
      </SimpleGrid>
      {selectedAttributes.length > 0 ? (
        <Box mt={4}>
          <Text color="fg.muted" fontSize="xs" mb={2}>
            {t("productionCooperation.configuration.selectedAttributes", {
              defaultValue: "Selected attributes",
            })}
          </Text>
          <VStack align="stretch" gap={2}>
            {selectedAttributes.map((attribute) => (
              <HStack
                key={`${attribute.attributeId}:${attribute.optionValue}`}
                align="start"
                justify="space-between"
                gap={3}
              >
                <Box minW="0">
                  <Text fontWeight="medium" lineClamp={1}>
                    {attribute.attributeName || attribute.attributeId}
                  </Text>
                  <Text color="fg.muted" fontSize="sm" translate="no">
                    {attribute.optionLabel || attribute.optionValue}
                  </Text>
                </Box>
                {attribute.required ? (
                  <Badge colorPalette="orange">
                    {t("productionCooperation.configuration.required", {
                      defaultValue: "Required",
                    })}
                  </Badge>
                ) : null}
              </HStack>
            ))}
          </VStack>
        </Box>
      ) : null}
      {requiredAttributes.length > 0 ? (
        <Box mt={4}>
          <Text color="fg.muted" fontSize="xs" mb={2}>
            {t("productionCooperation.configuration.requiredAttributes", {
              defaultValue: "Required product attributes",
            })}
          </Text>
          <Wrap gap={2}>
            {requiredAttributes.map((attribute) => (
              <Badge key={attribute.id} colorPalette="orange" translate="no">
                {attribute.name || attribute.id}
              </Badge>
            ))}
          </Wrap>
        </Box>
      ) : null}
      {configuration?.customSizes?.length ? (
        <Box mt={4}>
          <Text color="fg.muted" fontSize="xs" mb={2}>
            {t("productionCooperation.configuration.customSizes", {
              defaultValue: "Custom sizes",
            })}
          </Text>
          <Wrap gap={2}>
            {configuration.customSizes.map((size) => (
              <Badge
                key={`${size.width}:${size.height}:${size.quantity ?? ""}`}
                colorPalette="gray"
              >
                {size.width} x {size.height}
                {size.quantity ? ` / ${size.quantity}` : ""}
              </Badge>
            ))}
          </Wrap>
        </Box>
      ) : null}
      {advancedAttributeCount > 0 ? (
        <Text color="fg.muted" fontSize="sm" mt={4}>
          {t("productionCooperation.configuration.advancedConfigured", {
            count: advancedAttributeCount,
            defaultValue:
              "{{count}} advanced finishing option(s) included in the secure request payload.",
          })}
        </Text>
      ) : null}
    </Box>
  );
}

function UnavailableReview({
  lng,
  state,
}: {
  lng: string;
  state: Extract<ProductionCooperationReviewState, { kind: "unavailable" }>;
}) {
  const { t } = useT();

  return (
    <Box>
      <CustomHeading
        heading={t("productionCooperation.review.title", {
          defaultValue: "Review Cooperation Request",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <Card.Root maxW="3xl" variant="outline">
        <Card.Body>
          <VStack align="stretch" gap={5}>
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t(`productionCooperation.result.${state.code}.title`, {
                    defaultValue: "Action unavailable",
                  })}
                </Alert.Title>
                <Alert.Description>
                  {t(`productionCooperation.result.${state.code}.description`, {
                    defaultValue: state.message,
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
            <HStack>
              <ButtonLink
                lng={lng}
                href="/cooperation"
                variant="outline"
                ariaLabel={t("productionCooperation.backToInbox", {
                  defaultValue: "Back to Cooperation",
                })}
              >
                <MaterialSymbol>assignment</MaterialSymbol>
                {t("productionCooperation.backToInbox", {
                  defaultValue: "Back to Cooperation",
                })}
              </ButtonLink>
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}

export default function CooperationReviewPage({
  lng,
  requestId,
  state,
  token,
}: {
  lng: string;
  requestId?: string;
  state: ProductionCooperationReviewState;
  token?: string;
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

  if (state.kind === "unavailable") {
    return <UnavailableReview lng={lng} state={state} />;
  }

  return (
    <Box>
      <CustomHeading
        heading={t("productionCooperation.review.title", {
          defaultValue: "Review Cooperation Request",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />
      <SimpleGrid columns={{ base: 1, xl: 3 }} gap={5} alignItems="start">
        <VStack align="stretch" gap={5} gridColumn={{ xl: "span 2" }}>
          <Card.Root variant="outline">
            <Card.Body>
              <VStack align="stretch" gap={5}>
                <HStack gap={3} align="start">
                  <Box minW="0">
                    <Text fontSize="xl" fontWeight="semibold" lineClamp={2}>
                      {state.request.item.name}
                    </Text>
                    <Text color="fg.muted" translate="no">
                      {t("productionCooperation.orderNumber", {
                        defaultValue: "Order #{{number}}",
                        number: state.request.order.number,
                      })}
                    </Text>
                  </Box>
                  <Badge
                    colorPalette={getCooperationStatusColorPalette(
                      state.request.status,
                    )}
                    ml="auto"
                  >
                    {t(`productionCooperation.status.${state.request.status}`, {
                      defaultValue: state.request.status,
                    })}
                  </Badge>
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.customer", {
                      defaultValue: "Customer",
                    })}
                    value={
                      state.request.order.customerName ||
                      state.request.order.customerEmail ||
                      unavailableLabel
                    }
                  />
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.quantity", {
                      defaultValue: "Quantity",
                    })}
                    value={`${state.request.item.quantity} ${
                      state.request.item.unit ?? ""
                    }`}
                  />
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.dimensions", {
                      defaultValue: "Dimensions",
                    })}
                    value={
                      state.request.item.width && state.request.item.height
                        ? `${state.request.item.width} x ${state.request.item.height}`
                        : unavailableLabel
                    }
                  />
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.productId", {
                      defaultValue: "Product ID",
                    })}
                    translate="no"
                    value={
                      state.request.item.productId ||
                      state.request.item.productName ||
                      unavailableLabel
                    }
                  />
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.createdAt", {
                      defaultValue: "Created",
                    })}
                    value={formatCooperationDate(
                      state.request.createdAt,
                      dateFormatter,
                      unavailableLabel,
                    )}
                  />
                  <Detail
                    fallback={unavailableLabel}
                    label={t("productionCooperation.expiresAt", {
                      defaultValue: "Expires",
                    })}
                    value={formatCooperationDate(
                      state.request.expiresAt,
                      dateFormatter,
                      unavailableLabel,
                    )}
                  />
                </SimpleGrid>
                {state.request.item.description ? (
                  <Box>
                    <Text color="fg.muted" fontSize="xs" mb={1}>
                      {t("productionCooperation.description", {
                        defaultValue: "Description",
                      })}
                    </Text>
                    <Text whiteSpace="pre-wrap" overflowWrap="anywhere">
                      {state.request.item.description}
                    </Text>
                  </Box>
                ) : null}
                {state.request.order.specialNotes ? (
                  <Box>
                    <Text color="fg.muted" fontSize="xs" mb={1}>
                      {t("productionCooperation.specialNotes", {
                        defaultValue: "Special Notes",
                      })}
                    </Text>
                    <Text whiteSpace="pre-wrap" overflowWrap="anywhere">
                      {state.request.order.specialNotes}
                    </Text>
                  </Box>
                ) : null}
                <ConfigurationDetails
                  fallback={unavailableLabel}
                  item={state.request.item}
                />
              </VStack>
            </Card.Body>
          </Card.Root>
          <CooperationReviewActions
            callbackStatus={state.request.callbackStatus}
            lng={lng}
            requestId={requestId ?? state.request.id}
            token={token}
          />
        </VStack>
        <Card.Root variant="outline">
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Text fontWeight="semibold">
                {t("productionCooperation.review.sourceTitle", {
                  defaultValue: "Source & Target",
                })}
              </Text>
              <Detail
                fallback={unavailableLabel}
                label={t("productionCooperation.sourceParticipant", {
                  defaultValue: "Source Participant",
                })}
                translate="no"
                value={state.request.sourceParticipantId}
              />
              <Detail
                fallback={unavailableLabel}
                label={t("productionCooperation.targetParticipant", {
                  defaultValue: "Target Participant",
                })}
                translate="no"
                value={state.request.targetParticipantId}
              />
              <Detail
                fallback={unavailableLabel}
                label={t("productionCooperation.transport", {
                  defaultValue: "Transport",
                })}
                value={t(
                  `productionCooperation.transportValue.${state.request.transport}`,
                  { defaultValue: state.request.transport },
                )}
              />
              {state.request.callbackStatus ? (
                <Detail
                  fallback={unavailableLabel}
                  label={t("productionCooperation.callbackStatus", {
                    defaultValue: "Cloud sync",
                  })}
                  value={t(
                    `productionCooperation.callbackStatusValue.${state.request.callbackStatus}`,
                    { defaultValue: state.request.callbackStatus },
                  )}
                />
              ) : null}
              {state.request.callbackError ? (
                <Box minW="0">
                  <Text color="fg.muted" fontSize="xs">
                    {t("productionCooperation.callbackError", {
                      defaultValue: "Sync error",
                    })}
                  </Text>
                  <Text color="red.fg" fontSize="sm" overflowWrap="anywhere">
                    {state.request.callbackError}
                  </Text>
                </Box>
              ) : null}
              <Box minW="0">
                <Text color="fg.muted" fontSize="xs">
                  {t("productionCooperation.requestId", {
                    defaultValue: "Request ID",
                  })}
                </Text>
                <Code truncate translate="no">
                  {state.request.id}
                </Code>
              </Box>
              {state.request.history?.length ? (
                <Box>
                  <Text fontWeight="semibold" mb={2}>
                    {t("productionCooperation.history.title", {
                      defaultValue: "History",
                    })}
                  </Text>
                  <VStack align="stretch" gap={2}>
                    {state.request.history.map((event) => (
                      <Box
                        key={event.id}
                        borderLeftWidth="2px"
                        borderColor="border"
                        pl={3}
                      >
                        <Text fontSize="sm" fontWeight="medium">
                          {t(
                            `productionCooperation.history.event.${event.type}`,
                            { defaultValue: event.type },
                          )}
                        </Text>
                        {event.createdAt ? (
                          <Text color="fg.muted" fontSize="xs">
                            {formatCooperationDate(
                              event.createdAt,
                              dateFormatter,
                              unavailableLabel,
                            )}
                          </Text>
                        ) : null}
                        {event.message ? (
                          <Text
                            color="fg.muted"
                            fontSize="sm"
                            overflowWrap="anywhere"
                          >
                            {event.message}
                          </Text>
                        ) : null}
                      </Box>
                    ))}
                  </VStack>
                </Box>
              ) : null}
            </VStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>
    </Box>
  );
}
