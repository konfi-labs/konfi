"use client";

import {
  Box,
  HStack,
  Portal,
  Select,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useMemo } from "react";

export const TAXONOMY_COLOR_PALETTES = [
  "primary",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

const COLOR_OPTIONS = TAXONOMY_COLOR_PALETTES.map((color) => ({
  label: color,
  value: color,
}));
const COLOR_COLLECTION = createListCollection({ items: COLOR_OPTIONS });

export function ColorPaletteSelect({
  fallback = "gray",
  value,
  onChange,
}: {
  fallback?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      collection={COLOR_COLLECTION}
      value={[value]}
      onValueChange={({ value: next }) => onChange(next[0] ?? fallback)}
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
            {COLOR_OPTIONS.map((option) => (
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

export const DEFAULT_TAXONOMY_ICON_OPTIONS = [
  "category",
  "tag",
  "label",
  "fact_check",
  "task_alt",
  "schedule",
  "inventory_2",
  "settings",
  "tune",
  "build",
  "flag",
  "priority_high",
  "verified",
  "approval",
  "rate_review",
  "feedback",
  "sticky_note_2",
  "edit_document",
  "rule",
  "draft",
  "play_arrow",
  "block",
  "warning",
  "lock",
  "support_agent",
] as const;

export function IconSelect({
  fallback = "category",
  icons = DEFAULT_TAXONOMY_ICON_OPTIONS,
  value,
  onChange,
}: {
  fallback?: string;
  icons?: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const collection = useMemo(() => {
    const all = Array.from(new Set([...icons, value || fallback])).filter(
      Boolean,
    );
    return createListCollection({
      items: all.map((icon) => ({ label: icon, value: icon })),
    });
  }, [icons, value, fallback]);

  const current = value || fallback;

  return (
    <Select.Root
      collection={collection}
      value={[current]}
      onValueChange={({ value: next }) => onChange(next[0] ?? fallback)}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <HStack gap={2}>
            <MaterialSymbol>{current}</MaterialSymbol>
            <Text fontSize="sm">{current}</Text>
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
