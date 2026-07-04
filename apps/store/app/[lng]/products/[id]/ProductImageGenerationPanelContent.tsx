"use client";

import { useT } from "@/i18n/client";
import {
  STORE_GENERATION_STYLES,
  isStoreImageGenerationRateLimitEnabled,
  resolveStoreGenerationStyle,
} from "@/lib/ai/store-image-generation.shared";
import {
  ProductImageGenerationPanelBody,
  type ProductImageGenerationPanelBodyProps,
} from "@konfi/components";
import { Grid, Text } from "@chakra-ui/react";
import type { ProductImageGenerationPanelContentProps } from "./ProductImageGenerationPanel.types";
import ProductImageGenerationPanelInfo from "./ProductImageGenerationPanelInfo";

export default function ProductImageGenerationPanelContent(
  props: ProductImageGenerationPanelContentProps,
) {
  const { t, i18n } = useT();
  const { result, ...rest } = props;
  const rateLimitEnabled = isStoreImageGenerationRateLimitEnabled();
  const styleOptions = STORE_GENERATION_STYLES.map((style) => ({
    value: style,
    icon:
      style === "minimalistyczny"
        ? "dehaze"
        : style === "nowoczesny"
          ? "polyline"
          : style === "elegancki"
            ? "diamond"
            : "palette",
    label: t(`products.imageGeneration.styles.${style}.label`, {
      defaultValue:
        style === "minimalistyczny"
          ? "Minimalist"
          : style === "nowoczesny"
            ? "Modern"
            : style === "elegancki"
              ? "Elegant"
              : "Creative",
    }),
    description: t(`products.imageGeneration.styles.${style}.description`, {
      defaultValue:
        style === "minimalistyczny"
          ? "Calm layouts, clean typography, and lots of breathing room."
          : style === "nowoczesny"
            ? "Fresh contrast, geometric structure, and digital-first clarity."
            : style === "elegancki"
              ? "Premium editorial balance, refined details, and sophistication."
              : "More expressive ideas, bold accents, and standout composition.",
    }),
  }));

  const resultMeta =
    result == null ? undefined : (
      <Text fontSize="sm" color="fg.muted">
        {rateLimitEnabled
          ? t("products.imageGeneration.remainingAttempts", {
              defaultValue: "Remaining generations this hour: {{count}}",
              count: result.remainingAttempts,
            })
          : t("products.imageGeneration.devRemainingAttempts", {
              defaultValue:
                "Development mode: hourly limit disabled for testing.",
            })}
      </Text>
    );

  const sharedProps: ProductImageGenerationPanelBodyProps = {
    t,
    language: i18n.resolvedLanguage ?? "en",
    result,
    resultMeta,
    styleOptions,
    ...rest,
    onSelectedStyleChangeAction: (value) =>
      props.onSelectedStyleChangeAction(resolveStoreGenerationStyle(value)),
  };

  return (
    <Grid
      templateColumns={{ base: "1fr", lg: "320px 1fr" }}
      gap={4}
      alignItems="start"
    >
      <ProductImageGenerationPanelInfo
        selectedSize={props.selectedSize}
        pageCount={props.pageCount}
        isLargeFormat={props.isLargeFormat}
        showAuthHint={props.showAuthHint}
        showAnonymousHint={props.showAnonymousHint}
        showEmailHint={props.showEmailHint}
        minPromptWords={props.minPromptWords}
        maxPromptWords={props.maxPromptWords}
        maxReferenceFiles={props.maxReferenceFiles}
        maxReferenceFileSizeBytes={props.maxReferenceFileSizeBytes}
      />
      <ProductImageGenerationPanelBody {...sharedProps} />
    </Grid>
  );
}
