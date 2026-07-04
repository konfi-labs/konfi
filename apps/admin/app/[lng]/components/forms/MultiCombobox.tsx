"use client";

import {
  CloseButton,
  Combobox,
  Portal,
  TagsInput,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { useEffect, useId, useMemo, useState } from "react";

export interface MultiComboboxOption {
  label: string;
  value: string;
  description?: string;
}

export interface MultiComboboxProps {
  value: readonly string[];
  options: readonly MultiComboboxOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
}

/**
 * Controlled multi-select combobox with chip tags. Pass a fixed set of
 * options to pick from. Selected entries that are not in the option list
 * still render as chips (label falls back to the raw value) so callers can
 * safely render persisted IDs whose source data has not yet loaded.
 */
export function MultiCombobox({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  size = "sm",
}: MultiComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const instanceId = useId();
  const { contains } = useFilter({ sensitivity: "base" });

  const stableOptions = useMemo(() => options.slice(), [options]);

  const { collection, set, filter } = useListCollection<MultiComboboxOption>({
    initialItems: stableOptions,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    filter: contains,
  });

  useEffect(() => {
    set(stableOptions);
    filter("");
  }, [stableOptions, set, filter]);

  const selectedTags = useMemo(
    () =>
      value.map((selected) => {
        const option = stableOptions.find((o) => o.value === selected);
        return { value: selected, label: option?.label ?? selected };
      }),
    [stableOptions, value],
  );

  const sharedIds = useMemo(
    () => ({
      input: `multi-combobox-input-${instanceId}`,
      control: `multi-combobox-control-${instanceId}`,
    }),
    [instanceId],
  );

  const handleValueChange = (next: string[]) => {
    onChange(next);
    setInputValue("");
    filter("");
  };

  return (
    <Combobox.Root
      ids={sharedIds}
      colorPalette="primary"
      collection={collection}
      value={[...value]}
      inputValue={inputValue}
      multiple
      onValueChange={(details) => handleValueChange(details.value)}
      openOnClick={!disabled}
      closeOnSelect={false}
      width="100%"
      disabled={disabled}
      onInputValueChange={({ inputValue: next }) => {
        setInputValue(next);
        filter(next);
      }}
    >
      <TagsInput.Root
        ids={sharedIds}
        colorPalette="primary"
        size={size}
        value={[...value]}
        inputValue={inputValue}
        editable={false}
        onValueChange={(details) => handleValueChange(details.value)}
        onInputValueChange={({ inputValue: next }) => {
          setInputValue(next);
          filter(next);
        }}
        disabled={disabled}
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
          {selectedTags.map((tag, index) => (
            <TagsInput.Item key={tag.value} index={index} value={tag.value}>
              <TagsInput.ItemPreview>
                <TagsInput.ItemText>{tag.label}</TagsInput.ItemText>
                <TagsInput.ItemDeleteTrigger asChild>
                  <CloseButton
                    size="2xs"
                    variant="plain"
                    pointerEvents="auto"
                  />
                </TagsInput.ItemDeleteTrigger>
              </TagsInput.ItemPreview>
            </TagsInput.Item>
          ))}

          <Combobox.Input asChild unstyled>
            <TagsInput.Input
              flex="1"
              minW="6"
              placeholder={selectedTags.length === 0 ? placeholder : ""}
            />
          </Combobox.Input>

          <Combobox.IndicatorGroup ml="auto" flexShrink={0} alignSelf="center">
            <TagsInput.ClearTrigger asChild>
              <CloseButton size="xs" variant="plain" pointerEvents="auto" />
            </TagsInput.ClearTrigger>
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </TagsInput.Control>
      </TagsInput.Root>

      {collection.items.length > 0 ? (
        <Portal>
          <Combobox.Positioner>
            <Combobox.Content>
              {collection.items.map((item) => (
                <Combobox.Item key={item.value} item={item}>
                  <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              ))}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      ) : null}
    </Combobox.Root>
  );
}
