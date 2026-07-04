"use client";

import {
  cancelExternalProductPriceFetchWorkflow,
  getExternalProductPriceFetchWorkflowStatus,
  startExternalProductPriceFetchWorkflow,
} from "@/actions/external-product-price-workflow";
import { updateExternalProductName } from "@/actions/external-products";
import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  HStack,
  Input,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import { getDuplicateInternalAttributeMappings } from "@/lib/external-products/attribute-mapping-validation";
import {
  getExpectedPricingConfigurationCount,
  getProviderOnlyPricingSelections,
  isAttributeMappingReady,
  isExternalAttributeSelectable,
} from "@/lib/external-products/provider-pricing";
import {
  ButtonLink,
  MaterialSymbol,
  toaster,
  Tooltip,
} from "@konfi/components";
import type {
  Attribute,
  ExternalProduct,
  ExternalProductPriceFetchStrategy,
  ExternalProductPriceFetchWorkflow,
} from "@konfi/types";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import AttributeMappingSection from "./AttributeMappingSection";
import { getExternalAttributeKey } from "./attributeMappingUtils";
import ExternalPriceInfoPreview from "./ExternalPriceInfoPreview";
import PriceFetchProgressPanel from "./PriceFetchProgressPanel";
import type { ExternalProductWithId, TranslateFn } from "./types";

type ExternalProductCardProps = {
  product: ExternalProductWithId;
  onDelete: (id: string) => void;
  onMappingsUpdated: () => void;
  onAttributesRefresh: () => void;
  internalAttributes: Attribute[];
  t: TranslateFn;
};

function getImportStatusLabel(
  status: ExternalProduct["importStatus"],
  t: TranslateFn,
): string {
  switch (status) {
    case "completed":
      return t("externalProducts.status.completed", {
        defaultValue: "Completed",
      });
    case "failed":
      return t("externalProducts.status.failed", {
        defaultValue: "Failed",
      });
    case "processing":
      return t("externalProducts.status.processing", {
        defaultValue: "Processing",
      });
    case "review-required":
      return t("externalProducts.status.reviewRequired", {
        defaultValue: "Review required",
      });
    case "pending":
    default:
      return t("externalProducts.status.pending", {
        defaultValue: "Pending",
      });
  }
}

type PriceFetchStage = {
  thresholdMs: number;
  titleKey: string;
  titleDefaultValue: string;
  descriptionKey: string;
  descriptionDefaultValue: string;
};

const PRICE_FETCH_STAGES: PriceFetchStage[] = [
  {
    thresholdMs: 0,
    titleKey: "externalProducts.priceFetchProgress.stages.queued.title",
    titleDefaultValue: "Queueing background workflow",
    descriptionKey:
      "externalProducts.priceFetchProgress.stages.queued.description",
    descriptionDefaultValue:
      "Starting the durable price-fetch workflow so it can continue in the background.",
  },
  {
    thresholdMs: 2_000,
    titleKey: "externalProducts.priceFetchProgress.stages.preparing.title",
    titleDefaultValue: "Preparing configurations",
    descriptionKey:
      "externalProducts.priceFetchProgress.stages.preparing.description",
    descriptionDefaultValue:
      "Counting provider configurations and preparing the request list.",
  },
  {
    thresholdMs: 10_000,
    titleKey: "externalProducts.priceFetchProgress.stages.fetching.title",
    titleDefaultValue: "Fetching provider prices",
    descriptionKey:
      "externalProducts.priceFetchProgress.stages.fetching.description",
    descriptionDefaultValue:
      "Requesting price data for each provider configuration.",
  },
  {
    thresholdMs: 20_000,
    titleKey: "externalProducts.priceFetchProgress.stages.extracting.title",
    titleDefaultValue: "Extracting price data",
    descriptionKey:
      "externalProducts.priceFetchProgress.stages.extracting.description",
    descriptionDefaultValue:
      "Parsing provider responses into Konfi price configurations.",
  },
  {
    thresholdMs: Number.POSITIVE_INFINITY,
    titleKey: "externalProducts.priceFetchProgress.stages.saving.title",
    titleDefaultValue: "Saving fetched prices",
    descriptionKey:
      "externalProducts.priceFetchProgress.stages.saving.description",
    descriptionDefaultValue:
      "Saving fetched price configurations back to the external product.",
  },
];

type PriceFetchWorkflowViewState = {
  fetchStrategy?: ExternalProductPriceFetchStrategy;
  runId: string;
  mode: "apply" | "stage";
  status: ExternalProductPriceFetchWorkflow["status"];
  startedAtMs: number | null;
  estimatedConfigurationCount?: number;
  fetchedConfigurationCount?: number;
};

function getTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const millis = value.toMillis();
    return typeof millis === "number" && Number.isFinite(millis)
      ? millis
      : null;
  }

  return null;
}

function normalizePriceFetchWorkflow(
  workflow?: ExternalProduct["priceFetchWorkflow"],
): PriceFetchWorkflowViewState | null {
  if (!workflow?.runId) {
    return null;
  }

  return {
    fetchStrategy: workflow.fetchStrategy ?? "reuse",
    runId: workflow.runId,
    mode: workflow.mode,
    status: workflow.status,
    startedAtMs: getTimestampMs(workflow.startedAt),
    estimatedConfigurationCount: workflow.estimatedConfigurationCount,
    fetchedConfigurationCount: workflow.fetchedConfigurationCount,
  };
}

function isActivePriceFetchWorkflow(
  workflow: PriceFetchWorkflowViewState | null,
): boolean {
  return workflow?.status === "pending" || workflow?.status === "running";
}

function arePersistedMappingsReady(product: ExternalProductWithId): boolean {
  const attributes = product.attributes ?? [];

  if (attributes.length === 0) {
    return true;
  }

  const mappings = product.attributeMappings ?? [];
  if (getDuplicateInternalAttributeMappings(mappings).length > 0) {
    return false;
  }

  return attributes.every((attribute) => {
    if (!isExternalAttributeSelectable(attribute)) {
      return true;
    }

    const attributeKey = getExternalAttributeKey(attribute);
    const mapping = mappings.find(
      (item) =>
        item.externalAttributeName === attributeKey ||
        item.externalAttributeName === attribute.name,
    );

    return mapping ? isAttributeMappingReady(mapping) : false;
  });
}

const ExternalProductCard = memo(function ExternalProductCard({
  product,
  onDelete,
  onMappingsUpdated,
  onAttributesRefresh,
  internalAttributes,
  t,
}: ExternalProductCardProps) {
  const [startingPriceFetchWorkflow, setStartingPriceFetchWorkflow] =
    useState(false);
  const [cancellingPriceFetchWorkflow, setCancellingPriceFetchWorkflow] =
    useState(false);
  const [fetchStrategy, setFetchStrategy] =
    useState<ExternalProductPriceFetchStrategy>(
      product.priceFetchWorkflow?.fetchStrategy ?? "reuse",
    );
  const [marginPercent, setMarginPercent] = useState<string>(
    product.priceMarginPercent?.toString() ?? "0",
  );
  const [taxPercent, setTaxPercent] = useState<string>(
    product.priceTaxPercent?.toString() ?? "0",
  );
  const [discountPercent, setDiscountPercent] = useState<string>(
    product.priceDiscountPercent?.toString() ?? "0",
  );
  const [editableName, setEditableName] = useState(product.originalName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [hasPrices, setHasPrices] = useState(
    Boolean(
      product.priceConfigurations?.length ||
      product.priceConfigurationsCount ||
      product.priceInfo?.priceRanges?.length,
    ),
  );
  const persistedMappingsReady = useMemo(
    () => arePersistedMappingsReady(product),
    [product],
  );
  const [allAttributesMapped, setAllAttributesMapped] = useState(
    persistedMappingsReady,
  );
  const [activePriceFetchWorkflow, setActivePriceFetchWorkflow] =
    useState<PriceFetchWorkflowViewState | null>(
      normalizePriceFetchWorkflow(product.priceFetchWorkflow),
    );
  const [priceFetchElapsedSeconds, setPriceFetchElapsedSeconds] = useState(0);
  const [lastFetchedConfigurationCount, setLastFetchedConfigurationCount] =
    useState(
      product.priceConfigurations?.length ??
        product.priceConfigurationsCount ??
        0,
    );
  const [lastHandledWorkflowRunId, setLastHandledWorkflowRunId] = useState<
    string | null
  >(null);

  const persistedPriceFetchWorkflow = useMemo(
    () => normalizePriceFetchWorkflow(product.priceFetchWorkflow),
    [product.priceFetchWorkflow],
  );

  useEffect(() => {
    setAllAttributesMapped(persistedMappingsReady);
  }, [persistedMappingsReady]);

  useEffect(() => {
    setEditableName(product.originalName ?? "");
  }, [product.originalName]);

  useEffect(() => {
    setHasPrices(
      Boolean(
        product.priceConfigurations?.length ||
        product.priceConfigurationsCount ||
        product.priceInfo?.priceRanges?.length,
      ),
    );
    setLastFetchedConfigurationCount(
      product.priceConfigurations?.length ??
        product.priceConfigurationsCount ??
        0,
    );
  }, [
    product.priceConfigurations,
    product.priceConfigurationsCount,
    product.priceInfo?.priceRanges,
  ]);

  useEffect(() => {
    if (!persistedPriceFetchWorkflow) {
      return;
    }

    if (persistedPriceFetchWorkflow.fetchStrategy) {
      setFetchStrategy(persistedPriceFetchWorkflow.fetchStrategy);
    }

    setActivePriceFetchWorkflow((currentWorkflow) => {
      if (
        !currentWorkflow ||
        currentWorkflow.runId !== persistedPriceFetchWorkflow.runId
      ) {
        return persistedPriceFetchWorkflow;
      }

      return {
        ...currentWorkflow,
        ...persistedPriceFetchWorkflow,
        startedAtMs:
          currentWorkflow.startedAtMs ??
          persistedPriceFetchWorkflow.startedAtMs,
      };
    });
  }, [persistedPriceFetchWorkflow]);

  const isPriceFetchWorkflowActive = isActivePriceFetchWorkflow(
    activePriceFetchWorkflow,
  );

  useEffect(() => {
    if (!isPriceFetchWorkflowActive || !activePriceFetchWorkflow?.startedAtMs) {
      setPriceFetchElapsedSeconds(0);
      return;
    }

    const startedAtMs = activePriceFetchWorkflow.startedAtMs;

    const updateElapsed = () => {
      setPriceFetchElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
      );
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activePriceFetchWorkflow?.startedAtMs, isPriceFetchWorkflowActive]);

  const importStatusLabel = getImportStatusLabel(product.importStatus, t);
  const canViewProduct = Boolean(product.imported && product.productId);
  const productEditHref = product.productId
    ? `/catalog/products/edit/${product.productId}`
    : "/catalog/products";

  const createProductHref = `/catalog/products/create?externalProductId=${product.id}`;
  const fixedProviderPricingSelections = useMemo(
    () => getProviderOnlyPricingSelections(product.attributeMappings),
    [product.attributeMappings],
  );
  const estimatedConfigurationCount = useMemo(() => {
    const count = getExpectedPricingConfigurationCount({
      externalAttributes: product.attributes ?? [],
      attributeMappings: product.attributeMappings,
      configurationParams: product.pricingSelection?.configurationParams,
      fixedSelections: fixedProviderPricingSelections,
    });

    return count > 0 ? count : 1;
  }, [
    product.attributeMappings,
    fixedProviderPricingSelections,
    product.attributes,
    product.pricingSelection?.configurationParams,
  ]);
  const displayedEstimatedConfigurationCount =
    activePriceFetchWorkflow?.estimatedConfigurationCount ??
    estimatedConfigurationCount;
  const priceFetchModeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("externalProducts.priceFetchModeReuse", {
              defaultValue: "Fetch missing only",
            }),
            value: "reuse",
          },
          {
            label: t("externalProducts.priceFetchModeFull", {
              defaultValue: "Refetch everything",
            }),
            value: "full",
          },
        ],
      }),
    [t],
  );
  const currentPriceFetchStage = useMemo(() => {
    if (activePriceFetchWorkflow?.status === "pending") {
      return PRICE_FETCH_STAGES[0];
    }

    const elapsedMs = priceFetchElapsedSeconds * 1000;
    const timedStages = PRICE_FETCH_STAGES.slice(1);
    const index = timedStages.findIndex(
      (stage) => elapsedMs < stage.thresholdMs,
    );
    return timedStages[index === -1 ? timedStages.length - 1 : index];
  }, [activePriceFetchWorkflow?.status, priceFetchElapsedSeconds]);

  const handleDelete = useCallback(() => {
    onDelete(product.id);
  }, [onDelete, product.id]);

  const handleSaveName = useCallback(async () => {
    const trimmedName = editableName.trim();

    if (!trimmedName) {
      toaster.create({
        title: t("externalProducts.nameRequired", {
          defaultValue: "Product name is required",
        }),
        type: "error",
      });
      return;
    }

    if (trimmedName === product.originalName) {
      return;
    }

    setSavingName(true);

    try {
      const result = await updateExternalProductName(product.id, trimmedName);

      if (!result.success) {
        toaster.create({
          title: t("externalProducts.saveNameFailed", {
            defaultValue: "Failed to update product name",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      toaster.create({
        title: t("externalProducts.saveNameSuccess", {
          defaultValue: "Product name updated",
        }),
        type: "success",
      });

      await onMappingsUpdated();
    } catch (error) {
      console.error("Error updating external product name:", error);
      toaster.create({
        title: t("externalProducts.saveNameFailed", {
          defaultValue: "Failed to update product name",
        }),
        type: "error",
      });
    } finally {
      setSavingName(false);
    }
  }, [editableName, onMappingsUpdated, product.id, product.originalName, t]);

  const handleFetchPrices = useCallback(async () => {
    setStartingPriceFetchWorkflow(true);

    try {
      const margin = parseFloat(marginPercent) || 0;
      const tax = parseFloat(taxPercent) || 0;
      const discount = parseFloat(discountPercent) || 0;
      const result = await startExternalProductPriceFetchWorkflow({
        externalProductId: product.id,
        mode: "apply",
        marginPercent: margin,
        taxPercent: tax,
        discountPercent: discount,
        fetchStrategy,
      });

      if (!result.success || !result.runId) {
        toaster.create({
          title: t("externalProducts.fetchPricesFailed", {
            defaultValue: "Failed to fetch prices",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      setActivePriceFetchWorkflow({
        fetchStrategy: result.fetchStrategy ?? fetchStrategy,
        runId: result.runId,
        mode: "apply",
        status: "pending",
        startedAtMs: Date.now(),
        estimatedConfigurationCount:
          result.estimatedConfigurationCount ?? estimatedConfigurationCount,
        fetchedConfigurationCount: lastFetchedConfigurationCount,
      });
      setFetchStrategy(result.fetchStrategy ?? fetchStrategy);
      await onMappingsUpdated();

      toaster.create({
        title: result.alreadyRunning
          ? t("externalProducts.fetchPricesAlreadyRunning", {
              defaultValue: "Price fetch already running",
            })
          : t("externalProducts.fetchPricesStarted", {
              defaultValue: "Price fetch started",
            }),
        description: result.alreadyRunning
          ? t("externalProducts.fetchPricesAlreadyRunningDescription", {
              defaultValue:
                "The background workflow is still fetching supplier prices for this product.",
            })
          : t("externalProducts.fetchPricesStartedDescription", {
              defaultValue:
                "Fetching prices in the background. You can leave this page and come back later.",
            }),
        type: "success",
      });
    } catch (error) {
      console.error("Error starting price fetch workflow:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        type: "error",
      });
    } finally {
      setStartingPriceFetchWorkflow(false);
    }
  }, [
    estimatedConfigurationCount,
    fetchStrategy,
    discountPercent,
    lastFetchedConfigurationCount,
    marginPercent,
    onMappingsUpdated,
    product.id,
    t,
    taxPercent,
  ]);

  const handleCancelPriceFetch = useCallback(async () => {
    const runId = activePriceFetchWorkflow?.runId;

    if (!runId) {
      return;
    }

    setCancellingPriceFetchWorkflow(true);

    try {
      const result = await cancelExternalProductPriceFetchWorkflow(
        product.id,
        runId,
      );

      if (!result.success) {
        toaster.create({
          title: t("externalProducts.cancelPriceFetchFailed", {
            defaultValue: "Failed to cancel price fetch",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      if (result.status === "cancelled") {
        setActivePriceFetchWorkflow((currentWorkflow) =>
          currentWorkflow && currentWorkflow.runId === runId
            ? { ...currentWorkflow, status: "cancelled" }
            : currentWorkflow,
        );

        if (lastHandledWorkflowRunId !== runId) {
          setLastHandledWorkflowRunId(runId);
          toaster.create({
            title: t("externalProducts.fetchPricesCancelled", {
              defaultValue: "Price fetch cancelled",
            }),
            description: t("externalProducts.fetchPricesCancelledDescription", {
              defaultValue:
                "The background price fetch has been cancelled. You can start it again whenever you're ready.",
            }),
            type: "info",
          });
        }
      }

      await onMappingsUpdated();
    } catch (error) {
      console.error("Error cancelling price fetch workflow:", error);
      toaster.create({
        title: t("externalProducts.cancelPriceFetchFailed", {
          defaultValue: "Failed to cancel price fetch",
        }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
        type: "error",
      });
    } finally {
      setCancellingPriceFetchWorkflow(false);
    }
  }, [
    activePriceFetchWorkflow?.runId,
    lastHandledWorkflowRunId,
    onMappingsUpdated,
    product.id,
    t,
  ]);

  useEffect(() => {
    if (!activePriceFetchWorkflow?.runId || !isPriceFetchWorkflowActive) {
      return;
    }

    let cancelled = false;
    let polling = false;

    const pollWorkflowStatus = async () => {
      if (polling) {
        return;
      }

      polling = true;

      try {
        const status = await getExternalProductPriceFetchWorkflowStatus(
          product.id,
          activePriceFetchWorkflow.runId,
        );

        if (cancelled) {
          return;
        }

        if (status.status === "completed") {
          setActivePriceFetchWorkflow((currentWorkflow) =>
            currentWorkflow &&
            currentWorkflow.runId === activePriceFetchWorkflow.runId
              ? {
                  ...currentWorkflow,
                  status: "completed",
                  fetchedConfigurationCount:
                    status.result.fetchedConfigurationCount,
                }
              : currentWorkflow,
          );
          setHasPrices(true);
          setLastFetchedConfigurationCount(
            status.result.fetchedConfigurationCount,
          );

          if (lastHandledWorkflowRunId !== activePriceFetchWorkflow.runId) {
            setLastHandledWorkflowRunId(activePriceFetchWorkflow.runId);
            toaster.create({
              title: t("externalProducts.fetchPricesSuccess", {
                defaultValue: "Prices fetched",
              }),
              description: t("externalProducts.fetchPricesSuccessDescription", {
                defaultValue: "{{count}} price configurations fetched",
                count: status.result.fetchedConfigurationCount,
              }),
              type: "success",
            });
          }

          await onMappingsUpdated();
          return;
        }

        if (status.status === "failed") {
          setActivePriceFetchWorkflow((currentWorkflow) =>
            currentWorkflow &&
            currentWorkflow.runId === activePriceFetchWorkflow.runId
              ? { ...currentWorkflow, status: "failed" }
              : currentWorkflow,
          );

          if (lastHandledWorkflowRunId !== activePriceFetchWorkflow.runId) {
            setLastHandledWorkflowRunId(activePriceFetchWorkflow.runId);
            toaster.create({
              title: t("externalProducts.fetchPricesFailed", {
                defaultValue: "Failed to fetch prices",
              }),
              description: status.error,
              type: "error",
            });
          }

          await onMappingsUpdated();
          return;
        }

        if (status.status === "cancelled") {
          setActivePriceFetchWorkflow((currentWorkflow) =>
            currentWorkflow &&
            currentWorkflow.runId === activePriceFetchWorkflow.runId
              ? { ...currentWorkflow, status: "cancelled" }
              : currentWorkflow,
          );

          if (lastHandledWorkflowRunId !== activePriceFetchWorkflow.runId) {
            setLastHandledWorkflowRunId(activePriceFetchWorkflow.runId);
            toaster.create({
              title: t("externalProducts.fetchPricesCancelled", {
                defaultValue: "Price fetch cancelled",
              }),
              description: t(
                "externalProducts.fetchPricesCancelledDescription",
                {
                  defaultValue:
                    "The background price fetch has been cancelled. You can start it again whenever you're ready.",
                },
              ),
              type: "info",
            });
          }

          await onMappingsUpdated();
          return;
        }

        setActivePriceFetchWorkflow((currentWorkflow) =>
          currentWorkflow &&
          currentWorkflow.runId === activePriceFetchWorkflow.runId
            ? { ...currentWorkflow, status: status.status }
            : currentWorkflow,
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Error polling price fetch workflow:", error);
        }
      } finally {
        polling = false;
      }
    };

    void pollWorkflowStatus();
    const intervalId = window.setInterval(() => {
      void pollWorkflowStatus();
    }, 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activePriceFetchWorkflow?.runId,
    isPriceFetchWorkflowActive,
    lastHandledWorkflowRunId,
    onMappingsUpdated,
    product.id,
    t,
  ]);
  return (
    <Card.Root variant="outline">
      <Card.Body>
        <VStack gap={3} alignItems="stretch">
          {isPriceFetchWorkflowActive ? (
            <PriceFetchProgressPanel
              estimatedConfigurationCount={displayedEstimatedConfigurationCount}
              fetchedConfigurationCount={lastFetchedConfigurationCount}
              fetchingPrices={isPriceFetchWorkflowActive}
              elapsedSeconds={priceFetchElapsedSeconds}
              currentStageTitle={t(currentPriceFetchStage.titleKey, {
                defaultValue: currentPriceFetchStage.titleDefaultValue,
              })}
              currentStageDescription={t(
                currentPriceFetchStage.descriptionKey,
                {
                  defaultValue: currentPriceFetchStage.descriptionDefaultValue,
                },
              )}
              t={t}
            />
          ) : null}

          <HStack justifyContent="space-between">
            <VStack alignItems="flex-start" gap={1}>
              <HStack gap={2} alignItems="flex-start" flexWrap="wrap">
                <Input
                  size="sm"
                  value={editableName}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setEditableName(event.target.value)
                  }
                  onBlur={() => {
                    if (editableName.trim() !== product.originalName) {
                      void handleSaveName();
                    }
                  }}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveName();
                    }
                  }}
                  placeholder={t("externalProducts.namePlaceholder", {
                    defaultValue: "External product name",
                  })}
                  aria-label={t("externalProducts.nameLabel", {
                    defaultValue: "Product name",
                  })}
                  fontWeight="bold"
                  minW="xs"
                  maxW="md"
                  disabled={savingName}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleSaveName()}
                  loading={savingName}
                  disabled={
                    savingName || editableName.trim() === product.originalName
                  }
                >
                  {t("common.save", {
                    defaultValue: "Save",
                  })}
                </Button>
              </HStack>
              <HStack gap={2}>
                <Badge
                  colorPalette={
                    product.importStatus === "completed"
                      ? "success"
                      : product.importStatus === "failed"
                        ? "red"
                        : "primary"
                  }
                >
                  {importStatusLabel}
                </Badge>
                {hasPrices ? (
                  <Badge colorPalette="success">
                    {t("externalProducts.hasPricesCount", {
                      defaultValue: "{{count}} prices",
                      count: lastFetchedConfigurationCount,
                    })}
                  </Badge>
                ) : (
                  <Badge colorPalette="orange">
                    {t("externalProducts.noPrices", {
                      defaultValue: "No prices",
                    })}
                  </Badge>
                )}
                <Text fontSize="sm" color="gray.500">
                  {product.attributes?.length || 0}{" "}
                  {t("externalProducts.attributes", {
                    defaultValue: "attributes",
                  })}
                </Text>
              </HStack>
            </VStack>

            <HStack gap={2}>
              {!product.imported && (
                <>
                  <HStack gap={1} flexWrap="wrap">
                    <Tooltip
                      content={t("externalProducts.discountTooltip", {
                        defaultValue:
                          "Subtract discount percentage from fetched prices before tax",
                      })}
                    >
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        width="70px"
                        value={discountPercent}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setDiscountPercent(e.target.value)
                        }
                        placeholder="0"
                      />
                    </Tooltip>
                    <Text fontSize="sm" color="gray.500" mr={2}>
                      {t("externalProducts.discountLabel", {
                        defaultValue: "% discount",
                      })}
                    </Text>
                    <Tooltip
                      content={t("externalProducts.taxTooltip", {
                        defaultValue: "Add tax percentage after discount",
                      })}
                    >
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        width="70px"
                        value={taxPercent}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setTaxPercent(e.target.value)
                        }
                        placeholder="0"
                      />
                    </Tooltip>
                    <Text fontSize="sm" color="gray.500" mr={2}>
                      {t("externalProducts.taxLabel", {
                        defaultValue: "% tax",
                      })}
                    </Text>
                    <Tooltip
                      content={t("externalProducts.marginTooltip", {
                        defaultValue: "Add margin percentage to fetched prices",
                      })}
                    >
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        width="70px"
                        value={marginPercent}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setMarginPercent(e.target.value)
                        }
                        placeholder="0"
                      />
                    </Tooltip>
                    <Text fontSize="sm" color="gray.500" mr={2}>
                      {t("externalProducts.marginLabel", {
                        defaultValue: "% margin",
                      })}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {t("externalProducts.priceFetchModeLabel", {
                        defaultValue: "Fetch mode",
                      })}
                    </Text>
                    <Box display="inline-block" flexShrink={0}>
                      <Select.Root
                        size="sm"
                        collection={priceFetchModeCollection}
                        value={[fetchStrategy]}
                        positioning={{ sameWidth: true }}
                        onValueChange={({ value }) => {
                          const nextValue = value[0];
                          setFetchStrategy(
                            nextValue === "full" ? "full" : "reuse",
                          );
                        }}
                        disabled={
                          isPriceFetchWorkflowActive ||
                          startingPriceFetchWorkflow ||
                          cancellingPriceFetchWorkflow
                        }
                      >
                        <Select.HiddenSelect name="price-fetch-mode" />
                        <Select.Control width="220px">
                          <Select.Trigger
                            aria-label={t(
                              "externalProducts.priceFetchModeLabel",
                              {
                                defaultValue: "Fetch mode",
                              },
                            )}
                          >
                            <Select.ValueText />
                          </Select.Trigger>
                          <Select.IndicatorGroup>
                            <Select.Indicator />
                          </Select.IndicatorGroup>
                        </Select.Control>
                        <Portal>
                          <Select.Positioner>
                            <Select.Content>
                              {priceFetchModeCollection.items.map((item) => (
                                <Select.Item key={item.value} item={item}>
                                  {item.label}
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Portal>
                      </Select.Root>
                    </Box>
                    <Button
                      size="sm"
                      colorPalette={isPriceFetchWorkflowActive ? "red" : "blue"}
                      variant="outline"
                      onClick={
                        isPriceFetchWorkflowActive
                          ? handleCancelPriceFetch
                          : handleFetchPrices
                      }
                      loading={
                        isPriceFetchWorkflowActive
                          ? cancellingPriceFetchWorkflow
                          : startingPriceFetchWorkflow
                      }
                      disabled={
                        isPriceFetchWorkflowActive
                          ? cancellingPriceFetchWorkflow
                          : startingPriceFetchWorkflow ||
                            cancellingPriceFetchWorkflow
                      }
                    >
                      <MaterialSymbol>
                        {isPriceFetchWorkflowActive ? "close" : "attach_money"}
                      </MaterialSymbol>
                      {isPriceFetchWorkflowActive
                        ? t("externalProducts.cancelPriceFetch", {
                            defaultValue: "Cancel price fetch",
                          })
                        : t("externalProducts.fetchPrices", {
                            defaultValue: "Fetch Prices",
                          })}
                    </Button>
                  </HStack>

                  <Tooltip
                    content={
                      !allAttributesMapped
                        ? t("externalProducts.mappingRequired", {
                            defaultValue:
                              "Resolve every attribute before creating the product. Supplier attributes can be mapped, used for provider pricing only, or ignored.",
                          })
                        : undefined
                    }
                    disabled={allAttributesMapped}
                  >
                    <ButtonLink
                      size="sm"
                      colorPalette="success"
                      href={createProductHref}
                      ariaLabel={t("externalProducts.createProduct", {
                        defaultValue: "Create Product",
                      })}
                      disabled={!allAttributesMapped}
                    >
                      {t("externalProducts.createProduct", {
                        defaultValue: "Create Product",
                      })}
                    </ButtonLink>
                  </Tooltip>
                </>
              )}

              {canViewProduct && (
                <ButtonLink
                  size="sm"
                  colorPalette="primary"
                  href={productEditHref}
                  ariaLabel={t("externalProducts.viewProduct", {
                    defaultValue: "View",
                  })}
                >
                  {t("externalProducts.viewProduct", {
                    defaultValue: "View",
                  })}
                </ButtonLink>
              )}

              <Button
                size="sm"
                colorPalette="red"
                variant="ghost"
                onClick={handleDelete}
              >
                {t("common.delete", { defaultValue: "Delete" })}
              </Button>
            </HStack>
          </HStack>

          <ExternalPriceInfoPreview priceInfo={product.priceInfo} t={t} />

          <AttributeMappingSection
            product={product}
            onMappingsUpdated={onMappingsUpdated}
            onAttributesRefresh={onAttributesRefresh}
            internalAttributes={internalAttributes}
            onAllMappedChange={setAllAttributesMapped}
            t={t}
          />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
});

export default ExternalProductCard;
