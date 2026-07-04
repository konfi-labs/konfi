"use client";

import {
  Combobox,
  Portal,
  TagsInput,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { FieldData, SelectOption } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { TFunction } from "i18next";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CloseButton } from "../../../ui/close-button";

type Props = {
  _field: FieldData;
  options: SelectOption[] | null | undefined;
  t: TFunction;
};

export function MultiOptionSelectFieldController({
  _field,
  options,
  t,
}: Props) {
  const { setValue, control } = useFormContext();
  const [inputValue, setInputValue] = useState("");
  const instanceId = useId();

  // Create stable options array
  const selectOptions = useMemo(
    () => (options || []) as SelectOption[],
    [options],
  );

  const { contains } = useFilter({ sensitivity: "base" });

  const { collection, set, filter } = useListCollection<SelectOption>({
    initialItems: selectOptions,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
    filter: contains,
  });

  useEffect(() => {
    set(selectOptions);
    filter("");
  }, [selectOptions, set, filter]);

  const sharedIds = useMemo(
    () => ({
      input: `multi-option-select-input-${instanceId}`,
      control: `multi-option-select-control-${instanceId}`,
    }),
    [instanceId],
  );

  const clearInput = useCallback(() => {
    setInputValue("");
    filter("");
  }, [filter]);

  const updateSelectedValues = useCallback(
    (nextValues: string[]) => {
      setValue(_field.name, nextValues, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      clearInput();
    },
    [_field.name, clearInput, setValue],
  );

  const handleInputValueChange = useCallback(
    (details: { inputValue: string }) => {
      setInputValue(details.inputValue);
      filter(details.inputValue);
    },
    [filter],
  );

  const getSelectedOptions = useCallback(
    (fieldValue: string[] | undefined) => {
      if (!fieldValue) return [];

      return fieldValue.map((v: string) => {
        const option = selectOptions.find((option) => option.value === v);
        return {
          label: !isUndefined(_field.enumName)
            ? t(`${_field.enumName}.${v}`)
            : option?.label,
          value: v,
        } as SelectOption;
      });
    },
    [selectOptions, _field.enumName, t],
  );

  return (
    <Controller
      name={_field.name}
      control={control}
      render={({ field }) => {
        const selectedOptions = getSelectedOptions(field.value);
        const selectedValues = selectedOptions.map((option) =>
          option.value.toString(),
        );
        const addSelectedValue = (nextValues: string[]) => {
          const nextValue = nextValues.find(
            (value) => !selectedValues.includes(value),
          );

          if (!nextValue) {
            clearInput();
            return;
          }

          updateSelectedValues([...selectedValues, nextValue]);
        };
        const placeholderLabel =
          selectedOptions.length === 0 ? _field.placeholder : "";
        const isDisabled = !options || options?.length <= 0;

        return (
          <Combobox.Root
            ids={sharedIds}
            colorPalette="primary"
            collection={collection}
            value={[]}
            inputValue={inputValue}
            multiple
            onValueChange={(details) => {
              addSelectedValue(details.value);
            }}
            disabled={isDisabled}
            openOnClick={!isNull(options) && (options?.length || 0) > 0}
            closeOnSelect={false}
            selectionBehavior="clear"
            width="100%"
            onInputValueChange={handleInputValueChange}
          >
            <TagsInput.Root
              ids={sharedIds}
              colorPalette="primary"
              value={selectedValues}
              inputValue={inputValue}
              onValueChange={(details) => {
                updateSelectedValues(details.value);
              }}
              onInputValueChange={handleInputValueChange}
              editable={false}
              validate={() => false}
              disabled={isDisabled}
              width="100%"
            >
              <TagsInput.Control
                bg={{ base: "white", _dark: "gray.950" }}
                display="flex"
                alignItems="center"
                flexWrap="wrap"
                gap="2"
                width="100%"
              >
                {selectedOptions.map((selectedOption, index) => (
                  <TagsInput.Item
                    key={selectedOption.value}
                    index={index}
                    value={selectedOption.value}
                  >
                    <TagsInput.ItemPreview>
                      <TagsInput.ItemText>
                        {selectedOption.label}
                      </TagsInput.ItemText>
                      <TagsInput.ItemDeleteTrigger asChild>
                        <CloseButton
                          size="2xs"
                          variant="plain"
                          focusVisibleRing="inside"
                          focusRingWidth="2px"
                          pointerEvents="auto"
                        />
                      </TagsInput.ItemDeleteTrigger>
                    </TagsInput.ItemPreview>
                  </TagsInput.Item>
                ))}

                <Combobox.Input asChild unstyled>
                  <TagsInput.Input
                    ref={field.ref}
                    onBlur={field.onBlur}
                    flex="1"
                    minW="6"
                    placeholder={placeholderLabel}
                    required={
                      Boolean(_field.isRequired) && selectedOptions.length === 0
                    }
                  />
                </Combobox.Input>

                <Combobox.IndicatorGroup
                  ml="auto"
                  flexShrink={0}
                  alignSelf="center"
                >
                  <TagsInput.ClearTrigger asChild>
                    <CloseButton
                      size="xs"
                      variant="plain"
                      focusVisibleRing="inside"
                      focusRingWidth="2px"
                      pointerEvents="auto"
                    />
                  </TagsInput.ClearTrigger>
                  <Combobox.Trigger />
                </Combobox.IndicatorGroup>
              </TagsInput.Control>
            </TagsInput.Root>

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
}
