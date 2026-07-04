import type { SelectOption } from "@konfi/types";

/**
 * Comprehensive paper size dimensions mapping
 * All dimensions are in millimeters, in portrait orientation (width x height)
 */
export const PAPER_SIZE_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  // ISO 216 A series
  "4A0": { width: 1682, height: 2378 },
  "2A0": { width: 1189, height: 1682 },
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  A7: { width: 74, height: 105 },
  A8: { width: 52, height: 74 },
  A9: { width: 37, height: 52 },
  A10: { width: 26, height: 37 },

  // ISO 216 B series
  B0: { width: 1000, height: 1414 },
  B1: { width: 707, height: 1000 },
  B2: { width: 500, height: 707 },
  B3: { width: 353, height: 500 },
  B4: { width: 250, height: 353 },
  B5: { width: 176, height: 250 },
  B6: { width: 125, height: 176 },
  B7: { width: 88, height: 125 },
  B8: { width: 62, height: 88 },
  B9: { width: 44, height: 62 },

  // ISO 216 C series
  C0: { width: 917, height: 1297 },
  C1: { width: 648, height: 917 },
  C2: { width: 458, height: 648 },
  C3: { width: 324, height: 458 },
  C4: { width: 229, height: 324 },
  C5: { width: 162, height: 229 },
  C6: { width: 114, height: 162 },
  C7: { width: 81, height: 114 },
  C8: { width: 57, height: 81 },
  C9: { width: 40, height: 57 },
  C10: { width: 28, height: 40 },

  // SRA series (untrimmed)
  SRA0: { width: 900, height: 1280 },
  SRA1: { width: 640, height: 900 },
  SRA2: { width: 450, height: 640 },
  SRA3: { width: 320, height: 450 },
  SRA4: { width: 225, height: 320 },
  SRA5: { width: 160, height: 225 },

  // Common US sizes (converted to mm)
  LETTER: { width: 216, height: 279 },
  LEGAL: { width: 216, height: 356 },
  TABLOID: { width: 279, height: 432 },
  LEDGER: { width: 432, height: 279 },
  EXECUTIVE: { width: 184, height: 267 },
  STATEMENT: { width: 140, height: 216 },
  FOLIO: { width: 216, height: 330 },

  // Common custom sizes
  "11x17": { width: 279, height: 432 },
  "10x14": { width: 254, height: 356 },

  // Extended A series
  A2EXTRA: { width: 445, height: 619 },
  A3EXTRA: { width: 322, height: 445 },
  A3SUPER: { width: 305, height: 508 },
  A4EXTRA: { width: 235, height: 322 },
  A4LONG: { width: 210, height: 348 },
  A4SUPER: { width: 229, height: 322 },
  A5EXTRA: { width: 173, height: 235 },

  // Arch series
  ARCH1: { width: 229, height: 305 },
  ARCH2: { width: 305, height: 457 },
  ARCH3: { width: 457, height: 610 },
  ARCH4: { width: 610, height: 914 },
  ARCH5: { width: 914, height: 1219 },
  ARCH6: { width: 1219, height: 1524 },
  ARCHA: { width: 229, height: 305 },
  ARCHB: { width: 305, height: 457 },
  ARCHC: { width: 457, height: 610 },
  ARCHD: { width: 610, height: 914 },
  ARCHE: { width: 914, height: 1219 },
  ARCHE1: { width: 762, height: 1067 },
  ARCHE2: { width: 965, height: 1321 },
  ARCHE3: { width: 991, height: 1321 },

  // Additional US sizes
  GOVERNMENTLEGAL: { width: 216, height: 330 },
  GOVERNMENTLETTER: { width: 203, height: 267 },
  HALFLETTER: { width: 140, height: 216 },
  JUNIORLEGAL: { width: 127, height: 203 },
  MEMO: { width: 140, height: 216 },
  NOTE: { width: 190, height: 254 },
  SOB5EXTRA: { width: 201, height: 276 },
  SUPERA3: { width: 305, height: 487 },
  SUPERA4: { width: 227, height: 356 },
  FLSA: { width: 216, height: 330 },
  FLSE: { width: 216, height: 330 },
};

/**
 * Get paper dimensions for a given paper size name
 * @param sizeName - The paper size name (e.g., "A4", "SRA3")
 * @param orientation - "PORTRAIT" or "LANDSCAPE"
 * @returns Object with width and height in millimeters
 */
export function getPaperDimensions(
  sizeName: string,
  orientation: "PORTRAIT" | "LANDSCAPE" = "PORTRAIT",
): { width: number; height: number } {
  const baseDimensions =
    PAPER_SIZE_DIMENSIONS[sizeName] || PAPER_SIZE_DIMENSIONS["A4"];

  if (orientation === "LANDSCAPE") {
    return {
      width: baseDimensions.height,
      height: baseDimensions.width,
    };
  }

  return baseDimensions;
}

/**
 * Check if a paper size name exists in the mapping
 * @param sizeName - The paper size name to check
 * @returns boolean indicating if the size exists
 */
export function isValidPaperSize(sizeName: string): boolean {
  return sizeName in PAPER_SIZE_DIMENSIONS;
}

/**
 * Get all available paper size names
 * @returns Array of paper size names
 */
export function getAvailablePaperSizes(): string[] {
  return Object.keys(PAPER_SIZE_DIMENSIONS);
}

// Unified paper sizes options for selects. This replaces prior enum-based options from @konfi/types.
// Keep labels identical to values (size name) to match previous behavior.
export const paperSizesAsOptions: SelectOption[] = getAvailablePaperSizes().map(
  (name) => ({
    label: name,
    value: name,
  }),
);
