"use client";

import { Box, Button, Collapsible, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { ReactNode } from "react";

export interface ImposeFloatingSectionItem {
  key: string;
  icon: string;
  label: string;
  content: ReactNode;
  contentWidth?: string;
}

const pillBlurCss = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
} as const;

export function ImposeFloatingSections({
  sections,
  openKey,
  onOpenChange,
  label,
}: {
  sections: ImposeFloatingSectionItem[];
  openKey: string | null;
  onOpenChange: (key: string | null) => void;
  label: string;
}) {
  return (
    <Box
      role="group"
      aria-label={label}
      position={{ base: "static", lg: "absolute" }}
      top={{ lg: 4 }}
      left={{ lg: 4 }}
      zIndex={10}
      width="fit-content"
      pointerEvents="none"
    >
      <VStack align="flex-start" gap={2} pointerEvents="auto">
        {sections.map((section) => {
          const isOpen = openKey === section.key;
          const contentId = `impose-section-content-${section.key}`;
          const triggerId = `impose-section-trigger-${section.key}`;

          return (
            <Collapsible.Root
              key={section.key}
              open={isOpen}
              onOpenChange={({ open }) => {
                onOpenChange(open ? section.key : null);
              }}
            >
              <Collapsible.Trigger asChild>
                <Button
                  id={triggerId}
                  aria-controls={contentId}
                  variant={isOpen ? "surface" : "ghost"}
                  colorPalette={isOpen ? "primary" : "gray"}
                  size="sm"
                  gap={2}
                  px={3}
                  css={isOpen ? undefined : pillBlurCss}
                  bg={
                    isOpen
                      ? undefined
                      : {
                          base: "whiteAlpha.900",
                          _dark: "blackAlpha.700",
                        }
                  }
                  borderWidth="1px"
                  boxShadow={isOpen ? undefined : "sm"}
                >
                  <MaterialSymbol>{section.icon}</MaterialSymbol>
                  {section.label}
                  <Box
                    as="span"
                    display="flex"
                    alignItems="center"
                    transition="transform 0.2s"
                    transform={isOpen ? "rotate(90deg)" : "rotate(0deg)"}
                  >
                    <MaterialSymbol>chevron_right</MaterialSymbol>
                  </Box>
                </Button>
              </Collapsible.Trigger>
              {/* The collapsible recipe sets overflow:hidden for the height
                  animation, which would clip the card's shadow — the padding
                  below gives the shadow room and the negative margins cancel
                  it out so the card itself does not shift. */}
              <Collapsible.Content px={4} mx={-4} pb={6} mb={-6}>
                <Box
                  id={contentId}
                  role="region"
                  aria-labelledby={triggerId}
                  mt={1}
                  bg={{ base: "white", _dark: "gray.950" }}
                  borderWidth="1px"
                  borderRadius="2xl"
                  boxShadow="lg"
                  p={4}
                  width={section.contentWidth ?? "21rem"}
                  maxH="55vh"
                  overflowY="auto"
                >
                  {section.content}
                </Box>
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </VStack>
    </Box>
  );
}
