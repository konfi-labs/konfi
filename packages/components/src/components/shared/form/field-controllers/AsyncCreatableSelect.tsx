"use client";

import {
  Combobox,
  HStack,
  Portal,
  Span,
  Spinner,
  Stack,
  useListCollection,
} from "@chakra-ui/react";
import {
  Customer,
  DiscountTypeEnum,
  FieldData,
  SearchSelectOption,
} from "@konfi/types";
import { handleSelectAsyncOption, promiseOptions } from "@konfi/utils";
import { debounce } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DiscountTag } from "../../DiscountTag";

// Extended type for internal use
interface ExtendedSearchSelectOption extends SearchSelectOption<
  Partial<Customer> & { id: string }
> {
  // Align with SearchSelectOption new item flag expected by handleSelectAsyncOption
  __isNew__?: boolean;
}

function isNewSearchOption(option: ExtendedSearchSelectOption) {
  return option["__isNew__"] === true;
}

/**
 * Async creatable select with debounced search and automatic reset for short inputs.
 * When input length < 3, shows only `searchOptions`. When ≥3, searches via `searchFn`.
 * Supports creating new options via `handleSelectAsyncOption`.
 */
export const AsyncCreatableSelect = ({
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
  "use memo";

  const { control, getValues, setValue } = useFormContext();
  const watchedValue = useWatch({ name: fieldData.name });
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Keep initialOptions stable unless searchOptions changes
  const initialOptions = useMemo(
    () => (searchOptions || []) as ExtendedSearchSelectOption[],
    [searchOptions],
  );

  const [baseOptions, setBaseOptions] =
    useState<ExtendedSearchSelectOption[]>(initialOptions);
  const [searchResults, setSearchResults] =
    useState<ExtendedSearchSelectOption[]>(initialOptions);

  // If input shrinks below threshold, restore initial options (prevents stale remote results)
  useEffect(() => {
    if (inputValue.length < 3) {
      setBaseOptions(initialOptions);
    }
  }, [inputValue, initialOptions]);

  // Update searchResults to always include creatable option if inputValue present
  useEffect(() => {
    const createOption: ExtendedSearchSelectOption | undefined = inputValue
      ? {
          label: inputValue,
          value: inputValue,
          __isNew__: true,
          object: { id: inputValue },
        }
      : undefined;
    const newSearchResults = createOption
      ? [...baseOptions, createOption]
      : baseOptions;
    setSearchResults(newSearchResults);
  }, [inputValue, baseOptions]);

  const { collection, set } = useListCollection<ExtendedSearchSelectOption>({
    initialItems: searchResults,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
  });

  useEffect(() => {
    set(searchResults);
  }, [searchResults, set]);

  const searchFetch = useCallback(
    (value: string) => {
      if (value.length < 3) return;
      setIsLoading(true);
      promiseOptions(value, fieldData.searchFor, searchFn)
        .then((results) => {
          setBaseOptions(results || []);
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [fieldData.searchFor, searchFn],
  );

  // Debounce handling via ref for reliable cancel
  // Provide explicit type allowing an optional cancel method from debounce implementation
  type DebouncedSearchFn = ((value: string) => void) & { cancel?: () => void };
  const debouncedRef = useRef<DebouncedSearchFn | null>(null);

  useEffect(() => {
    const fn = debounce(searchFetch, 300) as DebouncedSearchFn;
    debouncedRef.current = fn;

    return () => {
      // Feature-detect cancel or abort semantics
      fn.cancel?.();
    };
  }, [searchFetch]);

  function onInputChange(value: string) {
    debouncedRef.current?.(value);
  }

  const derivedLabel = useMemo(() => {
    if (!watchedValue) return "";

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
      return first.toString();
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

    return watchedValue.toString();
  }, [watchedValue]);

  useEffect(() => {
    if (!derivedLabel) {
      setInputValue("");
      return;
    }
    setInputValue(derivedLabel);
  }, [derivedLabel]);

  const syncNewCustomerContactName = useCallback(
    (selectedOption: ExtendedSearchSelectOption) => {
      if (fieldData.name !== "customer" || !isNewSearchOption(selectedOption)) {
        return;
      }

      const customerName = selectedOption.label?.toString().trim();

      if (!customerName) {
        return;
      }

      const contactName = getValues("contact.name");

      if (typeof contactName === "string" && contactName.trim()) {
        return;
      }

      setValue("contact.name", customerName, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [fieldData.name, getValues, setValue],
  );

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
                  field.name,
                  fieldData.searchResult,
                  setValue,
                );
                syncNewCustomerContactName(selectedOption);
                setInputValue(selectedOption.label?.toString() || "");
              } else {
                const customOption: ExtendedSearchSelectOption = {
                  label: selectedValue,
                  value: selectedValue,
                  object: { id: selectedValue },
                  __isNew__: true,
                };

                handleSelectAsyncOption(
                  customOption,
                  field.name,
                  fieldData.searchResult,
                  setValue,
                );
                syncNewCustomerContactName(customOption);
                setInputValue(selectedValue.toString());
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
            openOnClick={!isEmpty(searchResults)}
            allowCustomValue
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
                  ) : (
                    collection.items.map((item: ExtendedSearchSelectOption) => (
                      <Combobox.Item
                        key={`${item.value}-${item.label}`}
                        item={item}
                      >
                        {isNewSearchOption(item) ? (
                          <HStack>
                            <span>
                              {t("actions.createWithValue", {
                                value: item.label,
                                defaultValue: `Create "${item.label}"`,
                              })}
                            </span>
                          </HStack>
                        ) : (
                          <Stack gap={0} w="100%">
                            <Span textStyle="sm" fontWeight="medium">
                              {item.label}
                            </Span>
                            <Span textStyle="xs" color="fg.muted">
                              {item.object?.email}
                            </Span>
                            {item.object?.discount ? (
                              <DiscountTag
                                discountValue={item.object.discount}
                                type={DiscountTypeEnum.PERCENTAGE}
                                code={null}
                                top={-2.5}
                                right={-1}
                              />
                            ) : null}
                          </Stack>
                        )}
                        <Combobox.ItemIndicator />
                      </Combobox.Item>
                    ))
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
