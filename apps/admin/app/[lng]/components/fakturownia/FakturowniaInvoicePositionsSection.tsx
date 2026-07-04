"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Combobox,
  createListCollection,
  Fieldset,
  Float,
  For,
  HStack,
  IconButton,
  Input,
  Portal,
  Presence,
  Select,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Field, MaterialSymbol } from "@konfi/components";
import { CurrencyEnum, Unit, UnitReadable } from "@konfi/types";
import {
  formatTotal,
  normalizeCurrencyCode,
  roundTotal,
  roundUnitPrice,
} from "@konfi/utils";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import type { FieldArrayWithId, UseFieldArrayAppend } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
import { useT } from "@/i18n/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import type { FakturowniaProductSnapshot } from "./invoice-helpers";
import { TAX_OPTIONS } from "./invoice-form-options";
import { roundCurrency } from "./invoice-form-position-builder";
import type {
  InvoiceFormValues,
  InvoicePositionFormValue,
  PositionPriceAdjustment,
  PriceListOptionItem,
  ProductOptionItem,
} from "./invoice-form-types";

type PositionRecalculationOverrides = {
  quantity?: number;
  priceNet?: number;
  priceGross?: number;
  totalNet?: number;
  totalGross?: number;
  tax?: string;
  discountPercent?: number;
  changedField?:
    | "priceNet"
    | "priceGross"
    | "totalNet"
    | "totalGross"
    | "quantity"
    | "tax"
    | "discountPercent";
};

interface FakturowniaInvoicePositionsSectionProps {
  hasAnyPositionWithDiscount: boolean;
  hasRoundingAdjustments: boolean;
  priceListOptions: PriceListOptionItem[];
  priceListInputValue: string;
  setPriceListInputValue: Dispatch<SetStateAction<string>>;
  isPriceListLoading: boolean;
  priceListError: string | null;
  resetPositionPricesToProductDefaults: () => Promise<void>;
  defaultPositionAdjustments: PositionPriceAdjustment[];
  invoiceCurrency?: string;
  positionFields: FieldArrayWithId<InvoiceFormValues, "positions", "id">[];
  positions?: InvoicePositionFormValue[];
  productSuggestionsByPosition: Record<string, ProductOptionItem[]>;
  isProductComboboxLoadingByPosition: Record<string, boolean>;
  handleOpenProductPicker: () => void;
  handleRemovePosition: (positionIndex: number, positionId: string) => void;
  scheduleProductSearch: (positionId: string, searchTerm: string) => void;
  applyProductSelection: (
    positionIndex: number,
    snapshot: FakturowniaProductSnapshot,
  ) => void;
  recalculatePositionValues: (
    positionIndex: number,
    overrides?: PositionRecalculationOverrides,
  ) => void;
  appendPosition: UseFieldArrayAppend<InvoiceFormValues, "positions">;
}

export function FakturowniaInvoicePositionsSection({
  hasAnyPositionWithDiscount,
  hasRoundingAdjustments,
  priceListOptions,
  priceListInputValue,
  setPriceListInputValue,
  isPriceListLoading,
  priceListError,
  resetPositionPricesToProductDefaults,
  defaultPositionAdjustments,
  invoiceCurrency,
  positionFields,
  positions,
  productSuggestionsByPosition,
  isProductComboboxLoadingByPosition,
  handleOpenProductPicker,
  handleRemovePosition,
  scheduleProductSearch,
  applyProductSelection,
  recalculatePositionValues,
  appendPosition,
}: FakturowniaInvoicePositionsSectionProps) {
  const { t } = useT(["fakturownia", "translation"]);
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<InvoiceFormValues>();
  const priceListCollection = useMemo(
    () =>
      createListCollection({
        items: priceListOptions,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [priceListOptions],
  );
  const filteredPriceListItems = useMemo(() => {
    return filterLocalFuseItems(
      priceListCollection.items,
      priceListInputValue,
      {
        keys: [
          { name: "label", weight: 0.7 },
          { name: "secondaryLabel", weight: 0.3 },
        ],
        threshold: 0.34,
      },
    );
  }, [priceListCollection.items, priceListInputValue]);

  return (
    <Fieldset.Root>
      <Fieldset.Legend fontSize={"xl"}>
        {t("fakturownia.invoiceCreate.positions", {
          defaultValue: "Invoice positions",
        })}
        <Button
          ml={2}
          variant="surface"
          size="sm"
          colorPalette="orange"
          onClick={handleOpenProductPicker}
        >
          <MaterialSymbol>playlist_add</MaterialSymbol>
          {t("fakturownia.invoiceCreate.productPicker.open", {
            defaultValue: "Browse products",
          })}
        </Button>
      </Fieldset.Legend>
      <Fieldset.Content position="relative">
        <Presence
          present={hasAnyPositionWithDiscount}
          animationName={{
            _open: "slide-from-top, fade-in",
            _closed: "slide-to-top, fade-out",
          }}
          animationDuration="moderate"
        >
          <Alert.Root colorPalette="primaryAccent" variant="surface" mt={2}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("fakturownia.invoiceCreate.discountInfoTitle", {
                  defaultValue: "How discounts are applied",
                })}
              </Alert.Title>
              <Alert.Description>
                {t("fakturownia.invoiceCreate.discountInfoDescription", {
                  defaultValue:
                    "When a position has a discount we send the pre-discount totals to Fakturownia so it can apply the discount itself. This prevents double discounts and the final document in Fakturownia will still show the reduced totals.",
                })}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Presence>
        <Presence
          present={hasRoundingAdjustments}
          animationName={{
            _open: "slide-from-top, fade-in",
            _closed: "slide-to-top, fade-out",
          }}
          animationDuration="moderate"
        >
          <Alert.Root colorPalette="yellow" variant="surface" mt={2}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("fakturownia.invoiceCreate.roundingInfoTitle", {
                  defaultValue: "Totals adjusted due to rounding",
                })}
              </Alert.Title>
              <Alert.Description>
                {t("fakturownia.invoiceCreate.roundingInfoDescription", {
                  defaultValue:
                    "The value you entered could not be represented exactly with 3-decimal unit prices and 2-decimal totals, so we adjusted the totals to the nearest compatible amount.",
                })}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Presence>
        <Field
          position="absolute"
          w="33%"
          minW="340px"
          top={-12}
          right={0}
          zIndex={10}
          invalid={!!priceListError}
          errorText={priceListError || undefined}
        >
          <HStack gap={2} flex="1" w={"100%"} align="center">
            <MaterialSymbol>price_change</MaterialSymbol>
            <Controller
              name="priceListId"
              control={control}
              render={({ field }) => (
                <Combobox.Root
                  collection={priceListCollection}
                  inputValue={priceListInputValue}
                  onInputValueChange={(details) => {
                    const next = details.inputValue ?? "";
                    setPriceListInputValue(next);
                  }}
                  value={field.value ? [field.value] : []}
                  onValueChange={(details) => {
                    const selectedItem = details.items[0] as
                      | PriceListOptionItem
                      | undefined;
                    if (selectedItem) {
                      field.onChange(selectedItem.priceListId);
                      setPriceListInputValue("");
                    } else {
                      field.onChange(undefined);
                      setPriceListInputValue("");
                      // Reset all positions to product default prices when price list is cleared
                      void resetPositionPricesToProductDefaults();
                    }
                  }}
                  openOnClick
                  selectionBehavior="replace"
                >
                  <Combobox.Control>
                    <Combobox.Input
                      placeholder={t(
                        "fakturownia.invoiceCreate.priceListPlaceholder",
                        { defaultValue: "Search or select price list" },
                      )}
                    />
                    <Combobox.IndicatorGroup>
                      <Combobox.ClearTrigger
                        aria-label={t("common.clear", {
                          defaultValue: "Clear",
                        })}
                      />
                      <Combobox.Trigger />
                    </Combobox.IndicatorGroup>
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        {isPriceListLoading ? (
                          <HStack gap={2} p={2}>
                            <Spinner size="xs" />
                            <Text textStyle="sm">
                              {t("fakturownia.invoiceCreate.priceListLoading", {
                                defaultValue: "Loading price lists...",
                              })}
                            </Text>
                          </HStack>
                        ) : (
                          <>
                            <Combobox.Empty>
                              {t("fakturownia.invoiceCreate.priceListEmpty", {
                                defaultValue: "No price lists found",
                              })}
                            </Combobox.Empty>
                            {filteredPriceListItems.map((item, index) => (
                              <Combobox.Item
                                key={`${item.value}-${index}`}
                                item={item}
                              >
                                <VStack align="start" gap={0} flex="1">
                                  <Text fontWeight="medium">{item.label}</Text>
                                  {item.secondaryLabel && (
                                    <Text textStyle="sm" color="fg.muted">
                                      {item.secondaryLabel}
                                    </Text>
                                  )}
                                </VStack>
                                <Combobox.ItemIndicator />
                              </Combobox.Item>
                            ))}
                          </>
                        )}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
              )}
            />
          </HStack>
        </Field>
        <VStack gap={4} align="stretch">
          {defaultPositionAdjustments.length > 0 && (
            <Alert.Root status="warning" variant="subtle">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("fakturownia.invoiceCreate.positionPriceMismatch.title", {
                    defaultValue: "Price adjustments applied",
                  })}
                </Alert.Title>
                <Alert.Description>
                  <VStack align="start" gap={1} mt={2}>
                    <Text textStyle="sm">
                      {t(
                        "fakturownia.invoiceCreate.positionPriceMismatch.description",
                        {
                          defaultValue:
                            "Some positions would not match the order totals when recalculated from unit price/quantity (or discount). To preserve exact amounts, quantity (and sometimes discount) was moved into the position name and the position was normalized to quantity 1.",
                        },
                      )}
                    </Text>
                    {defaultPositionAdjustments.map((adj) => (
                      <Text
                        key={`${adj.positionIndex}-${adj.strategy}`}
                        textStyle="xs"
                        color="fg.muted"
                      >
                        {t(
                          "fakturownia.invoiceCreate.positionPriceMismatch.item",
                          {
                            defaultValue:
                              "Position {{no}}: expected {{expected}} {{currency}}, calculated {{calculated}} {{currency}} — {{strategy}}",
                            no: adj.positionIndex + 1,
                            expected: formatTotal(adj.expectedTotalGross),
                            calculated: formatTotal(adj.calculatedTotalGross),
                            currency:
                              normalizeCurrencyCode(invoiceCurrency) ??
                              CurrencyEnum.PLN,
                            strategy:
                              adj.strategy === "QUANTITY_TO_NAME"
                                ? t(
                                    "fakturownia.invoiceCreate.positionPriceMismatch.strategy.quantity",
                                    {
                                      defaultValue: "quantity moved to name",
                                    },
                                  )
                                : t(
                                    "fakturownia.invoiceCreate.positionPriceMismatch.strategy.quantityAndDiscount",
                                    {
                                      defaultValue:
                                        "quantity and discount moved to name",
                                    },
                                  ),
                          },
                        )}
                      </Text>
                    ))}
                  </VStack>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          {positionFields.map((positionField, index) => {
            const positionOptionItems =
              productSuggestionsByPosition[positionField.id] ?? [];
            const isProductLoading = Boolean(
              isProductComboboxLoadingByPosition[positionField.id],
            );
            const currentPosition = Array.isArray(positions)
              ? positions?.[index]
              : undefined;
            const positionProductId =
              currentPosition?.productId !== undefined &&
              currentPosition?.productId !== null
                ? String(currentPosition.productId)
                : undefined;
            const positionNameError = errors.positions?.[index]?.name;
            return (
              <Card.Root key={positionField.id}>
                <Card.Body>
                  <VStack gap={4} align="stretch">
                    <HStack justify="space-between" align="center">
                      <Text fontWeight="semibold">
                        {t("fakturownia.invoiceCreate.positionNumber", {
                          defaultValue: "Position {{no}}",
                          no: index + 1,
                        })}
                      </Text>
                      {positionFields.length > 1 && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() =>
                            handleRemovePosition(index, positionField.id)
                          }
                          aria-label={t(
                            "fakturownia.invoiceCreate.removePosition",
                            { defaultValue: "Remove position" },
                          )}
                        >
                          <MaterialSymbol>delete</MaterialSymbol>
                        </IconButton>
                      )}
                    </HStack>

                    <HStack gap={4} alignItems="flex-end">
                      <Field
                        label={t("fakturownia.invoiceCreate.positionName", {
                          defaultValue: "Name",
                        })}
                        invalid={!!positionNameError}
                        errorText={positionNameError?.message}
                      >
                        <Controller
                          name={`positions.${index}.name`}
                          control={control}
                          render={({ field }) => (
                            <Combobox.Root
                              allowCustomValue
                              collection={createListCollection({
                                items: positionOptionItems,
                                itemToValue: (item) => item.value,
                                itemToString: (item) => item.label,
                              })}
                              inputValue={field.value ?? ""}
                              onInputValueChange={(details) => {
                                const nextValue = details.inputValue;
                                const currentValue = field.value ?? "";
                                // Only update if value actually changed
                                if (nextValue !== currentValue) {
                                  field.onChange(nextValue);
                                  scheduleProductSearch(
                                    positionField.id,
                                    nextValue,
                                  );
                                  // Clear product ID when user modifies the text
                                  if (currentPosition?.productId) {
                                    setValue(
                                      `positions.${index}.productId`,
                                      undefined,
                                      {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: true,
                                      },
                                    );
                                  }
                                  if (currentPosition?.code) {
                                    setValue(
                                      `positions.${index}.code`,
                                      undefined,
                                      {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: false,
                                      },
                                    );
                                  }
                                }
                              }}
                              onValueChange={(details) => {
                                const selectedItem = details.items[0] as
                                  | ProductOptionItem
                                  | undefined;
                                if (selectedItem) {
                                  const resolvedName =
                                    selectedItem.snapshot.name?.trim() ||
                                    selectedItem.label;
                                  field.onChange(resolvedName);
                                  applyProductSelection(
                                    index,
                                    selectedItem.snapshot,
                                  );
                                } else {
                                  setValue(
                                    `positions.${index}.productId`,
                                    undefined,
                                    {
                                      shouldDirty: true,
                                      shouldTouch: true,
                                      shouldValidate: true,
                                    },
                                  );
                                  setValue(
                                    `positions.${index}.code`,
                                    undefined,
                                    {
                                      shouldDirty: true,
                                      shouldTouch: true,
                                      shouldValidate: false,
                                    },
                                  );
                                }
                              }}
                              openOnClick
                              selectionBehavior="replace"
                            >
                              <Combobox.Control>
                                <Combobox.Input
                                  onBlur={field.onBlur}
                                  ref={field.ref}
                                  placeholder={t(
                                    "fakturownia.invoiceCreate.productNamePlaceholder",
                                    {
                                      defaultValue:
                                        "Search or enter product name",
                                    },
                                  )}
                                />
                                <Combobox.IndicatorGroup>
                                  <Combobox.ClearTrigger
                                    aria-label={t("common.clear", {
                                      defaultValue: "Clear",
                                    })}
                                  />
                                  <Combobox.Trigger />
                                </Combobox.IndicatorGroup>
                              </Combobox.Control>
                              <Portal>
                                <Combobox.Positioner>
                                  <Combobox.Content>
                                    {isProductLoading ? (
                                      <HStack gap={2} p={2}>
                                        <Spinner size="xs" />
                                        <Text textStyle="sm">
                                          {t(
                                            "fakturownia.invoiceCreate.productSearchLoading",
                                            {
                                              defaultValue:
                                                "Searching products...",
                                            },
                                          )}
                                        </Text>
                                      </HStack>
                                    ) : (
                                      <>
                                        <Combobox.Empty>
                                          {t(
                                            "fakturownia.invoiceCreate.productSearchEmpty",
                                            {
                                              defaultValue: "No products found",
                                            },
                                          )}
                                        </Combobox.Empty>
                                        {positionOptionItems.map(
                                          (item, index) => (
                                            <Combobox.Item
                                              key={`${item.value}-${index}`}
                                              item={item}
                                            >
                                              <VStack
                                                align="start"
                                                gap={0}
                                                flex="1"
                                              >
                                                <Text fontWeight="medium">
                                                  {item.label}
                                                </Text>
                                                {item.secondaryLabel && (
                                                  <Text
                                                    textStyle="sm"
                                                    color="fg.muted"
                                                  >
                                                    {item.secondaryLabel}
                                                  </Text>
                                                )}
                                              </VStack>
                                              <Combobox.ItemIndicator />
                                            </Combobox.Item>
                                          ),
                                        )}
                                      </>
                                    )}
                                  </Combobox.Content>
                                </Combobox.Positioner>
                              </Portal>
                            </Combobox.Root>
                          )}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.positionQuantity", {
                          defaultValue: "Quantity",
                        })}
                        invalid={!!errors.positions?.[index]?.quantity}
                        errorText={errors.positions?.[index]?.quantity?.message}
                      >
                        <Controller
                          name={`positions.${index}.quantity`}
                          control={control}
                          render={({ field }) => (
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={
                                Number.isFinite(field.value) ? field.value : 0
                              }
                              onChange={(event) => {
                                const parsed = parseFloat(event.target.value);
                                const nextValue = Number.isNaN(parsed)
                                  ? 0
                                  : parsed;
                                field.onChange(nextValue);
                                recalculatePositionValues(index, {
                                  quantity: nextValue,
                                  changedField: "quantity",
                                });
                              }}
                            />
                          )}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.positionUnit", {
                          defaultValue: "Unit",
                        })}
                      >
                        <Controller
                          name={`positions.${index}.unit`}
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={createListCollection({
                                items: Object.values(Unit).map((unit) => ({
                                  value: unit,
                                  label: t(`Unit.${unit}`, {
                                    defaultValue:
                                      UnitReadable[
                                        unit as keyof typeof UnitReadable
                                      ] || unit,
                                  }),
                                })),
                              })}
                              value={[field.value]}
                              onValueChange={({ value }) =>
                                field.onChange(value[0])
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
                              <Select.Positioner>
                                <Select.Content>
                                  <For each={Object.values(Unit)}>
                                    {(unit, indexUnit) => (
                                      <Select.Item
                                        key={`${unit}-${indexUnit}`}
                                        item={{
                                          value: unit,
                                          label: t(`Unit.${unit}`, {
                                            defaultValue:
                                              UnitReadable[
                                                unit as keyof typeof UnitReadable
                                              ] || unit,
                                          }),
                                        }}
                                      >
                                        {t(`Unit.${unit}`, {
                                          defaultValue:
                                            UnitReadable[
                                              unit as keyof typeof UnitReadable
                                            ] || unit,
                                        })}
                                      </Select.Item>
                                    )}
                                  </For>
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.positionPriceNet", {
                          defaultValue: "Unit net price",
                        })}
                        invalid={!!errors.positions?.[index]?.priceNet}
                        errorText={errors.positions?.[index]?.priceNet?.message}
                      >
                        <Controller
                          name={`positions.${index}.priceNet`}
                          control={control}
                          render={({ field }) => {
                            const positionDiscount =
                              Number(currentPosition?.discountPercent) || 0;
                            const hasPositionDiscount = positionDiscount > 0;
                            const undiscountedUnitNet =
                              Number(field.value) || 0;
                            const discountedUnitNet = roundUnitPrice(
                              undiscountedUnitNet *
                                (1 - positionDiscount / 100),
                            );
                            const showDiscountBadge =
                              hasPositionDiscount && undiscountedUnitNet > 0;

                            return (
                              <Box position="relative" w="100%">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={
                                    Number.isFinite(field.value)
                                      ? field.value
                                      : 0
                                  }
                                  onChange={(event) => {
                                    const parsed = parseFloat(
                                      event.target.value,
                                    );
                                    const nextValue = Number.isNaN(parsed)
                                      ? 0
                                      : parsed;
                                    field.onChange(nextValue);
                                    recalculatePositionValues(index, {
                                      priceNet: nextValue,
                                      changedField: "priceNet",
                                    });
                                  }}
                                />
                                {showDiscountBadge && (
                                  <Float
                                    placement="top-end"
                                    offsetX="2"
                                    offsetY="-1"
                                  >
                                    <Badge
                                      colorPalette="success"
                                      variant="solid"
                                    >
                                      {formatTotal(discountedUnitNet)}
                                    </Badge>
                                  </Float>
                                )}
                              </Box>
                            );
                          }}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t(
                          "fakturownia.invoiceCreate.positionPriceGross",
                          { defaultValue: "Unit gross price" },
                        )}
                        invalid={!!errors.positions?.[index]?.priceGross}
                        errorText={
                          errors.positions?.[index]?.priceGross?.message
                        }
                      >
                        <Controller
                          name={`positions.${index}.priceGross`}
                          control={control}
                          render={({ field }) => {
                            const positionDiscount =
                              Number(currentPosition?.discountPercent) || 0;
                            const hasPositionDiscount = positionDiscount > 0;
                            const undiscountedUnitGross =
                              Number(field.value) || 0;
                            const discountedUnitGross = roundUnitPrice(
                              undiscountedUnitGross *
                                (1 - positionDiscount / 100),
                            );
                            const showDiscountBadge =
                              hasPositionDiscount && undiscountedUnitGross > 0;

                            return (
                              <Box position="relative" w="100%">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={
                                    Number.isFinite(field.value)
                                      ? field.value
                                      : 0
                                  }
                                  onChange={(event) => {
                                    const parsed = parseFloat(
                                      event.target.value,
                                    );
                                    const nextValue = Number.isNaN(parsed)
                                      ? 0
                                      : parsed;
                                    field.onChange(nextValue);
                                    recalculatePositionValues(index, {
                                      priceGross: nextValue,
                                      changedField: "priceGross",
                                    });
                                  }}
                                />
                                {showDiscountBadge && (
                                  <Float
                                    placement="top-end"
                                    offsetX="2"
                                    offsetY="-1"
                                  >
                                    <Badge
                                      colorPalette="success"
                                      variant="solid"
                                    >
                                      {formatTotal(discountedUnitGross)}
                                    </Badge>
                                  </Float>
                                )}
                              </Box>
                            );
                          }}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.positionTax", {
                          defaultValue: "VAT",
                        })}
                      >
                        <Controller
                          name={`positions.${index}.tax`}
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={createListCollection({
                                items: TAX_OPTIONS,
                              })}
                              value={[field.value]}
                              onValueChange={({ value }) => {
                                const nextValue = value[0];
                                field.onChange(nextValue);
                                recalculatePositionValues(index, {
                                  tax: nextValue,
                                  changedField: "tax",
                                });
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
                              <Select.Positioner>
                                <Select.Content>
                                  <For each={TAX_OPTIONS}>
                                    {(option) => (
                                      <Select.Item
                                        key={option.value}
                                        item={option}
                                      >
                                        {option.label}
                                      </Select.Item>
                                    )}
                                  </For>
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Field>
                      <Field
                        label={t("fakturownia.invoiceCreate.discountPercent", {
                          defaultValue: "Discount (%)",
                        })}
                        invalid={!!errors.positions?.[index]?.discountPercent}
                        errorText={
                          errors.positions?.[index]?.discountPercent?.message
                        }
                        w={{ base: "100%", md: "25%" }}
                      >
                        <Controller
                          name={`positions.${index}.discountPercent`}
                          control={control}
                          render={({ field }) => (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={
                                Number.isFinite(field.value) ? field.value : 0
                              }
                              onChange={(event) => {
                                const parsed = parseFloat(event.target.value);
                                if (Number.isNaN(parsed)) {
                                  field.onChange(0);
                                  recalculatePositionValues(index, {
                                    discountPercent: 0,
                                    changedField: "discountPercent",
                                  });
                                  return;
                                }
                                const clamped = Math.min(
                                  Math.max(parsed, 0),
                                  100,
                                );
                                const normalized = roundTotal(clamped);
                                field.onChange(normalized);
                                recalculatePositionValues(index, {
                                  discountPercent: normalized,
                                  changedField: "discountPercent",
                                });
                              }}
                            />
                          )}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.totalNet", {
                          defaultValue: "Total net",
                        })}
                      >
                        <Controller
                          name={`positions.${index}.totalNet`}
                          control={control}
                          render={({ field }) => (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={
                                Number.isFinite(field.value) ? field.value : 0
                              }
                              onChange={(event) => {
                                const parsed = parseFloat(event.target.value);
                                const nextValue = Number.isNaN(parsed)
                                  ? 0
                                  : parsed;
                                field.onChange(nextValue);
                              }}
                              onBlur={(event) => {
                                field.onBlur();
                                const parsed = parseFloat(event.target.value);
                                const nextValue = Number.isNaN(parsed)
                                  ? 0
                                  : parsed;
                                recalculatePositionValues(index, {
                                  totalNet: nextValue,
                                  changedField: "totalNet",
                                });
                              }}
                            />
                          )}
                        />
                      </Field>
                      <Field
                        w="25%"
                        label={t("fakturownia.invoiceCreate.totalGross", {
                          defaultValue: "Total gross",
                        })}
                      >
                        <Controller
                          name={`positions.${index}.totalGross`}
                          control={control}
                          render={({ field }) => {
                            const positionDiscount =
                              Number(currentPosition?.discountPercent) || 0;
                            const hasPositionDiscount = positionDiscount > 0;
                            // field.value is the undiscounted totalGross (for Fakturownia)
                            const undiscountedGross = Number(field.value) || 0;
                            // Calculate the actual discounted price to display in badge
                            const discountedGross = roundCurrency(
                              undiscountedGross * (1 - positionDiscount / 100),
                            );
                            const showDiscountBadge =
                              hasPositionDiscount && undiscountedGross > 0;

                            return (
                              <Box position="relative" w="100%">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={
                                    Number.isFinite(field.value)
                                      ? field.value
                                      : 0
                                  }
                                  onChange={(event) => {
                                    const parsed = parseFloat(
                                      event.target.value,
                                    );
                                    const nextValue = Number.isNaN(parsed)
                                      ? 0
                                      : parsed;
                                    field.onChange(nextValue);
                                  }}
                                  onBlur={(event) => {
                                    field.onBlur();
                                    const parsed = parseFloat(
                                      event.target.value,
                                    );
                                    const nextValue = Number.isNaN(parsed)
                                      ? 0
                                      : parsed;
                                    recalculatePositionValues(index, {
                                      totalGross: nextValue,
                                      changedField: "totalGross",
                                    });
                                  }}
                                />
                                {showDiscountBadge && (
                                  <Float
                                    placement="top-end"
                                    offsetX="2"
                                    offsetY="-1"
                                  >
                                    <Badge
                                      colorPalette="success"
                                      variant="solid"
                                    >
                                      {formatTotal(discountedGross)}
                                    </Badge>
                                  </Float>
                                )}
                              </Box>
                            );
                          }}
                        />
                      </Field>
                    </HStack>
                    <Field
                      label={t(
                        "fakturownia.invoiceCreate.positionDescription",
                        { defaultValue: "Description" },
                      )}
                    >
                      <Controller
                        name={`positions.${index}.description`}
                        control={control}
                        render={({ field }) => (
                          <Textarea
                            {...field}
                            value={field.value ?? ""}
                            borderRadius="3xl"
                            rows={2}
                          />
                        )}
                      />
                    </Field>
                  </VStack>
                </Card.Body>
              </Card.Root>
            );
          })}

          <Button
            w="100%"
            type="button"
            variant="surface"
            onClick={() =>
              appendPosition({
                name: "",
                description: "",
                quantity: 1,
                unit: Unit.PCS,
                priceNet: 0,
                priceGross: 0,
                tax: "23",
                productId: undefined,
                code: undefined,
                discountPercent: 0,
              })
            }
            alignSelf="start"
            colorPalette="primary"
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("fakturownia.invoiceCreate.addPosition", {
              defaultValue: "Add position",
            })}
          </Button>
        </VStack>
      </Fieldset.Content>
    </Fieldset.Root>
  );
}
