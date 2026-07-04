"use client";

import { useT } from "@/i18n/client";
import {
  buildImposePreviewRequest,
  resolveImposeItemDimensions,
  resolveImposeSheetDimensions,
} from "@/lib/imposition/impose-payload";
import {
  buildUniformSpacing,
  getSpacingValueAt,
  parseSpacingValues,
  type ImposeWorkspaceMode,
} from "@/lib/imposition/workspace";
import {
  Alert,
  Badge,
  Box,
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  HStack,
  Image,
  IconButton,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import useSWR from "swr";
import { resolveImpositionPreview } from "@konfi/wasm/browser";
import type { ImposePreviewRequest, ImposePreviewResponse } from "@konfi/wasm";
import type { CreateImpositionWorkflow } from "@konfi/types";
import { setImposeFormValue, type ImposeFormMethods } from "./impose-form";
import { ImposeSpacingEditorPopover } from "./preview/ImposeSpacingEditorPopover";
import { ImposeTemplatesPanel } from "./ImposeTemplatesPanel";
import { useImposedSheetPreview } from "./preview/useImposedSheetPreview";
import {
  buildHorizontalSpacingHelpers,
  buildVerticalSpacingHelpers,
  calculateGridGeometry,
  formatMillimeters,
  getBackPageTransform,
  getPageNumber,
  getPreviewSlotLabel,
  isDuplexMode,
  MAX_PREVIEW_SIZE,
  normalizeBoolean,
  PRINTER_MARGIN_MM,
  type PreviewDimensions,
  type SpacingAxis,
  type SpacingEditorState,
} from "./preview/preview-helpers";

interface ImposePreviewProps {
  methods: ImposeFormMethods;
  activeMode: ImposeWorkspaceMode;
  templates: CreateImpositionWorkflow[];
  isLoading: boolean;
  onLoadTemplate: (impositionWorkflow: CreateImpositionWorkflow) => void;
  onRemoveTemplate: (id: string) => void | Promise<void>;
}

const previewOverlayBlurCss = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const;

const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_ZOOM_STEP = 0.25;
const PREVIEW_VIEWPORT_MAX_HEIGHT = `min(68vh, ${MAX_PREVIEW_SIZE + 96}px)`;

function clampPreviewZoom(value: number): number {
  return Math.min(
    MAX_PREVIEW_ZOOM,
    Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))),
  );
}

export function ImposePreview({
  methods,
  activeMode,
  templates,
  isLoading,
  onLoadTemplate,
  onRemoveTemplate,
}: ImposePreviewProps) {
  const { t } = useT(["impose", "translation"]);
  const [activePreviewSourceIndex, setActivePreviewSourceIndex] = useState(0);
  const [activeRenderedSheetIndex, setActiveRenderedSheetIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(MIN_PREVIEW_ZOOM);
  const [showBackSide, setShowBackSide] = useState(false);
  const [spacingEditor, setSpacingEditor] = useState<SpacingEditorState | null>(
    null,
  );
  const [spacingInputValue, setSpacingInputValue] = useState("");

  const {
    customSheetSize,
    automaticSheetOrientation,
    customSheetSizeWidth,
    customSheetSizeHeight,
    sheetSizeName,
    sheetOrientation,
    customItemSize,
    automaticItemOrientation,
    customItemSizeWidth,
    customItemSizeHeight,
    itemSizeName,
    itemOrientation,
    automaticNumberOfHorizontalItems,
    automaticNumberOfVerticalItems,
    numItemsHorizontal,
    numItemsVertical,
    automaticSpacingHorizontal,
    automaticSpacingVertical,
    spacingHorizontal,
    spacingVertical,
    bleed,
    bleedType,
    sourceSizing,
    cropMarks,
    layout,
    pagesPerSignature,
    duplexMode: currentDuplexMode,
    backPageRotation: currentBackPageRotation,
    frontBackAlignment,
    files,
    mirrorBack,
  } = useWatch({
    control: methods.control,
  });

  const rawSheet = useMemo<PreviewDimensions>(
    () =>
      resolveImposeSheetDimensions({
        customSheetSize,
        customSheetSizeWidth,
        customSheetSizeHeight,
        sheetSizeName,
        sheetOrientation,
      }),
    [
      customSheetSize,
      customSheetSizeHeight,
      customSheetSizeWidth,
      sheetOrientation,
      sheetSizeName,
    ],
  );

  const rawItem = useMemo<PreviewDimensions>(
    () =>
      resolveImposeItemDimensions({
        customItemSize,
        customItemSizeWidth,
        customItemSizeHeight,
        itemSizeName,
        itemOrientation,
      }),
    [
      customItemSize,
      customItemSizeHeight,
      customItemSizeWidth,
      itemOrientation,
      itemSizeName,
    ],
  );

  const localSheet = useMemo<PreviewDimensions>(() => {
    if (!normalizeBoolean(automaticSheetOrientation)) {
      return rawSheet;
    }

    const portraitWidth = Math.min(rawSheet.width, rawSheet.height);
    const portraitHeight = Math.max(rawSheet.width, rawSheet.height);
    const landscapeWidth = portraitHeight;
    const landscapeHeight = portraitWidth;
    const autoItemOrientation = normalizeBoolean(automaticItemOrientation);

    const fitCount = (
      sheetWidth: number,
      sheetHeight: number,
      itemWidth: number,
      itemHeight: number,
    ) => {
      const horizontal = Math.floor(
        Math.max(0, sheetWidth - PRINTER_MARGIN_MM) / itemWidth,
      );
      const vertical = Math.floor(
        Math.max(0, sheetHeight - PRINTER_MARGIN_MM) / itemHeight,
      );
      return horizontal * vertical;
    };

    const bestFit = (sheetWidth: number, sheetHeight: number) => {
      const normal = fitCount(
        sheetWidth,
        sheetHeight,
        rawItem.width,
        rawItem.height,
      );
      if (!autoItemOrientation) {
        return normal;
      }

      const rotated = fitCount(
        sheetWidth,
        sheetHeight,
        rawItem.height,
        rawItem.width,
      );
      return Math.max(normal, rotated);
    };

    const portraitFit = bestFit(portraitWidth, portraitHeight);
    const landscapeFit = bestFit(landscapeWidth, landscapeHeight);

    if (landscapeFit > portraitFit) {
      return { width: landscapeWidth, height: landscapeHeight };
    }

    return { width: portraitWidth, height: portraitHeight };
  }, [automaticItemOrientation, automaticSheetOrientation, rawItem, rawSheet]);

  const localItem = useMemo<PreviewDimensions>(() => {
    if (!normalizeBoolean(automaticItemOrientation)) {
      return rawItem;
    }

    const normalHorizontal = Math.floor(
      Math.max(0, localSheet.width - PRINTER_MARGIN_MM) / rawItem.width,
    );
    const normalVertical = Math.floor(
      Math.max(0, localSheet.height - PRINTER_MARGIN_MM) / rawItem.height,
    );
    const rotatedHorizontal = Math.floor(
      Math.max(0, localSheet.width - PRINTER_MARGIN_MM) / rawItem.height,
    );
    const rotatedVertical = Math.floor(
      Math.max(0, localSheet.height - PRINTER_MARGIN_MM) / rawItem.width,
    );

    if (
      rotatedHorizontal * rotatedVertical >
      normalHorizontal * normalVertical
    ) {
      return { width: rawItem.height, height: rawItem.width };
    }

    return rawItem;
  }, [automaticItemOrientation, localSheet, rawItem]);

  const previewRequest = useMemo<ImposePreviewRequest | null>(
    () =>
      buildImposePreviewRequest({
        automaticItemOrientation,
        automaticNumberOfHorizontalItems,
        automaticNumberOfVerticalItems,
        automaticSheetOrientation,
        automaticSpacingHorizontal,
        automaticSpacingVertical,
        backPageRotation: currentBackPageRotation,
        bleed,
        bleedType,
        cropMarks,
        customItemSize,
        customItemSizeHeight,
        customItemSizeWidth,
        customSheetSize,
        customSheetSizeHeight,
        customSheetSizeWidth,
        duplexMode: currentDuplexMode,
        frontBackAlignment,
        itemOrientation,
        itemSizeName,
        layout,
        mirrorBack,
        numItemsHorizontal,
        numItemsVertical,
        pagesPerSignature,
        sheetOrientation,
        sheetSizeName,
        sourceSizing,
        spacingHorizontal,
        spacingVertical,
      }),
    [
      automaticItemOrientation,
      automaticNumberOfHorizontalItems,
      automaticNumberOfVerticalItems,
      automaticSheetOrientation,
      automaticSpacingHorizontal,
      automaticSpacingVertical,
      bleed,
      bleedType,
      cropMarks,
      currentBackPageRotation,
      currentDuplexMode,
      customItemSize,
      customItemSizeHeight,
      customItemSizeWidth,
      customSheetSize,
      customSheetSizeHeight,
      customSheetSizeWidth,
      frontBackAlignment,
      itemOrientation,
      itemSizeName,
      layout,
      mirrorBack,
      numItemsHorizontal,
      numItemsVertical,
      pagesPerSignature,
      sheetOrientation,
      sheetSizeName,
      sourceSizing,
      spacingHorizontal,
      spacingVertical,
    ],
  );

  const previewRequestKey = useMemo(
    () => (previewRequest ? JSON.stringify(previewRequest) : null),
    [previewRequest],
  );
  const [debouncedPreviewKey, setDebouncedPreviewKey] = useState<string | null>(
    previewRequestKey,
  );

  useEffect(() => {
    if (!previewRequestKey) {
      setDebouncedPreviewKey(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedPreviewKey(previewRequestKey);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [previewRequestKey]);

  const fetchImposePreview = useCallback(
    async (key: readonly [string, string]): Promise<ImposePreviewResponse> => {
      const [, serializedRequest] = key;
      const request = JSON.parse(serializedRequest) as ImposePreviewRequest;
      return resolveImpositionPreview(request);
    },
    [],
  );

  const {
    data: serverPreview,
    error: previewError,
    isLoading: isPreviewLoading,
  } = useSWR<ImposePreviewResponse>(
    debouncedPreviewKey ? ["impose-preview", debouncedPreviewKey] : null,
    fetchImposePreview,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const activePreview =
    !isPreviewLoading && !previewError ? serverPreview : undefined;
  const shouldShowFallback =
    Boolean(previewError) && !isPreviewLoading && !activePreview;
  const selectedFiles = files ?? [];
  const selectedPreviewSource =
    selectedFiles[activePreviewSourceIndex] ?? selectedFiles[0] ?? null;
  const previewSourceCollection = useMemo(
    () =>
      createListCollection({
        items: selectedFiles.map((file, index) => ({
          label: file.name,
          value: String(index),
        })),
      }),
    [selectedFiles],
  );

  useEffect(() => {
    if (selectedFiles.length === 0) {
      if (activePreviewSourceIndex !== 0) {
        setActivePreviewSourceIndex(0);
      }

      return;
    }

    if (activePreviewSourceIndex >= selectedFiles.length) {
      setActivePreviewSourceIndex(selectedFiles.length - 1);
    }
  }, [activePreviewSourceIndex, selectedFiles.length]);

  const localItemCount = useMemo(() => {
    const horizontalSpacingValues = automaticSpacingHorizontal
      ? []
      : parseSpacingValues(spacingHorizontal);
    const verticalSpacingValues = automaticSpacingVertical
      ? []
      : parseSpacingValues(spacingVertical);

    if (!automaticNumberOfHorizontalItems && !automaticNumberOfVerticalItems) {
      return {
        horizontal: Math.max(1, numItemsHorizontal || 1),
        vertical: Math.max(1, numItemsVertical || 1),
      };
    }

    const availableWidth = Math.max(0, localSheet.width - PRINTER_MARGIN_MM);
    const availableHeight = Math.max(0, localSheet.height - PRINTER_MARGIN_MM);
    const averageHorizontalSpacing =
      horizontalSpacingValues.length > 0
        ? horizontalSpacingValues.reduce((sum, value) => sum + value, 0) /
          horizontalSpacingValues.length
        : 0;
    const averageVerticalSpacing =
      verticalSpacingValues.length > 0
        ? verticalSpacingValues.reduce((sum, value) => sum + value, 0) /
          verticalSpacingValues.length
        : 0;

    return {
      horizontal: automaticNumberOfHorizontalItems
        ? Math.max(
            1,
            Math.floor(
              availableWidth / (localItem.width + averageHorizontalSpacing),
            ),
          )
        : Math.max(1, numItemsHorizontal || 1),
      vertical: automaticNumberOfVerticalItems
        ? Math.max(
            1,
            Math.floor(
              availableHeight / (localItem.height + averageVerticalSpacing),
            ),
          )
        : Math.max(1, numItemsVertical || 1),
    };
  }, [
    automaticNumberOfHorizontalItems,
    automaticNumberOfVerticalItems,
    automaticSpacingHorizontal,
    automaticSpacingVertical,
    localItem.height,
    localItem.width,
    localSheet.height,
    localSheet.width,
    numItemsHorizontal,
    numItemsVertical,
    spacingHorizontal,
    spacingVertical,
  ]);

  const sheet =
    activePreview?.sheet?.widthMm && activePreview?.sheet?.heightMm
      ? {
          width: activePreview.sheet.widthMm,
          height: activePreview.sheet.heightMm,
        }
      : localSheet;
  const item =
    activePreview?.item?.widthMm && activePreview?.item?.heightMm
      ? {
          width: activePreview.item.widthMm,
          height: activePreview.item.heightMm,
        }
      : localItem;

  const resolvedItemCount = activePreview?.resolvedWorkflow
    ? {
        horizontal:
          activePreview.resolvedWorkflow.numItemsHorizontal ??
          localItemCount.horizontal,
        vertical:
          activePreview.resolvedWorkflow.numItemsVertical ??
          localItemCount.vertical,
      }
    : localItemCount;

  const resolvedHorizontalSpacingMm =
    activePreview?.resolvedWorkflow?.spacingHorizontalMm ??
    (automaticSpacingHorizontal ? [] : parseSpacingValues(spacingHorizontal));
  const resolvedVerticalSpacingMm =
    activePreview?.resolvedWorkflow?.spacingVerticalMm ??
    (automaticSpacingVertical ? [] : parseSpacingValues(spacingVertical));

  const selectedPreviewSlots = activePreview?.displayPreview
    ? showBackSide
      ? activePreview.displayPreview.back?.slots
      : activePreview.displayPreview.front?.slots
    : undefined;
  const previewBackTransform = showBackSide
    ? activePreview?.displayPreview?.back?.transform || ""
    : "";
  const hasBackSide = activePreview?.displayPreview
    ? Boolean(activePreview.displayPreview.back?.available)
    : isDuplexMode(currentDuplexMode);

  useEffect(() => {
    if (!hasBackSide && showBackSide) {
      setShowBackSide(false);
    }
  }, [hasBackSide, showBackSide]);

  const fitScaleFactor =
    sheet.width > 0 && sheet.height > 0
      ? Math.min(
          MAX_PREVIEW_SIZE / sheet.width,
          MAX_PREVIEW_SIZE / sheet.height,
          2,
        )
      : 2;
  const scaleFactor = fitScaleFactor * previewZoom;
  const renderedPreviewWidth = sheet.width * fitScaleFactor;
  const renderedPreviewHeight = sheet.height * fitScaleFactor;
  const previewWidth = sheet.width * scaleFactor;
  const previewHeight = sheet.height * scaleFactor;
  const requestedRenderedPageNumbers = useMemo(() => {
    if (!selectedPreviewSource || !previewRequest || !debouncedPreviewKey) {
      return [];
    }

    if (hasBackSide) {
      const frontPageNumber = activeRenderedSheetIndex * 2 + 1;

      return [frontPageNumber, frontPageNumber + 1];
    }

    return [activeRenderedSheetIndex + 1];
  }, [
    activeRenderedSheetIndex,
    debouncedPreviewKey,
    hasBackSide,
    previewRequest,
    selectedPreviewSource,
  ]);
  const renderedSheetPreview = useImposedSheetPreview({
    file: selectedPreviewSource,
    previewHeight: renderedPreviewHeight,
    previewRequest,
    previewRequestKey: debouncedPreviewKey,
    previewWidth: renderedPreviewWidth,
    requestedPageNumbers: requestedRenderedPageNumbers,
  });
  const renderedPreviewSupportsBackSide =
    hasBackSide && renderedSheetPreview.pageCount > 1;
  const renderedSheetCount =
    renderedSheetPreview.pageCount > 0
      ? renderedPreviewSupportsBackSide
        ? Math.ceil(renderedSheetPreview.pageCount / 2)
        : renderedSheetPreview.pageCount
      : 0;
  const previewHasBackSide =
    renderedSheetPreview.pageCount > 0
      ? renderedPreviewSupportsBackSide
      : hasBackSide;
  const currentRenderedPageNumber =
    renderedSheetPreview.pageCount > 0
      ? renderedPreviewSupportsBackSide
        ? activeRenderedSheetIndex * 2 + (showBackSide ? 2 : 1)
        : activeRenderedSheetIndex + 1
      : undefined;
  const currentRenderedSheetImage = currentRenderedPageNumber
    ? renderedSheetPreview.pageImages[currentRenderedPageNumber]
    : undefined;
  const renderedSheetPreviewErrorMessage =
    selectedPreviewSource && !renderedSheetPreview.isLoading
      ? renderedSheetPreview.errorMessage
      : null;

  useEffect(() => {
    setActiveRenderedSheetIndex(0);
  }, [
    debouncedPreviewKey,
    selectedPreviewSource?.lastModified,
    selectedPreviewSource?.name,
    selectedPreviewSource?.size,
  ]);

  useEffect(() => {
    if (renderedSheetCount === 0) {
      if (activeRenderedSheetIndex !== 0) {
        setActiveRenderedSheetIndex(0);
      }

      return;
    }

    if (activeRenderedSheetIndex >= renderedSheetCount) {
      setActiveRenderedSheetIndex(renderedSheetCount - 1);
    }
  }, [activeRenderedSheetIndex, renderedSheetCount]);

  useEffect(() => {
    if (!previewHasBackSide && showBackSide) {
      setShowBackSide(false);
    }
  }, [previewHasBackSide, showBackSide]);

  const gridGeometry = useMemo(() => {
    const horizontalSpacingPx = Array.from(
      { length: Math.max(0, resolvedItemCount.horizontal - 1) },
      (_, index) =>
        getSpacingValueAt(resolvedHorizontalSpacingMm, index) * scaleFactor,
    );
    const verticalSpacingPx = Array.from(
      { length: Math.max(0, resolvedItemCount.vertical - 1) },
      (_, index) =>
        getSpacingValueAt(resolvedVerticalSpacingMm, index) * scaleFactor,
    );

    return calculateGridGeometry({
      previewWidth,
      previewHeight,
      itemWidthPx: item.width * scaleFactor,
      itemHeightPx: item.height * scaleFactor,
      horizontal: resolvedItemCount.horizontal,
      vertical: resolvedItemCount.vertical,
      horizontalSpacingPx,
      verticalSpacingPx,
    });
  }, [
    item.height,
    item.width,
    previewHeight,
    previewWidth,
    resolvedHorizontalSpacingMm,
    resolvedItemCount.horizontal,
    resolvedItemCount.vertical,
    resolvedVerticalSpacingMm,
    scaleFactor,
  ]);

  const openSpacingEditor = useCallback(
    (axis: SpacingAxis, index: number, x: number, y: number) => {
      const currentValue =
        axis === "horizontal"
          ? getSpacingValueAt(resolvedHorizontalSpacingMm, index)
          : getSpacingValueAt(resolvedVerticalSpacingMm, index);

      setSpacingEditor({
        axis,
        index,
        x,
        y,
      });
      setSpacingInputValue(
        Number.isInteger(currentValue)
          ? currentValue.toString()
          : currentValue.toFixed(2).replace(/\.?0+$/, ""),
      );
    },
    [resolvedHorizontalSpacingMm, resolvedVerticalSpacingMm],
  );

  const applySpacingEditor = useCallback(() => {
    if (!spacingEditor) {
      return;
    }

    const parsedValue = Number.parseFloat(spacingInputValue.replace(",", "."));
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    const normalized = Math.max(0, parsedValue);
    if (spacingEditor.axis === "horizontal") {
      setImposeFormValue(methods, "automaticSpacingHorizontal", false);
      setImposeFormValue(
        methods,
        "spacingHorizontal",
        buildUniformSpacing(
          normalized,
          Math.max(0, resolvedItemCount.horizontal - 1),
        ),
      );
    } else {
      setImposeFormValue(methods, "automaticSpacingVertical", false);
      setImposeFormValue(
        methods,
        "spacingVertical",
        buildUniformSpacing(
          normalized,
          Math.max(0, resolvedItemCount.vertical - 1),
        ),
      );
    }

    setSpacingEditor(null);
  }, [
    methods,
    resolvedItemCount.horizontal,
    resolvedItemCount.vertical,
    spacingEditor,
    spacingInputValue,
  ]);

  const adjustHorizontalCount = useCallback(
    (delta: number) => {
      setImposeFormValue(methods, "automaticNumberOfHorizontalItems", false);
      setImposeFormValue(
        methods,
        "numItemsHorizontal",
        Math.max(1, resolvedItemCount.horizontal + delta),
      );
    },
    [methods, resolvedItemCount.horizontal],
  );

  const adjustVerticalCount = useCallback(
    (delta: number) => {
      setImposeFormValue(methods, "automaticNumberOfVerticalItems", false);
      setImposeFormValue(
        methods,
        "numItemsVertical",
        Math.max(1, resolvedItemCount.vertical + delta),
      );
    },
    [methods, resolvedItemCount.vertical],
  );

  const rowIndexes = useMemo(
    () =>
      Array.from(
        { length: resolvedItemCount.vertical },
        (_, rowIndex) => rowIndex,
      ),
    [resolvedItemCount.vertical],
  );
  const columnIndexes = useMemo(
    () =>
      Array.from(
        { length: resolvedItemCount.horizontal },
        (_, columnIndex) => columnIndex,
      ),
    [resolvedItemCount.horizontal],
  );
  const horizontalGapIndexes = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, resolvedItemCount.horizontal - 1) },
        (_, index) => index,
      ),
    [resolvedItemCount.horizontal],
  );
  const verticalGapIndexes = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, resolvedItemCount.vertical - 1) },
        (_, index) => index,
      ),
    [resolvedItemCount.vertical],
  );
  const horizontalSpacingHelpers = useMemo(
    () =>
      buildHorizontalSpacingHelpers({
        gridGeometry,
        spacingValuesMm: horizontalGapIndexes.map((gapIndex) =>
          getSpacingValueAt(resolvedHorizontalSpacingMm, gapIndex),
        ),
      }),
    [gridGeometry, horizontalGapIndexes, resolvedHorizontalSpacingMm],
  );
  const verticalSpacingHelpers = useMemo(
    () =>
      buildVerticalSpacingHelpers({
        gridGeometry,
        spacingValuesMm: verticalGapIndexes.map((gapIndex) =>
          getSpacingValueAt(resolvedVerticalSpacingMm, gapIndex),
        ),
      }),
    [gridGeometry, resolvedVerticalSpacingMm, verticalGapIndexes],
  );

  if (
    sheet.width <= 0 ||
    sheet.height <= 0 ||
    item.width <= 0 ||
    item.height <= 0
  ) {
    return (
      <Box
        borderWidth="1px"
        borderRadius="3xl"
        bg={{ base: "gray.50", _dark: "gray.900" }}
        p={8}
      >
        <VStack gap={3}>
          <Text fontWeight="semibold">
            {t("impose.invalidDimensions", {
              defaultValue: "Invalid dimensions",
            })}
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      borderWidth="1px"
      borderRadius="3xl"
      bg={{ base: "gray.50", _dark: "black" }}
      p={4}
      h="100%"
    >
      <VStack align="stretch" gap={4} justify="space-between" height="100%">
        <HStack justify="flex-end" align="start" wrap="wrap" gap={3}>
          <VStack
            align="flex-end"
            gap={2}
            ml="auto"
            w={{ base: "100%", md: "auto" }}
          >
            <HStack
              gap={2}
              wrap="wrap"
              align="center"
              justify="flex-end"
              ml="auto"
            >
              {isPreviewLoading && (
                <Badge colorPalette="blue" borderRadius="full" px={3} py={1}>
                  {t("impose.previewLoading", {
                    defaultValue: "Updating preview...",
                  })}
                </Badge>
              )}
              {selectedPreviewSource && renderedSheetPreview.isLoading && (
                <Badge colorPalette="blue" borderRadius="full" px={3} py={1}>
                  {renderedSheetPreview.progressPercent === null
                    ? t("impose.previewSourceLoading", {
                        defaultValue: "Rendering actual preview...",
                      })
                    : t("impose.previewSourceLoadingProgress", {
                        defaultValue:
                          "Rendering actual preview... {{progress}}%",
                        progress: renderedSheetPreview.progressPercent,
                      })}
                </Badge>
              )}
              {selectedPreviewSource && currentRenderedSheetImage && (
                <Badge colorPalette="green" borderRadius="full" px={3} py={1}>
                  {t("impose.previewActual", {
                    defaultValue: "1:1 source preview",
                  })}
                </Badge>
              )}
              {shouldShowFallback && (
                <Badge colorPalette="orange" borderRadius="full" px={3} py={1}>
                  {t("impose.previewFallback", {
                    defaultValue: "Showing local preview",
                  })}
                </Badge>
              )}
              {renderedSheetPreviewErrorMessage && (
                <Badge colorPalette="orange" borderRadius="full" px={3} py={1}>
                  {t("impose.previewSourceFallback", {
                    defaultValue: "Actual file preview unavailable",
                  })}
                </Badge>
              )}
              {selectedFiles.length > 1 && (
                <Box
                  w={{ base: "100%", sm: "20rem" }}
                  maxW="100%"
                  flexShrink={0}
                >
                  <Select.Root
                    size="sm"
                    collection={previewSourceCollection}
                    value={[String(activePreviewSourceIndex)]}
                    onValueChange={({ value }) => {
                      const nextValue = value[0];

                      if (!nextValue) {
                        return;
                      }

                      setActivePreviewSourceIndex(
                        Number.parseInt(nextValue, 10) || 0,
                      );
                    }}
                  >
                    <Select.HiddenSelect />
                    <Select.Control
                      w="full"
                      borderRadius="full"
                      bg={{ base: "white", _dark: "gray.900" }}
                      borderWidth="1px"
                    >
                      <Select.Trigger
                        aria-label={t("impose.workspace.previewSource", {
                          defaultValue: "Preview source",
                        })}
                      >
                        <Select.ValueText
                          placeholder={t("impose.workspace.previewSource", {
                            defaultValue: "Preview source",
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
                          {previewSourceCollection.items.map(
                            (previewSourceItem) => (
                              <Select.Item
                                item={previewSourceItem}
                                key={previewSourceItem.value}
                              >
                                {previewSourceItem.label}
                                <Select.ItemIndicator />
                              </Select.Item>
                            ),
                          )}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </Box>
              )}
              {renderedSheetCount > 1 && (
                <HStack
                  gap={1}
                  p={1}
                  borderRadius="full"
                  bg={{ base: "white", _dark: "gray.900" }}
                  borderWidth="1px"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={activeRenderedSheetIndex === 0}
                    onClick={() =>
                      setActiveRenderedSheetIndex((current) =>
                        Math.max(0, current - 1),
                      )
                    }
                  >
                    <MaterialSymbol>chevron_left</MaterialSymbol>
                  </Button>
                  <Badge
                    colorPalette="gray"
                    borderRadius="full"
                    px={2.5}
                    py={1.5}
                  >
                    {t("impose.workspace.previewSheet", {
                      defaultValue: "Sheet {{current}} of {{total}}",
                      current: activeRenderedSheetIndex + 1,
                      total: renderedSheetCount,
                    })}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={
                      activeRenderedSheetIndex >= renderedSheetCount - 1
                    }
                    onClick={() =>
                      setActiveRenderedSheetIndex((current) =>
                        Math.min(renderedSheetCount - 1, current + 1),
                      )
                    }
                  >
                    <MaterialSymbol>chevron_right</MaterialSymbol>
                  </Button>
                </HStack>
              )}
              {previewHasBackSide && (
                <HStack
                  gap={1}
                  p={1}
                  borderRadius="full"
                  bg={{ base: "white", _dark: "gray.900" }}
                  borderWidth="1px"
                >
                  <Button
                    size="sm"
                    variant={!showBackSide ? "solid" : "ghost"}
                    colorPalette={!showBackSide ? "primary" : "gray"}
                    onClick={() => setShowBackSide(false)}
                  >
                    {t("impose.frontPage", { defaultValue: "Front page" })}
                  </Button>
                  <Button
                    size="sm"
                    variant={showBackSide ? "solid" : "ghost"}
                    colorPalette={showBackSide ? "primary" : "gray"}
                    onClick={() => setShowBackSide(true)}
                  >
                    {t("impose.backPage", { defaultValue: "Back page" })}
                  </Button>
                </HStack>
              )}
              <HStack
                gap={1}
                p={1}
                borderRadius="full"
                bg={{ base: "white", _dark: "gray.900" }}
                borderWidth="1px"
                role="group"
                aria-label={t("impose.previewZoomLabel", {
                  defaultValue: "Preview zoom",
                })}
              >
                <IconButton
                  size="sm"
                  variant="ghost"
                  borderRadius="full"
                  aria-label={t("impose.previewZoomOut", {
                    defaultValue: "Zoom out",
                  })}
                  disabled={previewZoom <= MIN_PREVIEW_ZOOM}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      clampPreviewZoom(current - PREVIEW_ZOOM_STEP),
                    )
                  }
                >
                  <MaterialSymbol>zoom_out</MaterialSymbol>
                </IconButton>
                <Badge
                  colorPalette="gray"
                  borderRadius="full"
                  px={2.5}
                  py={1.5}
                  minW="4rem"
                  textAlign="center"
                >
                  {Math.round(previewZoom * 100)}%
                </Badge>
                <IconButton
                  size="sm"
                  variant="ghost"
                  borderRadius="full"
                  aria-label={t("impose.previewZoomIn", {
                    defaultValue: "Zoom in",
                  })}
                  disabled={previewZoom >= MAX_PREVIEW_ZOOM}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      clampPreviewZoom(current + PREVIEW_ZOOM_STEP),
                    )
                  }
                >
                  <MaterialSymbol>zoom_in</MaterialSymbol>
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  borderRadius="full"
                  aria-label={t("impose.previewZoomReset", {
                    defaultValue: "Reset zoom",
                  })}
                  disabled={previewZoom === MIN_PREVIEW_ZOOM}
                  onClick={() => setPreviewZoom(MIN_PREVIEW_ZOOM)}
                >
                  <MaterialSymbol>fullscreen</MaterialSymbol>
                </IconButton>
              </HStack>
            </HStack>
            <Dialog.Root size="xl" placement="center">
              <Dialog.Trigger asChild>
                <Button
                  size="md"
                  colorPalette="primary"
                  variant="solid"
                  px={5}
                  boxShadow="md"
                  flexShrink={0}
                >
                  <MaterialSymbol>view_module</MaterialSymbol>
                  {t("templates", {
                    ns: "translation",
                    defaultValue: "Templates",
                  })}
                </Button>
              </Dialog.Trigger>
              <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner py={8}>
                  <Dialog.Content
                    h="calc(100vh - 4rem)"
                    maxH="calc(100vh - 4rem)"
                    display="flex"
                    flexDirection="column"
                    overflow="hidden"
                    borderRadius="3xl"
                  >
                    <Dialog.Body
                      p={4}
                      flex={1}
                      minH={0}
                      display="flex"
                      overflow="hidden"
                    >
                      <ImposeTemplatesPanel
                        templates={templates}
                        isLoading={isLoading}
                        onLoadTemplate={onLoadTemplate}
                        onRemoveTemplate={onRemoveTemplate}
                      />
                    </Dialog.Body>
                    <Dialog.CloseTrigger asChild>
                      <CloseButton size="sm" />
                    </Dialog.CloseTrigger>
                  </Dialog.Content>
                </Dialog.Positioner>
              </Portal>
            </Dialog.Root>
          </VStack>
        </HStack>

        {renderedSheetPreviewErrorMessage && (
          <Alert.Root
            status="warning"
            variant="subtle"
            mt={4}
            aria-live="polite"
          >
            <Alert.Indicator />
            <Alert.Content minW={0}>
              <Alert.Title>
                {t("impose.previewSourceFallback", {
                  defaultValue: "Actual file preview unavailable",
                })}
              </Alert.Title>
              <Alert.Description>
                <Text as="span" fontSize="sm" wordBreak="break-word">
                  {t("impose.previewSourceErrorReason", {
                    defaultValue: "Reason: {{reason}}",
                    reason: renderedSheetPreviewErrorMessage,
                  })}
                </Text>
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        <Box
          overflow="auto"
          pb={2}
          maxH={PREVIEW_VIEWPORT_MAX_HEIGHT}
          overscrollBehavior="contain"
        >
          <Box
            display="flex"
            justifyContent="center"
            minW="fit-content"
            minH="24rem"
            px={8}
            py={8}
          >
            <Box
              position="relative"
              width={`${previewWidth}px`}
              height={`${previewHeight}px`}
            >
              <>
                <HStack
                  position="absolute"
                  top="0"
                  left="50%"
                  transform="translate(-50%, -50%)"
                  zIndex={4}
                  gap={1}
                  p={1}
                  borderRadius="full"
                  bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                  borderWidth="1px"
                  css={previewOverlayBlurCss}
                  role="group"
                  aria-label={t("impose.workspace.itemsAcross", {
                    defaultValue: "Items across",
                  })}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("impose.workspace.decreaseHorizontalCount", {
                      defaultValue: "Decrease items across",
                    })}
                    onClick={() => adjustHorizontalCount(-1)}
                  >
                    -
                  </Button>
                  <Badge
                    colorPalette="gray"
                    borderRadius="full"
                    px={2.5}
                    py={1.5}
                  >
                    <Text fontSize="sm" fontWeight="semibold" lineHeight="1">
                      {resolvedItemCount.horizontal}
                    </Text>
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("impose.workspace.increaseHorizontalCount", {
                      defaultValue: "Increase items across",
                    })}
                    onClick={() => adjustHorizontalCount(1)}
                  >
                    +
                  </Button>
                </HStack>
                <VStack
                  position="absolute"
                  top="50%"
                  right="0"
                  transform="translate(50%, -50%)"
                  zIndex={4}
                  gap={1}
                  p={1}
                  borderRadius="full"
                  bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                  borderWidth="1px"
                  css={previewOverlayBlurCss}
                  role="group"
                  aria-label={t("impose.workspace.itemsDown", {
                    defaultValue: "Items down",
                  })}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("impose.workspace.increaseVerticalCount", {
                      defaultValue: "Increase items down",
                    })}
                    onClick={() => adjustVerticalCount(1)}
                  >
                    +
                  </Button>
                  <Badge
                    colorPalette="gray"
                    borderRadius="full"
                    px={2.5}
                    py={1.5}
                  >
                    <Text fontSize="sm" fontWeight="semibold" lineHeight="1">
                      {resolvedItemCount.vertical}
                    </Text>
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("impose.workspace.decreaseVerticalCount", {
                      defaultValue: "Decrease items down",
                    })}
                    onClick={() => adjustVerticalCount(-1)}
                  >
                    -
                  </Button>
                </VStack>
              </>

              <Box
                position="absolute"
                top="0"
                left="0"
                width={`${previewWidth}px`}
                height={`${previewHeight}px`}
                bg="white"
                border="2px solid"
                borderColor={{ base: "gray.300", _dark: "gray.700" }}
                borderRadius="2xl"
                overflow="hidden"
                boxShadow="sm"
              >
                {currentRenderedSheetImage ? (
                  <Image
                    src={currentRenderedSheetImage}
                    alt={t("impose.workspace.previewImageAlt", {
                      defaultValue: "Imposition preview for {{filename}}",
                      filename: selectedPreviewSource?.name || "preview",
                    })}
                    position="absolute"
                    inset="0"
                    width="100%"
                    height="100%"
                    objectFit="fill"
                    display="block"
                  />
                ) : activePreview?.displayPreview ? (
                  (selectedPreviewSlots ?? []).map((slot, index) => {
                    const x = (slot.xMm ?? 0) * scaleFactor;
                    const y = (slot.yMm ?? 0) * scaleFactor;
                    const slotWidth = (slot.widthMm ?? 0) * scaleFactor;
                    const slotHeight = (slot.heightMm ?? 0) * scaleFactor;

                    if (slotWidth <= 0 || slotHeight <= 0) {
                      return null;
                    }

                    const fontSize =
                      Math.min(slotWidth, slotHeight) < 30
                        ? "2xs"
                        : Math.min(slotWidth, slotHeight) < 56
                          ? "xs"
                          : "sm";

                    return (
                      <Box
                        key={`preview-slot-${slot.index ?? index}`}
                        position="absolute"
                        top={`${y}px`}
                        left={`${x}px`}
                        width={`${slotWidth}px`}
                        height={`${slotHeight}px`}
                        bg={
                          showBackSide
                            ? { base: "gray.500", _dark: "gray.600" }
                            : { base: "gray.400", _dark: "gray.500" }
                        }
                        border="1px solid"
                        borderColor={
                          showBackSide
                            ? { base: "gray.600", _dark: "gray.700" }
                            : { base: "gray.500", _dark: "gray.600" }
                        }
                        borderRadius="md"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        transform={previewBackTransform}
                        transformOrigin="center"
                      >
                        <Text
                          fontSize={fontSize}
                          fontWeight="bold"
                          color={{ base: "white", _dark: "gray.200" }}
                          textShadow="1px 1px 1px rgba(0,0,0,0.8)"
                          userSelect="none"
                        >
                          {getPreviewSlotLabel(slot, index)}
                        </Text>
                      </Box>
                    );
                  })
                ) : (
                  rowIndexes.flatMap((rowIndex) =>
                    columnIndexes.map((columnIndex) => {
                      const x =
                        gridGeometry.gridLeft +
                        gridGeometry.xPositions[columnIndex];
                      const y =
                        gridGeometry.gridTop +
                        gridGeometry.yPositions[rowIndex];
                      const backTransform = showBackSide
                        ? getBackPageTransform(
                            currentBackPageRotation,
                            currentDuplexMode,
                            normalizeBoolean(mirrorBack),
                          )
                        : "";

                      return (
                        <Box
                          key={`fallback-slot-${rowIndex}-${columnIndex}`}
                          position="absolute"
                          top={`${y}px`}
                          left={`${x}px`}
                          width={`${gridGeometry.itemWidthPx}px`}
                          height={`${gridGeometry.itemHeightPx}px`}
                          bg={
                            showBackSide
                              ? { base: "gray.500", _dark: "gray.600" }
                              : { base: "gray.400", _dark: "gray.500" }
                          }
                          border="1px solid"
                          borderColor={
                            showBackSide
                              ? { base: "gray.600", _dark: "gray.700" }
                              : { base: "gray.500", _dark: "gray.600" }
                          }
                          borderRadius="md"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          transform={backTransform}
                          transformOrigin="center"
                        >
                          <Text
                            fontSize={
                              Math.min(
                                gridGeometry.itemWidthPx,
                                gridGeometry.itemHeightPx,
                              ) < 30
                                ? "2xs"
                                : Math.min(
                                      gridGeometry.itemWidthPx,
                                      gridGeometry.itemHeightPx,
                                    ) < 56
                                  ? "xs"
                                  : "sm"
                            }
                            fontWeight="bold"
                            color={{ base: "white", _dark: "gray.200" }}
                            textShadow="1px 1px 1px rgba(0,0,0,0.8)"
                            userSelect="none"
                          >
                            {getPageNumber(
                              layout,
                              rowIndex,
                              columnIndex,
                              resolvedItemCount.horizontal,
                              resolvedItemCount.vertical,
                              showBackSide,
                              pagesPerSignature,
                            )}
                          </Text>
                        </Box>
                      );
                    }),
                  )
                )}

                {horizontalSpacingHelpers.map((helper) => (
                  <Box
                    key={`horizontal-gap-${helper.index}`}
                    as="button"
                    position="absolute"
                    top={`${helper.y}px`}
                    left={`${helper.x}px`}
                    transform="translate(-50%, -50%)"
                    zIndex={3}
                    px={2.5}
                    py={1}
                    borderRadius="full"
                    borderWidth="1px"
                    borderStyle="dashed"
                    bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                    borderColor={{ base: "gray.400", _dark: "gray.600" }}
                    css={previewOverlayBlurCss}
                    onClick={() =>
                      openSpacingEditor(
                        "horizontal",
                        helper.index,
                        helper.x,
                        helper.y,
                      )
                    }
                  >
                    <Text fontSize="xs" fontWeight="medium">
                      {formatMillimeters(helper.value)}
                    </Text>
                  </Box>
                ))}

                {verticalSpacingHelpers.map((helper) => (
                  <Box
                    key={`vertical-gap-${helper.index}`}
                    as="button"
                    position="absolute"
                    top={`${helper.y}px`}
                    left={`${helper.x}px`}
                    transform="translate(-50%, -50%)"
                    zIndex={3}
                    px={2.5}
                    py={1}
                    borderRadius="full"
                    borderWidth="1px"
                    borderStyle="dashed"
                    bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                    borderColor={{ base: "gray.400", _dark: "gray.600" }}
                    css={previewOverlayBlurCss}
                    onClick={() =>
                      openSpacingEditor(
                        "vertical",
                        helper.index,
                        helper.x,
                        helper.y,
                      )
                    }
                  >
                    <Text fontSize="xs" fontWeight="medium">
                      {formatMillimeters(helper.value)}
                    </Text>
                  </Box>
                ))}
              </Box>
              {spacingEditor && (
                <ImposeSpacingEditorPopover
                  spacingEditor={spacingEditor}
                  spacingInputValue={spacingInputValue}
                  onChange={setSpacingInputValue}
                  onCancel={() => setSpacingEditor(null)}
                  onApply={applySpacingEditor}
                />
              )}
            </Box>
          </Box>
        </Box>

        <HStack wrap="wrap" gap={2}>
          <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
            {t("impose.dimensions.sheet", {
              width: sheet.width,
              height: sheet.height,
            })}
          </Badge>
          <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
            {t("impose.dimensions.item", {
              width: item.width,
              height: item.height,
            })}
          </Badge>
          <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
            {t("impose.dimensions.elements", {
              horizontal: resolvedItemCount.horizontal,
              vertical: resolvedItemCount.vertical,
            })}
          </Badge>
          <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
            {showBackSide
              ? t("impose.backPage", { defaultValue: "Back page" })
              : t("impose.frontPage", { defaultValue: "Front page" })}
          </Badge>
          {selectedPreviewSource && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {selectedPreviewSource.name}
            </Badge>
          )}
          {renderedSheetCount > 1 && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {t("impose.workspace.previewSheet", {
                defaultValue: "Sheet {{current}} of {{total}}",
                current: activeRenderedSheetIndex + 1,
                total: renderedSheetCount,
              })}
            </Badge>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
