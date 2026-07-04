"use client";

import { useT } from "@/i18n/client";
import {
  STICKER_MEDIA_WIDTH_PRESETS_MM,
  createPackingModeSettingsPatch,
  stickerPackingMode,
  type StickerImpositionSettings,
} from "@/lib/sticker-imposition/types";
import { HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { Switch } from "@konfi/components";
import type { SelectOption } from "@konfi/types";
import { useMemo } from "react";
import { NumberField, SelectField } from "../workspace/controls";
import type { ImposeFloatingSectionItem } from "../workspace/ImposeFloatingSections";
import { useStickerMediaWidthSelector } from "./useStickerMediaWidthSelector";

function toMillimeterOption(value: number): SelectOption {
  return {
    label: `${value / 1000} m`,
    value: String(value),
  };
}

// ── Section 1: Media & Layout ──────────────────────────────────────────────

type MediaLayoutSectionProps = {
  onChange: (patch: Partial<StickerImpositionSettings>) => void;
  settings: StickerImpositionSettings;
};

function MediaLayoutSection({ onChange, settings }: MediaLayoutSectionProps) {
  const { t } = useT(["impose", "translation"]);

  const mediaOptions = useMemo<SelectOption[]>(
    () => [
      ...STICKER_MEDIA_WIDTH_PRESETS_MM.map(toMillimeterOption),
      {
        label: t("impose.stickers.customMedia", { defaultValue: "Custom" }),
        value: "custom",
      },
    ],
    [t],
  );

  const modeOptions = useMemo<SelectOption[]>(
    () => [
      {
        label: t("impose.stickers.modes.singleCutRows", {
          defaultValue: "Single-Cut Rows",
        }),
        value: stickerPackingMode.SINGLE_CUT_ROWS,
      },
      {
        label: t("impose.stickers.modes.groupedParts", {
          defaultValue: "Grouped Parts",
        }),
        value: stickerPackingMode.GROUPED_PARTS,
      },
    ],
    [t],
  );

  const { selectedMediaValue, setSelectedMediaValue } =
    useStickerMediaWidthSelector(settings.mediaWidthMm);

  const isGrouped = settings.packingMode === stickerPackingMode.GROUPED_PARTS;

  return (
    <VStack align="stretch" gap={3}>
      <SelectField
        label={t("impose.stickers.mediaWidth", {
          defaultValue: "Media Width",
        })}
        placeholder={t("common.select", { defaultValue: "Select" })}
        value={selectedMediaValue}
        options={mediaOptions}
        width="100%"
        onChange={(value) => {
          if (value === "custom") {
            setSelectedMediaValue("custom");
            return;
          }
          onChange({ mediaWidthMm: Number(value) });
        }}
      />
      {selectedMediaValue === "custom" && (
        <NumberField
          label={t("impose.stickers.customMediaWidth", {
            defaultValue: "Custom Width",
          })}
          value={settings.mediaWidthMm}
          width="100%"
          min={100}
          step={1}
          onChange={(value) => {
            if (typeof value === "number") {
              onChange({ mediaWidthMm: value });
            }
          }}
        />
      )}
      <SelectField
        label={t("impose.stickers.layoutMode", {
          defaultValue: "Layout Mode",
        })}
        placeholder={t("common.select", { defaultValue: "Select" })}
        value={settings.packingMode}
        options={modeOptions}
        width="100%"
        onChange={(value) => {
          const mode =
            value === stickerPackingMode.GROUPED_PARTS
              ? stickerPackingMode.GROUPED_PARTS
              : stickerPackingMode.SINGLE_CUT_ROWS;
          onChange(createPackingModeSettingsPatch(settings, mode));
        }}
      />
      <NumberField
        label={t("impose.stickers.minSpacing", {
          defaultValue: "Min Spacing",
        })}
        value={settings.minSpacingMm}
        width="100%"
        min={0}
        step={0.5}
        onChange={(value) => {
          if (typeof value === "number") {
            onChange({ minSpacingMm: value });
          }
        }}
      />
      {isGrouped && (
        <NumberField
          label={t("impose.stickers.groupSize", {
            defaultValue: "Part Variety",
          })}
          value={settings.groupMaxDistinctItems}
          width="100%"
          min={1}
          step={1}
          onChange={(value) => {
            if (typeof value === "number") {
              onChange({ groupMaxDistinctItems: Math.round(value) });
            }
          }}
        />
      )}
      {isGrouped && (
        <NumberField
          label={t("impose.stickers.partMargin", {
            defaultValue: "Part Margin",
          })}
          value={settings.partMarginMm}
          width="100%"
          min={0}
          step={0.5}
          onChange={(value) => {
            if (typeof value === "number") {
              onChange({ partMarginMm: value });
            }
          }}
        />
      )}
    </VStack>
  );
}

// ── Section 2: Sheet Behavior ──────────────────────────────────────────────

type SheetBehaviorSectionProps = {
  onChange: (patch: Partial<StickerImpositionSettings>) => void;
  settings: StickerImpositionSettings;
};

function SheetBehaviorSection({
  onChange,
  settings,
}: SheetBehaviorSectionProps) {
  const { t } = useT(["impose", "translation"]);
  const isGrouped = settings.packingMode === stickerPackingMode.GROUPED_PARTS;

  return (
    <VStack align="stretch" gap={3}>
      <NumberField
        label={t("impose.stickers.preferredLength", {
          defaultValue: "Preferred Length",
        })}
        value={settings.preferredSheetLengthMm}
        width="100%"
        min={100}
        step={10}
        onChange={(value) => {
          if (typeof value === "number") {
            onChange({ preferredSheetLengthMm: value });
          }
        }}
      />
      <NumberField
        label={
          isGrouped
            ? t("impose.stickers.partGap", { defaultValue: "Part Gap" })
            : t("impose.stickers.sheetGap", { defaultValue: "Sheet Gap" })
        }
        value={isGrouped ? settings.partGapMm : settings.sheetGapMm}
        width="100%"
        min={0}
        step={0.5}
        onChange={(value) => {
          if (typeof value !== "number") return;
          onChange(isGrouped ? { partGapMm: value } : { sheetGapMm: value });
        }}
      />
      <Switch
        size="sm"
        colorPalette="primary"
        checked={settings.allowLongSheets}
        onCheckedChange={({ checked }) =>
          onChange({ allowLongSheets: Boolean(checked) })
        }
      >
        {t("impose.stickers.allowLongSheets", {
          defaultValue: "Allow 1.5 m Sheets",
        })}
      </Switch>
      {!isGrouped && (
        <Switch
          size="sm"
          colorPalette="primary"
          checked={settings.fillRows}
          onCheckedChange={({ checked }) =>
            onChange({ fillRows: Boolean(checked) })
          }
        >
          {t("impose.stickers.fillRows", {
            defaultValue: "Fill Complete Rows",
          })}
        </Switch>
      )}
    </VStack>
  );
}

// ── Section 3: Cut Marks & Registration ───────────────────────────────────

type CutMarksSectionProps = {
  onChange: (patch: Partial<StickerImpositionSettings>) => void;
  settings: StickerImpositionSettings;
};

function CutMarksSection({ onChange, settings }: CutMarksSectionProps) {
  const { t } = useT(["impose", "translation"]);

  return (
    <VStack align="stretch" gap={4}>
      {/* Manual Cut Marks */}
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" align="center">
          <VStack align="start" gap={0} flex="1" minW={0}>
            <Text fontWeight="medium" fontSize="sm">
              {t("impose.stickers.manualCutMarks.title", {
                defaultValue: "Manual Cut Marks",
              })}
            </Text>
            <Text
              fontSize="xs"
              color={{ base: "gray.600", _dark: "gray.400" }}
            >
              {t("impose.stickers.manualCutMarks.description", {
                defaultValue:
                  "Adds short edge marks for manual trimming between stickers or ready sheets.",
              })}
            </Text>
          </VStack>
          <Switch
            size="sm"
            colorPalette="primary"
            checked={settings.manualCutMarksEnabled}
            onCheckedChange={({ checked }) =>
              onChange({ manualCutMarksEnabled: Boolean(checked) })
            }
          >
            {t("impose.stickers.manualCutMarks.enable", {
              defaultValue: "Enable",
            })}
          </Switch>
        </HStack>
        {settings.manualCutMarksEnabled && (
          <SimpleGrid columns={2} gap={3}>
            <NumberField
              label={t("impose.stickers.manualCutMarks.length", {
                defaultValue: "Cut Mark Length",
              })}
              value={settings.manualCutMarkLengthMm}
              width="100%"
              min={1}
              step={0.5}
              onChange={(value) => {
                if (typeof value === "number") {
                  onChange({ manualCutMarkLengthMm: value });
                }
              }}
            />
          </SimpleGrid>
        )}
      </VStack>

      {/* OPOS Marks */}
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" align="center">
          <VStack align="start" gap={0} flex="1" minW={0}>
            <Text fontWeight="medium" fontSize="sm">
              {t("impose.stickers.opos.title", {
                defaultValue: "OPOS Marks (Summa D140)",
              })}
            </Text>
            <Text
              fontSize="xs"
              color={{ base: "gray.600", _dark: "gray.400" }}
            >
              {t("impose.stickers.opos.description", {
                defaultValue:
                  "Optical registration marks read by the plotter before cutting.",
              })}
            </Text>
          </VStack>
          <Switch
            size="sm"
            colorPalette="primary"
            checked={settings.oposMarksEnabled}
            onCheckedChange={({ checked }) =>
              onChange({ oposMarksEnabled: Boolean(checked) })
            }
          >
            {t("impose.stickers.opos.enable", { defaultValue: "Enable" })}
          </Switch>
        </HStack>
        {settings.oposMarksEnabled && (
          <SimpleGrid columns={2} gap={3}>
            <NumberField
              label={t("impose.stickers.opos.markSize", {
                defaultValue: "Mark Size (mm)",
              })}
              value={settings.oposMarkSizeMm}
              width="100%"
              min={2}
              step={0.5}
              onChange={(value) => {
                if (typeof value === "number") {
                  onChange({ oposMarkSizeMm: value });
                }
              }}
            />
            <NumberField
              label={t("impose.stickers.opos.spacing", {
                defaultValue: "Mark Spacing (mm)",
              })}
              value={settings.oposMarkSpacingMm}
              width="100%"
              min={50}
              step={10}
              onChange={(value) => {
                if (typeof value === "number") {
                  onChange({ oposMarkSpacingMm: value });
                }
              }}
            />
            <NumberField
              label={t("impose.stickers.opos.margin", {
                defaultValue: "Edge Margin (mm)",
              })}
              value={settings.oposMarkMarginMm}
              width="100%"
              min={2}
              step={1}
              onChange={(value) => {
                if (typeof value === "number") {
                  onChange({ oposMarkMarginMm: value });
                }
              }}
            />
          </SimpleGrid>
        )}
      </VStack>
    </VStack>
  );
}

// ── Public factory ─────────────────────────────────────────────────────────

type BuildStickerSectionsArgs = {
  settings: StickerImpositionSettings;
  onChange: (patch: Partial<StickerImpositionSettings>) => void;
  t: ReturnType<typeof useT>["t"];
};

export function buildStickerSections({
  settings,
  onChange,
  t,
}: BuildStickerSectionsArgs): ImposeFloatingSectionItem[] {
  return [
    {
      key: "media",
      icon: "straighten",
      label: t("impose.stickers.sections.media", {
        defaultValue: "Media & Layout",
      }),
      content: <MediaLayoutSection settings={settings} onChange={onChange} />,
    },
    {
      key: "sheet",
      icon: "article",
      label: t("impose.stickers.sections.sheet", {
        defaultValue: "Sheet Behavior",
      }),
      content: (
        <SheetBehaviorSection settings={settings} onChange={onChange} />
      ),
    },
    {
      key: "cutMarks",
      icon: "content_cut",
      label: t("impose.stickers.sections.cutMarks", {
        defaultValue: "Cut Marks & Registration",
      }),
      contentWidth: "24rem",
      content: <CutMarksSection settings={settings} onChange={onChange} />,
    },
  ];
}
