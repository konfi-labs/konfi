"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useConfiguration } from "@/context/configuration";
import {
  ConfigurableSettingsTranslationPanel,
  CopyFromChannelMenu,
  StickyActionBar,
  TaxonomyEditor,
  type TaxonomyToggle,
} from "@/components/configuration/taxonomy";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadOrderWorkflowStatusesSettings,
  saveOrderWorkflowStatusesSettings,
} from "@/lib/order-workflow-statuses-settings.client";
import { HStack, Stack } from "@chakra-ui/react";
import { CustomHeading, toaster } from "@konfi/components";
import type {
  OrderFileStatusDefinition,
  OrderWorkflowStatusDefinition,
  OrderWorkflowStatusesSettings,
} from "@konfi/types";
import {
  createDefaultOrderWorkflowStatusesSettings,
  createOrderFileStatusId,
  createOrderWorkflowStatusId,
  normalizeOrderWorkflowStatusesSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

const ORDER_STATUS_ICONS = [
  "fact_check",
  "schedule",
  "play_arrow",
  "task_alt",
  "rule",
  "draft",
  "block",
  "verified",
  "approval",
  "local_shipping",
  "warehouse",
] as const;

const FILE_STATUS_ICONS = [
  "edit_document",
  "draft",
  "rate_review",
  "approval",
  "verified",
  "task_alt",
  "rule",
  "build",
  "block",
  "warning",
] as const;

function snapshot(settings: OrderWorkflowStatusesSettings): string {
  return JSON.stringify({
    orderStatuses: settings.orderStatuses,
    fileStatuses: settings.fileStatuses,
  });
}

export default function OrderWorkflowStatusesPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { refreshStoreSettings } = useConfiguration();
  const [settings, setSettings] = useState<OrderWorkflowStatusesSettings>(() =>
    createDefaultOrderWorkflowStatusesSettings(),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!channel) return;

    let active = true;
    setIsLoading(true);
    loadOrderWorkflowStatusesSettings(channel.id)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeOrderWorkflowStatusesSettings(next);
        setSettings(normalized);
        setPristine(snapshot(normalized));
      })
      .catch((error: unknown) => {
        console.error(
          "Failed to load order workflow statuses settings:",
          error,
        );
        toaster.error({
          title: t("orderWorkflowStatuses.loadFailed.title", {
            defaultValue: "Order workflow statuses were not loaded",
          }),
          description: t("orderWorkflowStatuses.loadFailed.description", {
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
        title: t("orderWorkflowStatuses.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("orderWorkflowStatuses.channelRequired.description", {
          defaultValue: "Select a channel before saving workflow statuses.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeOrderWorkflowStatusesSettings({
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await saveOrderWorkflowStatusesSettings(
        channel.id,
        payload,
        tenantContext,
      );
      refreshStoreSettings();
      setPristine(snapshot(payload));
      toaster.success({
        title: t("orderWorkflowStatuses.saved.title", {
          defaultValue: "Workflow statuses saved",
        }),
        description: t("orderWorkflowStatuses.saved.description", {
          defaultValue: "The selected channel now uses these statuses.",
        }),
      });
    } catch (error) {
      console.error("Failed to save order workflow statuses settings:", error);
      toaster.error({
        title: t("orderWorkflowStatuses.saveFailed.title", {
          defaultValue: "Workflow statuses were not saved",
        }),
        description:
          error instanceof Error &&
          error.message.includes("SaaS quota exceeded")
            ? error.message
            : t("orderWorkflowStatuses.saveFailed.description", {
                defaultValue: "Check the settings and try again.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyFromChannel = async (sourceChannelId: string) => {
    try {
      const sourceSettings =
        await loadOrderWorkflowStatusesSettings(sourceChannelId);
      setSettings(normalizeOrderWorkflowStatusesSettings(sourceSettings));
      toaster.success({
        title: t("orderWorkflowStatuses.copy.loadedTitle", {
          defaultValue: "Workflow statuses copied",
        }),
        description: t("orderWorkflowStatuses.copy.loadedDescription", {
          defaultValue: "Review the copied statuses and save them here.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy order workflow statuses settings:", error);
      toaster.error({
        title: t("orderWorkflowStatuses.copy.failedTitle", {
          defaultValue: "Workflow statuses were not copied",
        }),
        description: t("orderWorkflowStatuses.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      });
    }
  };

  const orderToggles: readonly TaxonomyToggle<OrderWorkflowStatusDefinition>[] =
    [
      {
        key: "isInitial",
        label: t("orderWorkflowStatuses.semantic.isInitial", {
          defaultValue: "Initial",
        }),
      },
      {
        key: "isDraft",
        label: t("orderWorkflowStatuses.semantic.isDraft", {
          defaultValue: "Draft",
        }),
      },
      {
        key: "isTerminal",
        label: t("orderWorkflowStatuses.semantic.isTerminal", {
          defaultValue: "Terminal",
        }),
      },
      {
        key: "countsAsActive",
        label: t("orderWorkflowStatuses.semantic.countsAsActive", {
          defaultValue: "Counts as active",
        }),
      },
      {
        key: "blocksActions",
        label: t("orderWorkflowStatuses.semantic.blocksActions", {
          defaultValue: "Blocks actions",
        }),
      },
      {
        key: "readyForPickup",
        label: t("orderWorkflowStatuses.semantic.readyForPickup", {
          defaultValue: "Ready for pickup",
        }),
      },
      {
        key: "fulfilled",
        label: t("orderWorkflowStatuses.semantic.fulfilled", {
          defaultValue: "Fulfilled",
        }),
      },
      {
        key: "canceled",
        label: t("orderWorkflowStatuses.semantic.canceled", {
          defaultValue: "Canceled",
        }),
      },
      {
        key: "sendCustomerEmail",
        label: t("orderWorkflowStatuses.semantic.sendCustomerEmail", {
          defaultValue: "Send customer email",
        }),
      },
      {
        key: "kanbanColumn",
        label: t("orderWorkflowStatuses.semantic.kanbanColumn", {
          defaultValue: "Kanban column",
        }),
      },
      {
        key: "startsInternalTransit",
        label: t("orderWorkflowStatuses.semantic.startsInternalTransit", {
          defaultValue: "Starts internal transit",
        }),
      },
    ];

  const fileToggles: readonly TaxonomyToggle<OrderFileStatusDefinition>[] = [
    {
      key: "isInitial",
      label: t("orderWorkflowStatuses.semantic.isInitial", {
        defaultValue: "Initial",
      }),
    },
    {
      key: "isTerminal",
      label: t("orderWorkflowStatuses.semantic.isTerminal", {
        defaultValue: "Terminal",
      }),
    },
    {
      key: "blocksActions",
      label: t("orderWorkflowStatuses.semantic.blocksActions", {
        defaultValue: "Blocks actions",
      }),
    },
    {
      key: "requiresCustomerFiles",
      label: t("orderWorkflowStatuses.semantic.requiresCustomerFiles", {
        defaultValue: "Requires files",
      }),
    },
    {
      key: "requiresCustomerApproval",
      label: t("orderWorkflowStatuses.semantic.requiresCustomerApproval", {
        defaultValue: "Requires approval",
      }),
    },
    {
      key: "underDesign",
      label: t("orderWorkflowStatuses.semantic.underDesign", {
        defaultValue: "Under design",
      }),
    },
    {
      key: "readyForVerification",
      label: t("orderWorkflowStatuses.semantic.readyForVerification", {
        defaultValue: "Ready for verification",
      }),
    },
    {
      key: "readyForPreparation",
      label: t("orderWorkflowStatuses.semantic.readyForPreparation", {
        defaultValue: "Ready for preparation",
      }),
    },
    {
      key: "filesReady",
      label: t("orderWorkflowStatuses.semantic.filesReady", {
        defaultValue: "Files ready",
      }),
    },
    {
      key: "allowsProduction",
      label: t("orderWorkflowStatuses.semantic.allowsProduction", {
        defaultValue: "Allows production",
      }),
    },
  ];

  const summary = `${t("orderWorkflowStatuses.order.footer", {
    count: settings.orderStatuses.length,
    defaultValue: "{{count}} order statuses configured",
  })} · ${t("orderWorkflowStatuses.files.footer", {
    count: settings.fileStatuses.length,
    defaultValue: "{{count}} file statuses configured",
  })}`;

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("orderWorkflowStatuses.title", {
          defaultValue: "Order Workflow Statuses",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Stack gap={8}>
        <TaxonomyEditor<OrderWorkflowStatusDefinition>
          title={t("orderWorkflowStatuses.order.title", {
            defaultValue: "Order Statuses",
          })}
          description={t("orderWorkflowStatuses.order.description", {
            defaultValue:
              "Reorder, archive, and tag workflow statuses used by orders, Kanban, and automation.",
          })}
          definitions={settings.orderStatuses}
          onChange={(orderStatuses) =>
            setSettings((current) => ({ ...current, orderStatuses }))
          }
          createDefinition={({ id, name, icon, colorPalette, order }) => ({
            id,
            name,
            icon,
            colorPalette,
            order,
            archived: false,
            blocksActions: false,
            canceled: false,
            countsAsActive: true,
            enabled: true,
            fulfilled: false,
            isDefault: false,
            isDraft: false,
            isInitial: false,
            isTerminal: false,
            kanbanColumn: true,
            readyForPickup: false,
            sendCustomerEmail: false,
            startsInternalTransit: false,
          })}
          createId={createOrderWorkflowStatusId}
          fallbackIcon="fact_check"
          fallbackColorPalette="gray"
          iconOptions={ORDER_STATUS_ICONS}
          toggles={orderToggles}
          addNamePlaceholder={t("orderWorkflowStatuses.order.namePlaceholder", {
            defaultValue: "e.g. Waiting for approval...",
          })}
          headerActions={
            <HStack gap={2} wrap="wrap">
              <ConfigurableSettingsTranslationPanel
                channelId={channel?.id}
                kind="orderWorkflowStatusesSettings"
                source={settings}
                title={t("forms.buttons.translations", {
                  defaultValue: "Translations",
                })}
                onMutate={refreshStoreSettings}
              />
              <CopyFromChannelMenu
                options={channelOptions}
                onCopy={handleCopyFromChannel}
              />
            </HStack>
          }
        />

        <TaxonomyEditor<OrderFileStatusDefinition>
          title={t("orderWorkflowStatuses.files.title", {
            defaultValue: "File Statuses",
          })}
          description={t("orderWorkflowStatuses.files.description", {
            defaultValue:
              "Reorder, archive, and tag file states used by order files and production checks.",
          })}
          definitions={settings.fileStatuses}
          onChange={(fileStatuses) =>
            setSettings((current) => ({ ...current, fileStatuses }))
          }
          createDefinition={({ id, name, icon, colorPalette, order }) => ({
            id,
            name,
            icon,
            colorPalette,
            order,
            allowsProduction: false,
            archived: false,
            blocksActions: false,
            enabled: true,
            filesReady: false,
            isDefault: false,
            isInitial: false,
            isTerminal: false,
            readyForPreparation: false,
            readyForVerification: false,
            requiresCustomerApproval: false,
            requiresCustomerFiles: false,
            underDesign: false,
          })}
          createId={createOrderFileStatusId}
          fallbackIcon="edit_document"
          fallbackColorPalette="gray"
          iconOptions={FILE_STATUS_ICONS}
          toggles={fileToggles}
          addNamePlaceholder={t("orderWorkflowStatuses.files.namePlaceholder", {
            defaultValue: "e.g. Prepress check...",
          })}
        />
      </Stack>

      <StickyActionBar
        dirty={dirty}
        saving={isSaving || isLoading}
        onSave={handleSave}
        saveLabel={t("orderWorkflowStatuses.save", {
          defaultValue: "Save Workflow Statuses",
        })}
        summary={summary}
      />
    </Stack>
  );
}
