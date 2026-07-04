"use client";

import { Box, Button, HStack, Spinner, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useT } from "@/i18n/client";
import type { ReactNode } from "react";

export function StickyActionBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  saveLabel,
  summary,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: ReactNode;
  summary?: ReactNode;
}) {
  const { t } = useT();

  return (
    <Box
      bg="bg.panel"
      borderTopWidth="1px"
      bottom={0}
      position="sticky"
      px={4}
      py={3}
      zIndex={2}
      mt={2}
      mx={-4}
      shadow={dirty ? "md" : undefined}
      transition="box-shadow 0.2s"
    >
      <HStack justify="space-between" gap={3} wrap="wrap">
        <HStack color="fg.muted" fontSize="sm" gap={2}>
          {dirty ? (
            <>
              <MaterialSymbol>edit_note</MaterialSymbol>
              <Text>
                {t("taxonomyEditor.saveBar.unsavedChanges", {
                  defaultValue: "You have unsaved changes",
                })}
              </Text>
            </>
          ) : (
            <>
              <MaterialSymbol>check_circle</MaterialSymbol>
              <Text>
                {t("taxonomyEditor.saveBar.saved", {
                  defaultValue: "All changes saved",
                })}
              </Text>
            </>
          )}
          {summary ? (
            <Text color="fg.muted" fontSize="sm">
              · {summary}
            </Text>
          ) : null}
        </HStack>
        <HStack gap={2}>
          {onDiscard ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty || saving}
              onClick={onDiscard}
            >
              {t("taxonomyEditor.saveBar.discard", { defaultValue: "Discard" })}
            </Button>
          ) : null}
          <Button
            colorPalette="primary"
            disabled={!dirty || saving}
            onClick={onSave}
            size="sm"
          >
            {saving ? <Spinner size="xs" /> : <MaterialSymbol>save</MaterialSymbol>}
            {saveLabel ??
              t("taxonomyEditor.saveBar.save", { defaultValue: "Save" })}
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
