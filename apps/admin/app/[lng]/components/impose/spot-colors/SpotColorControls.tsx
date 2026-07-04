"use client";

import { useT } from "@/i18n/client";
import { Box, Grid } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { ImposeFloatingSectionItem } from "../workspace/ImposeFloatingSections";
import { ImposeFloatingSections } from "../workspace/ImposeFloatingSections";
import { SpotColorSidePanel } from "./SpotColorSidePanel";
import {
  SpotLayersSectionContent,
  SpotSourceSectionContent,
  SpotUnderbaseSectionContent,
} from "./SpotColorSections";
import type {
  HalftoneSettings,
  RasterizedSpotAsset,
  SpotLayer,
  SpotMaskExportMode,
  SpotPreviewRevision,
  SpotSourceFile,
  SpotToolMode,
  WhiteUnderbaseSettings,
} from "./spot-color-client";
import type { SpotExportProfileId } from "./spot-pdf-export";

export type SpotColorPanel = "layers" | "source" | "underbase";

export function SpotColorControls(props: {
  activeSourceFileId: string | null;
  asset: RasterizedSpotAsset | null;
  brushSize: number;
  exportProfileId: SpotExportProfileId;
  halftoneSettings: HalftoneSettings;
  isProcessing: boolean;
  layers: readonly SpotLayer[];
  maskExportMode: SpotMaskExportMode;
  onAddLayer: (params: { color: string; name: string }) => void;
  onActiveSourceFileChange: (sourceFileId: string) => void | Promise<void>;
  onBrushSizeChange: (value: number) => void;
  onExportMetadata: () => void;
  onExportPdf: () => void;
  onExportProfileChange: (profileId: SpotExportProfileId) => void;
  onMaskExportModeChange: (mode: SpotMaskExportMode) => void;
  onFilesSelect: (files: File[]) => void | Promise<void>;
  onGenerateHalftone: () => void;
  onGenerateWhite: () => void;
  onHalftoneSettingsChange: (patch: Partial<HalftoneSettings>) => void;
  onLayerPatch: (layerId: string, patch: Partial<SpotLayer>) => void;
  onMetadataFileSelect: (file: File | undefined) => void;
  onRemoveLayer: (layerId: string) => void;
  onSelectedLayerChange: (layerId: string) => void;
  onSettingsChange: (patch: Partial<WhiteUnderbaseSettings>) => void;
  onToolModeChange: (mode: SpotToolMode) => void;
  preview: ReactNode;
  revision: SpotPreviewRevision | null;
  selectedLayerId: string;
  sourceFiles: readonly SpotSourceFile[];
  settings: WhiteUnderbaseSettings;
  toolMode: SpotToolMode;
}) {
  const { t } = useT(["impose", "translation"]);

  const [openSection, setOpenSection] = useState<string | null>("source");
  // Keep the last explicitly opened panel so SpotColorSidePanel always has a
  // valid activePanel value even when all sections are collapsed. Plain state
  // (not a ref) so the value is stable across renders without anti-patterns.
  const [activePanel, setActivePanel] = useState<SpotColorPanel>("source");

  function handleOpenChange(key: string | null) {
    setOpenSection(key);
    if (key === "source" || key === "underbase" || key === "layers") {
      setActivePanel(key);
    }
  }

  const sections: ImposeFloatingSectionItem[] = useMemo(
    () => [
      {
        key: "source",
        icon: "upload_file",
        label: t("impose.spotColors.panels.source", {
          defaultValue: "Source",
        }),
        content: (
          <SpotSourceSectionContent
            asset={props.asset}
            isProcessing={props.isProcessing}
            layers={props.layers}
            onGenerateWhite={props.onGenerateWhite}
            onSettingsChange={props.onSettingsChange}
            selectedLayerId={props.selectedLayerId}
            settings={props.settings}
          />
        ),
      },
      {
        key: "underbase",
        icon: "auto_awesome",
        label: t("impose.spotColors.panels.underbase", {
          defaultValue: "Underbase",
        }),
        content: (
          <SpotUnderbaseSectionContent
            asset={props.asset}
            halftoneSettings={props.halftoneSettings}
            isProcessing={props.isProcessing}
            onGenerateHalftone={props.onGenerateHalftone}
            onHalftoneSettingsChange={props.onHalftoneSettingsChange}
          />
        ),
      },
      {
        key: "layers",
        icon: "layers",
        label: t("impose.spotColors.panels.layers", {
          defaultValue: "Layers",
        }),
        content: (
          <SpotLayersSectionContent
            layers={props.layers}
            onSelectedLayerChange={props.onSelectedLayerChange}
            selectedLayerId={props.selectedLayerId}
          />
        ),
      },
    ],
    [
      t,
      props.asset,
      props.halftoneSettings,
      props.isProcessing,
      props.layers,
      props.onGenerateHalftone,
      props.onGenerateWhite,
      props.onHalftoneSettingsChange,
      props.onSelectedLayerChange,
      props.onSettingsChange,
      props.selectedLayerId,
      props.settings,
    ],
  );

  return (
    <Box
      borderWidth="1px"
      borderRadius="3xl"
      bg={{ base: "white", _dark: "gray.950" }}
      p={4}
    >
      <Grid
        templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 24rem" }}
        gap={4}
        minH={{ base: "auto", lg: "72vh" }}
      >
        <Box position="relative" minW={0}>
          <ImposeFloatingSections
            sections={sections}
            openKey={openSection}
            onOpenChange={handleOpenChange}
            label={t("impose.spotColors.controlsLabel", {
              defaultValue: "Spot color controls",
            })}
          />
          {props.preview}
        </Box>
        <SpotColorSidePanel
          activePanel={activePanel}
          activeSourceFileId={props.activeSourceFileId}
          asset={props.asset}
          brushSize={props.brushSize}
          exportProfileId={props.exportProfileId}
          halftoneSettings={props.halftoneSettings}
          isProcessing={props.isProcessing}
          layers={props.layers}
          maskExportMode={props.maskExportMode}
          onAddLayer={props.onAddLayer}
          onActiveSourceFileChange={props.onActiveSourceFileChange}
          onBrushSizeChange={props.onBrushSizeChange}
          onExportMetadata={props.onExportMetadata}
          onExportPdf={props.onExportPdf}
          onFilesSelect={props.onFilesSelect}
          onLayerPatch={props.onLayerPatch}
          onExportProfileChange={props.onExportProfileChange}
          onMaskExportModeChange={props.onMaskExportModeChange}
          onMetadataFileSelect={props.onMetadataFileSelect}
          onRemoveLayer={props.onRemoveLayer}
          onSelectedLayerChange={props.onSelectedLayerChange}
          onToolModeChange={props.onToolModeChange}
          revision={props.revision}
          selectedLayerId={props.selectedLayerId}
          sourceFiles={props.sourceFiles}
          toolMode={props.toolMode}
        />
      </Grid>
    </Box>
  );
}
