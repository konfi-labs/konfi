"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Field,
  FileUpload,
  HStack,
  Input,
  Popover,
  Portal,
  Separator,
  Slider,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  type SelectOption,
} from "@konfi/types";
import { useEffect, useMemo, useState } from "react";
import { NumberField, SelectField } from "../workspace/controls";
import type { SpotColorPanel } from "./SpotColorControls";
import type {
  HalftoneSettings,
  RasterizedSpotAsset,
  SpotLayer,
  SpotMaskExportMode,
  SpotName,
  SpotPreviewRevision,
  SpotSourceFile,
  SpotToolMode,
} from "./spot-color-client";
import {
  MIN_SPOT_CHOKE_BLEED_MM,
  normalizeSpotChokeBleedMm,
} from "./spot-mask-adjustment";
import {
  getExportableSpotLayers,
  getSpotExportColor,
  SPOT_EXPORT_NAMES,
  SPOT_EXPORT_PROFILES,
  type SpotExportProfileId,
} from "./spot-pdf-export";

function BrushOptionsPopover(props: {
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  onToolModeChange: (mode: SpotToolMode) => void;
  toolMode: SpotToolMode;
}) {
  const { brushSize, onBrushSizeChange, onToolModeChange, toolMode } = props;
  const { t } = useT(["impose", "translation"]);
  const [draftBrushSize, setDraftBrushSize] = useState(brushSize);

  useEffect(() => {
    setDraftBrushSize(brushSize);
  }, [brushSize]);

  const commitBrushSize = (nextValue: number) => {
    setDraftBrushSize(nextValue);
    onBrushSizeChange(nextValue);
  };

  return (
    <Popover.Root positioning={{ placement: "bottom-end", gutter: 8 }}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="outline">
          <MaterialSymbol>draw</MaterialSymbol>
          {t("impose.spotColors.brushOptions", {
            defaultValue: "Brush Options",
          })}
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content maxW="18rem" w="18rem">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              {t("impose.spotColors.brushOptions", {
                defaultValue: "Brush Options",
              })}
            </Popover.Header>
            <Popover.Body>
              <HStack gap={2} mb={4}>
                {(["paint", "erase"] as const).map((mode) => (
                  <Button
                    key={mode}
                    flex="1"
                    size="sm"
                    variant={toolMode === mode ? "solid" : "outline"}
                    onClick={() => onToolModeChange(mode)}
                  >
                    <MaterialSymbol>
                      {mode === "paint" ? "draw" : "backspace"}
                    </MaterialSymbol>
                    {t(`impose.spotColors.tools.${mode}`, {
                      defaultValue: mode === "paint" ? "Paint" : "Erase",
                    })}
                  </Button>
                ))}
              </HStack>
              <Slider.Root
                max={96}
                min={2}
                value={[draftBrushSize]}
                onValueChange={({ value }) =>
                  setDraftBrushSize(value[0] ?? draftBrushSize)
                }
                onValueChangeEnd={({ value }) =>
                  commitBrushSize(value[0] ?? draftBrushSize)
                }
              >
                <HStack justify="space-between" mb={2}>
                  <Slider.Label fontSize="sm">
                    {t("impose.spotColors.brushSize", {
                      defaultValue: "Brush Size",
                    })}
                  </Slider.Label>
                  <Slider.ValueText
                    color="fg.muted"
                    fontSize="sm"
                    fontVariantNumeric="tabular-nums"
                  />
                </HStack>
                <Slider.Control>
                  <Slider.Track>
                    <Slider.Range />
                  </Slider.Track>
                  <Slider.Thumbs />
                </Slider.Control>
              </Slider.Root>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

export function SpotColorSidePanel(props: {
  activeSourceFileId: string | null;
  activePanel: SpotColorPanel;
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
  onFilesSelect: (files: File[]) => void | Promise<void>;
  onLayerPatch: (layerId: string, patch: Partial<SpotLayer>) => void;
  onExportProfileChange: (profileId: SpotExportProfileId) => void;
  onMaskExportModeChange: (mode: SpotMaskExportMode) => void;
  onMetadataFileSelect: (file: File | undefined) => void;
  onRemoveLayer: (layerId: string) => void;
  onSelectedLayerChange: (layerId: string) => void;
  onToolModeChange: (mode: SpotToolMode) => void;
  revision: SpotPreviewRevision | null;
  selectedLayerId: string;
  sourceFiles: readonly SpotSourceFile[];
  toolMode: SpotToolMode;
}) {
  const {
    activeSourceFileId,
    activePanel,
    asset,
    brushSize,
    exportProfileId,
    halftoneSettings,
    isProcessing,
    layers,
    maskExportMode,
    onAddLayer,
    onActiveSourceFileChange,
    onBrushSizeChange,
    onExportMetadata,
    onExportPdf,
    onFilesSelect,
    onLayerPatch,
    onExportProfileChange,
    onMaskExportModeChange,
    onMetadataFileSelect,
    onRemoveLayer,
    onSelectedLayerChange,
    onToolModeChange,
    revision,
    selectedLayerId,
    sourceFiles,
    toolMode,
  } = props;
  const { t } = useT(["impose", "translation"]);
  const [customLayerColor, setCustomLayerColor] = useState("#00a3ff");
  const [customLayerName, setCustomLayerName] = useState("");
  const exportableLayers = getExportableSpotLayers(layers);
  const sourceFileOptions = useMemo<SelectOption[]>(
    () =>
      sourceFiles.map((sourceFile, index) => ({
        label: `${index + 1}. ${sourceFile.name}`,
        value: sourceFile.id,
      })),
    [sourceFiles],
  );

  const toggleLayerSpotName = (layer: SpotLayer, spotName: SpotName) => {
    const nextSpotNames = layer.spotNames.includes(spotName)
      ? layer.spotNames.filter((nextSpotName) => nextSpotName !== spotName)
      : [...layer.spotNames, spotName].toSorted(
          (left, right) =>
            SPOT_EXPORT_NAMES.indexOf(left) - SPOT_EXPORT_NAMES.indexOf(right),
        );

    onLayerPatch(layer.id, { spotNames: nextSpotNames });
  };

  const getProfileLabel = (profileId: SpotExportProfileId): string => {
    switch (profileId) {
      case "black-spots":
        return t("impose.spotColors.exportProfiles.blackSpots", {
          defaultValue: "All Spots Black",
        });
      case "varnish-spot-3-4-black":
        return t("impose.spotColors.exportProfiles.varnishBlack", {
          defaultValue: "Varnish Spot 3/4 Black",
        });
      case "spot-1-red-spot-2-blue":
        return t("impose.spotColors.exportProfiles.redBlue", {
          defaultValue: "Spot 1 Red, Spot 2 Blue",
        });
    }
  };

  const getMaskExportModeLabel = (mode: SpotMaskExportMode): string => {
    switch (mode) {
      case "binary":
        return t("impose.spotColors.exportMaskModes.binary", {
          defaultValue: "Binary",
        });
      case "tint":
        return t("impose.spotColors.exportMaskModes.tint", {
          defaultValue: "Preserve Alpha",
        });
    }
  };

  return (
    <Box
      bg={{ base: "white", _dark: "gray.950" }}
      borderRadius="3xl"
      borderWidth="1px"
      h="full"
      maxH={{ base: "40rem", xl: "72vh" }}
      overflow="hidden"
      p={4}
    >
      <VStack align="stretch" gap={4} h="full" minH={0}>
        <HStack justify="space-between">
          <Text fontSize="lg" fontWeight="semibold">
            {activePanel === "source" &&
              t("impose.spotColors.source", {
                defaultValue: "Artwork Source",
              })}
            {activePanel === "underbase" &&
              t("impose.spotColors.underbaseSettings", {
                defaultValue: "Underbase Settings",
              })}
            {activePanel === "layers" &&
              t("impose.spotColors.layers", { defaultValue: "Spot Layers" })}
          </Text>
          <HStack gap={2} justify="flex-end">
            <BrushOptionsPopover
              brushSize={brushSize}
              onBrushSizeChange={onBrushSizeChange}
              onToolModeChange={onToolModeChange}
              toolMode={toolMode}
            />
            {revision && (
              <Badge colorPalette="success">
                {t("impose.spotColors.revisionReady", {
                  defaultValue: "Preview Metadata Ready",
                })}
              </Badge>
            )}
          </HStack>
        </HStack>

        {asset ? (
          <Text color="fg.muted" fontSize="sm">
            {t("impose.spotColors.sourceSummary", {
              defaultValue:
                "{{filename}} · {{width}} × {{height}} px · {{type}}",
              filename: asset.filename,
              height: asset.height,
              type: asset.contentType,
              width: asset.width,
            })}
          </Text>
        ) : (
          <Text color="fg.muted" fontSize="sm">
            {t("impose.spotColors.noSource", {
              defaultValue: "No artwork selected.",
            })}
          </Text>
        )}

        <Separator />

        <VStack
          align="stretch"
          flex="1"
          gap={4}
          minH={0}
          overflowY="auto"
          pe={1}
        >
          {activePanel === "source" && (
            <>
              <VStack align="stretch" gap={3}>
                <Text fontSize="sm" fontWeight="medium">
                  {t("impose.spotColors.sourceFiles", {
                    defaultValue: "Artwork Files",
                  })}
                </Text>
                <FileUpload.Root
                  acceptedFiles={sourceFiles.map(
                    (sourceFile) => sourceFile.file,
                  )}
                  accept={["image/*", "application/pdf"]}
                  maxFiles={IMPOSITION_MAX_FILES}
                  maxFileSize={IMPOSITION_MAX_FILE_SIZE_MB * 1024 * 1024}
                  onFileChange={(details) =>
                    void onFilesSelect(details.acceptedFiles)
                  }
                >
                  <FileUpload.HiddenInput name="spot-color-source" />
                  <FileUpload.Dropzone
                    borderColor={{ base: "gray.300", _dark: "gray.700" }}
                    borderRadius="2xl"
                    borderStyle="dashed"
                    bg={{ base: "gray.50", _dark: "gray.900" }}
                    minH="8rem"
                  >
                    <MaterialSymbol>upload</MaterialSymbol>
                    <FileUpload.DropzoneContent>
                      <Text fontWeight="medium">
                        {t("impose.spotColors.dropzoneTitle", {
                          defaultValue:
                            "Drop spot artwork files here or click to browse",
                        })}
                      </Text>
                      <Text color="fg.muted">
                        {t("forms.impose.helperTexts.fileUploadLimits", {
                          defaultValue:
                            "Up to {{maxFiles}} files, {{maxFileSize}} MB each, {{maxTotalSize}} MB total per batch.",
                          maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
                          maxFiles: IMPOSITION_MAX_FILES,
                          maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
                        })}
                      </Text>
                    </FileUpload.DropzoneContent>
                  </FileUpload.Dropzone>
                  <Box maxH="8rem" overflowY="auto">
                    <FileUpload.List showSize clearable />
                  </Box>
                </FileUpload.Root>

                <SelectField
                  disabled={sourceFileOptions.length === 0}
                  label={t("impose.spotColors.activeArtwork", {
                    defaultValue: "Active Artwork",
                  })}
                  options={sourceFileOptions}
                  placeholder={t("impose.spotColors.chooseArtwork", {
                    defaultValue: "Choose Artwork",
                  })}
                  value={activeSourceFileId}
                  width="100%"
                  onChange={(sourceFileId) => {
                    if (!sourceFileId) return;

                    void onActiveSourceFileChange(sourceFileId);
                  }}
                />

                <FileUpload.Root
                  accept={["application/json"]}
                  disabled={!asset}
                  maxFiles={1}
                  onFileChange={(details) =>
                    onMetadataFileSelect(details.acceptedFiles[0])
                  }
                >
                  <FileUpload.HiddenInput name="spot-color-metadata" />
                  <FileUpload.Trigger asChild>
                    <Button disabled={!asset} size="sm" variant="outline">
                      <MaterialSymbol>upload</MaterialSymbol>
                      {t("impose.spotColors.loadMetadata", {
                        defaultValue: "Load Metadata",
                      })}
                    </Button>
                  </FileUpload.Trigger>
                </FileUpload.Root>
              </VStack>

              <Separator />
            </>
          )}

          <VStack align="stretch" gap={3}>
            <Text fontSize="sm" fontWeight="medium">
              {t("impose.spotColors.exportProfile", {
                defaultValue: "PDF Export Profile",
              })}
            </Text>
            <HStack gap={2} wrap="wrap">
              {SPOT_EXPORT_PROFILES.map((profile) => (
                <Button
                  key={profile.id}
                  size="xs"
                  variant={exportProfileId === profile.id ? "solid" : "outline"}
                  onClick={() => onExportProfileChange(profile.id)}
                >
                  {getProfileLabel(profile.id)}
                </Button>
              ))}
            </HStack>

            <Text fontSize="sm" fontWeight="medium">
              {t("impose.spotColors.exportMaskMode", {
                defaultValue: "Spot Mask Export",
              })}
            </Text>
            <HStack gap={2} wrap="wrap">
              {(["binary", "tint"] as const).map((mode) => (
                <Button
                  key={mode}
                  aria-pressed={maskExportMode === mode}
                  size="xs"
                  variant={maskExportMode === mode ? "solid" : "outline"}
                  onClick={() => onMaskExportModeChange(mode)}
                >
                  {getMaskExportModeLabel(mode)}
                </Button>
              ))}
            </HStack>

            {exportableLayers.length > 0 && (
              <VStack align="stretch" gap={1.5}>
                {exportableLayers.map((layer) => (
                  <HStack key={layer.id} justify="space-between" gap={3}>
                    <Text color="fg.muted" fontSize="sm">
                      {layer.name}
                    </Text>
                    <HStack gap={1.5} wrap="wrap" justify="flex-end">
                      {layer.spotNames.map((spotName) => (
                        <HStack key={spotName} gap={1}>
                          <Box
                            aria-hidden="true"
                            bg={getSpotExportColor({
                              profileId: exportProfileId,
                              spotName,
                            })}
                            borderColor="border"
                            borderRadius="full"
                            borderWidth="1px"
                            boxSize="3"
                          />
                          <Badge>{spotName}</Badge>
                        </HStack>
                      ))}
                    </HStack>
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>

          <Separator />

          <VStack align="stretch" gap={3}>
            {activePanel === "layers" && (
              <Box borderWidth="1px" borderRadius="xl" p={3}>
                <VStack align="stretch" gap={3}>
                  <Text fontSize="sm" fontWeight="medium">
                    {t("impose.spotColors.customLayer", {
                      defaultValue: "Custom Spot Layer",
                    })}
                  </Text>
                  <HStack gap={2} align="end">
                    <Field.Root flex="1">
                      <Field.Label>
                        {t("impose.spotColors.layerName", {
                          defaultValue: "Layer Name",
                        })}
                      </Field.Label>
                      <Input
                        name="spot-layer-name"
                        size="sm"
                        value={customLayerName}
                        placeholder={t(
                          "impose.spotColors.layerNamePlaceholder",
                          {
                            defaultValue: "e.g. FOIL",
                          },
                        )}
                        onChange={(event) =>
                          setCustomLayerName(event.target.value)
                        }
                      />
                    </Field.Root>
                    <Field.Root width="5rem">
                      <Field.Label>
                        {t("impose.spotColors.layerColor", {
                          defaultValue: "Color",
                        })}
                      </Field.Label>
                      <Input
                        aria-label={t("impose.spotColors.layerColor", {
                          defaultValue: "Color",
                        })}
                        name="spot-layer-color"
                        p={1}
                        size="sm"
                        type="color"
                        value={customLayerColor}
                        onChange={(event) =>
                          setCustomLayerColor(event.target.value)
                        }
                      />
                    </Field.Root>
                    <Button
                      colorPalette="primary"
                      disabled={!asset}
                      size="sm"
                      onClick={() => {
                        onAddLayer({
                          color: customLayerColor,
                          name: customLayerName,
                        });
                        setCustomLayerName("");
                      }}
                    >
                      <MaterialSymbol>add</MaterialSymbol>
                      {t("impose.spotColors.addLayer", {
                        defaultValue: "Add Layer",
                      })}
                    </Button>
                  </HStack>
                </VStack>
              </Box>
            )}

            {layers.length === 0 ? (
              <Text color="fg.muted" fontSize="sm">
                {t("impose.spotColors.noLayers", {
                  defaultValue: "Upload artwork to initialize spot layers.",
                })}
              </Text>
            ) : (
              layers.map((layer) => (
                <Box key={layer.id} borderWidth="1px" borderRadius="xl" p={3}>
                  <VStack align="stretch" gap={3}>
                    <HStack justify="space-between" gap={3}>
                      <Button
                        flex="1"
                        justifyContent="flex-start"
                        size="sm"
                        variant={
                          selectedLayerId === layer.id ? "solid" : "outline"
                        }
                        onClick={() => onSelectedLayerChange(layer.id)}
                      >
                        <Box
                          aria-hidden="true"
                          bg={layer.color}
                          borderColor="border"
                          borderWidth="1px"
                          boxSize="4"
                          borderRadius="full"
                        />
                        {layer.name}
                      </Button>
                      <Switch.Root
                        checked={layer.visible}
                        size="sm"
                        onCheckedChange={({ checked }) =>
                          onLayerPatch(layer.id, { visible: checked })
                        }
                      >
                        <Switch.HiddenInput />
                        <Switch.Control />
                        <Switch.Label>
                          {t("impose.spotColors.visible", {
                            defaultValue: "Visible",
                          })}
                        </Switch.Label>
                      </Switch.Root>
                      {(layer.id.startsWith("custom-") ||
                        layer.id === "halftone") && (
                        <Button
                          colorPalette="red"
                          size="xs"
                          variant="ghost"
                          onClick={() => onRemoveLayer(layer.id)}
                        >
                          <MaterialSymbol>delete</MaterialSymbol>
                          {t("impose.spotColors.removeLayer", {
                            defaultValue: "Remove Layer",
                          })}
                        </Button>
                      )}
                    </HStack>
                    <HStack gap={2}>
                      {(["knockout", "overprint"] as const).map((mode) => (
                        <Button
                          key={mode}
                          size="xs"
                          variant={layer.mode === mode ? "solid" : "outline"}
                          onClick={() => onLayerPatch(layer.id, { mode })}
                        >
                          {t(`impose.spotColors.modes.${mode}`, {
                            defaultValue:
                              mode === "knockout" ? "Knockout" : "Overprint",
                          })}
                        </Button>
                      ))}
                    </HStack>
                    <NumberField
                      helperText={t("impose.spotColors.chokeBleedHint", {
                        defaultValue:
                          "Negative values choke; positive values bleed the exported spot mask.",
                      })}
                      label={t("impose.spotColors.chokeBleedMm", {
                        defaultValue: "Choke / Bleed (mm)",
                      })}
                      min={MIN_SPOT_CHOKE_BLEED_MM}
                      name="spot-layer-choke-bleed"
                      step={0.1}
                      value={normalizeSpotChokeBleedMm(layer.chokeBleedMm)}
                      width="10rem"
                      onChange={(value) =>
                        onLayerPatch(layer.id, {
                          chokeBleedMm: normalizeSpotChokeBleedMm(value ?? 0),
                        })
                      }
                    />
                    <VStack align="stretch" gap={1.5}>
                      <Text color="fg.muted" fontSize="xs" fontWeight="medium">
                        {t("impose.spotColors.spotChannels", {
                          defaultValue: "PDF Spot Channels",
                        })}
                      </Text>
                      <HStack gap={1.5} wrap="wrap">
                        {SPOT_EXPORT_NAMES.map((spotName) => (
                          <Button
                            key={spotName}
                            size="xs"
                            variant={
                              layer.spotNames.includes(spotName)
                                ? "solid"
                                : "outline"
                            }
                            onClick={() => toggleLayerSpotName(layer, spotName)}
                          >
                            <Box
                              aria-hidden="true"
                              bg={getSpotExportColor({
                                profileId: exportProfileId,
                                spotName,
                              })}
                              borderColor="border"
                              borderRadius="full"
                              borderWidth="1px"
                              boxSize="2.5"
                            />
                            {spotName}
                          </Button>
                        ))}
                      </HStack>
                      {layer.spotNames.length === 0 && (
                        <Text color="fg.muted" fontSize="xs">
                          {t("impose.spotColors.noSpotChannels", {
                            defaultValue:
                              "Select at least one spot channel to include this layer in the exported PDF.",
                          })}
                        </Text>
                      )}
                    </VStack>
                  </VStack>
                </Box>
              ))
            )}
          </VStack>

          {revision && (
            <>
              <Separator />
              <Text color="fg.muted" fontSize="sm">
                {t("impose.spotColors.revisionSummary", {
                  defaultValue:
                    "{{count}} spot layer(s), {{width}} × {{height}} px proof",
                  count: revision.layers.length,
                  height: revision.height,
                  width: revision.width,
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {t("impose.spotColors.halftoneSummary", {
                  defaultValue:
                    "Halftone: {{cell}} px cell, {{coverage}}% dot coverage",
                  cell: halftoneSettings.cellSizePx,
                  coverage: halftoneSettings.dotPercent,
                })}
              </Text>
            </>
          )}
        </VStack>

        <Separator />

        <VStack align="stretch" gap={2} pt={1}>
          <Button
            colorPalette="primary"
            disabled={
              !asset || !getExportableSpotLayers(layers).length || isProcessing
            }
            size="sm"
            w="full"
            onClick={onExportPdf}
          >
            <MaterialSymbol>download</MaterialSymbol>
            {t("impose.spotColors.exportPdf", {
              defaultValue: "Export PDF",
            })}
          </Button>
          <Button
            disabled={!asset || isProcessing}
            size="sm"
            variant="outline"
            w="full"
            onClick={onExportMetadata}
          >
            <MaterialSymbol>data_object</MaterialSymbol>
            {t("impose.spotColors.exportMetadata", {
              defaultValue: "Export Metadata",
            })}
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
}
