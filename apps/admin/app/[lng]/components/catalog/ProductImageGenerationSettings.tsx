"use client";

import { useT } from "@/i18n/client";
import {
  fetchProductImageGenerationConfig,
  saveProductImageGenerationConfig,
} from "@/lib/product-image-generation-config";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import {
  Badge,
  Box,
  Button,
  Field,
  HStack,
  Skeleton,
  Switch,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { toaster } from "@konfi/components";
import { Product, ProductImageGenerationConfig } from "@konfi/types";
import { normalizeProductImageGenerationConfig } from "@konfi/utils";
import { useAuth } from "context/auth";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

type ProductImageGenerationSettingsProps = {
  channelId: string;
  product: Product;
};

type DraftState = {
  enabled: boolean;
  promptEnhancement: string;
};

function toDraftState(
  config: ProductImageGenerationConfig | undefined,
): DraftState {
  return {
    enabled: config?.enabled === true,
    promptEnhancement: config?.promptEnhancement ?? "",
  };
}

export default function ProductImageGenerationSettings({
  channelId,
  product,
}: ProductImageGenerationSettingsProps) {
  const { isAllowed: canUseImageGeneration } = useTenantModuleAccess(
    "aiImage",
    { denyFreePlan: true },
  );

  if (!canUseImageGeneration) {
    return null;
  }

  return (
    <ProductImageGenerationSettingsContent
      channelId={channelId}
      product={product}
    />
  );
}

function ProductImageGenerationSettingsContent({
  channelId,
  product,
}: ProductImageGenerationSettingsProps) {
  const { t } = useT();
  const { user, userInfo } = useAuth();
  const [draft, setDraft] = useState<DraftState>({
    enabled: false,
    promptEnhancement: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const {
    data: config,
    isLoading,
    mutate,
  } = useSWR(
    channelId && product.id
      ? ["product-image-generation-config", channelId, product.id]
      : null,
    ([, nextChannelId, nextProductId]) =>
      fetchProductImageGenerationConfig(nextChannelId, nextProductId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  useEffect(() => {
    setDraft(toDraftState(config));
  }, [config]);

  const normalizedDraft = useMemo(
    () =>
      normalizeProductImageGenerationConfig({
        enabled: draft.enabled,
        promptEnhancement: draft.promptEnhancement,
      }),
    [draft.enabled, draft.promptEnhancement],
  );
  const normalizedPersistedConfig = useMemo(
    () => normalizeProductImageGenerationConfig(config),
    [config],
  );
  const hasChanges =
    (normalizedDraft?.enabled ?? false) !==
      (normalizedPersistedConfig?.enabled ?? false) ||
    (normalizedDraft?.promptEnhancement ?? "") !==
      (normalizedPersistedConfig?.promptEnhancement ?? "");

  const handleSave = async () => {
    if (!user?.uid) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.productImageGenerationSettings.authRequired", {
          defaultValue: "Sign in again before saving these AI image settings.",
        }),
      });
      return;
    }

    setIsSaving(true);

    try {
      const savedConfig = await saveProductImageGenerationConfig({
        channelId,
        productId: product.id,
        config: {
          enabled: draft.enabled,
          promptEnhancement: draft.promptEnhancement,
        },
        editor: {
          id: user.uid,
          name: userInfo?.displayName ?? user.email ?? user.uid,
        },
      });

      await mutate(savedConfig, { revalidate: false });
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("admin.productImageGenerationSettings.saved", {
          defaultValue: "AI image generation settings were saved.",
        }),
      });
    } catch (error) {
      console.error("Error saving product image generation settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("admin.productImageGenerationSettings.saveFailed", {
                defaultValue: "Failed to save AI image generation settings.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box p={6} border="1px solid" borderRadius="3xl" borderColor="gray.muted">
      <VStack align="stretch" gap={4}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <VStack align="start" gap={1}>
            <Text fontSize="lg" fontWeight="bold" mb={4}>
              {t("admin.productImageGenerationSettings.title", {
                defaultValue: "AI Graphic Generation",
              })}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {t("admin.productImageGenerationSettings.description", {
                defaultValue:
                  "Enable AI graphic generation only for selected products, and keep any product-specific prompt guidance in a lightweight product subcollection document.",
              })}
            </Text>
          </VStack>
          {config?.enabled ? (
            <Badge colorPalette="success" variant="subtle">
              {t("admin.productImageGenerationSettings.enabledBadge", {
                defaultValue: "Enabled",
              })}
            </Badge>
          ) : null}
        </HStack>

        {isLoading ? (
          <VStack align="stretch" gap={3}>
            <Skeleton h="6" w="40%" />
            <Skeleton h="10" borderRadius="xl" />
          </VStack>
        ) : null}

        <Switch.Root
          checked={draft.enabled}
          onCheckedChange={(details) =>
            setDraft((currentValue) => ({
              ...currentValue,
              enabled: details.checked,
            }))
          }
          justifyContent="space-between"
        >
          <Switch.HiddenInput />
          <Switch.Label>
            {t("admin.productImageGenerationSettings.enabledLabel", {
              defaultValue: "Allow AI Graphic Generation for This Product",
            })}
          </Switch.Label>
          <Switch.Control />
        </Switch.Root>

        <Field.Root>
          <Field.Label>
            {t("admin.productImageGenerationSettings.promptEnhancementLabel", {
              defaultValue: "Prompt Improvements",
            })}
          </Field.Label>
          <Textarea
            value={draft.promptEnhancement}
            onChange={(event) =>
              setDraft((currentValue) => ({
                ...currentValue,
                promptEnhancement: event.target.value,
              }))
            }
            name="product-image-generation-prompt-enhancement"
            autoComplete="off"
            minH="140px"
            placeholder={t(
              "admin.productImageGenerationSettings.promptEnhancementPlaceholder",
              {
                defaultValue:
                  "Example: Keep the layout quiet, premium, and editorial. Use clean typography, restrained negative space, and avoid playful clip-art styling…",
              },
            )}
            borderRadius="3xl"
          />
          <Field.HelperText>
            {t("admin.productImageGenerationSettings.promptEnhancementHelper", {
              defaultValue:
                "Optional. Add product-specific direction that should always strengthen AI-generated production graphics for this product in store and admin.",
            })}
          </Field.HelperText>
        </Field.Root>

        <Button
          type="button"
          alignSelf="start"
          colorPalette="primary"
          onClick={handleSave}
          loading={isSaving}
          disabled={!hasChanges}
        >
          {t("admin.productImageGenerationSettings.save", {
            defaultValue: "Save AI Settings",
          })}
        </Button>
      </VStack>
    </Box>
  );
}
