"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useConfiguration } from "@/context/configuration";
import {
  ConfigurableSettingsTranslationPanel,
  CopyFromChannelMenu,
  StickyActionBar,
  TaxonomyEditor,
  type TaxonomyColumn,
  type TaxonomyToggle,
} from "@/components/configuration/taxonomy";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadSupportTaxonomySettings,
  saveSupportTaxonomySettings,
} from "@/lib/support-taxonomy-settings.client";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  createComplaintStatusId,
  createDefaultSupportTaxonomySettings,
  createNoteCategoryId,
  createNotePriorityId,
  normalizeSupportTaxonomySettings,
  type SupportComplaintStatusDefinition,
  type SupportNoteCategoryDefinition,
  type SupportNotePriorityDefinition,
  type SupportTaxonomySettings,
} from "@konfi/utils";

const COMPLAINT_ICONS = [
  "feedback",
  "rate_review",
  "support_agent",
  "task_alt",
  "schedule",
  "draft",
  "approval",
  "verified",
  "block",
  "warning",
] as const;

const NOTE_CATEGORY_ICONS = [
  "sticky_note_2",
  "edit_document",
  "label",
  "category",
  "tag",
  "rule",
  "feedback",
  "support_agent",
  "build",
] as const;

const PRIORITY_ICONS = [
  "priority_high",
  "flag",
  "warning",
  "schedule",
  "trending_up",
  "trending_down",
  "block",
  "task_alt",
] as const;

function snapshot(settings: SupportTaxonomySettings): string {
  return JSON.stringify({
    complaintStatuses: settings.complaintStatuses,
    noteCategories: settings.noteCategories,
    notePriorities: settings.notePriorities,
  });
}

export default function SupportTaxonomyPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { refreshStoreSettings } = useConfiguration();
  const [settings, setSettings] = useState<SupportTaxonomySettings>(() =>
    createDefaultSupportTaxonomySettings(),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!channel) return;

    let active = true;
    setIsLoading(true);
    loadSupportTaxonomySettings(channel.id)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeSupportTaxonomySettings(next);
        setSettings(normalized);
        setPristine(snapshot(normalized));
      })
      .catch((error: unknown) => {
        console.error("Failed to load support taxonomy settings:", error);
        toaster.error({
          title: t("supportTaxonomy.loadFailed.title", {
            defaultValue: "Support taxonomy was not loaded",
          }),
          description: t("supportTaxonomy.loadFailed.description", {
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

  const saveSettings = async () => {
    if (!channel) {
      toaster.error({
        title: t("supportTaxonomy.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("supportTaxonomy.channelRequired.description", {
          defaultValue: "Select a channel before saving support taxonomy.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeSupportTaxonomySettings({
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await saveSupportTaxonomySettings(channel.id, payload, tenantContext);
      refreshStoreSettings();
      setPristine(snapshot(payload));
      toaster.success({
        title: t("supportTaxonomy.saved.title", {
          defaultValue: "Support taxonomy saved",
        }),
        description: t("supportTaxonomy.saved.description", {
          defaultValue: "The selected channel now uses this taxonomy.",
        }),
      });
    } catch (error) {
      console.error("Failed to save support taxonomy settings:", error);
      toaster.error({
        title: t("supportTaxonomy.saveFailed.title", {
          defaultValue: "Support taxonomy was not saved",
        }),
        description:
          error instanceof Error &&
          error.message.includes("SaaS quota exceeded")
            ? error.message
            : t("supportTaxonomy.saveFailed.description", {
                defaultValue: "Check the settings and try again.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyFromChannel = async (sourceChannelId: string) => {
    try {
      const sourceSettings = await loadSupportTaxonomySettings(sourceChannelId);
      setSettings(normalizeSupportTaxonomySettings(sourceSettings));
      toaster.success({
        title: t("supportTaxonomy.copy.loadedTitle", {
          defaultValue: "Support taxonomy copied",
        }),
        description: t("supportTaxonomy.copy.loadedDescription", {
          defaultValue: "Review the copied taxonomy and save it here.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy support taxonomy settings:", error);
      toaster.error({
        title: t("supportTaxonomy.copy.failedTitle", {
          defaultValue: "Support taxonomy was not copied",
        }),
        description: t("supportTaxonomy.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      });
    }
  };

  const complaintToggles: readonly TaxonomyToggle<SupportComplaintStatusDefinition>[] =
    [
      {
        key: "resolved",
        label: t("supportTaxonomy.complaintStatuses.resolved", {
          defaultValue: "Resolved",
        }),
      },
      {
        key: "terminal",
        label: t("supportTaxonomy.complaintStatuses.terminal", {
          defaultValue: "Terminal",
        }),
      },
    ];

  const priorityColumns: TaxonomyColumn<SupportNotePriorityDefinition>[] = [
    {
      key: "weight",
      width: "100px",
      header: t("supportTaxonomy.notePriorities.weight", {
        defaultValue: "Weight",
      }),
      render: (priority, update) => (
        <Input
          autoComplete="off"
          inputMode="numeric"
          size="sm"
          type="number"
          value={priority.weight ?? 0}
          onChange={(e) => {
            const weight = Number(e.target.value);
            update({ weight: Number.isFinite(weight) ? weight : 0 });
          }}
        />
      ),
    },
  ];

  const summary = t("supportTaxonomy.footer", {
    complaintStatuses: settings.complaintStatuses.length,
    noteCategories: settings.noteCategories.length,
    notePriorities: settings.notePriorities.length,
    defaultValue:
      "{{complaintStatuses}} statuses, {{noteCategories}} categories, {{notePriorities}} priorities configured",
  });

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("supportTaxonomy.title", {
          defaultValue: "Support Taxonomy",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Stack gap={8}>
        <TaxonomyEditor<SupportComplaintStatusDefinition>
          title={t("supportTaxonomy.complaintStatuses.title", {
            defaultValue: "Complaint Statuses",
          })}
          description={t("supportTaxonomy.complaintStatuses.description", {
            defaultValue:
              "Configure complaint workflow states while keeping historical status ids readable.",
          })}
          definitions={settings.complaintStatuses}
          onChange={(complaintStatuses) =>
            setSettings((current) => ({ ...current, complaintStatuses }))
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
            resolved: false,
            terminal: false,
          })}
          createId={createComplaintStatusId}
          fallbackIcon="feedback"
          fallbackColorPalette="gray"
          iconOptions={COMPLAINT_ICONS}
          toggles={complaintToggles}
          addNamePlaceholder={t(
            "supportTaxonomy.complaintStatuses.addPlaceholder",
            { defaultValue: "e.g. Awaiting customer..." },
          )}
          headerActions={
            <HStack gap={2} wrap="wrap">
              <ConfigurableSettingsTranslationPanel
                channelId={channel?.id}
                kind="supportTaxonomySettings"
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

        <TaxonomyEditor<SupportNoteCategoryDefinition>
          title={t("supportTaxonomy.noteCategories.title", {
            defaultValue: "Note Categories",
          })}
          description={t("supportTaxonomy.noteCategories.description", {
            defaultValue:
              "Configure the note categories available in note forms and badges.",
          })}
          definitions={settings.noteCategories}
          onChange={(noteCategories) =>
            setSettings((current) => ({ ...current, noteCategories }))
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
          createId={createNoteCategoryId}
          fallbackIcon="sticky_note_2"
          fallbackColorPalette="gray"
          iconOptions={NOTE_CATEGORY_ICONS}
          addNamePlaceholder={t(
            "supportTaxonomy.noteCategories.addPlaceholder",
            { defaultValue: "e.g. Production..." },
          )}
        />

        <TaxonomyEditor<SupportNotePriorityDefinition>
          title={t("supportTaxonomy.notePriorities.title", {
            defaultValue: "Note Priorities",
          })}
          description={t("supportTaxonomy.notePriorities.description", {
            defaultValue:
              "Configure note priorities and their weights for deterministic sorting.",
          })}
          definitions={settings.notePriorities}
          onChange={(notePriorities) =>
            setSettings((current) => ({ ...current, notePriorities }))
          }
          createDefinition={({ id, name, icon, colorPalette, order }) => {
            const maxWeight = Math.max(
              0,
              ...settings.notePriorities.map((p) => p.weight ?? 0),
            );
            return {
              id,
              name,
              icon,
              colorPalette,
              order,
              archived: false,
              enabled: true,
              isDefault: false,
              weight: maxWeight + 10,
            };
          }}
          createId={createNotePriorityId}
          fallbackIcon="priority_high"
          fallbackColorPalette="gray"
          iconOptions={PRIORITY_ICONS}
          extraColumns={priorityColumns}
          addNamePlaceholder={t(
            "supportTaxonomy.notePriorities.addPlaceholder",
            { defaultValue: "e.g. Blocked..." },
          )}
        />
      </Stack>

      <StickyActionBar
        dirty={dirty}
        saving={isSaving || isLoading}
        onSave={saveSettings}
        saveLabel={t("supportTaxonomy.save", {
          defaultValue: "Save Support Taxonomy",
        })}
        summary={summary}
      />
    </Stack>
  );
}
