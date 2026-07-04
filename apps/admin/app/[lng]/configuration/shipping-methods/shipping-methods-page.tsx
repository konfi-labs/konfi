"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { ConfigurableSettingsTranslationPanel } from "@/components/configuration/taxonomy";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadShippingMethodsSettings,
  saveShippingMethodsSettings,
} from "@/lib/shipping-methods-settings.client";
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
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
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  Switch,
} from "@konfi/components";
import type {
  ShippingMethodDefinition,
  ShippingMethodKind,
  ShippingMethodRuleConditions,
  ShippingMethodRules,
  ShippingMethodsSettings,
} from "@konfi/types";
import { ShippingTypes } from "@konfi/types";
import {
  createDefaultShippingMethodsSettings,
  createShippingMethodId,
  getShippingMethodColorPalette,
  getShippingMethodIcon,
  normalizeShippingMethodsSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useMemo, useState } from "react";

import { ColorPaletteSelect } from "../shared/ColorPaletteSelect";
import { CopyFromChannelCard } from "../shared/CopyFromChannelCard";
import { IconSelect } from "../shared/IconSelect";
import { moveMethod, renumberMethods } from "../shared/draft-methods";
import { useChannelMethodsSettings } from "../shared/use-channel-methods-settings";

const COLOR_PALETTES = [
  "primary",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

const ICON_OPTIONS = [
  "local_shipping",
  "package_2",
  "storefront",
  "inventory_2",
  "warehouse",
  "category",
  "package",
  "delivery_truck_speed",
  "pin_drop",
  "location_on",
  "map",
  "route",
  "move_location",
  "shopping_bag",
  "sell",
  "tag",
  "settings",
  "tune",
  "build",
  "check_circle",
] as const;

const DEFAULT_PROVIDER_BY_KIND: Record<ShippingMethodKind, string> = {
  [ShippingTypes.CUSTOM]: "custom",
  [ShippingTypes.COURIER]: "custom",
  [ShippingTypes.PERSONAL_COLLECTION]: "pickup",
  [ShippingTypes.PARCEL_DELIVERY_LOCKER]: "inpost",
};

const EMPTY_RULE_CONDITIONS: ShippingMethodRuleConditions = {};

function splitRuleList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function joinRuleList(value: readonly string[] | undefined): string {
  return value?.join(", ") ?? "";
}

function parseOptionalMinorAmount(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed);
}

function formatOptionalAmount(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

function updateRuleConditions(
  rules: ShippingMethodRules | undefined,
  patch: Partial<ShippingMethodRuleConditions>,
): ShippingMethodRules {
  return {
    ...rules,
    enabled: rules?.enabled === true,
    conditions: {
      ...(rules?.conditions ?? EMPTY_RULE_CONDITIONS),
      ...patch,
    },
  };
}

function updateRules(
  rules: ShippingMethodRules | undefined,
  patch: Partial<ShippingMethodRules>,
): ShippingMethodRules {
  return {
    ...rules,
    ...patch,
    enabled: patch.enabled ?? rules?.enabled === true,
  };
}

type OptionItem<TValue extends string = string> = {
  label: string;
  value: TValue;
};

function normalizeDraftMethods(
  settings: Partial<ShippingMethodsSettings> | null,
): ShippingMethodDefinition[] {
  return normalizeShippingMethodsSettings(settings).methods.map(
    (method, index) => ({
      ...method,
      order: index,
    }),
  );
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDefaultSupportsPickupPoint(kind: ShippingMethodKind): boolean {
  return kind === ShippingTypes.PARCEL_DELIVERY_LOCKER;
}

export default function ShippingMethodsPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { refreshStoreSettings } = useConfiguration();
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodKind, setNewMethodKind] = useState<ShippingMethodKind>(
    ShippingTypes.COURIER,
  );
  const [newMethodProvider, setNewMethodProvider] = useState("custom");
  const [newSupportsPickupPoint, setNewSupportsPickupPoint] = useState(false);
  const [newMethodIcon, setNewMethodIcon] = useState("local_shipping");
  const [newMethodColorPalette, setNewMethodColorPalette] =
    useState<string>("gray");

  const kindOptions = useMemo<OptionItem<ShippingMethodKind>[]>(
    () => [
      {
        label: t("shippingMethods.kind.custom", {
          defaultValue: "Custom",
        }),
        value: ShippingTypes.CUSTOM,
      },
      {
        label: t("shippingMethods.kind.courier", {
          defaultValue: "Courier",
        }),
        value: ShippingTypes.COURIER,
      },
      {
        label: t("shippingMethods.kind.personalCollection", {
          defaultValue: "Personal Collection",
        }),
        value: ShippingTypes.PERSONAL_COLLECTION,
      },
      {
        label: t("shippingMethods.kind.parcelDeliveryLocker", {
          defaultValue: "Parcel Locker",
        }),
        value: ShippingTypes.PARCEL_DELIVERY_LOCKER,
      },
    ],
    [t],
  );

  const colorOptions = useMemo<OptionItem[]>(
    () =>
      COLOR_PALETTES.map((color) => ({
        label: t(`shippingMethods.colors.${color}`, {
          defaultValue: titleCase(color),
        }),
        value: color,
      })),
    [t],
  );

  const iconOptions = useMemo<OptionItem[]>(
    () =>
      ICON_OPTIONS.map((icon) => ({
        label: t(`shippingMethods.icons.${icon}`, {
          defaultValue: icon,
        }),
        value: icon,
      })),
    [t],
  );

  const {
    methods,
    setMethods,
    isLoading,
    isSaving,
    isCopying,
    copySourceChannelId,
    setCopySourceChannelId,
    channelOptions,
    handleSave,
    handleCopyFromChannel,
  } = useChannelMethodsSettings<ShippingMethodDefinition, ShippingMethodsSettings>(
    {
      channelId: channel?.id,
      allChannels: channels,
      loadSettings: loadShippingMethodsSettings,
      saveSettings: (channelId, settings) =>
        saveShippingMethodsSettings(channelId, settings, tenantContext),
      createDefaultSettings: createDefaultShippingMethodsSettings,
      toDraftMethods: (settings) => normalizeDraftMethods(settings),
      toSettings: (currentMethods) => ({
        methods: renumberMethods(currentMethods),
        updatedAt: serverTimestamp(),
      }),
      onSaveSuccess: refreshStoreSettings,
      toasts: {
        loadFailed: {
          title: t("shippingMethods.loadFailed.title", {
            defaultValue: "Shipping methods were not loaded",
          }),
          description: t("shippingMethods.loadFailed.description", {
            defaultValue: "Refresh the page and try again.",
          }),
        },
        saved: {
          title: t("shippingMethods.saved.title", {
            defaultValue: "Shipping methods saved",
          }),
          description: t("shippingMethods.saved.description", {
            defaultValue: "The selected channel now uses these methods.",
          }),
        },
        saveFailed: {
          title: t("shippingMethods.saveFailed.title", {
            defaultValue: "Shipping methods were not saved",
          }),
          description: t("shippingMethods.saveFailed.description", {
            defaultValue: "Check the settings and try again.",
          }),
        },
        channelRequired: {
          title: t("shippingMethods.channelRequired.title", {
            defaultValue: "Channel is required",
          }),
          description: t("shippingMethods.channelRequired.description", {
            defaultValue: "Select a channel before saving shipping methods.",
          }),
        },
        copyLoaded: {
          title: t("shippingMethods.copy.loadedTitle", {
            defaultValue: "Methods copied",
          }),
          description: t("shippingMethods.copy.loadedDescription", {
            defaultValue: "Review the copied methods and save them here.",
          }),
        },
        copyFailed: {
          title: t("shippingMethods.copy.failedTitle", {
            defaultValue: "Methods were not copied",
          }),
          description: t("shippingMethods.copy.failedDescription", {
            defaultValue: "The source channel settings could not be loaded.",
          }),
        },
      },
    },
  );

  const updateMethod = (
    id: string,
    patch: Partial<ShippingMethodDefinition>,
  ) => {
    setMethods((currentMethods) =>
      currentMethods.map((method) =>
        method.id === id ? { ...method, ...patch } : method,
      ),
    );
  };

  const handleNewKindChange = (kind: ShippingMethodKind) => {
    setNewMethodKind(kind);
    setNewSupportsPickupPoint(getDefaultSupportsPickupPoint(kind));
    setNewMethodProvider((currentProvider) =>
      currentProvider.trim() ? currentProvider : DEFAULT_PROVIDER_BY_KIND[kind],
    );
  };

  const handleAddMethod = () => {
    const trimmedName = newMethodName.trim();
    if (!trimmedName) {
      return;
    }

    const nextMethod: ShippingMethodDefinition = {
      id: createShippingMethodId(
        trimmedName,
        methods.map((method) => method.id),
      ),
      name: trimmedName,
      label: trimmedName,
      kind: newMethodKind,
      provider:
        newMethodProvider.trim() || DEFAULT_PROVIDER_BY_KIND[newMethodKind],
      supportsPickupPoint: newSupportsPickupPoint,
      icon: newMethodIcon.trim() || "local_shipping",
      colorPalette: newMethodColorPalette.trim() || "gray",
      enabled: true,
      archived: false,
      isDefault: false,
      order: methods.length,
    };

    setMethods((currentMethods) =>
      renumberMethods([...currentMethods, nextMethod]),
    );
    setNewMethodName("");
    setNewMethodKind(ShippingTypes.COURIER);
    setNewMethodProvider("custom");
    setNewSupportsPickupPoint(false);
    setNewMethodIcon("local_shipping");
    setNewMethodColorPalette("gray");
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("shippingMethods.title", {
          defaultValue: "Shipping Methods",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4} alignItems="start">
        <Card.Root variant="outline" borderRadius="lg">
          <Card.Header>
            <Card.Title>
              {t("shippingMethods.add.title", {
                defaultValue: "Add Shipping Method",
              })}
            </Card.Title>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Field
                label={t("shippingMethods.add.name", {
                  defaultValue: "Method Name",
                })}
              >
                <Input
                  value={newMethodName}
                  onChange={(event) => setNewMethodName(event.target.value)}
                  placeholder={t("shippingMethods.add.namePlaceholder", {
                    defaultValue: "e.g. UPS Courier",
                  })}
                />
              </Field>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field
                  label={t("shippingMethods.fields.kind", {
                    defaultValue: "Kind",
                  })}
                >
                  <KindSelect
                    items={kindOptions}
                    value={newMethodKind}
                    onChange={handleNewKindChange}
                  />
                </Field>
                <Field
                  label={t("shippingMethods.fields.provider", {
                    defaultValue: "Provider",
                  })}
                >
                  <Input
                    value={newMethodProvider}
                    onChange={(event) =>
                      setNewMethodProvider(event.target.value)
                    }
                    placeholder={t(
                      "shippingMethods.fields.providerPlaceholder",
                      {
                        defaultValue: "e.g. ups",
                      },
                    )}
                    spellCheck={false}
                    translate="no"
                  />
                </Field>
                <Field
                  label={t("shippingMethods.add.icon", {
                    defaultValue: "Icon",
                  })}
                >
                  <IconSelect
                    items={iconOptions}
                    value={newMethodIcon}
                    onChange={setNewMethodIcon}
                    fallbackIcon="local_shipping"
                  />
                </Field>
                <Field
                  label={t("shippingMethods.add.colorPalette", {
                    defaultValue: "Color",
                  })}
                >
                  <ColorPaletteSelect
                    items={colorOptions}
                    value={newMethodColorPalette}
                    onChange={setNewMethodColorPalette}
                  />
                </Field>
              </SimpleGrid>
              <HStack justify="space-between" gap={3} flexWrap="wrap">
                <Switch
                  checked={newSupportsPickupPoint}
                  onCheckedChange={({ checked }) =>
                    setNewSupportsPickupPoint(checked)
                  }
                >
                  {t("shippingMethods.fields.supportsPickupPoint", {
                    defaultValue: "Supports Pickup Point",
                  })}
                </Switch>
                <Badge
                  colorPalette={newMethodColorPalette}
                  maxW="full"
                  size="lg"
                  variant="subtle"
                >
                  <MaterialSymbol>{newMethodIcon}</MaterialSymbol>
                  {newMethodName.trim() ||
                    t("shippingMethods.add.previewPlaceholder", {
                      defaultValue: "Preview",
                    })}
                </Badge>
              </HStack>
              <Button
                alignSelf="end"
                colorPalette="primary"
                onClick={handleAddMethod}
                disabled={!newMethodName.trim()}
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("shippingMethods.add.button", {
                  defaultValue: "Add Method",
                })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>

        <CopyFromChannelCard
          title={t("shippingMethods.copy.title", {
            defaultValue: "Copy From Channel",
          })}
          label={t("shippingMethods.copy.label", {
            defaultValue: "Source Channel",
          })}
          placeholder={t("shippingMethods.copy.placeholder", {
            defaultValue: "Select Source Channel",
          })}
          buttonLabel={t("shippingMethods.copy.button", {
            defaultValue: "Copy",
          })}
          channelOptions={channelOptions}
          copySourceChannelId={copySourceChannelId}
          setCopySourceChannelId={setCopySourceChannelId}
          isCopying={isCopying}
          onCopy={handleCopyFromChannel}
        />
      </SimpleGrid>

      <Card.Root variant="outline" borderRadius="lg">
        <Card.Header>
          <HStack justify="space-between" align="start" gap={3} wrap="wrap">
            <Card.Title>
              {t("shippingMethods.list.title", {
                defaultValue: "Configured Methods",
              })}
            </Card.Title>
            <ConfigurableSettingsTranslationPanel
              channelId={channel?.id}
              kind="shippingMethodsSettings"
              source={{ methods }}
              title={t("forms.buttons.translations", {
                defaultValue: "Translations",
              })}
              onMutate={refreshStoreSettings}
            />
          </HStack>
        </Card.Header>
        <Card.Body>
          <VStack align="stretch" gap={3}>
            {methods.map((method, index) => (
              <Box
                key={method.id}
                bg={method.archived ? "bg.subtle" : "bg.panel"}
                borderRadius="lg"
                borderWidth="1px"
                opacity={method.archived ? 0.72 : 1}
                p={4}
              >
                <SimpleGrid
                  columns={{ base: 1, xl: 12 }}
                  gap={3}
                  alignItems="end"
                >
                  <VStack align="start" gap={2} gridColumn={{ xl: "span 3" }}>
                    <HStack gap={2} minW={0} flexWrap="wrap">
                      <Badge
                        colorPalette={getShippingMethodColorPalette(method.id, {
                          methods,
                        })}
                        maxW="full"
                      >
                        <MaterialSymbol>
                          {getShippingMethodIcon(method.id, { methods })}
                        </MaterialSymbol>
                        {method.name}
                      </Badge>
                      {method.isDefault ? (
                        <Badge size="sm" variant="subtle">
                          {t("shippingMethods.default", {
                            defaultValue: "Default",
                          })}
                        </Badge>
                      ) : null}
                      {method.archived ? (
                        <Badge colorPalette="orange" size="sm" variant="subtle">
                          {t("shippingMethods.archived", {
                            defaultValue: "Archived",
                          })}
                        </Badge>
                      ) : null}
                      {method.supportsPickupPoint ? (
                        <Badge colorPalette="teal" size="sm" variant="subtle">
                          {t("shippingMethods.pickupPoint", {
                            defaultValue: "Pickup Point",
                          })}
                        </Badge>
                      ) : null}
                    </HStack>
                    <Code
                      fontSize="xs"
                      maxW="full"
                      overflow="hidden"
                      translate="no"
                    >
                      {method.id}
                    </Code>
                  </VStack>

                  <Field
                    label={t("shippingMethods.fields.name", {
                      defaultValue: "Name",
                    })}
                    gridColumn={{ xl: "span 2" }}
                  >
                    <Input
                      value={method.name}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          label: event.target.value,
                          name: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.fields.kind", {
                      defaultValue: "Kind",
                    })}
                    gridColumn={{ xl: "span 2" }}
                  >
                    <KindSelect
                      items={kindOptions}
                      value={method.kind}
                      onChange={(value) =>
                        updateMethod(method.id, {
                          kind: value,
                          supportsPickupPoint:
                            value === ShippingTypes.PARCEL_DELIVERY_LOCKER
                              ? true
                              : method.supportsPickupPoint,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.fields.provider", {
                      defaultValue: "Provider",
                    })}
                    gridColumn={{ xl: "span 2" }}
                  >
                    <Input
                      value={method.provider}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          provider: event.target.value,
                        })
                      }
                      spellCheck={false}
                      translate="no"
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.fields.icon", {
                      defaultValue: "Icon",
                    })}
                    gridColumn={{ xl: "span 1" }}
                  >
                    <IconSelect
                      items={iconOptions}
                      value={method.icon}
                      onChange={(value) =>
                        updateMethod(method.id, { icon: value })
                      }
                      fallbackIcon="local_shipping"
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.fields.color", {
                      defaultValue: "Color",
                    })}
                    gridColumn={{ xl: "span 1" }}
                  >
                    <ColorPaletteSelect
                      items={colorOptions}
                      value={method.colorPalette}
                      onChange={(value) =>
                        updateMethod(method.id, { colorPalette: value })
                      }
                    />
                  </Field>

                  <HStack
                    alignSelf="center"
                    gap={2}
                    gridColumn={{ xl: "span 2" }}
                    justify="end"
                  >
                    <Switch
                      checked={method.supportsPickupPoint}
                      onCheckedChange={({ checked }) =>
                        updateMethod(method.id, {
                          supportsPickupPoint: checked,
                        })
                      }
                    >
                      {t("shippingMethods.fields.pickupPointShort", {
                        defaultValue: "Pickup",
                      })}
                    </Switch>
                    <Switch
                      checked={method.enabled && !method.archived}
                      disabled={method.archived}
                      onCheckedChange={({ checked }) =>
                        updateMethod(method.id, { enabled: checked })
                      }
                    >
                      {t("shippingMethods.fields.enabled", {
                        defaultValue: "Enabled",
                      })}
                    </Switch>
                    <IconButton
                      aria-label={t("shippingMethods.moveUp", {
                        defaultValue: "Move Up",
                      })}
                      disabled={index === 0}
                      onClick={() =>
                        setMethods((currentMethods) =>
                          moveMethod(currentMethods, method.id, -1),
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>arrow_upward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={t("shippingMethods.moveDown", {
                        defaultValue: "Move Down",
                      })}
                      disabled={index === methods.length - 1}
                      onClick={() =>
                        setMethods((currentMethods) =>
                          moveMethod(currentMethods, method.id, 1),
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>arrow_downward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={
                        method.archived
                          ? t("shippingMethods.restore", {
                              defaultValue: "Restore",
                            })
                          : t("shippingMethods.archive", {
                              defaultValue: "Archive",
                            })
                      }
                      colorPalette={method.archived ? "success" : "red"}
                      onClick={() =>
                        updateMethod(method.id, {
                          archived: !method.archived,
                          enabled: method.archived,
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>
                        {method.archived ? "unarchive" : "archive"}
                      </MaterialSymbol>
                    </IconButton>
                  </HStack>
                </SimpleGrid>

                <Separator my={4} />
                <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={3}>
                  <HStack alignSelf="end" minH="10">
                    <Switch
                      checked={method.rules?.enabled === true}
                      onCheckedChange={({ checked }) =>
                        updateMethod(method.id, {
                          rules: updateRules(method.rules, {
                            enabled: checked,
                          }),
                        })
                      }
                    >
                      {t("shippingMethods.rules.enabled", {
                        defaultValue: "Eligibility rules",
                      })}
                    </Switch>
                  </HStack>
                  <Field
                    label={t("shippingMethods.rules.countries", {
                      defaultValue: "Countries",
                    })}
                  >
                    <Input
                      value={joinRuleList(method.rules?.conditions?.countries)}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            countries: splitRuleList(event.target.value),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.countriesHint", {
                        defaultValue: "PL, DE",
                      })}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.postalCodePrefixes", {
                      defaultValue: "Postal prefixes",
                    })}
                  >
                    <Input
                      value={joinRuleList(
                        method.rules?.conditions?.postalCodePrefixes,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            postalCodePrefixes: splitRuleList(
                              event.target.value,
                            ),
                          }),
                        })
                      }
                      placeholder={t(
                        "shippingMethods.rules.postalCodePrefixesHint",
                        {
                          defaultValue: "00, 01",
                        },
                      )}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.productTypeIds", {
                      defaultValue: "Product type IDs",
                    })}
                  >
                    <Input
                      value={joinRuleList(
                        method.rules?.conditions?.productTypeIds,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            productTypeIds: splitRuleList(event.target.value),
                          }),
                        })
                      }
                      placeholder={t(
                        "shippingMethods.rules.productTypeIdsHint",
                        {
                          defaultValue: "business-cards, flyers",
                        },
                      )}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.categoryIds", {
                      defaultValue: "Category IDs",
                    })}
                  >
                    <Input
                      value={joinRuleList(
                        method.rules?.conditions?.categoryIds,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            categoryIds: splitRuleList(event.target.value),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.categoryIdsHint", {
                        defaultValue: "print, large-format",
                      })}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.channelIds", {
                      defaultValue: "Channel IDs",
                    })}
                  >
                    <Input
                      value={joinRuleList(method.rules?.conditions?.channelIds)}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            channelIds: splitRuleList(event.target.value),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.channelIdsHint", {
                        defaultValue: "store-pl",
                      })}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.minSubtotal", {
                      defaultValue: "Min subtotal",
                    })}
                  >
                    <Input
                      inputMode="numeric"
                      value={formatOptionalAmount(
                        method.rules?.conditions?.minSubtotal,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            minSubtotal: parseOptionalMinorAmount(
                              event.target.value,
                            ),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.amountHint", {
                        defaultValue: "Minor units",
                      })}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.maxSubtotal", {
                      defaultValue: "Max subtotal",
                    })}
                  >
                    <Input
                      inputMode="numeric"
                      value={formatOptionalAmount(
                        method.rules?.conditions?.maxSubtotal,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRuleConditions(method.rules, {
                            maxSubtotal: parseOptionalMinorAmount(
                              event.target.value,
                            ),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.amountHint", {
                        defaultValue: "Minor units",
                      })}
                    />
                  </Field>
                  <Field
                    label={t("shippingMethods.rules.freeShippingThreshold", {
                      defaultValue: "Free shipping from",
                    })}
                  >
                    <Input
                      inputMode="numeric"
                      value={formatOptionalAmount(
                        method.rules?.freeShippingThreshold,
                      )}
                      onChange={(event) =>
                        updateMethod(method.id, {
                          rules: updateRules(method.rules, {
                            freeShippingThreshold: parseOptionalMinorAmount(
                              event.target.value,
                            ),
                          }),
                        })
                      }
                      placeholder={t("shippingMethods.rules.amountHint", {
                        defaultValue: "Minor units",
                      })}
                    />
                  </Field>
                </SimpleGrid>
              </Box>
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Separator />
      <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Text color="fg.muted" fontSize="sm">
          {isLoading
            ? t("shippingMethods.loading", {
                defaultValue: "Loading Methods...",
              })
            : t("shippingMethods.footer", {
                count: methods.length,
                defaultValue: "{{count}} methods configured",
              })}
        </Text>
        <Button
          colorPalette="primary"
          loading={isSaving}
          onClick={handleSave}
          disabled={isLoading}
        >
          <MaterialSymbol>save</MaterialSymbol>
          {t("shippingMethods.save", { defaultValue: "Save Methods" })}
        </Button>
      </HStack>
    </Stack>
  );
}

function KindSelect({
  value,
  onChange,
  items,
}: {
  value: ShippingMethodKind;
  onChange: (value: ShippingMethodKind) => void;
  items: OptionItem<ShippingMethodKind>[];
}) {
  const collection = useMemo(() => createListCollection({ items }), [items]);

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={({ value: next }) => {
        const nextKind =
          items.find((item) => item.value === next[0])?.value ??
          ShippingTypes.CUSTOM;
        onChange(nextKind);
      }}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item item={item} key={item.value}>
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
