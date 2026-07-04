"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  HStack,
  Separator,
  Slider,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, Switch } from "@konfi/components";
import { useEffect, useState } from "react";
import type {
  HalftoneSettings,
  RasterizedSpotAsset,
  SpotLayer,
  WhiteUnderbaseSettings,
} from "./spot-color-client";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function SectionSlider(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const { label, max, min, onChange, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitValue = (nextValue: number) => {
    setDraftValue(nextValue);
    onChange(nextValue);
  };

  return (
    <Slider.Root
      max={max}
      min={min}
      value={[draftValue]}
      onValueChange={({ value: nextValue }) =>
        setDraftValue(nextValue[0] ?? draftValue)
      }
      onValueChangeEnd={({ value: nextValue }) =>
        commitValue(nextValue[0] ?? draftValue)
      }
    >
      <HStack justify="space-between" mb={1}>
        <Slider.Label fontSize="xs">{label}</Slider.Label>
        <Slider.ValueText fontSize="xs" fontVariantNumeric="tabular-nums" />
      </HStack>
      <Slider.Control>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumbs />
      </Slider.Control>
    </Slider.Root>
  );
}

// ---------------------------------------------------------------------------
// Source section content
// ---------------------------------------------------------------------------

export function SpotSourceSectionContent(props: {
  asset: RasterizedSpotAsset | null;
  isProcessing: boolean;
  onGenerateWhite: () => void;
  onSettingsChange: (patch: Partial<WhiteUnderbaseSettings>) => void;
  selectedLayerId: string;
  layers: readonly SpotLayer[];
  settings: WhiteUnderbaseSettings;
}) {
  const {
    asset,
    isProcessing,
    onGenerateWhite,
    onSettingsChange,
    selectedLayerId,
    layers,
    settings,
  } = props;
  const { t } = useT(["impose", "translation"]);
  const hasSelectedLayer = layers.some((layer) => layer.id === selectedLayerId);

  return (
    <VStack align="stretch" gap={4}>
      <VStack align="stretch" gap={3}>
        <Text fontSize="sm" fontWeight="medium">
          {t("impose.spotColors.whiteControls", {
            defaultValue: "White Options",
          })}
        </Text>
        <SectionSlider
          label={t("impose.spotColors.alphaThreshold", {
            defaultValue: "Alpha Threshold",
          })}
          max={255}
          min={0}
          value={settings.alphaThreshold}
          onChange={(alphaThreshold) => onSettingsChange({ alphaThreshold })}
        />
        <SectionSlider
          label={t("impose.spotColors.lumaThreshold", {
            defaultValue: "Luma Threshold",
          })}
          max={255}
          min={0}
          value={settings.lumaThreshold}
          onChange={(lumaThreshold) => onSettingsChange({ lumaThreshold })}
        />
      </VStack>
      <Separator />
      <Button
        colorPalette="primary"
        disabled={!asset || !hasSelectedLayer || isProcessing}
        size="sm"
        w="full"
        onClick={onGenerateWhite}
      >
        <MaterialSymbol>auto_awesome</MaterialSymbol>
        {t("impose.spotColors.generateWhite", {
          defaultValue: "Generate White Underbase",
        })}
      </Button>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Underbase section content
// ---------------------------------------------------------------------------

export function SpotUnderbaseSectionContent(props: {
  asset: RasterizedSpotAsset | null;
  halftoneSettings: HalftoneSettings;
  isProcessing: boolean;
  onGenerateHalftone: () => void;
  onHalftoneSettingsChange: (patch: Partial<HalftoneSettings>) => void;
}) {
  const {
    asset,
    halftoneSettings,
    isProcessing,
    onGenerateHalftone,
    onHalftoneSettingsChange,
  } = props;
  const { t } = useT(["impose", "translation"]);

  return (
    <VStack align="stretch" gap={4}>
      <VStack align="stretch" gap={3}>
        <Text fontSize="sm" fontWeight="medium">
          {t("impose.spotColors.halftoneControls", {
            defaultValue: "Halftone Options",
          })}
        </Text>
        <SectionSlider
          label={t("impose.spotColors.halftoneAlphaThreshold", {
            defaultValue: "Halftone Alpha",
          })}
          max={255}
          min={0}
          value={halftoneSettings.alphaThreshold}
          onChange={(alphaThreshold) =>
            onHalftoneSettingsChange({ alphaThreshold })
          }
        />
        <SectionSlider
          label={t("impose.spotColors.halftoneCellSize", {
            defaultValue: "Halftone Cell",
          })}
          max={96}
          min={2}
          value={halftoneSettings.cellSizePx}
          onChange={(cellSizePx) => onHalftoneSettingsChange({ cellSizePx })}
        />
        <SectionSlider
          label={t("impose.spotColors.halftoneDotPercent", {
            defaultValue: "Dot Coverage",
          })}
          max={100}
          min={1}
          value={halftoneSettings.dotPercent}
          onChange={(dotPercent) => onHalftoneSettingsChange({ dotPercent })}
        />
        <Switch
          size="sm"
          colorPalette="primary"
          checked={halftoneSettings.fullGraphic}
          onCheckedChange={({ checked }) =>
            onHalftoneSettingsChange({ fullGraphic: checked })
          }
        >
          {t("impose.spotColors.halftoneFullGraphic", {
            defaultValue: "Full Graphic",
          })}
        </Switch>
      </VStack>
      <Separator />
      <Button
        colorPalette="primary"
        disabled={!asset || isProcessing}
        size="sm"
        w="full"
        onClick={onGenerateHalftone}
      >
        <MaterialSymbol>grain</MaterialSymbol>
        {t("impose.spotColors.generateHalftone", {
          defaultValue: "Generate Halftone",
        })}
      </Button>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Layers section content
// ---------------------------------------------------------------------------

export function SpotLayersSectionContent(props: {
  layers: readonly SpotLayer[];
  onSelectedLayerChange: (layerId: string) => void;
  selectedLayerId: string;
}) {
  const { layers, onSelectedLayerChange, selectedLayerId } = props;
  const { t } = useT(["impose", "translation"]);

  return (
    <VStack align="stretch" gap={2}>
      {layers.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          {t("impose.spotColors.noLayers", {
            defaultValue: "Upload artwork to initialize spot layers.",
          })}
        </Text>
      ) : (
        layers.map((layer) => (
          <Button
            key={layer.id}
            justifyContent="flex-start"
            size="sm"
            variant={selectedLayerId === layer.id ? "solid" : "outline"}
            w="full"
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
        ))
      )}
    </VStack>
  );
}
