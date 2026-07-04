"use client";

import { useT } from "@/i18n/client";
import {
  createStickerImpositionArchive,
  resolveStickerImpositionPreview,
} from "@konfi/wasm/browser";
import { collapsePreviewPlanSheets } from "@/lib/sticker-imposition/layout";
import {
  STICKER_DEFAULT_SETTINGS,
  createEmptyStickerImpositionPlan,
  stickerBleedFillMode,
  type StickerImpositionItem,
  type StickerImpositionPlan,
  type StickerImpositionSettings,
} from "@/lib/sticker-imposition/types";
import {
  Badge,
  Box,
  Button,
  Grid,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, Switch, toaster } from "@konfi/components";
import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
} from "@konfi/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildFallbackMetadata,
  getErrorMessageFromResponse,
  mergeMetadataIntoItems,
  readStickerMetadataInBrowser,
  resolveLinkedStickerSizeChange,
  shouldReadStickerMetadataInBrowser,
  STICKER_BROWSER_METADATA_MAX_FILE_SIZE_MB,
  STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_MB,
  triggerArchiveUrlDownload,
  type StickerMetadataResponse,
} from "./sticker-client";
import { createStickerExportArtworkAssets } from "./create-export-artwork-assets";
import { StickerLayoutPreview } from "./StickerLayoutPreview";
import { StickerSourcesPanel } from "./StickerSourcesPanel";
import { ImposeFloatingSections } from "../workspace/ImposeFloatingSections";
import { buildStickerSections } from "./StickerSections";
import { uploadGeneratedImpositionArchive } from "../generated-archive-storage";

const PREVIEW_DEBOUNCE_MS = 150;
const STICKER_METADATA_DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

function StickerErrorNotice({ message }: { message: string }) {
  return (
    <HStack
      borderWidth="1px"
      borderColor="orange.muted"
      bg="orange.subtle"
      borderRadius="2xl"
      px={4}
      py={3}
      gap={3}
      align="start"
      aria-live="polite"
    >
      <MaterialSymbol>warning</MaterialSymbol>
      <Text fontSize="sm" flex="1" minW={0}>
        {message}
      </Text>
    </HStack>
  );
}

function formatSquareMeters(areaMm2: number): string {
  return (areaMm2 / 1_000_000).toFixed(2);
}

function normalizeStickerPreviewPlan(
  plan: Awaited<ReturnType<typeof resolveStickerImpositionPreview>>,
): StickerImpositionPlan {
  const sheets: StickerImpositionPlan["sheets"] = plan.sheets.map((sheet) => ({
    exportHeightMm: sheet.exportHeightMm,
    exportWidthMm: sheet.exportWidthMm,
    exportXMm: sheet.exportXMm,
    exportYMm: sheet.exportYMm,
    index: sheet.index,
    manualCutMarks:
      "manualCutMarks" in sheet && Array.isArray(sheet.manualCutMarks)
        ? sheet.manualCutMarks
        : [],
    mediaWidthMm: sheet.mediaWidthMm,
    oposMarks:
      "oposMarks" in sheet && Array.isArray(sheet.oposMarks)
        ? sheet.oposMarks
        : [],
    partBoundaries: sheet.partBoundaries,
    placements: sheet.placements.map((placement) => ({
      bleedMm: placement.bleedMm ?? 0,
      bleedFillMode: placement.bleedFillMode ?? stickerBleedFillMode.MIRROR,
      cutOffsetMm: placement.cutOffsetMm,
      cutShape: placement.cutShape,
      filename: placement.filename,
      heightMm: placement.heightMm,
      instanceIndex: placement.instanceIndex,
      itemId: placement.itemId,
      mirrorBleedEnabled: placement.mirrorBleedEnabled ?? false,
      pageNumber: placement.pageNumber,
      partId: placement.partId,
      rotationDegrees: placement.rotationDegrees,
      selectedPdfCutLineIds: placement.selectedPdfCutLineIds ?? [],
      sheetIndex: placement.sheetIndex,
      sourceFileIndex: placement.sourceFileIndex,
      sourceHeightMm: placement.sourceHeightMm ?? null,
      sourceWidthMm: placement.sourceWidthMm ?? null,
      widthMm: placement.widthMm,
      xMm: placement.xMm,
      yMm: placement.yMm,
    })),
    previewLengthMm: sheet.previewLengthMm,
    repeatCount:
      "repeatCount" in sheet && typeof sheet.repeatCount === "number"
        ? sheet.repeatCount
        : undefined,
    utilizationPercent: sheet.utilizationPercent,
  }));

  return {
    itemCount: plan.itemCount,
    mediaWidthMm: plan.mediaWidthMm,
    packingMode: plan.packingMode,
    sheetCount: plan.sheetCount,
    sheets,
    totalSheetCount:
      "totalSheetCount" in plan && typeof plan.totalSheetCount === "number"
        ? plan.totalSheetCount
        : plan.sheetCount,
    totalAreaMm2: plan.totalAreaMm2,
    usedAreaMm2: plan.usedAreaMm2,
  };
}

function getStickerSelectionError(
  files: readonly File[],
  t: ReturnType<typeof useT>["t"],
): string | undefined {
  if (files.length > IMPOSITION_MAX_FILES) {
    return t("impose.errors.tooManyFiles", {
      defaultValue:
        "You can upload up to {{maxFiles}} files in a single imposition batch.",
      maxFiles: IMPOSITION_MAX_FILES,
    });
  }

  const oversizedFile = files.find(
    (file) => file.size > IMPOSITION_MAX_FILE_SIZE_BYTES,
  );

  if (oversizedFile) {
    return t("impose.errors.fileTooLarge", {
      defaultValue:
        "{{filename}} exceeds the {{maxFileSize}} MB per-file limit.",
      filename: oversizedFile.name,
      maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
    });
  }

  const totalFileSize = getImpositionTotalFileSize(files);

  if (totalFileSize > IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES) {
    return t("impose.errors.totalBatchTooLarge", {
      defaultValue:
        "The selected files total {{selectedSize}} MB, but the batch limit is {{maxTotalSize}} MB.",
      maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
      selectedSize: Math.ceil(totalFileSize / (1024 * 1024)),
    });
  }

  return undefined;
}

export function StickerImposeForm() {
  const { t } = useT(["impose", "translation"]);
  const metadataRequestId = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<StickerImpositionItem[]>([]);
  const [settings, setSettings] = useState<StickerImpositionSettings>(
    STICKER_DEFAULT_SETTINGS,
  );
  const [plan, setPlan] = useState<StickerImpositionPlan>(() =>
    createEmptyStickerImpositionPlan(STICKER_DEFAULT_SETTINGS),
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadGeneratedToStorage, setUploadGeneratedToStorage] =
    useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [artworkPreviews, setArtworkPreviews] = useState<
    Record<string, string>
  >({});
  const displayPlan = useMemo(
    () => collapsePreviewPlanSheets(plan, artworkPreviews),
    [artworkPreviews, plan],
  );
  const totalPrintCount = useMemo(
    () =>
      displayPlan.sheets.reduce(
        (count, sheet) => count + (sheet.repeatCount ?? 1),
        0,
      ),
    [displayPlan.sheets],
  );

  useEffect(() => {
    if (items.length === 0) {
      setPlan(createEmptyStickerImpositionPlan(settings));
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    let isActive = true;

    setIsPreviewLoading(true);

    const timeoutId = window.setTimeout(() => {
      void resolveStickerImpositionPreview({ items, settings })
        .then((nextPlan) => {
          if (!isActive) {
            return;
          }

          const normalizedPlan: StickerImpositionPlan =
            normalizeStickerPreviewPlan(nextPlan);
          setPlan(normalizedPlan);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (!isActive) {
            return;
          }

          setPreviewError(
            error instanceof Error ? error.message : String(error),
          );
        })
        .finally(() => {
          if (isActive) {
            setIsPreviewLoading(false);
          }
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [items, settings, t]);

  const handleFilesChange = useCallback(
    async (nextFiles: File[]) => {
      setFiles(nextFiles);
      setMetadataError(null);
      setActiveSheetIndex(0);

      if (nextFiles.length === 0) {
        setItems([]);
        setArtworkPreviews({});
        return;
      }

      setArtworkPreviews({});
      const fallbackSources = buildFallbackMetadata(nextFiles);
      setItems((currentItems) =>
        mergeMetadataIntoItems({
          existingItems: currentItems,
          sources: fallbackSources,
        }),
      );

      if (
        getImpositionTotalFileSize(nextFiles) >
        STICKER_METADATA_DIRECT_UPLOAD_LIMIT_BYTES
      ) {
        if (!shouldReadStickerMetadataInBrowser(nextFiles)) {
          setMetadataError(
            t("impose.stickers.errors.metadataSkippedLargeBatch", {
              defaultValue:
                "Automatic size/artwork preview is skipped when the selected files exceed {{maxFileSize}} MB per file or {{maxTotalSize}} MB in total. You can still enter the sticker dimensions manually and create the imposition.",
              maxFileSize: STICKER_BROWSER_METADATA_MAX_FILE_SIZE_MB,
              maxTotalSize: STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_MB,
            }),
          );
          setIsMetadataLoading(false);
          return;
        }

        const requestId = metadataRequestId.current + 1;
        metadataRequestId.current = requestId;
        setIsMetadataLoading(true);

        try {
          const payload = await readStickerMetadataInBrowser(nextFiles);

          if (metadataRequestId.current !== requestId) {
            return;
          }

          setArtworkPreviews(payload.artworkPreviews ?? {});
          setItems((currentItems) =>
            mergeMetadataIntoItems({
              existingItems: currentItems,
              sources: payload.sources,
            }),
          );
        } catch (error) {
          if (metadataRequestId.current === requestId) {
            setMetadataError(
              error instanceof Error ? error.message : String(error),
            );
          }
        } finally {
          if (metadataRequestId.current === requestId) {
            setIsMetadataLoading(false);
          }
        }

        return;
      }

      const requestId = metadataRequestId.current + 1;
      metadataRequestId.current = requestId;
      setIsMetadataLoading(true);

      try {
        const formData = new FormData();
        nextFiles.forEach((file, index) => {
          formData.append(`upload_file_${index}`, file);
        });

        const response = await fetch("/api/impose/stickers/metadata", {
          body: formData,
          cache: "no-store",
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(
            (await getErrorMessageFromResponse(response)) ||
              t("impose.stickers.errors.metadataFailed", {
                defaultValue: "Failed to read sticker source metadata.",
              }),
          );
        }

        const payload = (await response.json()) as StickerMetadataResponse;

        if (metadataRequestId.current !== requestId) {
          return;
        }

        setArtworkPreviews(payload.artworkPreviews ?? {});
        setItems((currentItems) =>
          mergeMetadataIntoItems({
            existingItems: currentItems,
            sources: payload.sources,
          }),
        );
      } catch (error) {
        if (metadataRequestId.current === requestId) {
          setMetadataError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (metadataRequestId.current === requestId) {
          setIsMetadataLoading(false);
        }
      }
    },
    [t],
  );

  const updateItem = useCallback(
    (itemId: string, patch: Partial<StickerImpositionItem>) => {
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      );
    },
    [],
  );

  const updateItemSize = useCallback(
    (itemId: string, axis: "heightMm" | "widthMm", value: number) => {
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...resolveLinkedStickerSizeChange(item, axis, value),
              }
            : item,
        ),
      );
    },
    [],
  );

  const updateSettings = useCallback(
    (patch: Partial<StickerImpositionSettings>) => {
      setSettings((currentSettings) => ({
        ...currentSettings,
        ...patch,
      }));
      setActiveSheetIndex(0);
    },
    [],
  );

  const handleExport = useCallback(async () => {
    if (files.length === 0 || items.length === 0) {
      toaster.error({
        title: t("error.impose_error", { defaultValue: "Imposition error" }),
        description: t("impose.stickers.errors.noFiles", {
          defaultValue: "Add at least one sticker source file.",
        }),
      });
      return;
    }

    const selectionError = getStickerSelectionError(files, t);

    if (selectionError) {
      toaster.error({
        title: t("error.impose_error", { defaultValue: "Imposition error" }),
        description: selectionError,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const assets = await createStickerExportArtworkAssets({
        files,
        items,
      });
      const result = await createStickerImpositionArchive({
        request: { items, settings },
        assets,
      });
      const output = Uint8Array.from(result.bytes);
      const buffer = new ArrayBuffer(output.byteLength);
      new Uint8Array(buffer).set(output);
      const blob = new Blob([buffer], { type: result.contentType });

      if (uploadGeneratedToStorage) {
        await uploadGeneratedImpositionArchive({
          bytes: output,
          contentType: result.contentType,
          filename: result.filename,
        });
      }

      const url = URL.createObjectURL(blob);
      triggerArchiveUrlDownload(url, result.filename);

      toaster.success({
        title: t("impose.stickers.ready", {
          defaultValue: "Sticker imposition ready",
        }),
        description: uploadGeneratedToStorage
          ? t("impose.downloadingAndUploaded", {
              defaultValue:
                "Downloading file and uploading generated archive to storage...",
            })
          : t("impose.downloading", {
              defaultValue: "Downloading file...",
            }),
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("error.code", {
          defaultValue: "Error code: {{error}}",
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [files, items, settings, t, uploadGeneratedToStorage]);

  const [openSection, setOpenSection] = useState<string | null>("media");

  const sections = useMemo(
    () => buildStickerSections({ settings, onChange: updateSettings, t }),
    [settings, updateSettings, t],
  );

  const summaryChips = (
    <>
      <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
        {t("impose.stickers.summary.sheets", {
          defaultValue: "{{count}} sheet(s)",
          count: displayPlan.sheetCount,
        })}
      </Badge>
      {totalPrintCount > displayPlan.sheetCount && (
        <Badge colorPalette="blue" borderRadius="full" px={3} py={1}>
          {t("impose.stickers.summary.totalPrints", {
            defaultValue: "{{count}} total print(s)",
            count: totalPrintCount,
          })}
        </Badge>
      )}
      <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
        {t("impose.stickers.summary.items", {
          defaultValue: "{{count}} stickers",
          count: plan.itemCount,
        })}
      </Badge>
      <Badge colorPalette="green" borderRadius="full" px={3} py={1}>
        {t("impose.stickers.summary.area", {
          defaultValue: "{{area}} m² used",
          area: formatSquareMeters(plan.usedAreaMm2),
        })}
      </Badge>
    </>
  );

  return (
    <Box
      borderWidth="1px"
      borderRadius="3xl"
      bg={{ base: "white", _dark: "gray.950" }}
      p={4}
    >
      <VStack align="stretch" gap={4}>
        {metadataError ? <StickerErrorNotice message={metadataError} /> : null}

        {previewError ? <StickerErrorNotice message={previewError} /> : null}

        <Grid
          templateColumns={{ base: "1fr", "2xl": "minmax(0, 1fr) 25rem" }}
          gap={6}
          alignItems={{ base: "start", "2xl": "stretch" }}
        >
          <Box position="relative" minW={0}>
            <ImposeFloatingSections
              sections={sections}
              openKey={openSection}
              onOpenChange={setOpenSection}
              label={t("impose.stickers.controlsLabel", {
                defaultValue: "Sticker imposition controls",
              })}
            />
            <StickerLayoutPreview
              activeSheetIndex={activeSheetIndex}
              artworkPreviews={artworkPreviews}
              isLoading={isPreviewLoading}
              plan={displayPlan}
              onActiveSheetChangeAction={setActiveSheetIndex}
              extraChips={summaryChips}
            />
          </Box>
          <VStack align="stretch" gap={4}>
            <StickerSourcesPanel
              files={files}
              items={items}
              isMetadataLoading={isMetadataLoading}
              onFilesChange={handleFilesChange}
              onItemChange={updateItem}
              onItemSizeChange={updateItemSize}
            />
            <Switch
              size="sm"
              colorPalette="primary"
              checked={uploadGeneratedToStorage}
              onCheckedChange={({ checked }) =>
                setUploadGeneratedToStorage(Boolean(checked))
              }
            >
              {t("impose.workspace.uploadGeneratedArchive", {
                defaultValue: "Upload generated archive to storage",
              })}
            </Switch>
            <Button
              colorPalette="primary"
              size="md"
              minH="3rem"
              loading={isSubmitting}
              loadingText={t("impose.stickers.creating", {
                defaultValue: "Creating sticker imposition…",
              })}
              disabled={
                files.length === 0 || items.length === 0 || plan.itemCount === 0
              }
              onClick={() => void handleExport()}
              w="full"
            >
              <MaterialSymbol>archive</MaterialSymbol>
              {t("impose.stickers.create", {
                defaultValue: "Create Sticker Imposition",
              })}
            </Button>
          </VStack>
        </Grid>
      </VStack>
    </Box>
  );
}
