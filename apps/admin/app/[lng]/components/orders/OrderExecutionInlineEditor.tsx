"use client";

import {
  Badge,
  Button,
  Combobox,
  CloseButton,
  HStack,
  Popover,
  Portal,
  TagsInput,
  Text,
  useFilter,
  useListCollection,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, PrintingMethodsGroup } from "@konfi/components";
import {
  type Locale,
  type PrintingMethodId,
  type PrintingMethodsSettings,
  SelectOption,
} from "@konfi/types";
import { getPrintingMethodOptions } from "@konfi/utils";
import { TFunction } from "i18next";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

export interface OrderExecutionInlineEditorValue {
  printingMethods: PrintingMethodId[];
}

interface OrderExecutionInlineEditorProps {
  printingMethods: PrintingMethodId[];
  printingMethodsSettings?: PrintingMethodsSettings | null;
  locale?: Locale | string;
  onSave: (value: OrderExecutionInlineEditorValue) => Promise<void>;
  t: TFunction;
}

function InlineMultiSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string[];
  options: SelectOption[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const instanceId = useId();
  const { contains } = useFilter({ sensitivity: "base" });

  const { collection, reset, filter } = useListCollection<SelectOption>({
    initialItems: options,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
    filter: contains,
  });

  const clearInput = useCallback(() => {
    setInputValue("");
    reset();
  }, [reset]);

  useEffect(() => {
    clearInput();
  }, [clearInput, options]);

  const selectedOptions = useMemo(
    () =>
      value
        .map((selectedValue) =>
          options.find((option) => option.value === selectedValue),
        )
        .filter((option): option is SelectOption => Boolean(option)),
    [options, value],
  );

  const sharedIds = useMemo(
    () => ({
      input: `inline-multi-select-input-${instanceId}`,
      control: `inline-multi-select-control-${instanceId}`,
    }),
    [instanceId],
  );

  const handleValueChange = useCallback(
    (nextValue: string[]) => {
      onChange(nextValue);
      clearInput();
    },
    [clearInput, onChange],
  );

  return (
    <Combobox.Root
      ids={sharedIds}
      colorPalette="primary"
      collection={collection}
      value={value}
      inputValue={inputValue}
      multiple
      onValueChange={(details) => handleValueChange(details.value)}
      onOpenChange={({ open }) => {
        if (open) {
          clearInput();
        }
      }}
      openOnClick={options.length > 0}
      closeOnSelect={false}
      width="100%"
      onInputValueChange={({ inputValue: nextInputValue }) => {
        setInputValue(nextInputValue);
        filter(nextInputValue);
      }}
    >
      <TagsInput.Root
        ids={sharedIds}
        colorPalette="primary"
        value={value}
        inputValue={inputValue}
        onValueChange={(details) => handleValueChange(details.value)}
        onInputValueChange={({ inputValue: nextInputValue }) => {
          setInputValue(nextInputValue);
          filter(nextInputValue);
        }}
        editable={false}
        validate={() => false}
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
          {selectedOptions.map((selectedOption, index) => (
            <TagsInput.Item
              key={selectedOption.value}
              index={index}
              value={selectedOption.value}
            >
              <TagsInput.ItemPreview>
                <TagsInput.ItemText>{selectedOption.label}</TagsInput.ItemText>
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
            <TagsInput.Input flex="1" minW="6" placeholder={placeholder} />
          </Combobox.Input>

          <Combobox.IndicatorGroup ml="auto" flexShrink={0} alignSelf="center">
            <TagsInput.ClearTrigger asChild>
              <CloseButton size="xs" variant="plain" pointerEvents="auto" />
            </TagsInput.ClearTrigger>
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </TagsInput.Control>
      </TagsInput.Root>

      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            {collection.items.map((item) => (
              <Combobox.Item key={`${item.value}-${item.label}`} item={item}>
                <Combobox.ItemText>{item.label}</Combobox.ItemText>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

export function OrderExecutionInlineEditor({
  printingMethods,
  printingMethodsSettings,
  locale,
  onSave,
  t,
}: OrderExecutionInlineEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localMethods, setLocalMethods] =
    useState<PrintingMethodId[]>(printingMethods);

  const printingMethodOptions = useMemo<SelectOption[]>(
    () => getPrintingMethodOptions(printingMethodsSettings, t, locale),
    [locale, printingMethodsSettings, t],
  );

  useEffect(() => {
    if (isOpen) return;
    setLocalMethods(printingMethods);
  }, [isOpen, printingMethods]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave({ printingMethods: localMethods });
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save order execution:", error);
      setLocalMethods(printingMethods);
    } finally {
      setIsSaving(false);
    }
  }, [localMethods, onSave, printingMethods]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    setLocalMethods(printingMethods);
  }, [printingMethods]);

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) {
          handleCancel();
          return;
        }

        setIsOpen(true);
      }}
      positioning={{ placement: "bottom-start", gutter: 8 }}
    >
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          p={0}
          h="auto"
          minH="unset"
          borderRadius="full"
          _hover={{ bg: "transparent", opacity: 0.85 }}
          _active={{ bg: "transparent" }}
          aria-label={t("order.editExecution", {
            defaultValue: "Edit execution",
          })}
        >
          {printingMethods.length > 0 ? (
            <PrintingMethodsGroup
              values={printingMethods}
              settings={printingMethodsSettings}
              t={t}
              locale={locale}
            />
          ) : (
            <Badge colorPalette="primary" px={3} size="lg" variant="subtle">
              {t("forms.labels.printingMethods", {
                defaultValue: "Printing methods",
              })}
            </Badge>
          )}
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="420px" maxW="420px" className="noprint">
            <Popover.Header fontWeight="semibold" fontSize="md">
              {t("order.editExecution", {
                defaultValue: "Edit execution",
              })}
            </Popover.Header>
            <Popover.Body>
              <VStack align="stretch" gap={3}>
                <Text fontWeight="semibold" fontSize="sm">
                  {t("forms.labels.printingMethods", {
                    defaultValue: "Printing methods",
                  })}
                </Text>
                <InlineMultiSelect
                  value={localMethods}
                  options={printingMethodOptions}
                  onChange={(value) => setLocalMethods(value)}
                  placeholder={t("forms.placeholders.selectPrintingMethods", {
                    defaultValue: "Select printing methods...",
                  })}
                />
                <HStack gap={2} justify="flex-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    <MaterialSymbol>close</MaterialSymbol>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Button>
                  <Button
                    size="sm"
                    variant="surface"
                    colorPalette="success"
                    onClick={handleSave}
                    loading={isSaving}
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                    {t("common.save", { defaultValue: "Save" })}
                  </Button>
                </HStack>
              </VStack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
