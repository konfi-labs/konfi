"use client";

import { Box, createListCollection, HStack, Portal, Select, Text } from "@chakra-ui/react";
import { useMemo } from "react";

type OptionItem = { label: string; value: string };

/**
 * Shared color-palette select used by all channel-methods configuration pages.
 * Accepts items as a prop so each domain can supply its own translated labels.
 */
export function ColorPaletteSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: OptionItem[];
}) {
  const collection = useMemo(() => createListCollection({ items }), [items]);

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={({ value: next }) => onChange(next[0] ?? "gray")}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <HStack gap={2}>
            <Box
              bg={`${value}.solid`}
              borderRadius="full"
              boxSize="3"
              flexShrink={0}
            />
            <Select.ValueText />
          </HStack>
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((option) => (
              <Select.Item item={option} key={option.value}>
                <HStack gap={2}>
                  <Box
                    bg={`${option.value}.solid`}
                    borderRadius="full"
                    boxSize="3"
                    flexShrink={0}
                  />
                  <Text textTransform="capitalize">{option.label}</Text>
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
