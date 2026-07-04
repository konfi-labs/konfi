import {
  Badge,
  Box,
  Button,
  Collapsible,
  HStack,
  Separator,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  DEFAULT_LOCALE,
  Locale,
  OrderRiskAnalysis,
  OrderRiskAnalysisStatus,
  OrderRiskLevel,
  OrderRiskRecommendation,
  OrderRiskSkipReason,
} from "@konfi/types";
import { i18n, TFunction } from "i18next";

type OrderRiskTimestampLike =
  | OrderRiskAnalysis["createdAt"]
  | number
  | string
  | undefined;

export type OrderRiskAnalysisView = Omit<
  OrderRiskAnalysis,
  "createdAt" | "updatedAt"
> & {
  createdAt?: OrderRiskTimestampLike;
  updatedAt?: OrderRiskTimestampLike;
};

interface OrderRiskAnalysisCardProps {
  analysis?: OrderRiskAnalysisView;
  loading: boolean;
  running: boolean;
  onRun: () => Promise<void>;
  t: TFunction;
  i18n: i18n;
}

function getRecommendationPalette(
  recommendation?: OrderRiskRecommendation,
): "gray" | "orange" | "red" | "success" {
  if (recommendation === OrderRiskRecommendation.PROCEED) {
    return "success";
  }
  if (recommendation === OrderRiskRecommendation.REVIEW) {
    return "orange";
  }
  if (recommendation === OrderRiskRecommendation.HOLD) {
    return "red";
  }
  return "gray";
}

function getLevelPalette(
  level?: OrderRiskLevel,
): "gray" | "orange" | "red" | "success" {
  if (level === OrderRiskLevel.LOW) {
    return "success";
  }
  if (level === OrderRiskLevel.MEDIUM) {
    return "orange";
  }
  if (level === OrderRiskLevel.HIGH) {
    return "red";
  }
  return "gray";
}

function getSafeSignalLabel(signal: string, t: TFunction): string {
  const safeSignalLabels: Record<string, string> = {
    "Trusted prepaid payment method":
      "order.orderRisk.safeSignal.trustedPrepaidPaymentMethod",
    "Payment already confirmed":
      "order.orderRisk.safeSignal.paymentAlreadyConfirmed",
    "External source includes payment reference":
      "order.orderRisk.safeSignal.externalPaymentReference",
    "Customer profile is linked to the order":
      "order.orderRisk.safeSignal.linkedCustomerProfile",
  };

  const translationKey = safeSignalLabels[signal];
  if (!translationKey) {
    return signal;
  }

  return t(translationKey, { defaultValue: signal });
}

function getSkipReasonLabel(
  skipReason: OrderRiskSkipReason | undefined,
  t: TFunction,
): string {
  if (skipReason === OrderRiskSkipReason.EXISTING_CUSTOMER) {
    return t("order.orderRisk.skipReason.existingCustomer", {
      defaultValue:
        "Analysis is skipped for orders linked to an existing customer profile.",
    });
  }

  return t("order.orderRisk.skippedDescription", {
    defaultValue: "This order was skipped by the current analysis guard.",
  });
}

function formatAnalysisTimestamp(
  analysis: OrderRiskAnalysisView | undefined,
  locale: string,
): string | null {
  const rawTimestamp = analysis?.updatedAt ?? analysis?.createdAt;
  const date =
    typeof rawTimestamp === "number"
      ? new Date(rawTimestamp)
      : typeof rawTimestamp === "string"
        ? new Date(rawTimestamp)
        : rawTimestamp?.toDate?.();

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OrderRiskAnalysisCard({
  analysis,
  loading,
  running,
  onRun,
  t,
  i18n,
}: OrderRiskAnalysisCardProps) {
  const currentLanguage = (i18n.resolvedLanguage?.split("-")[0] ??
    DEFAULT_LOCALE) as Locale;
  const localizedContent =
    analysis?.localizedContent?.[currentLanguage] ??
    analysis?.localizedContent?.[DEFAULT_LOCALE];
  const formattedTimestamp = formatAnalysisTimestamp(
    analysis,
    i18n.resolvedLanguage ?? "en",
  );

  return (
    <Box border="1px solid" borderColor="gray.muted" borderRadius="3xl" p="8">
      <VStack align="stretch" gap={4}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <VStack align="start" gap={1}>
            <Text as="h2" fontSize="lg" fontWeight="bold">
              {t("order.orderRisk.title", {
                defaultValue: "Order risk analysis",
              })}
            </Text>
            <Text color="fg.muted" fontSize="sm">
              {t("order.orderRisk.description", {
                defaultValue:
                  "AI-assisted fraud and operational risk review for this order.",
              })}
            </Text>
          </VStack>
          <Button
            onClick={() => {
              void onRun();
            }}
            loading={running}
            colorPalette="primary"
            variant={"ai"}
          >
            <MaterialSymbol>scan_eye</MaterialSymbol>
            {analysis
              ? t("order.orderRisk.rerun", {
                  defaultValue: "Re-run analysis",
                })
              : t("order.orderRisk.run", {
                  defaultValue: "Run analysis",
                })}
          </Button>
        </HStack>

        {loading ? (
          <VStack align="stretch" gap={3}>
            <Skeleton h="5" />
            <Skeleton h="16" />
            <Skeleton h="10" />
          </VStack>
        ) : analysis === undefined ? (
          <Text color="fg.muted">
            {t("order.orderRisk.empty", {
              defaultValue:
                "No analysis has been generated yet. Run it manually or wait for an automatic run.",
            })}
          </Text>
        ) : analysis.status === OrderRiskAnalysisStatus.FAILED ? (
          <VStack align="stretch" gap={3}>
            <Badge colorPalette="red" w="fit-content">
              {t("order.orderRisk.failedBadge", { defaultValue: "Failed" })}
            </Badge>
            <Text color="fg.muted">
              {analysis.error ??
                t("order.orderRisk.failedDescription", {
                  defaultValue:
                    "The last analysis run failed before a result could be saved.",
                })}
            </Text>
          </VStack>
        ) : analysis.status === OrderRiskAnalysisStatus.SKIPPED ? (
          <VStack align="stretch" gap={3}>
            <Badge colorPalette="gray" w="fit-content">
              {t("order.orderRisk.skippedBadge", { defaultValue: "Skipped" })}
            </Badge>
            <Text color="fg.muted">
              {getSkipReasonLabel(analysis.skipReason, t)}
            </Text>
          </VStack>
        ) : analysis.status === OrderRiskAnalysisStatus.RUNNING ||
          analysis.status === OrderRiskAnalysisStatus.PENDING ? (
          <VStack align="stretch" gap={3}>
            <Badge colorPalette="orange" w="fit-content">
              {t("order.orderRisk.runningBadge", { defaultValue: "Running" })}
            </Badge>
            <Text color="fg.muted">
              {t("order.orderRisk.runningDescription", {
                defaultValue:
                  "A fresh analysis is in progress. The latest result will appear here automatically.",
              })}
            </Text>
          </VStack>
        ) : (
          <VStack align="stretch" gap={4}>
            <HStack gap={2} flexWrap="wrap">
              <Badge
                colorPalette={getRecommendationPalette(analysis.recommendation)}
              >
                {t(
                  `order.orderRisk.recommendation.${analysis.recommendation}`,
                  {
                    defaultValue: analysis.recommendation ?? "Unknown",
                  },
                )}
              </Badge>
              <Badge colorPalette={getLevelPalette(analysis.overallLevel)}>
                {t("order.orderRisk.overallScore", {
                  defaultValue: "Overall {{score}}/100",
                  score: analysis.overallScore ?? 0,
                })}
              </Badge>
            </HStack>

            <VStack align="stretch" gap={2}>
              <HStack justify="space-between" gap={3}>
                <Text color="fg.muted">
                  {t("order.orderRisk.fraudScore", {
                    defaultValue: "Fraud risk",
                  })}
                </Text>
                <HStack gap={2}>
                  <Badge colorPalette={getLevelPalette(analysis.fraudLevel)}>
                    {t(`order.orderRisk.level.${analysis.fraudLevel}`, {
                      defaultValue: analysis.fraudLevel ?? "Unknown",
                    })}
                  </Badge>
                  <Text fontWeight="semibold">
                    {analysis.fraudScore ?? 0}/100
                  </Text>
                </HStack>
              </HStack>
              <HStack justify="space-between" gap={3}>
                <Text color="fg.muted">
                  {t("order.orderRisk.operationalScore", {
                    defaultValue: "Operational risk",
                  })}
                </Text>
                <HStack gap={2}>
                  <Badge
                    colorPalette={getLevelPalette(analysis.operationalLevel)}
                  >
                    {t(`order.orderRisk.level.${analysis.operationalLevel}`, {
                      defaultValue: analysis.operationalLevel ?? "Unknown",
                    })}
                  </Badge>
                  <Text fontWeight="semibold">
                    {analysis.operationalScore ?? 0}/100
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            <Separator />

            <Collapsible.Root lazyMount>
              <Collapsible.Trigger asChild>
                <Button alignSelf="start" variant="outline" size="sm">
                  <Collapsible.Context>
                    {(api) =>
                      api.open
                        ? t("order.orderRisk.hideDetails", {
                            defaultValue: "Hide explanation",
                          })
                        : t("order.orderRisk.showDetails", {
                            defaultValue: "Show explanation",
                          })
                    }
                  </Collapsible.Context>
                  <Collapsible.Indicator
                    transition="transform 0.2s"
                    _open={{ transform: "rotate(180deg)" }}
                  >
                    <MaterialSymbol>expand_more</MaterialSymbol>
                  </Collapsible.Indicator>
                </Button>
              </Collapsible.Trigger>

              <Collapsible.Content>
                <VStack align="stretch" gap={4} pt={4}>
                  <VStack align="stretch" gap={2}>
                    <Text fontWeight="semibold">
                      {t("order.orderRisk.summaryLabel", {
                        defaultValue: "Summary",
                      })}
                    </Text>
                    <Text>{localizedContent?.summary ?? analysis.summary}</Text>
                  </VStack>

                  <VStack align="stretch" gap={2}>
                    <Text fontWeight="semibold">
                      {t("order.orderRisk.reasonsLabel", {
                        defaultValue: "Why it was marked",
                      })}
                    </Text>
                    <VStack align="stretch" gap={2}>
                      {(localizedContent?.reasons ?? analysis.reasons).map(
                        (reason) => (
                          <HStack key={reason} align="start" gap={2}>
                            <Text color="fg.muted">•</Text>
                            <Text>{reason}</Text>
                          </HStack>
                        ),
                      )}
                    </VStack>
                  </VStack>

                  {analysis.safeSignals.length > 0 && (
                    <VStack align="stretch" gap={2}>
                      <Text fontWeight="semibold">
                        {t("order.orderRisk.safeSignalsLabel", {
                          defaultValue: "Signals that lowered the risk",
                        })}
                      </Text>
                      <Text color="fg.muted">
                        {analysis.safeSignals
                          .map((signal) => getSafeSignalLabel(signal, t))
                          .join(" • ")}
                      </Text>
                    </VStack>
                  )}
                </VStack>
              </Collapsible.Content>
            </Collapsible.Root>

            <HStack justify="space-between" gap={3} flexWrap="wrap">
              <Text color="fg.muted" fontSize="sm">
                {formattedTimestamp
                  ? t("order.orderRisk.lastUpdated", {
                      defaultValue: "Last updated: {{date}}",
                      date: formattedTimestamp,
                    })
                  : t("order.orderRisk.noTimestamp", {
                      defaultValue: "Timestamp unavailable",
                    })}
              </Text>
              {analysis.model && (
                <Text color="fg.muted" fontSize="sm">
                  {t("order.orderRisk.model", {
                    defaultValue: "Model: {{model}}",
                    model: analysis.model,
                  })}
                </Text>
              )}
            </HStack>
          </VStack>
        )}
      </VStack>
    </Box>
  );
}
