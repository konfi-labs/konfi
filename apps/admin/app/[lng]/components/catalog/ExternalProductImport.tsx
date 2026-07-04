"use client";

import {
  deleteExternalProduct,
  deleteExternalProvider,
  fetchExternalProduct,
  listExternalProducts,
  listExternalProviderCatalog,
  listExternalProviders,
  setupExternalProviderAuto,
} from "@/actions/external-products";
import { useT } from "@/i18n/client";
import { Card, VStack } from "@chakra-ui/react";
import { toaster } from "@konfi/components";
import { useConfiguration } from "context/configuration";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import useSWR from "swr";
import ExternalProviderCard from "./external-import/ExternalProviderCard";
import ImportedProductsList from "./external-import/ImportedProductsList";
import ProductSelectionGrid from "./external-import/ProductSelectionGrid";
import ProviderSetupForm from "./external-import/ProviderSetupForm";
import type {
  ExternalImportProgress,
  ExternalProductWithId,
  ExternalProviderWithId,
  ProviderCatalogItem,
} from "./external-import/types";

type ActiveImportState = {
  label: string;
  productId?: string | null;
  startedAt: number;
};

type ImportStageConfig = {
  thresholdMs: number;
  titleKey: string;
  titleDefaultValue: string;
  descriptionKey: string;
  descriptionDefaultValue: string;
};

const IMPORT_STAGES: ImportStageConfig[] = [
  {
    thresholdMs: 4_000,
    titleKey: "externalProducts.importProgress.stages.fetching.title",
    titleDefaultValue: "Fetching provider data",
    descriptionKey:
      "externalProducts.importProgress.stages.fetching.description",
    descriptionDefaultValue:
      "Downloading the product payload and any provider-specific details.",
  },
  {
    thresholdMs: 12_000,
    titleKey: "externalProducts.importProgress.stages.analyzing.title",
    titleDefaultValue: "Analyzing product details",
    descriptionKey:
      "externalProducts.importProgress.stages.analyzing.description",
    descriptionDefaultValue:
      "Extracting the name, images, attributes, and specifications.",
  },
  {
    thresholdMs: 22_000,
    titleKey: "externalProducts.importProgress.stages.mapping.title",
    titleDefaultValue: "Preparing attribute mappings",
    descriptionKey:
      "externalProducts.importProgress.stages.mapping.description",
    descriptionDefaultValue:
      "Generating suggested mappings between external data and your catalog.",
  },
  {
    thresholdMs: Number.POSITIVE_INFINITY,
    titleKey: "externalProducts.importProgress.stages.saving.title",
    titleDefaultValue: "Saving imported product",
    descriptionKey: "externalProducts.importProgress.stages.saving.description",
    descriptionDefaultValue:
      "Wrapping up the import and saving the product in Konfi.",
  },
];

function getManualImportLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./u, "");
    return hostname || url;
  } catch {
    return url;
  }
}

/**
 * Component for importing products from external URLs
 */
export default function ExternalProductImport() {
  const { t } = useT(["externalProducts", "externalProviders", "translation"]);
  const { attributes: internalAttributes, refreshAttributes } =
    useConfiguration();

  // Provider setup state
  const [providerInput, setProviderInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerProducts, setProviderProducts] = useState<
    ProviderCatalogItem[]
  >([]);
  const [activeImport, setActiveImport] = useState<ActiveImportState | null>(
    null,
  );
  const [importElapsedSeconds, setImportElapsedSeconds] = useState(0);
  const [, startTransition] = useTransition();

  // Manual URL import state
  const [manualUrl, setManualUrl] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!activeImport) {
      setImportElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      setImportElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - activeImport.startedAt) / 1000)),
      );
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeImport]);

  // Fetch existing providers (global, not channel-specific)
  const { data: providersData, mutate: mutateProviders } = useSWR(
    "external-providers",
    () => listExternalProviders(),
    { revalidateOnFocus: false },
  );

  // Fetch existing external products (global staging area)
  const {
    data: productsData,
    isLoading: productsLoading,
    mutate: mutateProducts,
  } = useSWR("external-products", () => listExternalProducts(), {
    revalidateOnFocus: false,
  });

  const externalProviders = useMemo(
    () =>
      (providersData?.providers as ExternalProviderWithId[] | undefined) ?? [],
    [providersData?.providers],
  );

  const externalProducts = useMemo(
    () => (productsData?.products as ExternalProductWithId[] | undefined) ?? [],
    [productsData?.products],
  );
  const resolvedInternalAttributes = useMemo(
    () => internalAttributes ?? [],
    [internalAttributes],
  );

  const refreshImportedProducts = useCallback(() => {
    startTransition(() => {
      void mutateProducts();
    });
  }, [mutateProducts, startTransition]);

  const importProgress: ExternalImportProgress | null = activeImport
    ? (() => {
        const elapsedMs = importElapsedSeconds * 1000;
        const currentStageIndex = IMPORT_STAGES.findIndex(
          (stage) => elapsedMs < stage.thresholdMs,
        );
        const stageIndex =
          currentStageIndex === -1
            ? IMPORT_STAGES.length - 1
            : currentStageIndex;
        const currentStage = IMPORT_STAGES[stageIndex];

        return {
          label: activeImport.label,
          productId: activeImport.productId,
          elapsedSeconds: importElapsedSeconds,
          currentStageTitle: t(currentStage.titleKey, {
            defaultValue: currentStage.titleDefaultValue,
          }),
          currentStageDescription: t(currentStage.descriptionKey, {
            defaultValue: currentStage.descriptionDefaultValue,
          }),
          upcomingStageTitles: IMPORT_STAGES.slice(stageIndex + 1).map(
            (stage) =>
              t(stage.titleKey, { defaultValue: stage.titleDefaultValue }),
          ),
        };
      })()
    : null;

  // Auto-process provider input
  const handleProcessProviderInput = useCallback(async () => {
    const trimmed = providerInput.trim();
    if (!trimmed) {
      toaster.create({
        title: t("externalProviders.validation.providerInput", {
          defaultValue: "Paste provider details to process",
        }),
        type: "error",
      });
      return;
    }

    setProcessing(true);

    try {
      const result = await setupExternalProviderAuto(trimmed);

      if (!result.success) {
        toaster.create({
          title: t("externalProviders.setupFailed", {
            defaultValue: "Failed to setup provider",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      toaster.create({
        title: t("externalProviders.setupSuccess", {
          defaultValue: "Provider configured",
        }),
        description: result.providerName,
        type: "success",
      });

      setProviderInput("");
      setActiveProviderId(result.providerId ?? null);
      startTransition(() => {
        setProviderProducts(result.products);
      });
      void mutateProviders();
    } catch (error) {
      console.error("Error processing provider input:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        type: "error",
      });
    } finally {
      setProcessing(false);
    }
  }, [mutateProviders, providerInput, startTransition, t]);

  // Load products for selected provider
  const handleLoadProviderProducts = useCallback(
    async (providerId: string) => {
      const provider = externalProviders.find(
        (candidate) => candidate.id === providerId,
      );
      if (!provider?.allProductsEndpoint) {
        startTransition(() => {
          setProviderProducts([]);
        });
        return;
      }

      setProcessing(true);

      try {
        const result = await listExternalProviderCatalog(providerId);

        if (result.success) {
          startTransition(() => {
            setProviderProducts(result.products);
          });
        } else {
          toaster.create({
            title: t("externalProducts.providerProductsError", {
              defaultValue: "Failed to load products",
            }),
            description: result.error,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error loading provider products:", error);
        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
      } finally {
        setProcessing(false);
      }
    },
    [externalProviders, startTransition, t],
  );

  const handleProviderChange = useCallback(
    (providerId: string | null) => {
      setActiveProviderId(providerId);
      startTransition(() => {
        setProviderProducts([]);
      });
      if (providerId) {
        handleLoadProviderProducts(providerId);
      }
    },
    [handleLoadProviderProducts, startTransition],
  );

  // Import product from catalog
  const handleImportProduct = useCallback(
    async (product: ProviderCatalogItem) => {
      if (!product.url) {
        toaster.create({
          title: t("externalProducts.providerProductMissingUrl", {
            defaultValue: "No product URL available",
          }),
          type: "error",
        });
        return;
      }

      setActiveImport({
        label: product.name,
        productId: product.id,
        startedAt: Date.now(),
      });
      setImporting(true);

      try {
        const result = await fetchExternalProduct({
          url: product.url,
          providerId: activeProviderId ?? undefined,
          forceRefresh: false,
        });

        if (result.success) {
          toaster.create({
            title: t("externalProducts.fetchSuccess", {
              defaultValue: "Product fetched",
            }),
            description: result.externalProduct?.originalName,
            type: "success",
          });
          refreshImportedProducts();
        } else {
          toaster.create({
            title: t("externalProducts.fetchError", {
              defaultValue: "Failed to fetch product",
            }),
            description: result.error,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error importing product:", error);
        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
      } finally {
        setImporting(false);
        setActiveImport(null);
      }
    },
    [activeProviderId, refreshImportedProducts, t],
  );

  // Manual URL import
  const handleManualImport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = manualUrl.trim();
      if (!trimmed) return;

      setActiveImport({
        label:
          getManualImportLabel(trimmed) ||
          t("externalProducts.importProgress.genericProduct", {
            defaultValue: "external product",
          }),
        startedAt: Date.now(),
      });
      setImporting(true);

      try {
        const result = await fetchExternalProduct({
          url: trimmed,
          providerId: activeProviderId ?? undefined,
          forceRefresh: false,
        });

        if (result.success) {
          toaster.create({
            title: t("externalProducts.fetchSuccess", {
              defaultValue: "Product fetched",
            }),
            description: result.externalProduct?.originalName,
            type: "success",
          });
          setManualUrl("");
          refreshImportedProducts();
        } else {
          toaster.create({
            title: t("externalProducts.fetchError", {
              defaultValue: "Failed to fetch product",
            }),
            description: result.error,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
      } finally {
        setImporting(false);
        setActiveImport(null);
      }
    },
    [activeProviderId, manualUrl, refreshImportedProducts, t],
  );

  // Delete handlers
  const handleDeleteProduct = useCallback(
    async (id: string) => {
      try {
        const result = await deleteExternalProduct(id);
        if (result.success) {
          toaster.create({
            title: t("common.deleted", { defaultValue: "Deleted" }),
            type: "success",
          });
          refreshImportedProducts();
        } else {
          toaster.create({
            title: t("common.error", { defaultValue: "Error" }),
            description: result.error,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error deleting product:", error);
      }
    },
    [t, refreshImportedProducts],
  );

  const handleDeleteProvider = useCallback(
    async (id: string) => {
      try {
        const result = await deleteExternalProvider(id);
        if (result.success) {
          toaster.create({
            title: t("common.deleted", { defaultValue: "Deleted" }),
            type: "success",
          });
          if (activeProviderId === id) {
            setActiveProviderId(null);
            startTransition(() => {
              setProviderProducts([]);
            });
          }
          void mutateProviders();
        } else {
          toaster.create({
            title: t("common.error", { defaultValue: "Error" }),
            description: result.error,
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error deleting provider:", error);
      }
    },
    [activeProviderId, mutateProviders, startTransition, t],
  );

  return (
    <VStack w="100%" gap={6} alignItems="stretch">
      <ProviderSetupForm
        providerInput={providerInput}
        processing={processing}
        onProviderInputChange={setProviderInput}
        onProcessProviderInput={handleProcessProviderInput}
        t={t}
      />

      {externalProviders.length > 0 && (
        <ProductSelectionGrid
          externalProviders={externalProviders}
          activeProviderId={activeProviderId}
          providerProducts={providerProducts}
          activeImport={importProgress}
          processing={processing}
          importing={importing}
          manualUrl={manualUrl}
          onProviderChange={handleProviderChange}
          onImportProduct={handleImportProduct}
          onManualUrlChange={setManualUrl}
          onManualImport={handleManualImport}
          t={t}
        />
      )}

      {/* Configured Providers List */}
      {externalProviders.length > 0 && (
        <Card.Root>
          <Card.Header>
            <Card.Title>
              {t("externalProviders.listTitle", {
                defaultValue: "Configured Providers",
              })}
            </Card.Title>
          </Card.Header>
          <Card.Body>
            <VStack gap={3} alignItems="stretch">
              {externalProviders.map((provider) => (
                <ExternalProviderCard
                  key={provider.id}
                  provider={provider}
                  onDelete={handleDeleteProvider}
                  t={t}
                />
              ))}
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

      <ImportedProductsList
        externalProducts={externalProducts}
        loading={productsLoading}
        onDeleteProduct={handleDeleteProduct}
        onProductsRefresh={refreshImportedProducts}
        onAttributesRefresh={refreshAttributes}
        internalAttributes={resolvedInternalAttributes}
        t={t}
      />
    </VStack>
  );
}
