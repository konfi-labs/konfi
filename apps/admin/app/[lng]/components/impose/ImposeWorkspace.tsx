"use client";

import { useT } from "@/i18n/client";
import {
  imposeWorkspaceMode,
  selectableBleedTypeOptions,
  type ImposeWorkspaceMode,
} from "@/lib/imposition/workspace";
import { Box, Grid } from "@chakra-ui/react";
import {
  backPageRotationAsOptions,
  bindingEdgeAsOptions,
  duplexModeAsOptions,
  layoutTypeAsOptions,
  paperOrientationAsOptions,
  sourceSizingAsOptions,
  type CreateImpositionWorkflow,
} from "@konfi/types";
import { paperSizesAsOptions } from "@konfi/utils";
import { useMemo, useState } from "react";
import { type ImposeFormMethods, type ImposeFormValues } from "./impose-form";
import { ImposePreview } from "./impose-preview";
import {
  ImposeFloatingSections,
  type ImposeFloatingSectionItem,
} from "./workspace/ImposeFloatingSections";
import {
  BleedSizingSection,
  FinishingSection,
  LayoutSection,
  SettingsSection,
  SpacingSection,
} from "./workspace/ImposeWorkspaceSections";
import { ImposeWorkspaceUploadPanel } from "./workspace/ImposeWorkspaceUploadPanel";
import { translateOptions } from "./workspace/controls";

interface ImposeWorkspaceProps {
  methods: ImposeFormMethods;
  templates: CreateImpositionWorkflow[];
  isLoading: boolean;
  submitLabel: string;
  isSubmitting: boolean;
  uploadGeneratedToStorage: boolean;
  onUploadGeneratedToStorageChange: (nextValue: boolean) => void;
  onLoadTemplate: (impositionWorkflow: CreateImpositionWorkflow) => void;
  onRemoveTemplate: (id: string) => void | Promise<void>;
  onCreateImposition: (data: ImposeFormValues) => Promise<void>;
  onSaveTemplateOnly: () => void | Promise<void>;
}

const MODE_SECTION_KEYS: Record<string, ImposeWorkspaceMode> = {
  layout: imposeWorkspaceMode.LAYOUT,
  spacing: imposeWorkspaceMode.SPACING,
  finishing: imposeWorkspaceMode.FINISHING,
  bleedSizing: imposeWorkspaceMode.BLEED_SIZING,
};

export function ImposeWorkspace({
  methods,
  templates,
  isLoading,
  submitLabel,
  isSubmitting,
  uploadGeneratedToStorage,
  onUploadGeneratedToStorageChange,
  onLoadTemplate,
  onRemoveTemplate,
  onCreateImposition,
  onSaveTemplateOnly,
}: ImposeWorkspaceProps) {
  const { t } = useT(["impose", "translation"]);

  const [openSection, setOpenSection] = useState<string | null>("layout");
  const [activeMode, setActiveMode] = useState<ImposeWorkspaceMode>(
    imposeWorkspaceMode.LAYOUT,
  );

  const localizedLayoutOptions = useMemo(
    () => translateOptions(t, "LayoutType", layoutTypeAsOptions),
    [t],
  );
  const localizedOrientationOptions = useMemo(
    () => translateOptions(t, "PaperOrientations", paperOrientationAsOptions),
    [t],
  );
  const localizedDuplexOptions = useMemo(
    () => translateOptions(t, "DuplexMode", duplexModeAsOptions),
    [t],
  );
  const localizedBackRotationOptions = useMemo(
    () => translateOptions(t, "BackPageRotation", backPageRotationAsOptions),
    [t],
  );
  const localizedBindingOptions = useMemo(
    () => translateOptions(t, "BindingEdge", bindingEdgeAsOptions),
    [t],
  );
  const localizedBleedOptions = useMemo(
    () => translateOptions(t, "BleedType", selectableBleedTypeOptions),
    [t],
  );
  const localizedSourceSizingOptions = useMemo(
    () => translateOptions(t, "SourceSizing", sourceSizingAsOptions),
    [t],
  );
  const localizedPaperSizeOptions = useMemo(
    () => translateOptions(t, "PaperSizes", paperSizesAsOptions),
    [t],
  );

  function handleOpenChange(key: string | null) {
    setOpenSection(key);
    if (key !== null && key in MODE_SECTION_KEYS) {
      setActiveMode(MODE_SECTION_KEYS[key] as ImposeWorkspaceMode);
    }
  }

  const sections: ImposeFloatingSectionItem[] = useMemo(
    () => [
      {
        key: "layout",
        icon: "grid_view",
        label: t("impose.workspace.modes.layout", {
          defaultValue: "Layout",
        }),
        content: (
          <LayoutSection
            methods={methods}
            layoutOptions={localizedLayoutOptions}
            orientationOptions={localizedOrientationOptions}
          />
        ),
      },
      {
        key: "spacing",
        icon: "swap_horiz",
        label: t("impose.workspace.modes.spacing", {
          defaultValue: "Spacing",
        }),
        content: <SpacingSection methods={methods} />,
      },
      {
        key: "finishing",
        icon: "flip_to_back",
        label: t("impose.workspace.modes.finishing", {
          defaultValue: "Finishing / duplex",
        }),
        content: (
          <FinishingSection
            methods={methods}
            duplexOptions={localizedDuplexOptions}
            backRotationOptions={localizedBackRotationOptions}
          />
        ),
      },
      {
        key: "bleedSizing",
        icon: "crop",
        label: t("impose.workspace.modes.bleedSizing", {
          defaultValue: "Bleed / sizing",
        }),
        content: (
          <BleedSizingSection
            methods={methods}
            bleedOptions={localizedBleedOptions}
            sourceSizingOptions={localizedSourceSizingOptions}
          />
        ),
      },
      {
        key: "settings",
        icon: "settings",
        label: t("impose.workspace.settings", {
          defaultValue: "Settings",
        }),
        content: (
          <SettingsSection
            methods={methods}
            paperSizeOptions={localizedPaperSizeOptions}
            orientationOptions={localizedOrientationOptions}
            bindingOptions={localizedBindingOptions}
          />
        ),
      },
    ],
    [
      t,
      methods,
      localizedLayoutOptions,
      localizedOrientationOptions,
      localizedDuplexOptions,
      localizedBackRotationOptions,
      localizedBleedOptions,
      localizedSourceSizingOptions,
      localizedPaperSizeOptions,
      localizedBindingOptions,
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
            label={t("impose.workspace.controlsLabel", {
              defaultValue: "Imposition controls",
            })}
          />
          <ImposePreview
            methods={methods}
            activeMode={activeMode}
            templates={templates}
            isLoading={isLoading}
            onLoadTemplate={onLoadTemplate}
            onRemoveTemplate={onRemoveTemplate}
          />
        </Box>
        <ImposeWorkspaceUploadPanel
          methods={methods}
          submitLabel={submitLabel}
          isSubmitting={isSubmitting}
          uploadGeneratedToStorage={uploadGeneratedToStorage}
          onUploadGeneratedToStorageChangeAction={
            onUploadGeneratedToStorageChange
          }
          onCreateImpositionAction={methods.handleSubmit(onCreateImposition)}
          onSaveTemplateOnlyAction={onSaveTemplateOnly}
        />
      </Grid>
    </Box>
  );
}
