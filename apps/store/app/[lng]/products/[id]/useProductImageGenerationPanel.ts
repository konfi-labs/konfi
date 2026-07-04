"use client";

import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import {
  DEFAULT_STORE_GENERATION_STYLE,
  type StoreGenerationStyle,
  isStoreGeneratedImageExpired,
  storeImageGenerationLimits,
} from "@/lib/ai/store-image-generation.shared";
import { fetchProductImageGenerationConfig } from "@/lib/product-image-generation-config";
import { toaster } from "@konfi/components";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import useSWRImmutable from "swr/immutable";
import type {
  GenerationResponse,
  ImageGenerationProduct,
  ProductImageGenerationPanelContentProps,
  ProductImageGenerationPanelProps,
} from "./ProductImageGenerationPanel.types";
import {
  pollStoreImageGenerationWorkflow,
  type StartStoreImageGenerationWorkflowResponse,
  type StoreImageGenerationWorkflowStatusResponse,
} from "./product-image-generation-workflow";
import {
  buildProductImageGenerationSessionKey,
  getGenerationProgressFromTimestamp,
  updateProductImageGenerationSessionState,
  useProductImageGenerationSessionState,
} from "./product-image-generation-session";

const MAX_PROMPT_WORDS = storeImageGenerationLimits.maxPromptWords;
const MIN_PROMPT_WORDS = storeImageGenerationLimits.minPromptWords;
const MAX_REFERENCE_FILES = storeImageGenerationLimits.maxReferenceFiles;
const MAX_REFERENCE_FILE_SIZE_BYTES =
  storeImageGenerationLimits.maxReferenceFileSizeBytes;
const ESTIMATED_GENERATION_DURATION_SECONDS = 60;
const WORKFLOW_POLL_TIMEOUT_MS = 15 * 60 * 1000;

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function parseSelectedAttributeOptions(
  attributeIds: string[],
  searchParams: URLSearchParams,
): Record<string, string> {
  return attributeIds.reduce<Record<string, string>>(
    (accumulator, attributeId) => {
      const value = searchParams.get(attributeId);
      if (value) {
        accumulator[attributeId] = value;
      }
      return accumulator;
    },
    {},
  );
}

function parsePositiveNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getSelectedSize(params: {
  product: ImageGenerationProduct;
  attributes: ProductImageGenerationPanelProps["attributes"];
  selectedAttributeOptions: Record<string, string>;
  width?: number;
  height?: number;
}): { width?: number; height?: number } {
  const { product, attributes, selectedAttributeOptions, width, height } =
    params;

  if (product.customSize && width && height) {
    return { width, height };
  }

  const formatAttribute = attributes.find(
    (attribute) => attribute.format === true,
  );
  const selectedValue = formatAttribute
    ? selectedAttributeOptions[formatAttribute.id]
    : undefined;
  const selectedOption = formatAttribute?.options.find(
    (option) => option.value === selectedValue,
  );

  if (selectedOption?.formatWidth && selectedOption?.formatHeight) {
    return {
      width: selectedOption.formatWidth,
      height: selectedOption.formatHeight,
    };
  }

  if (width && height) {
    return { width, height };
  }

  return {
    width: product.spec.minimumWidth,
    height: product.spec.minimumHeight,
  };
}

async function dataUrlToFile(params: {
  dataUrl: string;
  filename: string;
}): Promise<File> {
  const response = await fetch(params.dataUrl);
  const blob = await response.blob();
  return new File([blob], params.filename, {
    type: blob.type || "image/png",
  });
}

function getGeneratedImageFilename(params: {
  productId: string;
  side: GenerationResponse["images"][number]["side"];
  index: number;
}): string {
  const { productId, side, index } = params;

  if (side === "front") {
    return `${productId}-ai-front-graphic.png`;
  }

  if (side === "back") {
    return `${productId}-ai-back-graphic.png`;
  }

  return index === 0
    ? `${productId}-ai-final-graphic.png`
    : `${productId}-ai-final-graphic-${index + 1}.png`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException("The operation was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}

function mapStoreImageGenerationError(params: {
  message: string;
  t: ReturnType<typeof useT>["t"];
}): string {
  const { message, t } = params;

  if (message === "PRODUCT_IMAGE_GENERATION_DISABLED") {
    return t("products.imageGeneration.errors.disabledForProduct", {
      defaultValue: "AI graphic generation is not enabled for this product.",
    });
  }

  if (message === "MONTHLY_BUDGET_EXCEEDED") {
    return t("products.imageGeneration.errors.monthlyBudgetExceeded", {
      defaultValue:
        "AI graphic generation is temporarily unavailable because this month's service budget has been reached. Please try again next month.",
    });
  }

  if (message === "RATE_LIMIT_EXCEEDED") {
    const limitHours = Math.max(
      1,
      Math.round(
        storeImageGenerationLimits.rateLimitWindowMs / (60 * 60 * 1000),
      ),
    );

    return t("products.imageGeneration.errors.rateLimitExceeded", {
      defaultValue:
        "You have reached the limit of {{count}} image generations in the last {{hours}} hour(s).",
      count: storeImageGenerationLimits.rateLimitMaxAttempts,
      hours: limitHours,
    });
  }

  if (message === "IMAGE_GENERATION_EXPIRED") {
    const retentionDays = Math.max(
      1,
      Math.round(
        storeImageGenerationLimits.generatedImageRetentionMs /
          (24 * 60 * 60 * 1000),
      ),
    );

    return t("products.imageGeneration.errors.expired", {
      defaultValue:
        "This generated image has expired and is no longer available after {{days}} day(s). Please generate it again.",
      days: retentionDays,
    });
  }

  return message;
}

type TriggerStatusKey = "anonymous" | "authRequired" | "email" | "ready";

type UseProductImageGenerationPanelResult = {
  enabled: boolean;
  triggerStatusKey: TriggerStatusKey;
  contentProps: ProductImageGenerationPanelContentProps;
};

export function useProductImageGenerationPanel({
  product,
  attributes,
  channelId,
  selectedAttributeOptions: selectedAttributeOptionsProp,
  width: widthProp,
  height: heightProp,
  pageCount: pageCountProp,
  onAcceptGeneratedImageAction,
  imageGenerationConfig,
  acceptMode = "attach",
}: ProductImageGenerationPanelProps): UseProductImageGenerationPanelResult {
  const { t, i18n } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const { user, appCheckToken } = useAuth();
  const searchParams = useSearchParams();
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [isAccepting, startAcceptTransition] = useTransition();
  const [progressTimestamp, setProgressTimestamp] = useState(() => Date.now());
  const generationAbortRef = useRef<AbortController | null>(null);

  const resolvedChannelId =
    channelId ?? product.channelId ?? runtimeConfig.channelId;
  const { data: fetchedImageGenerationConfig } = useSWRImmutable(
    imageGenerationConfig === undefined && resolvedChannelId && product.id
      ? ["product-image-generation-config", resolvedChannelId, product.id]
      : null,
    ([, nextChannelId, nextProductId]) =>
      fetchProductImageGenerationConfig(nextChannelId, nextProductId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const effectiveImageGenerationConfig =
    imageGenerationConfig ?? fetchedImageGenerationConfig;
  const selectedAttributeOptions = useMemo(() => {
    if (selectedAttributeOptionsProp) {
      return selectedAttributeOptionsProp;
    }

    return parseSelectedAttributeOptions(
      product.attributes ?? [],
      searchParams,
    );
  }, [product.attributes, searchParams, selectedAttributeOptionsProp]);
  const width = widthProp ?? parsePositiveNumber(searchParams.get("width"));
  const height = heightProp ?? parsePositiveNumber(searchParams.get("height"));
  const pageCount =
    pageCountProp ?? parsePositiveNumber(searchParams.get("pageCount"));
  const sessionKey = useMemo(
    () =>
      buildProductImageGenerationSessionKey({
        productId: product.id,
        channelId: resolvedChannelId,
        selectedAttributeOptions,
        width,
        height,
        pageCount,
      }),
    [
      height,
      pageCount,
      product.id,
      resolvedChannelId,
      selectedAttributeOptions,
      width,
    ],
  );
  const sessionState = useProductImageGenerationSessionState(sessionKey);
  const {
    prompt,
    improvePrompt,
    style,
    result,
    generationStartedAt,
    rateLimitBlockedUntil,
  } = sessionState;
  const resultExpired =
    result != null &&
    isStoreGeneratedImageExpired({ expiresAt: result.expiresAtMs });
  const availableResult = resultExpired ? null : result;
  const resolvedStyle = style ?? DEFAULT_STORE_GENERATION_STYLE;
  const promptWordCount = useMemo(() => countWords(prompt), [prompt]);
  const selectedSize = useMemo(
    () =>
      getSelectedSize({
        product,
        attributes,
        selectedAttributeOptions,
        width,
        height,
      }),
    [attributes, height, product, selectedAttributeOptions, width],
  );
  const isLargeFormat =
    (selectedSize.width !== undefined && selectedSize.width > 500) ||
    (selectedSize.height !== undefined && selectedSize.height > 500);
  const isPromptInvalid =
    prompt.length > 0 &&
    (promptWordCount < MIN_PROMPT_WORDS || promptWordCount > MAX_PROMPT_WORDS);
  const isRateLimitBlocked =
    rateLimitBlockedUntil !== null && rateLimitBlockedUntil > Date.now();
  const canGenerate = Boolean(
    user &&
    !user.isAnonymous &&
    user.emailVerified &&
    !isPromptInvalid &&
    promptWordCount >= MIN_PROMPT_WORDS &&
    !isRateLimitBlocked &&
    resolvedChannelId,
  );
  const triggerStatusKey: TriggerStatusKey = !user
    ? "authRequired"
    : user.isAnonymous
      ? "anonymous"
      : !user.emailVerified
        ? "email"
        : "ready";
  const helperText = t("products.imageGeneration.promptHelper", {
    defaultValue:
      "Describe the goal, audience, style, colors, hierarchy, and any must-have content. Use 30-500 words.",
  });
  useEffect(() => {
    if (generationStartedAt === null) {
      return;
    }

    const updateProgressTimestamp = () => {
      setProgressTimestamp(Date.now());
    };

    updateProgressTimestamp();
    const intervalId = window.setInterval(updateProgressTimestamp, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationStartedAt]);
  const generationProgress = getGenerationProgressFromTimestamp(
    generationStartedAt,
    ESTIMATED_GENERATION_DURATION_SECONDS,
    progressTimestamp,
  );
  const isPending = generationStartedAt !== null;

  useEffect(() => {
    if (!resultExpired) {
      return;
    }

    updateProductImageGenerationSessionState(sessionKey, {
      result: null,
    });
  }, [resultExpired, sessionKey]);

  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
    };
  }, []);

  const handleReferenceFilesChange = (files: File[]) => {
    setReferenceFiles(files.slice(0, MAX_REFERENCE_FILES));
  };

  const handleGenerate = () => {
    if (!user) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("products.imageGeneration.errors.authRequired", {
          defaultValue: "Sign in to generate images.",
        }),
      });
      return;
    }

    if (user.isAnonymous) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("products.imageGeneration.errors.anonymousNotAllowed", {
          defaultValue: "Anonymous accounts cannot use image generation.",
        }),
      });
      return;
    }

    if (!user.emailVerified) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("products.imageGeneration.errors.emailNotVerified", {
          defaultValue: "Verify your email address before generating images.",
        }),
      });
      return;
    }

    if (!resolvedChannelId) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error!" }),
        description: t("products.imageGeneration.errors.missingChannel", {
          defaultValue: "Image generation is temporarily unavailable.",
        }),
      });
      return;
    }

    if (isPending) {
      return;
    }

    updateProductImageGenerationSessionState(sessionKey, {
      generationStartedAt: Date.now(),
      result: null,
      rateLimitBlockedUntil: isRateLimitBlocked ? rateLimitBlockedUntil : null,
    });

    const abortController = new AbortController();
    generationAbortRef.current = abortController;

    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const getWindowAppCheckToken = window["__getKonfiAppCheckToken"];
        const latestAppCheckToken =
          (await getWindowAppCheckToken?.()) ?? appCheckToken?.token ?? "";
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("improvePrompt", improvePrompt ? "true" : "false");
        formData.append("style", resolvedStyle);
        formData.append("productId", product.id);
        formData.append("channelId", resolvedChannelId);
        formData.append("language", i18n.resolvedLanguage ?? "en");
        formData.append(
          "selectedAttributeOptions",
          JSON.stringify(selectedAttributeOptions),
        );
        if (pageCount) {
          formData.append("pageCount", String(pageCount));
        }
        if (width) {
          formData.append("width", String(width));
        }
        if (height) {
          formData.append("height", String(height));
        }
        referenceFiles.forEach((file) =>
          formData.append("referenceFiles", file),
        );

        const response = await fetch("/api/image-generation", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            ...(latestAppCheckToken.length > 0
              ? { "x-firebase-appcheck": latestAppCheckToken }
              : {}),
          },
          body: formData,
          signal: abortController.signal,
        });
        const payload = (await response.json()) as
          | StartStoreImageGenerationWorkflowResponse
          | { error?: string };

        if (!response.ok) {
          if (
            response.status === 429 &&
            payload &&
            "error" in payload &&
            payload.error !== "MONTHLY_BUDGET_EXCEEDED"
          ) {
            updateProductImageGenerationSessionState(sessionKey, {
              rateLimitBlockedUntil:
                Date.now() + storeImageGenerationLimits.rateLimitWindowMs,
            });
          }

          const errorMessage =
            payload && "error" in payload && payload.error
              ? mapStoreImageGenerationError({
                  message: payload.error,
                  t,
                })
              : t("products.imageGeneration.errors.generationFailed", {
                  defaultValue: "Image generation failed.",
                });
          throw new Error(errorMessage);
        }

        if (!("runId" in payload) || typeof payload.runId !== "string") {
          throw new Error(
            t("products.imageGeneration.errors.generationFailed", {
              defaultValue: "Image generation failed.",
            }),
          );
        }

        const getWorkflowStatus = async (
          runId: string,
        ): Promise<StoreImageGenerationWorkflowStatusResponse> => {
          const statusResponse = await fetch(
            `/api/image-generation?runId=${encodeURIComponent(runId)}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${idToken}`,
                ...(latestAppCheckToken.length > 0
                  ? { "x-firebase-appcheck": latestAppCheckToken }
                  : {}),
              },
              signal: abortController.signal,
            },
          );
          const statusPayload = (await statusResponse.json()) as
            | StoreImageGenerationWorkflowStatusResponse
            | { error?: string };

          if (!statusResponse.ok) {
            if (
              statusResponse.status === 429 &&
              statusPayload &&
              "error" in statusPayload &&
              statusPayload.error === "MONTHLY_BUDGET_EXCEEDED"
            ) {
              throw new Error("MONTHLY_BUDGET_EXCEEDED");
            }

            throw new Error(
              statusPayload && "error" in statusPayload && statusPayload.error
                ? statusPayload.error
                : "Image generation failed.",
            );
          }

          return statusPayload as StoreImageGenerationWorkflowStatusResponse;
        };

        const workflowResult = await pollStoreImageGenerationWorkflow({
          runId: payload.runId,
          getWorkflowStatus,
          pollTimeoutMs: WORKFLOW_POLL_TIMEOUT_MS,
          sleep: (ms) => sleep(ms, abortController.signal),
        });

        updateProductImageGenerationSessionState(sessionKey, {
          result: workflowResult,
          rateLimitBlockedUntil:
            workflowResult.remainingAttempts > 0
              ? null
              : Date.now() + storeImageGenerationLimits.rateLimitWindowMs,
        });

        toaster.success({
          title: t("products.imageGeneration.success.title", {
            defaultValue: "Image ready",
          }),
          description: t("products.imageGeneration.success.description", {
            defaultValue: "Your final AI production graphic is ready.",
          }),
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        console.error(error);
        if (error instanceof Error && error.message === "RATE_LIMIT_EXCEEDED") {
          updateProductImageGenerationSessionState(sessionKey, {
            rateLimitBlockedUntil:
              Date.now() + storeImageGenerationLimits.rateLimitWindowMs,
          });
        }
        toaster.error({
          title: t("common.error", { defaultValue: "Error!" }),
          description:
            error instanceof Error
              ? mapStoreImageGenerationError({
                  message: error.message,
                  t,
                })
              : t("products.imageGeneration.errors.generationFailed", {
                  defaultValue: "Image generation failed.",
                }),
        });
      } finally {
        if (generationAbortRef.current === abortController) {
          generationAbortRef.current = null;
        }

        updateProductImageGenerationSessionState(sessionKey, {
          generationStartedAt: null,
        });
      }
    })();
  };

  const handleAcceptGeneratedImage = () => {
    if (!availableResult || !onAcceptGeneratedImageAction) {
      return;
    }

    startAcceptTransition(async () => {
      try {
        const generatedFiles = await Promise.all(
          availableResult.images.map((image, index) =>
            dataUrlToFile({
              dataUrl: image.imageDataUrl,
              filename: getGeneratedImageFilename({
                productId: product.id,
                side: image.side,
                index,
              }),
            }),
          ),
        );
        await onAcceptGeneratedImageAction(generatedFiles);
        toaster.success({
          title:
            acceptMode === "addToCart"
              ? t("products.imageGeneration.addToCartSuccess.title", {
                  defaultValue: "Added to cart",
                })
              : t("products.imageGeneration.acceptSuccess.title", {
                  defaultValue: "Graphic attached",
                }),
          description:
            acceptMode === "addToCart"
              ? t("products.imageGeneration.addToCartSuccess.description", {
                  defaultValue:
                    "A new cart item has been created with the generated final files attached.",
                })
              : t("products.imageGeneration.acceptSuccess.description", {
                  defaultValue:
                    "The generated final graphic has been attached to this cart item.",
                }),
        });
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error!" }),
          description:
            error instanceof Error
              ? error.message
              : t("products.imageGeneration.errors.acceptFailed", {
                  defaultValue: "Failed to attach the generated graphic.",
                }),
        });
      }
    });
  };

  const handleDownloadGeneratedImage = () => {
    if (!availableResult) {
      return;
    }

    availableResult.images.forEach((image, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = image.imageDataUrl;
        link.download = getGeneratedImageFilename({
          productId: product.id,
          side: image.side,
          index,
        });
        link.click();
      }, index * 120);
    });
  };

  return {
    enabled: Boolean(
      runtimeConfig.features.aiImageGeneration &&
      effectiveImageGenerationConfig?.enabled,
    ),
    triggerStatusKey,
    contentProps: {
      helperText,
      prompt,
      onPromptChangeAction: (value) =>
        updateProductImageGenerationSessionState(sessionKey, {
          prompt: value,
        }),
      selectedStyle: resolvedStyle,
      onSelectedStyleChangeAction: (value: StoreGenerationStyle) =>
        updateProductImageGenerationSessionState(sessionKey, {
          style: value,
        }),
      improvePrompt,
      onImprovePromptChangeAction: (value) =>
        updateProductImageGenerationSessionState(sessionKey, {
          improvePrompt: value,
        }),
      referenceFiles,
      onReferenceFilesChangeAction: handleReferenceFilesChange,
      result: availableResult,
      generationProgress,
      isPending,
      isAccepting,
      isPromptInvalid,
      promptWordCount,
      selectedSize,
      pageCount,
      isLargeFormat,
      canGenerate,
      canAcceptResult: Boolean(onAcceptGeneratedImageAction),
      acceptActionKind: acceptMode,
      showAuthHint: !user,
      showAnonymousHint: Boolean(user?.isAnonymous),
      showEmailHint: Boolean(user && !user.isAnonymous && !user.emailVerified),
      maxPromptWords: MAX_PROMPT_WORDS,
      minPromptWords: MIN_PROMPT_WORDS,
      maxReferenceFiles: MAX_REFERENCE_FILES,
      maxReferenceFileSizeBytes: MAX_REFERENCE_FILE_SIZE_BYTES,
      onGenerateAction: handleGenerate,
      onAcceptGeneratedImageAction: handleAcceptGeneratedImage,
      onDownloadGeneratedImageAction: handleDownloadGeneratedImage,
    },
  };
}
