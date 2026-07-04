"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { StickyActionBar } from "@/components/configuration/taxonomy/StickyActionBar";
import { TagsInputField } from "@/components/forms/TagsInputField";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { loadTaxSettings, saveTaxSettings } from "@/lib/tax-settings.client";
import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  HStack,
  IconButton,
  Input,
  Portal,
  Select,
  Separator,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  Switch,
  toaster,
} from "@konfi/components";
import type {
  TaxRateDefinition,
  TaxRegionDefinition,
  TaxSettings,
} from "@konfi/types";
import {
  DEFAULT_TAX_COUNTRY_CODE,
  DEFAULT_TAX_RATE_ID,
  createDefaultTaxSettings,
  normalizeTaxSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function snapshot(settings: TaxSettings): string {
  return JSON.stringify(normalizeTaxSettings(settings));
}

function createRegion(): TaxRegionDefinition {
  return {
    active: true,
    calculationMode: "gross",
    countryCodes: [DEFAULT_TAX_COUNTRY_CODE],
    defaultRateId: DEFAULT_TAX_RATE_ID,
    id: "pl",
    name: "Poland",
    pricesIncludeTax: true,
    rates: [
      {
        active: true,
        id: DEFAULT_TAX_RATE_ID,
        name: "Standard VAT",
        percent: 23,
        priority: 0,
      },
    ],
  };
}

function createRate(existing: readonly TaxRateDefinition[]): TaxRateDefinition {
  const nextIndex = existing.length + 1;
  return {
    active: true,
    id: `rate-${nextIndex}`,
    name: `Rate ${nextIndex}`,
    percent: 23,
    priority: 0,
  };
}

export default function TaxesPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel } = useChannels();
  const [settings, setSettings] = useState<TaxSettings>(() =>
    createDefaultTaxSettings(),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!channel) return;

    let active = true;
    setIsLoading(true);
    loadTaxSettings(channel.id)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeTaxSettings(next);
        setSettings(normalized);
        setPristine(snapshot(normalized));
      })
      .catch((error: unknown) => {
        console.error("Failed to load tax settings:", error);
        toaster.error({
          title: t("taxSettings.loadFailed.title", {
            defaultValue: "Tax settings were not loaded",
          }),
          description: t("taxSettings.loadFailed.description", {
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

  const dirty = snapshot(settings) !== pristine;

  const updateRegion = (
    index: number,
    update: Partial<TaxRegionDefinition>,
  ) => {
    setSettings((current) => ({
      ...current,
      regions: current.regions.map((region, regionIndex) =>
        regionIndex === index ? { ...region, ...update } : region,
      ),
    }));
  };

  const updateRate = (
    regionIndex: number,
    rateIndex: number,
    update: Partial<TaxRateDefinition>,
  ) => {
    setSettings((current) => ({
      ...current,
      regions: current.regions.map((region, currentRegionIndex) =>
        currentRegionIndex === regionIndex
          ? {
              ...region,
              rates: region.rates.map((rate, currentRateIndex) =>
                currentRateIndex === rateIndex ? { ...rate, ...update } : rate,
              ),
            }
          : region,
      ),
    }));
  };

  const addRegion = () => {
    setSettings((current) => {
      const nextRegion = createRegion();
      const nextIndex = current.regions.length + 1;
      return {
        ...current,
        regions: [
          ...current.regions,
          {
            ...nextRegion,
            id: `region-${nextIndex}`,
            name: t("taxSettings.region.defaultName", {
              defaultValue: "New Region",
            }),
          },
        ],
      };
    });
  };

  const removeRegion = (index: number) => {
    setSettings((current) => ({
      ...current,
      regions:
        current.regions.length > 1
          ? current.regions.filter((_, regionIndex) => regionIndex !== index)
          : current.regions,
    }));
  };

  const addRate = (regionIndex: number) => {
    setSettings((current) => ({
      ...current,
      regions: current.regions.map((region, currentRegionIndex) =>
        currentRegionIndex === regionIndex
          ? { ...region, rates: [...region.rates, createRate(region.rates)] }
          : region,
      ),
    }));
  };

  const removeRate = (regionIndex: number, rateIndex: number) => {
    setSettings((current) => ({
      ...current,
      regions: current.regions.map((region, currentRegionIndex) => {
        if (currentRegionIndex !== regionIndex || region.rates.length <= 1) {
          return region;
        }

        const rates = region.rates.filter(
          (_, currentRateIndex) => currentRateIndex !== rateIndex,
        );
        const defaultRateStillExists = rates.some(
          (rate) => rate.id === region.defaultRateId,
        );

        return {
          ...region,
          defaultRateId: defaultRateStillExists
            ? region.defaultRateId
            : (rates[0]?.id ?? DEFAULT_TAX_RATE_ID),
          rates,
        };
      }),
    }));
  };

  const saveSettings = async () => {
    if (!channel) {
      toaster.error({
        title: t("taxSettings.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("taxSettings.channelRequired.description", {
          defaultValue: "Select a channel before saving tax settings.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeTaxSettings({
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await saveTaxSettings(channel.id, payload, tenantContext);
      setSettings(payload);
      setPristine(snapshot(payload));
      toaster.success({
        title: t("taxSettings.saved.title", {
          defaultValue: "Tax settings saved",
        }),
        description: t("taxSettings.saved.description", {
          defaultValue: "The selected channel now uses these tax settings.",
        }),
      });
    } catch (error) {
      console.error("Failed to save tax settings:", error);
      toaster.error({
        title: t("taxSettings.saveFailed.title", {
          defaultValue: "Tax settings were not saved",
        }),
        description: t("taxSettings.saveFailed.description", {
          defaultValue: "Check the settings and try again.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("taxSettings.title", {
          defaultValue: "Taxes & Regions",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Card.Root>
        <Card.Body>
          <Stack gap={5}>
            <HStack justify="space-between" gap={4} flexWrap="wrap">
              <Box minW={0}>
                <Text fontWeight="medium">
                  {t("taxSettings.engine.title", {
                    defaultValue: "Tax Engine",
                  })}
                </Text>
                <Text color="fg.muted" fontSize="sm">
                  {t("taxSettings.engine.description", {
                    defaultValue:
                      "When disabled, checkout keeps current totals and does not create tax snapshots.",
                  })}
                </Text>
              </Box>
              <Switch
                checked={settings.enabled}
                onCheckedChange={({ checked }) =>
                  setSettings((current) => ({ ...current, enabled: checked }))
                }
              >
                {t("taxSettings.engine.enabled", {
                  defaultValue: "Enabled",
                })}
              </Switch>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <Field
                label={t("taxSettings.defaultCountry.label", {
                  defaultValue: "Default country code",
                })}
                helperText={t("taxSettings.defaultCountry.help", {
                  defaultValue:
                    "ISO 3166 country code used when no region matches the customer address.",
                })}
              >
                <Input
                  autoComplete="off"
                  name="defaultCountryCode"
                  maxLength={2}
                  textTransform="uppercase"
                  value={settings.defaultCountryCode}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultCountryCode: event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 2),
                    }))
                  }
                />
              </Field>
            </SimpleGrid>
          </Stack>
        </Card.Body>
      </Card.Root>

      <Stack gap={4}>
        <HStack justify="space-between" gap={3} flexWrap="wrap">
          <Box minW={0}>
            <Text fontWeight="medium">
              {t("taxSettings.regions.title", {
                defaultValue: "Regions",
              })}
            </Text>
            <Text color="fg.muted" fontSize="sm">
              {t("taxSettings.regions.description", {
                defaultValue:
                  "Map countries to tax rates without changing existing orders.",
              })}
            </Text>
          </Box>
          <Button onClick={addRegion} variant="outline">
            <MaterialSymbol>add</MaterialSymbol>
            {t("taxSettings.regions.add", {
              defaultValue: "Add Region",
            })}
          </Button>
        </HStack>

        {settings.regions.map((region, regionIndex) => (
          <Card.Root key={`${region.id}:${regionIndex}`} variant="outline">
            <Card.Body>
              <Stack gap={5}>
                <HStack justify="space-between" gap={3} flexWrap="wrap">
                  <HStack gap={3} minW={0}>
                    <Badge
                      colorPalette={
                        region.active === false ? "gray" : "success"
                      }
                    >
                      {region.active === false
                        ? t("taxSettings.region.inactive", {
                            defaultValue: "Inactive",
                          })
                        : t("taxSettings.region.active", {
                            defaultValue: "Active",
                          })}
                    </Badge>
                    <Text fontWeight="medium" minW={0} truncate>
                      {region.name}
                    </Text>
                  </HStack>
                  <HStack gap={2}>
                    <Switch
                      checked={region.active !== false}
                      onCheckedChange={({ checked }) =>
                        updateRegion(regionIndex, { active: checked })
                      }
                    >
                      {t("taxSettings.region.enabled", {
                        defaultValue: "Enabled",
                      })}
                    </Switch>
                    <IconButton
                      aria-label={t("taxSettings.region.remove", {
                        defaultValue: "Remove Region",
                      })}
                      disabled={settings.regions.length <= 1}
                      onClick={() => removeRegion(regionIndex)}
                      size="sm"
                      variant="ghost"
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                    </IconButton>
                  </HStack>
                </HStack>

                <SimpleGrid columns={{ base: 1, lg: 3 }} gap={4}>
                  <Field
                    label={t("taxSettings.region.name", {
                      defaultValue: "Name",
                    })}
                  >
                    <Input
                      autoComplete="off"
                      name={`taxRegionName-${regionIndex}`}
                      value={region.name}
                      onChange={(event) =>
                        updateRegion(regionIndex, {
                          id: normalizeIdentifier(
                            event.target.value,
                            region.id,
                          ),
                          name: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={t("taxSettings.region.countries", {
                      defaultValue: "Country codes",
                    })}
                    helperText={t("taxSettings.region.countriesHelp", {
                      defaultValue:
                        "Add ISO 3166 codes (e.g. PL, DE). Press Enter or comma to add.",
                    })}
                  >
                    <TagsInputField
                      value={region.countryCodes}
                      onChange={(countryCodes) =>
                        updateRegion(regionIndex, { countryCodes })
                      }
                      uppercase
                      normalize={(code) =>
                        code.replace(/[^A-Z]/g, "").slice(0, 2)
                      }
                      placeholder={t(
                        "taxSettings.region.countriesPlaceholder",
                        {
                          defaultValue: "PL, DE…",
                        },
                      )}
                    />
                  </Field>
                  <Field
                    label={t("taxSettings.region.defaultRate", {
                      defaultValue: "Default rate",
                    })}
                    helperText={t("taxSettings.region.defaultRateHelp", {
                      defaultValue:
                        "Applied when no other rate in this region matches.",
                    })}
                  >
                    <RegionDefaultRateSelect
                      rates={region.rates}
                      value={region.defaultRateId}
                      onChange={(defaultRateId) =>
                        updateRegion(regionIndex, { defaultRateId })
                      }
                    />
                  </Field>
                </SimpleGrid>

                <HStack gap={3} flexWrap="wrap">
                  <Switch
                    checked={region.pricesIncludeTax !== false}
                    onCheckedChange={({ checked }) =>
                      updateRegion(regionIndex, { pricesIncludeTax: checked })
                    }
                  >
                    {t("taxSettings.region.pricesIncludeTax", {
                      defaultValue: "Prices Include Tax",
                    })}
                  </Switch>
                  <HStack gap={1}>
                    {(["gross", "net"] as const).map((mode) => (
                      <Button
                        key={mode}
                        colorPalette={
                          (region.calculationMode ?? "gross") === mode
                            ? "primary"
                            : "gray"
                        }
                        onClick={() =>
                          updateRegion(regionIndex, {
                            calculationMode: mode,
                          })
                        }
                        size="sm"
                        variant={
                          (region.calculationMode ?? "gross") === mode
                            ? "solid"
                            : "outline"
                        }
                      >
                        {mode === "gross"
                          ? t("taxSettings.region.modeGross", {
                              defaultValue: "Gross",
                            })
                          : t("taxSettings.region.modeNet", {
                              defaultValue: "Net",
                            })}
                      </Button>
                    ))}
                  </HStack>
                </HStack>

                <Separator />

                <Stack gap={3}>
                  <HStack justify="space-between" gap={3} flexWrap="wrap">
                    <Text fontWeight="medium">
                      {t("taxSettings.rates.title", {
                        defaultValue: "Rates",
                      })}
                    </Text>
                    <Button
                      onClick={() => addRate(regionIndex)}
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>add</MaterialSymbol>
                      {t("taxSettings.rates.add", {
                        defaultValue: "Add Rate",
                      })}
                    </Button>
                  </HStack>

                  {region.rates.map((rate, rateIndex) => (
                    <Card.Root key={`${rate.id}:${rateIndex}`} variant="subtle">
                      <Card.Body>
                        <Stack gap={4}>
                          <HStack
                            justify="space-between"
                            gap={3}
                            flexWrap="wrap"
                          >
                            <Switch
                              checked={rate.active !== false}
                              onCheckedChange={({ checked }) =>
                                updateRate(regionIndex, rateIndex, {
                                  active: checked,
                                })
                              }
                            >
                              {t("taxSettings.rate.enabled", {
                                defaultValue: "Enabled",
                              })}
                            </Switch>
                            <IconButton
                              aria-label={t("taxSettings.rate.remove", {
                                defaultValue: "Remove Rate",
                              })}
                              disabled={region.rates.length <= 1}
                              onClick={() => removeRate(regionIndex, rateIndex)}
                              size="sm"
                              variant="ghost"
                            >
                              <MaterialSymbol>delete</MaterialSymbol>
                            </IconButton>
                          </HStack>

                          <SimpleGrid columns={{ base: 1, lg: 4 }} gap={4}>
                            <Field
                              label={t("taxSettings.rate.name", {
                                defaultValue: "Name",
                              })}
                            >
                              <Input
                                autoComplete="off"
                                name={`taxRateName-${regionIndex}-${rateIndex}`}
                                value={rate.name}
                                onChange={(event) =>
                                  updateRate(regionIndex, rateIndex, {
                                    id: normalizeIdentifier(
                                      event.target.value,
                                      rate.id,
                                    ),
                                    name: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field
                              label={t("taxSettings.rate.percent", {
                                defaultValue: "Tax Percent",
                              })}
                            >
                              <Input
                                autoComplete="off"
                                inputMode="decimal"
                                name={`taxRatePercent-${regionIndex}-${rateIndex}`}
                                type="number"
                                value={rate.percent}
                                onChange={(event) => {
                                  const percent = Number(event.target.value);
                                  updateRate(regionIndex, rateIndex, {
                                    percent: Number.isFinite(percent)
                                      ? percent
                                      : 0,
                                  });
                                }}
                              />
                            </Field>
                            <Field
                              label={t("taxSettings.rate.priority", {
                                defaultValue: "Priority",
                              })}
                            >
                              <Input
                                autoComplete="off"
                                inputMode="numeric"
                                name={`taxRatePriority-${regionIndex}-${rateIndex}`}
                                type="number"
                                value={rate.priority ?? 0}
                                onChange={(event) => {
                                  const priority = Number(event.target.value);
                                  updateRate(regionIndex, rateIndex, {
                                    priority: Number.isFinite(priority)
                                      ? priority
                                      : 0,
                                  });
                                }}
                              />
                            </Field>
                            <Field
                              label={t("taxSettings.rate.taxCategories", {
                                defaultValue: "Tax categories",
                              })}
                              helperText={t(
                                "taxSettings.rate.taxCategoriesHelp",
                                {
                                  defaultValue:
                                    "Optional. Restrict this rate to specific tax category IDs.",
                                },
                              )}
                            >
                              <TagsInputField
                                value={rate.target?.taxCategoryIds ?? []}
                                onChange={(taxCategoryIds) =>
                                  updateRate(regionIndex, rateIndex, {
                                    target: {
                                      ...rate.target,
                                      taxCategoryIds,
                                    },
                                  })
                                }
                                placeholder={t(
                                  "taxSettings.rate.taxCategoriesPlaceholder",
                                  {
                                    defaultValue: "Paste ID and press Enter",
                                  },
                                )}
                              />
                            </Field>
                          </SimpleGrid>
                        </Stack>
                      </Card.Body>
                    </Card.Root>
                  ))}
                </Stack>
              </Stack>
            </Card.Body>
          </Card.Root>
        ))}
      </Stack>

      <StickyActionBar
        dirty={dirty && !isLoading}
        saving={isSaving}
        onSave={() => void saveSettings()}
        onDiscard={() => {
          const restored = normalizeTaxSettings(
            JSON.parse(pristine) as TaxSettings,
          );
          setSettings(restored);
        }}
        saveLabel={t("taxSettings.save", {
          defaultValue: "Save tax settings",
        })}
        summary={t("taxSettings.footer", {
          regions: settings.regions.length,
          rates: settings.regions.reduce(
            (sum, region) => sum + region.rates.length,
            0,
          ),
          defaultValue: "{{regions}} regions and {{rates}} rates configured",
        })}
      />
    </Stack>
  );
}

function RegionDefaultRateSelect({
  rates,
  value,
  onChange,
}: {
  rates: readonly TaxRateDefinition[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useT();
  const items = useMemo(
    () =>
      rates.map((rate) => ({
        label: `${rate.name} (${rate.percent}%)`,
        value: rate.id,
      })),
    [rates],
  );
  const collection = useMemo(() => createListCollection({ items }), [items]);
  const selectedValue = items.some((item) => item.value === value)
    ? value
    : (items[0]?.value ?? "");

  return (
    <Select.Root
      collection={collection}
      value={selectedValue ? [selectedValue] : []}
      onValueChange={({ value: nextValue }) => {
        const next = nextValue[0];
        if (next) onChange(next);
      }}
      disabled={items.length === 0}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText
            placeholder={t("taxSettings.region.defaultRatePlaceholder", {
              defaultValue: "Select rate",
            })}
          />
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
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
