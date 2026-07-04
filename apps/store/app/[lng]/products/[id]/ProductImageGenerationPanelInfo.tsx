"use client";

import { useT } from "@/i18n/client";
import {
  isStoreImageGenerationRateLimitEnabled,
  storeImageGenerationLimits,
} from "@/lib/ai/store-image-generation.shared";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@konfi/components";
import {
  Alert,
  Badge,
  Box,
  Heading,
  HStack,
  List,
  Text,
  VStack,
} from "@chakra-ui/react";

type ProductImageGenerationPanelInfoProps = {
  selectedSize: {
    width?: number;
    height?: number;
  };
  pageCount?: number;
  isLargeFormat: boolean;
  showAuthHint: boolean;
  showAnonymousHint: boolean;
  showEmailHint: boolean;
  minPromptWords: number;
  maxPromptWords: number;
  maxReferenceFiles: number;
  maxReferenceFileSizeBytes: number;
};

function formatMegabytes(sizeInBytes: number, language: string): string {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(sizeInBytes / (1024 * 1024));
}

export default function ProductImageGenerationPanelInfo({
  selectedSize,
  pageCount,
  isLargeFormat,
  showAuthHint,
  showAnonymousHint,
  showEmailHint,
  minPromptWords,
  maxPromptWords,
  maxReferenceFiles,
  maxReferenceFileSizeBytes,
}: ProductImageGenerationPanelInfoProps) {
  const { t, i18n } = useT();
  const language = i18n.resolvedLanguage ?? "en";
  const rateLimitEnabled = isStoreImageGenerationRateLimitEnabled();

  return (
    <VStack align="stretch" gap={4}>
      <Box
        borderWidth="1px"
        borderColor="primary.muted"
        borderRadius="3xl"
        bgGradient="to-br"
        gradientFrom="primary.subtle"
        gradientTo="bg"
        p={{ base: 4, md: 5 }}
      >
        <VStack align="stretch" gap={4}>
          <HStack flexWrap="wrap" gap={2}>
            <Badge colorPalette="purple" translate="no">
              {t("products.imageGeneration.modelBadge", {
                defaultValue: "Nano Banana 2",
              })}
            </Badge>
            <Badge variant="subtle" colorPalette="primary">
              {rateLimitEnabled
                ? t("products.imageGeneration.limitsBadge", {
                    defaultValue: "{{count}} per hour",
                    count: storeImageGenerationLimits.rateLimitMaxAttempts,
                  })
                : t("products.imageGeneration.devLimitsBadge", {
                    defaultValue: "No hourly limit in development",
                  })}
            </Badge>
            <Badge variant="outline">
              {t("products.imageGeneration.referenceBadge", {
                defaultValue: "{{count}} refs / {{size}} MB max",
                count: maxReferenceFiles,
                size: formatMegabytes(maxReferenceFileSizeBytes, language),
              })}
            </Badge>
            {selectedSize.width && selectedSize.height ? (
              <Badge variant="outline">
                {t("products.imageGeneration.currentFormat", {
                  defaultValue: "Current format: {{width}} × {{height}} mm",
                  width: selectedSize.width,
                  height: selectedSize.height,
                })}
              </Badge>
            ) : null}
            {pageCount ? (
              <Badge variant="outline">
                {t("products.imageGeneration.currentPages", {
                  defaultValue: "{{count}} pages",
                  count: pageCount,
                })}
              </Badge>
            ) : null}
          </HStack>

          <VStack align="stretch" gap={1}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              letterSpacing="0.12em"
              textTransform="uppercase"
              color="primary.fg"
            >
              {t("products.imageGeneration.heroEyebrow", {
                defaultValue: "AI print design studio",
              })}
            </Text>
            <Heading size={{ base: "md", md: "lg" }} textWrap="balance">
              {t("products.imageGeneration.heroTitle", {
                defaultValue: "Create a print-ready concept faster.",
              })}
            </Heading>
            <Text color="fg.muted">
              {t("products.imageGeneration.heroDescription", {
                defaultValue:
                  "Write the brief, pick a style, add references if needed, and generate final artwork for this product.",
              })}
            </Text>
          </VStack>
        </VStack>
      </Box>

      <Box>
        <AccordionRoot multiple>
          <AccordionItem value="usage">
            <AccordionItemTrigger>
              <Text fontWeight="semibold">
                {t("products.imageGeneration.limitsTitle", {
                  defaultValue: "Limits and eligibility",
                })}
              </Text>
            </AccordionItemTrigger>
            <AccordionItemContent>
              <VStack align="stretch" gap={3} pt={1}>
                <Text color="fg.muted">
                  {rateLimitEnabled
                    ? t("products.imageGeneration.limitsDescription", {
                        defaultValue:
                          "Verified customers can generate up to {{count}} final graphics per hour. Prompts must be {{min}}-{{max}} words, and you can add up to {{references}} reference images.",
                        count: storeImageGenerationLimits.rateLimitMaxAttempts,
                        min: minPromptWords,
                        max: maxPromptWords,
                        references: maxReferenceFiles,
                      })
                    : t("products.imageGeneration.devLimitsDescription", {
                        defaultValue:
                          "Development mode removes the hourly limit. Prompt, file, and account checks still apply.",
                      })}
                </Text>
                <List.Root gap={1.5} pl={4}>
                  <List.Item>
                    {t("products.imageGeneration.tutorial.step1", {
                      defaultValue:
                        "Describe the goal, audience, colors, and must-have content.",
                    })}
                  </List.Item>
                  <List.Item>
                    {t("products.imageGeneration.tutorial.step2", {
                      defaultValue:
                        "Choose a style and add references only if they help guide the direction.",
                    })}
                  </List.Item>
                  <List.Item>
                    {t("products.imageGeneration.tutorial.step3", {
                      defaultValue:
                        "Enable prompt improvement if you want AI to tighten the brief first.",
                    })}
                  </List.Item>
                </List.Root>
              </VStack>
            </AccordionItemContent>
          </AccordionItem>
          <AccordionItem value="privacy">
            <AccordionItemTrigger>
              <Text fontWeight="semibold">
                {t("products.imageGeneration.dataUsageTitle", {
                  defaultValue: "How your data is used",
                })}
              </Text>
            </AccordionItemTrigger>
            <AccordionItemContent>
              <VStack align="stretch" gap={2} pt={1}>
                <Text color="fg.muted">
                  {t("products.imageGeneration.dataUsageDescription", {
                    defaultValue:
                      "Your prompt and reference images are sent to Google Vertex AI for generation. Do not include confidential or personal data.",
                  })}
                </Text>
                <Text color="fg.muted">
                  {t("store.fileRetentionNotice.description", {
                    defaultValue:
                      "We store uploaded files only for the time needed to process your order. If you want to keep them for later use, please download and save them yourself.",
                  })}
                </Text>
              </VStack>
            </AccordionItemContent>
          </AccordionItem>
        </AccordionRoot>
      </Box>

      {isLargeFormat ? (
        <Alert.Root status="warning" borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("products.imageGeneration.largeFormatTitle", {
                defaultValue: "Large-format verification",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("products.imageGeneration.largeFormatDescription", {
                defaultValue:
                  "Formats above 500 × 500 mm will be upscaled and checked manually before production. Keep layouts bold and readable from distance.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      {showAuthHint ? (
        <Alert.Root status="info" borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t("products.imageGeneration.authHint", {
                defaultValue:
                  "Sign in with a standard customer account to unlock image generation.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      {showAnonymousHint ? (
        <Alert.Root status="warning" borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t("products.imageGeneration.anonymousHint", {
                defaultValue:
                  "Guest and anonymous accounts cannot use image generation. Create or log in to a full account first.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      {showEmailHint ? (
        <Alert.Root status="warning" borderRadius="3xl">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t("products.imageGeneration.emailHint", {
                defaultValue:
                  "Verify your email address before generating images. After confirming the link, refresh this page.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}
    </VStack>
  );
}
