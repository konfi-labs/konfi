"use client";

import {
  Box,
  Button,
  HStack,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Order } from "@konfi/types";
import { TFunction } from "i18next";
import { type ReactNode, useCallback, useState } from "react";
import { MaterialSymbol } from "../MaterialSymbol";
import { FormattedText } from "../text";

const patternIcons = [
  {
    top: "-20px",
    left: "84%",
    fontSize: "96px",
    opacity: 0.12,
    transform: "rotate(-10deg)",
  },
  {
    top: "20px",
    left: "8%",
    fontSize: "72px",
    opacity: 0.1,
    transform: "rotate(8deg)",
  },
  {
    top: "18px",
    left: "64%",
    fontSize: "48px",
    opacity: 0.08,
    transform: "rotate(12deg)",
  },
  {
    top: "72px",
    left: "2%",
    fontSize: "36px",
    opacity: 0.07,
    transform: "rotate(-8deg)",
  },
  {
    top: "8px",
    left: "47%",
    fontSize: "32px",
    opacity: 0.07,
    transform: "rotate(6deg)",
  },
] as const;

interface Props {
  specialNotes: Order["specialNotes"];
  t: TFunction;
  isEditable?: boolean;
  onSave?: (value: string) => Promise<void>;
  variant?: SpecialNotesPanelProps["variant"];
}

interface SpecialNotesPanelProps {
  heading: string;
  specialNotes?: string;
  actions?: ReactNode;
  density?: "default" | "compact";
  variant?: "card" | "content";
  children?: ReactNode;
}

export function SpecialNotesBackgroundPattern() {
  return (
    <>
      {patternIcons.map((icon) => (
        <MaterialSymbol
          key={`${icon.top}-${icon.left}`}
          aria-hidden="true"
          pointerEvents="none"
          position="absolute"
          top={icon.top}
          left={icon.left}
          zIndex={0}
          fontSize={icon.fontSize}
          color="orange.solid"
          opacity={icon.opacity}
          transform={icon.transform}
        >
          sticky_note_2
        </MaterialSymbol>
      ))}
      <Box
        position="absolute"
        inset={0}
        zIndex={0}
        bg="linear-gradient(135deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0))"
        pointerEvents="none"
      />
    </>
  );
}

export function SpecialNotesPanel({
  heading,
  specialNotes,
  actions,
  density = "default",
  variant = "card",
  children,
}: SpecialNotesPanelProps) {
  const isCompact = density === "compact";
  const content = (
    <>
      <HStack
        align="flex-start"
        justify="space-between"
        gap={4}
        position="relative"
        zIndex={1}
      >
        <Text
          as="h2"
          fontSize={isCompact ? "md" : "lg"}
          fontWeight="bold"
          lineHeight="1.15"
          color="fg"
        >
          {heading}
        </Text>
        {actions}
      </HStack>
      <Box
        position="relative"
        zIndex={1}
        mt={isCompact ? 4 : 6}
        color="fg"
        fontSize={isCompact ? "sm" : { base: "md", md: "lg" }}
        lineHeight={isCompact ? "1.55" : "1.6"}
      >
        {children ?? <FormattedText>{specialNotes ?? ""}</FormattedText>}
      </Box>
    </>
  );

  if (variant === "content") {
    return <Box position="relative">{content}</Box>;
  }

  return (
    <Box
      position="relative"
      overflow="hidden"
      borderRadius="3xl"
      border="1px solid"
      borderColor="orange.muted"
      bg="orange.subtle"
      color="fg"
      px={isCompact ? 5 : { base: 5, md: 8 }}
      py={isCompact ? 5 : { base: 6, md: 8 }}
      minH={isCompact ? "132px" : { base: "148px", md: "168px" }}
    >
      <SpecialNotesBackgroundPattern />
      {content}
    </Box>
  );
}

export function SpecialNotes({
  specialNotes,
  t,
  isEditable = false,
  onSave,
  variant = "card",
}: Props) {
  const [localValue, setLocalValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(e.target.value);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(localValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save special notes:", error);
      // Revert to original value on error
      setLocalValue(specialNotes || "");
    } finally {
      setIsSaving(false);
    }
  }, [localValue, onSave, specialNotes]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setLocalValue("");
  }, []);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setLocalValue(specialNotes || "");
  }, [specialNotes]);

  const heading = t("orderPage.specialNotes.heading", {
    defaultValue: "Special Notes",
  });

  const actions = isEditable && onSave && (
    <HStack className="noprint">
      {isEditing ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            colorPalette="red"
            onClick={handleCancel}
            disabled={isSaving}
            aria-label={t("common.cancel", { defaultValue: "Cancel" })}
          >
            <MaterialSymbol>close</MaterialSymbol>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            size="sm"
            variant="surface"
            colorPalette="green"
            onClick={handleSave}
            disabled={isSaving}
            aria-label={t("common.save", { defaultValue: "Save" })}
            loading={isSaving}
          >
            <MaterialSymbol>check</MaterialSymbol>
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="surface"
          onClick={handleEdit}
          aria-label={t("common.edit", { defaultValue: "Edit" })}
        >
          <MaterialSymbol>edit</MaterialSymbol>
          {t("common.edit", { defaultValue: "Edit" })}
        </Button>
      )}
    </HStack>
  );

  if (!isEditing && specialNotes) {
    return (
      <SpecialNotesPanel
        heading={heading}
        specialNotes={specialNotes}
        actions={actions}
        variant={variant}
      />
    );
  }

  return (
    <>
      <HStack justify="space-between" mb={6}>
        <Text as="h2" fontSize="lg" fontWeight="bold">
          {heading}
        </Text>
        {actions}
      </HStack>
      <Separator my={"6"} />
      {isEditing ? (
        <VStack alignItems="stretch">
          <Textarea
            value={localValue}
            onChange={handleValueChange}
            placeholder={t("orderPage.specialNotes.placeholder", {
              defaultValue: "Enter special notes...",
            })}
            minH="120px"
            p={3}
            borderRadius="3xl"
          />
        </VStack>
      ) : (
        <Text color="fg.muted">
          {t("orderPage.specialNotes.empty", {
            defaultValue: "No special notes",
          })}
        </Text>
      )}
    </>
  );
}
