"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { ConfigurableSettingsTranslationPanel } from "@/components/configuration/taxonomy";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadPaymentMethodsSettings,
  savePaymentMethodsSettings,
} from "@/lib/payment-methods-settings.client";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
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
import { ShippingOptions } from "@konfi/types";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useState } from "react";

import type {
  PaymentMethodDefinition,
  PaymentMethodProviderKind,
  PaymentMethodsSettings,
} from "@konfi/types";
import {
  PAYMENT_METHOD_PROVIDER_KINDS,
  createDefaultPaymentMethodsSettings,
  createPaymentMethodId,
  getPaymentMethodColorPalette,
  getPaymentMethodIcon,
  normalizePaymentMethodsSettings,
} from "@konfi/utils";
import { humanizeBusinessTaxonomyId } from "@konfi/utils";

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
  "payments",
  "credit_card",
  "account_balance",
  "storefront",
  "local_shipping",
  "receipt_long",
  "event_available",
  "shopping_bag",
  "point_of_sale",
  "attach_money",
  "money",
  "wallet",
  "request_quote",
  "currency_exchange",
  "sell",
  "shopping_cart",
  "badge",
  "category",
  "settings",
  "tune",
] as const;

const ICON_OPTION_ITEMS = ICON_OPTIONS.map((icon) => ({
  label: icon,
  value: icon,
}));

const PROVIDER_KIND_OPTIONS = PAYMENT_METHOD_PROVIDER_KINDS.map((kind) => ({
  label: humanizeBusinessTaxonomyId(kind),
  value: kind,
}));
const PROVIDER_KIND_COLLECTION = createListCollection({
  items: PROVIDER_KIND_OPTIONS,
});
const SHIPPING_METHOD_IDS = Object.values(ShippingOptions);

function normalizeDraftMethods(
  settings: PaymentMethodsSettings,
): PaymentMethodDefinition[] {
  return normalizePaymentMethodsSettings(settings).methods.map(
    (method, index) => ({
      ...method,
      allowedShippingMethodIds: [...method.allowedShippingMethodIds],
      order: index,
    }),
  );
}

function toggleId(ids: readonly string[], id: string, checked: boolean) {
  if (checked) {
    return Array.from(new Set([...ids, id]));
  }

  return ids.filter((candidate) => candidate !== id);
}

export default function PaymentMethodsPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { refreshStoreSettings } = useConfiguration();
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodIcon, setNewMethodIcon] = useState("payments");
  const [newMethodColorPalette, setNewMethodColorPalette] =
    useState<string>("gray");
  const [newProviderKind, setNewProviderKind] =
    useState<PaymentMethodProviderKind>("manual");
  const [newAllowedShippingMethodIds, setNewAllowedShippingMethodIds] =
    useState<string[]>(() => [...SHIPPING_METHOD_IDS]);

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
  } = useChannelMethodsSettings<PaymentMethodDefinition, PaymentMethodsSettings>(
    {
      channelId: channel?.id,
      allChannels: channels,
      loadSettings: loadPaymentMethodsSettings,
      saveSettings: (channelId, settings) =>
        savePaymentMethodsSettings(channelId, settings, tenantContext),
      createDefaultSettings: createDefaultPaymentMethodsSettings,
      toDraftMethods: normalizeDraftMethods,
      toSettings: (currentMethods) => ({
        methods: renumberMethods(currentMethods),
        updatedAt: serverTimestamp(),
      }),
      onSaveSuccess: refreshStoreSettings,
      toasts: {
        loadFailed: {
          title: t("paymentMethods.loadFailed.title", {
            defaultValue: "Payment methods were not loaded",
          }),
          description: t("paymentMethods.loadFailed.description", {
            defaultValue: "The selected channel settings could not be read.",
          }),
        },
        saved: {
          title: t("paymentMethods.saved.title", {
            defaultValue: "Payment methods saved",
          }),
          description: t("paymentMethods.saved.description", {
            defaultValue: "The selected channel now uses these methods.",
          }),
        },
        saveFailed: {
          title: t("paymentMethods.saveFailed.title", {
            defaultValue: "Payment methods were not saved",
          }),
          description: t("paymentMethods.saveFailed.description", {
            defaultValue: "Check the settings and try again.",
          }),
        },
        channelRequired: {
          title: t("paymentMethods.channelRequired.title", {
            defaultValue: "Channel is required",
          }),
          description: t("paymentMethods.channelRequired.description", {
            defaultValue: "Select a channel before saving payment methods.",
          }),
        },
        copyLoaded: {
          title: t("paymentMethods.copy.loadedTitle", {
            defaultValue: "Payment methods copied",
          }),
          description: t("paymentMethods.copy.loadedDescription", {
            defaultValue: "Review the copied methods and save them here.",
          }),
        },
        copyFailed: {
          title: t("paymentMethods.copy.failedTitle", {
            defaultValue: "Payment methods were not copied",
          }),
          description: t("paymentMethods.copy.failedDescription", {
            defaultValue: "The source channel settings could not be loaded.",
          }),
        },
      },
    },
  );

  const updateMethod = (
    id: string,
    patch: Partial<PaymentMethodDefinition>,
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

    const nextMethod: PaymentMethodDefinition = {
      id: createPaymentMethodId(
        trimmedName,
        methods.map((method) => method.id),
      ),
      name: trimmedName,
      label: trimmedName,
      providerKind: newProviderKind,
      allowedShippingMethodIds: [...newAllowedShippingMethodIds],
      icon: newMethodIcon.trim() || "payments",
      colorPalette: newMethodColorPalette.trim() || "gray",
      enabled: true,
      archived: false,
      isDefault: false,
      order: methods.length,
      storefrontEnabled: false,
    };

    setMethods((currentMethods) =>
      renumberMethods([...currentMethods, nextMethod]),
    );
    setNewMethodName("");
    setNewMethodIcon("payments");
    setNewMethodColorPalette("gray");
    setNewProviderKind("manual");
    setNewAllowedShippingMethodIds([...SHIPPING_METHOD_IDS]);
  };

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("paymentMethods.title", {
          defaultValue: "Payment Methods",
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
              {t("paymentMethods.add.title", {
                defaultValue: "Add Payment Method",
              })}
            </Card.Title>
            <Card.Description>
              {t("paymentMethods.add.description", {
                defaultValue:
                  "Pick a name, provider behavior, icon, color, and shipping eligibility.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Field
                label={t("paymentMethods.add.name", {
                  defaultValue: "Method name",
                })}
              >
                <Input
                  value={newMethodName}
                  onChange={(event) => setNewMethodName(event.target.value)}
                  placeholder={t("paymentMethods.add.namePlaceholder", {
                    defaultValue: "e.g. Card terminal",
                  })}
                />
              </Field>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                <Field
                  label={t("paymentMethods.add.providerKind", {
                    defaultValue: "Provider kind",
                  })}
                >
                  <ProviderKindSelect
                    value={newProviderKind}
                    onChange={setNewProviderKind}
                  />
                </Field>
                <Field
                  label={t("paymentMethods.add.icon", {
                    defaultValue: "Icon",
                  })}
                >
                  <IconSelect
                    value={newMethodIcon}
                    onChange={setNewMethodIcon}
                    items={ICON_OPTION_ITEMS}
                    fallbackIcon="payments"
                  />
                </Field>
                <Field
                  label={t("paymentMethods.add.colorPalette", {
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
              <ShippingEligibilityField
                value={newAllowedShippingMethodIds}
                onChange={setNewAllowedShippingMethodIds}
              />
              <Box pt={1}>
                <Badge
                  colorPalette={newMethodColorPalette}
                  size="lg"
                  variant="subtle"
                >
                  <MaterialSymbol>{newMethodIcon}</MaterialSymbol>
                  {newMethodName.trim() ||
                    t("paymentMethods.add.previewPlaceholder", {
                      defaultValue: "Preview",
                    })}
                </Badge>
              </Box>
              <Button
                alignSelf="end"
                colorPalette="primary"
                onClick={handleAddMethod}
                disabled={
                  !newMethodName.trim() ||
                  newAllowedShippingMethodIds.length === 0
                }
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("paymentMethods.add.button", {
                  defaultValue: "Add method",
                })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>

        <CopyFromChannelCard
          title={t("paymentMethods.copy.title", {
            defaultValue: "Copy From Channel",
          })}
          description={t("paymentMethods.copy.description", {
            defaultValue:
              "Replace the current draft with methods from another channel. Review and save to apply.",
          })}
          label={t("paymentMethods.copy.label", {
            defaultValue: "Source channel",
          })}
          placeholder={t("paymentMethods.copy.placeholder", {
            defaultValue: "Select source channel",
          })}
          buttonLabel={t("paymentMethods.copy.button", {
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
                {t("paymentMethods.list.title", {
                  defaultValue: "Configured Methods",
                })}
              </Card.Title>
              <Card.Description>
                {t("paymentMethods.list.description", {
                  defaultValue:
                    "Reorder, enable, archive, and decide which shipping methods can use each payment method.",
                })}
              </Card.Description>
            </Stack>
            <ConfigurableSettingsTranslationPanel
              channelId={channel?.id}
              kind="paymentMethodsSettings"
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
            {isLoading ? (
              <Text color="fg.muted" fontSize="sm">
                {t("paymentMethods.loading", {
                  defaultValue: "Loading payment methods...",
                })}
              </Text>
            ) : null}
            {methods.map((method, index) => (
              <PaymentMethodRow
                key={method.id}
                method={method}
                index={index}
                methodsLength={methods.length}
                methods={methods}
                updateMethod={updateMethod}
                movePaymentMethod={(direction) =>
                  setMethods((currentMethods) =>
                    moveMethod(currentMethods, method.id, direction),
                  )
                }
              />
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Separator />
      <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Text color="fg.muted" fontSize="sm">
          {t("paymentMethods.footer", {
            count: methods.length,
            defaultValue: "{{count}} methods configured",
          })}
        </Text>
        <Button colorPalette="primary" loading={isSaving} onClick={handleSave}>
          <MaterialSymbol>save</MaterialSymbol>
          {t("paymentMethods.save", { defaultValue: "Save methods" })}
        </Button>
      </HStack>
    </Stack>
  );
}

function PaymentMethodRow({
  method,
  index,
  methodsLength,
  methods,
  updateMethod,
  movePaymentMethod,
}: {
  method: PaymentMethodDefinition;
  index: number;
  methodsLength: number;
  methods: PaymentMethodDefinition[];
  updateMethod: (id: string, patch: Partial<PaymentMethodDefinition>) => void;
  movePaymentMethod: (direction: -1 | 1) => void;
}) {
  const { t } = useT();

  return (
    <Box
      bg={method.archived ? "bg.subtle" : "bg.panel"}
      borderRadius="xl"
      borderWidth="1px"
      opacity={method.archived ? 0.72 : 1}
      p={4}
    >
      <SimpleGrid columns={{ base: 1, xl: 12 }} gap={3} alignItems="end">
        <VStack align="start" gap={2} gridColumn={{ xl: "span 3" }}>
          <HStack gap={2} minW={0} flexWrap="wrap">
            <Badge
              colorPalette={getPaymentMethodColorPalette(method.id, {
                methods,
              })}
              maxW="full"
            >
              <MaterialSymbol>
                {getPaymentMethodIcon(method.id, { methods })}
              </MaterialSymbol>
              {method.name}
            </Badge>
            <Badge size="sm" variant="subtle">
              {providerKindLabel(method.providerKind, t)}
            </Badge>
            {method.isDefault ? (
              <Badge size="sm" variant="subtle">
                {t("paymentMethods.default", {
                  defaultValue: "Default",
                })}
              </Badge>
            ) : null}
            {method.archived ? (
              <Badge colorPalette="orange" size="sm" variant="subtle">
                {t("paymentMethods.archived", {
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
          label={t("paymentMethods.fields.name", {
            defaultValue: "Name",
          })}
          gridColumn={{ xl: "span 3" }}
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
          label={t("paymentMethods.fields.providerKind", {
            defaultValue: "Provider kind",
          })}
          gridColumn={{ xl: "span 2" }}
        >
          <ProviderKindSelect
            value={method.providerKind}
            onChange={(value) =>
              updateMethod(method.id, { providerKind: value })
            }
          />
        </Field>
        <Field
          label={t("paymentMethods.fields.icon", {
            defaultValue: "Icon",
          })}
          gridColumn={{ xl: "span 2" }}
        >
          <IconSelect
            value={method.icon}
            onChange={(value) => updateMethod(method.id, { icon: value })}
            items={ICON_OPTION_ITEMS}
            fallbackIcon="payments"
          />
        </Field>
        <Field
          label={t("paymentMethods.fields.color", {
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

        <Box gridColumn={{ xl: "span 10 / 13" }}>
          <ShippingEligibilityField
            value={method.allowedShippingMethodIds}
            onChange={(allowedShippingMethodIds) =>
              updateMethod(method.id, { allowedShippingMethodIds })
            }
          />
        </Box>

        <HStack
          alignSelf="center"
          gap={2}
          gridColumn={{ xl: "span 12" }}
          justify="end"
        >
          <Switch
            checked={method.storefrontEnabled === true && !method.archived}
            disabled={method.archived}
            onCheckedChange={({ checked }) =>
              updateMethod(method.id, { storefrontEnabled: checked })
            }
          >
            {t("paymentMethods.fields.storefrontEnabled", {
              defaultValue: "Storefront checkout",
            })}
          </Switch>
          <Switch
            checked={method.enabled && !method.archived}
            disabled={method.archived}
            onCheckedChange={({ checked }) =>
              updateMethod(method.id, { enabled: checked })
            }
          >
            {t("paymentMethods.fields.enabled", {
              defaultValue: "Enabled",
            })}
          </Switch>
          <IconButton
            aria-label={t("paymentMethods.moveUp", {
              defaultValue: "Move up",
            })}
            disabled={index === 0}
            onClick={() => movePaymentMethod(-1)}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>arrow_upward</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={t("paymentMethods.moveDown", {
              defaultValue: "Move down",
            })}
            disabled={index === methodsLength - 1}
            onClick={() => movePaymentMethod(1)}
            size="sm"
            variant="outline"
          >
            <MaterialSymbol>arrow_downward</MaterialSymbol>
          </IconButton>
          <IconButton
            aria-label={
              method.archived
                ? t("paymentMethods.restore", {
                    defaultValue: "Restore",
                  })
                : t("paymentMethods.archive", {
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
  );
}

function ShippingEligibilityField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useT();

  return (
    <Field
      label={t("paymentMethods.fields.allowedShippingMethods", {
        defaultValue: "Allowed shipping methods",
      })}
    >
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={2}>
        {SHIPPING_METHOD_IDS.map((shippingMethodId) => (
          <Checkbox.Root
            key={shippingMethodId}
            checked={value.includes(shippingMethodId)}
            onCheckedChange={({ checked }) =>
              onChange(toggleId(value, shippingMethodId, checked === true))
            }
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>
              {t(`ShippingOptions.${shippingMethodId}`, {
                defaultValue: humanizeBusinessTaxonomyId(shippingMethodId),
              })}
            </Checkbox.Label>
          </Checkbox.Root>
        ))}
      </SimpleGrid>
    </Field>
  );
}

function ProviderKindSelect({
  value,
  onChange,
}: {
  value: PaymentMethodProviderKind;
  onChange: (value: PaymentMethodProviderKind) => void;
}) {
  const { t } = useT();

  return (
    <Select.Root
      collection={PROVIDER_KIND_COLLECTION}
      value={[value]}
      onValueChange={({ value: next }) =>
        onChange((next[0] as PaymentMethodProviderKind | undefined) ?? "manual")
      }
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText>{providerKindLabel(value, t)}</Select.ValueText>
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {PROVIDER_KIND_OPTIONS.map((option) => (
              <Select.Item item={option} key={option.value}>
                {providerKindLabel(option.value, t)}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

function providerKindLabel(
  providerKind: PaymentMethodProviderKind,
  t: ReturnType<typeof useT>["t"],
) {
  return t(`paymentMethods.providerKind.${providerKind}`, {
    defaultValue: humanizeBusinessTaxonomyId(providerKind),
  });
}
