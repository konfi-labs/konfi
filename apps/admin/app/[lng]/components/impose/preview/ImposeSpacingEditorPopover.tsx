"use client";

import { useT } from "@/i18n/client";
import { Box, Button, HStack, Input, Text, VStack } from "@chakra-ui/react";
import type { SpacingEditorState } from "./preview-helpers";

export function ImposeSpacingEditorPopover({
  spacingEditor,
  spacingInputValue,
  onChange,
  onCancel,
  onApply,
}: {
  spacingEditor: SpacingEditorState;
  spacingInputValue: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { t } = useT(["impose", "translation"]);

  return (
    <Box
      position="absolute"
      top={`${spacingEditor.y}px`}
      left={`${spacingEditor.x}px`}
      transform="translate(-50%, -50%)"
      zIndex={5}
      minW="15rem"
      p={3}
      borderRadius="xl"
      borderWidth="1px"
      bg={{ base: "white", _dark: "gray.950" }}
      boxShadow="lg"
    >
      <VStack align="stretch" gap={3}>
        <Text fontSize="sm" fontWeight="semibold">
          {spacingEditor.axis === "horizontal"
            ? t("impose.workspace.editHorizontalSpacing", {
                defaultValue: "Edit horizontal spacing",
              })
            : t("impose.workspace.editVerticalSpacing", {
                defaultValue: "Edit vertical spacing",
              })}
        </Text>
        <Input
          size="sm"
          type="number"
          min={0}
          step={0.5}
          autoFocus
          value={spacingInputValue}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onApply();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <Text fontSize="xs" color={{ base: "gray.600", _dark: "gray.400" }}>
          {t("impose.workspace.spacingEditorAxisHint", {
            defaultValue: "This edit updates the whole {{axis}} axis.",
            axis:
              spacingEditor.axis === "horizontal"
                ? t("impose.workspace.horizontalAxis", {
                    defaultValue: "horizontal",
                  })
                : t("impose.workspace.verticalAxis", {
                    defaultValue: "vertical",
                  }),
          })}
        </Text>
        <HStack justify="flex-end">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button size="sm" colorPalette="primary" onClick={onApply}>
            {t("impose.workspace.applySpacing", {
              defaultValue: "Apply",
            })}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}
