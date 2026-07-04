"use client";

import { useT } from "@/i18n/client";
import {
  Alert,
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useCallback, useState } from "react";
import type { PointerEvent, PointerEventHandler, RefObject } from "react";
import type { RasterizedSpotAsset, SpotProofView, SpotToolMode } from "./spot-color-client";

const viewToggleBlurCss = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const;

const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_ZOOM_STEP = 0.25;
const PREVIEW_VIEWPORT_MAX_HEIGHT = "min(68vh, 996px)";

type BrushPreviewPoint = {
  x: number;
  y: number;
};

function clampPreviewZoom(value: number): number {
  return Math.min(
    MAX_PREVIEW_ZOOM,
    Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))),
  );
}

export function SpotColorPreview(props: {
  asset: RasterizedSpotAsset | null;
  brushSize: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  error: string | null;
  isProcessing: boolean;
  onPreviewZoomChange: (value: number) => void;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerLeave: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onViewChange: (view: SpotProofView) => void;
  previewZoom: number;
  toolMode: SpotToolMode;
  view: SpotProofView;
}) {
  const {
    asset,
    brushSize,
    canvasRef,
    error,
    isProcessing,
    onPreviewZoomChange,
    onPointerCancel,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
    onViewChange,
    previewZoom,
    toolMode,
    view,
  } = props;
  const { t } = useT(["impose", "translation"]);
  const [brushPreviewPoint, setBrushPreviewPoint] =
    useState<BrushPreviewPoint | null>(null);
  const previewWidth = asset ? asset.width * previewZoom : 0;
  const previewHeight = asset ? asset.height * previewZoom : 0;
  const brushPreviewSize = brushSize * 2 * previewZoom;

  const updateBrushPreviewPoint = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !asset) {
        setBrushPreviewPoint(null);
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        setBrushPreviewPoint(null);
        return;
      }

      setBrushPreviewPoint({ x, y });
    },
    [asset, canvasRef],
  );

  return (
    <VStack align="stretch" gap={4} minW={0}>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("impose.spotColors.errors.title", {
                defaultValue: "Spot Preview Error",
              })}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Box
        bg={{ base: "gray.50", _dark: "gray.900" }}
        borderWidth="1px"
        borderRadius="2xl"
        overflow="hidden"
        p={4}
      >
        <VStack align="stretch" gap={3} minH={0}>
          <HStack justify="space-between" align="center" wrap="wrap" gap={3}>
            <Text fontSize="sm" fontWeight="medium">
              {t("impose.spotColors.preview", {
                defaultValue: "Spot Preview",
              })}
            </Text>
            <HStack gap={2} flexShrink={0}>
              <HStack
                gap={1}
                p={1}
                borderRadius="full"
                bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                borderWidth="1px"
                boxShadow="sm"
                css={viewToggleBlurCss}
                role="group"
                aria-label={t("impose.spotColors.viewToggleLabel", {
                  defaultValue: "Preview view",
                })}
              >
                {(["composite", "plate"] as const).map((nextView) => (
                  <Button
                    key={nextView}
                    size="xs"
                    variant={view === nextView ? "solid" : "ghost"}
                    colorPalette={view === nextView ? "primary" : "gray"}
                    onClick={() => onViewChange(nextView)}
                  >
                    {t(`impose.spotColors.views.${nextView}`, {
                      defaultValue:
                        nextView === "composite" ? "Composite" : "Spot Mask",
                    })}
                  </Button>
                ))}
              </HStack>
              <HStack
                gap={1}
                p={1}
                borderRadius="full"
                bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.700" }}
                borderWidth="1px"
                boxShadow="sm"
                css={viewToggleBlurCss}
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
                disabled={!asset || previewZoom <= MIN_PREVIEW_ZOOM}
                onClick={() =>
                  onPreviewZoomChange(
                    clampPreviewZoom(previewZoom - PREVIEW_ZOOM_STEP),
                  )
                }
              >
                <MaterialSymbol>zoom_out</MaterialSymbol>
              </IconButton>
              <Badge
                colorPalette="gray"
                borderRadius="full"
                minW="4rem"
                px={2.5}
                py={1.5}
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
                disabled={!asset || previewZoom >= MAX_PREVIEW_ZOOM}
                onClick={() =>
                  onPreviewZoomChange(
                    clampPreviewZoom(previewZoom + PREVIEW_ZOOM_STEP),
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
                disabled={!asset || previewZoom === MIN_PREVIEW_ZOOM}
                onClick={() => onPreviewZoomChange(MIN_PREVIEW_ZOOM)}
              >
                <MaterialSymbol>fullscreen</MaterialSymbol>
              </IconButton>
              </HStack>
            </HStack>
          </HStack>

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
              {asset ? (
                <Box
                  position="relative"
                  width={`${previewWidth}px`}
                  height={`${previewHeight}px`}
                >
                  <Box
                    as="canvas"
                    ref={canvasRef}
                    cursor={isProcessing ? "wait" : "crosshair"}
                    display="block"
                    width={`${previewWidth}px`}
                    height={`${previewHeight}px`}
                    touchAction="none"
                    userSelect="none"
                    onPointerCancel={(event) => {
                      setBrushPreviewPoint(null);
                      onPointerCancel(event);
                    }}
                    onPointerDown={(event) => {
                      updateBrushPreviewPoint(event);
                      onPointerDown(event);
                    }}
                    onPointerLeave={(event) => {
                      setBrushPreviewPoint(null);
                      onPointerLeave(event);
                    }}
                    onPointerMove={(event) => {
                      updateBrushPreviewPoint(event);
                      onPointerMove(event);
                    }}
                    onPointerUp={onPointerUp}
                  />
                  {brushPreviewPoint && (
                    <Box
                      aria-hidden="true"
                      bg={
                        toolMode === "erase" ? "red.subtle" : "primary.subtle"
                      }
                      borderColor={
                        toolMode === "erase" ? "red.solid" : "primary.solid"
                      }
                      borderRadius="full"
                      borderWidth="1px"
                      boxSize={`${brushPreviewSize}px`}
                      left={`${brushPreviewPoint.x}px`}
                      opacity={0.55}
                      pointerEvents="none"
                      position="absolute"
                      top={`${brushPreviewPoint.y}px`}
                      transform="translate(-50%, -50%)"
                      zIndex={1}
                    />
                  )}
                </Box>
              ) : (
                <VStack minH="480px" justify="center" gap={3}>
                  <MaterialSymbol>layers</MaterialSymbol>
                  <Text color="fg.muted" textAlign="center">
                    {t("impose.spotColors.emptyPreview", {
                      defaultValue:
                        "Upload an image or PDF to author spot channels and preview separations.",
                    })}
                  </Text>
                </VStack>
              )}
            </Box>
          </Box>
        </VStack>
      </Box>
    </VStack>
  );
}
