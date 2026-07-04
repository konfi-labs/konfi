"use client";

import { CloseButton, TagsInput } from "@chakra-ui/react";
import { useState } from "react";

export interface TagsInputFieldProps {
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  uppercase?: boolean;
  /** Optional transform applied to each tag before it is committed. */
  normalize?: (value: string) => string;
}

/**
 * Free-form controlled tags input — users type values and press Enter or
 * comma to add a chip. Used for inputs like country codes or arbitrary IDs
 * where there is no fixed option set, replacing comma-separated text inputs.
 */
export function TagsInputField({
  value,
  onChange,
  placeholder,
  size = "sm",
  disabled = false,
  uppercase = false,
  normalize,
}: TagsInputFieldProps) {
  const [inputValue, setInputValue] = useState("");

  return (
    <TagsInput.Root
      colorPalette="primary"
      size={size}
      value={[...value]}
      inputValue={inputValue}
      delimiter=","
      disabled={disabled}
      addOnPaste
      blurBehavior="add"
      onInputValueChange={({ inputValue: next }) => {
        setInputValue(uppercase ? next.toUpperCase() : next);
      }}
      onValueChange={(details) => {
        const cleaned = details.value
          .map((tag) => {
            const trimmed = tag.trim();
            const cased = uppercase ? trimmed.toUpperCase() : trimmed;
            return normalize ? normalize(cased) : cased;
          })
          .filter((tag, index, list) => tag && list.indexOf(tag) === index);
        onChange(cleaned);
      }}
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
        {value.map((tag, index) => (
          <TagsInput.Item key={tag} index={index} value={tag}>
            <TagsInput.ItemPreview>
              <TagsInput.ItemText>{tag}</TagsInput.ItemText>
              <TagsInput.ItemDeleteTrigger asChild>
                <CloseButton size="2xs" variant="plain" pointerEvents="auto" />
              </TagsInput.ItemDeleteTrigger>
            </TagsInput.ItemPreview>
          </TagsInput.Item>
        ))}
        <TagsInput.Input
          flex="1"
          minW="6"
          placeholder={value.length === 0 ? placeholder : ""}
        />
        <TagsInput.ClearTrigger asChild>
          <CloseButton
            size="xs"
            variant="plain"
            pointerEvents="auto"
            ml="auto"
          />
        </TagsInput.ClearTrigger>
      </TagsInput.Control>
    </TagsInput.Root>
  );
}
