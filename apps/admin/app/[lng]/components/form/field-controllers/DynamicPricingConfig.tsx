"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  createListCollection,
  Dialog,
  Drawer,
  Field,
  HStack,
  Input,
  Portal,
  Select,
  Separator,
  Switch,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import {
  createDynamicPricingPreset,
  getDynamicPricingPresets,
} from "@konfi/firebase";
import {
  DynamicPricingAttributeRule,
  DynamicPricingCalculator,
  DynamicPricingMetric,
  DynamicPricingPreset,
  DynamicPricingTarget,
  PriceTypeEnum,
  Product,
} from "@konfi/types";
import type { DynamicPricingConfig as DynamicPricingConfigModel } from "@konfi/types";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isEqual } from "es-toolkit/compat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import useSWRImmutable from "swr/immutable";

type DynamicPricingConfigProps = {
  isProductForm?: boolean;
};

type SelectItem = {
  label: string;
  value: string;
};

type PresetDraft = {
  attributeRule?: DynamicPricingAttributeRule;
  description: string;
  globalRule?: DynamicPricingConfigModel["globalRules"][number];
  kind: DynamicPricingPreset["kind"];
  label: string;
};

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function SavePresetDialog({
  draft,
  onClose,
  onSave,
  t,
}: {
  draft: PresetDraft | null;
  onClose: () => void;
  onSave: (draft: PresetDraft) => Promise<void>;
  t: (key: string, options: string | Record<string, unknown>) => string;
}) {
  const [pendingDraft, setPendingDraft] = useState<PresetDraft | null>(draft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPendingDraft(draft);
  }, [draft]);

  return (
    <Dialog.Root
      open={Boolean(pendingDraft)}
      onOpenChange={(event) => !event.open && onClose()}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("presetDialog.title", "Save pricing preset")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap="3">
                <Field.Root required>
                  <Field.Label>{t("label", "Label")}</Field.Label>
                  <Input
                    value={pendingDraft?.label ?? ""}
                    onChange={(event) =>
                      setPendingDraft((current) =>
                        current
                          ? {
                              ...current,
                              label: event.currentTarget.value,
                            }
                          : current,
                      )
                    }
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>{t("description", "Description")}</Field.Label>
                  <Input
                    value={pendingDraft?.description ?? ""}
                    onChange={(event) =>
                      setPendingDraft((current) =>
                        current
                          ? {
                              ...current,
                              description: event.currentTarget.value,
                            }
                          : current,
                      )
                    }
                  />
                </Field.Root>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={onClose}>
                {t("cancel", "Cancel")}
              </Button>
              <Button
                colorPalette="primary"
                loading={saving}
                onClick={async () => {
                  if (!pendingDraft || pendingDraft.label.trim().length === 0) {
                    return;
                  }

                  setSaving(true);

                  try {
                    await onSave({
                      ...pendingDraft,
                      label: pendingDraft.label.trim(),
                    });
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t("savePreset", "Save preset")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function getDefaultDynamicPricingValue(): DynamicPricingConfigModel {
  return {
    attributeRules: [],
    baseDeliveryTime: 0,
    basePrice: 0,
    enabled: true,
    globalRules: [],
    inputs: [],
    linkedPresetIds: [],
  };
}

function toNumberValue(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }

  const numeric = Number(value.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function ControlledSelect({
  items,
  onValueChange,
  placeholder,
  value,
}: {
  items: SelectItem[];
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const collection = useMemo(
    () =>
      createListCollection({
        items,
      }),
    [items],
  );

  return (
    <Select.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={({ value: nextValue }) => {
        if (nextValue[0]) {
          onValueChange(nextValue[0]);
        }
      }}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

function normalizeDynamicPricingValue(
  value: Product["dynamicPricing"] | undefined,
): DynamicPricingConfigModel {
  return {
    ...getDefaultDynamicPricingValue(),
    ...value,
    attributeRules: (value?.attributeRules ?? []).map((rule) => ({
      adjustments: (rule.adjustments ?? []).map((adjustment) => ({
        deliveryTimeAdjustment: adjustment.deliveryTimeAdjustment,
        optionValue: adjustment.optionValue ?? "",
        priceAdjustment: adjustment.priceAdjustment,
      })),
      attributeId: rule.attributeId ?? "",
      mode: rule.mode ?? "ignore",
    })),
    globalRules: (value?.globalRules ?? []).map((rule) => ({
      calculator: rule.calculator ?? "fixed",
      conditions: rule.conditions,
      fixedValue: rule.fixedValue,
      id: rule.id ?? createId("rule"),
      inputId: rule.inputId,
      inverse: rule.inverse,
      label: rule.label ?? "",
      maximumMetricValue: rule.maximumMetricValue,
      maximumOutputValue: rule.maximumOutputValue,
      metric: rule.metric,
      minimumMetricValue: rule.minimumMetricValue,
      minimumOutputValue: rule.minimumOutputValue,
      multiplier: rule.multiplier,
      outputMultiplierInputId: rule.outputMultiplierInputId,
      outputMultiplierMetric: rule.outputMultiplierMetric,
      target: rule.target ?? "price",
    })),
    inputs: (value?.inputs ?? []).map((input) => ({
      id: input.id ?? createId("input"),
      label: input.label ?? "",
      unit: input.unit,
      value: input.value ?? 0,
    })),
    linkedPresetIds: value?.linkedPresetIds ?? [],
  };
}

export const DynamicPricingConfig = ({
  isProductForm = false,
}: DynamicPricingConfigProps) => {
  const { t: baseT } = useT();
  type TranslateOptions = Exclude<Parameters<typeof baseT>[1], string>;
  const { channel } = useChannels();
  const { attributes } = useConfiguration();
  const { control, setValue } = useFormContext();
  const [open, setOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);
  const [conditionPickerValues, setConditionPickerValues] = useState<
    Record<string, string>
  >({});
  const priceType = useWatch({
    control,
    name: "priceType",
  }) as Product["priceType"];
  const dynamicPricing = useWatch({
    control,
    name: "dynamicPricing",
  }) as Product["dynamicPricing"];
  const activeAttributeIds =
    (useWatch({
      control,
      name: "attributes",
    }) as Product["attributes"] | undefined) ?? [];
  const attributeOptions =
    (useWatch({
      control,
      name: "attributeOptions",
    }) as Product["attributeOptions"] | undefined) ?? {};

  const t = useCallback(
    (key: string, options: string | TranslateOptions) =>
      baseT(`admin.dynamicPricing.${key}`, {
        ...(typeof options === "string" ? { defaultValue: options } : options),
      }),
    [baseT],
  );
  const { data: presets = [], mutate: mutatePresets } = useSWRImmutable(
    channel?.id ? `dynamic-pricing-presets-${channel.id}` : null,
    () => getDynamicPricingPresets(firestore, channel?.id ?? ""),
  );

  const activeAttributes = useMemo(
    () =>
      activeAttributeIds.map((attributeId) => {
        const fullAttribute = attributes?.find((a) => a.id === attributeId);
        const optionValues: string[] =
          attributeOptions[String(attributeId)] ?? [];

        return {
          id: attributeId,
          label: fullAttribute?.name ?? attributeId,
          options: optionValues,
          optionLabels: Object.fromEntries(
            optionValues.map((value) => [
              value,
              fullAttribute?.options.find((o) => o.value === value)?.label ??
                value,
            ]),
          ) as Record<string, string>,
        };
      }),
    [activeAttributeIds, attributeOptions, attributes],
  );
  const value = normalizeDynamicPricingValue(dynamicPricing);
  const linkedPresetIds = value.linkedPresetIds ?? [];
  const linkedPresets = useMemo(
    () => presets.filter((preset) => linkedPresetIds.includes(preset.id)),
    [linkedPresetIds, presets],
  );
  const linkedAttributePresets = useMemo(
    () =>
      linkedPresets.filter(
        (
          preset,
        ): preset is DynamicPricingPreset & {
          attributeRule: DynamicPricingAttributeRule;
        } => preset.kind === "attribute" && Boolean(preset.attributeRule),
      ),
    [linkedPresets],
  );
  const linkedAttributePresetByAttributeId = useMemo(
    () =>
      new Map(
        linkedAttributePresets.map((preset) => [
          preset.attributeRule.attributeId,
          preset,
        ]),
      ),
    [linkedAttributePresets],
  );
  const linkedGlobalPresets = useMemo(
    () =>
      linkedPresets.filter(
        (
          preset,
        ): preset is DynamicPricingPreset & {
          globalRule: DynamicPricingConfigModel["globalRules"][number];
        } => preset.kind === "global" && Boolean(preset.globalRule),
      ),
    [linkedPresets],
  );
  const availablePresetItems = useMemo<SelectItem[]>(
    () =>
      presets
        .filter((preset) => !linkedPresetIds.includes(preset.id))
        .filter(
          (preset) =>
            preset.kind !== "attribute" ||
            activeAttributeIds.includes(
              preset.attributeRule?.attributeId ?? "",
            ),
        )
        .filter(
          (preset) =>
            preset.kind !== "attribute" ||
            !linkedAttributePresetByAttributeId.has(
              preset.attributeRule?.attributeId ?? "",
            ),
        )
        .map((preset) => ({
          label:
            preset.kind === "attribute" && preset.attributeRule
              ? `${preset.label} · ${preset.attributeRule.attributeId}`
              : preset.label,
          value: preset.id,
        })),
    [
      activeAttributeIds,
      linkedAttributePresetByAttributeId,
      linkedPresetIds,
      presets,
    ],
  );

  useEffect(() => {
    if (priceType !== PriceTypeEnum.DYNAMIC) {
      return;
    }

    const currentValue = normalizeDynamicPricingValue(dynamicPricing);
    const syncedAttributeRules = activeAttributes.map((attribute) => {
      const existingRule = currentValue.attributeRules.find(
        (rule) => rule.attributeId === attribute.id,
      );
      const adjustmentMap = new Map(
        existingRule?.adjustments.map((adjustment) => [
          adjustment.optionValue,
          adjustment,
        ]) ?? [],
      );

      return {
        adjustments: attribute.options.map((optionValue) => {
          const existingAdjustment = adjustmentMap.get(optionValue);

          return {
            deliveryTimeAdjustment: existingAdjustment?.deliveryTimeAdjustment,
            optionValue,
            priceAdjustment: existingAdjustment?.priceAdjustment,
          };
        }),
        attributeId: attribute.id,
        mode: existingRule?.mode ?? "ignore",
      } satisfies DynamicPricingAttributeRule;
    });

    const nextValue: DynamicPricingConfigModel = {
      ...currentValue,
      attributeRules: syncedAttributeRules,
      enabled: currentValue.enabled ?? true,
      globalRules: currentValue.globalRules,
      inputs: currentValue.inputs,
    };

    if (!isEqual(nextValue, currentValue)) {
      setValue("dynamicPricing", nextValue, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [activeAttributes, dynamicPricing, priceType, setValue]);

  const sourceItems = useMemo<SelectItem[]>(
    () => [
      {
        label: t("sources.quantity", "Quantity"),
        value: "metric:quantity",
      },
      {
        label: t("sources.volume", "Volume"),
        value: "metric:volume",
      },
      {
        label: t("sources.pageCount", "Page count"),
        value: "metric:pageCount",
      },
      {
        label: t("sources.width", "Width"),
        value: "metric:width",
      },
      {
        label: t("sources.height", "Height"),
        value: "metric:height",
      },
      {
        label: t("sources.area", "Area"),
        value: "metric:area",
      },
      {
        label: t("sources.perimeter", "Perimeter"),
        value: "metric:perimeter",
      },
      {
        label: t("sources.itemsPerSheet", "Items per sheet"),
        value: "metric:itemsPerSheet",
      },
      {
        label: t("sources.sheetsNeeded", "Sheets needed"),
        value: "metric:sheetsNeeded",
      },
      {
        label: t("sources.innerSheetsPerUnit", "Inner sheets per unit"),
        value: "metric:innerSheetsPerUnit",
      },
      {
        label: t("sources.coverSheetsPerUnit", "Cover sheets per unit"),
        value: "metric:coverSheetsPerUnit",
      },
      {
        label: t("sources.totalSheetsPerUnit", "Total sheets per unit"),
        value: "metric:totalSheetsPerUnit",
      },
      {
        label: t("sources.innerSheetVolume", "Inner sheet volume"),
        value: "metric:innerSheetVolume",
      },
      {
        label: t("sources.coverSheetVolume", "Cover sheet volume"),
        value: "metric:coverSheetVolume",
      },
      {
        label: t("sources.totalSheetVolume", "Total sheet volume"),
        value: "metric:totalSheetVolume",
      },
      ...(value.inputs ?? []).map((input) => ({
        label: input.label,
        value: `input:${input.id}`,
      })),
    ],
    [t, value.inputs],
  );

  const calculatorItems = useMemo<SelectItem[]>(
    () => [
      { label: t("calculator.fixed", "Fixed amount"), value: "fixed" },
      {
        label: t("calculator.multiplier", "Source multiplier"),
        value: "multiplier",
      },
      {
        label: t("calculator.range", "Min / max interpolation"),
        value: "range",
      },
      {
        label: t("calculator.tier", "Metric tier"),
        value: "tier",
      },
    ],
    [t],
  );
  const targetItems = useMemo<SelectItem[]>(
    () => [
      { label: t("target.price", "Price"), value: "price" },
      {
        label: t("target.deliveryTime", "Delivery time"),
        value: "deliveryTime",
      },
    ],
    [t],
  );
  const attributeModeItems = useMemo<SelectItem[]>(
    () => [
      {
        label: t("attributeMode.ignore", "Ignore in pricing"),
        value: "ignore",
      },
      {
        label: t("attributeMode.adjust", "Option adjustments"),
        value: "adjust",
      },
    ],
    [t],
  );

  const updateDynamicPricing = useCallback(
    (nextValue: DynamicPricingConfigModel) => {
      setValue("dynamicPricing", nextValue, {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [setValue],
  );
  const unlinkPreset = useCallback(
    (presetId: string) => {
      updateDynamicPricing({
        ...value,
        linkedPresetIds: linkedPresetIds.filter(
          (candidate) => candidate !== presetId,
        ),
      });
    },
    [linkedPresetIds, updateDynamicPricing, value],
  );
  const detachPreset = useCallback(
    (preset: DynamicPricingPreset) => {
      if (preset.kind === "attribute" && preset.attributeRule) {
        updateDynamicPricing({
          ...value,
          attributeRules: value.attributeRules.map((rule) =>
            rule.attributeId === preset.attributeRule?.attributeId
              ? preset.attributeRule
              : rule,
          ),
          linkedPresetIds: linkedPresetIds.filter(
            (candidate) => candidate !== preset.id,
          ),
        });
        return;
      }

      if (preset.kind === "global" && preset.globalRule) {
        updateDynamicPricing({
          ...value,
          globalRules: value.globalRules.some(
            (rule) => rule.id === preset.globalRule?.id,
          )
            ? value.globalRules
            : [...value.globalRules, preset.globalRule],
          linkedPresetIds: linkedPresetIds.filter(
            (candidate) => candidate !== preset.id,
          ),
        });
      }
    },
    [linkedPresetIds, updateDynamicPricing, value],
  );
  const savePreset = useCallback(
    async (draft: PresetDraft) => {
      if (!channel?.id) {
        toaster.error({
          title: t("presetToasts.missingChannel", "Channel is required"),
        });
        return;
      }

      const preset: DynamicPricingPreset = {
        attributeRule: draft.attributeRule,
        description: draft.description.trim() || undefined,
        globalRule: draft.globalRule,
        id: createId("preset"),
        kind: draft.kind,
        label: draft.label,
      };
      const created = await createDynamicPricingPreset(
        firestore,
        channel.id,
        preset,
      );

      if (!created) {
        toaster.error({
          title: t("presetToasts.createFailed", "Failed to save preset"),
        });
        return;
      }

      await mutatePresets();
      toaster.success({
        title: t("presetToasts.created", "Preset saved"),
      });
    },
    [channel?.id, mutatePresets, t],
  );
  const linkSelectedPreset = useCallback(() => {
    if (!selectedPresetId) {
      return;
    }

    updateDynamicPricing({
      ...value,
      linkedPresetIds: [...linkedPresetIds, selectedPresetId],
    });
    setSelectedPresetId("");
  }, [linkedPresetIds, selectedPresetId, updateDynamicPricing, value]);
  const describePreset = useCallback(
    (preset: DynamicPricingPreset) => {
      if (preset.kind === "attribute" && preset.attributeRule) {
        return t("presetDescription.attribute", {
          attributeId: preset.attributeRule.attributeId,
          defaultValue: "Attribute preset for {{attributeId}}",
        });
      }

      if (preset.kind === "global" && preset.globalRule) {
        return t("presetDescription.global", {
          calculator: preset.globalRule.calculator,
          metric:
            preset.globalRule.metric ?? preset.globalRule.inputId ?? "fixed",
          target: preset.globalRule.target,
          defaultValue: "{{target}} · {{calculator}} · {{metric}}",
        });
      }

      return "";
    },
    [t],
  );

  if (!isProductForm || priceType !== PriceTypeEnum.DYNAMIC) {
    return null;
  }

  return (
    <Box>
      <VStack
        align="stretch"
        gap="3"
        p="4"
        borderWidth="1px"
        borderRadius="2xl"
      >
        <HStack justify="space-between" align="start">
          <Box>
            <Text fontWeight="semibold">{t("title", "Dynamic pricing")}</Text>
            <Text fontSize="sm" color={{ base: "gray.600", _dark: "gray.400" }}>
              {t(
                "summary",
                "Server-side dynamic pricing uses the selected attributes, volume, page count, and optional custom inputs to generate product prices and delivery times.",
              )}
            </Text>
          </Box>
          <Badge colorPalette="primary">{t("serverOnly", "Server-only")}</Badge>
        </HStack>
        <HStack wrap="wrap" gap="2">
          <Badge variant="subtle">
            {t("basePriceBadge", {
              defaultValue: "Base price: {{value}}",
              value: value.basePrice ?? 0,
            })}
          </Badge>
          <Badge variant="subtle">
            {t("globalRulesBadge", {
              defaultValue: "Global rules: {{count}}",
              count: value.globalRules.length,
            })}
          </Badge>
          <Badge variant="subtle">
            {t("attributeRulesBadge", {
              defaultValue: "Attribute rules: {{count}}",
              count: value.attributeRules.length,
            })}
          </Badge>
        </HStack>
        <Button
          alignSelf="start"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <MaterialSymbol>tune</MaterialSymbol>
          {t("configure", "Configure dynamic pricing")}
        </Button>
      </VStack>

      <Drawer.Root
        open={open}
        onOpenChange={(event) => setOpen(event.open)}
        size="xl"
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header>
                <Drawer.Title>
                  {t("drawerTitle", "Dynamic pricing")}
                </Drawer.Title>
              </Drawer.Header>
              <Drawer.Body>
                <Tabs.Root defaultValue="overview">
                  <Tabs.List mb="4">
                    <Tabs.Trigger value="overview">
                      {t("tabs.overview", "Overview")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="rules">
                      {t("tabs.rules", "Inputs & rules")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="attributes">
                      {t("tabs.attributes", "Attributes")}
                    </Tabs.Trigger>
                    <Tabs.Indicator />
                  </Tabs.List>

                  <Tabs.Content value="overview">
                    <VStack align="stretch" gap="4">
                      <Field.Root>
                        <Switch.Root
                          checked={value.enabled}
                          onCheckedChange={({ checked }) =>
                            updateDynamicPricing({
                              ...value,
                              enabled: checked,
                            })
                          }
                        >
                          <Switch.HiddenInput />
                          <Switch.Control />
                          <Switch.Label>
                            {t("enabled", "Enable dynamic pricing")}
                          </Switch.Label>
                        </Switch.Root>
                      </Field.Root>
                      <HStack align="start" gap="4">
                        <Field.Root required flex="1">
                          <Field.Label>
                            {t("basePrice", "Base price")}
                          </Field.Label>
                          <Input
                            type="number"
                            value={value.basePrice ?? 0}
                            onChange={(event) =>
                              updateDynamicPricing({
                                ...value,
                                basePrice:
                                  toNumberValue(event.currentTarget.value) ?? 0,
                              })
                            }
                          />
                        </Field.Root>
                        <Field.Root flex="1">
                          <Field.Label>
                            {t("baseDeliveryTime", "Base delivery time")}
                          </Field.Label>
                          <Input
                            type="number"
                            value={value.baseDeliveryTime ?? 0}
                            onChange={(event) =>
                              updateDynamicPricing({
                                ...value,
                                baseDeliveryTime:
                                  toNumberValue(event.currentTarget.value) ?? 0,
                              })
                            }
                          />
                        </Field.Root>
                      </HStack>
                      <Box
                        p="4"
                        borderRadius="xl"
                        bg={{ base: "gray.50", _dark: "gray.900" }}
                      >
                        <Text fontSize="sm">
                          {t(
                            "listingInfo",
                            "Listings use the first valid attribute combination, the product default order, and the minimum configured page count as the baseline. Discounts are still applied after the dynamic rule output is resolved.",
                          )}
                        </Text>
                      </Box>
                    </VStack>
                  </Tabs.Content>

                  <Tabs.Content value="rules">
                    <VStack align="stretch" gap="5">
                      <VStack align="stretch" gap="3">
                        <HStack justify="space-between" align="start">
                          <Box>
                            <Text fontWeight="medium">
                              {t("presets", "Preset library")}
                            </Text>
                            <Text
                              fontSize="sm"
                              color={{ base: "gray.600", _dark: "gray.400" }}
                            >
                              {t(
                                "presetsHelper",
                                "Save reusable rules once, then link them across products.",
                              )}
                            </Text>
                          </Box>
                          <Badge variant="subtle">
                            {t("linkedPresetsBadge", {
                              count: linkedPresetIds.length,
                              defaultValue: "Linked presets: {{count}}",
                            })}
                          </Badge>
                        </HStack>

                        <HStack align="end" gap="3">
                          <Field.Root flex="1">
                            <Field.Label>
                              {t("linkPresetLabel", "Link existing preset")}
                            </Field.Label>
                            <ControlledSelect
                              items={availablePresetItems}
                              placeholder={t(
                                "linkPresetPlaceholder",
                                "Select preset",
                              )}
                              value={selectedPresetId}
                              onValueChange={setSelectedPresetId}
                            />
                          </Field.Root>
                          <Button
                            variant="outline"
                            onClick={linkSelectedPreset}
                            disabled={!selectedPresetId}
                          >
                            <MaterialSymbol>link</MaterialSymbol>
                            {t("linkPreset", "Link preset")}
                          </Button>
                        </HStack>

                        {linkedGlobalPresets.length > 0 ? (
                          <VStack align="stretch" gap="2">
                            <Text fontSize="sm" fontWeight="medium">
                              {t(
                                "linkedGlobalPresets",
                                "Linked global presets",
                              )}
                            </Text>
                            {linkedGlobalPresets.map((preset) => (
                              <Box
                                key={preset.id}
                                p="3"
                                borderWidth="1px"
                                borderRadius="xl"
                              >
                                <HStack justify="space-between" align="start">
                                  <Box>
                                    <HStack>
                                      <Text fontWeight="medium">
                                        {preset.label}
                                      </Text>
                                      <Badge variant="outline">
                                        {t("presetKind.global", "Global")}
                                      </Badge>
                                    </HStack>
                                    <Text
                                      fontSize="sm"
                                      color={{
                                        base: "gray.600",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      {preset.description ||
                                        describePreset(preset)}
                                    </Text>
                                  </Box>
                                  <HStack>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => detachPreset(preset)}
                                    >
                                      {t("detachPreset", "Detach")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => unlinkPreset(preset.id)}
                                    >
                                      <MaterialSymbol>link_off</MaterialSymbol>
                                    </Button>
                                  </HStack>
                                </HStack>
                              </Box>
                            ))}
                          </VStack>
                        ) : null}
                      </VStack>

                      <Separator />

                      <HStack justify="space-between">
                        <Text fontWeight="medium">
                          {t("inputs", "Custom inputs")}
                        </Text>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateDynamicPricing({
                              ...value,
                              inputs: [
                                ...(value.inputs ?? []),
                                {
                                  id: createId("input"),
                                  label: t("newInput", "New input"),
                                  value: 0,
                                },
                              ],
                            })
                          }
                        >
                          <MaterialSymbol>add</MaterialSymbol>
                          {t("addInput", "Add input")}
                        </Button>
                      </HStack>
                      {(value.inputs ?? []).map((input, index) => (
                        <Box
                          key={input.id}
                          p="3"
                          borderWidth="1px"
                          borderRadius="xl"
                        >
                          <HStack justify="space-between" align="start">
                            <HStack flex="1" align="start" gap="3">
                              <Field.Root flex="1">
                                <Field.Label>{t("label", "Label")}</Field.Label>
                                <Input
                                  value={input.label}
                                  onChange={(event) => {
                                    const nextInputs = [
                                      ...(value.inputs ?? []),
                                    ];
                                    nextInputs[index] = {
                                      ...input,
                                      label: event.currentTarget.value,
                                    };
                                    updateDynamicPricing({
                                      ...value,
                                      inputs: nextInputs,
                                    });
                                  }}
                                />
                              </Field.Root>
                              <Field.Root flex="1">
                                <Field.Label>{t("value", "Value")}</Field.Label>
                                <Input
                                  type="number"
                                  value={input.value}
                                  onChange={(event) => {
                                    const nextInputs = [
                                      ...(value.inputs ?? []),
                                    ];
                                    nextInputs[index] = {
                                      ...input,
                                      value:
                                        toNumberValue(
                                          event.currentTarget.value,
                                        ) ?? 0,
                                    };
                                    updateDynamicPricing({
                                      ...value,
                                      inputs: nextInputs,
                                    });
                                  }}
                                />
                              </Field.Root>
                              <Field.Root flex="1">
                                <Field.Label>{t("unit", "Unit")}</Field.Label>
                                <Input
                                  value={input.unit ?? ""}
                                  onChange={(event) => {
                                    const nextInputs = [
                                      ...(value.inputs ?? []),
                                    ];
                                    nextInputs[index] = {
                                      ...input,
                                      unit: event.currentTarget.value,
                                    };
                                    updateDynamicPricing({
                                      ...value,
                                      inputs: nextInputs,
                                    });
                                  }}
                                />
                              </Field.Root>
                            </HStack>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateDynamicPricing({
                                  ...value,
                                  inputs: (value.inputs ?? []).filter(
                                    (candidate) => candidate.id !== input.id,
                                  ),
                                })
                              }
                            >
                              <MaterialSymbol>delete</MaterialSymbol>
                            </Button>
                          </HStack>
                        </Box>
                      ))}

                      <Separator />

                      <HStack justify="space-between">
                        <Text fontWeight="medium">
                          {t("globalRules", "Global rules")}
                        </Text>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateDynamicPricing({
                              ...value,
                              globalRules: [
                                ...value.globalRules,
                                {
                                  calculator: "fixed",
                                  id: createId("rule"),
                                  label: t("newRule", "New rule"),
                                  target: "price",
                                },
                              ],
                            })
                          }
                        >
                          <MaterialSymbol>add</MaterialSymbol>
                          {t("addRule", "Add rule")}
                        </Button>
                      </HStack>

                      {value.globalRules.map((rule, index) => {
                        const selectedSource = rule.inputId
                          ? `input:${rule.inputId}`
                          : `metric:${rule.metric ?? "quantity"}`;

                        return (
                          <Box
                            key={rule.id}
                            p="3"
                            borderWidth="1px"
                            borderRadius="xl"
                          >
                            <VStack align="stretch" gap="3">
                              <HStack justify="space-between" align="start">
                                <Field.Root flex="1">
                                  <Field.Label>
                                    {t("label", "Label")}
                                  </Field.Label>
                                  <Input
                                    value={rule.label}
                                    onChange={(event) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        label: event.currentTarget.value,
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                    }}
                                  />
                                </Field.Root>
                                <HStack>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setPresetDraft({
                                        description: "",
                                        globalRule: rule,
                                        kind: "global",
                                        label:
                                          rule.label ||
                                          t("newRule", "New rule"),
                                      })
                                    }
                                  >
                                    <MaterialSymbol>bookmarks</MaterialSymbol>
                                    {t("saveAsPreset", "Save as preset")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: value.globalRules.filter(
                                          (candidate) =>
                                            candidate.id !== rule.id,
                                        ),
                                      })
                                    }
                                  >
                                    <MaterialSymbol>delete</MaterialSymbol>
                                  </Button>
                                </HStack>
                              </HStack>
                              <HStack align="start" gap="3">
                                <Field.Root flex="1">
                                  <Field.Label>
                                    {t("targetLabel", "Target")}
                                  </Field.Label>
                                  <ControlledSelect
                                    items={targetItems}
                                    placeholder={t(
                                      "targetPlaceholder",
                                      "Select target",
                                    )}
                                    value={rule.target}
                                    onValueChange={(nextValue) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        target:
                                          nextValue as DynamicPricingTarget,
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                    }}
                                  />
                                </Field.Root>
                                <Field.Root flex="1">
                                  <Field.Label>
                                    {t("calculatorLabel", "Calculator")}
                                  </Field.Label>
                                  <ControlledSelect
                                    items={calculatorItems}
                                    placeholder={t(
                                      "calculatorPlaceholder",
                                      "Select calculator",
                                    )}
                                    value={rule.calculator}
                                    onValueChange={(nextValue) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        calculator:
                                          nextValue as DynamicPricingCalculator,
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                    }}
                                  />
                                </Field.Root>
                                {rule.calculator !== "fixed" ? (
                                  <Field.Root flex="1">
                                    <Field.Label>
                                      {t("sourceLabel", "Source")}
                                    </Field.Label>
                                    <ControlledSelect
                                      items={sourceItems}
                                      placeholder={t(
                                        "sourcePlaceholder",
                                        "Select source",
                                      )}
                                      value={selectedSource}
                                      onValueChange={(nextValue) => {
                                        const nextRules = [
                                          ...value.globalRules,
                                        ];
                                        nextRules[index] = nextValue.startsWith(
                                          "input:",
                                        )
                                          ? {
                                              ...rule,
                                              inputId: nextValue.replace(
                                                "input:",
                                                "",
                                              ),
                                              metric: undefined,
                                            }
                                          : {
                                              ...rule,
                                              inputId: undefined,
                                              metric: nextValue.replace(
                                                "metric:",
                                                "",
                                              ) as DynamicPricingMetric,
                                            };
                                        updateDynamicPricing({
                                          ...value,
                                          globalRules: nextRules,
                                        });
                                      }}
                                    />
                                  </Field.Root>
                                ) : null}
                              </HStack>
                              {rule.calculator === "fixed" ? (
                                <Field.Root>
                                  <Field.Label>
                                    {t("amount", "Amount")}
                                  </Field.Label>
                                  <Input
                                    type="number"
                                    value={rule.fixedValue ?? 0}
                                    onChange={(event) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        fixedValue:
                                          toNumberValue(
                                            event.currentTarget.value,
                                          ) ?? 0,
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                    }}
                                  />
                                </Field.Root>
                              ) : rule.calculator === "multiplier" ? (
                                <Field.Root>
                                  <Field.Label>
                                    {t("multiplier", "Multiplier")}
                                  </Field.Label>
                                  <Input
                                    type="number"
                                    value={rule.multiplier ?? 0}
                                    onChange={(event) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        multiplier:
                                          toNumberValue(
                                            event.currentTarget.value,
                                          ) ?? 0,
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                    }}
                                  />
                                </Field.Root>
                              ) : (
                                <VStack align="stretch" gap="3">
                                  <HStack align="start" gap="3">
                                    <Field.Root flex="1">
                                      <Field.Label>
                                        {t("minimumInput", "Minimum input")}
                                      </Field.Label>
                                      <Input
                                        type="number"
                                        value={rule.minimumMetricValue ?? 0}
                                        onChange={(event) => {
                                          const nextRules = [
                                            ...value.globalRules,
                                          ];
                                          nextRules[index] = {
                                            ...rule,
                                            minimumMetricValue:
                                              toNumberValue(
                                                event.currentTarget.value,
                                              ) ?? 0,
                                          };
                                          updateDynamicPricing({
                                            ...value,
                                            globalRules: nextRules,
                                          });
                                        }}
                                      />
                                    </Field.Root>
                                    <Field.Root flex="1">
                                      <Field.Label>
                                        {t("maximumInput", "Maximum input")}
                                      </Field.Label>
                                      <Input
                                        type="number"
                                        value={rule.maximumMetricValue ?? 0}
                                        onChange={(event) => {
                                          const nextRules = [
                                            ...value.globalRules,
                                          ];
                                          nextRules[index] = {
                                            ...rule,
                                            maximumMetricValue:
                                              toNumberValue(
                                                event.currentTarget.value,
                                              ) ?? 0,
                                          };
                                          updateDynamicPricing({
                                            ...value,
                                            globalRules: nextRules,
                                          });
                                        }}
                                      />
                                    </Field.Root>
                                  </HStack>
                                  <HStack align="start" gap="3">
                                    <Field.Root flex="1">
                                      <Field.Label>
                                        {t("minimumOutput", "Minimum output")}
                                      </Field.Label>
                                      <Input
                                        type="number"
                                        value={rule.minimumOutputValue ?? 0}
                                        onChange={(event) => {
                                          const nextRules = [
                                            ...value.globalRules,
                                          ];
                                          nextRules[index] = {
                                            ...rule,
                                            minimumOutputValue:
                                              toNumberValue(
                                                event.currentTarget.value,
                                              ) ?? 0,
                                          };
                                          updateDynamicPricing({
                                            ...value,
                                            globalRules: nextRules,
                                          });
                                        }}
                                      />
                                    </Field.Root>
                                    <Field.Root flex="1">
                                      <Field.Label>
                                        {t("maximumOutput", "Maximum output")}
                                      </Field.Label>
                                      <Input
                                        type="number"
                                        value={rule.maximumOutputValue ?? 0}
                                        onChange={(event) => {
                                          const nextRules = [
                                            ...value.globalRules,
                                          ];
                                          nextRules[index] = {
                                            ...rule,
                                            maximumOutputValue:
                                              toNumberValue(
                                                event.currentTarget.value,
                                              ) ?? 0,
                                          };
                                          updateDynamicPricing({
                                            ...value,
                                            globalRules: nextRules,
                                          });
                                        }}
                                      />
                                    </Field.Root>
                                  </HStack>
                                  <Field.Root>
                                    <Switch.Root
                                      checked={rule.inverse ?? false}
                                      onCheckedChange={({ checked }) => {
                                        const nextRules = [
                                          ...value.globalRules,
                                        ];
                                        nextRules[index] = {
                                          ...rule,
                                          inverse: checked,
                                        };
                                        updateDynamicPricing({
                                          ...value,
                                          globalRules: nextRules,
                                        });
                                      }}
                                    >
                                      <Switch.HiddenInput />
                                      <Switch.Control />
                                      <Switch.Label>
                                        {t(
                                          "inverseRange",
                                          "Invert the range so smaller source values produce larger outputs",
                                        )}
                                      </Switch.Label>
                                    </Switch.Root>
                                  </Field.Root>
                                </VStack>
                              )}
                              <Separator />
                              <Box>
                                <HStack justify="space-between" mb="2">
                                  <Text fontSize="sm" fontWeight="medium">
                                    {t("conditions", "Conditions")}
                                  </Text>
                                </HStack>
                                {(rule.conditions ?? []).length === 0 ? (
                                  <Text
                                    fontSize="xs"
                                    color={{
                                      base: "gray.500",
                                      _dark: "gray.500",
                                    }}
                                  >
                                    {t(
                                      "noConditions",
                                      "No conditions — rule applies to all attribute combinations",
                                    )}
                                  </Text>
                                ) : (
                                  <VStack align="stretch" gap="2" mb="2">
                                    {(rule.conditions ?? []).map(
                                      (condition, condIndex) => {
                                        const condAttribute =
                                          activeAttributes.find(
                                            (a) =>
                                              a.id === condition.attributeId,
                                          );

                                        return (
                                          <Box
                                            key={condition.attributeId}
                                            p="2"
                                            borderWidth="1px"
                                            borderRadius="lg"
                                          >
                                            <HStack
                                              justify="space-between"
                                              mb="2"
                                            >
                                              <Text
                                                fontSize="sm"
                                                fontWeight="medium"
                                              >
                                                {condAttribute?.label ??
                                                  condition.attributeId}
                                              </Text>
                                              <Button
                                                size="xs"
                                                variant="ghost"
                                                onClick={() => {
                                                  const nextRules = [
                                                    ...value.globalRules,
                                                  ];
                                                  nextRules[index] = {
                                                    ...rule,
                                                    conditions: (
                                                      rule.conditions ?? []
                                                    ).filter(
                                                      (_, i) => i !== condIndex,
                                                    ),
                                                  };
                                                  updateDynamicPricing({
                                                    ...value,
                                                    globalRules: nextRules,
                                                  });
                                                }}
                                              >
                                                <MaterialSymbol>
                                                  close
                                                </MaterialSymbol>
                                              </Button>
                                            </HStack>
                                            <HStack wrap="wrap" gap="1">
                                              {(
                                                condAttribute?.options ??
                                                condition.optionValues
                                              ).map((optionValue) => {
                                                const checked =
                                                  condition.optionValues.includes(
                                                    optionValue,
                                                  );
                                                const optionLabel =
                                                  condAttribute?.optionLabels[
                                                    optionValue
                                                  ] ?? optionValue;
                                                const displayLabel =
                                                  optionLabel !== optionValue
                                                    ? `${optionLabel} (${optionValue})`
                                                    : optionValue;

                                                return (
                                                  <Badge
                                                    key={optionValue}
                                                    variant={
                                                      checked
                                                        ? "solid"
                                                        : "outline"
                                                    }
                                                    colorPalette={
                                                      checked
                                                        ? "primary"
                                                        : "gray"
                                                    }
                                                    cursor="pointer"
                                                    onClick={() => {
                                                      const nextRules = [
                                                        ...value.globalRules,
                                                      ];
                                                      const nextOptionValues =
                                                        checked
                                                          ? condition.optionValues.filter(
                                                              (v) =>
                                                                v !==
                                                                optionValue,
                                                            )
                                                          : [
                                                              ...condition.optionValues,
                                                              optionValue,
                                                            ];
                                                      const nextConditions = [
                                                        ...(rule.conditions ??
                                                          []),
                                                      ];
                                                      nextConditions[
                                                        condIndex
                                                      ] = {
                                                        ...condition,
                                                        optionValues:
                                                          nextOptionValues,
                                                      };
                                                      nextRules[index] = {
                                                        ...rule,
                                                        conditions:
                                                          nextConditions,
                                                      };
                                                      updateDynamicPricing({
                                                        ...value,
                                                        globalRules: nextRules,
                                                      });
                                                    }}
                                                  >
                                                    {displayLabel}
                                                  </Badge>
                                                );
                                              })}
                                            </HStack>
                                          </Box>
                                        );
                                      },
                                    )}
                                  </VStack>
                                )}
                                {activeAttributes.filter(
                                  (a) =>
                                    !(rule.conditions ?? []).some(
                                      (c) => c.attributeId === a.id,
                                    ),
                                ).length > 0 && (
                                  <ControlledSelect
                                    items={activeAttributes
                                      .filter(
                                        (a) =>
                                          !(rule.conditions ?? []).some(
                                            (c) => c.attributeId === a.id,
                                          ),
                                      )
                                      .map((a) => ({
                                        label: a.label,
                                        value: a.id,
                                      }))}
                                    placeholder={t(
                                      "addConditionPlaceholder",
                                      "Add attribute condition…",
                                    )}
                                    value={conditionPickerValues[rule.id] ?? ""}
                                    onValueChange={(attrId) => {
                                      const nextRules = [...value.globalRules];
                                      nextRules[index] = {
                                        ...rule,
                                        conditions: [
                                          ...(rule.conditions ?? []),
                                          {
                                            attributeId: attrId,
                                            optionValues: [],
                                          },
                                        ],
                                      };
                                      updateDynamicPricing({
                                        ...value,
                                        globalRules: nextRules,
                                      });
                                      setConditionPickerValues((prev) => ({
                                        ...prev,
                                        [rule.id]: "",
                                      }));
                                    }}
                                  />
                                )}
                              </Box>
                            </VStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  </Tabs.Content>

                  <Tabs.Content value="attributes">
                    <VStack align="stretch" gap="4">
                      {activeAttributes.length === 0 ? (
                        <Text color={{ base: "gray.600", _dark: "gray.400" }}>
                          {t(
                            "noAttributes",
                            "Select product attributes first to configure per-option dynamic pricing adjustments.",
                          )}
                        </Text>
                      ) : (
                        activeAttributes.map((attribute) => {
                          const rule = value.attributeRules.find(
                            (entry) => entry.attributeId === attribute.id,
                          );
                          const linkedPreset =
                            linkedAttributePresetByAttributeId.get(
                              attribute.id,
                            );
                          const linkedRule = linkedPreset?.attributeRule;

                          return (
                            <Box
                              key={attribute.id}
                              p="3"
                              borderWidth="1px"
                              borderRadius="xl"
                            >
                              <VStack align="stretch" gap="3">
                                <HStack justify="space-between" align="start">
                                  <Box>
                                    <HStack>
                                      <Text fontWeight="medium">
                                        {attribute.label}
                                      </Text>
                                      {linkedPreset ? (
                                        <Badge variant="outline">
                                          {t("linkedPreset", "Linked preset")}
                                        </Badge>
                                      ) : null}
                                    </HStack>
                                    <Text
                                      fontSize="sm"
                                      color={{
                                        base: "gray.600",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      {linkedPreset?.label
                                        ? `${attribute.id} · ${linkedPreset.label}`
                                        : attribute.id}
                                    </Text>
                                  </Box>
                                  {linkedPreset ? (
                                    <HStack>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          detachPreset(linkedPreset)
                                        }
                                      >
                                        {t("customizePreset", "Customize")}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          unlinkPreset(linkedPreset.id)
                                        }
                                      >
                                        <MaterialSymbol>
                                          link_off
                                        </MaterialSymbol>
                                      </Button>
                                    </HStack>
                                  ) : (
                                    <Box minW="240px">
                                      <ControlledSelect
                                        items={attributeModeItems}
                                        placeholder={t(
                                          "attributeModePlaceholder",
                                          "Select pricing mode",
                                        )}
                                        value={rule?.mode ?? "ignore"}
                                        onValueChange={(nextValue) => {
                                          updateDynamicPricing({
                                            ...value,
                                            attributeRules:
                                              value.attributeRules.map(
                                                (entry) =>
                                                  entry.attributeId ===
                                                  attribute.id
                                                    ? {
                                                        ...entry,
                                                        mode: nextValue as DynamicPricingAttributeRule["mode"],
                                                      }
                                                    : entry,
                                              ),
                                          });
                                        }}
                                      />
                                    </Box>
                                  )}
                                </HStack>

                                {linkedRule?.mode === "adjust" ? (
                                  <VStack align="stretch" gap="2">
                                    {linkedRule.adjustments.map(
                                      (adjustment) => (
                                        <HStack
                                          key={adjustment.optionValue}
                                          align="start"
                                          gap="3"
                                        >
                                          <Field.Root flex="1">
                                            <Field.Label>
                                              {adjustment.optionValue}
                                            </Field.Label>
                                            <Input
                                              value={adjustment.optionValue}
                                              disabled
                                            />
                                          </Field.Root>
                                          <Field.Root flex="1">
                                            <Field.Label>
                                              {t(
                                                "optionPriceAdjustment",
                                                "Price adjustment",
                                              )}
                                            </Field.Label>
                                            <Input
                                              type="number"
                                              value={
                                                adjustment.priceAdjustment ?? 0
                                              }
                                              disabled
                                            />
                                          </Field.Root>
                                          <Field.Root flex="1">
                                            <Field.Label>
                                              {t(
                                                "optionDeliveryAdjustment",
                                                "Delivery time adjustment",
                                              )}
                                            </Field.Label>
                                            <Input
                                              type="number"
                                              value={
                                                adjustment.deliveryTimeAdjustment ??
                                                0
                                              }
                                              disabled
                                            />
                                          </Field.Root>
                                        </HStack>
                                      ),
                                    )}
                                  </VStack>
                                ) : rule?.mode === "adjust" ? (
                                  <VStack align="stretch" gap="2">
                                    <HStack justify="end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setPresetDraft({
                                            attributeRule: rule,
                                            description: "",
                                            kind: "attribute",
                                            label: attribute.label,
                                          })
                                        }
                                      >
                                        <MaterialSymbol>
                                          bookmarks
                                        </MaterialSymbol>
                                        {t("saveAsPreset", "Save as preset")}
                                      </Button>
                                    </HStack>
                                    {rule.adjustments.map((adjustment) => (
                                      <HStack
                                        key={adjustment.optionValue}
                                        align="start"
                                        gap="3"
                                      >
                                        <Field.Root flex="1">
                                          <Field.Label>
                                            {adjustment.optionValue}
                                          </Field.Label>
                                          <Input
                                            value={adjustment.optionValue}
                                            disabled
                                          />
                                        </Field.Root>
                                        <Field.Root flex="1">
                                          <Field.Label>
                                            {t(
                                              "optionPriceAdjustment",
                                              "Price adjustment",
                                            )}
                                          </Field.Label>
                                          <Input
                                            type="number"
                                            value={
                                              adjustment.priceAdjustment ?? 0
                                            }
                                            onChange={(event) =>
                                              updateDynamicPricing({
                                                ...value,
                                                attributeRules:
                                                  value.attributeRules.map(
                                                    (entry) =>
                                                      entry.attributeId ===
                                                      attribute.id
                                                        ? {
                                                            ...entry,
                                                            adjustments:
                                                              entry.adjustments.map(
                                                                (candidate) =>
                                                                  candidate.optionValue ===
                                                                  adjustment.optionValue
                                                                    ? {
                                                                        ...candidate,
                                                                        priceAdjustment:
                                                                          toNumberValue(
                                                                            event
                                                                              .currentTarget
                                                                              .value,
                                                                          ) ??
                                                                          0,
                                                                      }
                                                                    : candidate,
                                                              ),
                                                          }
                                                        : entry,
                                                  ),
                                              })
                                            }
                                          />
                                        </Field.Root>
                                        <Field.Root flex="1">
                                          <Field.Label>
                                            {t(
                                              "optionDeliveryAdjustment",
                                              "Delivery time adjustment",
                                            )}
                                          </Field.Label>
                                          <Input
                                            type="number"
                                            value={
                                              adjustment.deliveryTimeAdjustment ??
                                              0
                                            }
                                            onChange={(event) =>
                                              updateDynamicPricing({
                                                ...value,
                                                attributeRules:
                                                  value.attributeRules.map(
                                                    (entry) =>
                                                      entry.attributeId ===
                                                      attribute.id
                                                        ? {
                                                            ...entry,
                                                            adjustments:
                                                              entry.adjustments.map(
                                                                (candidate) =>
                                                                  candidate.optionValue ===
                                                                  adjustment.optionValue
                                                                    ? {
                                                                        ...candidate,
                                                                        deliveryTimeAdjustment:
                                                                          toNumberValue(
                                                                            event
                                                                              .currentTarget
                                                                              .value,
                                                                          ) ??
                                                                          0,
                                                                      }
                                                                    : candidate,
                                                              ),
                                                          }
                                                        : entry,
                                                  ),
                                              })
                                            }
                                          />
                                        </Field.Root>
                                      </HStack>
                                    ))}
                                  </VStack>
                                ) : (
                                  <Text
                                    fontSize="sm"
                                    color={{
                                      base: "gray.600",
                                      _dark: "gray.400",
                                    }}
                                  >
                                    {t(
                                      "ignoredAttributeHelper",
                                      "This attribute still appears in the configurator, but its option changes do not affect the dynamic pricing result.",
                                    )}
                                  </Text>
                                )}
                              </VStack>
                            </Box>
                          );
                        })
                      )}
                    </VStack>
                  </Tabs.Content>
                </Tabs.Root>
              </Drawer.Body>
              <Drawer.Footer>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("close", "Close")}
                </Button>
              </Drawer.Footer>
              <Drawer.CloseTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  position="absolute"
                  top="2"
                  right="2"
                >
                  <MaterialSymbol>close</MaterialSymbol>
                </Button>
              </Drawer.CloseTrigger>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
      <SavePresetDialog
        draft={presetDraft}
        onClose={() => setPresetDraft(null)}
        onSave={savePreset}
        t={t}
      />
    </Box>
  );
};
