"use client";

import { attachGeneratedOrderItemImage } from "@/actions/attach-generated-order-item-image";
import {
  getImageGenerationWorkflowStatus,
  startImageGenerationWorkflow,
} from "@/actions/generate-images-workflow";
import {
  type GeneratedWorkflowImage,
  generateProductImageOptions,
} from "@/components/catalog/product-image-generation-workflows";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import { useT } from "@/i18n/client";
import { storage } from "@/lib/firebase/clientApp";
import { fetchProductImageGenerationConfig } from "@/lib/product-image-generation-config";
import {
  Badge,
  Box,
  Button,
  type ButtonProps,
  Dialog,
  HStack,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CloseButton,
  MaterialSymbol,
  ProductImageGenerationPanelBody,
  type ProductImageGenerationPanelBodyProps,
  type ProductImageGenerationPanelImage,
  toaster,
} from "@konfi/components";
import { MODELS } from "@konfi/firebase";
import { type ImageGenerationRequest, OrderItem, Product } from "@konfi/types";
import { appendProductImageGenerationPromptEnhancement } from "@konfi/utils";
import { useAuth } from "context/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState, useTransition } from "react";
import useSWRImmutable from "swr/immutable";

const DEFAULT_MODEL = MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"];
const MAX_PROMPT_WORDS = 500;
const MIN_PROMPT_WORDS = 30;
const MAX_REFERENCE_FILES = 3;
const MAX_REFERENCE_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const ESTIMATED_GENERATION_DURATION_SECONDS = 60;
const WORKFLOW_POLL_TIMEOUT_MS = 15 * 60 * 1000;
const GENERATION_STYLES = [
  "minimalistyczny",
  "nowoczesny",
  "elegancki",
  "kreatywny",
] as const;
const DEFAULT_GENERATION_STYLE = "nowoczesny";
const SUPPORTED_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
const SUPPORTED_REFERENCE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

type OrderItemGenerationStyle = (typeof GENERATION_STYLES)[number];

type OrderItemImageGenerationDialogProps = {
  orderItem: OrderItem;
  customerId: string;
  orderId: string;
  onAttachmentAdded?: () => Promise<void> | void;
  triggerSize?: ButtonProps["size"];
};

type OrderItemGenerationResult = {
  images: ProductImageGenerationPanelImage[];
  generatedImages: GeneratedWorkflowImage[];
};

const GENERATION_STYLE_GUIDANCE: Record<OrderItemGenerationStyle, string> = {
  minimalistyczny:
    "Favor restraint, generous spacing, a reduced palette, and only the most essential visual elements.",
  nowoczesny:
    "Favor a contemporary layout, crisp hierarchy, clean geometry, and fresh high-clarity contrast.",
  elegancki:
    "Favor refined typography, sophisticated spacing, a premium palette, and polished editorial balance.",
  kreatywny:
    "Favor a more expressive concept, bold composition, surprising accents, and memorable visual energy while staying production-ready.",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientJobId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function resolveOrderItemGenerationStyle(
  value: string | null | undefined,
): OrderItemGenerationStyle {
  return GENERATION_STYLES.includes(value as OrderItemGenerationStyle)
    ? (value as OrderItemGenerationStyle)
    : DEFAULT_GENERATION_STYLE;
}

function buildOrderItemGenerationStylePrompt(
  style: OrderItemGenerationStyle | undefined,
): string {
  const resolvedStyle = resolveOrderItemGenerationStyle(style);

  return [
    `Preferred user-selected style: ${resolvedStyle}.`,
    `Style direction: ${GENERATION_STYLE_GUIDANCE[resolvedStyle]}`,
  ].join(" ");
}

function resolveAspectRatio(
  width?: number | null,
  height?: number | null,
): SupportedAspectRatio {
  if (!width || !height || width <= 0 || height <= 0) {
    return "1:1";
  }

  const target = width / height;

  return SUPPORTED_ASPECT_RATIOS.reduce<{
    ratio: SupportedAspectRatio;
    difference: number;
  }>(
    (closest, ratio) => {
      const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
      const difference = Math.abs(ratioWidth / ratioHeight - target);

      if (difference < closest.difference) {
        return {
          ratio,
          difference,
        };
      }

      return closest;
    },
    {
      ratio: "1:1",
      difference: Number.POSITIVE_INFINITY,
    },
  ).ratio;
}

async function uploadReferenceFiles(params: {
  accountId: string;
  files: File[];
}): Promise<string[]> {
  const { accountId, files } = params;
  const dateStr = new Date().toISOString().split("T")[0];

  return Promise.all(
    files.map(async (file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `ai/reference/accounts/${accountId}/${dateStr}/${createClientJobId()}-${safeName}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, file, {
        contentType: file.type,
      });

      return getDownloadURL(storageRef);
    }),
  );
}

function OrderItemImageGenerationInfo({
  t,
  selectedSize,
  pageCount,
}: {
  t: ReturnType<typeof useT>["t"];
  selectedSize: { width?: number; height?: number };
  pageCount?: number;
}) {
  return (
    <VStack align="stretch" gap={4}>
      <HStack flexWrap="wrap" gap={2}>
        <Badge colorPalette="purple">
          {t("products.imageGeneration.modelBadge", {
            defaultValue: "Nano Banana 2",
          })}
        </Badge>
        <Badge variant="subtle" colorPalette="primary">
          {t("products.imageGeneration.limitsBadge", {
            defaultValue: "Account quota",
          })}
        </Badge>
        <Badge variant="outline">
          {t("products.imageGeneration.referenceBadge", {
            defaultValue: "{{count}} refs / {{size}} MB max",
            count: MAX_REFERENCE_FILES,
            size: "4.0",
          })}
        </Badge>
        <Badge variant="outline">
          {t("products.imageGeneration.durationBadge", {
            defaultValue: "Up to 1 minute",
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
      <Box
        borderWidth="1px"
        borderColor="border.emphasized"
        borderRadius="3xl"
        p={4}
        bg="bg.subtle"
      >
        <VStack align="stretch" gap={2}>
          <Text fontWeight="semibold">
            {t("products.imageGeneration.limitsTitle", {
              defaultValue: "Usage and guidance",
            })}
          </Text>
          <Text color="fg.muted" fontSize="sm">
            {t("products.imageGeneration.limitsDescription", {
              defaultValue:
                "This studio uses your admin account AI image quota. Product-specific prompt guidance from the product settings is applied automatically, and you can attach up to 3 PNG, JPG, or WebP reference images.",
            })}
          </Text>
        </VStack>
      </Box>
    </VStack>
  );
}

export default function OrderItemImageGenerationDialog({
  orderItem,
  customerId,
  orderId,
  onAttachmentAdded,
  triggerSize,
}: OrderItemImageGenerationDialogProps) {
  const { isAllowed: canUseImageGeneration } = useTenantModuleAccess(
    "aiImage",
    { denyFreePlan: true },
  );

  if (!canUseImageGeneration) {
    return null;
  }

  return (
    <OrderItemImageGenerationDialogContent
      orderItem={orderItem}
      customerId={customerId}
      orderId={orderId}
      onAttachmentAdded={onAttachmentAdded}
      triggerSize={triggerSize}
    />
  );
}

function OrderItemImageGenerationDialogContent({
  orderItem,
  customerId,
  orderId,
  onAttachmentAdded,
  triggerSize,
}: OrderItemImageGenerationDialogProps) {
  const { t, i18n } = useT(["order", "imageGenerator", "translation"]);
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<OrderItemGenerationStyle>(
    DEFAULT_GENERATION_STYLE,
  );
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [result, setResult] = useState<OrderItemGenerationResult | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(
    null,
  );
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isAccepting, startAcceptTransition] = useTransition();

  const product = orderItem.product as Product | undefined;
  const resolvedChannelId = product?.channelId;
  const { data: imageGenerationConfig } = useSWRImmutable(
    resolvedChannelId && product?.id
      ? ["product-image-generation-config", resolvedChannelId, product.id]
      : null,
    ([, nextChannelId, nextProductId]) =>
      fetchProductImageGenerationConfig(nextChannelId, nextProductId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;
  const promptWordCount = useMemo(() => countWords(prompt), [prompt]);
  const selectedSize = useMemo(
    () => ({
      width: orderItem.width ?? product?.spec?.minimumWidth,
      height: orderItem.height ?? product?.spec?.minimumHeight,
    }),
    [
      orderItem.height,
      orderItem.width,
      product?.spec?.minimumHeight,
      product?.spec?.minimumWidth,
    ],
  );
  const aspectRatio = useMemo(
    () => resolveAspectRatio(selectedSize.width, selectedSize.height),
    [selectedSize.height, selectedSize.width],
  );
  const isPromptInvalid =
    prompt.length > 0 &&
    (promptWordCount < MIN_PROMPT_WORDS || promptWordCount > MAX_PROMPT_WORDS);
  const generationProgress =
    generationStartedAt === null
      ? null
      : {
          elapsedSeconds: generationElapsedSeconds,
          remainingSeconds: Math.max(
            0,
            ESTIMATED_GENERATION_DURATION_SECONDS - generationElapsedSeconds,
          ),
          progressPercent: Math.min(
            100,
            Math.round(
              (Math.min(
                generationElapsedSeconds,
                ESTIMATED_GENERATION_DURATION_SECONDS,
              ) /
                ESTIMATED_GENERATION_DURATION_SECONDS) *
                100,
            ),
          ),
          isOvertime:
            generationElapsedSeconds >= ESTIMATED_GENERATION_DURATION_SECONDS,
          estimatedDurationSeconds: ESTIMATED_GENERATION_DURATION_SECONDS,
        };

  useEffect(() => {
    if (generationStartedAt === null) {
      return;
    }

    const updateElapsedTime = () => {
      setGenerationElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000)),
      );
    };

    updateElapsedTime();
    const intervalId = window.setInterval(updateElapsedTime, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationStartedAt]);

  const styleOptions = useMemo(
    () =>
      GENERATION_STYLES.map((style) => ({
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
      })),
    [t],
  );

  if (
    !product ||
    !customerId ||
    !orderId ||
    !resolvedChannelId ||
    !imageGenerationConfig?.enabled
  ) {
    return null;
  }

  const helperText = t("products.imageGeneration.promptHelper", {
    defaultValue:
      "Describe the goal, audience, style, colors, hierarchy, and any must-have content. Use 30-500 words.",
  });

  const handleGenerate = () => {
    if (!user?.uid) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("products.imageGeneration.errors.authRequired", {
          defaultValue: "Sign in again before generating images.",
        }),
      });
      return;
    }

    if (
      promptWordCount < MIN_PROMPT_WORDS ||
      promptWordCount > MAX_PROMPT_WORDS
    ) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("products.imageGeneration.promptError", {
          defaultValue: "Use between 30 and 500 words.",
        }),
      });
      return;
    }

    const invalidReferenceFile = referenceFiles.find(
      (file) =>
        !SUPPORTED_REFERENCE_IMAGE_TYPES.has(file.type) ||
        file.size > MAX_REFERENCE_FILE_SIZE_BYTES,
    );

    if (invalidReferenceFile) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          invalidReferenceFile.size > MAX_REFERENCE_FILE_SIZE_BYTES
            ? t("products.imageGeneration.errors.invalidFileSize", {
                defaultValue: "Reference images must be 4 MB or smaller.",
              })
            : t("products.imageGeneration.errors.invalidFileType", {
                defaultValue:
                  "Only PNG, JPG, and WebP reference images are supported.",
              }),
      });
      return;
    }

    setGenerationStartedAt(Date.now());
    setGenerationElapsedSeconds(0);
    setResult(null);

    startTransition(async () => {
      try {
        const uploadedReferenceImages =
          referenceFiles.length > 0
            ? await uploadReferenceFiles({
                accountId: user.uid,
                files: referenceFiles,
              })
            : undefined;
        const promptWithStyleGuidance = [
          prompt.trim(),
          buildOrderItemGenerationStylePrompt(selectedStyle),
        ].join("\n\n");
        const promptWithProductGuidance =
          appendProductImageGenerationPromptEnhancement(
            promptWithStyleGuidance,
            imageGenerationConfig?.promptEnhancement,
          );
        const { images, errorMessages, filteredReasons } =
          await generateProductImageOptions({
            startWorkflow: () =>
              startImageGenerationWorkflow({
                jobId: createClientJobId(),
                request: {
                  prompt: promptWithProductGuidance,
                  model: DEFAULT_MODEL,
                  numberOfImages: 1,
                  aspectRatio,
                  language: currentLanguage,
                  referenceImages: uploadedReferenceImages,
                },
              }),
            getWorkflowStatus: getImageGenerationWorkflowStatus,
            pollTimeoutMs: WORKFLOW_POLL_TIMEOUT_MS,
            sleep,
          });

        if (images.length <= 0) {
          throw new Error(
            errorMessages[0] ??
              t("products.imageGeneration.errors.generationFailed", {
                defaultValue: "Image generation failed.",
              }),
          );
        }

        setResult({
          generatedImages: images,
          images: images.map((image: GeneratedWorkflowImage, index) => ({
            id: image.id || `single-${index}`,
            imageDataUrl: image.url,
            side: "single",
          })),
        });

        toaster.success({
          title: t("products.imageGeneration.success.title", {
            defaultValue: "Image ready",
          }),
          description: t("products.imageGeneration.success.description", {
            defaultValue: "Your AI product graphic is ready.",
          }),
        });

        if (filteredReasons.length > 0) {
          toaster.warning({
            title: t("imageGenerator.someImagesFiltered", {
              defaultValue: "Some images filtered",
            }),
            description: filteredReasons.join(" "),
          });
        }
      } catch (error) {
        console.error("Error generating order item image:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("products.imageGeneration.errors.generationFailed", {
                  defaultValue: "Image generation failed.",
                }),
        });
      } finally {
        setGenerationStartedAt(null);
      }
    });
  };

  const handleAttachGeneratedImage = () => {
    if (!result?.generatedImages[0]) {
      return;
    }

    startAcceptTransition(async () => {
      try {
        await attachGeneratedOrderItemImage({
          channelId: resolvedChannelId,
          orderId,
          orderItemId: orderItem.id,
          sourceStoragePath: result.generatedImages[0].storagePath,
        });
        await onAttachmentAdded?.();

        toaster.success({
          title: t("common.success", { defaultValue: "Success" }),
          description: t("order.inlineEdit.imageGeneration.attachSuccess", {
            defaultValue: "Generated graphic was attached to this order item.",
          }),
        });
        setOpen(false);
      } catch (error) {
        console.error("Error attaching generated order item image:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.inlineEdit.imageGeneration.attachFailed", {
                  defaultValue: "Failed to attach the generated graphic.",
                }),
        });
      }
    });
  };

  const handleDownloadGeneratedImage = () => {
    result?.images.forEach((image, index) => {
      const link = document.createElement("a");
      link.href = image.imageDataUrl;
      link.download =
        index === 0
          ? `${orderItem.id}-ai-graphic.png`
          : `${orderItem.id}-ai-graphic-${index + 1}.png`;
      link.click();
    });
  };

  const sharedProps: ProductImageGenerationPanelBodyProps = {
    t,
    language: currentLanguage ?? "en",
    infoContent: (
      <OrderItemImageGenerationInfo
        t={t}
        selectedSize={selectedSize}
        pageCount={orderItem.pageCount ?? undefined}
      />
    ),
    helperText,
    prompt,
    onPromptChangeAction: setPrompt,
    selectedStyle,
    styleOptions,
    onSelectedStyleChangeAction: (value) =>
      setSelectedStyle(resolveOrderItemGenerationStyle(value)),
    improvePrompt: false,
    onImprovePromptChangeAction: () => undefined,
    showImprovePrompt: false,
    referenceFiles,
    onReferenceFilesChangeAction: (files) =>
      setReferenceFiles(files.slice(0, MAX_REFERENCE_FILES)),
    result,
    resultMeta: (
      <Text fontSize="sm" color="fg.muted">
        {t("order.inlineEdit.imageGeneration.attachHelper", {
          defaultValue:
            "The generated file will be copied into this order item’s files after you attach it.",
        })}
      </Text>
    ),
    generationProgress,
    isPending,
    isAccepting,
    isPromptInvalid,
    promptWordCount,
    selectedSize,
    canGenerate: !isPromptInvalid && promptWordCount >= MIN_PROMPT_WORDS,
    canAcceptResult: result?.generatedImages.length === 1,
    maxPromptWords: MAX_PROMPT_WORDS,
    maxReferenceFiles: MAX_REFERENCE_FILES,
    maxReferenceFileSizeBytes: MAX_REFERENCE_FILE_SIZE_BYTES,
    onGenerateAction: handleGenerate,
    onAcceptGeneratedImageAction: handleAttachGeneratedImage,
    onDownloadGeneratedImageAction: handleDownloadGeneratedImage,
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      lazyMount
      size="xl"
    >
      <Dialog.Trigger asChild>
        <Button
          colorPalette="primary"
          variant="ai"
          type="button"
          size={triggerSize}
          className="noprint"
        >
          <MaterialSymbol aria-hidden="true">auto_awesome</MaterialSymbol>
          {t("order.inlineEdit.imageGeneration.button", {
            defaultValue: "Studio AI",
          })}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="4xl">
            <Dialog.Header>
              <VStack align="start" gap={1}>
                <Dialog.Title>
                  {t("order.inlineEdit.imageGeneration.dialogTitle", {
                    defaultValue: "Generate Graphic for This Order Item",
                  })}
                </Dialog.Title>
                <Text fontSize="sm" color="fg.muted">
                  {t("order.inlineEdit.imageGeneration.description", {
                    defaultValue:
                      "Use the admin AI image workflow for this order item, then attach the generated file to the item files.",
                  })}
                </Text>
              </VStack>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
            <Dialog.Body>
              <ProductImageGenerationPanelBody {...sharedProps} />
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
