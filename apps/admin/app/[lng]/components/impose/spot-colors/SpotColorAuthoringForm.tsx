"use client";

import { useT } from "@/i18n/client";
import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpotColorControls } from "./SpotColorControls";
import { SpotColorPreview } from "./SpotColorPreview";
import {
  applySpotLayerBrushInPlace,
  createCustomSpotLayer,
  createInitialSpotLayers,
  createSpotPreviewRevision,
  createSpotWorkspaceSnapshot,
  generateHalftoneMask,
  generateWhiteUnderbaseMask,
  loadSpotWorkspaceSnapshot,
  parseSpotWorkspaceSnapshot,
  rasterizeSpotAsset,
  renderSpotProofRegionToCanvas,
  renderSpotProofToCanvas,
  restoreSpotLayersFromSnapshot,
  saveSpotWorkspaceSnapshot,
  type HalftoneSettings,
  type RasterizedSpotAsset,
  type SpotLayer,
  type SpotMaskExportMode,
  type SpotProofView,
  type SpotSourceFile,
  type SpotToolMode,
  type SpotWorkspaceSnapshot,
  type WhiteUnderbaseSettings,
} from "./spot-color-client";
import {
  downloadBytes,
  exportSpotPdf,
  getSpotPdfExportFilename,
  type SpotExportProfileId,
} from "./spot-pdf-export";

const DEFAULT_UNDERBASE_SETTINGS: WhiteUnderbaseSettings = {
  alphaThreshold: 8,
  lumaThreshold: 0,
};

const DEFAULT_HALFTONE_SETTINGS: HalftoneSettings = {
  alphaThreshold: 8,
  cellSizePx: 18,
  dotPercent: 35,
  fullGraphic: false,
};

const MIN_PREVIEW_ZOOM = 1;

type BrushPoint = {
  layerId: string;
  point: { x: number; y: number };
  radiusPx: number;
  toolMode: SpotToolMode;
};

function canStartPainting(event: PointerEvent<HTMLElement>): boolean {
  return event.pointerType !== "mouse" || event.button === 0;
}

function canContinuePainting(event: PointerEvent<HTMLElement>): boolean {
  return event.pointerType !== "mouse" || (event.buttons & 1) === 1;
}

function createSpotSourceFiles(files: readonly File[]): SpotSourceFile[] {
  return files.map((file, index) => ({
    file,
    id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
    name: file.name,
    size: file.size,
    type: file.type,
  }));
}

function updateLayer(
  layers: readonly SpotLayer[],
  layerId: string,
  patch: Partial<SpotLayer>,
): SpotLayer[] {
  return layers.map((layer) =>
    layer.id === layerId ? { ...layer, ...patch } : layer,
  );
}

function canRestoreSpotWorkspaceSnapshot(params: {
  asset: RasterizedSpotAsset;
  snapshot: {
    asset: { height: number; sourceFingerprint: string; width: number };
  };
}): boolean {
  const { asset, snapshot } = params;

  return (
    snapshot.asset.sourceFingerprint === asset.sourceFingerprint &&
    snapshot.asset.width === asset.width &&
    snapshot.asset.height === asset.height
  );
}

export function SpotColorAuthoringForm() {
  const { t } = useT(["impose", "translation"]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerDownRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const assetRef = useRef<RasterizedSpotAsset | null>(null);
  const brushQueueRef = useRef<BrushPoint[]>([]);
  const layersRef = useRef<SpotLayer[]>([]);
  const paintedSinceCommitRef = useRef(false);
  const selectedLayerIdRef = useRef("white");
  const viewRef = useRef<SpotProofView>("composite");
  const [asset, setAsset] = useState<RasterizedSpotAsset | null>(null);
  const [layers, setLayers] = useState<SpotLayer[]>([]);
  const [sourceFiles, setSourceFiles] = useState<SpotSourceFile[]>([]);
  const [activeSourceFileId, setActiveSourceFileId] = useState<string | null>(
    null,
  );
  const [selectedLayerId, setSelectedLayerId] = useState("white");
  const [view, setView] = useState<SpotProofView>("composite");
  const [toolMode, setToolMode] = useState<SpotToolMode>("paint");
  const [exportProfileId, setExportProfileId] = useState<SpotExportProfileId>(
    "spot-1-red-spot-2-blue",
  );
  const [maskExportMode, setMaskExportMode] =
    useState<SpotMaskExportMode>("binary");
  const [previewZoom, setPreviewZoom] = useState(MIN_PREVIEW_ZOOM);
  const [brushSize, setBrushSize] = useState(24);
  const [settings, setSettings] = useState<WhiteUnderbaseSettings>(
    DEFAULT_UNDERBASE_SETTINGS,
  );
  const [halftoneSettings, setHalftoneSettings] = useState<HalftoneSettings>(
    DEFAULT_HALFTONE_SETTINGS,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
  }, [selectedLayerId]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!asset || !canvasRef.current) return;

    renderSpotProofToCanvas({
      asset,
      canvas: canvasRef.current,
      layers,
      selectedLayerId,
      view,
    });
  }, [asset, layers, selectedLayerId, view]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const revision = useMemo(
    () =>
      asset
        ? createSpotPreviewRevision({
            asset,
            halftoneSettings,
            layers,
            settings,
          })
        : null,
    [asset, halftoneSettings, layers, settings],
  );

  useEffect(() => {
    if (!asset || !revision) return;

    void (async () => {
      const snapshot = createSpotWorkspaceSnapshot({
        asset,
        halftoneSettings,
        layers,
        revision,
        settings,
      });
      try {
        await saveSpotWorkspaceSnapshot({ asset, snapshot });
      } catch (nextError) {
        console.error("Error saving spot workspace metadata:", nextError);
      }
    })();
  }, [asset, halftoneSettings, layers, revision, settings]);

  const loadSpotSourceFile = useCallback(
    async (sourceFile: SpotSourceFile) => {
      setActiveSourceFileId(sourceFile.id);

      setError(null);
      setIsProcessing(true);

      try {
        const nextAsset = await rasterizeSpotAsset(sourceFile.file);
        const pixelCount = nextAsset.width * nextAsset.height;
        const snapshot = await loadSpotWorkspaceSnapshot(nextAsset);
        let restoredLayers: SpotLayer[] | null = null;
        let restoredSnapshot: SpotWorkspaceSnapshot | null = null;
        const canRestoreSnapshot =
          snapshot &&
          canRestoreSpotWorkspaceSnapshot({
            asset: nextAsset,
            snapshot,
          });

        if (canRestoreSnapshot) {
          try {
            restoredLayers = restoreSpotLayersFromSnapshot({
              pixelCount,
              snapshot,
            });
            restoredSnapshot = snapshot;
          } catch (restoreError) {
            console.error(
              "Error restoring spot workspace metadata:",
              restoreError,
            );
          }
        }

        setAsset(nextAsset);
        setLayers(restoredLayers ?? createInitialSpotLayers(pixelCount));
        setSettings(
          restoredSnapshot
            ? restoredSnapshot.settings
            : DEFAULT_UNDERBASE_SETTINGS,
        );
        setHalftoneSettings(
          restoredSnapshot
            ? restoredSnapshot.halftoneSettings
            : DEFAULT_HALFTONE_SETTINGS,
        );
        setSelectedLayerId((restoredLayers?.[0] ?? { id: "white" }).id);
        setView("composite");
        setPreviewZoom(MIN_PREVIEW_ZOOM);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("impose.spotColors.errors.readFailed", {
                defaultValue: "Failed to read the selected artwork.",
              }),
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [t],
  );

  const handleFilesSelect = useCallback(
    async (files: File[]) => {
      const nextSourceFiles = createSpotSourceFiles(files);
      const firstSourceFile = nextSourceFiles[0];

      setSourceFiles(nextSourceFiles);

      if (!firstSourceFile) {
        setActiveSourceFileId(null);
        setAsset(null);
        setLayers([]);
        setSettings(DEFAULT_UNDERBASE_SETTINGS);
        setHalftoneSettings(DEFAULT_HALFTONE_SETTINGS);
        setSelectedLayerId("white");
        setView("composite");
        setPreviewZoom(MIN_PREVIEW_ZOOM);
        return;
      }

      await loadSpotSourceFile(firstSourceFile);
    },
    [loadSpotSourceFile],
  );

  const handleActiveSourceFileChange = useCallback(
    async (sourceFileId: string) => {
      const nextSourceFile = sourceFiles.find(
        (sourceFile) => sourceFile.id === sourceFileId,
      );

      if (!nextSourceFile) return;

      await loadSpotSourceFile(nextSourceFile);
    },
    [loadSpotSourceFile, sourceFiles],
  );

  const handleMetadataFileSelect = useCallback(
    async (file: File | undefined) => {
      if (!file || !asset) return;

      setError(null);

      try {
        const snapshot = parseSpotWorkspaceSnapshot(await file.text());
        if (!snapshot) {
          throw new Error(
            t("impose.spotColors.errors.metadataInvalid", {
              defaultValue: "The selected spot metadata file is invalid.",
            }),
          );
        }

        if (
          snapshot.asset.sourceFingerprint !== asset.sourceFingerprint ||
          snapshot.asset.width !== asset.width ||
          snapshot.asset.height !== asset.height
        ) {
          throw new Error(
            t("impose.spotColors.errors.metadataMismatch", {
              defaultValue:
                "The selected spot metadata file does not match this artwork.",
            }),
          );
        }

        const restoredLayers = restoreSpotLayersFromSnapshot({
          pixelCount: asset.width * asset.height,
          snapshot,
        });
        setLayers(restoredLayers);
        setSettings(snapshot.settings);
        setHalftoneSettings(snapshot.halftoneSettings);
        setSelectedLayerId((restoredLayers[0] ?? { id: "white" }).id);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : t("impose.spotColors.errors.metadataInvalid", {
                defaultValue: "The selected spot metadata file is invalid.",
              }),
        );
      }
    },
    [asset, t],
  );

  const handleGenerateWhite = useCallback(async () => {
    if (!asset) return;

    setError(null);
    setIsProcessing(true);

    try {
      const mask = await generateWhiteUnderbaseMask({ asset, settings });
      setLayers((currentLayers) =>
        updateLayer(currentLayers, "white", {
          mask,
          mode: "overprint",
          sourceVectorMask: asset.contentType === "application/pdf",
          visible: true,
        }),
      );
      setSelectedLayerId("white");
      setView("plate");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("impose.spotColors.errors.generateFailed", {
              defaultValue: "Failed to generate the white underbase.",
            }),
      );
    } finally {
      setIsProcessing(false);
    }
  }, [asset, settings, t]);

  const handleGenerateHalftone = useCallback(async () => {
    if (!asset) return;

    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
    const targetLayer =
      selectedLayer?.id === "halftone"
        ? layers.find((layer) => layer.id !== "halftone")
        : selectedLayer;
    if (!targetLayer) {
      setError(
        t("impose.spotColors.errors.noSelectedLayer", {
          defaultValue: "Select a spot layer before generating halftone.",
        }),
      );
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const mask = await generateHalftoneMask({
        asset,
        settings: halftoneSettings,
      });
      setLayers((currentLayers) => {
        const currentSelectedLayer = currentLayers.find(
          (layer) => layer.id === targetLayer.id,
        );
        const currentTargetLayer =
          currentSelectedLayer?.id === "halftone"
            ? currentLayers.find((layer) => layer.id !== "halftone")
            : currentSelectedLayer;

        if (!currentTargetLayer) {
          return currentLayers;
        }

        const mergedLayers = updateLayer(currentLayers, currentTargetLayer.id, {
          halftoneMask: mask,
          sourceVectorMask: false,
          visible: true,
        });

        return currentTargetLayer.id === "halftone"
          ? mergedLayers
          : mergedLayers.filter((layer) => layer.id !== "halftone");
      });
      setSelectedLayerId(targetLayer.id);
      setView("plate");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("impose.spotColors.errors.halftoneFailed", {
              defaultValue: "Failed to generate the halftone spot layer.",
            }),
      );
    } finally {
      setIsProcessing(false);
    }
  }, [asset, halftoneSettings, layers, selectedLayerId, t]);

  const handleExportPdf = useCallback(async () => {
    if (!asset) return;

    setError(null);

    try {
      const bytes = await exportSpotPdf({
        asset,
        layers,
        maskMode: maskExportMode,
        profileId: exportProfileId,
      });
      downloadBytes({
        bytes,
        filename: getSpotPdfExportFilename(asset),
        type: "application/pdf",
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("impose.spotColors.errors.exportFailed", {
              defaultValue: "Failed to export the spot color PDF.",
            }),
      );
    }
  }, [asset, exportProfileId, layers, maskExportMode, t]);

  const handleExportMetadata = useCallback(() => {
    if (!asset || !revision) return;

    const snapshot = createSpotWorkspaceSnapshot({
      asset,
      halftoneSettings,
      layers,
      revision,
      settings,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const baseFilename = asset.filename.replace(/\.[^.]+$/, "");
    downloadBytes({
      bytes,
      filename: `${baseFilename || "spot-colors"}-metadata.json`,
      type: "application/json",
    });
  }, [asset, halftoneSettings, layers, revision, settings]);

  const handleAddLayer = useCallback(
    (params: { color: string; name: string }) => {
      if (!asset) return;

      const layer = createCustomSpotLayer({
        color: params.color,
        name: params.name,
        pixelCount: asset.width * asset.height,
      });
      setLayers((currentLayers) => [...currentLayers, layer]);
      setSelectedLayerId(layer.id);
      setView("plate");
    },
    [asset],
  );

  const handleRemoveLayer = useCallback((layerId: string) => {
    setLayers((currentLayers) => {
      const nextLayers = currentLayers.filter((layer) => layer.id !== layerId);
      setSelectedLayerId((currentSelectedLayerId) =>
        currentSelectedLayerId === layerId
          ? (nextLayers[0] ?? { id: "white" }).id
          : currentSelectedLayerId,
      );
      return nextLayers;
    });
  }, []);

  const commitPaintedLayers = useCallback(() => {
    if (!paintedSinceCommitRef.current) return;

    paintedSinceCommitRef.current = false;
    setLayers((currentLayers) => currentLayers.map((layer) => ({ ...layer })));
  }, []);

  const flushBrushQueue = useCallback(() => {
    animationFrameRef.current = null;

    const currentAsset = assetRef.current;
    const canvas = canvasRef.current;
    if (!currentAsset || !canvas || brushQueueRef.current.length === 0) return;

    const points = brushQueueRef.current.splice(0);
    let didPaint = false;

    for (const brushPoint of points) {
      const layer = layersRef.current.find(
        (nextLayer) => nextLayer.id === brushPoint.layerId,
      );
      if (!layer) continue;

      const rect = applySpotLayerBrushInPlace({
        asset: currentAsset,
        layer,
        point: brushPoint.point,
        radiusPx: brushPoint.radiusPx,
        toolMode: brushPoint.toolMode,
      });

      if (!rect) continue;

      didPaint = true;
      renderSpotProofRegionToCanvas({
        asset: currentAsset,
        canvas,
        layers: layersRef.current,
        rect,
        selectedLayerId: selectedLayerIdRef.current,
        view: viewRef.current,
      });
    }

    if (didPaint) {
      paintedSinceCommitRef.current = true;
    }
  }, []);

  const scheduleBrushFlush = useCallback(() => {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = requestAnimationFrame(flushBrushQueue);
  }, [flushBrushQueue]);

  const paintAtEvent = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const currentAsset = assetRef.current;
      const currentLayer = layersRef.current.find(
        (layer) => layer.id === selectedLayerIdRef.current,
      );
      if (!currentAsset || !currentLayer) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: ((event.clientX - bounds.left) / bounds.width) * currentAsset.width,
        y: ((event.clientY - bounds.top) / bounds.height) * currentAsset.height,
      };

      brushQueueRef.current.push({
        layerId: currentLayer.id,
        point,
        radiusPx: brushSize,
        toolMode,
      });
      scheduleBrushFlush();
    },
    [brushSize, scheduleBrushFlush, toolMode],
  );

  const finishPainting = useCallback(() => {
    pointerDownRef.current = false;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      flushBrushQueue();
    }

    commitPaintedLayers();
  }, [commitPaintedLayers, flushBrushQueue]);

  return (
    <SpotColorControls
      asset={asset}
      brushSize={brushSize}
      exportProfileId={exportProfileId}
      halftoneSettings={halftoneSettings}
      isProcessing={isProcessing}
      layers={layers}
      maskExportMode={maskExportMode}
      activeSourceFileId={activeSourceFileId}
      selectedLayerId={selectedLayerId}
      sourceFiles={sourceFiles}
      settings={settings}
      onAddLayer={handleAddLayer}
      onBrushSizeChange={setBrushSize}
      onExportMetadata={handleExportMetadata}
      onActiveSourceFileChange={handleActiveSourceFileChange}
      onFilesSelect={handleFilesSelect}
      onExportPdf={handleExportPdf}
      onExportProfileChange={setExportProfileId}
      onMaskExportModeChange={setMaskExportMode}
      onGenerateHalftone={handleGenerateHalftone}
      onGenerateWhite={handleGenerateWhite}
      onHalftoneSettingsChange={(patch) =>
        setHalftoneSettings((currentSettings) => ({
          ...currentSettings,
          ...patch,
        }))
      }
      onLayerPatch={(layerId, patch) =>
        setLayers((currentLayers) => updateLayer(currentLayers, layerId, patch))
      }
      onMetadataFileSelect={handleMetadataFileSelect}
      onRemoveLayer={handleRemoveLayer}
      onSelectedLayerChange={setSelectedLayerId}
      onSettingsChange={(patch) =>
        setSettings((currentSettings) => ({ ...currentSettings, ...patch }))
      }
      preview={
        <SpotColorPreview
          asset={asset}
          brushSize={brushSize}
          canvasRef={canvasRef}
          error={error}
          isProcessing={isProcessing}
          previewZoom={previewZoom}
          toolMode={toolMode}
          view={view}
          onPreviewZoomChange={setPreviewZoom}
          onViewChange={setView}
          onPointerDown={(event) => {
            if (!canStartPainting(event)) return;

            pointerDownRef.current = true;
            canvasRef.current?.setPointerCapture(event.pointerId);
            paintAtEvent(event);
          }}
          onPointerLeave={() => {
            finishPainting();
          }}
          onPointerMove={(event) => {
            if (!pointerDownRef.current) return;
            if (!canContinuePainting(event)) {
              finishPainting();
              return;
            }

            paintAtEvent(event);
          }}
          onPointerUp={(event) => {
            finishPainting();
            canvasRef.current?.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            finishPainting();
            canvasRef.current?.releasePointerCapture(event.pointerId);
          }}
        />
      }
      revision={revision}
      toolMode={toolMode}
      onToolModeChange={setToolMode}
    />
  );
}
