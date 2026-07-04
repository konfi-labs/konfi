"use client";

import { Button, HStack, Text } from "@chakra-ui/react";
import { type TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";
import { type DataGridDensity } from "./VirtualizedDataGrid";

export type TableDensityControlProps = {
  density: DataGridDensity;
  onDensityChange: (density: DataGridDensity) => void;
  t: TFunction;
};

export function TableDensityControl({
  density,
  onDensityChange,
  t,
}: TableDensityControlProps) {
  return (
    <HStack
      align="center"
      gap="2"
      role="group"
      aria-label={t("table.densityLabel", { defaultValue: "Table density" })}
    >
      <HStack
        bg="bg"
        borderColor="border.subtle"
        borderRadius="3xl"
        borderWidth="1px"
        p="1"
      >
        <Button
          aria-pressed={density === "compact"}
          onClick={() => onDensityChange("compact")}
          size="sm"
          variant={density === "compact" ? "solid" : "ghost"}
        >
          {t("table.compact", { defaultValue: "Compact" })}
        </Button>
        <Button
          aria-pressed={density === "comfortable"}
          onClick={() => onDensityChange("comfortable")}
          size="sm"
          variant={density === "comfortable" ? "solid" : "ghost"}
        >
          {t("table.comfortable", { defaultValue: "Comfortable" })}
        </Button>
      </HStack>
    </HStack>
  );
}
