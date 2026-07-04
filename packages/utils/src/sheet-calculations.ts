export interface SheetCalculationParams {
  sheetWidth: number;
  sheetHeight: number;
  itemWidth: number;
  itemHeight: number;
  margin?: number;
  bleed?: number;
  allowRotation?: boolean;
}

/**
 * Calculate how many units can fit on a single sheet considering margins, bleeds, and rotation
 */
export function calculateUnitsPerSheet({
  sheetWidth,
  sheetHeight,
  itemWidth,
  itemHeight,
  margin = 0,
  bleed = 3,
  allowRotation = true,
}: SheetCalculationParams): number {
  // Add bleed to item dimensions
  const totalItemWidth = itemWidth + bleed * 2;
  const totalItemHeight = itemHeight + bleed * 2;

  // Add margin between items
  const spacedItemWidth = totalItemWidth + margin;
  const spacedItemHeight = totalItemHeight + margin;

  // Calculate units in normal orientation
  const normalColumns = Math.floor((sheetWidth + margin) / spacedItemWidth);
  const normalRows = Math.floor((sheetHeight + margin) / spacedItemHeight);
  const normalUnits = normalColumns * normalRows;

  if (!allowRotation) {
    return normalUnits;
  }

  // Calculate units in rotated orientation (90 degrees)
  const rotatedColumns = Math.floor((sheetWidth + margin) / spacedItemHeight);
  const rotatedRows = Math.floor((sheetHeight + margin) / spacedItemWidth);
  const rotatedUnits = rotatedColumns * rotatedRows;

  // Return the better orientation
  return Math.max(normalUnits, rotatedUnits);
}

/**
 * Calculate the number of sheets needed for a given quantity
 */
export function calculateSheetsNeeded(
  quantity: number,
  unitsPerSheet: number,
  wastagePercent: number = 0,
): number {
  if (unitsPerSheet <= 0) return 0;

  const baseSheets = Math.ceil(quantity / unitsPerSheet);
  const wasteSheets = Math.ceil(baseSheets * (wastagePercent / 100));
  return baseSheets + wasteSheets;
}

/**
 * Calculate stock requirements for sheet-based materials
 */
export interface StockCalculationResult {
  unitsPerSheet: number;
  sheetsNeeded: number;
  wastagePercent: number;
  sheetDimensions: { width: number; height: number };
  itemDimensions: { width: number; height: number };
  totalUnits: number;
}

export function calculateSheetStockRequirements(
  quantity: number,
  sheetWidth: number,
  sheetHeight: number,
  itemWidth: number,
  itemHeight: number,
  options: {
    margin?: number;
    bleed?: number;
    wastagePercent?: number;
    allowRotation?: boolean;
  } = {},
): StockCalculationResult {
  const {
    margin = 3,
    bleed = 3,
    wastagePercent = 5,
    allowRotation = true,
  } = options;

  const unitsPerSheet = calculateUnitsPerSheet({
    sheetWidth,
    sheetHeight,
    itemWidth,
    itemHeight,
    margin,
    bleed,
    allowRotation,
  });

  const sheetsNeeded = calculateSheetsNeeded(
    quantity,
    unitsPerSheet,
    wastagePercent,
  );

  return {
    unitsPerSheet,
    sheetsNeeded,
    wastagePercent,
    sheetDimensions: { width: sheetWidth, height: sheetHeight },
    itemDimensions: { width: itemWidth, height: itemHeight },
    totalUnits: quantity,
  };
}

/**
 * Calculate the number of sheets needed for an order item
 * based on the format dimensions and paper attribute configuration
 */
export function calculateSheetsNeededForOrder(
  quantity: number,
  formatOption: {
    formatWidth?: number | null;
    formatHeight?: number | null;
  } | null,
  paperAttribute: {
    calculateStockFromSheet?: {
      enabled: boolean;
      sheetWidth: number;
      sheetHeight: number;
      margin?: number;
      bleed?: number;
    };
  } | null,
  wastagePercent: number = 5,
): number {
  // If no sheet-based calculation is enabled, return quantity as-is
  if (!paperAttribute?.calculateStockFromSheet?.enabled) {
    return quantity;
  }

  // If format dimensions are missing, return quantity as-is
  if (!formatOption?.formatWidth || !formatOption?.formatHeight) {
    return quantity;
  }

  const {
    sheetWidth,
    sheetHeight,
    margin = 3,
    bleed = 3,
  } = paperAttribute.calculateStockFromSheet;

  // Validate sheet dimensions
  if (sheetWidth <= 0 || sheetHeight <= 0) {
    return quantity;
  }

  try {
    // Calculate using the shared utility
    const calculation = calculateSheetStockRequirements(
      quantity,
      sheetWidth,
      sheetHeight,
      formatOption.formatWidth,
      formatOption.formatHeight,
      { margin, bleed, wastagePercent },
    );

    return calculation.sheetsNeeded;
  } catch (error) {
    console.error("Error calculating sheets needed:", error);
    return quantity; // Fallback to original quantity
  }
}

/**
 * Find the paper attribute and format option from order item configuration
 */
export function extractPaperAndFormat<
  T extends {
    id: string;
    trackStock?: boolean;
    calculateStockFromSheet?: any;
    format?: boolean;
    options: Array<{
      value: string;
      formatWidth?: number | null;
      formatHeight?: number | null;
    }>;
  },
>(
  attributes: T[],
  selectedOptions: { [key: string]: string | number } | null,
): { paperAttribute: T | null; formatOption: T["options"][0] | null } {
  if (!selectedOptions) {
    return { paperAttribute: null, formatOption: null };
  }

  let paperAttribute: T | null = null;
  let formatOption: T["options"][0] | null = null;

  for (const attr of attributes) {
    const selectedValue = selectedOptions[attr.id];
    if (!selectedValue) continue;

    // Find paper attribute (has calculateStockFromSheet enabled)
    if (attr.trackStock && attr.calculateStockFromSheet?.enabled) {
      const paperOption = attr.options.find(
        (opt) => opt.value === selectedValue,
      );
      if (paperOption) {
        paperAttribute = attr;
      }
    }

    // Find format attribute and get selected option
    if (attr.format) {
      const option = attr.options.find((opt) => opt.value === selectedValue);
      if (option) {
        formatOption = option;
      }
    }
  }

  return { paperAttribute, formatOption };
}
