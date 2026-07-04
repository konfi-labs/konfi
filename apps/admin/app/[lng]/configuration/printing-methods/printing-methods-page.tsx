"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { ConfigurableSettingsTranslationPanel } from "@/components/configuration/taxonomy";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadPrintingMethodsSettings,
  savePrintingMethodsSettings,
} from "@/lib/printing-methods-settings.client";
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  HStack,
  IconButton,
  Input,
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
  PrintingMethodDefinition,
  PrintingMethodsSettings,
} from "@konfi/types";
import {
  createDefaultPrintingMethodsSettings,
  createPrintingMethodId,
  getPrintingMethodColorPalette,
  getPrintingMethodIcon,
  normalizePrintingMethodsSettings,
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

const COLOR_PALETTE_OPTIONS = COLOR_PALETTES.map((color) => ({
  label: color,
  value: color,
}));

const ICON_OPTIONS = [
  "print",
  "scatter_plot",
  "grain",
  "format_paint",
  "fluorescent",
  "stylus_laser_pointer",
  "laundry",
  "content_cut",
  "construction",
  "brush",
  "draw",
  "auto_awesome",
  "wand_sparkles",
  "label",
  "sticky_note_2",
  "image",
  "edit_square",
  "edit",
  "settings",
  "build",
  "tune",
  "category",
  "tag",
  "sell",
  "shopping_bag",
  "package",
  "inventory_2",
  "layers",
  "crop",
  "high_quality",
  "qr_code_scanner",
  "science",
  "eco",
  "bolt",
] as const;

const ICON_OPTION_ITEMS = ICON_OPTIONS.map((icon) => ({
  label: icon,
  value: icon,
}));

function normalizeDraftMethods(
  settings: PrintingMethodsSettings,
): PrintingMethodDefinition[] {
  return normalizePrintingMethodsSettings(settings).methods.map(
    (method, index) => ({
      ...method,
      order: index,
    }),
  );
}

export default function PrintingMethodsPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { printingMethodsSettings, refreshStoreSettings } = useConfiguration();
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodIcon, setNewMethodIcon] = useState("print");
  const [newMethodColorPalette, setNewMethodColorPalette] =
    useState<string>("gray");

  const externalMethods = useMemo(
    () => normalizeDraftMethods(printingMethodsSettings),
    [printingMethodsSettings],
  );

  const {
    methods,
    setMethods,
    isSaving,
    isCopying,
    copySourceChannelId,
    setCopySourceChannelId,
    channelOptions,
    handleSave,
    handleCopyFromChannel,
  } = useChannelMethodsSettings<
    PrintingMethodDefinition,
    PrintingMethodsSettings
  >({
    channelId: channel?.id,
    allChannels: channels,
    loadSettings: loadPrintingMethodsSettings,
    saveSettings: (channelId, settings) =>
      savePrintingMethodsSettings(channelId, settings, tenantContext),
    createDefaultSettings: createDefaultPrintingMethodsSettings,
    toDraftMethods: normalizeDraftMethods,
    toSettings: (currentMethods) => ({
      methods: renumberMethods(currentMethods),
      updatedAt: serverTimestamp(),
    }),
    onSaveSuccess: refreshStoreSettings,
    externalMethods,
    toasts: {
      loadFailed: {
        title: t("printingMethods.loadFailed.title", {
          defaultValue: "Printing methods were not loaded",
        }),
        description: t("printingMethods.loadFailed.description", {
          defaultValue: "The selected channel settings could not be read.",
        }),
      },
      saved: {
        title: t("printingMethods.saved.title", {
          defaultValue: "Printing methods saved",
        }),
        description: t("printingMethods.saved.description", {
          defaultValue: "The selected channel now uses these methods.",
        }),
      },
      saveFailed: {
        title: t("printingMethods.saveFailed.title", {
          defaultValue: "Printing methods were not saved",
        }),
        description: t("printingMethods.saveFailed.description", {
          defaultValue: "Check the settings and try again.",
        }),
      },
      channelRequired: {
        title: t("printingMethods.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("printingMethods.channelRequired.description", {
          defaultValue: "Select a channel before saving printing methods.",
        }),
      },
      copyLoaded: {
        title: t("printingMethods.copy.loadedTitle", {
          defaultValue: "Methods copied",
        }),
        description: t("printingMethods.copy.loadedDescription", {
          defaultValue: "Review the copied methods and save them here.",
        }),
      },
      copyFailed: {
        title: t("printingMethods.copy.failedTitle", {
          defaultValue: "Methods were not copied",
        }),
        description: t("printingMethods.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      },
    },
  });

  const updateMethod = (
    id: string,
    patch: Partial<PrintingMethodDefinition>,
  ) => {
    setMethods((currentMethods) =>
      currentMethods.map((method) =>
        method.id === id ? { ...method, ...patch } : method,
      ),
    );
  };

  const handleAddMethod = () => {
    const trimmedName = newMethodName.trim();
    if (!trimmedName) {
      return;
    }

    const nextMethod: PrintingMethodDefinition = {
      id: createPrintingMethodId(
        trimmedName,
        methods.map((method) => method.id),
      ),
      name: trimmedName,
      icon: newMethodIcon.trim() || "print",
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
    setNewMethodIcon("print");
    setNewMethodColorPalette("gray");
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("printingMethods.title", {
          defaultValue: "Printing Methods",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4} alignItems="start">
        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("printingMethods.add.title", {
                defaultValue: "Add Printing Method",
              })}
            </Card.Title>
            <Card.Description>
              {t("printingMethods.add.description", {
                defaultValue:
                  "Pick a name, icon, and color. You can edit any field after creating.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Field
                label={t("printingMethods.add.name", {
                  defaultValue: "Method name",
                })}
              >
                <Input
                  value={newMethodName}
                  onChange={(event) => setNewMethodName(event.target.value)}
                  placeholder={t("printingMethods.add.namePlaceholder", {
                    defaultValue: "e.g. Sublimation",
                  })}
                />
              </Field>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field
                  label={t("printingMethods.add.icon", {
                    defaultValue: "Icon",
                  })}
                >
                  <IconSelect
                    value={newMethodIcon}
                    onChange={setNewMethodIcon}
                    items={ICON_OPTION_ITEMS}
                    fallbackIcon="print"
                  />
                </Field>
                <Field
                  label={t("printingMethods.add.colorPalette", {
                    defaultValue: "Color",
                  })}
                >
                  <ColorPaletteSelect
                    value={newMethodColorPalette}
                    onChange={setNewMethodColorPalette}
                    items={COLOR_PALETTE_OPTIONS}
                  />
                </Field>
              </SimpleGrid>
              <Box pt={1}>
                <Badge
                  colorPalette={newMethodColorPalette}
                  size="lg"
                  variant="subtle"
                >
                  <MaterialSymbol>{newMethodIcon}</MaterialSymbol>
                  {newMethodName.trim() ||
                    t("printingMethods.add.previewPlaceholder", {
                      defaultValue: "Preview",
                    })}
                </Badge>
              </Box>
              <Button
                alignSelf="end"
                colorPalette="primary"
                onClick={handleAddMethod}
                disabled={!newMethodName.trim()}
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("printingMethods.add.button", {
                  defaultValue: "Add method",
                })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>

        <CopyFromChannelCard
          title={t("printingMethods.copy.title", {
            defaultValue: "Copy From Channel",
          })}
          description={t("printingMethods.copy.description", {
            defaultValue:
              "Replace the current draft with methods from another channel. Review and save to apply.",
          })}
          label={t("printingMethods.copy.label", {
            defaultValue: "Source channel",
          })}
          placeholder={t("printingMethods.copy.placeholder", {
            defaultValue: "Select source channel",
          })}
          buttonLabel={t("printingMethods.copy.button", {
            defaultValue: "Copy",
          })}
          channelOptions={channelOptions}
          copySourceChannelId={copySourceChannelId}
          setCopySourceChannelId={setCopySourceChannelId}
          isCopying={isCopying}
          onCopy={handleCopyFromChannel}
        />
      </SimpleGrid>

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <HStack justify="space-between" align="start" gap={3} wrap="wrap">
            <Stack gap={1}>
              <Card.Title>
                {t("printingMethods.list.title", {
                  defaultValue: "Configured Methods",
                })}
              </Card.Title>
              <Card.Description>
                {t("printingMethods.list.description", {
                  defaultValue:
                    "Reorder, enable, or archive methods. Changes apply after saving.",
                })}
              </Card.Description>
            </Stack>
            <ConfigurableSettingsTranslationPanel
              channelId={channel?.id}
              kind="printingMethodsSettings"
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
                borderRadius="xl"
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
                        colorPalette={getPrintingMethodColorPalette(method.id, {
                          methods,
                        })}
                        maxW="full"
                      >
                        <MaterialSymbol>
                          {getPrintingMethodIcon(method.id, { methods })}
                        </MaterialSymbol>
                        {method.name}
                      </Badge>
                      {method.isDefault ? (
                        <Badge size="sm" variant="subtle">
                          {t("printingMethods.default", {
                            defaultValue: "Default",
                          })}
                        </Badge>
                      ) : null}
                      {method.archived ? (
                        <Badge colorPalette="orange" size="sm" variant="subtle">
                          {t("printingMethods.archived", {
                            defaultValue: "Archived",
                          })}
                        </Badge>
                      ) : null}
                    </HStack>
                    <Code fontSize="xs" maxW="full" overflow="hidden">
                      {method.id}
                    </Code>
                  </VStack>

                  <Field
                    label={t("printingMethods.fields.name", {
                      defaultValue: "Name",
                    })}
                    gridColumn={{ xl: "span 3" }}
                  >
                    <Input
                      value={method.name}
                      onChange={(event) =>
                        updateMethod(method.id, { name: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label={t("printingMethods.fields.icon", {
                      defaultValue: "Icon",
                    })}
                    gridColumn={{ xl: "span 2" }}
                  >
                    <IconSelect
                      value={method.icon}
                      onChange={(value) =>
                        updateMethod(method.id, { icon: value })
                      }
                      items={ICON_OPTION_ITEMS}
                      fallbackIcon="print"
                    />
                  </Field>
                  <Field
                    label={t("printingMethods.fields.color", {
                      defaultValue: "Color",
                    })}
                    gridColumn={{ xl: "span 2" }}
                  >
                    <ColorPaletteSelect
                      value={method.colorPalette}
                      onChange={(value) =>
                        updateMethod(method.id, { colorPalette: value })
                      }
                      items={COLOR_PALETTE_OPTIONS}
                    />
                  </Field>

                  <HStack
                    alignSelf="center"
                    gap={2}
                    gridColumn={{ xl: "span 2" }}
                    justify="end"
                  >
                    <Switch
                      checked={method.enabled && !method.archived}
                      disabled={method.archived}
                      onCheckedChange={({ checked }) =>
                        updateMethod(method.id, { enabled: checked })
                      }
                    >
                      {t("printingMethods.fields.enabled", {
                        defaultValue: "Enabled",
                      })}
                    </Switch>
                    <IconButton
                      aria-label={t("printingMethods.moveUp", {
                        defaultValue: "Move up",
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
                      aria-label={t("printingMethods.moveDown", {
                        defaultValue: "Move down",
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
                          ? t("printingMethods.restore", {
                              defaultValue: "Restore",
                            })
                          : t("printingMethods.archive", {
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
              </Box>
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Separator />
      <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Text color="fg.muted" fontSize="sm">
          {t("printingMethods.footer", {
            count: methods.length,
            defaultValue: "{{count}} methods configured",
          })}
        </Text>
        <Button colorPalette="primary" loading={isSaving} onClick={handleSave}>
          <MaterialSymbol>save</MaterialSymbol>
          {t("printingMethods.save", { defaultValue: "Save methods" })}
        </Button>
      </HStack>
    </Stack>
  );
}
