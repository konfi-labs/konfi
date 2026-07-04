"use client";

import { useChannels } from "@/context/channels";
import { useCatalog } from "@/context/catalog";
import { useT } from "@/i18n/client";
import {
  AllegroImportSettings,
  DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
  type AllegroPublicationSettings,
  canUseProductForAllegroImport,
  clearAllegroImportSettings,
  loadAllegroImportSettings,
  normalizeAllegroPublicationSettings,
  saveAllegroImportSettings,
} from "@/lib/allegro-import-settings";
import type { AllegroAuthStatus } from "@/lib/allegro-order-import";
import {
  EMPTY_ALLEGRO_PUBLICATION_SETTINGS_OPTIONS,
  type AllegroPublicationSettingsOption,
  type AllegroPublicationSettingsOptionsResponse,
  isAllegroPublicationSettingsOptionsResponse,
} from "@/lib/allegro-publication-settings-options";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Field,
  HStack,
  Input,
  Portal,
  Select,
  Separator,
  SimpleGrid,
  Skeleton,
  Spinner,
  Switch,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol, toaster } from "@konfi/components";
import { PriceTypeEnum, Product } from "@konfi/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const emptyPublicationOptionValue = "__konfi_empty_publication_option__";

interface PublicationOptionSelectProps {
  emptyLabel: string;
  fallbackLabel: string;
  helperText?: string;
  disabled: boolean;
  label: string;
  loading: boolean;
  onChange: (value: string) => void;
  options: AllegroPublicationSettingsOption[];
  placeholder: string;
  value: string;
}

const PublicationOptionSelect = ({
  emptyLabel,
  fallbackLabel,
  helperText,
  disabled,
  label,
  loading,
  onChange,
  options,
  placeholder,
  value,
}: PublicationOptionSelectProps) => {
  const trimmedValue = value.trim();
  const hasSelectedOption = options.some(
    (option) => option.id === trimmedValue,
  );
  const collection = useMemo(() => {
    const items = [
      { label: emptyLabel, value: emptyPublicationOptionValue },
      ...options.map((option) => ({
        label: `${option.name} (${option.id})`,
        value: option.id,
      })),
    ];

    if (trimmedValue && !hasSelectedOption) {
      items.push({
        label: `${fallbackLabel}: ${trimmedValue}`,
        value: trimmedValue,
      });
    }

    return createListCollection({ items });
  }, [emptyLabel, fallbackLabel, hasSelectedOption, options, trimmedValue]);

  const selectedValue = trimmedValue
    ? [trimmedValue]
    : [emptyPublicationOptionValue];

  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Select.Root
        collection={collection}
        disabled={disabled || loading}
        value={selectedValue}
        onValueChange={(details) => {
          const nextValue = details.value[0] ?? emptyPublicationOptionValue;
          onChange(nextValue === emptyPublicationOptionValue ? "" : nextValue);
        }}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText placeholder={placeholder} />
          </Select.Trigger>
          <Select.IndicatorGroup>
            {loading && (
              <Spinner size="xs" borderWidth="1.5px" color="fg.muted" />
            )}
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
      {helperText && <Field.HelperText>{helperText}</Field.HelperText>}
    </Field.Root>
  );
};

const AllegroSettingsPage = () => {
  const { t } = useT(["allegro", "translation"]);
  const { channel } = useChannels();
  const { searchProducts } = useCatalog();
  const allegroAuthUrl = useMemo(() => {
    if (!channel?.id) {
      return "/api/auth/allegro";
    }

    const params = new URLSearchParams({ channelId: channel.id });
    return `/api/auth/allegro?${params.toString()}`;
  }, [channel?.id]);

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingAllegroAuthStatus, setLoadingAllegroAuthStatus] =
    useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPublication, setSavingPublication] = useState(false);
  const [loadingPublicationOptions, setLoadingPublicationOptions] =
    useState(false);
  const [clearing, setClearing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [publicationOptions, setPublicationOptions] =
    useState<AllegroPublicationSettingsOptionsResponse>(
      EMPTY_ALLEGRO_PUBLICATION_SETTINGS_OPTIONS,
    );
  const [publicationForm, setPublicationForm] =
    useState<AllegroPublicationSettings>(DEFAULT_ALLEGRO_PUBLICATION_SETTINGS);
  const [savedSettings, setSavedSettings] =
    useState<AllegroImportSettings | null>(null);
  const [allegroAuthStatus, setAllegroAuthStatus] =
    useState<AllegroAuthStatus | null>(null);

  const loadSettings = useCallback(async () => {
    if (!channel) {
      setSavedSettings(null);
      setLoadingSettings(false);
      return;
    }

    setLoadingSettings(true);
    try {
      const settings = await loadAllegroImportSettings(channel.id);
      setSavedSettings(settings);
      setPublicationForm(
        normalizeAllegroPublicationSettings(settings?.publication),
      );
    } catch (error) {
      console.error("Failed to load Allegro import settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.loadError", {
          defaultValue: "Failed to load Allegro import settings.",
        }),
      });
    } finally {
      setLoadingSettings(false);
    }
  }, [channel, t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadAllegroAuthStatus = useCallback(async () => {
    setLoadingAllegroAuthStatus(true);
    try {
      const response = await fetch("/api/auth/allegro/status", {
        cache: "no-store",
      });
      const payload = (await response.json()) as AllegroAuthStatus & {
        error?: string;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to load Allegro auth status");
      }

      setAllegroAuthStatus(payload);
    } catch (error) {
      console.error("Failed to check Allegro auth status:", error);
      setAllegroAuthStatus({ connected: false, user: null });
    } finally {
      setLoadingAllegroAuthStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadAllegroAuthStatus();
  }, [loadAllegroAuthStatus]);

  const loadPublicationOptions = useCallback(async () => {
    if (allegroAuthStatus && !allegroAuthStatus.connected) {
      toaster.warning({
        title: t("allegro.settings.publicationConnectTitle", {
          defaultValue: "Connect Allegro first",
        }),
        description: t("allegro.settings.publicationConnectDescription", {
          defaultValue:
            "Sign in with Allegro before loading seller shipping and warranty settings.",
        }),
      });
      return;
    }

    setLoadingPublicationOptions(true);
    try {
      const response = await fetch("/api/allegro/publication-settings", {
        cache: "no-store",
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        !isAllegroPublicationSettingsOptionsResponse(payload)
      ) {
        if (response.status === 401) {
          setAllegroAuthStatus({ connected: false, user: null });
          throw new Error("Allegro auth required");
        }

        throw new Error(
          "Invalid Allegro publication settings options response",
        );
      }

      setPublicationOptions(payload);
    } catch (error) {
      console.error("Failed to load Allegro publication settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.publicationOptionsLoadError", {
          defaultValue: "Failed to load Allegro seller settings from Allegro.",
        }),
      });
    } finally {
      setLoadingPublicationOptions(false);
    }
  }, [allegroAuthStatus, t]);

  const handleSearch = useCallback(async () => {
    if (!channel) {
      toaster.error({
        title: t("allegro.importMissingChannelTitle", {
          defaultValue: "Channel required",
        }),
        description: t("allegro.importMissingChannelDescription", {
          defaultValue: "Select a channel before importing an Allegro order.",
        }),
      });
      return;
    }

    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm.length < 2) {
      toaster.warning({
        title: t("allegro.settings.searchTooShortTitle", {
          defaultValue: "Search term too short",
        }),
        description: t("allegro.settings.searchTooShortDescription", {
          defaultValue: "Type at least 2 characters to search products.",
        }),
      });
      return;
    }

    setSearching(true);
    try {
      const results = (await searchProducts(trimmedTerm)) ?? [];
      setSearchResults(results);

      if (results.length === 0) {
        toaster.info({
          title: t("allegro.settings.noResultsTitle", {
            defaultValue: "No products found",
          }),
          description: t("allegro.settings.noResultsDescription", {
            defaultValue:
              "No active products matched your search. Try a different phrase.",
          }),
        });
      }
    } catch (error) {
      console.error("Failed to search products for Allegro settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.searchError", {
          defaultValue: "Failed to search products.",
        }),
      });
    } finally {
      setSearching(false);
    }
  }, [channel, searchProducts, searchTerm, t]);

  const handleSave = useCallback(async () => {
    if (!channel || !selectedProduct) {
      return;
    }

    if (!canUseProductForAllegroImport(selectedProduct)) {
      toaster.error({
        title: t("allegro.settings.invalidProductTitle", {
          defaultValue: "Unsupported product",
        }),
        description: t("allegro.settings.invalidProductDescription", {
          defaultValue:
            "Choose a SINGLE product with custom price enabled to avoid Allegro import item loading issues.",
        }),
      });
      return;
    }

    setSaving(true);
    try {
      const nextSettings: AllegroImportSettings = {
        ...savedSettings,
        defaultProductId: selectedProduct.id,
        defaultProductName: selectedProduct.name,
      };

      await saveAllegroImportSettings(channel.id, nextSettings);
      setSavedSettings(nextSettings);

      toaster.success({
        title: t("allegro.settings.savedTitle", {
          defaultValue: "Allegro settings saved",
        }),
        description: t("allegro.settings.savedDescription", {
          defaultValue:
            "Imported Allegro items will now use this product by default.",
        }),
      });
    } catch (error) {
      console.error("Failed to save Allegro import settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.saveError", {
          defaultValue: "Failed to save Allegro import settings.",
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [channel, savedSettings, selectedProduct, t]);

  const handlePublicationFormChange = useCallback(
    <K extends keyof AllegroPublicationSettings>(
      key: K,
      value: AllegroPublicationSettings[K],
    ) => {
      setPublicationForm((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const handleSavePublication = useCallback(async () => {
    if (!channel) return;

    setSavingPublication(true);
    try {
      const nextSettings: AllegroImportSettings = {
        ...savedSettings,
        publication: {
          ...publicationForm,
          defaultStock: Math.max(1, Math.floor(publicationForm.defaultStock)),
          handlingTime:
            publicationForm.handlingTime.trim() ||
            DEFAULT_ALLEGRO_PUBLICATION_SETTINGS.handlingTime,
          impliedWarrantyId: publicationForm.impliedWarrantyId.trim(),
          responsibleProducerId: publicationForm.responsibleProducerId.trim(),
          returnPolicyId: publicationForm.returnPolicyId.trim(),
          safetyInformationDescription:
            publicationForm.safetyInformationDescription.trim(),
          shippingRatesId: publicationForm.shippingRatesId.trim(),
          warrantyId: publicationForm.warrantyId.trim(),
        },
      };

      await saveAllegroImportSettings(channel.id, nextSettings);
      setSavedSettings(nextSettings);
      setPublicationForm(
        normalizeAllegroPublicationSettings(nextSettings.publication),
      );

      toaster.success({
        title: t("allegro.settings.publicationSavedTitle", {
          defaultValue: "Publication settings saved",
        }),
        description: t("allegro.settings.publicationSavedDescription", {
          defaultValue:
            "Allegro export will use these seller settings when publishing offers.",
        }),
      });
    } catch (error) {
      console.error("Failed to save Allegro publication settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.publicationSaveError", {
          defaultValue: "Failed to save Allegro publication settings.",
        }),
      });
    } finally {
      setSavingPublication(false);
    }
  }, [channel, publicationForm, savedSettings, t]);

  const handleClear = useCallback(async () => {
    if (!channel) {
      return;
    }

    setClearing(true);
    try {
      await clearAllegroImportSettings(channel.id);
      setSavedSettings((current) =>
        current?.publication ? { publication: current.publication } : null,
      );
      setSelectedProduct(null);
      toaster.success({
        title: t("allegro.settings.clearedTitle", {
          defaultValue: "Default product cleared",
        }),
        description: t("allegro.settings.clearedDescription", {
          defaultValue:
            "Allegro import will fall back to automatic product matching again.",
        }),
      });
    } catch (error) {
      console.error("Failed to clear Allegro import settings:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("allegro.settings.clearError", {
          defaultValue: "Failed to clear Allegro import settings.",
        }),
      });
    } finally {
      setClearing(false);
    }
  }, [channel, t]);

  return (
    <Box>
      <CustomHeading
        heading={t("allegro.settings.title", {
          defaultValue: "Allegro settings",
        })}
        mb="8"
        breadcrumb
        goBack
        t={t}
      />

      <VStack align="stretch" gap={6}>
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("allegro.settings.defaultProductTitle", {
                defaultValue: "Default import product",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("allegro.settings.defaultProductDescription", {
                defaultValue:
                  "Pick a SINGLE product with custom price enabled. Allegro imports will keep the Allegro item name and use the Allegro price as custom price on this product.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>

        <Skeleton loading={loadingSettings} borderRadius="3xl">
          <Card.Root>
            <Card.Body>
              <VStack align="stretch" gap={4}>
                <Text fontWeight="semibold">
                  {t("allegro.settings.currentSelection", {
                    defaultValue: "Currently saved default product",
                  })}
                </Text>

                {savedSettings?.defaultProductId &&
                savedSettings.defaultProductName ? (
                  <HStack justify="space-between" align="center" wrap="wrap">
                    <VStack align="flex-start" gap={1}>
                      <Text fontWeight="medium">
                        {savedSettings.defaultProductName}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        ID: {savedSettings.defaultProductId}
                      </Text>
                    </VStack>
                    <Button
                      variant="outline"
                      colorPalette="red"
                      loading={clearing}
                      onClick={() => {
                        void handleClear();
                      }}
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                      {t("actions.clear", { defaultValue: "Clear" })}
                    </Button>
                  </HStack>
                ) : (
                  <Text color="fg.muted">
                    {t("allegro.settings.noSavedProduct", {
                      defaultValue:
                        "No default Allegro import product configured yet.",
                    })}
                  </Text>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        </Skeleton>

        <Card.Root>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <Text fontWeight="semibold">
                {t("allegro.settings.searchLabel", {
                  defaultValue: "Search products",
                })}
              </Text>

              <HStack align="stretch">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t("allegro.settings.searchPlaceholder", {
                    defaultValue: "Type product name...",
                  })}
                />
                <Button
                  colorPalette="primary"
                  loading={searching}
                  onClick={() => {
                    void handleSearch();
                  }}
                >
                  <MaterialSymbol>search</MaterialSymbol>
                  {t("actions.search", { defaultValue: "Search" })}
                </Button>
              </HStack>

              {selectedProduct && (
                <Card.Root variant="outline">
                  <Card.Body>
                    <VStack align="stretch" gap={2}>
                      <Text fontWeight="semibold">
                        {t("allegro.settings.selectedProduct", {
                          defaultValue: "Selected product",
                        })}
                      </Text>
                      <Text>{selectedProduct.name}</Text>
                      <HStack wrap="wrap">
                        <Badge>
                          {t("allegro.settings.priceType", {
                            defaultValue: "Price type: {{priceType}}",
                            priceType: selectedProduct.priceType,
                          })}
                        </Badge>
                        <Badge
                          colorPalette={
                            selectedProduct.allowCustomPrice ? "success" : "red"
                          }
                        >
                          {selectedProduct.allowCustomPrice
                            ? t("allegro.settings.customPriceEnabled", {
                                defaultValue: "Custom price enabled",
                              })
                            : t("allegro.settings.customPriceDisabled", {
                                defaultValue: "Custom price disabled",
                              })}
                        </Badge>
                      </HStack>

                      {!canUseProductForAllegroImport(selectedProduct) && (
                        <Alert.Root status="warning">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Description>
                              {t("allegro.settings.invalidProductDescription", {
                                defaultValue:
                                  "Choose a SINGLE product with custom price enabled to avoid Allegro import item loading issues.",
                              })}
                            </Alert.Description>
                          </Alert.Content>
                        </Alert.Root>
                      )}

                      <HStack>
                        <Button
                          colorPalette="primary"
                          loading={saving}
                          disabled={
                            !canUseProductForAllegroImport(selectedProduct)
                          }
                          onClick={() => {
                            void handleSave();
                          }}
                        >
                          <MaterialSymbol>save</MaterialSymbol>
                          {t("actions.saveChanges", {
                            defaultValue: "Save changes",
                          })}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedProduct(null)}
                        >
                          <MaterialSymbol>close</MaterialSymbol>
                          {t("common.clearSelection", {
                            defaultValue: "Clear selection",
                          })}
                        </Button>
                      </HStack>
                    </VStack>
                  </Card.Body>
                </Card.Root>
              )}

              <Separator />

              <VStack align="stretch" gap={3}>
                {searchResults.map((product) => {
                  const validForImport = canUseProductForAllegroImport(product);

                  return (
                    <Card.Root key={product.id} variant="outline">
                      <Card.Body>
                        <HStack
                          justify="space-between"
                          align="center"
                          wrap="wrap"
                        >
                          <VStack align="flex-start" gap={1}>
                            <Text fontWeight="medium">{product.name}</Text>
                            <Text fontSize="sm" color="fg.muted">
                              ID: {product.id}
                            </Text>
                            <HStack wrap="wrap">
                              <Badge>{product.priceType}</Badge>
                              <Badge
                                colorPalette={
                                  product.allowCustomPrice ? "success" : "red"
                                }
                              >
                                {product.allowCustomPrice
                                  ? t("allegro.settings.customPriceEnabled", {
                                      defaultValue: "Custom price enabled",
                                    })
                                  : t("allegro.settings.customPriceDisabled", {
                                      defaultValue: "Custom price disabled",
                                    })}
                              </Badge>
                              {product.priceType === PriceTypeEnum.SINGLE && (
                                <Badge colorPalette="blue">
                                  {t("allegro.settings.singlePriceProduct", {
                                    defaultValue: "Single price product",
                                  })}
                                </Badge>
                              )}
                            </HStack>
                          </VStack>
                          <Button
                            variant={validForImport ? "solid" : "outline"}
                            colorPalette={validForImport ? "primary" : "gray"}
                            onClick={() => setSelectedProduct(product)}
                          >
                            <MaterialSymbol>
                              {validForImport ? "check_circle" : "rule"}
                            </MaterialSymbol>
                            {t("allegro.settings.selectProduct", {
                              defaultValue: "Select",
                            })}
                          </Button>
                        </HStack>
                      </Card.Body>
                    </Card.Root>
                  );
                })}

                {!searching &&
                  searchResults.length === 0 &&
                  searchTerm.trim().length >= 2 && (
                    <Text color="fg.muted">
                      {t("allegro.settings.noResultsHint", {
                        defaultValue: "No products found for this search yet.",
                      })}
                    </Text>
                  )}
              </VStack>
            </VStack>
          </Card.Body>
        </Card.Root>

        <Card.Root>
          <Card.Body>
            <VStack align="stretch" gap={5}>
              <HStack justify="space-between" align="flex-start" wrap="wrap">
                <Box>
                  <Text fontWeight="semibold">
                    {t("allegro.settings.publicationTitle", {
                      defaultValue: "Offer publication",
                    })}
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    {t("allegro.settings.publicationDescription", {
                      defaultValue:
                        "Configure seller services used by Allegro when Konfi publishes or updates product offers.",
                    })}
                  </Text>
                </Box>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allegroAuthStatus?.connected === false}
                  loading={loadingPublicationOptions}
                  onClick={() => {
                    void loadPublicationOptions();
                  }}
                >
                  <MaterialSymbol>sync</MaterialSymbol>
                  {t("allegro.settings.refreshPublicationOptions", {
                    defaultValue: "Refresh seller settings",
                  })}
                </Button>
              </HStack>

              {!loadingAllegroAuthStatus &&
                allegroAuthStatus?.connected === false && (
                  <Alert.Root status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("allegro.settings.publicationConnectTitle", {
                          defaultValue: "Connect Allegro first",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        {t("allegro.settings.publicationConnectDescription", {
                          defaultValue:
                            "Sign in with Allegro before loading seller shipping and warranty settings.",
                        })}
                      </Alert.Description>
                    </Alert.Content>
                    <Button
                      size="sm"
                      colorPalette="primary"
                      onClick={() => {
                        window.location.href = allegroAuthUrl;
                      }}
                    >
                      <MaterialSymbol>login</MaterialSymbol>
                      {t("allegro.settings.publicationConnectButton", {
                        defaultValue: "Sign in with Allegro",
                      })}
                    </Button>
                  </Alert.Root>
                )}

              <Switch.Root
                checked={publicationForm.enabled}
                onCheckedChange={(details) => {
                  handlePublicationFormChange("enabled", details.checked);
                  if (details.checked) void loadPublicationOptions();
                }}
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>
                  {t("allegro.settings.publicationEnabled", {
                    defaultValue: "Enable offer publication",
                  })}
                </Switch.Label>
              </Switch.Root>

              <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                <PublicationOptionSelect
                  emptyLabel={t("allegro.settings.noPublicationOption", {
                    defaultValue: "Do not send this setting",
                  })}
                  fallbackLabel={t("allegro.settings.savedPublicationId", {
                    defaultValue: "Saved ID",
                  })}
                  disabled={allegroAuthStatus?.connected === false}
                  helperText={t("allegro.settings.shippingRatesIdHelp", {
                    defaultValue:
                      "Allegro delivery price list used for published offers.",
                  })}
                  label={t("allegro.settings.shippingRatesId", {
                    defaultValue: "Shipping rates",
                  })}
                  loading={loadingPublicationOptions}
                  options={publicationOptions.shippingRates}
                  placeholder={t("allegro.settings.selectShippingRates", {
                    defaultValue: "Select shipping rates",
                  })}
                  value={publicationForm.shippingRatesId}
                  onChange={(value) =>
                    handlePublicationFormChange("shippingRatesId", value)
                  }
                />

                <Field.Root>
                  <Field.Label>
                    {t("allegro.settings.handlingTime", {
                      defaultValue: "Handling time",
                    })}
                  </Field.Label>
                  <Input
                    value={publicationForm.handlingTime}
                    onChange={(event) =>
                      handlePublicationFormChange(
                        "handlingTime",
                        event.target.value,
                      )
                    }
                    placeholder="P3D"
                  />
                  <Field.HelperText>
                    {t("allegro.settings.handlingTimeHelp", {
                      defaultValue:
                        "ISO 8601 duration accepted by Allegro, for example P3D.",
                    })}
                  </Field.HelperText>
                </Field.Root>

                <PublicationOptionSelect
                  emptyLabel={t("allegro.settings.noPublicationOption", {
                    defaultValue: "Do not send this setting",
                  })}
                  fallbackLabel={t("allegro.settings.savedPublicationId", {
                    defaultValue: "Saved ID",
                  })}
                  disabled={allegroAuthStatus?.connected === false}
                  label={t("allegro.settings.returnPolicyId", {
                    defaultValue: "Return policy",
                  })}
                  loading={loadingPublicationOptions}
                  options={publicationOptions.returnPolicies}
                  placeholder={t("allegro.settings.selectReturnPolicy", {
                    defaultValue: "Select return policy",
                  })}
                  value={publicationForm.returnPolicyId}
                  onChange={(value) =>
                    handlePublicationFormChange("returnPolicyId", value)
                  }
                />

                <PublicationOptionSelect
                  emptyLabel={t("allegro.settings.noPublicationOption", {
                    defaultValue: "Do not send this setting",
                  })}
                  fallbackLabel={t("allegro.settings.savedPublicationId", {
                    defaultValue: "Saved ID",
                  })}
                  disabled={allegroAuthStatus?.connected === false}
                  label={t("allegro.settings.impliedWarrantyId", {
                    defaultValue: "Implied warranty",
                  })}
                  loading={loadingPublicationOptions}
                  options={publicationOptions.impliedWarranties}
                  placeholder={t("allegro.settings.selectImpliedWarranty", {
                    defaultValue: "Select implied warranty",
                  })}
                  value={publicationForm.impliedWarrantyId}
                  onChange={(value) =>
                    handlePublicationFormChange("impliedWarrantyId", value)
                  }
                />

                <PublicationOptionSelect
                  emptyLabel={t("allegro.settings.noPublicationOption", {
                    defaultValue: "Do not send this setting",
                  })}
                  fallbackLabel={t("allegro.settings.savedPublicationId", {
                    defaultValue: "Saved ID",
                  })}
                  disabled={allegroAuthStatus?.connected === false}
                  label={t("allegro.settings.warrantyId", {
                    defaultValue: "Warranty",
                  })}
                  loading={loadingPublicationOptions}
                  options={publicationOptions.warranties}
                  placeholder={t("allegro.settings.selectWarranty", {
                    defaultValue: "Select warranty",
                  })}
                  value={publicationForm.warrantyId}
                  onChange={(value) =>
                    handlePublicationFormChange("warrantyId", value)
                  }
                />

                <PublicationOptionSelect
                  emptyLabel={t("allegro.settings.noPublicationOption", {
                    defaultValue: "Do not send this setting",
                  })}
                  fallbackLabel={t("allegro.settings.savedPublicationId", {
                    defaultValue: "Saved ID",
                  })}
                  disabled={allegroAuthStatus?.connected === false}
                  helperText={t("allegro.settings.responsibleProducerHelp", {
                    defaultValue:
                      "Responsible producer configured in the Allegro seller account.",
                  })}
                  label={t("allegro.settings.responsibleProducer", {
                    defaultValue: "Responsible producer",
                  })}
                  loading={loadingPublicationOptions}
                  options={publicationOptions.responsibleProducers}
                  placeholder={t("allegro.settings.selectResponsibleProducer", {
                    defaultValue: "Select responsible producer",
                  })}
                  value={publicationForm.responsibleProducerId}
                  onChange={(value) =>
                    handlePublicationFormChange("responsibleProducerId", value)
                  }
                />

                <Field.Root>
                  <Field.Label>
                    {t("allegro.settings.defaultStock", {
                      defaultValue: "Default stock",
                    })}
                  </Field.Label>
                  <Input
                    max={999999}
                    min={1}
                    type="number"
                    value={publicationForm.defaultStock}
                    onChange={(event) =>
                      handlePublicationFormChange(
                        "defaultStock",
                        Number(event.target.value),
                      )
                    }
                  />
                </Field.Root>
              </SimpleGrid>

              <HStack>
                <Button
                  colorPalette="primary"
                  loading={savingPublication}
                  onClick={() => {
                    void handleSavePublication();
                  }}
                >
                  <MaterialSymbol>save</MaterialSymbol>
                  {t("actions.saveChanges", {
                    defaultValue: "Save changes",
                  })}
                </Button>
              </HStack>
            </VStack>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Box>
  );
};

export default AllegroSettingsPage;
