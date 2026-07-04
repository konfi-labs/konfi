"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Button,
  Card,
  FileUpload,
  HStack,
  Input,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Field, MaterialSymbol, Switch } from "@konfi/components";
import {
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  IMPOSITION_SUPPORTED_FILE_TYPES,
} from "@konfi/types";
import { useEffect, useRef, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { setImposeFormValue, type ImposeFormMethods } from "../impose-form";
import { detectImpositionPageCount } from "./detect-imposition-page-count";

export function ImposeWorkspaceUploadPanel({
  methods,
  submitLabel,
  isSubmitting,
  uploadGeneratedToStorage,
  onUploadGeneratedToStorageChangeAction,
  onCreateImpositionAction,
  onSaveTemplateOnlyAction,
}: {
  methods: ImposeFormMethods;
  submitLabel: string;
  isSubmitting: boolean;
  uploadGeneratedToStorage: boolean;
  onUploadGeneratedToStorageChangeAction: (nextValue: boolean) => void;
  onCreateImpositionAction: () => void | Promise<void>;
  onSaveTemplateOnlyAction: () => void | Promise<void>;
}) {
  const { t } = useT(["impose", "translation"]);
  const { files, saveAsTemplate, templateName } = useWatch({
    control: methods.control,
  });

  const filesError = methods.formState.errors.files;
  const templateNameError = methods.formState.errors.templateName;
  const selectedFiles = files ?? [];
  const canSaveTemplateOnly = Boolean(saveAsTemplate && templateName?.trim());

  // Auto-detect page count from first PDF and set pagesPerSignature.
  // Depend on the first file's identity only to avoid re-running on every render
  // (useWatch returns a new array reference each time).
  const firstFile = selectedFiles[0];
  const [isDetectingPageCount, setIsDetectingPageCount] = useState(false);
  // Track which file we last finished detecting so we don't re-run unnecessarily.
  const detectedFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (!firstFile || detectedFileRef.current === firstFile) {
      return;
    }

    setIsDetectingPageCount(true);

    const detectPageCount = async () => {
      try {
        const pageCount = await detectImpositionPageCount(firstFile);

        if (pageCount && pageCount > 0) {
          setImposeFormValue(methods, "pagesPerSignature", pageCount);
        }
      } catch {
        // Non-fatal — leave pagesPerSignature at its current value
      } finally {
        detectedFileRef.current = firstFile;
        setIsDetectingPageCount(false);
      }
    };

    void detectPageCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstFile]);

  // Reset detection state when all files are removed
  useEffect(() => {
    if (selectedFiles.length === 0) {
      detectedFileRef.current = null;
      setIsDetectingPageCount(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles.length]);

  return (
    <Card.Root>
      <Card.Header>
        <HStack justify="space-between" align="center" gap={3}>
          <Card.Title>
            {t("impose.workspace.sources", {
              defaultValue: "Sources",
            })}
          </Card.Title>
          <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
            {t("impose.workspace.filesSelected", {
              defaultValue: "{{count}} file(s)",
              count: selectedFiles.length,
            })}
          </Badge>
        </HStack>
      </Card.Header>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Controller
            control={methods.control}
            name="files"
            render={({ field }) => (
              <Field
                invalid={Boolean(filesError)}
                errorText={
                  typeof filesError?.message === "string"
                    ? filesError.message
                    : undefined
                }
              >
                <FileUpload.Root
                  acceptedFiles={field.value ?? []}
                  maxFiles={IMPOSITION_MAX_FILES}
                  maxFileSize={IMPOSITION_MAX_FILE_SIZE_MB * 1024 * 1024}
                  accept={Array.from(IMPOSITION_SUPPORTED_FILE_TYPES)}
                  onFileChange={(details) => {
                    field.onChange(details.acceptedFiles);
                  }}
                >
                  <FileUpload.HiddenInput name={field.name} />
                  <FileUpload.Dropzone
                    borderRadius="2xl"
                    minH="10rem"
                    borderStyle="dashed"
                    borderColor={{ base: "gray.300", _dark: "gray.700" }}
                    bg={{ base: "gray.50", _dark: "gray.900" }}
                  >
                    <MaterialSymbol>upload</MaterialSymbol>
                    <FileUpload.DropzoneContent>
                      <Text fontWeight="medium">
                        {t("impose.workspace.dropzoneTitle", {
                          defaultValue:
                            "Drag and drop print files here or click to browse",
                        })}
                      </Text>
                      <Text color={{ base: "gray.600", _dark: "gray.400" }}>
                        {t("forms.impose.helperTexts.fileUploadLimits", {
                          defaultValue:
                            "Up to {{maxFiles}} files, {{maxFileSize}} MB each, {{maxTotalSize}} MB total per batch.",
                          maxFiles: IMPOSITION_MAX_FILES,
                          maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
                          maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
                        })}
                      </Text>
                    </FileUpload.DropzoneContent>
                  </FileUpload.Dropzone>
                  <FileUpload.List showSize clearable />
                </FileUpload.Root>
              </Field>
            )}
          />

          <Separator />

          <Controller
            control={methods.control}
            name="saveAsTemplate"
            render={({ field }) => (
              <Switch
                size="sm"
                colorPalette="primary"
                checked={Boolean(field.value)}
                onCheckedChange={({ checked }) =>
                  field.onChange(Boolean(checked))
                }
              >
                {t("forms.impose.labels.saveAsTemplate", {
                  defaultValue: "Save as template",
                })}
              </Switch>
            )}
          />

          <Switch
            size="sm"
            colorPalette="primary"
            checked={uploadGeneratedToStorage}
            onCheckedChange={({ checked }) =>
              onUploadGeneratedToStorageChangeAction(Boolean(checked))
            }
          >
            {t("impose.workspace.uploadGeneratedArchive", {
              defaultValue: "Upload generated archive to storage",
            })}
          </Switch>

          {saveAsTemplate && (
            <Field
              label={t("forms.impose.labels.templateName", {
                defaultValue: "Template name",
              })}
              invalid={Boolean(templateNameError)}
              errorText={
                typeof templateNameError?.message === "string"
                  ? templateNameError.message
                  : undefined
              }
            >
              <Input
                size="sm"
                value={templateName ?? ""}
                placeholder={t("forms.impose.labels.templateName", {
                  defaultValue: "Template name",
                })}
                onChange={(event) =>
                  setImposeFormValue(
                    methods,
                    "templateName",
                    event.currentTarget.value,
                  )
                }
              />
            </Field>
          )}

          <HStack gap={2} wrap="wrap">
            {canSaveTemplateOnly && (
              <Button
                variant="outline"
                colorPalette="success"
                size="sm"
                onClick={() => void onSaveTemplateOnlyAction()}
                w="full"
              >
                <MaterialSymbol>save</MaterialSymbol>
                {t("impose.saveTemplateOnly", {
                  defaultValue: "Save template without imposition",
                })}
              </Button>
            )}
            <Button
              colorPalette="primary"
              size="sm"
              loading={isSubmitting || isDetectingPageCount}
              loadingText={
                isDetectingPageCount
                  ? t("b2b.impose.analyzingFile", {
                      defaultValue: "Analyzing file\u2026",
                    })
                  : submitLabel
              }
              disabled={
                isSubmitting ||
                isDetectingPageCount ||
                selectedFiles.length === 0
              }
              onClick={onCreateImpositionAction}
              w="full"
            >
              <MaterialSymbol>edit</MaterialSymbol>
              {submitLabel}
            </Button>
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
