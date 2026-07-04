"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import {
  ColorPaletteSelect,
  ConfigurableSettingsTranslationPanel,
  CopyFromChannelMenu,
  IconSelect,
  StickyActionBar,
} from "@/components/configuration/taxonomy";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadOrderRulePresetsSettings,
  saveOrderRulePresetsSettings,
} from "@/lib/order-rule-presets-settings.client";
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  Switch,
  toaster,
} from "@konfi/components";
import {
  type OrderRulePresetDefinition,
  type OrderRulePresetsSettings,
  type SelectOption,
} from "@konfi/types";
import {
  createOrderRulePresetId,
  getEnabledOrderRulePresetDefinitions,
  getEnabledOrderWorkflowStatusDefinitions,
  getEnabledPrintingMethodDefinitions,
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusLabel,
  getPrintingMethodColorPalette,
  getPrintingMethodIcon,
  getPrintingMethodLabel,
  normalizeOrderRulePresetsSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

const PRESET_ICON_OPTIONS = [
  "filter_alt",
  "visibility",
  "pending",
  "print",
  "grain",
  "laundry",
  "manufacturing",
  "task_alt",
  "rate_review",
  "local_shipping",
  "storefront",
  "receipt",
  "receipt_long",
  "fact_check",
  "rule",
] as const;

function snapshot(settings: OrderRulePresetsSettings): string {
  return JSON.stringify(settings.presets);
}

function movePreset(
  presets: readonly OrderRulePresetDefinition[],
  presetId: string,
  direction: -1 | 1,
): OrderRulePresetDefinition[] {
  const index = presets.findIndex((preset) => preset.id === presetId);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= presets.length) {
    return [...presets];
  }

  const nextPresets = [...presets];
  const [preset] = nextPresets.splice(index, 1);
  nextPresets.splice(nextIndex, 0, preset);

  return nextPresets.map((item, order) => ({ ...item, order }));
}

function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export default function OrderRulePresetsPage() {
  const { t, i18n } = useT();
  const activeLocale = i18n.resolvedLanguage ?? i18n.language;
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const {
    orderRulePresetsSettings,
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
    refreshStoreSettings,
  } = useConfiguration();
  const [settings, setSettings] = useState<OrderRulePresetsSettings>(() =>
    normalizeOrderRulePresetsSettings(
      orderRulePresetsSettings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    ),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [newPresetName, setNewPresetName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const normalized = normalizeOrderRulePresetsSettings(
      orderRulePresetsSettings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    );
    setSettings(normalized);
    setPristine(snapshot(normalized));
  }, [
    orderRulePresetsSettings,
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
  ]);

  const statusOptions = useMemo<SelectOption[]>(
    () =>
      getEnabledOrderWorkflowStatusDefinitions(
        orderWorkflowStatusesSettings,
      ).map((status) => ({
        color: getOrderWorkflowStatusColorPalette(
          status.id,
          orderWorkflowStatusesSettings,
        ),
        label: getOrderWorkflowStatusLabel(
          status.id,
          orderWorkflowStatusesSettings,
          t,
          activeLocale,
        ),
        value: status.id,
      })),
    [activeLocale, orderWorkflowStatusesSettings, t],
  );

  const methodOptions = useMemo<SelectOption[]>(
    () =>
      getEnabledPrintingMethodDefinitions(printingMethodsSettings).map(
        (method) => ({
          color: getPrintingMethodColorPalette(
            method.id,
            printingMethodsSettings,
          ),
          label: getPrintingMethodLabel(
            method.id,
            printingMethodsSettings,
            t,
            activeLocale,
          ),
          object: {
            icon: getPrintingMethodIcon(method.id, printingMethodsSettings),
          },
          value: method.id,
        }),
      ),
    [activeLocale, printingMethodsSettings, t],
  );

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

  const updatePreset = (
    presetId: string,
    patch: Partial<OrderRulePresetDefinition>,
  ) => {
    setSettings((current) => ({
      ...current,
      presets: current.presets.map((preset) =>
        preset.id === presetId ? { ...preset, ...patch } : preset,
      ),
    }));
  };

  const handleAddPreset = () => {
    const name = newPresetName.trim();

    if (!name || statusOptions.length === 0) {
      return;
    }

    const preset: OrderRulePresetDefinition = {
      id: createOrderRulePresetId(
        name,
        settings.presets.map((item) => item.id),
      ),
      name,
      icon: "filter_alt",
      colorPalette: "gray",
      enabled: true,
      archived: false,
      isDefault: false,
      order: settings.presets.length,
      statusIds: statusOptions.slice(0, 3).map((option) => option.value),
      printingMethodIds: [],
    };

    setSettings((current) =>
      normalizeOrderRulePresetsSettings(
        { ...current, presets: [...current.presets, preset] },
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      ),
    );
    setNewPresetName("");
  };

  const handleCopyFromChannel = async (sourceChannelId: string) => {
    try {
      const sourceSettings = await loadOrderRulePresetsSettings(
        sourceChannelId,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      );
      const normalized = normalizeOrderRulePresetsSettings(
        sourceSettings,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      );
      setSettings(normalized);
      toaster.success({
        title: t("orderRulePresets.copy.loadedTitle", {
          defaultValue: "Order filter presets copied",
        }),
        description: t("orderRulePresets.copy.loadedDescription", {
          defaultValue: "Review the copied presets and save them here.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy order rule presets settings:", error);
      toaster.error({
        title: t("orderRulePresets.copy.failedTitle", {
          defaultValue: "Order filter presets were not copied",
        }),
        description: t("orderRulePresets.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      });
    }
  };

  const handleSave = async () => {
    if (!channel) {
      toaster.error({
        title: t("orderRulePresets.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("orderRulePresets.channelRequired.description", {
          defaultValue: "Select a channel before saving order filter presets.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeOrderRulePresetsSettings(
        { ...settings, updatedAt: serverTimestamp() },
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      );
      await saveOrderRulePresetsSettings(
        channel.id,
        payload,
        tenantContext,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      );
      refreshStoreSettings();
      setSettings(payload);
      setPristine(snapshot(payload));
      toaster.success({
        title: t("orderRulePresets.saved.title", {
          defaultValue: "Order filter presets saved",
        }),
        description: t("orderRulePresets.saved.description", {
          defaultValue: "The selected channel now uses these presets.",
        }),
      });
    } catch (error) {
      console.error("Failed to save order rule presets settings:", error);
      toaster.error({
        title: t("orderRulePresets.saveFailed.title", {
          defaultValue: "Order filter presets were not saved",
        }),
        description: t("orderRulePresets.saveFailed.description", {
          defaultValue: "Check the presets and try again.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const enabledPresetCount = getEnabledOrderRulePresetDefinitions(
    settings,
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
  ).length;
  const summary = t("orderRulePresets.footer", {
    count: enabledPresetCount,
    defaultValue: "{{count}} enabled presets",
  });

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("orderRulePresets.title", {
          defaultValue: "Order Filter Presets",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Stack gap={8}>
        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("orderRulePresets.add.title", {
                defaultValue: "Add Preset",
              })}
            </Card.Title>
            <Card.Description>
              {t("orderRulePresets.add.description", {
                defaultValue:
                  "Create a filter preset from the existing workflow statuses and execution methods.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <HStack align="end" gap={3} flexWrap="wrap">
              <Field
                label={t("orderRulePresets.add.name", {
                  defaultValue: "Preset name",
                })}
                maxW={{ base: "full", md: "360px" }}
                w="full"
              >
                <Input
                  value={newPresetName}
                  onChange={(event) => setNewPresetName(event.target.value)}
                  placeholder={t("orderRulePresets.add.namePlaceholder", {
                    defaultValue: "e.g. DTF queue",
                  })}
                />
              </Field>
              <Button
                colorPalette="primary"
                disabled={!newPresetName.trim() || statusOptions.length === 0}
                onClick={handleAddPreset}
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("orderRulePresets.add.button", {
                  defaultValue: "Add preset",
                })}
              </Button>
            </HStack>
          </Card.Body>
        </Card.Root>

        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <HStack justify="space-between" align="start" gap={3} wrap="wrap">
              <Stack gap={1}>
                <Card.Title>
                  {t("orderRulePresets.list.title", {
                    defaultValue: "Configured Presets",
                  })}
                </Card.Title>
                <Card.Description>
                  {t("orderRulePresets.list.description", {
                    defaultValue:
                      "Reorder, archive, and scope presets to existing workflow statuses and execution methods.",
                  })}
                </Card.Description>
              </Stack>
              <HStack gap={2} wrap="wrap">
                <ConfigurableSettingsTranslationPanel
                  channelId={channel?.id}
                  kind="orderRulePresetsSettings"
                  source={settings}
                  title={t("forms.buttons.translations", {
                    defaultValue: "Translations",
                  })}
                  onMutate={refreshStoreSettings}
                />
                <CopyFromChannelMenu
                  options={channelOptions}
                  onCopy={handleCopyFromChannel}
                  triggerLabel={t("orderRulePresets.copy.title", {
                    defaultValue: "Copy From Channel",
                  })}
                />
              </HStack>
            </HStack>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={3}>
              {settings.presets.map((preset, index) => (
                <PresetEditor
                  key={preset.id}
                  methodOptions={methodOptions}
                  onMove={(direction) =>
                    setSettings((current) => ({
                      ...current,
                      presets: movePreset(
                        current.presets,
                        preset.id,
                        direction,
                      ),
                    }))
                  }
                  onToggleMethod={(methodId) =>
                    updatePreset(preset.id, {
                      printingMethodIds: toggleValue(
                        preset.printingMethodIds,
                        methodId,
                      ),
                    })
                  }
                  onToggleStatus={(statusId) =>
                    updatePreset(preset.id, {
                      statusIds: toggleValue(preset.statusIds, statusId),
                    })
                  }
                  onUpdate={(patch) => updatePreset(preset.id, patch)}
                  preset={preset}
                  statusOptions={statusOptions}
                  t={t}
                  isFirst={index === 0}
                  isLast={index === settings.presets.length - 1}
                />
              ))}
            </VStack>
          </Card.Body>
        </Card.Root>
      </Stack>

      <StickyActionBar
        dirty={dirty}
        saving={isSaving}
        onSave={handleSave}
        saveLabel={t("orderRulePresets.save", { defaultValue: "Save presets" })}
        summary={summary}
      />
    </Stack>
  );
}

function PresetEditor({
  isFirst,
  isLast,
  methodOptions,
  onMove,
  onToggleMethod,
  onToggleStatus,
  onUpdate,
  preset,
  statusOptions,
  t,
}: {
  isFirst: boolean;
  isLast: boolean;
  methodOptions: SelectOption[];
  onMove: (direction: -1 | 1) => void;
  onToggleMethod: (methodId: string) => void;
  onToggleStatus: (statusId: string) => void;
  onUpdate: (patch: Partial<OrderRulePresetDefinition>) => void;
  preset: OrderRulePresetDefinition;
  statusOptions: SelectOption[];
  t: ReturnType<typeof useT>["t"];
}) {
  return (
    <Box
      bg={preset.archived ? "bg.subtle" : "bg.panel"}
      borderRadius="xl"
      borderWidth="1px"
      opacity={preset.archived ? 0.72 : 1}
      p={4}
    >
      <VStack align="stretch" gap={4}>
        <SimpleGrid columns={{ base: 1, xl: 12 }} gap={3} alignItems="end">
          <VStack align="start" gap={2} gridColumn={{ xl: "span 3" }}>
            <HStack gap={2} minW={0} flexWrap="wrap">
              <Badge colorPalette={preset.colorPalette} maxW="full">
                <MaterialSymbol>{preset.icon}</MaterialSymbol>
                {preset.name}
              </Badge>
              {preset.isDefault ? (
                <Badge size="sm" variant="subtle">
                  {t("orderRulePresets.default", { defaultValue: "Default" })}
                </Badge>
              ) : null}
              {preset.archived ? (
                <Badge colorPalette="orange" size="sm" variant="subtle">
                  {t("orderRulePresets.archived", {
                    defaultValue: "Archived",
                  })}
                </Badge>
              ) : null}
            </HStack>
            <Code fontSize="xs" maxW="full" overflow="hidden">
              {preset.id}
            </Code>
          </VStack>

          <Field
            label={t("orderRulePresets.fields.name", { defaultValue: "Name" })}
            gridColumn={{ xl: "span 3" }}
          >
            <Input
              value={preset.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
            />
          </Field>
          <Field
            label={t("orderRulePresets.fields.icon", { defaultValue: "Icon" })}
            gridColumn={{ xl: "span 2" }}
          >
            <IconSelect
              fallback="filter_alt"
              icons={PRESET_ICON_OPTIONS}
              value={preset.icon}
              onChange={(icon) => onUpdate({ icon })}
            />
          </Field>
          <Field
            label={t("orderRulePresets.fields.color", {
              defaultValue: "Color",
            })}
            gridColumn={{ xl: "span 2" }}
          >
            <ColorPaletteSelect
              fallback="gray"
              value={preset.colorPalette}
              onChange={(colorPalette) => onUpdate({ colorPalette })}
            />
          </Field>
          <HStack
            alignSelf="center"
            gap={2}
            gridColumn={{ xl: "span 2" }}
            justify="end"
          >
            <Switch
              checked={preset.enabled && !preset.archived}
              disabled={preset.archived}
              onCheckedChange={({ checked }) => onUpdate({ enabled: checked })}
            >
              {t("orderRulePresets.fields.enabled", {
                defaultValue: "Enabled",
              })}
            </Switch>
            <IconButton
              aria-label={t("orderRulePresets.moveUp", {
                defaultValue: "Move up",
              })}
              disabled={isFirst}
              onClick={() => onMove(-1)}
              size="sm"
              variant="outline"
            >
              <MaterialSymbol>arrow_upward</MaterialSymbol>
            </IconButton>
            <IconButton
              aria-label={t("orderRulePresets.moveDown", {
                defaultValue: "Move down",
              })}
              disabled={isLast}
              onClick={() => onMove(1)}
              size="sm"
              variant="outline"
            >
              <MaterialSymbol>arrow_downward</MaterialSymbol>
            </IconButton>
            <IconButton
              aria-label={
                preset.archived
                  ? t("orderRulePresets.restore", {
                      defaultValue: "Restore",
                    })
                  : t("orderRulePresets.archive", {
                      defaultValue: "Archive",
                    })
              }
              colorPalette={preset.archived ? "success" : "red"}
              onClick={() =>
                onUpdate({
                  archived: !preset.archived,
                  enabled: preset.archived,
                })
              }
              size="sm"
              variant="outline"
            >
              <MaterialSymbol>
                {preset.archived ? "unarchive" : "archive"}
              </MaterialSymbol>
            </IconButton>
          </HStack>
        </SimpleGrid>

        <Stack gap={2}>
          <Text color="fg.muted" fontSize="sm" fontWeight="medium">
            {t("orderRulePresets.fields.statuses", {
              defaultValue: "Statuses",
            })}
          </Text>
          <HStack gap={2} flexWrap="wrap">
            {statusOptions.map((option) => {
              const selected = preset.statusIds.includes(option.value);
              return (
                <Button
                  key={option.value}
                  colorPalette={selected ? option.color : "gray"}
                  size="sm"
                  variant={selected ? "solid" : "outline"}
                  onClick={() => onToggleStatus(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </HStack>
        </Stack>

        <Stack gap={2}>
          <Text color="fg.muted" fontSize="sm" fontWeight="medium">
            {t("orderRulePresets.fields.methods", {
              defaultValue: "Execution methods",
            })}
          </Text>
          <HStack gap={2} flexWrap="wrap">
            {methodOptions.map((option) => {
              const selected = preset.printingMethodIds.includes(option.value);
              const icon =
                typeof option.object === "object" &&
                option.object !== null &&
                "icon" in option.object &&
                typeof option.object.icon === "string"
                  ? option.object.icon
                  : null;

              return (
                <Button
                  key={option.value}
                  colorPalette={selected ? option.color : "gray"}
                  size="sm"
                  variant={selected ? "solid" : "outline"}
                  onClick={() => onToggleMethod(option.value)}
                >
                  {icon ? <MaterialSymbol>{icon}</MaterialSymbol> : null}
                  {option.label}
                </Button>
              );
            })}
          </HStack>
        </Stack>
      </VStack>
    </Box>
  );
}
