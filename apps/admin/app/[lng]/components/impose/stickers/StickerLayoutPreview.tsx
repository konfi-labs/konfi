"use client";

import { useT } from "@/i18n/client";
import {
  resolvePlacementCutBounds,
  resolvePlacementPrintBounds,
} from "@/lib/sticker-imposition/layout";
import {
  type ManualCutMark,
  oposMarkKind,
  stickerCutShape,
  type OposMarkPosition,
  type StickerImposedSheet,
  type StickerImpositionPlan,
  type StickerLayoutPlacement,
} from "@/lib/sticker-imposition/types";
import {
  Badge,
  Box,
  Card,
  HStack,
  Image,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useEffect, useMemo, useState } from "react";
import type React from "react";

type StickerLayoutPreviewProps = {
  activeSheetIndex: number;
  artworkPreviews: Record<string, string>;
  extraChips?: React.ReactNode;
  isLoading?: boolean;
  onActiveSheetChangeAction: (sheetIndex: number) => void;
  plan: StickerImpositionPlan;
};

const MAX_PREVIEW_WIDTH_PX = 760;
const MAX_PREVIEW_HEIGHT_PX = 620;
const PREVIEW_VIEWPORT_MAX_HEIGHT = `min(68vh, ${MAX_PREVIEW_HEIGHT_PX + 64}px)`;
const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_ZOOM_STEP = 0.25;

type StickerBounds = {
  maxXMm: number;
  maxYMm: number;
  minXMm: number;
  minYMm: number;
};

function getPlacementBorderRadius(placement: StickerLayoutPlacement): string {
  if (placement.cutShape === stickerCutShape.CIRCLE) {
    return "full";
  }

  if (placement.cutShape === stickerCutShape.DIE_CUT) {
    return "lg";
  }

  return "sm";
}

function getPlacementLabel(placement: StickerLayoutPlacement): string {
  if (placement.pageNumber > 1) {
    return `${placement.filename} / ${placement.pageNumber}`;
  }

  return placement.filename;
}

function resolveExportBounds(sheet: StickerImposedSheet): StickerBounds {
  return {
    maxXMm: sheet.exportXMm + sheet.exportWidthMm,
    maxYMm: sheet.exportYMm + sheet.exportHeightMm,
    minXMm: sheet.exportXMm,
    minYMm: sheet.exportYMm,
  };
}

function clampPreviewZoom(value: number): number {
  return Math.min(
    MAX_PREVIEW_ZOOM,
    Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))),
  );
}

function renderOposMarks(
  marks: OposMarkPosition[],
  offsetXMm: number,
  offsetYMm: number,
  scaleFactor: number,
): React.ReactNode {
  return marks.map((mark, idx) => (
    <Box key={`opos-${idx}`} aria-hidden="true" pointerEvents="none">
      <Box
        position="absolute"
        left={`${(mark.xMm + offsetXMm - mark.clearanceMm) * scaleFactor}px`}
        top={`${(mark.yMm + offsetYMm - mark.clearanceMm) * scaleFactor}px`}
        width={`${(mark.widthMm + 2 * mark.clearanceMm) * scaleFactor}px`}
        height={`${(mark.heightMm + 2 * mark.clearanceMm) * scaleFactor}px`}
        bg={{ base: "gray.200", _dark: "gray.700" }}
        borderWidth={mark.kind === oposMarkKind.SQUARE ? "1px" : "0"}
        borderColor={{ base: "gray.400", _dark: "gray.500" }}
        borderRadius={mark.kind === oposMarkKind.SQUARE ? "sm" : "full"}
      />
      <Box
        position="absolute"
        left={`${(mark.xMm + offsetXMm) * scaleFactor}px`}
        top={`${(mark.yMm + offsetYMm) * scaleFactor}px`}
        width={`${Math.max(3, mark.widthMm * scaleFactor)}px`}
        height={`${Math.max(1, mark.heightMm * scaleFactor)}px`}
        bg={{ base: "gray.700", _dark: "gray.200" }}
        borderRadius={mark.kind === oposMarkKind.SQUARE ? "sm" : "full"}
      />
    </Box>
  ));
}

function renderManualCutMarks(
  marks: ManualCutMark[],
  offsetXMm: number,
  offsetYMm: number,
  scaleFactor: number,
): React.ReactNode {
  return marks.map((mark, index) => {
    const x1Px = (mark.x1Mm + offsetXMm) * scaleFactor;
    const y1Px = (mark.y1Mm + offsetYMm) * scaleFactor;
    const x2Px = (mark.x2Mm + offsetXMm) * scaleFactor;
    const y2Px = (mark.y2Mm + offsetYMm) * scaleFactor;
    const isVertical = Math.abs(x1Px - x2Px) < 0.01;

    return (
      <Box
        key={`manual-cut-${index}`}
        aria-hidden="true"
        position="absolute"
        pointerEvents="none"
        left={`${Math.min(x1Px, x2Px)}px`}
        top={`${Math.min(y1Px, y2Px)}px`}
        width={`${Math.max(isVertical ? 1 : Math.abs(x2Px - x1Px), 1)}px`}
        height={`${Math.max(isVertical ? Math.abs(y2Px - y1Px) : 1, 1)}px`}
        bg={{ base: "red.600", _dark: "red.300" }}
        zIndex={5}
      />
    );
  });
}

const zoomOverlayBlurCss = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const;

export function StickerLayoutPreview({
  activeSheetIndex,
  artworkPreviews,
  extraChips,
  isLoading = false,
  onActiveSheetChangeAction,
  plan,
}: StickerLayoutPreviewProps) {
  const { t } = useT(["impose", "translation"]);
  const activeSheet = plan.sheets[activeSheetIndex] ?? plan.sheets[0];
  const [previewZoom, setPreviewZoom] = useState(MIN_PREVIEW_ZOOM);

  useEffect(() => {
    if (plan.sheets.length === 0 && activeSheetIndex !== 0) {
      onActiveSheetChangeAction(0);
      return;
    }

    if (plan.sheets.length > 0 && activeSheetIndex >= plan.sheets.length) {
      onActiveSheetChangeAction(plan.sheets.length - 1);
    }
  }, [activeSheetIndex, onActiveSheetChangeAction, plan.sheets.length]);

  const fitScaleFactor = useMemo(() => {
    if (!activeSheet) {
      return 1;
    }

    return Math.min(
      MAX_PREVIEW_WIDTH_PX / activeSheet.mediaWidthMm,
      MAX_PREVIEW_HEIGHT_PX / activeSheet.previewLengthMm,
      1,
    );
  }, [activeSheet]);
  const scaleFactor = fitScaleFactor * previewZoom;

  const previewWidthPx = activeSheet
    ? activeSheet.mediaWidthMm * scaleFactor
    : 0;
  const previewHeightPx = activeSheet
    ? activeSheet.previewLengthMm * scaleFactor
    : 0;
  const previewOffset = useMemo(() => {
    if (!activeSheet) {
      return { xMm: 0, yMm: 0 };
    }

    const exportBounds = resolveExportBounds(activeSheet);
    const contentWidthMm = exportBounds.maxXMm - exportBounds.minXMm;
    const contentHeightMm = exportBounds.maxYMm - exportBounds.minYMm;

    return {
      xMm:
        (activeSheet.mediaWidthMm - contentWidthMm) / 2 - exportBounds.minXMm,
      yMm:
        (activeSheet.previewLengthMm - contentHeightMm) / 2 -
        exportBounds.minYMm,
    };
  }, [activeSheet]);
  const toPreviewX = (valueMm: number) =>
    `${(valueMm + previewOffset.xMm) * scaleFactor}px`;
  const toPreviewY = (valueMm: number) =>
    `${(valueMm + previewOffset.yMm) * scaleFactor}px`;

  return (
    <Card.Root
      size="sm"
      overflow="hidden"
      h="full"
      display="flex"
      flexDirection="column"
      borderRadius="3xl"
      bg={{ base: "gray.50", _dark: "black" }}
      borderWidth="1px"
    >
      {activeSheet ? (
        <Card.Header>
          <HStack justify="flex-end" align="start" wrap="wrap" gap={4}>
            <VStack align={{ base: "stretch", md: "end" }} gap={2} minW={0}>
              <HStack
                gap={2}
                wrap="wrap"
                aria-live="polite"
                justify={{ base: "flex-start", md: "flex-end" }}
              >
                {isLoading && (
                  <Badge
                    colorPalette="blue"
                    borderRadius="full"
                    px={3}
                    py={1}
                    gap={1}
                  >
                    <Spinner size="xs" />
                    {t("impose.stickers.updatingPreview", {
                      defaultValue: "Updating Preview…",
                    })}
                  </Badge>
                )}
                <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
                  {t("impose.workspace.previewSheet", {
                    defaultValue: "Sheet {{current}} of {{total}}",
                    current: activeSheet.index + 1,
                    total: plan.sheetCount,
                  })}
                </Badge>
                {(activeSheet.repeatCount ?? 1) > 1 && (
                  <Badge colorPalette="blue" borderRadius="full" px={3} py={1}>
                    {t("impose.stickers.repeatCount", {
                      defaultValue: "Print ×{{count}}",
                      count: activeSheet.repeatCount,
                    })}
                  </Badge>
                )}
                <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
                  {t("impose.stickers.summary.utilization", {
                    defaultValue: "{{value}}% utilization",
                    value: activeSheet.utilizationPercent,
                  })}
                </Badge>
              </HStack>

              {plan.sheetCount > 1 && (
                <HStack
                  gap={2}
                  justify={{ base: "flex-start", md: "flex-end" }}
                >
                  <IconButton
                    size="sm"
                    variant="ghost"
                    borderRadius="full"
                    aria-label={t("impose.stickers.previousSheet", {
                      defaultValue: "Previous Sheet",
                    })}
                    disabled={activeSheetIndex === 0}
                    onClick={() =>
                      onActiveSheetChangeAction(
                        Math.max(0, activeSheetIndex - 1),
                      )
                    }
                  >
                    <MaterialSymbol>chevron_left</MaterialSymbol>
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    borderRadius="full"
                    aria-label={t("impose.stickers.nextSheet", {
                      defaultValue: "Next Sheet",
                    })}
                    disabled={activeSheetIndex >= plan.sheetCount - 1}
                    onClick={() =>
                      onActiveSheetChangeAction(
                        Math.min(plan.sheetCount - 1, activeSheetIndex + 1),
                      )
                    }
                  >
                    <MaterialSymbol>chevron_right</MaterialSymbol>
                  </IconButton>
                </HStack>
              )}
            </VStack>
          </HStack>
        </Card.Header>
      ) : null}

      <Card.Body pt={0} flex="1" display="flex" minH={0} overflow="hidden">
        {!activeSheet ? (
          <Box
            mt={6}
            alignSelf="stretch"
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="gray.muted"
            borderRadius="2xl"
            p={6}
            // On lg+ the floating section pills overlay the top-left of the
            // preview, so reserve their width and keep the message clear of
            // the panel; minH gives an open section card room inside the card.
            pl={{ base: 6, lg: "23rem" }}
            minH={{ base: "auto", lg: "28rem" }}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="gray.subtle"
            w="full"
          >
            <Text color="fg.muted" textAlign="center">
              {t("impose.stickers.emptyPreview", {
                defaultValue:
                  "Add sticker sources to see the live layout preview.",
              })}
            </Text>
          </Box>
        ) : (
          <Box
            flex="1"
            display="flex"
            alignItems="center"
            justifyContent="center"
            minH={0}
            w="full"
            position="relative"
          >
            <HStack
              position="absolute"
              top={4}
              right={4}
              zIndex={6}
              gap={1}
              p={1}
              borderRadius="full"
              bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
              borderWidth="1px"
              css={zoomOverlayBlurCss}
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
            <Box
              overflow="auto"
              pb={2}
              h="full"
              maxH="100%"
              minH={0}
              maxW="100%"
              maxHeight={PREVIEW_VIEWPORT_MAX_HEIGHT}
              w="full"
              overscrollBehavior="contain"
            >
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                minW="fit-content"
                minH="24rem"
                borderWidth="1px"
                borderRadius="2xl"
                bg={{ base: "gray.100", _dark: "gray.900" }}
                px={4}
                py={6}
              >
                <Box
                  position="relative"
                  width={`${previewWidthPx}px`}
                  height={`${previewHeightPx}px`}
                  minW={`${previewWidthPx}px`}
                >
                  <Box
                    position="absolute"
                    inset="0"
                    bg={{ base: "white", _dark: "gray.950" }}
                    border="2px solid"
                    borderColor={{ base: "gray.300", _dark: "gray.700" }}
                    borderRadius="2xl"
                    overflow="hidden"
                  >
                    <Box
                      position="absolute"
                      top={toPreviewY(activeSheet.exportYMm)}
                      left={toPreviewX(activeSheet.exportXMm)}
                      width={`${activeSheet.exportWidthMm * scaleFactor}px`}
                      height={`${activeSheet.exportHeightMm * scaleFactor}px`}
                      borderWidth="1px"
                      borderStyle="dashed"
                      borderColor={{ base: "gray.500", _dark: "gray.500" }}
                      pointerEvents="none"
                    />

                    {activeSheet.partBoundaries.map((part) => (
                      <Box
                        key={part.id}
                        position="absolute"
                        top={toPreviewY(part.yMm)}
                        left={toPreviewX(part.xMm)}
                        width={`${part.widthMm * scaleFactor}px`}
                        height={`${part.heightMm * scaleFactor}px`}
                        borderWidth="1px"
                        borderStyle="dashed"
                        borderColor={{ base: "gray.400", _dark: "gray.500" }}
                        pointerEvents="none"
                      />
                    ))}

                    {activeSheet.placements.map((placement, index) => {
                      const cutBounds = resolvePlacementCutBounds(placement);
                      const printBounds =
                        resolvePlacementPrintBounds(placement);
                      const previewImage = artworkPreviews[placement.itemId];
                      const isRotated = placement.rotationDegrees === 90;
                      const cutWidthPx =
                        (cutBounds.maxXMm - cutBounds.minXMm) * scaleFactor;
                      const cutHeightPx =
                        (cutBounds.maxYMm - cutBounds.minYMm) * scaleFactor;
                      const printWidthPx =
                        (printBounds.maxXMm - printBounds.minXMm) * scaleFactor;
                      const printHeightPx =
                        (printBounds.maxYMm - printBounds.minYMm) * scaleFactor;
                      const smallPlacement =
                        Math.min(printWidthPx, printHeightPx) < 44;

                      return (
                        <Box key={`${placement.itemId}-${index}`}>
                          <Box
                            position="absolute"
                            zIndex={3}
                            top={toPreviewY(cutBounds.minYMm)}
                            left={toPreviewX(cutBounds.minXMm)}
                            width={`${cutWidthPx}px`}
                            height={`${cutHeightPx}px`}
                            borderWidth="1px"
                            borderStyle="dashed"
                            borderColor={{
                              base: "gray.500",
                              _dark: "gray.500",
                            }}
                            borderRadius={getPlacementBorderRadius(placement)}
                            pointerEvents="none"
                          />
                          <Box
                            position="absolute"
                            zIndex={1}
                            top={toPreviewY(printBounds.minYMm)}
                            left={toPreviewX(printBounds.minXMm)}
                            width={`${printWidthPx}px`}
                            height={`${printHeightPx}px`}
                            bg={
                              previewImage
                                ? { base: "white", _dark: "gray.900" }
                                : { base: "gray.300", _dark: "gray.700" }
                            }
                            borderWidth="1px"
                            borderColor={{
                              base: "gray.500",
                              _dark: "gray.400",
                            }}
                            borderRadius={getPlacementBorderRadius(placement)}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            px={previewImage ? 0 : 1}
                            overflow="hidden"
                          >
                            {previewImage ? (
                              <Image
                                src={previewImage}
                                alt={t("impose.stickers.previewImageAlt", {
                                  defaultValue:
                                    "Sticker design preview for {{filename}}",
                                  filename: getPlacementLabel(placement),
                                })}
                                position={isRotated ? "absolute" : undefined}
                                top={isRotated ? "50%" : undefined}
                                left={isRotated ? "50%" : undefined}
                                width={
                                  isRotated ? `${printHeightPx}px` : "100%"
                                }
                                height={
                                  isRotated ? `${printWidthPx}px` : "100%"
                                }
                                objectFit="fill"
                                display="block"
                                transform={
                                  isRotated
                                    ? "translate(-50%, -50%) rotate(90deg)"
                                    : undefined
                                }
                                transformOrigin="center"
                              />
                            ) : !smallPlacement ? (
                              <Text
                                color={{ base: "gray.700", _dark: "gray.100" }}
                                fontSize="xs"
                                fontWeight="semibold"
                                lineClamp={2}
                                textAlign="center"
                                wordBreak="break-word"
                              >
                                {getPlacementLabel(placement)}
                              </Text>
                            ) : null}
                          </Box>
                          {placement.bleedMm > 0 ? (
                            <Box
                              position="absolute"
                              zIndex={2}
                              top={toPreviewY(placement.yMm)}
                              left={toPreviewX(placement.xMm)}
                              width={`${placement.widthMm * scaleFactor}px`}
                              height={`${placement.heightMm * scaleFactor}px`}
                              borderWidth="1px"
                              borderColor={{
                                base: "blue.500",
                                _dark: "blue.300",
                              }}
                              borderRadius={getPlacementBorderRadius(placement)}
                              pointerEvents="none"
                            />
                          ) : null}
                        </Box>
                      );
                    })}
                  </Box>
                  {renderOposMarks(
                    activeSheet.oposMarks,
                    previewOffset.xMm,
                    previewOffset.yMm,
                    scaleFactor,
                  )}
                  {renderManualCutMarks(
                    activeSheet.manualCutMarks,
                    previewOffset.xMm,
                    previewOffset.yMm,
                    scaleFactor,
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Card.Body>

      <Card.Footer pt={0}>
        <VStack align="stretch" gap={2} w="full">
          <HStack gap={2} wrap="wrap">
          {activeSheet && activeSheet.oposMarks.length > 0 && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              ⬛{" "}
              {t("impose.stickers.opos.legendBadge", {
                defaultValue: "OPOS guides",
                count: activeSheet.oposMarks.length,
              })}
            </Badge>
          )}
          {activeSheet && activeSheet.manualCutMarks.length > 0 && (
            <Badge colorPalette="red" borderRadius="full" px={3} py={1}>
              {t("impose.stickers.manualCutMarks.legendBadge", {
                count: activeSheet.manualCutMarks.length,
                defaultValue: "Manual cut marks",
              })}
            </Badge>
          )}
          {activeSheet && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {t("impose.stickers.summary.media", {
                defaultValue: "Media: {{width}} mm",
                width: activeSheet.mediaWidthMm,
              })}
            </Badge>
          )}
          {activeSheet && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {t("impose.stickers.summary.export", {
                defaultValue: "Export: {{width}} × {{height}} mm",
                height: Math.round(activeSheet.exportHeightMm),
                width: Math.round(activeSheet.exportWidthMm),
              })}
            </Badge>
          )}
          {activeSheet && (
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {t("impose.stickers.summary.length", {
                defaultValue: "Preview length: {{length}} mm",
                length: Math.round(activeSheet.previewLengthMm),
              })}
            </Badge>
          )}
            {extraChips}
          </HStack>
          <Text fontSize="xs" color="fg.muted">
            {t("impose.stickers.previewHint", {
              defaultValue:
                "Preview keeps roll margins visible; exported files crop to the occupied cut area.",
            })}
          </Text>
        </VStack>
      </Card.Footer>
    </Card.Root>
  );
}
