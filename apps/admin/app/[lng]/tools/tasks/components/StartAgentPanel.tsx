"use client";

import { useT } from "@/i18n/client";
import type {
  AgentFileMetadata,
  AgentTaskType,
} from "@/lib/ai/durable-agents/types";
import {
  Box,
  Button,
  FileUpload,
  HStack,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILES,
  IMPOSITION_SUPPORTED_FILE_TYPES,
} from "@konfi/types";
import { useRef, useState } from "react";

import { readAgentFileMetadataInBrowser } from "./agent-file-metadata.client";

type StartableAgentTaskType = Exclude<AgentTaskType, "invoice">;

type StartAgentPanelProps = {
  isStarting: boolean;
  onStartAction: (params: {
    fileMetadata?: AgentFileMetadata[];
    taskType: StartableAgentTaskType;
    prompt: string;
  }) => Promise<string | null>;
};

const AGENT_OPTIONS: Array<{
  icon: string;
  taskType: StartableAgentTaskType;
  translationKey: string;
  defaultValue: string;
}> = [
  {
    defaultValue: "Autonomous",
    icon: "auto_awesome",
    taskType: "autonomous",
    translationKey: "agents.taskType.autonomous",
  },
  {
    defaultValue: "Product",
    icon: "inventory",
    taskType: "product",
    translationKey: "agents.taskType.product",
  },
  {
    defaultValue: "Quote",
    icon: "request_quote",
    taskType: "quote",
    translationKey: "agents.taskType.quote",
  },
  {
    defaultValue: "Order",
    icon: "shopping_cart_checkout",
    taskType: "order",
    translationKey: "agents.taskType.order",
  },
];

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1,
    }).format(sizeBytes / 1024)} KB`;
  }

  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(sizeBytes / (1024 * 1024))} MB`;
}

function formatDimension(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

export default function StartAgentPanel({
  isStarting,
  onStartAction,
}: StartAgentPanelProps) {
  const { t } = useT();
  const [taskType, setTaskType] =
    useState<StartableAgentTaskType>("autonomous");
  const [prompt, setPrompt] = useState("");
  const [fileMetadata, setFileMetadata] = useState<AgentFileMetadata[]>([]);
  const [fileUploadKey, setFileUploadKey] = useState(0);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const fileReadRequestId = useRef(0);

  const resetFileState = () => {
    fileReadRequestId.current += 1;
    setFileMetadata([]);
    setMetadataError(null);
    setIsReadingFiles(false);
    setFileUploadKey((key) => key + 1);
  };

  const handleFileChange = async (files: File[]) => {
    const requestId = fileReadRequestId.current + 1;
    fileReadRequestId.current = requestId;
    setMetadataError(null);

    if (files.length === 0) {
      setFileMetadata([]);
      setIsReadingFiles(false);
      return;
    }

    setIsReadingFiles(true);

    try {
      const nextFileMetadata = await readAgentFileMetadataInBrowser(files);

      if (fileReadRequestId.current === requestId) {
        setFileMetadata(nextFileMetadata);
      }
    } catch (error) {
      console.error("Error reading agent file metadata:", error);

      if (fileReadRequestId.current === requestId) {
        setFileMetadata([]);
        setMetadataError(
          t("agents.files.metadataError", {
            defaultValue:
              "Could not read file metadata. Check the files and try again.",
          }),
        );
      }
    } finally {
      if (fileReadRequestId.current === requestId) {
        setIsReadingFiles(false);
      }
    }
  };

  const getMetadataSummary = (metadata: AgentFileMetadata): string => {
    const firstPage = metadata.pages[0];

    if (firstPage?.widthMm && firstPage.heightMm) {
      return t("agents.files.dimensionsMm", {
        defaultValue: "{{width}} x {{height}} mm",
        height: formatDimension(firstPage.heightMm),
        width: formatDimension(firstPage.widthMm),
      });
    }

    if (firstPage?.widthPx && firstPage.heightPx) {
      return t("agents.files.dimensionsPx", {
        defaultValue: "{{width}} x {{height}} px",
        height: formatDimension(firstPage.heightPx),
        width: formatDimension(firstPage.widthPx),
      });
    }

    return metadata.contentType;
  };

  const handleStart = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    const runId = await onStartAction({
      fileMetadata,
      taskType,
      prompt: trimmedPrompt,
    });
    if (runId) {
      setPrompt("");
      resetFileState();
    }
  };

  return (
    <VStack align="stretch" gap={4} minW={0} w="100%">
      <HStack gap={2} flexWrap="wrap">
        {AGENT_OPTIONS.map((option) => {
          const selected = taskType === option.taskType;

          return (
            <Button
              key={option.taskType}
              size="sm"
              variant={selected ? "solid" : "outline"}
              colorPalette={selected ? "primary" : "gray"}
              onClick={() => setTaskType(option.taskType)}
            >
              <MaterialSymbol>{option.icon}</MaterialSymbol>
              {t(option.translationKey, {
                defaultValue: option.defaultValue,
              })}
            </Button>
          );
        })}
      </HStack>

      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={t("agents.startPromptPlaceholder", {
          defaultValue:
            "Paste the full request, price table, attributes, and notes…",
        })}
        rows={8}
        borderRadius="xl"
      />

      <FileUpload.Root
        key={fileUploadKey}
        accept={[...IMPOSITION_SUPPORTED_FILE_TYPES]}
        disabled={isStarting || isReadingFiles}
        display="block"
        maxFileSize={IMPOSITION_MAX_FILE_SIZE_BYTES}
        maxFiles={IMPOSITION_MAX_FILES}
        onFileChange={(details) => {
          void handleFileChange(details.acceptedFiles);
        }}
        onFileReject={() => {
          setMetadataError(
            t("agents.files.rejected", {
              defaultValue:
                "Only supported PDF and image files within the upload limits can be attached.",
            }),
          );
        }}
        w="100%"
      >
        <FileUpload.HiddenInput />
        <VStack align="stretch" gap={2}>
          <HStack align="center" justify="space-between" gap={3}>
            <FileUpload.Label fontSize="sm" fontWeight="medium">
              {t("agents.files.attach", { defaultValue: "Attach files" })}
            </FileUpload.Label>

            {fileMetadata.length > 0 && (
              <FileUpload.ClearTrigger asChild>
                <Button size="sm" variant="ghost" onClick={resetFileState}>
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("agents.files.clear", { defaultValue: "Clear files" })}
                </Button>
              </FileUpload.ClearTrigger>
            )}
          </HStack>

          <FileUpload.Dropzone
            alignItems="center"
            borderRadius="3xl"
            minH="32"
            px={4}
            py={5}
            w="100%"
          >
            <FileUpload.DropzoneContent>
              <VStack gap={1} textAlign="center">
                <MaterialSymbol>upload_file</MaterialSymbol>
                <Text fontSize="sm" fontWeight="medium">
                  {t("agents.files.dropzoneTitle", {
                    defaultValue: "Drop files here or browse",
                  })}
                </Text>
                <Text color="fg.muted" fontSize="xs">
                  {t("agents.files.dropzoneDescription", {
                    defaultValue: "PDF, JPG, PNG, TIFF, or WebP",
                  })}
                </Text>
              </VStack>
            </FileUpload.DropzoneContent>
          </FileUpload.Dropzone>
        </VStack>

        <FileUpload.List clearable showSize />

        {(isReadingFiles || metadataError || fileMetadata.length > 0) && (
          <Box
            aria-live="polite"
            borderWidth="1px"
            borderRadius="3xl"
            p={3}
            w="100%"
          >
            <VStack align="stretch" gap={2}>
              {isReadingFiles && (
                <HStack color="fg.muted" gap={2}>
                  <Spinner size="sm" />
                  <Text fontSize="sm">
                    {t("agents.files.processing", {
                      defaultValue: "Reading file metadata",
                    })}
                  </Text>
                </HStack>
              )}

              {metadataError && (
                <Text color="fg.error" fontSize="sm">
                  {metadataError}
                </Text>
              )}

              {fileMetadata.map((metadata, index) => (
                <HStack
                  key={`${metadata.filename}:${metadata.sizeBytes}:${index}`}
                  align="start"
                  justify="space-between"
                  gap={3}
                >
                  <Box minW={0}>
                    <Text fontSize="sm" fontWeight="medium" truncate>
                      {metadata.filename}
                    </Text>
                    <Text color="fg.muted" fontSize="xs">
                      {t("agents.files.pageCount", {
                        count: metadata.pageCount,
                        defaultValue: "{{count}} pages",
                      })}
                      {" · "}
                      {getMetadataSummary(metadata)}
                    </Text>
                  </Box>
                  <Text color="fg.muted" flexShrink={0} fontSize="xs">
                    {formatFileSize(metadata.sizeBytes)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}
      </FileUpload.Root>

      <HStack justify="flex-end">
        <Button
          colorPalette="primary"
          onClick={handleStart}
          disabled={!prompt.trim() || isReadingFiles || Boolean(metadataError)}
          loading={isStarting}
        >
          <MaterialSymbol>play_arrow</MaterialSymbol>
          {t("agents.startAgent", { defaultValue: "Start agent" })}
        </Button>
      </HStack>
    </VStack>
  );
}
