"use client";

import Drawer from "@/components/Drawer";
import { fetchCustomerGroupOptions } from "@/components/customers/customer-groups";
import { MultiCombobox } from "@/components/forms/MultiCombobox";
import { TagsInputField } from "@/components/forms/TagsInputField";
import { useChannels } from "context/channels";
import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { auth, firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
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
  Textarea,
} from "@chakra-ui/react";
import { Field, MaterialSymbol, Switch, toaster } from "@konfi/components";
import { create, db, update } from "@konfi/firebase";
import type {
  CurrencyCode,
  CurrencyDefinition,
  NestedMember,
  Price,
  PriceList,
  PriceListEntry,
  PriceListEntryTarget,
} from "@konfi/types";
import { CurrencyEnum, PriceListAdjustmentType } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import type { TFunction } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";

type PriceListFormType = "CREATE" | "DUPLICATE" | "UPDATE";
type TargetType = keyof PriceListEntryTarget;

type PriceListEntryFormState = {
  adjustmentType: PriceListAdjustmentType;
  currency: string;
  id: string;
  name: string;
  pricesJson: string;
  targetIds: string[];
  targetType: TargetType;
  value: string;
};

type PriceListFormState = {
  active: boolean;
  channelIds: string[];
  currency: string;
  customerGroupIds: string[];
  customerIds: string[];
  description: string;
  endsAt: string;
  entries: PriceListEntryFormState[];
  name: string;
  priority: string;
  startsAt: string;
};

type OptionItem<TValue extends string = string> = {
  label: string;
  value: TValue;
};

const DEFAULT_CURRENCY = CurrencyEnum.PLN;
const TARGET_TYPES = ["productIds", "productTypeIds", "categoryIds"] as const;
const ADJUSTMENT_TYPES = Object.values(PriceListAdjustmentType);

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createDefaultEntry(currency: string): PriceListEntryFormState {
  return {
    adjustmentType: PriceListAdjustmentType.PERCENTAGE,
    currency,
    id: createDraftId(),
    name: "",
    pricesJson: "",
    targetIds: [],
    targetType: "productIds",
    value: "0",
  };
}

function dedupeStrings(value: readonly string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of value) {
    const trimmed = candidate.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }

  return result;
}

function arrayToOptional(value: readonly string[]): string[] | undefined {
  return value.length > 0 ? [...value] : undefined;
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}

function dateInputValue(value: unknown): string {
  const date = isTimestampLike(value)
    ? value.toDate()
    : value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  return date && Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "";
}

function dateInputToIso(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function isPrice(value: unknown): value is Price {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { currency?: unknown; value?: unknown };

  return (
    typeof candidate.currency === "string" &&
    (candidate.value === undefined ||
      candidate.value === null ||
      typeof candidate.value === "number")
  );
}

function parsePricesJson(value: string): Price[] {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed) || !parsed.every(isPrice)) {
    throw new Error("Invalid price override JSON");
  }

  return parsed;
}

function entryToForm(
  entry: PriceListEntry,
  fallbackCurrency: string,
): PriceListEntryFormState {
  const targetType =
    TARGET_TYPES.find((type) => entry.target[type]?.length) ?? "productIds";

  return {
    adjustmentType: entry.adjustmentType,
    currency: entry.currency ?? fallbackCurrency,
    id: entry.id,
    name: entry.name ?? "",
    pricesJson: entry.prices ? JSON.stringify(entry.prices, null, 2) : "",
    targetIds: dedupeStrings(entry.target[targetType]),
    targetType,
    value: typeof entry.value === "number" ? String(entry.value) : "",
  };
}

function initialFormState(
  priceList: PriceList | undefined,
  type: PriceListFormType,
  defaultCurrency: string,
): PriceListFormState {
  if (!priceList || type === "CREATE") {
    return {
      active: true,
      channelIds: [],
      currency: defaultCurrency,
      customerGroupIds: [],
      customerIds: [],
      description: "",
      endsAt: "",
      entries: [createDefaultEntry(defaultCurrency)],
      name: "",
      priority: "0",
      startsAt: "",
    };
  }

  return {
    active: type === "DUPLICATE" ? true : priceList.active,
    channelIds: dedupeStrings(priceList.channelIds),
    currency: priceList.currency ?? defaultCurrency,
    customerGroupIds: dedupeStrings(priceList.customerGroupIds),
    customerIds: dedupeStrings(priceList.customerIds),
    description: priceList.description ?? "",
    endsAt: dateInputValue(priceList.endsAt),
    entries: priceList.entries.map((entry) => ({
      ...entryToForm(entry, priceList.currency ?? defaultCurrency),
      id: type === "DUPLICATE" ? createDraftId() : entry.id,
    })),
    name: type === "DUPLICATE" ? `${priceList.name} copy` : priceList.name,
    priority: String(priceList.priority),
    startsAt: dateInputValue(priceList.startsAt),
  };
}

function getActor(): NestedMember {
  const user = auth.currentUser;

  return {
    id: user?.uid ?? "admin",
    name: user?.displayName ?? user?.email ?? "Admin",
  };
}

function buildEntries(
  entries: PriceListEntryFormState[],
  defaultCurrency: string,
): PriceListEntry[] {
  return entries.map((entry) => {
    const targetIds = arrayToOptional(entry.targetIds);
    const target = targetIds ? { [entry.targetType]: targetIds } : {};
    const currency = entry.currency.trim() || defaultCurrency;

    if (entry.adjustmentType === PriceListAdjustmentType.PRICE_OVERRIDE) {
      return {
        adjustmentType: entry.adjustmentType,
        currency,
        id: entry.id || createDraftId(),
        name: entry.name.trim() || undefined,
        prices: parsePricesJson(entry.pricesJson),
        target,
      };
    }

    const value = Number(entry.value.replace(",", "."));

    if (!Number.isFinite(value)) {
      throw new Error("Invalid adjustment value");
    }

    return {
      adjustmentType: entry.adjustmentType,
      currency,
      id: entry.id || createDraftId(),
      name: entry.name.trim() || undefined,
      target,
      value,
    };
  });
}

function buildPayload(
  state: PriceListFormState,
  actor: NestedMember,
  defaultCurrency: string,
): Omit<PriceList, "createdAt" | "createdBy" | "id" | "tenantId"> {
  const priority = Number.parseInt(state.priority, 10);

  if (!state.name.trim()) {
    throw new Error("Missing price list name");
  }

  if (!Number.isFinite(priority)) {
    throw new Error("Invalid priority");
  }

  return {
    active: state.active,
    channelIds: arrayToOptional(state.channelIds),
    currency: (state.currency.trim() || defaultCurrency) as CurrencyCode,
    customerGroupIds: arrayToOptional(state.customerGroupIds),
    customerIds: arrayToOptional(state.customerIds),
    description: state.description.trim() || undefined,
    endsAt: dateInputToIso(state.endsAt),
    entries: buildEntries(state.entries, defaultCurrency),
    name: state.name.trim(),
    priority,
    startsAt: dateInputToIso(state.startsAt),
    updatedAt: Timestamp.now(),
    updatedBy: actor,
  };
}

export default function PriceListForm({
  priceList,
  type,
  open,
  setOpen,
  onSuccess,
}: {
  priceList?: PriceList;
  type: PriceListFormType;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onSuccess?: () => void;
}) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channels } = useChannels();
  const { currencySettings } = useConfiguration();
  const { data: customerGroupOptions } = useSWRImmutable(
    ["/customerGroups/options", tenantContext],
    ([, context]) => fetchCustomerGroupOptions(context),
  );

  const channelOptions = useMemo(
    () =>
      (channels ?? []).map((entry) => ({
        label: entry.name,
        value: entry.id,
      })),
    [channels],
  );

  const channelDefaultCurrency =
    currencySettings.defaultCurrencyCode ?? DEFAULT_CURRENCY;

  const enabledCurrencies = useMemo<CurrencyDefinition[]>(() => {
    const all = currencySettings.currencies ?? [];
    const usable = all.filter((entry) => entry.enabled && !entry.archived);
    return usable.length > 0 ? usable : all;
  }, [currencySettings.currencies]);

  const currencyOptions = useMemo(() => {
    if (enabledCurrencies.length === 0) {
      return [{ label: channelDefaultCurrency, value: channelDefaultCurrency }];
    }

    return enabledCurrencies.map((entry) => ({
      label: entry.symbol
        ? `${entry.code} – ${entry.name} (${entry.symbol})`
        : `${entry.code} – ${entry.name}`,
      value: entry.code,
    }));
  }, [enabledCurrencies, channelDefaultCurrency]);

  const [state, setState] = useState(() =>
    initialFormState(priceList, type, channelDefaultCurrency),
  );
  const [isSaving, setIsSaving] = useState(false);
  const title = getFormTitle(t, type);

  useEffect(() => {
    setState(initialFormState(priceList, type, channelDefaultCurrency));
  }, [open, priceList, type, channelDefaultCurrency]);

  const targetOptions = useMemo(
    () =>
      TARGET_TYPES.map((targetType) => ({
        label: t(`priceLists.targetTypes.${targetType}`, {
          defaultValue:
            targetType === "productIds"
              ? "Products"
              : targetType === "productTypeIds"
                ? "Product types"
                : "Categories",
        }),
        value: targetType,
      })),
    [t],
  );
  const adjustmentOptions = useMemo(
    () =>
      ADJUSTMENT_TYPES.map((adjustmentType) => ({
        label: t(`priceLists.adjustmentTypes.${adjustmentType}`, {
          defaultValue:
            adjustmentType === PriceListAdjustmentType.FIXED_UNIT_PRICE
              ? "Fixed unit price"
              : adjustmentType === PriceListAdjustmentType.PRICE_OVERRIDE
                ? "Price override"
                : "Percentage",
        }),
        value: adjustmentType,
      })),
    [t],
  );

  const updateEntry = (
    entryId: string,
    patch: Partial<PriceListEntryFormState>,
  ) => {
    setState((currentState) => ({
      ...currentState,
      entries: currentState.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  async function handleSave() {
    setIsSaving(true);
    try {
      const actor = getActor();
      const payload = buildPayload(state, actor, channelDefaultCurrency);

      if (type === "UPDATE") {
        if (!priceList) {
          throw new Error("Missing price list");
        }

        await update(
          payload,
          db.doc(firestore, "/priceLists", priceList.id),
          tenantContext,
        );
      } else {
        const priceListData = {
          ...payload,
          createdAt: Timestamp.now(),
          createdBy: actor,
          id: "",
        };

        await create(
          firestore,
          priceListData,
          undefined,
          db.collection(firestore, "/priceLists"),
          db.collection(firestore, "/priceLists"),
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
      }

      onSuccess?.();
      toaster.success({
        title: t("priceLists.saved", {
          defaultValue: "Price list saved",
        }),
        description: t("priceLists.savedDescription", {
          defaultValue: "{{name}} is ready for checkout pricing.",
          name: state.name.trim(),
        }),
      });
    } catch (error) {
      console.error("Price list save failed:", error);
      toaster.error({
        title: t("errors.somethingWentWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("priceLists.notSaved", {
          defaultValue:
            "Check required fields, target IDs, and price override JSON.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Drawer header={title} size="xl" open={open} setOpen={setOpen}>
      <Stack gap={5}>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          <Field
            label={t("forms.labels.name", { defaultValue: "Name" })}
            required
          >
            <Input
              value={state.name}
              onChange={(event) =>
                setState((currentState) => ({
                  ...currentState,
                  name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label={t("priceLists.currency", { defaultValue: "Currency" })}>
            <SingleSelect
              items={currencyOptions}
              value={state.currency}
              onChange={(currency) =>
                setState((currentState) => ({ ...currentState, currency }))
              }
            />
          </Field>
          <Field label={t("priceLists.priority", { defaultValue: "Priority" })}>
            <Input
              inputMode="numeric"
              value={state.priority}
              onChange={(event) =>
                setState((currentState) => ({
                  ...currentState,
                  priority: event.target.value,
                }))
              }
            />
          </Field>
          <Field label={t("common.status", { defaultValue: "Status" })}>
            <Switch
              checked={state.active}
              onCheckedChange={({ checked }) =>
                setState((currentState) => ({
                  ...currentState,
                  active: checked,
                }))
              }
            >
              {t("priceLists.active", { defaultValue: "Active" })}
            </Switch>
          </Field>
          <Field
            label={t("priceLists.startsAt", { defaultValue: "Starts at" })}
          >
            <Input
              type="date"
              value={state.startsAt}
              onChange={(event) =>
                setState((currentState) => ({
                  ...currentState,
                  startsAt: event.target.value,
                }))
              }
            />
          </Field>
          <Field label={t("priceLists.endsAt", { defaultValue: "Ends at" })}>
            <Input
              type="date"
              value={state.endsAt}
              onChange={(event) =>
                setState((currentState) => ({
                  ...currentState,
                  endsAt: event.target.value,
                }))
              }
            />
          </Field>
        </SimpleGrid>
        <Field
          label={t("forms.labels.description", {
            defaultValue: "Description",
          })}
        >
          <Textarea
            value={state.description}
            onChange={(event) =>
              setState((currentState) => ({
                ...currentState,
                description: event.target.value,
              }))
            }
            rows={3}
          />
        </Field>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
          <Field
            label={t("priceLists.channels", { defaultValue: "Channels" })}
            helperText={t("priceLists.channelsHelp", {
              defaultValue:
                "Limit this price list to specific sales channels. Leave empty to apply everywhere.",
            })}
          >
            <MultiCombobox
              options={channelOptions}
              value={state.channelIds}
              onChange={(channelIds) =>
                setState((currentState) => ({ ...currentState, channelIds }))
              }
              placeholder={t("priceLists.channelsPlaceholder", {
                defaultValue: "Select channels",
              })}
            />
          </Field>
          <Field
            label={t("priceLists.customers", { defaultValue: "Customers" })}
            helperText={t("priceLists.customersHelp", {
              defaultValue:
                "Paste customer IDs from the customer page and press Enter.",
            })}
          >
            <TagsInputField
              value={state.customerIds}
              onChange={(customerIds) =>
                setState((currentState) => ({ ...currentState, customerIds }))
              }
              placeholder={t("priceLists.customersPlaceholder", {
                defaultValue: "Paste customer ID and press Enter",
              })}
            />
          </Field>
          <Field
            label={t("priceLists.customerGroups", {
              defaultValue: "Customer groups",
            })}
            helperText={t("priceLists.customerGroupsHelp", {
              defaultValue:
                "Restrict this price list to selected customer groups.",
            })}
          >
            <MultiCombobox
              options={customerGroupOptions ?? []}
              value={state.customerGroupIds}
              onChange={(customerGroupIds) =>
                setState((currentState) => ({
                  ...currentState,
                  customerGroupIds,
                }))
              }
              placeholder={t("priceLists.customerGroupsPlaceholder", {
                defaultValue: "Select customer groups",
              })}
            />
          </Field>
        </SimpleGrid>
        <Separator />
        <HStack justify="space-between">
          <Text fontWeight="medium">
            {t("priceLists.entries", { defaultValue: "Entries" })}
          </Text>
          <Button
            variant="outline"
            onClick={() =>
              setState((currentState) => ({
                ...currentState,
                entries: [
                  ...currentState.entries,
                  createDefaultEntry(currentState.currency),
                ],
              }))
            }
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("priceLists.addEntry", { defaultValue: "Add entry" })}
          </Button>
        </HStack>
        <Stack gap={3}>
          {state.entries.map((entry, index) => (
            <PriceListEntryEditor
              key={entry.id}
              adjustmentOptions={adjustmentOptions}
              currencyOptions={currencyOptions}
              entry={entry}
              index={index}
              onRemove={() =>
                setState((currentState) => ({
                  ...currentState,
                  entries: currentState.entries.filter(
                    (candidate) => candidate.id !== entry.id,
                  ),
                }))
              }
              onUpdate={(patch) => updateEntry(entry.id, patch)}
              targetOptions={targetOptions}
              t={t}
            />
          ))}
        </Stack>
        <HStack justify="end" pb={2}>
          <Button
            colorPalette="primary"
            loading={isSaving}
            onClick={() => void handleSave()}
          >
            <MaterialSymbol>save</MaterialSymbol>
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </HStack>
      </Stack>
    </Drawer>
  );
}

function getFormTitle(t: TFunction, type: PriceListFormType) {
  if (type === "CREATE") {
    return t("priceLists.create", { defaultValue: "Create price list" });
  }

  if (type === "DUPLICATE") {
    return t("priceLists.duplicate", { defaultValue: "Duplicate price list" });
  }

  return t("priceLists.edit", { defaultValue: "Edit price list" });
}

function PriceListEntryEditor({
  adjustmentOptions,
  currencyOptions,
  entry,
  index,
  onRemove,
  onUpdate,
  targetOptions,
  t,
}: {
  adjustmentOptions: OptionItem<PriceListAdjustmentType>[];
  currencyOptions: OptionItem[];
  entry: PriceListEntryFormState;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<PriceListEntryFormState>) => void;
  targetOptions: OptionItem<TargetType>[];
  t: TFunction;
}) {
  const isOverride =
    entry.adjustmentType === PriceListAdjustmentType.PRICE_OVERRIDE;
  const activeTargetLabel =
    targetOptions.find((option) => option.value === entry.targetType)?.label ??
    t("priceLists.targetIds", { defaultValue: "Targets" });

  return (
    <Box bg="bg.panel" borderRadius="lg" borderWidth="1px" p={4}>
      <Stack gap={4}>
        <HStack justify="space-between" align="start">
          <Text fontWeight="medium">
            {t("priceLists.entryNumber", {
              count: index + 1,
              defaultValue: "Entry {{count}}",
            })}
          </Text>
          <IconButton
            aria-label={t("priceLists.removeEntry", {
              defaultValue: "Remove entry",
            })}
            size="sm"
            variant="ghost"
            onClick={onRemove}
          >
            <MaterialSymbol>delete</MaterialSymbol>
          </IconButton>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          <Field
            label={t("forms.labels.name", { defaultValue: "Name" })}
            optionalText={t("common.optional", { defaultValue: "Optional" })}
          >
            <Input
              value={entry.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
            />
          </Field>
          <Field
            label={t("priceLists.adjustmentType", {
              defaultValue: "Adjustment type",
            })}
          >
            <SingleSelect
              items={adjustmentOptions}
              value={entry.adjustmentType}
              onChange={(adjustmentType) => onUpdate({ adjustmentType })}
            />
          </Field>
          <Field
            label={t("priceLists.appliesTo", {
              defaultValue: "Applies to",
            })}
          >
            <SingleSelect
              items={targetOptions}
              value={entry.targetType}
              onChange={(targetType) => onUpdate({ targetType, targetIds: [] })}
            />
          </Field>
          <Field
            label={activeTargetLabel}
            helperText={t("priceLists.targetIdsHelp", {
              defaultValue:
                "Paste internal IDs (from the product, category or product type page) and press Enter.",
            })}
          >
            <TagsInputField
              value={entry.targetIds}
              onChange={(targetIds) => onUpdate({ targetIds })}
              placeholder={t("priceLists.targetIdsPlaceholder", {
                defaultValue: "Paste ID and press Enter",
              })}
            />
          </Field>
          <Field
            label={t("priceLists.entryCurrency", {
              defaultValue: "Entry currency",
            })}
          >
            <SingleSelect
              items={currencyOptions}
              value={entry.currency}
              onChange={(currency) => onUpdate({ currency })}
            />
          </Field>
          {!isOverride ? (
            <Field
              label={t("priceLists.value", { defaultValue: "Value" })}
              helperText={
                entry.adjustmentType === PriceListAdjustmentType.PERCENTAGE
                  ? t("priceLists.valuePercentageHelp", {
                      defaultValue:
                        "Use positive values for markups and negative values for discounts.",
                    })
                  : t("priceLists.valueFixedHelp", {
                      defaultValue: "Enter the fixed minor-unit price.",
                    })
              }
            >
              <Input
                inputMode="decimal"
                value={entry.value}
                onChange={(event) => onUpdate({ value: event.target.value })}
              />
            </Field>
          ) : null}
        </SimpleGrid>
        {isOverride ? (
          <Field
            label={t("priceLists.pricesJson", {
              defaultValue: "Prices JSON",
            })}
            helperText={t("priceLists.pricesJsonHelp", {
              defaultValue:
                "Paste a Price[] JSON array with value, threshold, combination, volume, and currency fields.",
            })}
          >
            <Textarea
              fontFamily="mono"
              minH="180px"
              value={entry.pricesJson}
              onChange={(event) => onUpdate({ pricesJson: event.target.value })}
            />
          </Field>
        ) : null}
      </Stack>
    </Box>
  );
}

function SingleSelect<TValue extends string>({
  items,
  value,
  onChange,
}: {
  items: OptionItem<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  const collection = useMemo(() => createListCollection({ items }), [items]);

  return (
    <Select.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={({ value: nextValue }) => {
        const selectedValue = nextValue[0];
        if (selectedValue) {
          onChange(selectedValue as TValue);
        }
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
