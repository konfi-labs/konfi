"use client";

import { useMemo } from "react";
import { calculateSheetStockRequirements } from "@konfi/utils";
import type { Attribute, Option } from "@konfi/types";

interface UseSheetStockCalculationProps {
  quantity: number;
  formatOption?: Option; // The selected format/size option
  paperAttribute?: Attribute; // The paper attribute with sheet dimensions
  wastagePercent?: number;
}

export function useSheetStockCalculation({
  quantity,
  formatOption,
  paperAttribute,
  wastagePercent = 5,
}: UseSheetStockCalculationProps) {
  return useMemo(() => {
    if (!formatOption || !paperAttribute?.calculateStockFromSheet?.enabled) {
      return null;
    }

    const { sheetWidth, sheetHeight, margin, bleed } =
      paperAttribute.calculateStockFromSheet;

    // Get item dimensions from format option
    const itemWidth = formatOption.formatWidth;
    const itemHeight = formatOption.formatHeight;

    if (!itemWidth || !itemHeight) {
      return null;
    }

    // Calculate stock requirements
    const calculation = calculateSheetStockRequirements(
      quantity,
      sheetWidth,
      sheetHeight,
      itemWidth,
      itemHeight,
      {
        margin,
        bleed,
        wastagePercent,
        allowRotation: true,
      },
    );

    return calculation;
  }, [quantity, formatOption, paperAttribute, wastagePercent]);
}
