"use client";

import { Box, Button, Collapsible, HStack, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  badge?: ReactNode;
  /** Extra node rendered in the header row on the right side (e.g. a bulk-action button). */
  headerRight?: ReactNode;
  /** Whether the section starts expanded. Defaults to true. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Reusable collapsible section with a clickable header row (title, optional
 * badge, optional right-side content) and a chevron that rotates on open/close.
 * Uses Chakra v3 Collapsible primitives — the same pattern used throughout this
 * codebase (e.g. FakturowniaInvoicePartiesSection, AttributeMappingSection).
 */
export function CollapsibleSection({
  title,
  badge,
  headerRight,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={({ open: next }) => setOpen(next)}
    >
      {/* headerRight is a SIBLING of the trigger, never nested inside the
          trigger <button> (nested interactive elements are invalid HTML and
          would make the inner control unreliable). */}
      <HStack w="full" align="center" gap={2}>
        <Collapsible.Trigger asChild>
          <Button
            type="button"
            flex={1}
            h="auto"
            minW={0}
            justifyContent="space-between"
            variant="ghost"
            cursor="pointer"
            py={1}
            px={0}
            gap={2}
          >
            <HStack gap={2} minW={0}>
              <Text fontSize="md" fontWeight="semibold">
                {title}
              </Text>
              {badge}
            </HStack>
            <MaterialSymbol
              style={{
                fontSize: 20,
                transition: "transform 0.2s",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              expand_more
            </MaterialSymbol>
          </Button>
        </Collapsible.Trigger>
        {headerRight ? <Box flexShrink={0}>{headerRight}</Box> : null}
      </HStack>
      <Collapsible.Content>
        <div style={{ paddingTop: "8px" }}>{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
