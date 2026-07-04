"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  Field,
  FileUpload,
  HStack,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Image, MaterialSymbol } from "@konfi/components";
import { useState } from "react";

export const uploadStorefrontImage = async (params: {
  endpoint: string;
  file: File;
  fileField: string;
  formFields?: Record<string, string>;
  responseField: string;
}) => {
  const formData = new FormData();

  for (const [key, fieldValue] of Object.entries(params.formFields ?? {})) {
    formData.set(key, fieldValue);
  }

  formData.set(params.fileField, params.file);

  const response = await fetch(params.endpoint, {
    body: formData,
    method: "POST",
  });
  const result = (await response.json()) as Record<string, unknown> | null;
  const url = result?.[params.responseField];

  if (!response.ok || typeof url !== "string") {
    throw new Error("Storefront image upload failed.");
  }

  return url;
};

interface StorefrontEditorImageFieldProps {
  accept: string[];
  /** Short hint about accepted files, e.g. "PNG, JPG, SVG, or WebP under 2 MB." */
  description?: string;
  id: string;
  label: string;
  maxFileSize: number;
  onChange: (url: string | undefined) => void;
  /** Aspect ratio of the preview thumbnail. */
  previewRatio?: number;
  upload: (file: File) => Promise<string>;
  value?: string;
}

/**
 * Compact image control: thumbnail + Upload/Remove actions, with a "paste a
 * link" input tucked behind a small toggle instead of a permanent URL field
 * and dropzone pair.
 */
export const StorefrontEditorImageField = ({
  accept,
  description,
  id,
  label,
  maxFileSize,
  onChange,
  previewRatio = 1.6,
  upload,
  value,
}: StorefrontEditorImageFieldProps) => {
  const { t } = useT();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const uploadFile = async (files: File[]) => {
    const file = files[0];

    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      onChange(await upload(file));
    } catch (uploadError) {
      console.error("Error uploading storefront image:", uploadError);
      setError(
        t("store.editor.image.uploadError", {
          defaultValue: "Upload failed. Try a smaller image file.",
        }),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Field.Root invalid={Boolean(error)}>
      <Field.Label htmlFor={`${id}-url`}>{label}</Field.Label>
      <HStack align="start" gap={3} w="full">
        {value ? (
          <Image
            alt={t("store.editor.image.previewAlt", {
              defaultValue: "Current image preview",
            })}
            borderRadius="lg"
            height={44}
            objectFit="contain"
            priority={false}
            ratio={previewRatio}
            src={value}
            transparentBackground
            width={Math.round(44 * previewRatio)}
          />
        ) : (
          <Box
            alignItems="center"
            bg="bg.subtle"
            borderColor="border.emphasized"
            borderRadius="lg"
            borderStyle="dashed"
            borderWidth="1px"
            color="fg.muted"
            display="flex"
            flexShrink={0}
            h="44px"
            justifyContent="center"
            w={`${Math.round(44 * previewRatio)}px`}
          >
            <MaterialSymbol fontSize="1.25rem">image</MaterialSymbol>
          </Box>
        )}
        <Stack flex="1" gap={1} minW={0}>
          <HStack flexWrap="wrap" gap={1}>
            <FileUpload.Root
              accept={accept}
              disabled={isUploading}
              maxFileSize={maxFileSize}
              maxFiles={1}
              onFileChange={(details) => void uploadFile(details.acceptedFiles)}
              onFileReject={({ files }) => {
                if (files.length > 0) {
                  setError(
                    description ??
                      t("store.editor.image.rejected", {
                        defaultValue: "This image file cannot be used.",
                      }),
                  );
                }
              }}
              w="auto"
            >
              <FileUpload.HiddenInput name={id} />
              <FileUpload.Trigger asChild>
                <Button loading={isUploading} size="xs" variant="outline">
                  <MaterialSymbol fontSize="1rem">upload</MaterialSymbol>
                  {t("store.editor.image.upload", {
                    defaultValue: "Upload",
                  })}
                </Button>
              </FileUpload.Trigger>
            </FileUpload.Root>
            {value ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setError(null);
                  onChange(undefined);
                }}
              >
                {t("store.editor.actions.remove", {
                  defaultValue: "Remove",
                })}
              </Button>
            ) : null}
            <Button
              size="xs"
              variant={showUrlInput ? "subtle" : "ghost"}
              onClick={() => setShowUrlInput((visible) => !visible)}
            >
              {t("store.editor.image.useLink", {
                defaultValue: "Use link",
              })}
            </Button>
          </HStack>
          {description ? (
            <Text color="fg.muted" fontSize="xs">
              {description}
            </Text>
          ) : null}
        </Stack>
      </HStack>
      {showUrlInput ? (
        <Input
          id={`${id}-url`}
          name={`${id}-url`}
          placeholder="https://"
          size="sm"
          type="url"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      ) : null}
      {error ? <Field.ErrorText>{error}</Field.ErrorText> : null}
    </Field.Root>
  );
};
