"use client";

import {
  Combobox,
  HStack,
  Portal,
  Spinner,
  useListCollection,
} from "@chakra-ui/react";
import { FieldData, SearchSelectOption } from "@konfi/types";
import {
  DONE_TYPING_INTERVAL,
  handleSelectAsyncOption,
  promiseOptions,
} from "@konfi/utils";
import { debounce } from "es-toolkit";
import { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

export const AsyncSelect = ({
  fieldData,
  disabled,
  searchOptions,
  searchFn,
  t,
}: {
  fieldData: FieldData;
  disabled: boolean;
  searchOptions: { label: any; value: any; object: any }[] | undefined;
  searchFn:
    | { [x: string]: (searchKey: string) => Promise<any[] | undefined | void> }
    | undefined;
  t: TFunction;
}) => {
  const { setValue, control } = useFormContext();
  const watchedValue = useWatch({ name: fieldData.name });
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Keep initialOptions stable unless searchOptions changes
  const initialOptions = useMemo(
    () => (searchOptions || []) as SearchSelectOption<{ id: string }>[],
    [searchOptions],
  );

  const [currentOptions, setCurrentOptions] =
    useState<SearchSelectOption<{ id: string }>[]>(initialOptions);

  useEffect(() => {
    setCurrentOptions(initialOptions);
  }, [initialOptions]);

  const { collection, set } = useListCollection<
    SearchSelectOption<{ id: string }>
  >({
    initialItems: currentOptions,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
  });

  useEffect(() => {
    set(currentOptions);
  }, [currentOptions, set]);

  const derivedLabel = useMemo(() => {
    if (!watchedValue) return "";

    const labelFromOptionValue = (value: string) =>
      currentOptions
        .find((option) => option.value?.toString() === value)
        ?.label?.toString();

    if (Array.isArray(watchedValue)) {
      const first = watchedValue[0];
      if (!first) return "";
      if (typeof first === "object") {
        return (
          (first as { label?: string; name?: string; value?: string }).label ||
          (first as { label?: string; name?: string; value?: string }).name ||
          (first as { label?: string; name?: string; value?: string }).value ||
          ""
        ).toString();
      }
      return labelFromOptionValue(first.toString()) ?? first.toString();
    }

    if (typeof watchedValue === "object") {
      const value =
        (watchedValue as { label?: string; name?: string; value?: string })
          .label ??
        (watchedValue as { label?: string; name?: string; value?: string })
          .name ??
        (watchedValue as { label?: string; name?: string; value?: string })
          .value;
      return value?.toString() ?? "";
    }

    return (
      labelFromOptionValue(watchedValue.toString()) ?? watchedValue.toString()
    );
  }, [currentOptions, watchedValue]);

  useEffect(() => {
    if (!derivedLabel) {
      setInputValue("");
      return;
    }
    setInputValue(derivedLabel);
  }, [derivedLabel]);

  const searchFetch = useCallback(
    (value: string) => {
      setIsLoading(true);
      promiseOptions(value, fieldData.searchFor, searchFn)
        .then((results) => {
          setCurrentOptions(results || []);
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [fieldData.searchFor, searchFn],
  );

  // Debounce handling via ref for reliable cancel
  type DebouncedSearchFn = ((value: string) => void) & { cancel?: () => void };
  const debouncedRef = useRef<DebouncedSearchFn | null>(null);

  useEffect(() => {
    const fn = debounce(searchFetch, DONE_TYPING_INTERVAL) as DebouncedSearchFn;
    debouncedRef.current = fn;

    return () => {
      // Feature-detect cancel or abort semantics
      fn.cancel?.();
    };
  }, [searchFetch]);

  function onInputChange(value: string) {
    debouncedRef.current?.(value);
  }

  return (
    <Controller
      name={fieldData.name}
      control={control}
      render={({ field }) => {
        const getComboboxValue = () => {
          if (typeof field.value === "object" && field.value) {
            const val = Array.isArray(field.value)
              ? field.value[0]
              : field.value.id;
            return val ? [val.toString()] : [];
          } else if (field.value) {
            return [field.value.toString()];
          }
          return [];
        };

        return (
          <Combobox.Root
            colorPalette="primary"
            collection={collection}
            value={getComboboxValue()}
            inputValue={inputValue}
            onValueChange={(details) => {
              const selectedValue = details.value[0];
              if (!selectedValue) {
                setValue(field.name, null);
                setInputValue("");
                return;
              }
              const selectedOption = collection.find(selectedValue);
              if (selectedOption) {
                handleSelectAsyncOption(
                  selectedOption,
                  fieldData.name,
                  fieldData.searchResult,
                  setValue,
                );
                setInputValue(selectedOption.label?.toString() || "");
              }
            }}
            onInputValueChange={(details) => {
              const newInputValue = details.inputValue;
              setInputValue(newInputValue);
              onInputChange(newInputValue);
            }}
            onBlur={field.onBlur}
            disabled={disabled}
            placeholder={fieldData.placeholder}
            openOnClick={currentOptions.length > 0}
            selectionBehavior="replace"
            closeOnSelect
            width="100%"
          >
            <Combobox.Control>
              <Combobox.Input />
              <Combobox.IndicatorGroup>
                {isLoading && <Spinner size="xs" />}
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content>
                  {isLoading ? (
                    <HStack p="2" justifyContent="center">
                      <Spinner size="xs" />
                      <span>{t("common.loading")}</span>
                    </HStack>
                  ) : currentOptions.length === 0 ? (
                    <Combobox.Empty>
                      {t("common.noOptions", { defaultValue: "No options" })}
                    </Combobox.Empty>
                  ) : (
                    collection.items.map(
                      (item: SearchSelectOption<{ id: string }>) => (
                        <Combobox.Item
                          key={`${item.value}-${item.label}`}
                          item={item}
                        >
                          <Combobox.ItemText>{item.label}</Combobox.ItemText>
                          <Combobox.ItemIndicator />
                        </Combobox.Item>
                      ),
                    )
                  )}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
        );
      }}
    />
  );
};
