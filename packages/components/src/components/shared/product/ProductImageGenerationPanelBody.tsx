"use client";

import { TFunction } from "i18next";
import { ReactNode, useEffect, useRef } from "react";
import {
  Box,
  Button,
  FileUpload,
  HStack,
  Image,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Switch } from "../../ui";
import { Field } from "../../ui/field";
import { ProgressBar, ProgressRoot } from "../../ui/progress";
import { MaterialSymbol } from "../MaterialSymbol";
import {
  ProductImageGenerationStylePicker,
  type ProductImageGenerationStyleOption,
} from "./ProductImageGenerationStylePicker";

export type ProductImageGenerationPanelImage = {
  id: string;
  imageDataUrl: string;
  side: "single" | "front" | "back";
};

export type ProductImageGenerationPanelResultValue = {
  images: ProductImageGenerationPanelImage[];
};

export type ProductImageGenerationPanelProgressState = {
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  isOvertime: boolean;
  estimatedDurationSeconds: number;
};

export type ProductImageGenerationPanelBodyProps = {
  t: TFunction;
  language: string;
  infoContent?: ReactNode;
  helperText: string;
  prompt: string;
  onPromptChangeAction: (value: string) => void;
  selectedStyle?: string;
  styleOptions?: ProductImageGenerationStyleOption[];
  onSelectedStyleChangeAction?: (value: string) => void;
  improvePrompt: boolean;
  onImprovePromptChangeAction: (value: boolean) => void;
  showImprovePrompt?: boolean;
  referenceFiles: File[];
  onReferenceFilesChangeAction: (files: File[]) => void;
  result: ProductImageGenerationPanelResultValue | null;
  resultMeta?: ReactNode;
  generationProgress: ProductImageGenerationPanelProgressState | null;
  isPending: boolean;
  isAccepting: boolean;
  isPromptInvalid: boolean;
  promptWordCount: number;
  selectedSize: {
    width?: number;
    height?: number;
  };
  canGenerate: boolean;
  canAcceptResult: boolean;
  acceptActionKind?: "attach" | "addToCart";
  maxPromptWords: number;
  maxReferenceFiles: number;
  maxReferenceFileSizeBytes: number;
  onGenerateAction: () => void;
  onAcceptGeneratedImageAction: () => void;
  onDownloadGeneratedImageAction: () => void;
};

function formatMegabytes(sizeInBytes: number, language: string): string {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(sizeInBytes / (1024 * 1024));
}

function ProductImageGenerationPanelResult({
  t,
  result,
  resultMeta,
  isAccepting,
  canAcceptResult,
  acceptActionKind = "attach",
  onAcceptGeneratedImageAction,
  onDownloadGeneratedImageAction,
}: {
  t: TFunction;
  result: ProductImageGenerationPanelResultValue;
  resultMeta?: ReactNode;
  isAccepting: boolean;
  canAcceptResult: boolean;
  acceptActionKind?: "attach" | "addToCart";
  onAcceptGeneratedImageAction: () => void;
  onDownloadGeneratedImageAction: () => void;
}) {
  const hasMultipleImages = result.images.length > 1;

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
        <Text fontWeight="semibold" fontSize="lg">
          {hasMultipleImages
            ? t("products.imageGeneration.resultTitleMultiple", {
                defaultValue: "Generated final graphics",
              })
            : t("products.imageGeneration.resultTitle", {
                defaultValue: "Generated final graphic",
              })}
        </Text>
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
          <Box flex="1" minW="12rem">
            {resultMeta}
          </Box>
          <HStack flexWrap="wrap">
            {canAcceptResult ? (
              <Button
                colorPalette="primary"
                onClick={onAcceptGeneratedImageAction}
                loading={isAccepting}
                loadingText={
                  acceptActionKind === "addToCart"
                    ? t("products.imageGeneration.addToCartLoading", {
                        defaultValue: "Adding to cart…",
                      })
                    : t("products.imageGeneration.attaching", {
                        defaultValue: "Attaching…",
                      })
                }
              >
                {acceptActionKind === "addToCart"
                  ? hasMultipleImages
                    ? t("products.imageGeneration.addToCartButtonMultiple", {
                        defaultValue: "Add to cart with all generated files",
                      })
                    : t("products.imageGeneration.addToCartButton", {
                        defaultValue: "Add to cart with generated file",
                      })
                  : hasMultipleImages
                    ? t("products.imageGeneration.acceptButtonMultiple", {
                        defaultValue: "Accept and attach all files",
                      })
                    : t("products.imageGeneration.acceptButton", {
                        defaultValue: "Accept and attach",
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

export function ProductImageGenerationPanelBody({
  t,
  language,
  infoContent,
  helperText,
  prompt,
  onPromptChangeAction,
  selectedStyle,
  styleOptions,
  onSelectedStyleChangeAction,
  improvePrompt,
  onImprovePromptChangeAction,
  showImprovePrompt = true,
  referenceFiles,
  onReferenceFilesChangeAction,
  result,
  resultMeta,
  generationProgress,
  isPending,
  isAccepting,
  isPromptInvalid,
  promptWordCount,
  selectedSize,
  canGenerate,
  canAcceptResult,
  acceptActionKind = "attach",
  maxPromptWords,
  maxReferenceFiles,
  maxReferenceFileSizeBytes,
  onGenerateAction,
  onAcceptGeneratedImageAction,
  onDownloadGeneratedImageAction,
}: ProductImageGenerationPanelBodyProps) {
  const generationRegionRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledToProgressRef = useRef(false);
  const hasAutoScrolledToResultRef = useRef(false);

  useEffect(() => {
    if (!generationProgress) {
      hasAutoScrolledToProgressRef.current = false;
      return;
    }

    if (hasAutoScrolledToProgressRef.current) {
      return;
    }

    hasAutoScrolledToProgressRef.current = true;
    window.requestAnimationFrame(() => {
      generationRegionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [generationProgress]);

  useEffect(() => {
    if (!result) {
      hasAutoScrolledToResultRef.current = false;
      return;
    }

    if (hasAutoScrolledToResultRef.current) {
      return;
    }

    hasAutoScrolledToResultRef.current = true;
    window.requestAnimationFrame(() => {
      generationRegionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [result]);

  return (
    <VStack align="stretch" gap={4}>
      {infoContent}

      <Box
        borderWidth="1px"
        borderColor="border.emphasized"
        borderRadius="3xl"
        p={{ base: 4, md: 4 }}
        bg="bg"
      >
        <VStack align="stretch" gap={4}>
          <Field
            invalid={isPromptInvalid}
            label={t("products.imageGeneration.promptLabel", {
              defaultValue: "Design brief",
            })}
            helperText={helperText}
            errorText={t("products.imageGeneration.promptError", {
              defaultValue: "Use between 30 and 500 words.",
            })}
          >
            <Textarea
              name="imageGenerationPrompt"
              value={prompt}
              onChange={(event) => onPromptChangeAction(event.target.value)}
              minH="120px"
              borderRadius="3xl"
              autoComplete="off"
              bg="bg.subtle"
              placeholder={t("products.imageGeneration.promptPlaceholder", {
                defaultValue:
                  "Example: Design a modern flyer for a spring coffee tasting event. Use a warm cream background, deep green accents, clean sans-serif typography, and a premium editorial feel. Highlight the tasting date, limited seats, and a subtle illustrated coffee leaf motif…",
              })}
            />
          </Field>

          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Text
              fontSize="sm"
              color={isPromptInvalid ? "fg.error" : "fg.muted"}
            >
              {t("products.imageGeneration.wordCount", {
                defaultValue: "{{count}} / {{max}} words",
                count: promptWordCount,
                max: maxPromptWords,
              })}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {selectedSize.width && selectedSize.height
                ? t("products.imageGeneration.currentFormat", {
                    defaultValue: "Current format: {{width}} × {{height}} mm",
                    width: selectedSize.width,
                    height: selectedSize.height,
                  })
                : t("products.imageGeneration.currentFormatMissing", {
                    defaultValue:
                      "Current format will be derived from the product configuration.",
                  })}
            </Text>
          </HStack>

          {styleOptions &&
          styleOptions.length > 0 &&
          selectedStyle &&
          onSelectedStyleChangeAction ? (
            <ProductImageGenerationStylePicker
              t={t}
              value={selectedStyle}
              options={styleOptions}
              onChangeAction={onSelectedStyleChangeAction}
            />
          ) : null}

          {showImprovePrompt ? (
            <Box borderRadius="3xl" bg="bg.subtle" p={4}>
              <VStack align="stretch" gap={2}>
                <Switch
                  colorPalette="primary"
                  checked={improvePrompt}
                  onCheckedChange={({ checked }) =>
                    onImprovePromptChangeAction(checked === true)
                  }
                >
                  {t("products.imageGeneration.improvePromptLabel", {
                    defaultValue: "Improve my brief with AI before generating",
                  })}
                </Switch>
                <Text fontSize="sm" color="fg.muted" ps="14">
                  {t("products.imageGeneration.improvePromptDescription", {
                    defaultValue:
                      "Optional: let AI sharpen your brief before generating.",
                  })}
                </Text>
              </VStack>
            </Box>
          ) : null}

          <Field
            label={t("products.imageGeneration.referenceLabel", {
              defaultValue: "Reference images (optional)",
            })}
            helperText={t("products.imageGeneration.referenceHelper", {
              defaultValue:
                "Up to 3 files. Use them for inspiration only — AI should not copy logos, layouts, or copyrighted artwork.",
            })}
          >
            <FileUpload.Root
              acceptedFiles={referenceFiles}
              maxFiles={maxReferenceFiles}
              maxFileSize={maxReferenceFileSizeBytes}
              accept={["image/png", "image/jpeg", "image/webp"]}
              onFileChange={(details) =>
                onReferenceFilesChangeAction(details.acceptedFiles)
              }
            >
              <FileUpload.HiddenInput name="imageGenerationReferences" />
              <FileUpload.Dropzone
                borderRadius="3xl"
                borderStyle="dashed"
                borderColor="border.emphasized"
                minH="5.5rem"
                bg="bg.subtle"
                w="full"
              >
                <MaterialSymbol>upload</MaterialSymbol>
                <FileUpload.DropzoneContent>
                  <Text fontWeight="medium">
                    {t("products.imageGeneration.referenceDropzoneTitle", {
                      defaultValue:
                        "Drag and drop reference images here or click to browse",
                    })}
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    {t(
                      "products.imageGeneration.referenceDropzoneDescription",
                      {
                        defaultValue:
                          "PNG, JPG, or WebP only. Up to {{count}} files, {{size}} MB each.",
                        count: maxReferenceFiles,
                        size: formatMegabytes(
                          maxReferenceFileSizeBytes,
                          language,
                        ),
                      },
                    )}
                  </Text>
                </FileUpload.DropzoneContent>
              </FileUpload.Dropzone>
              <FileUpload.List showSize clearable />
            </FileUpload.Root>
          </Field>

          <HStack
            justify="space-between"
            align="center"
            flexWrap="wrap"
            gap={3}
          >
            <Text fontSize="sm" color="fg.muted" maxW="32rem">
              {t("products.imageGeneration.generateHint", {
                defaultValue:
                  "Your brief and selected style are combined on the server before generation.",
              })}
            </Text>
            <Button
              colorPalette="primary"
              borderRadius="full"
              px={8}
              onClick={onGenerateAction}
              loading={isPending}
              loadingText={t("products.imageGeneration.generating", {
                defaultValue: "Generating…",
              })}
              disabled={!canGenerate}
            >
              {t("products.imageGeneration.generateButton", {
                defaultValue: "Generate final graphic",
              })}
            </Button>
          </HStack>
        </VStack>
      </Box>

      {generationProgress || result ? (
        <Box ref={generationRegionRef}>
          <VStack align="stretch" gap={6}>
            {generationProgress ? (
              <Box
                borderWidth="1px"
                borderColor="border.emphasized"
                borderRadius="3xl"
                p={4}
                bg="bg.subtle"
              >
                <VStack align="stretch" gap={3}>
                  <HStack
                    justify="space-between"
                    align="start"
                    flexWrap="wrap"
                    gap={2}
                  >
                    <Text fontWeight="medium">
                      {t("products.imageGeneration.generationStatusTitle", {
                        defaultValue: "Creating your production graphic…",
                      })}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      {t("products.imageGeneration.generationElapsed", {
                        defaultValue: "{{count}}s elapsed",
                        count: generationProgress.elapsedSeconds,
                      })}
                    </Text>
                  </HStack>
                  <ProgressRoot
                    value={generationProgress.progressPercent}
                    borderRadius="full"
                    size="sm"
                  >
                    <ProgressBar />
                  </ProgressRoot>
                  <Text fontSize="sm" color="fg.muted">
                    {generationProgress.isOvertime
                      ? t("products.imageGeneration.generationStatusOvertime", {
                          defaultValue:
                            "This can take up to a minute. Finalizing the image now…",
                        })
                      : t(
                          "products.imageGeneration.generationStatusRemaining",
                          {
                            defaultValue:
                              "Estimated time remaining: about {{count}} seconds.",
                            count: generationProgress.remainingSeconds,
                          },
                        )}
                  </Text>
                </VStack>
              </Box>
            ) : null}

            {result ? (
              <ProductImageGenerationPanelResult
                t={t}
                result={result}
                resultMeta={resultMeta}
                isAccepting={isAccepting}
                canAcceptResult={canAcceptResult}
                acceptActionKind={acceptActionKind}
                onAcceptGeneratedImageAction={onAcceptGeneratedImageAction}
                onDownloadGeneratedImageAction={onDownloadGeneratedImageAction}
              />
            ) : null}
          </VStack>
        </Box>
      ) : null}
    </VStack>
  );
}
