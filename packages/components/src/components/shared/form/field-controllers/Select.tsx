"use client";

import {
  Combobox,
  Portal,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { FieldData, SelectOption } from "@konfi/types";
import { handleSelectOption } from "@konfi/utils";
import { isNull } from "es-toolkit";
import { isEqual, isObject } from "es-toolkit/compat";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

export const SelectInput = ({
  field,
  options,
  disabled,
}: {
  field: FieldData;
  options: SelectOption[] | null | undefined;
  disabled: boolean;
}) => {
  const { setValue, control } = useFormContext();
  const watchedValue = useWatch({ name: field.name });

  // Create stable options array
  const selectOptions = useMemo(
    () => (options || []) as SelectOption[],
    [options],
  );

  const selectedOption = useMemo(() => {
    if (!watchedValue) return undefined;

    if (isObject(watchedValue)) {
      // Prefer deep-equal match against option.object (stable for Address/Contact)
      const objectMatch = selectOptions.find(
        (option) => option.object && isEqual(option.object, watchedValue),
      );
      if (objectMatch) return objectMatch;

      const namedValue = watchedValue as Record<string, unknown>;
      const candidate = selectOptions.find(
        (option) =>
          option.value === namedValue.name || option.value === namedValue.value,
      );
      return candidate;
    }

    return selectOptions.find((option) => option.value === watchedValue);
  }, [watchedValue, selectOptions]);

  const { contains } = useFilter({ sensitivity: "base" });

  const { collection, set, filter, reset } = useListCollection<SelectOption>({
    initialItems: selectOptions,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
    filter: contains,
  });

  const [inputValue, setInputValue] = useState<string>(
    selectedOption?.label?.toString() || "",
  );
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
    setInputValue(selectedOption.label?.toString() || "");
  }, [selectedOption]);

  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: _field }) => {
        const comboboxValue = selectedOption
          ? [selectedOption.value.toString()]
          : [];

        return (
          <Combobox.Root
            colorPalette="primary"
            collection={collection}
            value={comboboxValue}
            inputValue={inputValue}
            onValueChange={(details) => {
              const selectedValue = details.value[0];
              if (!selectedValue) {
                setValue(field.name, null);
                setInputValue("");
                resetOptionFilter();
                return;
              }
              const selectedOption = collection.find(selectedValue);
              if (selectedOption) {
                handleSelectOption(field.name, selectedOption, setValue);
                setInputValue(selectedOption.label?.toString() || "");
                resetOptionFilter();
              }
            }}
            onBlur={_field.onBlur}
            disabled={!options || options?.length <= 0 || disabled}
            placeholder={field.placeholder}
            openOnClick={!isNull(options) && (options?.length || 0) > 0}
            selectionBehavior="replace"
            closeOnSelect
            width="100%"
            onOpenChange={({ open }) => {
              if (open) {
                resetOptionFilter();
              }
            }}
            onInputValueChange={(details) => {
              setInputValue(details.inputValue);
              filter(details.inputValue);
            }}
          >
            <Combobox.Control>
              <Combobox.Input />
              <Combobox.IndicatorGroup>
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content>
                  {collection.items.map((item: SelectOption) => (
                    <Combobox.Item
                      key={`${item.value}-${item.label}`}
                      item={item}
                    >
                      <Combobox.ItemText>{item.label}</Combobox.ItemText>
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
        );
      }}
    />
  );
};
