"use client";

import {
  Box,
  Combobox,
  HStack,
  Input,
  Portal,
  Text,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { Field } from "@konfi/components";
import type { SelectOption } from "@konfi/types";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

export function translateOptions(
  t: TFunction,
  namespace: string,
  options: SelectOption[],
): SelectOption[] {
  return options.map((option) => ({
    ...option,
    label: t(`${namespace}.${option.value}`, {
      defaultValue: option.label,
    }),
  }));
}

export function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
  width = "12rem",
  disabled = false,
  hideLabel = false,
  inlineLabel = false,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  width?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  inlineLabel?: boolean;
}) {
  const selectOptions = useMemo(
    () =>
      options.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [options],
  );
  const selectedOption = useMemo(
    () => selectOptions.find((option) => option.value === value),
    [selectOptions, value],
  );
  const { contains } = useFilter({ sensitivity: "base" });
  const { collection, set, filter, reset } = useListCollection<
    (typeof selectOptions)[number]
  >({
    initialItems: selectOptions,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    filter: contains,
  });
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? "");
  const resetOptionFilter = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    set(selectOptions);
  }, [selectOptions, set]);

  useEffect(() => {
    if (!selectedOption) {
      setInputValue("");
      return;
    }

    setInputValue(selectedOption.label);
  }, [selectedOption]);

  const selectControl = (
    <Combobox.Root
      colorPalette="primary"
      collection={collection}
      value={selectedOption ? [selectedOption.value] : []}
      inputValue={inputValue}
      onValueChange={({ value: nextValue }) => {
        const selectedValue = nextValue[0];

        if (!selectedValue) {
          onChange("");
          setInputValue("");
          resetOptionFilter();
          return;
        }

        const nextOption = collection.find(selectedValue);

        if (!nextOption) {
          return;
        }

        onChange(nextOption.value);
        setInputValue(nextOption.label);
        resetOptionFilter();
      }}
      onInputValueChange={({ inputValue: nextInputValue }) => {
        setInputValue(nextInputValue);
        filter(nextInputValue);
      }}
      disabled={disabled || options.length === 0}
      placeholder={placeholder}
      openOnClick={options.length > 0}
      selectionBehavior="replace"
      closeOnSelect
      width="100%"
      onOpenChange={({ open }) => {
        if (open) {
          resetOptionFilter();
        }
      }}
    >
      <Combobox.Control>
        <Combobox.Input
          aria-label={hideLabel || inlineLabel ? label : undefined}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger />
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            {collection.items.map((item) => (
              <Combobox.Item key={`${item.value}-${item.label}`} item={item}>
                <Combobox.ItemText>{item.label}</Combobox.ItemText>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );

  if (inlineLabel && !hideLabel) {
    return (
      <HStack
        gap={2}
        align="center"
        flexShrink={0}
        minH="2.5rem"
        whiteSpace="nowrap"
      >
        <Text as="span" fontSize="sm">
          {label}
        </Text>
        <Box minW={width} maxW={width}>
          {selectControl}
        </Box>
      </HStack>
    );
  }

  return (
    <Field
      label={hideLabel ? undefined : label}
      minW={width}
      maxW={width}
      flexShrink={0}
    >
      {selectControl}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  width = "8rem",
  min = 0,
  step = 1,
  helperText,
  hideLabel = false,
  name,
}: {
  label: string;
  value?: number | null;
  onChange: (value: number | undefined) => void;
  width?: string;
  min?: number;
  step?: number;
  helperText?: string;
  hideLabel?: boolean;
  name?: string;
}) {
  const [inputValue, setInputValue] = useState(formatNumberInputValue(value));
  const [isEditing, setIsEditing] = useState(false);
  const allowsNegativeValues = min < 0;

  useEffect(() => {
    if (!isEditing) {
      setInputValue(formatNumberInputValue(value));
    }
  }, [isEditing, value]);

  return (
    <Field
      label={hideLabel ? undefined : label}
      minW={width}
      maxW={width}
      helperText={helperText}
      flexShrink={0}
    >
      <Input
        size="sm"
        type={allowsNegativeValues ? "text" : "number"}
        inputMode={allowsNegativeValues ? "decimal" : undefined}
        min={min}
        name={name}
        step={step}
        autoComplete="off"
        aria-label={hideLabel ? label : undefined}
        value={inputValue}
        onFocus={() => {
          setIsEditing(true);
        }}
        onBlur={() => {
          setIsEditing(false);
          setInputValue(formatNumberInputValue(value));
        }}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;

          if (allowsNegativeValues && !isValidNumberInputDraft(nextValue)) {
            return;
          }

          setInputValue(nextValue);

          if (nextValue === "") {
            onChange(undefined);
            return;
          }

          const numericValue = Number(nextValue.replace(",", "."));

          if (Number.isFinite(numericValue)) {
            onChange(numericValue);
          }
        }}
      />
    </Field>
  );
}

function formatNumberInputValue(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

function isValidNumberInputDraft(value: string): boolean {
  return /^-?(?:\d+)?(?:[.,]\d*)?$/.test(value);
}
