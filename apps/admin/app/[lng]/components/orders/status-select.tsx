"use client";

import { createListCollection, Portal, Select } from "@chakra-ui/react";
import {
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  SelectOption,
} from "@konfi/types";
import { getColorByStatus } from "@konfi/utils";
import { memo, useMemo } from "react";

type StatusName = "status" | "paymentStatus" | "filesStatus";

interface StatusSelectProps {
  name: StatusName;
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string | undefined) => void;
  colorPalette?: string;
  orderId?: string;
  fullWidth?: boolean;
  placeholder?: string;
  size?: "xs" | "sm";
}

function areStatusOptionsEqual(
  previousOptions: SelectOption[],
  nextOptions: SelectOption[],
) {
  if (previousOptions === nextOptions) return true;
  if (previousOptions.length !== nextOptions.length) return false;

  for (let index = 0; index < previousOptions.length; index += 1) {
    const previousOption = previousOptions[index];
    const nextOption = nextOptions[index];

    if (
      previousOption?.label !== nextOption?.label ||
      previousOption?.value !== nextOption?.value ||
      previousOption?.color !== nextOption?.color
    ) {
      return false;
    }
  }

  return true;
}

const StatusSelect = memo(
  ({
    name,
    value,
    options,
    onChange,
    colorPalette,
    fullWidth = false,
    placeholder = "Select status",
    size = "sm",
  }: StatusSelectProps) => {
    const collection = useMemo(
      () =>
        createListCollection({
          items: options.map((option) => ({
            label: option.label,
            value: option.value,
          })),
        }),
      [options],
    );

    const selectedOptionColor = options.find(
      (option) => option.value === value,
    )?.color;
    const colors = getColorByStatus(
      value as OrderFilesStatus | OrderStatus | PaymentStatus,
    );
    const resolvedColorPalette =
      colorPalette ?? selectedOptionColor ?? String(colors.colorPalette);

    return (
      <Select.Root
        size={size}
        colorPalette={resolvedColorPalette}
        collection={collection}
        value={value ? [value] : []}
        width={fullWidth ? "100%" : "auto"}
        onValueChange={({ value: nextValue }) =>
          onChange(nextValue[0] ?? undefined)
        }
      >
        <Select.HiddenSelect name={name} />
        <Select.Control
          borderRadius="full"
          minW={fullWidth ? undefined : "100px"}
          w={fullWidth ? "100%" : "auto"}
          cursor="pointer"
          // bgColor={colors.bgColor}
          wordBreak="break-all"
        >
          <Select.Trigger
            borderColor="colorPalette.muted"
            bg="colorPalette.subtle"
            color="colorPalette.fg"
          >
            <Select.ValueText placeholder={placeholder} />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((item) => (
                <Select.Item key={item.value} item={item}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      areStatusOptionsEqual(prevProps.options, nextProps.options) &&
      prevProps.colorPalette === nextProps.colorPalette &&
      prevProps.orderId === nextProps.orderId &&
      prevProps.name === nextProps.name &&
      prevProps.fullWidth === nextProps.fullWidth &&
      prevProps.placeholder === nextProps.placeholder &&
      prevProps.size === nextProps.size
    );
  },
);

StatusSelect.displayName = "StatusSelect";

export type { StatusSelectProps };
export { StatusSelect };
