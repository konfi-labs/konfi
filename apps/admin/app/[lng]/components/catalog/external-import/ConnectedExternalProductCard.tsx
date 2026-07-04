"use client";

import {
  applyExternalProductPendingPrices,
  connectProductToExternalProduct,
  getExternalImportConnectionForProduct,
  getExternalProductImportDraft,
  getExternalProductById,
  listExternalProducts,
  updateExternalProductDeliveryTimeExtraDay,
} from "@/actions/external-products";
import type { ProductPreviewControls } from "@/components/catalog/ProductForm";
import {
  cancelExternalProductPriceFetchWorkflow,
  getExternalProductPriceFetchWorkflowStatus,
  startExternalProductPriceFetchWorkflow,
} from "@/actions/external-product-price-workflow";
import { useT } from "@/i18n/client";
import {
  isAttributeMappingReady,
  isExternalAttributeSelectable,
} from "@/lib/external-products/provider-pricing";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import { getExternalAttributeKey } from "./attributeMappingUtils";
import {
  Alert,
  Badge,
  Button,
  Card,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol, toaster } from "@konfi/components";
import type {
  Attribute,
  ExternalProductPriceFetchStrategy,
  Product,
} from "@konfi/types";
import { ADMIN_CATALOG_IMPORT } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import AttributeMappingSection from "./AttributeMappingSection";
import ConnectedExternalProductPricePanel from "./ConnectedExternalProductPricePanel";
import ConnectedExternalProductSelectionDialog from "./ConnectedExternalProductSelectionDialog";
import ConnectedExternalProductSyncConfirmationDialog from "./ConnectedExternalProductSyncConfirmationDialog";
import ExternalPriceInfoPreview from "./ExternalPriceInfoPreview";
import type { ExternalProductWithId } from "./types";

type ConnectedExternalProductCardProps = {
  channelId: string;
  formControls?: ProductPreviewControls | null;
  product: Product;
  internalAttributes: Attribute[];
};

function isActiveExternalPriceWorkflow(workflow?: { status?: string }) {
  return workflow?.status === "pending" || workflow?.status === "running";
}

export default function ConnectedExternalProductCard({
  channelId,
  formControls,
  product,
  internalAttributes,
}: ConnectedExternalProductCardProps) {
  const { t, i18n } = useT(["externalProducts", "translation"]);
  const { refreshAttributes } = useConfiguration();
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [confirmSyncImportOpen, setConfirmSyncImportOpen] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectingExternalProductId, setConnectingExternalProductId] =
    useState<string | null>(null);
  const [refreshMarginPercent, setRefreshMarginPercent] = useState("0");
  const [refreshTaxPercent, setRefreshTaxPercent] = useState("0");
  const [refreshDiscountPercent, setRefreshDiscountPercent] = useState("0");
  const [deliveryTimeExtraDay, setDeliveryTimeExtraDay] = useState(false);
  const [refreshFetchStrategy, setRefreshFetchStrategy] =
    useState<ExternalProductPriceFetchStrategy>("reuse");
  const [startingExternalPriceWorkflow, setStartingExternalPriceWorkflow] =
    useState(false);
  const [cancellingExternalPriceWorkflow, setCancellingExternalPriceWorkflow] =
    useState(false);
  const [isApplyingPendingExternalPrices, setIsApplyingPendingExternalPrices] =
    useState(false);
  const [importMode, setImportMode] = useState<
    "prices" | "prices-and-attributes" | null
  >(null);
  const [draftAllAttributesMapped, setDraftAllAttributesMapped] = useState<
    boolean | null
  >(null);
  const [
    lastHandledExternalPriceWorkflowRunId,
    setLastHandledExternalPriceWorkflowRunId,
  ] = useState<string | null>(null);

  const { data: externalImportConnectionData, mutate: mutateConnectionData } =
    useSWR(
      ["external-import-connection", channelId, product.id],
      ([, currentChannelId, productId]) =>
        getExternalImportConnectionForProduct(currentChannelId, productId),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    );

  const externalProductId =
    externalImportConnectionData?.connection?.externalProductId ?? null;

  const { data: externalProductData, mutate: mutateExternalProductData } =
    useSWR(
      externalProductId ? ["external-product-by-id", externalProductId] : null,
      ([, currentExternalProductId]) =>
        getExternalProductById(currentExternalProductId),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    );

  const { data: externalProductsData, isLoading: externalProductsLoading } =
    useSWR(
      connectionDialogOpen ? ["external-products-for-connection"] : null,
      () => listExternalProducts(),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    );

  const externalProduct = externalProductData?.externalProduct;
  const externalPriceFetchWorkflow = externalProduct?.priceFetchWorkflow;
  const isExternalPriceFetchWorkflowActive = isActiveExternalPriceWorkflow(
    externalPriceFetchWorkflow,
  );
  const pendingPriceConfigurationsCount =
    externalProduct?.pendingPriceConfigurationsCount ??
    externalProduct?.pendingPriceConfigurations?.length ??
    0;
  const hasExternalPrices = Boolean(
    (externalProduct?.priceConfigurationsCount ??
      externalProduct?.priceConfigurations?.length) ||
    externalProduct?.priceInfo?.priceRanges?.length,
  );
  const selectableExternalAttributes = useMemo(
    () =>
      (externalProduct?.attributes ?? []).filter((attribute) =>
        isExternalAttributeSelectable(attribute),
      ),
    [externalProduct?.attributes],
  );
  const readyMappingCount = useMemo(() => {
    const mappingsByKey = new Map(
      (externalProduct?.attributeMappings ?? []).map((mapping) => [
        mapping.externalAttributeName,
        mapping,
      ]),
    );

    return selectableExternalAttributes.reduce((count, attribute) => {
      const key = getExternalAttributeKey(attribute);
      const mapping =
        mappingsByKey.get(key) ?? mappingsByKey.get(attribute.name);

      return count + (mapping && isAttributeMappingReady(mapping) ? 1 : 0);
    }, 0);
  }, [externalProduct?.attributeMappings, selectableExternalAttributes]);
  const totalSelectableAttributes = selectableExternalAttributes.length;
  const savedAllAttributesMapped =
    totalSelectableAttributes === 0 ||
    readyMappingCount === totalSelectableAttributes;
  const allAttributesMapped =
    draftAllAttributesMapped ?? savedAllAttributesMapped;
  const hasPendingPriceReview = pendingPriceConfigurationsCount > 0;
  const mappingStatusLabel =
    totalSelectableAttributes > 0
      ? t("externalProducts.mappingStatusProgress", {
          defaultValue: "{{count}}/{{total}} mapped",
          count: readyMappingCount,
          total: totalSelectableAttributes,
        })
      : t("externalProducts.mappingStatusNoAttributes", {
          defaultValue: "No attributes to map",
        });
  const priceStatusLabel = isExternalPriceFetchWorkflowActive
    ? t("externalProducts.priceStatusRefreshing", {
        defaultValue: "Refreshing prices…",
      })
    : hasPendingPriceReview
      ? t("externalProducts.priceStatusPendingReview", {
          defaultValue: "Pending review",
        })
      : hasExternalPrices
        ? t("externalProducts.priceStatusReady", {
            defaultValue: "Ready to import",
          })
        : t("externalProducts.priceStatusMissing", {
            defaultValue: "No applied prices",
          });
  const importDisabledReason = isExternalPriceFetchWorkflowActive
    ? t("externalProducts.importPricesWhileRefreshing", {
        defaultValue: "Wait until the price refresh finishes before importing.",
      })
    : hasPendingPriceReview
      ? t("externalProducts.importPricesApplyPendingFirst", {
          defaultValue:
            "Apply pending supplier prices before importing them into this product.",
        })
      : !allAttributesMapped
        ? t("externalProducts.mappingRequired", {
            defaultValue:
              "Resolve every attribute before creating the product. Supplier attributes can be mapped, used for provider pricing only, or ignored.",
          })
        : !hasExternalPrices
          ? t("externalProducts.importPricesUnavailable", {
              defaultValue:
                "Fetch and apply supplier prices before importing them into this product.",
            })
          : undefined;
  const formImportDisabledReason =
    !formControls?.applyExternalImportDraft ||
    !formControls?.getExternalImportTargetState
      ? t("externalProducts.formDraftNotReady", {
          defaultValue:
            "Wait for the product form to finish loading before staging external changes.",
        })
      : undefined;
  const combinedImportDisabledReason =
    importDisabledReason ?? formImportDisabledReason;
  const readinessAlert = useMemo(() => {
    if (isExternalPriceFetchWorkflowActive) {
      return {
        description: t("externalProducts.refreshInProgressAlertDescription", {
          defaultValue:
            "The background workflow is still fetching supplier prices. Import will be available when it finishes.",
        }),
        status: "info" as const,
        title: t("externalProducts.refreshInProgressAlertTitle", {
          defaultValue: "Refreshing supplier prices…",
        }),
      };
    }

    if (hasPendingPriceReview) {
      return {
        description: t("externalProducts.pendingReviewAlertDescription", {
          defaultValue:
            "{{count}} supplier price configurations are waiting. Apply them before importing prices into this product.",
          count: pendingPriceConfigurationsCount,
        }),
        status: "warning" as const,
        title: t("externalProducts.pendingReviewAlertTitle", {
          defaultValue: "Pending supplier prices are ready for review",
        }),
      };
    }

    if (!allAttributesMapped && totalSelectableAttributes > 0) {
      return {
        description: t("externalProducts.mappingAlertDescription", {
          defaultValue:
            "Review and save every supplier attribute mapping before importing prices into this product. Each attribute can be mapped, kept for supplier pricing only, or ignored.",
        }),
        status: "warning" as const,
        title: t("externalProducts.mappingAlertTitle", {
          defaultValue: "Complete attribute mapping",
        }),
      };
    }

    if (!hasExternalPrices) {
      return {
        description: t("externalProducts.noAppliedPricesAlertDescription", {
          defaultValue:
            "Refresh supplier prices, review them, and apply them before importing prices into this product.",
        }),
        status: "info" as const,
        title: t("externalProducts.noAppliedPricesAlertTitle", {
          defaultValue: "No applied supplier prices yet",
        }),
      };
    }

    return null;
  }, [
    allAttributesMapped,
    hasExternalPrices,
    hasPendingPriceReview,
    isExternalPriceFetchWorkflowActive,
    pendingPriceConfigurationsCount,
    t,
    totalSelectableAttributes,
  ]);
  const filteredExternalProducts = useMemo(() => {
    const products =
      (externalProductsData?.products as ExternalProductWithId[] | undefined) ??
      [];
    const normalizedSearch = connectionSearch.trim();

    if (!normalizedSearch) {
      return [...products].sort((left, right) => {
        const leftConnectedRank = left.id === externalProductId ? 0 : 1;
        const rightConnectedRank = right.id === externalProductId ? 0 : 1;

        if (leftConnectedRank !== rightConnectedRank) {
          return leftConnectedRank - rightConnectedRank;
        }

        const leftHasPrices =
          (left.priceConfigurationsCount ?? left.priceConfigurations?.length) ||
          left.priceInfo?.priceRanges?.length
            ? 0
            : 1;
        const rightHasPrices =
          (right.priceConfigurationsCount ??
            right.priceConfigurations?.length) ||
          right.priceInfo?.priceRanges?.length
            ? 0
            : 1;

        if (leftHasPrices !== rightHasPrices) {
          return leftHasPrices - rightHasPrices;
        }

        return left.originalName.localeCompare(
          right.originalName,
          i18n.resolvedLanguage,
        );
      });
    }

    return filterLocalFuseItems(products, normalizedSearch, {
      keys: [
        { name: "originalName", weight: 0.7 },
        { name: "source.platform", weight: 0.15 },
        { name: "source.url", weight: 0.15 },
      ],
      threshold: 0.36,
    }).sort((left, right) => {
      const leftConnectedRank = left.id === externalProductId ? 0 : 1;
      const rightConnectedRank = right.id === externalProductId ? 0 : 1;

      if (leftConnectedRank !== rightConnectedRank) {
        return leftConnectedRank - rightConnectedRank;
      }

      return left.originalName.localeCompare(
        right.originalName,
        i18n.resolvedLanguage,
      );
    });
  }, [
    connectionSearch,
    externalProductId,
    externalProductsData?.products,
    i18n.resolvedLanguage,
  ]);

  useEffect(() => {
    setDraftAllAttributesMapped(null);
  }, [externalProductId]);

  useEffect(() => {
    if (!externalProduct) {
      return;
    }

    setRefreshMarginPercent(
      (externalProduct.priceMarginPercent ?? 0).toString(),
    );
    setRefreshTaxPercent((externalProduct.priceTaxPercent ?? 0).toString());
    setRefreshDiscountPercent(
      (externalProduct.priceDiscountPercent ?? 0).toString(),
    );
    setDeliveryTimeExtraDay(externalProduct.deliveryTimeExtraDay === true);
    setRefreshFetchStrategy(
      externalProduct.priceFetchWorkflow?.fetchStrategy ?? "reuse",
    );
  }, [
    externalProduct?.id,
    externalProduct?.deliveryTimeExtraDay,
    externalProduct?.priceFetchWorkflow?.fetchStrategy,
    externalProduct?.priceDiscountPercent,
    externalProduct?.priceMarginPercent,
    externalProduct?.priceTaxPercent,
  ]);

  useEffect(() => {
    if (
      !externalProductId ||
      !externalPriceFetchWorkflow?.runId ||
      !isExternalPriceFetchWorkflowActive
    ) {
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
          externalProductId,
          externalPriceFetchWorkflow.runId,
        );

        if (cancelled) {
          return;
        }

        if (status.status === "completed") {
          if (
            lastHandledExternalPriceWorkflowRunId !==
            externalPriceFetchWorkflow.runId
          ) {
            setLastHandledExternalPriceWorkflowRunId(
              externalPriceFetchWorkflow.runId,
            );
            toaster.success({
              title: t("externalProducts.refreshPricesForReviewSuccess", {
                defaultValue: "Prices refreshed",
              }),
              description: t(
                "externalProducts.refreshPricesForReviewSuccessDescription",
                {
                  defaultValue:
                    "{{count}} price configurations are pending review",
                  count: status.result.fetchedConfigurationCount,
                },
              ),
            });
          }

          await mutateExternalProductData();
          return;
        }

        if (status.status === "failed") {
          if (
            lastHandledExternalPriceWorkflowRunId !==
            externalPriceFetchWorkflow.runId
          ) {
            setLastHandledExternalPriceWorkflowRunId(
              externalPriceFetchWorkflow.runId,
            );
            toaster.error({
              title: t("externalProducts.fetchPricesFailed", {
                defaultValue: "Failed to fetch prices",
              }),
              description: status.error,
            });
          }

          await mutateExternalProductData();
          return;
        }

        if (status.status === "cancelled") {
          if (
            lastHandledExternalPriceWorkflowRunId !==
            externalPriceFetchWorkflow.runId
          ) {
            setLastHandledExternalPriceWorkflowRunId(
              externalPriceFetchWorkflow.runId,
            );
            toaster.info({
              title: t("externalProducts.refreshPricesForReviewCancelled", {
                defaultValue: "Price refresh cancelled",
              }),
              description: t(
                "externalProducts.refreshPricesForReviewCancelledDescription",
                {
                  defaultValue:
                    "The background price refresh has been cancelled. You can start it again whenever you're ready.",
                },
              ),
            });
          }

          await mutateExternalProductData();
          return;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error polling external price workflow:", error);
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
    externalPriceFetchWorkflow?.runId,
    externalProductId,
    isExternalPriceFetchWorkflowActive,
    lastHandledExternalPriceWorkflowRunId,
    mutateExternalProductData,
    t,
  ]);

  async function handleConnectExternalProduct(nextExternalProductId: string) {
    setConnectingExternalProductId(nextExternalProductId);

    try {
      const result = await connectProductToExternalProduct({
        channelId,
        externalProductId: nextExternalProductId,
        productId: product.id,
      });

      if (!result.success) {
        toaster.error({
          title: t("externalProducts.connectionFailed", {
            defaultValue: "Failed to connect external product",
          }),
          description: result.error,
        });
        return;
      }

      toaster.success({
        title: t("externalProducts.connectionConnected", {
          defaultValue: "External product connected",
        }),
        description: result.connection?.externalProductName,
      });

      setConnectionDialogOpen(false);
      setConnectionSearch("");
      await mutateConnectionData();
    } catch (error) {
      console.error("Error connecting external product:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
      });
    } finally {
      setConnectingExternalProductId(null);
    }
  }

  async function handleStageExternalPrices() {
    if (!externalProductId) {
      return;
    }

    setStartingExternalPriceWorkflow(true);

    try {
      const result = await startExternalProductPriceFetchWorkflow({
        externalProductId,
        mode: "stage",
        marginPercent: parseFloat(refreshMarginPercent) || 0,
        taxPercent: parseFloat(refreshTaxPercent) || 0,
        discountPercent: parseFloat(refreshDiscountPercent) || 0,
        fetchStrategy: refreshFetchStrategy,
      });

      if (!result.success || !result.runId) {
        toaster.error({
          title: t("externalProducts.fetchPricesFailed", {
            defaultValue: "Failed to fetch prices",
          }),
          description: result.error,
        });
        return;
      }

      toaster.success({
        title: result.alreadyRunning
          ? t("externalProducts.refreshPricesForReviewAlreadyRunning", {
              defaultValue: "Price refresh already running",
            })
          : t("externalProducts.refreshPricesForReviewStarted", {
              defaultValue: "Price refresh started",
            }),
        description: result.alreadyRunning
          ? t(
              "externalProducts.refreshPricesForReviewAlreadyRunningDescription",
              {
                defaultValue:
                  "The background workflow is still refreshing prices for this product.",
              },
            )
          : t("externalProducts.refreshPricesForReviewStartedDescription", {
              defaultValue:
                "Refreshing prices in the background. You can leave this page and come back later.",
            }),
      });

      setRefreshFetchStrategy(result.fetchStrategy ?? refreshFetchStrategy);

      await mutateExternalProductData();
    } catch (error) {
      console.error("Error starting external price refresh workflow:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
      });
    } finally {
      setStartingExternalPriceWorkflow(false);
    }
  }

  async function handleCancelExternalPrices() {
    if (!externalProductId || !externalPriceFetchWorkflow?.runId) {
      return;
    }

    setCancellingExternalPriceWorkflow(true);

    try {
      const result = await cancelExternalProductPriceFetchWorkflow(
        externalProductId,
        externalPriceFetchWorkflow.runId,
      );

      if (!result.success) {
        toaster.error({
          title: t("externalProducts.cancelPriceFetchFailed", {
            defaultValue: "Failed to cancel price fetch",
          }),
          description: result.error,
        });
        return;
      }

      if (result.status === "cancelled") {
        if (
          lastHandledExternalPriceWorkflowRunId !==
          externalPriceFetchWorkflow.runId
        ) {
          setLastHandledExternalPriceWorkflowRunId(
            externalPriceFetchWorkflow.runId,
          );
          toaster.info({
            title: t("externalProducts.refreshPricesForReviewCancelled", {
              defaultValue: "Price refresh cancelled",
            }),
            description: t(
              "externalProducts.refreshPricesForReviewCancelledDescription",
              {
                defaultValue:
                  "The background price refresh has been cancelled. You can start it again whenever you're ready.",
              },
            ),
          });
        }
      }

      await mutateExternalProductData();
    } catch (error) {
      console.error("Error cancelling external price refresh workflow:", error);
      toaster.error({
        title: t("externalProducts.cancelPriceFetchFailed", {
          defaultValue: "Failed to cancel price fetch",
        }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
      });
    } finally {
      setCancellingExternalPriceWorkflow(false);
    }
  }

  async function handleApplyPendingExternalPrices() {
    if (!externalProductId) {
      return;
    }

    setIsApplyingPendingExternalPrices(true);

    try {
      const result = await applyExternalProductPendingPrices(externalProductId);

      if (!result.success) {
        toaster.error({
          title: t("externalProducts.applyPendingPricesFailed", {
            defaultValue: "Failed to apply pending prices",
          }),
          description: result.error,
        });
        return;
      }

      toaster.success({
        title: t("externalProducts.applyPendingPricesSuccess", {
          defaultValue: "Pending prices applied",
        }),
        description: t(
          "externalProducts.applyPendingPricesSuccessDescription",
          {
            defaultValue: "Applied {{count}} price configurations",
            count: result.appliedCount ?? 0,
          },
        ),
      });

      await mutateExternalProductData();
    } catch (error) {
      console.error("Error applying pending external prices:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
      });
    } finally {
      setIsApplyingPendingExternalPrices(false);
    }
  }

  async function handleDeliveryTimeExtraDayChange(value: boolean) {
    if (!externalProductId) {
      return;
    }

    setDeliveryTimeExtraDay(value);
    await updateExternalProductDeliveryTimeExtraDay(externalProductId, value);
    await mutateExternalProductData();
  }

  async function handleImportProductPrices(syncMappedAttributes: boolean) {
    if (!externalProductId) {
      return;
    }

    const currentProduct = formControls?.getExternalImportTargetState?.();
    const applyExternalImportDraft = formControls?.applyExternalImportDraft;

    if (!currentProduct || !applyExternalImportDraft) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("externalProducts.formDraftNotReady", {
          defaultValue:
            "Wait for the product form to finish loading before staging external changes.",
        }),
      });
      return;
    }

    setImportMode(syncMappedAttributes ? "prices-and-attributes" : "prices");

    try {
      const result = await getExternalProductImportDraft({
        currentProduct,
        externalProductId,
        syncMappedAttributes,
      });

      if (!result.success) {
        const hasDuplicateMappings = Boolean(result.duplicateMappingsSummary);
        const showWarning =
          !hasDuplicateMappings && result.requiresAttributeSync === true;
        const notify = showWarning ? toaster.warning : toaster.error;

        notify({
          title: hasDuplicateMappings
            ? t("externalProducts.mappingDuplicateTitle", {
                defaultValue: "Resolve duplicate attribute mappings",
              })
            : showWarning
              ? t("externalProducts.importPricesRequiresAttributeSync", {
                  defaultValue: "Sync mapped attributes first",
                })
              : t("externalProducts.importPricesToProductFailed", {
                  defaultValue: "Failed to import prices to product",
                }),
          description: result.duplicateMappingsSummary
            ? t("externalProducts.mappingDuplicateDescription", {
                defaultValue:
                  "Each internal attribute can only be mapped once. Resolve duplicates for: {{mappings}}.",
                mappings: result.duplicateMappingsSummary,
              })
            : result.error,
        });
        return;
      }

      if (!result.draft) {
        toaster.error({
          title: t("externalProducts.importPricesToProductFailed", {
            defaultValue: "Failed to import prices to product",
          }),
          description: t("common.tryAgain", {
            defaultValue: "Please try again later",
          }),
        });
        return;
      }

      applyExternalImportDraft(result.draft);

      toaster.success({
        title: syncMappedAttributes
          ? t("externalProducts.importPricesAndSyncAttributesSuccess", {
              defaultValue: "Mapped attributes & prices staged",
            })
          : t("externalProducts.importPricesToProductSuccess", {
              defaultValue: "Product prices staged",
            }),
        description: t(
          "externalProducts.importPricesToProductSuccessDescription",
          {
            defaultValue:
              "Applied {{groups}} price groups from {{count}} imported prices to the current form. Save the product to persist these changes.",
            count: result.importedPriceCount ?? 0,
            groups: result.importedPriceGroupCount ?? 0,
          },
        ),
      });
    } catch (error) {
      console.error("Error importing product prices:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("common.tryAgain", {
          defaultValue: "Please try again later",
        }),
      });
    } finally {
      setImportMode(null);
    }
  }

  async function handleConfirmSyncImport() {
    setConfirmSyncImportOpen(false);
    await handleImportProductPrices(true);
  }

  return (
    <>
      <Card.Root variant="outline">
        <Card.Body>
          <VStack gap={4} alignItems="stretch">
            <HStack justifyContent="space-between" alignItems="flex-start">
              <VStack gap={1} alignItems="flex-start">
                <Text fontSize="lg" fontWeight="bold">
                  {t("externalProducts.connectionTitle", {
                    defaultValue: "External product connection",
                  })}
                </Text>
                <Text color="fg.muted" fontSize="sm">
                  {t("externalProducts.connectionDescription", {
                    defaultValue:
                      "Connect this product to an imported external product so you can reuse mapped attributes and supplier prices.",
                  })}
                </Text>
              </VStack>

              <HStack gap={2} flexWrap="wrap" justifyContent="flex-end">
                <Button
                  variant="outline"
                  colorPalette="primary"
                  onClick={() => setConnectionDialogOpen(true)}
                >
                  <MaterialSymbol>link</MaterialSymbol>
                  {externalProductId
                    ? t("externalProducts.changeConnection", {
                        defaultValue: "Change connection",
                      })
                    : t("externalProducts.connectionAction", {
                        defaultValue: "Connect external product",
                      })}
                </Button>
                <ButtonLink
                  href={ADMIN_CATALOG_IMPORT}
                  lng={i18n.resolvedLanguage}
                  ariaLabel={t("externalProducts.importMoreProducts", {
                    defaultValue: "Import external products",
                  })}
                  variant="ghost"
                >
                  <MaterialSymbol>open_in_new</MaterialSymbol>
                  {t("externalProducts.importMoreProducts", {
                    defaultValue: "Import external products",
                  })}
                </ButtonLink>
              </HStack>
            </HStack>

            {!externalProductId ? (
              <Alert.Root status="info">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {t("externalProducts.connectionEmptyTitle", {
                      defaultValue: "No external product connected",
                    })}
                  </Alert.Title>
                  <Alert.Description>
                    {t("externalProducts.connectionEmptyDescription", {
                      defaultValue:
                        "Select one of the imported external products to start mapping attributes and importing supplier prices.",
                    })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ) : externalProduct ? (
              <VStack gap={4} alignItems="stretch">
                <HStack gap={2} flexWrap="wrap">
                  <Badge colorPalette="primary">
                    {t("externalProducts.connectionConnectedBadge", {
                      defaultValue: "Connected",
                    })}
                  </Badge>
                  {externalImportConnectionData?.connection?.providerName ? (
                    <Badge colorPalette="gray">
                      {externalImportConnectionData.connection.providerName}
                    </Badge>
                  ) : null}
                  <Badge
                    colorPalette={allAttributesMapped ? "success" : "orange"}
                  >
                    {mappingStatusLabel}
                  </Badge>
                  <Badge
                    colorPalette={
                      isExternalPriceFetchWorkflowActive
                        ? "blue"
                        : hasPendingPriceReview
                          ? "orange"
                          : hasExternalPrices
                            ? "success"
                            : "gray"
                    }
                  >
                    {priceStatusLabel}
                  </Badge>
                  <Text fontSize="sm" color="fg.muted">
                    {t("externalProducts.priceRefreshConnectedProduct", {
                      defaultValue: "Connected source: {{name}}",
                      name:
                        externalImportConnectionData?.connection
                          ?.externalProductName || externalProduct.originalName,
                    })}
                  </Text>
                </HStack>

                {externalImportConnectionData?.connection?.sourceUrl ? (
                  <Text fontSize="xs" color="fg.subtle" truncate>
                    {externalImportConnectionData.connection.sourceUrl}
                  </Text>
                ) : null}

                {readinessAlert ? (
                  <Alert.Root status={readinessAlert.status}>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>{readinessAlert.title}</Alert.Title>
                      <Alert.Description>
                        {readinessAlert.description}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                ) : null}

                <ExternalPriceInfoPreview
                  priceInfo={externalProduct?.priceInfo}
                  t={t}
                />

                <AttributeMappingSection
                  product={{
                    ...externalProduct,
                    id: externalProductId,
                  }}
                  onMappingsUpdated={mutateExternalProductData}
                  onAttributesRefresh={refreshAttributes}
                  internalAttributes={internalAttributes}
                  onAllMappedChange={setDraftAllAttributesMapped}
                  t={t}
                />

                <ConnectedExternalProductPricePanel
                  cancelExternalPriceWorkflowAction={handleCancelExternalPrices}
                  cancellingExternalPriceWorkflow={
                    cancellingExternalPriceWorkflow
                  }
                  importDisabledReason={combinedImportDisabledReason}
                  importMode={importMode}
                  isApplyingPendingExternalPrices={
                    isApplyingPendingExternalPrices
                  }
                  isExternalPriceFetchWorkflowActive={
                    isExternalPriceFetchWorkflowActive
                  }
                  pendingPriceConfigurationsCount={
                    pendingPriceConfigurationsCount
                  }
                  refreshDiscountPercent={refreshDiscountPercent}
                  refreshFetchStrategy={refreshFetchStrategy}
                  refreshMarginPercent={refreshMarginPercent}
                  refreshTaxPercent={refreshTaxPercent}
                  deliveryTimeExtraDay={deliveryTimeExtraDay}
                  startingExternalPriceWorkflow={startingExternalPriceWorkflow}
                  applyPendingExternalPricesAction={
                    handleApplyPendingExternalPrices
                  }
                  importProductPricesAction={handleImportProductPrices}
                  requestSyncImportAction={() => setConfirmSyncImportOpen(true)}
                  refreshDiscountPercentChangeAction={setRefreshDiscountPercent}
                  refreshFetchStrategyChangeAction={setRefreshFetchStrategy}
                  refreshMarginPercentChangeAction={setRefreshMarginPercent}
                  refreshTaxPercentChangeAction={setRefreshTaxPercent}
                  deliveryTimeExtraDayChangeAction={
                    handleDeliveryTimeExtraDayChange
                  }
                  stageExternalPricesAction={handleStageExternalPrices}
                  t={t}
                />
              </VStack>
            ) : (
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    {t("externalProducts.connectionMissingProductTitle", {
                      defaultValue: "Connected external product not found",
                    })}
                  </Alert.Title>
                  <Alert.Description>
                    {t("externalProducts.connectionMissingProductDescription", {
                      defaultValue:
                        "The saved connection points to an external product that is no longer available. Choose a new connection to continue.",
                    })}
                  </Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      <ConnectedExternalProductSelectionDialog
        connectionDialogOpen={connectionDialogOpen}
        connectionSearch={connectionSearch}
        connectingExternalProductId={connectingExternalProductId}
        currentExternalProductId={externalProductId}
        externalProducts={filteredExternalProducts}
        externalProductsLoading={externalProductsLoading}
        connectExternalProductAction={handleConnectExternalProduct}
        connectionSearchChangeAction={setConnectionSearch}
        openChangeAction={setConnectionDialogOpen}
        t={t}
      />

      <ConnectedExternalProductSyncConfirmationDialog
        loading={importMode === "prices-and-attributes"}
        open={confirmSyncImportOpen}
        confirmAction={handleConfirmSyncImport}
        openChangeAction={setConfirmSyncImportOpen}
        t={t}
      />
    </>
  );
}
