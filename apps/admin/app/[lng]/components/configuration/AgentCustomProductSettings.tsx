"use client";

import {
  searchAgentCustomProductCandidatesAction,
  type AgentCustomProductSearchCandidate,
} from "@/actions/agent-custom-product-settings";
import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import {
  clearAgentCustomProductSettings,
  loadAgentCustomProductSettings,
  saveAgentCustomProductSettings,
} from "@/lib/agent-custom-product-settings.client";
import { canUseProductForAgentCustomProduct } from "@/lib/agent-custom-product-settings";
import { VStack } from "@chakra-ui/react";
import { toaster } from "@konfi/components";
import { useCallback, useEffect, useState } from "react";
import {
  AgentCustomProductInfoAlert,
  AgentCustomProductSearchCard,
  SavedAgentCustomProductCard,
} from "./AgentCustomProductSettingsSections";

export function AgentCustomProductSettings() {
  const { t } = useT(["allegro", "translation"]);
  const { channel } = useChannels();
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savedProductId, setSavedProductId] = useState<string | undefined>();
  const [savedProductChannelId, setSavedProductChannelId] = useState<
    string | undefined
  >();
  const [savedProductName, setSavedProductName] = useState<
    string | undefined
  >();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<
    AgentCustomProductSearchCandidate[]
  >([]);
  const [selectedProduct, setSelectedProduct] =
    useState<AgentCustomProductSearchCandidate | null>(null);

  useEffect(() => {
    if (!channel) {
      setSavedProductId(undefined);
      setSavedProductChannelId(undefined);
      setSavedProductName(undefined);
      return;
    }

    let cancelled = false;
    setLoadingSettings(true);
    void loadAgentCustomProductSettings(channel.id)
      .then((settings) => {
        if (cancelled) return;
        setSavedProductId(settings?.defaultProductId);
        setSavedProductChannelId(settings?.defaultProductChannelId);
        setSavedProductName(settings?.defaultProductName);
      })
      .catch((error) => {
        console.error("Failed to load agent custom product settings:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("agents.customProduct.loadError", {
            defaultValue: "Failed to load custom agent product settings.",
          }),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSettings(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channel, t]);

  const handleSearch = useCallback(async () => {
    if (!channel) {
      toaster.error({
        title: t("allegro.importMissingChannelTitle", {
          defaultValue: "Channel required",
        }),
        description: t("allegro.importMissingChannelDescription", {
          defaultValue: "Select a channel before importing an Allegro order.",
        }),
      });
      return;
    }

    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm.length < 2) {
      toaster.warning({
        title: t("allegro.settings.searchTooShortTitle", {
          defaultValue: "Search term too short",
        }),
        description: t("allegro.settings.searchTooShortDescription", {
          defaultValue: "Type at least 2 characters to search products.",
        }),
      });
      return;
    }

    setSearching(true);
    try {
      const result = await searchAgentCustomProductCandidatesAction({
        query: trimmedTerm,
      });
      const results = result.products;
      setSearchResults(results);

      if (!result.ok) {
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: result.error,
        });
      } else if (results.length === 0) {
        toaster.info({
          title: t("allegro.settings.noResultsTitle", {
            defaultValue: "No products found",
          }),
          description: t("allegro.settings.noResultsDescription", {
            defaultValue:
              "No active products matched your search. Try a different phrase.",
          }),
        });
      }
    } catch (error) {
      console.error("Failed to search products for agent settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.searchError", {
          defaultValue: "Failed to search products.",
        }),
      });
    } finally {
      setSearching(false);
    }
  }, [channel, searchTerm, t]);

  const handleSave = useCallback(async () => {
    if (!channel || !selectedProduct) {
      return;
    }

    if (!canUseProductForAgentCustomProduct(selectedProduct.product)) {
      toaster.error({
        title: t("agents.customProduct.invalidTitle", {
          defaultValue: "Unsupported product",
        }),
        description: t("agents.customProduct.invalidDescription", {
          defaultValue:
            "Choose a SINGLE product with custom price enabled so agents can preserve supplier item names and prices.",
        }),
      });
      return;
    }

    setSaving(true);
    try {
      await saveAgentCustomProductSettings(channel.id, {
        defaultProductChannelId: selectedProduct.channelId,
        defaultProductId: selectedProduct.product.id,
        defaultProductName: selectedProduct.product.name,
      });
      setSavedProductChannelId(selectedProduct.channelId);
      setSavedProductId(selectedProduct.product.id);
      setSavedProductName(selectedProduct.product.name);
      toaster.success({
        title: t("agents.customProduct.savedTitle", {
          defaultValue: "Agent custom product saved",
        }),
        description: t("agents.customProduct.savedDescription", {
          defaultValue:
            "Agents can now use this product for supplier-priced custom items.",
        }),
      });
    } catch (error) {
      console.error("Failed to save agent custom product settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("agents.customProduct.saveError", {
          defaultValue: "Failed to save custom agent product settings.",
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [channel, selectedProduct, t]);

  const handleClear = useCallback(async () => {
    if (!channel) {
      return;
    }

    setClearing(true);
    try {
      await clearAgentCustomProductSettings(channel.id);
      setSavedProductChannelId(undefined);
      setSavedProductId(undefined);
      setSavedProductName(undefined);
      setSelectedProduct(null);
      toaster.success({
        title: t("agents.customProduct.clearedTitle", {
          defaultValue: "Agent custom product cleared",
        }),
        description: t("agents.customProduct.clearedDescription", {
          defaultValue:
            "Agents will ask before quoting supplier-only products again.",
        }),
      });
    } catch (error) {
      console.error("Failed to clear agent custom product settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("agents.customProduct.clearError", {
          defaultValue: "Failed to clear custom agent product settings.",
        }),
      });
    } finally {
      setClearing(false);
    }
  }, [channel, t]);

  return (
    <VStack align="stretch" gap={4} mt={6}>
      <AgentCustomProductInfoAlert />
      <SavedAgentCustomProductCard
        clearing={clearing}
        loadingSettings={loadingSettings}
        onClear={() => {
          void handleClear();
        }}
        savedProductChannelId={savedProductChannelId}
        savedProductId={savedProductId}
        savedProductName={savedProductName}
      />
      <AgentCustomProductSearchCard
        onClearSelection={() => setSelectedProduct(null)}
        onSave={() => {
          void handleSave();
        }}
        onSearch={() => {
          void handleSearch();
        }}
        onSearchTermChange={setSearchTerm}
        onSelectProduct={setSelectedProduct}
        saving={saving}
        searchResults={searchResults}
        searching={searching}
        searchTerm={searchTerm}
        selectedProduct={selectedProduct}
      />
    </VStack>
  );
}
