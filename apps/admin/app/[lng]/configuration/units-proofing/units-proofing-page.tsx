"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useConfiguration } from "@/context/configuration";
import {
  ConfigurableSettingsTranslationPanel,
  CopyFromChannelMenu,
  StickyActionBar,
  TaxonomyEditor,
  type TaxonomyColumn,
} from "@/components/configuration/taxonomy";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadUnitsProofingSettings,
  saveUnitsProofingSettings,
} from "@/lib/units-proofing-settings.client";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import type {
  ProofingMethodDefinition,
  UnitDefinition,
  UnitsProofingSettings,
} from "@konfi/types";
import {
  createDefaultUnitsProofingSettings,
  createProofingMethodId,
  createUnitId,
  normalizeUnitsProofingSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

const UNIT_ICONS = [
  "straighten",
  "square_foot",
  "scale",
  "schedule",
  "inventory_2",
  "category",
  "tag",
  "calculate",
  "view_in_ar",
  "layers",
] as const;

const PROOFING_ICONS = [
  "fact_check",
  "rate_review",
  "feedback",
  "approval",
  "verified",
  "draft",
  "edit_document",
  "rule",
  "support_agent",
  "schedule",
] as const;

function snapshot(settings: UnitsProofingSettings): string {
  return JSON.stringify({
    units: settings.units,
    proofingMethods: settings.proofingMethods,
  });
}

export default function UnitsProofingPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { refreshStoreSettings } = useConfiguration();
  const [settings, setSettings] = useState<UnitsProofingSettings>(() =>
    createDefaultUnitsProofingSettings(),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!channel) return;

    let active = true;
    setIsLoading(true);
    loadUnitsProofingSettings(channel.id)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeUnitsProofingSettings(next);
        setSettings(normalized);
        setPristine(snapshot(normalized));
      })
      .catch((error: unknown) => {
        console.error("Failed to load units and proofing settings:", error);
        toaster.error({
          title: t("unitsProofing.loadFailed.title", {
            defaultValue: "Units and proofing settings were not loaded",
          }),
          description: t("unitsProofing.loadFailed.description", {
            defaultValue: "Check the channel settings and try again.",
          }),
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [channel, t]);

  const channelOptions = useMemo(
    () =>
      (channels ?? [])
        .filter((candidate) => candidate.id !== channel?.id)
        .map((candidate) => ({
          label: candidate.name,
          value: candidate.id,
        })),
    [channel?.id, channels],
  );

  const dirty = snapshot(settings) !== pristine;

  const handleSave = async () => {
    if (!channel) {
      toaster.error({
        title: t("unitsProofing.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("unitsProofing.channelRequired.description", {
          defaultValue: "Select a channel before saving units and proofing.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeUnitsProofingSettings({
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await saveUnitsProofingSettings(channel.id, payload, tenantContext);
      refreshStoreSettings();
      setPristine(snapshot(payload));
      toaster.success({
        title: t("unitsProofing.saved.title", {
          defaultValue: "Units and proofing saved",
        }),
        description: t("unitsProofing.saved.description", {
          defaultValue: "The selected channel now uses these settings.",
        }),
      });
    } catch (error) {
      console.error("Failed to save units and proofing settings:", error);
      toaster.error({
        title: t("unitsProofing.saveFailed.title", {
          defaultValue: "Units and proofing were not saved",
        }),
        description:
          error instanceof Error &&
          error.message.includes("SaaS quota exceeded")
            ? error.message
            : t("unitsProofing.saveFailed.description", {
                defaultValue: "Check the settings and try again.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyFromChannel = async (sourceChannelId: string) => {
    try {
      const sourceSettings = await loadUnitsProofingSettings(sourceChannelId);
      setSettings(normalizeUnitsProofingSettings(sourceSettings));
      toaster.success({
        title: t("unitsProofing.copy.loadedTitle", {
          defaultValue: "Units and proofing copied",
        }),
        description: t("unitsProofing.copy.loadedDescription", {
          defaultValue: "Review the copied settings and save them here.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy units and proofing settings:", error);
      toaster.error({
        title: t("unitsProofing.copy.failedTitle", {
          defaultValue: "Units and proofing were not copied",
        }),
        description: t("unitsProofing.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      });
    }
  };

  const unitColumns: TaxonomyColumn<UnitDefinition>[] = [
    {
      key: "abbreviation",
      width: "120px",
      header: t("unitsProofing.fields.abbreviation", {
        defaultValue: "Abbreviation",
      }),
      render: (unit, update) => (
        <Input
          autoComplete="off"
          size="sm"
          value={unit.abbreviation}
          onChange={(e) => update({ abbreviation: e.target.value })}
        />
      ),
    },
    {
      key: "precision",
      width: "100px",
      header: t("unitsProofing.fields.precision", {
        defaultValue: "Precision",
      }),
      render: (unit, update) => (
        <Input
          autoComplete="off"
          inputMode="numeric"
          size="sm"
          type="number"
          min={0}
          max={6}
          value={unit.precision}
          onChange={(e) => update({ precision: Number(e.target.value) || 0 })}
        />
      ),
    },
  ];

  const summary = t("unitsProofing.footer", {
    proofingMethods: settings.proofingMethods.length,
    units: settings.units.length,
    defaultValue:
      "{{units}} units, {{proofingMethods}} proofing methods configured",
  });

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("unitsProofing.title", {
          defaultValue: "Units & Proofing",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Stack gap={8}>
        <TaxonomyEditor<UnitDefinition>
          title={t("unitsProofing.units.title", { defaultValue: "Units" })}
          description={t("unitsProofing.units.description", {
            defaultValue:
              "Configure product units, abbreviations, and quantity precision.",
          })}
          definitions={settings.units}
          onChange={(units) =>
            setSettings((current) => ({ ...current, units }))
          }
          createDefinition={({ id, name, icon, colorPalette, order }) => ({
            id,
            name,
            icon,
            colorPalette,
            order,
            abbreviation: name,
            archived: false,
            enabled: true,
            isDefault: false,
            precision: 0,
          })}
          createId={createUnitId}
          fallbackIcon="straighten"
          fallbackColorPalette="gray"
          iconOptions={UNIT_ICONS}
          extraColumns={unitColumns}
          addNamePlaceholder={t("unitsProofing.units.addPlaceholder", {
            defaultValue: "e.g. Box...",
          })}
          headerActions={
            <HStack gap={2}>
              <ConfigurableSettingsTranslationPanel
                channelId={channel?.id}
                kind="unitsProofingSettings"
                source={settings}
                title={t("forms.buttons.translations", {
                  defaultValue: "Translations",
                })}
                onMutate={refreshStoreSettings}
              />
              <CopyFromChannelMenu
                options={channelOptions}
                onCopy={copyFromChannel}
              />
            </HStack>
          }
        />

        <TaxonomyEditor<ProofingMethodDefinition>
          title={t("unitsProofing.proofing.title", {
            defaultValue: "Proofing Methods",
          })}
          description={t("unitsProofing.proofing.description", {
            defaultValue:
              "Configure proofing options available on order and checkout forms.",
          })}
          definitions={settings.proofingMethods}
          onChange={(proofingMethods) =>
            setSettings((current) => ({ ...current, proofingMethods }))
          }
          createDefinition={({ id, name, icon, colorPalette, order }) => ({
            id,
            name,
            icon,
            colorPalette,
            order,
            archived: false,
            enabled: true,
            isDefault: false,
          })}
          createId={createProofingMethodId}
          fallbackIcon="fact_check"
          fallbackColorPalette="gray"
          iconOptions={PROOFING_ICONS}
          addNamePlaceholder={t("unitsProofing.proofing.addPlaceholder", {
            defaultValue: "e.g. Customer PDF proof...",
          })}
        />
      </Stack>

      <StickyActionBar
        dirty={dirty}
        saving={isSaving || isLoading}
        onSave={handleSave}
        saveLabel={t("unitsProofing.save", {
          defaultValue: "Save Units & Proofing",
        })}
        summary={summary}
      />
    </Stack>
  );
}
