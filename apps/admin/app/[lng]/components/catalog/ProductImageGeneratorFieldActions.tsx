"use client";

import { attachGeneratedProductImages } from "@/actions/attach-generated-product-images";
import {
  getImageGenerationWorkflowStatus,
  startImageGenerationWorkflow,
} from "@/actions/generate-images-workflow";
import {
  buildProductImageGenerationRequest,
  DEFAULT_PRODUCT_IMAGE_GENERATION_MODEL,
  getProductImageGenerationModels,
  GPT_IMAGE_2_PRODUCT_IMAGE_MODEL,
  isProductImageGenerationModel,
  NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL,
  NANO_BANANA_2_PRODUCT_IMAGE_MODEL,
  type ProductImageGenerationModel,
} from "@/lib/ai/product-image-generation/request";
import { arePaidGatewayImageModelsVisible } from "@/lib/ai/gateway-image-models";
import { buildSuggestedProductImagePrompt } from "@/lib/ai/product-image-generation/prompt";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import { useT } from "@/i18n/client";
import { useTenantContext } from "@/context/tenant";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  getEffectiveReferenceMimeType,
  getMaxReferenceImagesForModel,
} from "@/lib/utils/reference-image";
import {
  generateProductImageOptions,
  PRODUCT_IMAGE_GENERATION_WORKFLOW_COUNT,
  type GeneratedWorkflowImage,
} from "./product-image-generation-workflows";
import {
  Box,
  Button,
  Dialog,
  Field,
  HStack,
  Image,
  Portal,
  Select,
  Spinner,
  Text,
  Textarea,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { CloseButton, MaterialSymbol, toaster } from "@konfi/components";
import { FieldData } from "@konfi/types";
import { GEMINI_REFERENCE_IMAGE_MIME_TYPES } from "@konfi/types";
import { useAuth } from "context/auth";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { mutate as swrMutate } from "swr";

import { ReferenceImageLibraryDialog } from "../../tools/image-generator/ReferenceImageLibraryDialog";

const MAX_REFERENCE_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const REFERENCE_IMAGE_ACCEPT = [
  ...GEMINI_REFERENCE_IMAGE_MIME_TYPES,
  ".heic",
  ".heif",
].join(",");
const REFERENCE_IMAGE_ALLOWED_MIME_TYPES = new Set<string>(
  GEMINI_REFERENCE_IMAGE_MIME_TYPES,
);

const PRODUCT_IMAGE_MODEL_COPY = {
  [NANO_BANANA_2_LITE_PRODUCT_IMAGE_MODEL]: {
    defaultLabel: "Nano Banana 2 Lite",
    labelKey: "productImageGenerator.modelNanoBanana2Lite",
    summaryDefaultValue:
      "Generates 1 square product image with Nano Banana 2 Lite.",
    summaryKey: "productImageGenerator.defaultRunNanoBanana2Lite",
  },
  [NANO_BANANA_2_PRODUCT_IMAGE_MODEL]: {
    defaultLabel: "Nano Banana 2",
    labelKey: "productImageGenerator.modelNanoBanana2",
    summaryDefaultValue: "Generates 1 square product image with Nano Banana 2.",
    summaryKey: "productImageGenerator.defaultRun",
  },
  [GPT_IMAGE_2_PRODUCT_IMAGE_MODEL]: {
    defaultLabel: "OpenAI GPT Image 2",
    labelKey: "productImageGenerator.modelGptImage2",
    summaryDefaultValue:
      "Generates 1 square product image with OpenAI GPT Image 2 at 1024 × 1024, medium quality.",
    summaryKey: "productImageGenerator.defaultRunGptImage2",
  },
} as const satisfies Record<
  ProductImageGenerationModel,
  {
    defaultLabel: string;
    labelKey: string;
    summaryDefaultValue: string;
    summaryKey: string;
  }
>;

type NamedPromptValue = {
  name?: string | null;
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

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  return [];
}

function isNamedPromptValue(value: unknown): value is NamedPromptValue {
  return typeof value === "object" && value !== null && "name" in value;
}

export function ProductImageGeneratorFieldActions({
  fieldData,
}: {
  fieldData: FieldData;
}) {
  const { isAllowed: canUseImageGeneration } = useTenantModuleAccess(
    "aiImage",
    { denyFreePlan: true },
  );

  if (!canUseImageGeneration) {
    return null;
  }

  return <ProductImageGeneratorFieldActionsContent fieldData={fieldData} />;
}

function ProductImageGeneratorFieldActionsContent({
  fieldData,
}: {
  fieldData: FieldData;
}) {
  const { t, i18n } = useT(["imageGenerator", "translation"]);
  const tenantContext = useTenantContext();
  const { user } = useAuth();
  const { setValue } = useFormContext();
  const watchedValues = useWatch({
    name: ["name", "description", "category", "specialNotes", fieldData.name],
  });
  const [open, setOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [generatedImage, setGeneratedImage] =
    useState<GeneratedWorkflowImage | null>(null);
  const [isUploadingReferenceImages, setIsUploadingReferenceImages] =
    useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
  const [fileUploadResetKey, setFileUploadResetKey] = useState(0);
  const [selectedModel, setSelectedModel] =
    useState<ProductImageGenerationModel>(
      DEFAULT_PRODUCT_IMAGE_GENERATION_MODEL,
    );
  const lastSuggestedPromptRef = useRef("");
  const referenceFileInputId = useId();

  const [name, description, category, specialNotes, currentImageValue] =
    watchedValues;

  const destinationPrefix = fieldData.imageProps?.prefix;
  const includePrefix = fieldData.imageProps?.includePrefix ?? false;
  const maxImageCount = fieldData.imageProps?.maxNumber ?? 5;
  const adminAccountId = user?.uid ?? null;
  const maxReferenceImages = getMaxReferenceImagesForModel(selectedModel);
  const currentImageNames = useMemo(
    () => toStringArray(currentImageValue),
    [currentImageValue],
  );
  const remainingImageSlots = Math.max(
    0,
    maxImageCount - currentImageNames.length,
  );
  const includeGatewayModels =
    !isSharedSaasTenantRuntime(tenantContext) &&
    arePaidGatewayImageModelsVisible();
  const availableModels = useMemo(
    () => getProductImageGenerationModels({ includeGatewayModels }),
    [includeGatewayModels],
  );
  const modelOptions = useMemo(
    () =>
      availableModels.map((model) => ({
        label: t(PRODUCT_IMAGE_MODEL_COPY[model].labelKey, {
          defaultValue: PRODUCT_IMAGE_MODEL_COPY[model].defaultLabel,
        }),
        value: model,
      })),
    [availableModels, t],
  );
  const modelCollection = useMemo(
    () =>
      createListCollection({
        items: modelOptions,
      }),
    [modelOptions],
  );
  const selectedModelLabel = useMemo(
    () =>
      modelOptions.find((option) => option.value === selectedModel)?.label ??
      t(PRODUCT_IMAGE_MODEL_COPY[selectedModel].labelKey, {
        defaultValue: PRODUCT_IMAGE_MODEL_COPY[selectedModel].defaultLabel,
      }),
    [modelOptions, selectedModel, t],
  );
  const selectedModelSummary = t(
    PRODUCT_IMAGE_MODEL_COPY[selectedModel].summaryKey,
    {
      defaultValue: PRODUCT_IMAGE_MODEL_COPY[selectedModel].summaryDefaultValue,
    },
  );

  useEffect(() => {
    if (!availableModels.includes(selectedModel)) {
      setSelectedModel(DEFAULT_PRODUCT_IMAGE_GENERATION_MODEL);
    }
  }, [availableModels, selectedModel]);
  const suggestedPrompt = useMemo(() => {
    const categoryPromptValue =
      typeof category === "string" || isNamedPromptValue(category)
        ? category
        : undefined;

    return buildSuggestedProductImagePrompt({
      name: typeof name === "string" ? name : undefined,
      description: typeof description === "string" ? description : undefined,
      category: categoryPromptValue,
      specialNotes: typeof specialNotes === "string" ? specialNotes : undefined,
      currentLanguage: i18n.resolvedLanguage ?? i18n.language,
    });
  }, [
    category,
    description,
    i18n.language,
    i18n.resolvedLanguage,
    name,
    specialNotes,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPromptDraft((previousPrompt) => {
      const previousSuggestedPrompt = lastSuggestedPromptRef.current;
      lastSuggestedPromptRef.current = suggestedPrompt;

      if (!previousPrompt || previousPrompt === previousSuggestedPrompt) {
        return suggestedPrompt;
      }

      return previousPrompt;
    });
  }, [open, suggestedPrompt]);

  useEffect(() => {
    if (!open) {
      setReferenceLibraryOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (referenceImages.length <= maxReferenceImages) {
      return;
    }

    setReferenceImages((previousImages) =>
      previousImages.slice(0, maxReferenceImages),
    );
    setFileUploadResetKey((value) => value + 1);
    toaster.warning({
      title: t("common.warning", { defaultValue: "Warning" }),
      description: t("productImageGenerator.referenceLimitAdjusted", {
        defaultValue:
          "Only the first {{count}} reference images are kept for {{model}}.",
        count: maxReferenceImages,
        model: selectedModelLabel,
      }),
    });
  }, [maxReferenceImages, referenceImages.length, selectedModelLabel, t]);

  const handleReferenceFilesSelected = useCallback(
    async (incomingFiles: File[]) => {
      if (!adminAccountId || incomingFiles.length <= 0) {
        return;
      }

      const remainingReferenceSlots = Math.max(
        0,
        maxReferenceImages - referenceImages.length,
      );
      if (remainingReferenceSlots <= 0) {
        toaster.warning({
          title: t("common.warning", { defaultValue: "Warning" }),
          description: t("imageGenerator.tooManyReferenceImages", {
            defaultValue:
              "You have reached the maximum number of reference images.",
          }),
        });
        return;
      }

      const validFiles = incomingFiles.filter((file) => {
        const effectiveMimeType = getEffectiveReferenceMimeType(file);
        return (
          file.size <= MAX_REFERENCE_IMAGE_FILE_SIZE_BYTES &&
          effectiveMimeType &&
          REFERENCE_IMAGE_ALLOWED_MIME_TYPES.has(effectiveMimeType)
        );
      });
      const filesToUpload = validFiles.slice(0, remainingReferenceSlots);

      if (validFiles.length < incomingFiles.length) {
        toaster.warning({
          title: t("common.warning", { defaultValue: "Warning" }),
          description: t("imageGenerator.invalidReferenceImageType", {
            defaultValue:
              "Unsupported file type. Please use PNG, JPEG, WEBP, HEIC, or HEIF under 5MB.",
          }),
        });
      }

      if (filesToUpload.length < validFiles.length) {
        toaster.warning({
          title: t("common.warning", { defaultValue: "Warning" }),
          description: t("imageGenerator.someFilesSkipped", {
            defaultValue:
              "Some files were skipped because of the attachment limit.",
          }),
        });
      }

      if (filesToUpload.length <= 0) {
        toaster.warning({
          title: t("common.warning", { defaultValue: "Warning" }),
          description: t("imageGenerator.invalidReferenceImageType", {
            defaultValue:
              "Unsupported file type. Please use PNG, JPEG, WEBP, HEIC, or HEIF under 5MB.",
          }),
        });
        return;
      }

      setIsUploadingReferenceImages(true);
      try {
        const { getDownloadURL, ref, uploadBytes } =
          await import("firebase/storage");
        const { storage } = await import("@/lib/firebase/clientApp");
        const dateStr = new Date().toISOString().split("T")[0];
        const uploadedUrls = await Promise.all(
          filesToUpload.map(async (file) => {
            const effectiveMimeType = getEffectiveReferenceMimeType(file);
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `ai/reference/accounts/${adminAccountId}/${dateStr}/${createClientJobId()}-${safeName}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file, {
              contentType: effectiveMimeType,
            });

            return getDownloadURL(storageRef);
          }),
        );

        setReferenceImages((previousImages) => [
          ...previousImages,
          ...uploadedUrls,
        ]);
      } catch (error) {
        console.error("Error uploading reference images:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("imageGenerator.failedToUploadImage", {
            defaultValue: "Failed to upload image",
          }),
        });
      } finally {
        setIsUploadingReferenceImages(false);
      }
    },
    [adminAccountId, maxReferenceImages, referenceImages.length, t],
  );

  const handleGenerate = useCallback(async () => {
    if (!promptDraft.trim()) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("imageGenerator.enterPrompt", {
          defaultValue: "Enter a prompt first.",
        }),
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);
    try {
      const request = buildProductImageGenerationRequest({
        language: i18n.resolvedLanguage ?? i18n.language,
        maxReferenceImages,
        model: selectedModel,
        prompt: promptDraft.trim(),
        referenceImages,
      });
      const { images, errorMessages, filteredReasons } =
        await generateProductImageOptions({
          workflowCount: PRODUCT_IMAGE_GENERATION_WORKFLOW_COUNT,
          startWorkflow: () =>
            startImageGenerationWorkflow({
              jobId: createClientJobId(),
              request: {
                ...request,
                referenceImages: request.referenceImages
                  ? [...request.referenceImages]
                  : undefined,
              },
            }),
          getWorkflowStatus: getImageGenerationWorkflowStatus,
          pollTimeoutMs: POLL_TIMEOUT_MS,
          sleep,
        });

      if (images.length <= 0) {
        throw new Error(
          errorMessages[0] ??
            t("error.failedToGenerate", {
              defaultValue: "Failed to generate image.",
            }),
        );
      }

      setGeneratedImage(images[0] ?? null);

      if (filteredReasons.length > 0) {
        toaster.warning({
          title: t("imageGenerator.someImagesFiltered", {
            defaultValue: "Some images filtered",
          }),
          description: filteredReasons.join(" "),
        });
      }
    } catch (error) {
      console.error("Error generating product images:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("error.failedToGenerate", {
                defaultValue: "Failed to generate image.",
              }),
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    maxReferenceImages,
    promptDraft,
    referenceImages,
    selectedModel,
    t,
  ]);

  const handleAttachGeneratedImage = useCallback(async () => {
    if (!destinationPrefix || !generatedImage) {
      return;
    }

    if (remainingImageSlots <= 0) {
      toaster.warning({
        title: t("common.warning", { defaultValue: "Warning" }),
        description: t("productImageGenerator.noImageSlots", {
          defaultValue:
            "Remove an existing product image before attaching a new one.",
        }),
      });
      return;
    }

    setIsAttaching(true);
    try {
      const attachedImages = await attachGeneratedProductImages({
        destinationPrefix,
        sourceStoragePaths: [generatedImage.storagePath],
      });
      const nextValues = includePrefix
        ? attachedImages.fullPaths
        : attachedImages.fileNames;

      setValue(fieldData.name, [...currentImageNames, ...nextValues], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      await swrMutate(destinationPrefix);
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("productImageGenerator.imagesAttached", {
          defaultValue: "Generated image was added to the product gallery.",
        }),
      });
      setOpen(false);
    } catch (error) {
      console.error("Error attaching generated images:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("productImageGenerator.attachFailed", {
                defaultValue: "Failed to attach the generated image.",
              }),
      });
    } finally {
      setIsAttaching(false);
    }
  }, [
    currentImageNames,
    destinationPrefix,
    fieldData.name,
    generatedImage,
    includePrefix,
    remainingImageSlots,
    setValue,
    t,
  ]);

  if (fieldData.name !== "spec.images" || !destinationPrefix) {
    return null;
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      lazyMount
    >
      <Dialog.Trigger asChild>
        <Button variant="ai" size="sm" disabled={!adminAccountId}>
          <MaterialSymbol>auto_awesome</MaterialSymbol>
          {t("productImageGenerator.generateButton", {
            defaultValue: "Generate with AI",
          })}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="5xl">
            <Dialog.Header>
              <Dialog.Title>
                {t("productImageGenerator.title", {
                  defaultValue: "Generate product images",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text fontSize="sm" color="fg.muted">
                  {t("productImageGenerator.helperText", {
                    defaultValue:
                      "The suggested prompt is built from the current product name.",
                  })}
                </Text>
                <Field.Root maxW={{ base: "full", md: "md" }}>
                  <Field.Label>
                    {t("productImageGenerator.modelLabel", {
                      defaultValue: "Model",
                    })}
                  </Field.Label>
                  <Select.Root
                    collection={modelCollection}
                    value={[selectedModel]}
                    onValueChange={({ value }) => {
                      const nextValue = value[0];
                      if (
                        !nextValue ||
                        !isProductImageGenerationModel(nextValue) ||
                        !availableModels.includes(nextValue)
                      ) {
                        return;
                      }

                      setSelectedModel(nextValue);
                    }}
                    size="sm"
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger borderRadius="2xl">
                        <Select.ValueText
                          placeholder={t("imageGenerator.selectModel", {
                            defaultValue: "Select model",
                          })}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {modelOptions.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </Field.Root>
                <Textarea
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  minH="220px"
                  borderRadius="3xl"
                />
                <HStack justify="flex-start" flexWrap="wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPromptDraft(suggestedPrompt)}
                  >
                    <MaterialSymbol>refresh</MaterialSymbol>
                    {t("productImageGenerator.resetPrompt", {
                      defaultValue: "Reset prompt",
                    })}
                  </Button>
                </HStack>
                <HStack gap={2} flexWrap="wrap">
                  <input
                    key={fileUploadResetKey}
                    id={referenceFileInputId}
                    type="file"
                    hidden
                    multiple={maxReferenceImages > 1}
                    accept={REFERENCE_IMAGE_ACCEPT}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      void handleReferenceFilesSelected(files);
                    }}
                  />
                  {!adminAccountId || isUploadingReferenceImages ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={isUploadingReferenceImages}
                      disabled
                    >
                      <MaterialSymbol>upload</MaterialSymbol>
                      {t("productImageGenerator.uploadReferences", {
                        defaultValue: "Upload references",
                      })}
                    </Button>
                  ) : (
                    <Button asChild type="button" size="sm" variant="outline">
                      <label htmlFor={referenceFileInputId}>
                        <MaterialSymbol>upload</MaterialSymbol>
                        {t("productImageGenerator.uploadReferences", {
                          defaultValue: "Upload references",
                        })}
                      </label>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!adminAccountId || isUploadingReferenceImages}
                    onClick={() => setReferenceLibraryOpen(true)}
                  >
                    <MaterialSymbol>folder_open</MaterialSymbol>
                    {t("imageGenerator.selectFromStorage", {
                      defaultValue: "Select from storage",
                    })}
                  </Button>
                  <ReferenceImageLibraryDialog
                    t={t}
                    selectedUrls={referenceImages}
                    onChangeSelectedUrls={(nextImages) => {
                      setReferenceImages(nextImages);
                      setFileUploadResetKey((value) => value + 1);
                    }}
                    maxSelected={maxReferenceImages}
                    allowedMimeTypes={REFERENCE_IMAGE_ALLOWED_MIME_TYPES}
                    disabled={!adminAccountId || isUploadingReferenceImages}
                    open={referenceLibraryOpen}
                    onOpenChange={setReferenceLibraryOpen}
                    hideTrigger
                    rootPath={
                      adminAccountId
                        ? `ai/reference/accounts/${adminAccountId}`
                        : undefined
                    }
                  />
                </HStack>
                {referenceImages.length > 0 && (
                  <HStack gap={2} flexWrap="wrap">
                    {referenceImages.map((referenceImage, index) => (
                      <Box key={referenceImage} position="relative">
                        <Image
                          src={referenceImage}
                          alt="Reference"
                          boxSize="72px"
                          objectFit="cover"
                          borderRadius="xl"
                        />
                        <Button
                          type="button"
                          size="xs"
                          variant="solid"
                          colorPalette="red"
                          position="absolute"
                          top={1}
                          right={1}
                          onClick={() => {
                            setReferenceImages((previousImages) =>
                              previousImages.filter(
                                (_, imageIndex) => imageIndex !== index,
                              ),
                            );
                            setFileUploadResetKey((value) => value + 1);
                          }}
                        >
                          <MaterialSymbol>close</MaterialSymbol>
                        </Button>
                      </Box>
                    ))}
                  </HStack>
                )}
                <HStack justify="space-between" flexWrap="wrap">
                  <Text fontSize="sm" color="fg.muted">
                    {selectedModelSummary}
                  </Text>
                  <Button
                    type="button"
                    colorPalette="primary"
                    onClick={() => void handleGenerate()}
                    loading={isGenerating}
                    variant="ai"
                  >
                    <MaterialSymbol>auto_awesome</MaterialSymbol>
                    {t("actions.generate", { defaultValue: "Generate" })}
                  </Button>
                </HStack>
                {isGenerating && (
                  <HStack gap={2} color="fg.muted">
                    <Spinner size="sm" />
                    <Text fontSize="sm">
                      {t("productImageGenerator.generating", {
                        defaultValue: "Generating product image…",
                      })}
                    </Text>
                  </HStack>
                )}
                {generatedImage && (
                  <VStack
                    align="stretch"
                    gap={4}
                    w="full"
                    maxW={{ base: "full", md: "md" }}
                    mx="auto"
                  >
                    <Box
                      borderWidth="1px"
                      borderColor="border"
                      borderRadius="2xl"
                      overflow="hidden"
                    >
                      <Image
                        src={generatedImage.url}
                        alt={generatedImage.id}
                        w="full"
                        aspectRatio={1}
                        objectFit="cover"
                      />
                    </Box>
                    <HStack justify="space-between" flexWrap="wrap">
                      <Text fontSize="sm" color="fg.muted">
                        {t("productImageGenerator.remainingSlots", {
                          defaultValue:
                            "Remaining product image slots: {{count}}",
                          count: remainingImageSlots,
                        })}
                      </Text>
                      <Button
                        type="button"
                        colorPalette="primary"
                        disabled={remainingImageSlots <= 0}
                        loading={isAttaching}
                        onClick={() => void handleAttachGeneratedImage()}
                      >
                        <MaterialSymbol>add_photo_alternate</MaterialSymbol>
                        {t("productImageGenerator.attachSelected", {
                          defaultValue: "Attach image",
                        })}
                      </Button>
                    </HStack>
                  </VStack>
                )}
              </VStack>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
