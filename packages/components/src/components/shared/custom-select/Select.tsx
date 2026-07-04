"use client";

import {
  Box,
  Combobox,
  Portal,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { Attribute, Configuration, SelectOption } from "@konfi/types";
import { TFunction } from "i18next";
import { ReadonlyURLSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FormatPreview,
  hasFormatPreviewDimensions,
} from "../common/FormatPreview";

type SelectProps = {
  attributeId: Attribute["id"];
  attributeName: Attribute["name"];
  options: SelectOption[];
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  searchParams?: ReadonlyURLSearchParams;
  value?: string;
  t: TFunction;
};

export function Select({
  attributeId,
  attributeName,
  options,
  updateConfiguration,
  searchParams,
  value,
  t,
}: SelectProps) {
  const selectOptions = useMemo(() => options, [options]);

  const placeholderLabel = useMemo(
    () =>
      t("common.selectPlaceholder", {
        attributeName,
        defaultValue: `Select ${attributeName}...`,
      }),
    [t, attributeName],
  );

  const emptyStateLabel = useMemo(
    () =>
      t("common.noOptionsAvailable", { defaultValue: "No options available" }),
    [t],
  );

  const { contains } = useFilter({ sensitivity: "base" });

  const {
    collection,
    set,
    filter: applyFilter,
    reset,
  } = useListCollection<SelectOption>({
    initialItems: selectOptions,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
    filter: contains,
  });

  const isUserInteractingRef = useRef(false);

  const resetOptionFilter = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    resetOptionFilter();
  }, [resetOptionFilter]);

  const searchParamValue = useMemo(
    () => (searchParams ? searchParams.get(attributeId) : null),
    [attributeId, searchParams],
  );

  const resolvedOption = useMemo(() => {
    const fallbackOption = selectOptions[0];
    const selectedFromProps = value ?? searchParamValue;
    if (!selectedFromProps) {
      return fallbackOption;
    }
    return (
      selectOptions.find((option) => option.value === selectedFromProps) ??
      fallbackOption
    );
  }, [selectOptions, value, searchParamValue]);

  const initialValueAppliedRef = useRef(false);

  const [selectedValue, setSelectedValue] = useState<string>(
    resolvedOption?.value ?? "",
  );
  const [inputValue, setInputValue] = useState<string>(
    resolvedOption?.label ?? "",
  );

  useEffect(() => {
    // Don't override local state if user is actively interacting with the select
    if (isUserInteractingRef.current) {
      return;
    }
    const nextValue = resolvedOption?.value ?? "";
    const nextLabel = resolvedOption?.label ?? "";
    setSelectedValue(nextValue);
    setInputValue(nextLabel);
    set(selectOptions);
  }, [resolvedOption, selectOptions, set]);

  useEffect(() => {
    if (!resolvedOption?.value) {
      return;
    }

    const hasExternalValue = Boolean(value ?? searchParamValue);
    if (hasExternalValue) {
      initialValueAppliedRef.current = true;
      return;
    }

    if (initialValueAppliedRef.current) {
      return;
    }

    initialValueAppliedRef.current = true;
    if (!selectedValue) {
      setSelectedValue(resolvedOption.value);
      setInputValue(resolvedOption.label ?? "");
    }
    set(selectOptions);

    updateConfiguration({
      selectedAttributeOptions: { [attributeId]: resolvedOption.value },
    });
  }, [
    resolvedOption,
    value,
    searchParamValue,
    selectedValue,
    updateConfiguration,
    attributeId,
  ]);

  function handleOnChange(nextValue: string, nextLabel?: string) {
    updateConfiguration({
      selectedAttributeOptions: { [attributeId]: nextValue },
    });
    setInputValue(nextLabel ?? "");
    resetOptionFilter();
  }

  function handleInputValueChange(details: Combobox.InputValueChangeDetails) {
    const next = details.inputValue;
    setInputValue(next ?? "");
    const normalized = (next ?? "").trim();
    if (normalized.length === 0) {
      set(selectOptions);
      return;
    }
    applyFilter(normalized);
  }

  // Compute the selected option directly based on selectedValue for accurate rendering
  const selectedOption = useMemo(
    () => selectOptions.find((option) => option.value === selectedValue),
    [selectOptions, selectedValue],
  );

  return (
    <Combobox.Root
      colorPalette="primary"
      collection={collection}
      value={selectedValue ? [selectedValue] : []}
      inputValue={inputValue}
      onValueChange={(details) => {
        const [next] = details.value;
        if (!next) {
          return;
        }
        const nextOption = selectOptions.find(
          (option) => option.value === next,
        );
        if (!nextOption || nextOption.disabled) {
          return;
        }
        isUserInteractingRef.current = true;
        setSelectedValue(nextOption.value);
        handleOnChange(nextOption.value, nextOption.label);
        // Reset the flag after a short delay to allow parent re-render to complete
        setTimeout(() => {
          isUserInteractingRef.current = false;
        }, 0);
      }}
      onInputValueChange={handleInputValueChange}
      onOpenChange={({ open }) => {
        if (open) {
          resetOptionFilter();
        }
      }}
      openOnClick={options.length > 0}
      selectionBehavior="replace"
      closeOnSelect
      width="100%"
    >
      <Combobox.Control>
        <Box display="flex" alignItems="center" gap="2" flex="1">
          {selectedOption?.color && (
            <Box
              borderRadius="full"
              boxSize="4"
              backgroundColor={selectedOption.color}
              borderWidth="1px"
            />
          )}
          {hasFormatPreviewDimensions(
            selectedOption?.formatWidth,
            selectedOption?.formatHeight,
          ) && (
            <FormatPreview
              formatWidth={selectedOption?.formatWidth}
              formatHeight={selectedOption?.formatHeight}
              showDimensions={false}
              previewBoxSize={10}
            />
          )}
          <Combobox.Input placeholder={placeholderLabel} flex="1" />
        </Box>
        <Combobox.IndicatorGroup>
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.Empty>{emptyStateLabel}</Combobox.Empty>
            {collection.items.map((item: SelectOption) => {
              const isDisabled = item.disabled || false;
              return (
                <Combobox.Item
                  key={`${item.value}-${item.label}`}
                  item={item}
                  _disabled={{
                    opacity: 0.5,
                    cursor: "not-allowed",
                  }}
                  css={
                    isDisabled
                      ? {
                          pointerEvents: "none",
                          opacity: 0.5,
                        }
                      : undefined
                  }
                >
                  <Box display="flex" alignItems="center" gap="2" width="100%">
                    {item.color && (
                      <Box
                        borderRadius="full"
                        boxSize="4"
                        backgroundColor={item.color}
                        borderWidth="1px"
                      />
                    )}
                    <Box flexGrow={1}>
                      <Combobox.ItemText>
                        {item.label}
                        {isDisabled &&
                          ` (${t("common.unavailable", { defaultValue: "Unavailable" })})`}
                      </Combobox.ItemText>
                      {hasFormatPreviewDimensions(
                        item.formatWidth,
                        item.formatHeight,
                      ) && (
                        <FormatPreview
                          formatWidth={item.formatWidth}
                          formatHeight={item.formatHeight}
                          previewBoxSize={10}
                          textAlign="start"
                        />
                      )}
                    </Box>
                    <Combobox.ItemIndicator />
                  </Box>
                </Combobox.Item>
              );
            })}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
