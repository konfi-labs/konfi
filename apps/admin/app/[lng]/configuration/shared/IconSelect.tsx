"use client";

import { createListCollection, HStack, Portal, Select, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useMemo } from "react";

type OptionItem = { label: string; value: string };

/**
 * Shared icon select used by all channel-methods configuration pages.
 * Accepts items as a prop so each domain can supply its own icon list.
 * The fallbackIcon is shown in the trigger when no value is selected.
 */
export function IconSelect({
  value,
  onChange,
  items,
  fallbackIcon = "settings",
}: {
  value: string;
  onChange: (value: string) => void;
  items: OptionItem[];
  fallbackIcon?: string;
}) {
  const collection = useMemo(() => createListCollection({ items }), [items]);

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={({ value: next }) =>
        onChange(next[0] ?? fallbackIcon)
      }
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <HStack gap={2}>
            <MaterialSymbol>{value || fallbackIcon}</MaterialSymbol>
            <Select.ValueText />
          </HStack>
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content maxH="320px" overflowY="auto">
            {collection.items.map((option) => (
              <Select.Item item={option} key={option.value}>
                <HStack gap={2}>
                  <MaterialSymbol>{option.value}</MaterialSymbol>
                  <Text fontSize="sm">{option.label}</Text>
                </HStack>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
