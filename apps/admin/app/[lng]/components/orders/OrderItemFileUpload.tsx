"use client";

import { useT } from "@/i18n/client";
import { useTenantContext } from "@/context/tenant";
import { uploadOrderItemFile } from "@/lib/uploadOrderItemFile";
import {
  Box,
  FileUpload,
  Presence,
  Progress,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { OrderItem } from "@konfi/types";
import { isElectron } from "@konfi/utils";
import type { FirebaseStorage } from "firebase/storage";
import { useState } from "react";

interface OrderItemFileUploadProps {
  orderItem: OrderItem;
  orderId: string;
  customerId: string;
  channelId: string;
  orderNumber: number;
  baseFolderPath?: string;
  storage?: FirebaseStorage;
  onUploadComplete?: () => void;
  disabled?: boolean;
  layout?: "floating" | "inline";
}

export default function OrderItemFileUpload({
  orderItem,
  orderId,
  customerId,
  channelId,
  orderNumber,
  baseFolderPath,
  onUploadComplete,
  disabled = false,
  layout = "floating",
}: OrderItemFileUploadProps) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentFilePosition, setCurrentFilePosition] = useState(0);

  // Only show in Electron environment
  if (!isElectron()) {
    return null;
  }

  const handleFileChange = async ({
    acceptedFiles,
  }: {
    acceptedFiles: File[];
  }) => {
    if (!acceptedFiles.length || uploading) {
      return;
    }

    setUploading(true);
    setTotalFiles(acceptedFiles.length);

    let hasSuccessfulUpload = false;

    try {
      for (let index = 0; index < acceptedFiles.length; index++) {
        const file = acceptedFiles[index];

        setCurrentFilePosition(index + 1);
        setCurrentFile(file);
        setProgress(0);

        try {
          const result = await uploadOrderItemFile({
            file,
            orderItem,
            orderId,
            customerId,
            channelId,
            orderNumber,
            tenantContext,
            baseFolderPath,
            onProgress: setProgress,
          });

          if (result.success) {
            hasSuccessfulUpload = true;
            toaster.success({
              title: "common.success",
              description: `${file.name}: ${result.message}`,
            });
          } else {
            toaster.error({
              title: "common.error",
              description: `${file.name}: ${result.message}`,
            });
          }
        } catch (error) {
          console.error("Upload error:", error);
          const message =
            error instanceof Error ? error.message : "Unknown error occurred";
          toaster.error({
            title: "common.error",
            description: `${file.name}: ${message}`,
          });
        } finally {
          setProgress(0);
        }
      }
    } finally {
      setUploading(false);
      setProgress(0);
      setCurrentFile(null);
      setTotalFiles(0);
      setCurrentFilePosition(0);

      if (hasSuccessfulUpload) {
        onUploadComplete?.();
      }
    }
  };

  return (
    <Box
      position={layout === "floating" ? "absolute" : undefined}
      top={layout === "floating" ? 14 : undefined}
      right={layout === "floating" ? 4 : undefined}
      width={layout === "floating" ? "33%" : "100%"}
      className="noprint"
    >
      <FileUpload.Root
        maxFiles={10}
        accept={{
          "application/pdf": [".pdf"],
          "image/*": [
            ".jpg",
            ".jpeg",
            ".png",
            ".gif",
            ".webp",
            ".bmp",
            ".tiff",
            ".tif",
          ],
        }}
        onFileChange={handleFileChange}
        disabled={disabled || uploading}
        maxW={layout === "floating" ? "xl" : "100%"}
        alignItems="stretch"
        w="100%"
      >
        <FileUpload.HiddenInput />

        <FileUpload.Dropzone
          py={3}
          px={2}
          _hover={{ bg: "bg.muted" }}
          minH="80px"
          w="100%"
          minW="100%"
          zIndex={10}
        >
          <VStack gap={1}>
            <MaterialSymbol color="fg.muted">upload</MaterialSymbol>
            <Text
              fontSize="xs"
              fontWeight="medium"
              color="fg.muted"
              textAlign="center"
              lineHeight="tight"
            >
              {t("ui.fileUpload.dragAndDrop", {
                defaultValue: "Drag & drop file here or click to select",
              })}
            </Text>
            <Presence present={uploading}>
              {totalFiles > 1 && currentFilePosition > 0 && (
                <Text
                  fontSize="2xs"
                  textAlign="center"
                  color="fg.muted"
                  lineHeight="tight"
                >
                  {t("ui.fileUpload.uploadingProgress", {
                    defaultValue: "Uploading file {{current}} of {{total}}",
                    current: currentFilePosition,
                    total: totalFiles,
                  })}
                </Text>
              )}
              {currentFile && (
                <Text
                  fontSize="2xs"
                  textAlign="center"
                  color="fg.muted"
                  lineHeight="tight"
                  lineClamp={1}
                >
                  {currentFile.name}
                </Text>
              )}
              <Progress.Root value={progress} size="xs" colorPalette="primary">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
              <Text fontSize="xs" color="fg.muted" textAlign="center">
                {Math.round(progress)}%
              </Text>
            </Presence>
          </VStack>
        </FileUpload.Dropzone>
      </FileUpload.Root>
    </Box>
  );
}
