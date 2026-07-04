"use client";

import { createListCollection } from "@chakra-ui/react";
import { type TFunction } from "i18next";
import { useMemo } from "react";
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "../../ui/select";

type PageSizeOption = {
  label: string;
  rowCount: number;
  value: string;
};

export type PageSizeSelectProps = {
  disabled?: boolean;
  onChange: (pageSize: number) => void;
  options: readonly number[];
  t: TFunction;
  value: number;
};

export function PageSizeSelect({
  disabled,
  onChange,
  options,
  t,
  value,
}: PageSizeSelectProps) {
  const collection = useMemo(
    () =>
      createListCollection<PageSizeOption>({
        items: options.map((rowCount) => ({
          label: t("pagination.rowsPerPageOption", {
            defaultValue: "{{rowCount}} rows",
            rowCount,
          }),
          rowCount,
          value: String(rowCount),
        })),
      }),
    [options, t],
  );

  if (options.length <= 1) {
    return null;
  }

  return (
    <SelectRoot
      collection={collection}
      disabled={disabled}
      display="flex"
      flexDirection="row"
      alignItems="center"
      gap="2"
      positioning={{ sameWidth: true }}
      size="xs"
      value={[String(value)]}
      width="auto"
      onValueChange={({ value: nextValue }) => {
        const nextPageSize = Number(nextValue[0]);
        if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
        onChange(nextPageSize);
      }}
    >
      <SelectTrigger minW="7.5rem">
        <SelectValueText />
      </SelectTrigger>
      <SelectContent>
        {collection.items.map((item) => (
          <SelectItem key={item.value} item={item}>
            <SelectItemText>{item.label}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
      <SelectLabel color="fg.muted" fontSize="xs" mb="0" whiteSpace="nowrap">
        {t("pagination.rowsPerPage", { defaultValue: "Rows per page" })}
      </SelectLabel>
    </SelectRoot>
  );
}
