"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { StickyActionBar } from "@/components/configuration/taxonomy/StickyActionBar";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadCurrencySettings,
  saveCurrencySettings,
} from "@/lib/currency-settings.client";
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
import type {
  CurrencyCode,
  CurrencyConversionMode,
  CurrencyConversionOffset,
  CurrencyConversionRate,
  CurrencyDefinition,
} from "@konfi/types";
import {
  DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
  DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES,
  DEFAULT_CURRENCY_CODE,
  humanizeCurrencyCode,
  normalizeCurrencyCode,
  normalizeCurrencySettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_LOCALE = "pl-PL";
const DEFAULT_MINOR_UNIT_DIGITS = 2;
const CUSTOM_CURRENCY_VALUE = "__custom__";

function stringifyRateMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && "seconds" in value) {
    const seconds = (value as { seconds?: unknown }).seconds;
    return typeof seconds === "number" ? String(seconds) : "";
  }

  return String(value);
}

function getCurrencyRateFingerprint(rate: CurrencyConversionRate): string {
  return [
    rate.fromCurrencyCode,
    rate.toCurrencyCode,
    rate.source ?? "manual",
    String(rate.rate),
    rate.metadata?.providerRateId ?? "",
    stringifyRateMetadataValue(rate.fetchedAt ?? rate.metadata?.fetchedAt),
    stringifyRateMetadataValue(rate.updatedAt ?? rate.metadata?.updatedAt),
  ].join("::");
}

function createCurrencyRateDraftIds(
  rates: readonly CurrencyConversionRate[],
): string[] {
  const seen = new Map<string, number>();

  return rates.map((rate) => {
    const fingerprint = getCurrencyRateFingerprint(rate);
    const occurrence = seen.get(fingerprint) ?? 0;
    seen.set(fingerprint, occurrence + 1);

    return occurrence === 0
      ? `rate:${fingerprint}`
      : `rate:${fingerprint}:duplicate-${occurrence}`;
  });
}

type CommonCurrencyPreset = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
  minorUnitDigits: number;
};

const COMMON_CURRENCY_PRESETS: readonly CommonCurrencyPreset[] = [
  {
    code: "PLN",
    name: "Polish Złoty",
    symbol: "zł",
    locale: "pl-PL",
    minorUnitDigits: 2,
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    locale: "de-DE",
    minorUnitDigits: 2,
  },
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    locale: "en-US",
    minorUnitDigits: 2,
  },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    locale: "en-GB",
    minorUnitDigits: 2,
  },
  {
    code: "CHF",
    name: "Swiss Franc",
    symbol: "CHF",
    locale: "de-CH",
    minorUnitDigits: 2,
  },
  {
    code: "CZK",
    name: "Czech Koruna",
    symbol: "Kč",
    locale: "cs-CZ",
    minorUnitDigits: 2,
  },
  {
    code: "SEK",
    name: "Swedish Krona",
    symbol: "kr",
    locale: "sv-SE",
    minorUnitDigits: 2,
  },
  {
    code: "NOK",
    name: "Norwegian Krone",
    symbol: "kr",
    locale: "nb-NO",
    minorUnitDigits: 2,
  },
  {
    code: "DKK",
    name: "Danish Krone",
    symbol: "kr",
    locale: "da-DK",
    minorUnitDigits: 2,
  },
  {
    code: "JPY",
    name: "Japanese Yen",
    symbol: "¥",
    locale: "ja-JP",
    minorUnitDigits: 0,
  },
  {
    code: "CNY",
    name: "Chinese Yuan",
    symbol: "¥",
    locale: "zh-CN",
    minorUnitDigits: 2,
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "C$",
    locale: "en-CA",
    minorUnitDigits: 2,
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    locale: "en-AU",
    minorUnitDigits: 2,
  },
  {
    code: "HUF",
    name: "Hungarian Forint",
    symbol: "Ft",
    locale: "hu-HU",
    minorUnitDigits: 2,
  },
  {
    code: "RON",
    name: "Romanian Leu",
    symbol: "lei",
    locale: "ro-RO",
    minorUnitDigits: 2,
  },
  {
    code: "BGN",
    name: "Bulgarian Lev",
    symbol: "лв",
    locale: "bg-BG",
    minorUnitDigits: 2,
  },
  {
    code: "UAH",
    name: "Ukrainian Hryvnia",
    symbol: "₴",
    locale: "uk-UA",
    minorUnitDigits: 2,
  },
];

const COMMON_LOCALE_OPTIONS = [
  { label: "Polski (Polska) — pl-PL", value: "pl-PL" },
  { label: "Deutsch (Deutschland) — de-DE", value: "de-DE" },
  { label: "English (United States) — en-US", value: "en-US" },
  { label: "English (United Kingdom) — en-GB", value: "en-GB" },
  { label: "Français (France) — fr-FR", value: "fr-FR" },
  { label: "Italiano (Italia) — it-IT", value: "it-IT" },
  { label: "Español (España) — es-ES", value: "es-ES" },
  { label: "Čeština (Česko) — cs-CZ", value: "cs-CZ" },
  { label: "Magyar (Magyarország) — hu-HU", value: "hu-HU" },
  { label: "Română (România) — ro-RO", value: "ro-RO" },
  { label: "Български (България) — bg-BG", value: "bg-BG" },
  { label: "Українська (Україна) — uk-UA", value: "uk-UA" },
  { label: "Nederlands (Nederland) — nl-NL", value: "nl-NL" },
  { label: "Svenska (Sverige) — sv-SE", value: "sv-SE" },
  { label: "Norsk bokmål (Norge) — nb-NO", value: "nb-NO" },
  { label: "Dansk (Danmark) — da-DK", value: "da-DK" },
  { label: "Suomi (Suomi) — fi-FI", value: "fi-FI" },
  { label: "Português (Portugal) — pt-PT", value: "pt-PT" },
  { label: "日本語 (日本) — ja-JP", value: "ja-JP" },
  { label: "中文 (中国) — zh-CN", value: "zh-CN" },
] as const;

const LOCALE_COLLECTION = createListCollection<{
  label: string;
  value: string;
}>({
  items: COMMON_LOCALE_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
  })),
});

function normalizeDraftCurrencies(
  settings: ReturnType<typeof normalizeCurrencySettings>,
): CurrencyDefinition[] {
  return normalizeCurrencySettings(settings).currencies.map(
    (currency, index) => ({
      ...currency,
      order: index,
    }),
  );
}

function renumberCurrencies(
  currencies: readonly CurrencyDefinition[],
): CurrencyDefinition[] {
  return currencies.map((currency, index) => ({
    ...currency,
    order: index,
  }));
}

function moveCurrency(
  currencies: readonly CurrencyDefinition[],
  code: CurrencyCode,
  direction: -1 | 1,
): CurrencyDefinition[] {
  const index = currencies.findIndex((currency) => currency.code === code);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= currencies.length) {
    return [...currencies];
  }

  const nextCurrencies = [...currencies];
  const [currency] = nextCurrencies.splice(index, 1);
  if (!currency) {
    return [...currencies];
  }

  nextCurrencies.splice(targetIndex, 0, currency);
  return renumberCurrencies(nextCurrencies);
}

function parseNumberInput(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createDraftCurrency(
  code: CurrencyCode,
  order: number,
): CurrencyDefinition {
  const preset = COMMON_CURRENCY_PRESETS.find((item) => item.code === code);

  return {
    code,
    name: preset?.name ?? humanizeCurrencyCode(code),
    symbol: preset?.symbol ?? code,
    locale: preset?.locale ?? DEFAULT_LOCALE,
    minorUnitDigits: preset?.minorUnitDigits ?? DEFAULT_MINOR_UNIT_DIGITS,
    enabled: true,
    archived: false,
    order,
    isDefault: false,
  };
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}

function formatTimestamp(value: unknown, locale: string): string | null {
  const date = isTimestampLike(value)
    ? value.toDate()
    : value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function CurrenciesPage() {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { channel, channels } = useChannels();
  const { currencySettings, refreshStoreSettings } = useConfiguration();
  const [currencies, setCurrencies] = useState<CurrencyDefinition[]>(() =>
    normalizeDraftCurrencies(currencySettings),
  );
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState<CurrencyCode>(
    currencySettings.defaultCurrencyCode,
  );
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<CurrencyCode>(
    currencySettings.conversion.baseCurrencyCode,
  );
  const [conversionMode, setConversionMode] = useState<CurrencyConversionMode>(
    currencySettings.conversion.mode,
  );
  const [rates, setRates] = useState<CurrencyConversionRate[]>(
    currencySettings.conversion.rates,
  );
  const nextRateDraftIdRef = useRef(0);
  const [rateDraftIds, setRateDraftIds] = useState<string[]>(() =>
    createCurrencyRateDraftIds(currencySettings.conversion.rates),
  );
  const [offsets, setOffsets] = useState<CurrencyConversionOffset[]>(
    currencySettings.conversion.offsets,
  );
  const [newCurrencyPreset, setNewCurrencyPreset] = useState<string>("");
  const [newCustomCurrencyCode, setNewCustomCurrencyCode] = useState("");
  const [copySourceChannelId, setCopySourceChannelId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [pristine, setPristine] = useState<string>(() =>
    JSON.stringify({
      currencies: normalizeDraftCurrencies(currencySettings),
      defaultCurrencyCode: currencySettings.defaultCurrencyCode,
      baseCurrencyCode: currencySettings.conversion.baseCurrencyCode,
      conversionMode: currencySettings.conversion.mode,
      rates: currencySettings.conversion.rates,
      offsets: currencySettings.conversion.offsets,
    }),
  );

  useEffect(() => {
    const normalized = normalizeCurrencySettings(currencySettings);
    const normalizedCurrencies = normalizeDraftCurrencies(normalized);
    setCurrencies(normalizedCurrencies);
    setDefaultCurrencyCode(normalized.defaultCurrencyCode);
    setBaseCurrencyCode(normalized.conversion.baseCurrencyCode);
    setConversionMode(normalized.conversion.mode);
    setRates(normalized.conversion.rates);
    setRateDraftIds(createCurrencyRateDraftIds(normalized.conversion.rates));
    setOffsets(normalized.conversion.offsets);
    setPristine(
      JSON.stringify({
        currencies: normalizedCurrencies,
        defaultCurrencyCode: normalized.defaultCurrencyCode,
        baseCurrencyCode: normalized.conversion.baseCurrencyCode,
        conversionMode: normalized.conversion.mode,
        rates: normalized.conversion.rates,
        offsets: normalized.conversion.offsets,
      }),
    );
  }, [currencySettings]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        currencies,
        defaultCurrencyCode,
        baseCurrencyCode,
        conversionMode,
        rates,
        offsets,
      }),
    [
      currencies,
      defaultCurrencyCode,
      baseCurrencyCode,
      conversionMode,
      rates,
      offsets,
    ],
  );
  const dirty = currentSnapshot !== pristine;

  const language = i18n.resolvedLanguage ?? "en";
  const configuredCodes = useMemo(
    () => new Set(currencies.map((currency) => currency.code)),
    [currencies],
  );
  const activeCurrencies = useMemo(
    () =>
      currencies.filter((currency) => currency.enabled && !currency.archived),
    [currencies],
  );
  const currencyOptions = useMemo(
    () =>
      activeCurrencies.map((currency) => ({
        label: `${currency.code} — ${currency.name}`,
        value: currency.code,
      })),
    [activeCurrencies],
  );
  const currencyCollection = useMemo(
    () => createListCollection({ items: currencyOptions }),
    [currencyOptions],
  );
  const addCurrencyOptions = useMemo(() => {
    const presetItems = COMMON_CURRENCY_PRESETS.filter(
      (preset) => !configuredCodes.has(preset.code),
    ).map((preset) => ({
      label: `${preset.code} — ${preset.name}`,
      value: preset.code,
    }));

    return [
      ...presetItems,
      {
        label: t("currencies.add.customOption", {
          defaultValue: "Other / custom code…",
        }),
        value: CUSTOM_CURRENCY_VALUE,
      },
    ];
  }, [configuredCodes, t]);
  const addCurrencyCollection = useMemo(
    () => createListCollection({ items: addCurrencyOptions }),
    [addCurrencyOptions],
  );
  const modeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("currencies.modes.disabled", {
              defaultValue: "Disabled",
            }),
            value: "disabled",
          },
          {
            label: t("currencies.modes.manual", {
              defaultValue: "Manual",
            }),
            value: "manual",
          },
          {
            label: t("currencies.modes.automatic", {
              defaultValue: "Automatic",
            }),
            value: "automatic",
          },
        ],
      }),
    [t],
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
  const copySourceCollection = useMemo(
    () => createListCollection({ items: channelOptions }),
    [channelOptions],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const enabledCurrencyCodes = new Set(
      activeCurrencies.map((currency) => currency.code),
    );
    const seenCurrencyCodes = new Set<CurrencyCode>();
    const defaultCurrency = currencies.find(
      (currency) => currency.code === defaultCurrencyCode,
    );

    for (const currency of currencies) {
      if (seenCurrencyCodes.has(currency.code)) {
        errors.push(
          t("currencies.validation.duplicateCode", {
            code: currency.code,
            defaultValue: "{{code}} is configured more than once.",
          }),
        );
      }
      seenCurrencyCodes.add(currency.code);
    }

    if (enabledCurrencyCodes.size === 0) {
      errors.push(
        t("currencies.validation.noEnabledCurrencies", {
          defaultValue: "Enable at least one currency before saving.",
        }),
      );
    }

    if (
      !defaultCurrency ||
      defaultCurrency.archived ||
      !defaultCurrency.enabled
    ) {
      errors.push(
        t("currencies.validation.defaultUnavailable", {
          defaultValue: "The default currency must be enabled and active.",
        }),
      );
    }

    if (!enabledCurrencyCodes.has(baseCurrencyCode)) {
      errors.push(
        t("currencies.validation.baseUnavailable", {
          defaultValue:
            "The conversion base currency must be enabled and active.",
        }),
      );
    }

    for (const rate of rates) {
      const from = normalizeCurrencyCode(rate.fromCurrencyCode);
      const to = normalizeCurrencyCode(rate.toCurrencyCode);

      if (
        !from ||
        !to ||
        !enabledCurrencyCodes.has(from) ||
        !enabledCurrencyCodes.has(to)
      ) {
        errors.push(
          t("currencies.validation.invalidRateCurrency", {
            defaultValue:
              "Every rate must use enabled source and target currencies.",
          }),
        );
      }

      if (!Number.isFinite(rate.rate) || rate.rate <= 0) {
        errors.push(
          t("currencies.validation.invalidRate", {
            defaultValue: "Every rate must be greater than 0.",
          }),
        );
      }

      if (
        from === defaultCurrencyCode &&
        to === defaultCurrencyCode &&
        rate.rate !== 1
      ) {
        errors.push(
          t("currencies.validation.invalidSelfRate", {
            defaultValue: "The default currency self-rate must be 1.0.",
          }),
        );
      }
    }

    for (const offset of offsets) {
      const target = normalizeCurrencyCode(offset.targetCurrencyCode);
      if (!target || !enabledCurrencyCodes.has(target)) {
        errors.push(
          t("currencies.validation.invalidOffsetCurrency", {
            defaultValue:
              "Every fixed offset must use an enabled target currency.",
          }),
        );
      }
    }

    return Array.from(new Set(errors));
  }, [
    activeCurrencies,
    baseCurrencyCode,
    currencies,
    defaultCurrencyCode,
    offsets,
    rates,
    t,
  ]);

  const defaultChangeWarning =
    channel?.currency && channel.currency !== defaultCurrencyCode
      ? t("currencies.defaultChangeWarning", {
          currentCurrency: channel.currency,
          nextCurrency: defaultCurrencyCode,
          defaultValue:
            "Changing the default from {{currentCurrency}} to {{nextCurrency}} does not migrate existing prices. Review product price data before using the new default.",
        })
      : null;

  const updateCurrency = (
    code: CurrencyCode,
    patch: Partial<CurrencyDefinition>,
  ) => {
    setCurrencies((currentCurrencies) =>
      currentCurrencies.map((currency) =>
        currency.code === code ? { ...currency, ...patch } : currency,
      ),
    );
  };

  const handleAddCurrency = () => {
    const rawCode =
      newCurrencyPreset === CUSTOM_CURRENCY_VALUE
        ? newCustomCurrencyCode
        : newCurrencyPreset;
    const code = normalizeCurrencyCode(rawCode);

    if (!code) {
      toaster.error({
        title: t("currencies.invalidCode.title", {
          defaultValue: "Currency was not added",
        }),
        description: t("currencies.invalidCode.description", {
          defaultValue: "Enter a valid 3-letter ISO currency code.",
        }),
      });
      return;
    }

    if (currencies.some((currency) => currency.code === code)) {
      toaster.error({
        title: t("currencies.duplicateCode.title", {
          defaultValue: "Currency already exists",
        }),
        description: t("currencies.duplicateCode.description", {
          code,
          defaultValue: "{{code}} is already configured for this channel.",
        }),
      });
      return;
    }

    setCurrencies((currentCurrencies) =>
      renumberCurrencies([
        ...currentCurrencies,
        createDraftCurrency(code, currentCurrencies.length),
      ]),
    );
    setNewCurrencyPreset("");
    setNewCustomCurrencyCode("");
  };

  const handleCopyFromChannel = async () => {
    if (!copySourceChannelId) {
      return;
    }

    setIsCopying(true);
    try {
      const sourceSettings = await loadCurrencySettings(copySourceChannelId);
      const normalized = normalizeCurrencySettings(sourceSettings);
      setCurrencies(normalizeDraftCurrencies(normalized));
      setDefaultCurrencyCode(normalized.defaultCurrencyCode);
      setBaseCurrencyCode(normalized.conversion.baseCurrencyCode);
      setConversionMode(normalized.conversion.mode);
      setRates(normalized.conversion.rates);
      setRateDraftIds(createCurrencyRateDraftIds(normalized.conversion.rates));
      setOffsets(normalized.conversion.offsets);
      setCopySourceChannelId("");
      toaster.success({
        title: t("currencies.copy.loadedTitle", {
          defaultValue: "Currency settings copied",
        }),
        description: t("currencies.copy.loadedDescription", {
          defaultValue: "Review the copied settings and save them here.",
        }),
      });
    } catch (error) {
      console.error("Failed to copy currency settings:", error);
      toaster.error({
        title: t("currencies.copy.failedTitle", {
          defaultValue: "Currency settings were not copied",
        }),
        description: t("currencies.copy.failedDescription", {
          defaultValue: "The source channel settings could not be loaded.",
        }),
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleSave = async () => {
    if (!channel) {
      toaster.error({
        title: t("currencies.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("currencies.channelRequired.description", {
          defaultValue: "Select a channel before saving currency settings.",
        }),
      });
      return;
    }

    if (validationErrors.length > 0) {
      toaster.error({
        title: t("currencies.validationFailed.title", {
          defaultValue: "Currency settings were not saved",
        }),
        description: t("currencies.validationFailed.description", {
          defaultValue: "Resolve the highlighted validation issues first.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveCurrencySettings(
        channel.id,
        normalizeCurrencySettings({
          defaultCurrencyCode,
          currencies: renumberCurrencies(currencies),
          conversion: {
            enabled: conversionMode !== "disabled",
            mode: conversionMode,
            baseCurrencyCode,
            rates,
            offsets,
            automatic: {
              ...currencySettings.conversion.automatic,
              enabled: conversionMode === "automatic",
              provider:
                currencySettings.conversion.automatic?.provider ??
                DEFAULT_AUTOMATIC_CURRENCY_RATE_PROVIDER,
              refreshIntervalMinutes:
                currencySettings.conversion.automatic?.refreshIntervalMinutes ??
                DEFAULT_AUTOMATIC_CURRENCY_RATE_REFRESH_INTERVAL_MINUTES,
            },
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        }),
        tenantContext,
      );
      refreshStoreSettings();
      setPristine(currentSnapshot);
      toaster.success({
        title: t("currencies.saved.title", {
          defaultValue: "Currency settings saved",
        }),
        description: t("currencies.saved.description", {
          defaultValue:
            "The selected channel now uses these currency settings.",
        }),
      });
    } catch (error) {
      console.error("Failed to save currency settings:", error);
      toaster.error({
        title: t("currencies.saveFailed.title", {
          defaultValue: "Currency settings were not saved",
        }),
        description:
          error instanceof Error &&
          error.message.includes("SaaS quota exceeded")
            ? error.message
            : t("currencies.saveFailed.description", {
                defaultValue: "Check the settings and try again.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const setOffset = (
    targetCurrencyCode: CurrencyCode,
    patch: Partial<CurrencyConversionOffset>,
  ) => {
    setOffsets((currentOffsets) => {
      const existing = currentOffsets.find(
        (offset) => offset.targetCurrencyCode === targetCurrencyCode,
      );

      if (existing) {
        return currentOffsets.map((offset) =>
          offset.targetCurrencyCode === targetCurrencyCode
            ? { ...offset, ...patch }
            : offset,
        );
      }

      return [...currentOffsets, { targetCurrencyCode, ...patch }];
    });
  };

  const addRate = () => {
    const targetCurrency =
      activeCurrencies.find((currency) => currency.code !== baseCurrencyCode)
        ?.code ?? activeCurrencies[0]?.code;

    if (!targetCurrency) {
      return;
    }

    setRates((currentRates) => [
      ...currentRates,
      {
        fromCurrencyCode: baseCurrencyCode,
        toCurrencyCode: targetCurrency,
        rate: 1,
        source: "manual",
      },
    ]);
    setRateDraftIds((currentIds) => [
      ...currentIds,
      `new-rate:${nextRateDraftIdRef.current++}`,
    ]);
  };

  const canAddCurrency =
    newCurrencyPreset === CUSTOM_CURRENCY_VALUE
      ? newCustomCurrencyCode.trim().length === 3
      : Boolean(newCurrencyPreset);

  return (
    <Stack gap={6}>
      <CustomHeading
        heading={t("currencies.title", { defaultValue: "Currencies" })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <Card.Title>
            {t("currencies.settings.title", {
              defaultValue: "Channel Settings",
            })}
          </Card.Title>
          <Card.Description>
            {t("currencies.settings.description", {
              defaultValue:
                "Choose the default and base currencies and how prices are converted.",
            })}
          </Card.Description>
        </Card.Header>
        <Card.Body>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
            <Field
              label={t("currencies.fields.defaultCurrency", {
                defaultValue: "Default currency",
              })}
            >
              <Select.Root
                collection={currencyCollection}
                value={[defaultCurrencyCode]}
                onValueChange={({ value }) =>
                  setDefaultCurrencyCode(value[0] ?? DEFAULT_CURRENCY_CODE)
                }
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
                      {currencyCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field>

            <Field
              label={t("currencies.fields.baseCurrency", {
                defaultValue: "Conversion base",
              })}
            >
              <Select.Root
                collection={currencyCollection}
                value={[baseCurrencyCode]}
                onValueChange={({ value }) =>
                  setBaseCurrencyCode(value[0] ?? DEFAULT_CURRENCY_CODE)
                }
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
                      {currencyCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field>

            <Field
              label={t("currencies.fields.conversionMode", {
                defaultValue: "Conversion mode",
              })}
            >
              <Select.Root
                collection={modeCollection}
                value={[conversionMode]}
                onValueChange={({ value }) =>
                  setConversionMode(
                    (value[0] as CurrencyConversionMode | undefined) ??
                      "disabled",
                  )
                }
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
                      {modeCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field>
          </SimpleGrid>

          {defaultChangeWarning ? (
            <Box
              bg="orange.subtle"
              borderColor="orange.muted"
              borderRadius="md"
              borderWidth="1px"
              mt={4}
              p={3}
            >
              <Text fontSize="sm">{defaultChangeWarning}</Text>
            </Box>
          ) : null}
        </Card.Body>
      </Card.Root>

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4} alignItems="start">
        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("currencies.add.title", { defaultValue: "Add Currency" })}
            </Card.Title>
            <Card.Description>
              {t("currencies.add.description", {
                defaultValue:
                  "Pick from common currencies or enter a custom ISO 4217 code.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <VStack align="stretch" gap={3}>
              <Field
                label={t("currencies.add.preset", {
                  defaultValue: "Currency",
                })}
              >
                <Select.Root
                  collection={addCurrencyCollection}
                  value={newCurrencyPreset ? [newCurrencyPreset] : []}
                  onValueChange={({ value }) => {
                    setNewCurrencyPreset(value[0] ?? "");
                    setNewCustomCurrencyCode("");
                  }}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("currencies.add.placeholder", {
                          defaultValue: "Select currency to add",
                        })}
                      />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content maxH="320px" overflowY="auto">
                        {addCurrencyCollection.items.map((item) => (
                          <Select.Item item={item} key={item.value}>
                            {item.label}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </Field>

              {newCurrencyPreset === CUSTOM_CURRENCY_VALUE ? (
                <Field
                  label={t("currencies.add.customCode", {
                    defaultValue: "Custom ISO code",
                  })}
                >
                  <Input
                    autoComplete="off"
                    maxLength={3}
                    name="currencyCode"
                    onChange={(event) =>
                      setNewCustomCurrencyCode(event.target.value.toUpperCase())
                    }
                    placeholder={t("currencies.add.customCodePlaceholder", {
                      defaultValue: "e.g. INR",
                    })}
                    spellCheck={false}
                    textTransform="uppercase"
                    value={newCustomCurrencyCode}
                  />
                </Field>
              ) : null}

              <Button
                alignSelf="end"
                colorPalette="primary"
                disabled={!canAddCurrency}
                onClick={handleAddCurrency}
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("currencies.add.button", { defaultValue: "Add currency" })}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>

        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("currencies.copy.title", {
                defaultValue: "Copy From Channel",
              })}
            </Card.Title>
            <Card.Description>
              {t("currencies.copy.description", {
                defaultValue:
                  "Replace the current draft with settings from another channel. Review and save to apply.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <HStack align="end" gap={3} flexWrap="wrap">
              <Field
                label={t("currencies.copy.label", {
                  defaultValue: "Source channel",
                })}
                maxW={{ base: "full", md: "360px" }}
                w="full"
              >
                <Select.Root
                  collection={copySourceCollection}
                  disabled={channelOptions.length === 0 || isCopying}
                  onValueChange={({ value }) =>
                    setCopySourceChannelId(value[0] ?? "")
                  }
                  value={copySourceChannelId ? [copySourceChannelId] : []}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("currencies.copy.placeholder", {
                          defaultValue: "Select source channel",
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
                        {copySourceCollection.items.map((item) => (
                          <Select.Item item={item} key={item.value}>
                            {item.label}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </Field>
              <Button
                disabled={!copySourceChannelId}
                loading={isCopying}
                onClick={handleCopyFromChannel}
                variant="outline"
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("currencies.copy.button", { defaultValue: "Copy" })}
              </Button>
            </HStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <Card.Title>
            {t("currencies.list.title", {
              defaultValue: "Configured Currencies",
            })}
          </Card.Title>
          <Card.Description>
            {t("currencies.list.description", {
              defaultValue:
                "Edit name, symbol, locale, and minor units. Reorder or archive currencies as needed.",
            })}
          </Card.Description>
        </Card.Header>
        <Card.Body>
          <VStack align="stretch" gap={3}>
            {currencies.map((currency, index) => (
              <Box
                bg={currency.archived ? "bg.subtle" : "bg.panel"}
                borderRadius="xl"
                borderWidth="1px"
                key={currency.code}
                opacity={currency.archived ? 0.72 : 1}
                p={4}
              >
                <SimpleGrid
                  columns={{ base: 1, xl: 12 }}
                  gap={3}
                  alignItems="end"
                >
                  <VStack align="start" gap={2} gridColumn={{ xl: "span 2" }}>
                    <HStack gap={2} minW={0} flexWrap="wrap">
                      <Badge colorPalette="blue">{currency.code}</Badge>
                      {currency.code === defaultCurrencyCode ? (
                        <Badge size="sm" variant="subtle">
                          {t("currencies.default", { defaultValue: "Default" })}
                        </Badge>
                      ) : null}
                      {currency.archived ? (
                        <Badge colorPalette="orange" size="sm" variant="subtle">
                          {t("currencies.archived", {
                            defaultValue: "Archived",
                          })}
                        </Badge>
                      ) : null}
                    </HStack>
                    <Code fontSize="xs" maxW="full" overflow="hidden">
                      {currency.symbol}
                    </Code>
                  </VStack>

                  <Field
                    label={t("currencies.fields.name", {
                      defaultValue: "Name",
                    })}
                    gridColumn={{ xl: "span 3" }}
                  >
                    <Input
                      autoComplete="off"
                      name={`currency-${currency.code}-name`}
                      onChange={(event) =>
                        updateCurrency(currency.code, {
                          name: event.target.value,
                        })
                      }
                      value={currency.name}
                    />
                  </Field>
                  <Field
                    label={t("currencies.fields.symbol", {
                      defaultValue: "Symbol",
                    })}
                    gridColumn={{ xl: "span 1" }}
                  >
                    <Input
                      autoComplete="off"
                      name={`currency-${currency.code}-symbol`}
                      onChange={(event) =>
                        updateCurrency(currency.code, {
                          symbol: event.target.value,
                        })
                      }
                      value={currency.symbol}
                    />
                  </Field>
                  <Field
                    label={t("currencies.fields.locale", {
                      defaultValue: "Locale",
                    })}
                    gridColumn={{ xl: "span 3" }}
                  >
                    <LocaleSelect
                      value={currency.locale}
                      onChange={(value) =>
                        updateCurrency(currency.code, { locale: value })
                      }
                    />
                  </Field>
                  <Field
                    label={t("currencies.fields.minorUnits", {
                      defaultValue: "Decimal places",
                    })}
                    helperText={t("currencies.fields.minorUnitsHelp", {
                      defaultValue:
                        "Digits after the decimal separator (most currencies use 2).",
                    })}
                    gridColumn={{ xl: "span 1" }}
                  >
                    <Input
                      autoComplete="off"
                      inputMode="numeric"
                      max={8}
                      min={0}
                      name={`currency-${currency.code}-minor-units`}
                      onChange={(event) =>
                        updateCurrency(currency.code, {
                          minorUnitDigits: parseNumberInput(event.target.value),
                        })
                      }
                      type="number"
                      value={currency.minorUnitDigits}
                    />
                  </Field>

                  <HStack
                    alignSelf="center"
                    gap={2}
                    gridColumn={{ xl: "span 2" }}
                    justify="end"
                  >
                    <Switch
                      checked={currency.enabled && !currency.archived}
                      disabled={currency.archived}
                      onCheckedChange={({ checked }) =>
                        updateCurrency(currency.code, { enabled: checked })
                      }
                    >
                      {t("currencies.fields.enabled", {
                        defaultValue: "Enabled",
                      })}
                    </Switch>
                    <IconButton
                      aria-label={t("currencies.moveUp", {
                        defaultValue: "Move up",
                      })}
                      disabled={index === 0}
                      onClick={() =>
                        setCurrencies((currentCurrencies) =>
                          moveCurrency(currentCurrencies, currency.code, -1),
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>arrow_upward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={t("currencies.moveDown", {
                        defaultValue: "Move down",
                      })}
                      disabled={index === currencies.length - 1}
                      onClick={() =>
                        setCurrencies((currentCurrencies) =>
                          moveCurrency(currentCurrencies, currency.code, 1),
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>arrow_downward</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={
                        currency.archived
                          ? t("currencies.restore", { defaultValue: "Restore" })
                          : t("currencies.archive", { defaultValue: "Archive" })
                      }
                      colorPalette={currency.archived ? "success" : "red"}
                      onClick={() =>
                        updateCurrency(currency.code, {
                          archived: !currency.archived,
                          enabled: currency.archived,
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>
                        {currency.archived ? "unarchive" : "archive"}
                      </MaterialSymbol>
                    </IconButton>
                  </HStack>
                </SimpleGrid>
              </Box>
            ))}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <HStack justify="space-between" gap={3} flexWrap="wrap" w="full">
            <Box>
              <Card.Title>
                {t("currencies.rates.title", {
                  defaultValue: "Conversion Rates",
                })}
              </Card.Title>
              <Card.Description>
                {t("currencies.rates.description", {
                  defaultValue:
                    "Define how prices are converted between currencies.",
                })}
              </Card.Description>
            </Box>
            <Button
              disabled={activeCurrencies.length === 0}
              onClick={addRate}
              size="sm"
              variant="outline"
            >
              <MaterialSymbol>add</MaterialSymbol>
              {t("currencies.rates.add", { defaultValue: "Add rate" })}
            </Button>
          </HStack>
        </Card.Header>
        <Card.Body>
          <VStack align="stretch" gap={3}>
            {rates.map((rate, index) => {
              const fetchedAt = formatTimestamp(
                rate.fetchedAt ?? rate.metadata?.fetchedAt ?? rate.updatedAt,
                language,
              );

              return (
                <Box
                  bg="bg.panel"
                  borderColor="border.subtle"
                  borderRadius="xl"
                  borderWidth="1px"
                  key={rateDraftIds[index] ?? getCurrencyRateFingerprint(rate)}
                  p={3}
                >
                  <SimpleGrid
                    alignItems="end"
                    columns={{ base: 1, lg: 12 }}
                    gap={3}
                  >
                    <Field
                      label={t("currencies.rates.from", {
                        defaultValue: "From",
                      })}
                      gridColumn={{ lg: "span 3" }}
                    >
                      <Select.Root
                        collection={currencyCollection}
                        onValueChange={({ value }) =>
                          setRates((currentRates) =>
                            currentRates.map((currentRate, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...currentRate,
                                    fromCurrencyCode:
                                      value[0] ?? DEFAULT_CURRENCY_CODE,
                                    source: "manual",
                                  }
                                : currentRate,
                            ),
                          )
                        }
                        value={[rate.fromCurrencyCode]}
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
                              {currencyCollection.items.map((item) => (
                                <Select.Item item={item} key={item.value}>
                                  {item.label}
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Portal>
                      </Select.Root>
                    </Field>
                    <Field
                      label={t("currencies.rates.to", { defaultValue: "To" })}
                      gridColumn={{ lg: "span 3" }}
                    >
                      <Select.Root
                        collection={currencyCollection}
                        onValueChange={({ value }) =>
                          setRates((currentRates) =>
                            currentRates.map((currentRate, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...currentRate,
                                    toCurrencyCode:
                                      value[0] ?? DEFAULT_CURRENCY_CODE,
                                    source: "manual",
                                  }
                                : currentRate,
                            ),
                          )
                        }
                        value={[rate.toCurrencyCode]}
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
                              {currencyCollection.items.map((item) => (
                                <Select.Item item={item} key={item.value}>
                                  {item.label}
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Portal>
                      </Select.Root>
                    </Field>
                    <Field
                      label={t("currencies.rates.rate", {
                        defaultValue: "Rate",
                      })}
                      gridColumn={{ lg: "span 2" }}
                    >
                      <Input
                        autoComplete="off"
                        inputMode="decimal"
                        min={0}
                        name={`currency-rate-${index}`}
                        onChange={(event) =>
                          setRates((currentRates) =>
                            currentRates.map((currentRate, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...currentRate,
                                    rate: parseNumberInput(event.target.value),
                                    source: "manual",
                                  }
                                : currentRate,
                            ),
                          )
                        }
                        step="0.0001"
                        type="number"
                        value={rate.rate}
                      />
                    </Field>
                    <VStack align="start" gap={1} gridColumn={{ lg: "span 3" }}>
                      <Badge variant="subtle">
                        {t(
                          `currencies.rateSources.${rate.source ?? "manual"}`,
                          {
                            defaultValue: rate.source ?? "manual",
                          },
                        )}
                      </Badge>
                      <Text color="fg.muted" fontSize="xs">
                        {fetchedAt
                          ? t("currencies.rates.fetchedAt", {
                              fetchedAt,
                              defaultValue: "Fetched {{fetchedAt}}",
                            })
                          : t("currencies.rates.noFreshness", {
                              defaultValue: "No freshness data",
                            })}
                      </Text>
                    </VStack>
                    <IconButton
                      aria-label={t("currencies.rates.remove", {
                        defaultValue: "Remove rate",
                      })}
                      gridColumn={{ lg: "span 1" }}
                      onClick={() => {
                        setRates((currentRates) =>
                          currentRates.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        );
                        setRateDraftIds((currentIds) =>
                          currentIds.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                    </IconButton>
                  </SimpleGrid>
                </Box>
              );
            })}

            {rates.length === 0 ? (
              <Text color="fg.muted" fontSize="sm">
                {t("currencies.rates.empty", {
                  defaultValue: "No conversion rates configured.",
                })}
              </Text>
            ) : null}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <Card.Title>
            {t("currencies.offsets.title", {
              defaultValue: "Per-Currency Offsets",
            })}
          </Card.Title>
          <Card.Description>
            {t("currencies.offsets.description", {
              defaultValue:
                "Apply per-currency markup as a percentage or a fixed minor-unit offset.",
            })}
          </Card.Description>
        </Card.Header>
        <Card.Body>
          <VStack align="stretch" gap={3}>
            {activeCurrencies.map((currency) => {
              const offset = offsets.find(
                (item) => item.targetCurrencyCode === currency.code,
              );

              return (
                <Box
                  bg="bg.panel"
                  borderColor="border.subtle"
                  borderRadius="xl"
                  borderWidth="1px"
                  key={currency.code}
                  p={3}
                >
                  <SimpleGrid
                    alignItems="end"
                    columns={{ base: 1, md: 12 }}
                    gap={3}
                  >
                    <HStack gridColumn={{ md: "span 4" }} gap={2}>
                      <Badge colorPalette="blue">{currency.code}</Badge>
                      <Text fontSize="sm" fontWeight="medium">
                        {currency.name}
                      </Text>
                    </HStack>
                    <Field
                      label={t("currencies.offsets.percent", {
                        defaultValue: "Percent offset",
                      })}
                      gridColumn={{ md: "span 4" }}
                    >
                      <Input
                        autoComplete="off"
                        inputMode="decimal"
                        name={`currency-offset-${currency.code}-percent`}
                        onChange={(event) =>
                          setOffset(currency.code, {
                            percent: event.target.value.trim()
                              ? parseNumberInput(event.target.value)
                              : undefined,
                          })
                        }
                        step="0.01"
                        type="number"
                        value={offset?.percent ?? ""}
                      />
                    </Field>
                    <Field
                      label={t("currencies.offsets.fixedMinorUnits", {
                        defaultValue: "Fixed offset (minor units)",
                      })}
                      gridColumn={{ md: "span 4" }}
                    >
                      <Input
                        autoComplete="off"
                        inputMode="numeric"
                        name={`currency-offset-${currency.code}-fixed`}
                        onChange={(event) =>
                          setOffset(currency.code, {
                            fixedMinorUnits: event.target.value.trim()
                              ? Math.trunc(parseNumberInput(event.target.value))
                              : undefined,
                          })
                        }
                        type="number"
                        value={offset?.fixedMinorUnits ?? ""}
                      />
                    </Field>
                  </SimpleGrid>
                </Box>
              );
            })}
          </VStack>
        </Card.Body>
      </Card.Root>

      {validationErrors.length > 0 ? (
        <Box
          bg="red.subtle"
          borderColor="red.muted"
          borderRadius="md"
          borderWidth="1px"
          p={3}
        >
          <VStack align="stretch" gap={1}>
            {validationErrors.map((error) => (
              <Text fontSize="sm" key={error}>
                {error}
              </Text>
            ))}
          </VStack>
        </Box>
      ) : null}

      <StickyActionBar
        dirty={dirty && validationErrors.length === 0}
        saving={isSaving}
        onSave={() => void handleSave()}
        saveLabel={t("currencies.save", { defaultValue: "Save currencies" })}
        summary={t("currencies.footer", {
          count: currencies.length,
          defaultValue: "{{count}} currencies configured",
        })}
      />
    </Stack>
  );
}

function LocaleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const knownOption = COMMON_LOCALE_OPTIONS.find(
    (option) => option.value === value,
  );
  const collection = useMemo(() => {
    if (knownOption || !value) {
      return LOCALE_COLLECTION;
    }
    return createListCollection({
      items: [
        ...COMMON_LOCALE_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        })),
        { label: value, value },
      ],
    });
  }, [knownOption, value]);

  return (
    <Select.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={({ value: next }) => onChange(next[0] ?? DEFAULT_LOCALE)}
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
          <Select.Content maxH="320px" overflowY="auto">
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
