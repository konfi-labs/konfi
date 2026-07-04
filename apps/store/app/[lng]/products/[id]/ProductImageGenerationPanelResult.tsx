"use client";

import { useT } from "@/i18n/client";
import { isStoreImageGenerationRateLimitEnabled } from "@/lib/ai/store-image-generation.shared";
import {
  Button,
  Heading,
  HStack,
  Image,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { GenerationResponse } from "./ProductImageGenerationPanel.types";

type ProductImageGenerationPanelResultProps = {
  result: GenerationResponse;
  isAccepting: boolean;
  canAcceptResult: boolean;
  onAcceptGeneratedImageAction: () => void;
  onDownloadGeneratedImageAction: () => void;
};

export default function ProductImageGenerationPanelResult({
  result,
  isAccepting,
  canAcceptResult,
  onAcceptGeneratedImageAction,
  onDownloadGeneratedImageAction,
}: ProductImageGenerationPanelResultProps) {
  const { t } = useT();
  const hasMultipleImages = result.images.length > 1;
  const rateLimitEnabled = isStoreImageGenerationRateLimitEnabled();

  return (
    <VStack align="stretch" gap={4}>
      <Separator />
      <VStack
        align="stretch"
        gap={4}
        borderWidth="1px"
        borderColor="border.emphasized"
        borderRadius="3xl"
        p={4}
      >
        <Heading size="sm">
          {hasMultipleImages
            ? t("products.imageGeneration.resultTitleMultiple", {
                defaultValue: "Generated final graphics",
              })
            : t("products.imageGeneration.resultTitle", {
                defaultValue: "Generated final graphic",
              })}
        </Heading>
        {hasMultipleImages ? (
          <Text fontSize="sm" color="fg.muted">
            {t("products.imageGeneration.multipleSidesNotice", {
              defaultValue:
                "Both printable sides were generated as separate files.",
            })}
          </Text>
        ) : null}
        <VStack align="stretch" gap={4}>
          {result.images.map((image, index) => {
            const sideLabel =
              image.side === "front"
                ? t("products.imageGeneration.sides.front", {
                    defaultValue: "Front side",
                  })
                : image.side === "back"
                  ? t("products.imageGeneration.sides.back", {
                      defaultValue: "Back side",
                    })
                  : null;

            return (
              <VStack
                key={`${image.id}-${index}`}
                align="stretch"
                gap={3}
                borderWidth="1px"
                borderColor="border.emphasized"
                borderRadius="2xl"
                p={3}
              >
                {sideLabel ? (
                  <HStack justify="space-between" align="center">
                    <Text fontWeight="medium">{sideLabel}</Text>
                  </HStack>
                ) : null}
                <Image
                  src={image.imageDataUrl}
                  alt={
                    sideLabel
                      ? t("products.imageGeneration.resultAltWithSide", {
                          defaultValue:
                            "Generated {{side}} final production graphic preview",
                          side: sideLabel,
                        })
                      : t("products.imageGeneration.resultAlt", {
                          defaultValue:
                            "Generated final production graphic preview",
                        })
                  }
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor="border.emphasized"
                  objectFit="contain"
                  maxH="720px"
                  bg="bg.subtle"
                />
              </VStack>
            );
          })}
        </VStack>
        <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
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
          <HStack flexWrap="wrap">
            {canAcceptResult ? (
              <Button
                colorPalette="primary"
                onClick={onAcceptGeneratedImageAction}
                loading={isAccepting}
                loadingText={t("products.imageGeneration.attaching", {
                  defaultValue: "Attaching…",
                })}
              >
                {hasMultipleImages
                  ? t("products.imageGeneration.acceptButtonMultiple", {
                      defaultValue: "Accept and attach all files to cart item",
                    })
                  : t("products.imageGeneration.acceptButton", {
                      defaultValue: "Accept and attach to cart item",
                    })}
              </Button>
            ) : null}
            <Button variant="outline" onClick={onDownloadGeneratedImageAction}>
              {hasMultipleImages
                ? t("products.imageGeneration.downloadButtonMultiple", {
                    defaultValue: "Download graphics",
                  })
                : t("products.imageGeneration.downloadButton", {
                    defaultValue: "Download graphic",
                  })}
            </Button>
          </HStack>
        </HStack>
      </VStack>
    </VStack>
  );
}
