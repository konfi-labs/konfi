"use client";

import { useT } from "@/i18n/client";
import { getOrderItemFolderName } from "@/lib/order-item-folder";
import {
  Box,
  Image as ChakraImage,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { OrderItem } from "@konfi/types";
import { useCallback, useEffect, useRef, useState } from "react";
import OrderItemFileUpload from "./OrderItemFileUpload";

interface LocalOrderFile {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: number;
  extension: string;
  kind: "image" | "pdf" | "other";
  previewId?: string;
  previewUrl?: string;
}

interface LocalOrderFilesSectionProps {
  orderItem: OrderItem;
  orderNumber: number;
  baseFolderPath?: string;
  orderId?: string;
  customerId?: string;
  channelId?: string;
  showUpload?: boolean;
  onUploadComplete?: () => void;
}

export default function LocalOrderFilesSection({
  orderItem,
  orderNumber,
  baseFolderPath,
  orderId,
  customerId,
  channelId,
  showUpload = false,
  onUploadComplete,
}: LocalOrderFilesSectionProps) {
  const { t, i18n } = useT(["order", "translation"]);
  const [localFiles, setLocalFiles] = useState<LocalOrderFile[]>([]);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const previewIdsRef = useRef<Set<string>>(new Set());

  const releasePreviews = useCallback(async (previewIds: Set<string>) => {
    if (!window.konfiDesktop?.orders.releasePreview) return;
    for (const previewId of previewIds) {
      try {
        await window.konfiDesktop.orders.releasePreview(previewId);
      } catch (error) {
        console.warn("Failed to release preview:", previewId, error);
      }
    }
  }, []);

  useEffect(() => {
    if (
      !baseFolderPath ||
      !window.konfiDesktop?.orders.listItemFiles ||
      orderNumber === undefined
    ) {
      return;
    }

    const itemFolder = getOrderItemFolderName(orderItem);
    let cancelled = false;
    const pendingPreviewIds = new Set<string>();

    const loadFiles = async () => {
      try {
        const result = await window.konfiDesktop!.orders.listItemFiles({
          baseFolderPath,
          orderNumber,
          itemFolder,
        });

        if (cancelled || !result.success || !result.files) return;

        const filesWithPreviews = await Promise.all(
          result.files.map(async (file) => {
            const fileWithId: LocalOrderFile = {
              ...file,
              id: `${file.path}-${file.modified}`,
            };

            if (file.kind === "image" || file.kind === "pdf") {
              try {
                const previewResult =
                  await window.konfiDesktop!.orders.generatePreview({
                    baseFolderPath,
                    orderNumber,
                    relativePath: file.relativePath,
                    options: { width: 128, height: 128 },
                  });
                if (previewResult.success && previewResult.previewId) {
                  pendingPreviewIds.add(previewResult.previewId);
                  return {
                    ...fileWithId,
                    previewId: previewResult.previewId,
                    previewUrl: previewResult.previewUrl,
                  };
                }
              } catch (error) {
                console.warn("Preview generation failed:", error);
              }
            }
            return fileWithId;
          }),
        );

        if (!cancelled) {
          void releasePreviews(previewIdsRef.current);
          previewIdsRef.current = pendingPreviewIds;
          setLocalFiles(filesWithPreviews);
        }
      } catch (error) {
        console.error("Failed to load local files:", error);
      }
    };

    void loadFiles();

    return () => {
      cancelled = true;
      void releasePreviews(pendingPreviewIds);
    };
  }, [
    orderItem,
    orderNumber,
    baseFolderPath,
    releasePreviews,
    localRefreshKey,
  ]);

  const formatSize = useCallback(
    (bytes: number) =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "decimal",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(bytes / (1024 * 1024)),
    [i18n.resolvedLanguage],
  );

  const handleLocalDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, file: LocalOrderFile) => {
      if (!window.konfiDesktop?.orders || !baseFolderPath) return;
      event.preventDefault();
      event.dataTransfer.effectAllowed = "copy";
      try {
        event.dataTransfer.setData("text/plain", file.path);
      } catch {
        // Ignore
      }
      void window.konfiDesktop.orders.startDrag({
        baseFolderPath,
        orderNumber,
        relativePaths: [file.relativePath],
        iconPreviewId: file.previewId ?? null,
      });
    },
    [baseFolderPath, orderNumber],
  );

  const handleOpenFolder = useCallback(
    (relativePath: string) => {
      if (!baseFolderPath) return;
      void window.konfiDesktop?.orders.openContainingFolder({
        baseFolderPath,
        orderNumber,
        relativePath,
      });
    },
    [baseFolderPath, orderNumber],
  );

  if (!window.konfiDesktop || (!showUpload && localFiles.length === 0)) return null;

  const canUpload =
    showUpload &&
    Boolean(baseFolderPath) &&
    orderNumber !== undefined &&
    Boolean(orderId) &&
    Boolean(customerId) &&
    Boolean(channelId);

  return (
    <VStack gap={2} align="stretch" mt={4} className="noprint">
      {showUpload && (
        <OrderItemFileUpload
          orderItem={orderItem}
          orderId={orderId ?? ""}
          customerId={customerId ?? ""}
          channelId={channelId ?? ""}
          orderNumber={orderNumber}
          baseFolderPath={baseFolderPath}
          disabled={!canUpload}
          layout="inline"
          onUploadComplete={() => {
            setLocalRefreshKey((key) => key + 1);
            onUploadComplete?.();
          }}
        />
      )}
      {localFiles.length > 0 && (
        <Text fontSize="xs" fontWeight="600" color="fg.muted">
          {t("order.localFiles", { defaultValue: "Local files" })}
        </Text>
      )}
      {localFiles.map((file) => (
        <Box
          key={file.id}
          p={4}
          w="100%"
          border="1px solid"
          borderRadius="3xl"
          borderColor="gray.muted"
          draggable
          onDragStart={(event) => handleLocalDragStart(event, file)}
        >
          <HStack gap={4} align="start">
            {file.previewUrl ? (
              <ChakraImage
                src={file.previewUrl}
                alt={file.name}
                w="64px"
                h="64px"
                borderRadius="xl"
                objectFit="contain"
              />
            ) : (
              <Box
                p="6px"
                borderRadius="md"
                border="1px solid"
                borderColor="gray.muted"
              >
                <MaterialSymbol>insert_drive_file</MaterialSymbol>
              </Box>
            )}
            <VStack align="start" gap={0}>
              <Text fontWeight="600">{file.name}</Text>
              <Text fontSize="sm">{formatSize(file.size)} MB</Text>
            </VStack>
            <HStack ml="auto">
              <IconButton
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenFolder(file.relativePath);
                }}
                aria-label={t("admin.openContainingFolder", {
                  defaultValue: "Open containing folder",
                })}
              >
                <MaterialSymbol>folder_open</MaterialSymbol>
              </IconButton>
            </HStack>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
}
