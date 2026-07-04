"use client";

import {
  Badge,
  Box,
  type BoxProps,
  CloseButton,
  Dialog,
  Editable,
  HStack,
  IconButton,
  List,
  Portal,
  Text,
} from "@chakra-ui/react";
import type { UnitId } from "@konfi/types";
import { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialSymbol } from "../shared/MaterialSymbol";
import { Tooltip } from "../ui";
import { CustomFormatParameters } from "./product/CustomFormatParameters";

interface Props {
  productName: string;
  orderItemName?: string;
  quantity?: number;
  unit?: UnitId;
  descriptionCombination?: string | null;
  customFormat?: boolean;
  customSizes?: { width: number; height: number; quantity: number }[];
  width?: number;
  height?: number;
  bleed?: number;
  t: TFunction;
  highlightColor?: string;
  // Optional props for making the name editable
  isEditable?: boolean;
  onNameChange?: (value: string) => void;
  collapsed?: boolean;
  containerProps?: BoxProps;
}

export function SummaryDescription({
  productName,
  orderItemName,
  quantity,
  unit,
  descriptionCombination,
  customFormat,
  customSizes,
  width,
  height,
  bleed,
  t,
  highlightColor,
  isEditable = false,
  onNameChange,
  collapsed = false,
  containerProps,
}: Props) {
  const displayName = orderItemName || productName;
  const tooltipContent = orderItemName ? productName : undefined;
  const [localValue, setLocalValue] = useState(displayName);
  const [isEditing, setIsEditing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Use ref to buffer input changes and prevent lag
  const inputValueRef = useRef(displayName);

  // Only update local value when not editing to prevent interference
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(displayName);
      inputValueRef.current = displayName;
    }
  }, [displayName, isEditing]);

  const handleValueChange = useCallback(({ value }: { value: string }) => {
    // Update ref immediately without triggering re-render
    inputValueRef.current = value;
    setLocalValue(value);
  }, []);

  const handleValueCommit = useCallback(
    ({ value }: { value: string }) => {
      setIsEditing(false);
      // Use the buffered ref value to ensure we have the latest
      const finalValue = inputValueRef.current;
      onNameChange?.(finalValue);
    },
    [onNameChange],
  );

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setLocalValue(displayName);
    inputValueRef.current = displayName;
  }, [displayName]);

  const descriptionParts = descriptionCombination
    ? descriptionCombination
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

  const descriptionAttributes = descriptionParts.map((part) => {
    const separatorIndex = part.indexOf(":");
    if (separatorIndex <= 0) {
      return {
        name: null,
        value: part,
      };
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (!name || !value) {
      return {
        name: null,
        value: part,
      };
    }

    return {
      name,
      value,
    };
  });

  const showDetailsLabel = t(["order.showDetails", "store.order.showDetails"], {
    defaultValue: "Show details",
  });

  const detailsButton = descriptionParts.length > 0 && (
    <Tooltip content={showDetailsLabel}>
      <IconButton
        size={"2xs"}
        variant={"ghost"}
        colorPalette={"gray"}
        aria-label={showDetailsLabel}
        onClick={() => setIsDialogOpen(true)}
      >
        <MaterialSymbol>format_list_bulleted</MaterialSymbol>
      </IconButton>
    </Tooltip>
  );

  const renderNameWithBadge = () => {
    if (isEditable && onNameChange) {
      return (
        <HStack mb={"1"} gap={1}>
          <Editable.Root
            w={isEditing ? "100%" : "auto"}
            value={localValue}
            onValueChange={handleValueChange}
            onValueCommit={handleValueCommit}
            onValueRevert={handleEditCancel}
            onEditChange={(details) => setIsEditing(details.edit)}
            placeholder={t("admin.customNamePlaceholder", {
              defaultValue: "Custom name...",
            })}
          >
            <Text fontWeight={"bold"} color={highlightColor}>
              <Editable.Preview />
            </Text>
            <Editable.Input />
          </Editable.Root>
          <Badge>{`${quantity} ${t(`Unit.${unit}`, { defaultValue: unit })}`}</Badge>
          {detailsButton}
        </HStack>
      );
    }

    return (
      <HStack mb={"1"} gap={1} align={"center"}>
        <Text fontWeight={"bold"} color={highlightColor}>
          <span>{displayName}</span>
          <Badge
            ml={1}
          >{`${quantity} ${t(`Unit.${unit}`, { defaultValue: unit })}`}</Badge>
        </Text>
        {detailsButton}
      </HStack>
    );
  };

  return (
    <Box maxW={"400px"} {...containerProps}>
      {tooltipContent ? (
        <Tooltip
          content={tooltipContent}
          positioning={{
            placement: "top-start",
            offset: { mainAxis: 4, crossAxis: 0 },
          }}
          openDelay={100}
          closeDelay={100}
          interactive={true}
        >
          {renderNameWithBadge()}
        </Tooltip>
      ) : (
        renderNameWithBadge()
      )}
      {descriptionAttributes.length > 0 && !collapsed && (
        <Box
          overflow={"hidden"}
          maxH={collapsed ? "0px" : "500px"}
          opacity={collapsed ? 0 : 1}
          transition={"max-height 0.25s ease, opacity 0.2s ease"}
        >
          <List.Root listStyle={"none"} gap={1} mb={2}>
            {descriptionAttributes.map((attribute, index) => (
              <List.Item
                key={`${attribute.name ?? "value"}-${attribute.value}-${index}`}
              >
                <Text fontSize={"sm"}>
                  {attribute.name ? (
                    <>
                      <Text
                        as={"span"}
                        fontWeight={"bold"}
                      >{`${attribute.name}: `}</Text>
                      {attribute.value}
                    </>
                  ) : (
                    attribute.value
                  )}
                </Text>
              </List.Item>
            ))}
          </List.Root>
        </Box>
      )}
      {collapsed && descriptionAttributes.length > 0 && (
        <Box
          overflow={"hidden"}
          maxH={collapsed ? "24px" : "0px"}
          opacity={collapsed ? 1 : 0}
          transition={"max-height 0.25s ease, opacity 0.2s ease"}
        >
          <Text fontSize={"xs"} color={"fg.muted"} truncate>
            {descriptionAttributes
              .map((a) => (a.name ? `${a.name}: ${a.value}` : a.value))
              .join(", ")}
          </Text>
        </Box>
      )}
      <Box
        overflow={"hidden"}
        maxH={collapsed ? "0px" : "200px"}
        opacity={collapsed ? 0 : 1}
        transition={"max-height 0.25s ease, opacity 0.2s ease"}
      >
        <CustomFormatParameters
          customFormat={customFormat}
          customSizes={customSizes}
          width={width}
          height={height}
          bleed={bleed}
          t={t}
        />
      </Box>
      {descriptionParts.length > 0 && (
        <Dialog.Root
          size={"sm"}
          open={isDialogOpen}
          onOpenChange={({ open }) => setIsDialogOpen(open)}
          motionPreset={"slide-in-bottom"}
          lazyMount
        >
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.CloseTrigger
                  asChild
                  onClick={() => setIsDialogOpen(false)}
                >
                  <CloseButton />
                </Dialog.CloseTrigger>
                <Dialog.Header>
                  <Dialog.Title>{displayName}</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body pb={6}>
                  <List.Root listStyle={"none"} gap={2} w={"full"}>
                    {descriptionAttributes.map((attribute, index) => (
                      <List.Item
                        key={`${attribute.name ?? "value"}-${attribute.value}-${index}`}
                        w={"full"}
                      >
                        {attribute.name ? (
                          <HStack
                            w={"full"}
                            justify={"space-between"}
                            align={"start"}
                            gap={4}
                          >
                            <Text
                              fontSize={"sm"}
                              fontWeight={"bold"}
                              flexShrink={0}
                            >
                              {`${attribute.name}:`}
                            </Text>
                            <Text fontSize={"sm"} textAlign={"right"} flex={1}>
                              {attribute.value}
                            </Text>
                          </HStack>
                        ) : (
                          <Text fontSize={"sm"} textAlign={"right"}>
                            {attribute.value}
                          </Text>
                        )}
                      </List.Item>
                    ))}
                  </List.Root>
                </Dialog.Body>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      )}
    </Box>
  );
}
