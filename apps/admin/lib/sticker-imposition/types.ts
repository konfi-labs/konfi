export const STICKER_MEDIA_WIDTH_PRESETS_MM = [1000, 1270, 1370, 1600] as const;

export const stickerPackingMode = {
  GROUPED_PARTS: "grouped_parts",
  SINGLE_CUT_ROWS: "single_cut_rows",
} as const;

export type StickerPackingMode =
  (typeof stickerPackingMode)[keyof typeof stickerPackingMode];

export const stickerCutShape = {
  CIRCLE: "circle",
  DIE_CUT: "die_cut",
  READY_SHEET: "ready_sheet",
  RECTANGLE: "rectangle",
} as const;

export type StickerCutShape =
  (typeof stickerCutShape)[keyof typeof stickerCutShape];

export const stickerBleedFillMode = {
  CONTENT_AWARE_FAST: "content_aware_fast",
  MIRROR: "mirror",
} as const;

export type StickerBleedFillMode =
  (typeof stickerBleedFillMode)[keyof typeof stickerBleedFillMode];

export type StickerImpositionSettings = {
  allowLongSheets: boolean;
  fillRows: boolean;
  groupMaxDistinctItems: number;
  manualCutMarkLengthMm: number;
  manualCutMarksEnabled: boolean;
  mediaWidthMm: number;
  minSpacingMm: number;
  oposMarkClearanceMm: number;
  oposMarkMarginMm: number;
  oposMarkSizeMm: number;
  oposMarkSpacingMm: number;
  oposMarksEnabled: boolean;
  packingMode: StickerPackingMode;
  partGapMm: number;
  partMarginMm: number;
  preferredSheetLengthMm: number;
  previewMarginMm: number;
  sheetGapMm: number;
};

export const STICKER_SINGLE_CUT_MIN_SPACING_MM = 4;
export const STICKER_GROUPED_PARTS_DEFAULT_SPACING_MM = 0;
export const STICKER_DEFAULT_PART_MARGIN_MM = 0;

export const oposMarkKind = {
  BAR: "bar",
  SQUARE: "square",
} as const;

export type OposMarkKind = (typeof oposMarkKind)[keyof typeof oposMarkKind];

export type OposMarkPosition = {
  clearanceMm: number;
  heightMm: number;
  kind: OposMarkKind;
  widthMm: number;
  xMm: number;
  yMm: number;
};

export type ManualCutMark = {
  x1Mm: number;
  x2Mm: number;
  y1Mm: number;
  y2Mm: number;
};

export type StickerSizeSource = "file" | "user" | "fallback";

export type StickerImpositionItem = {
  bleedMm: number;
  bleedFillMode: StickerBleedFillMode;
  cutOffsetMm: number;
  cutShape: StickerCutShape;
  filename: string;
  heightMm: number;
  id: string;
  mirrorBleedEnabled: boolean;
  pageNumber: number;
  quantity: number;
  /**
   * Tracks how widthMm / heightMm were set.
   * - "file"     — detected from the uploaded file's page/canvas dimensions
   * - "user"     — manually entered by the user
   * - "fallback" — default value (50 mm), used when detection is unavailable
   *
   * This field is UI-only and is ignored by the WASM layer.
   */
  preserveAspectRatio?: boolean;
  /**
   * Tracks how widthMm / heightMm were set.
   *
   * This field is UI-only and is ignored by the WASM layer.
   */
  sizeSource?: StickerSizeSource;
  sourceHeightMm: number | null;
  sourceFileIndex: number;
  sourceWidthMm: number | null;
  widthMm: number;
  selectedPdfCutLineIds?: string[];
};

export type StickerSourceMetadata = {
  contentType: string;
  filename: string;
  heightMm: number | null;
  id: string;
  pageCount: number;
  pageNumber: number;
  sourceFileIndex: number;
  widthMm: number | null;
};

export type StickerLayoutPlacement = {
  bleedMm: number;
  bleedFillMode: StickerBleedFillMode;
  cutOffsetMm: number;
  cutShape: StickerCutShape;
  filename: string;
  heightMm: number;
  instanceIndex: number;
  itemId: string;
  mirrorBleedEnabled: boolean;
  pageNumber: number;
  partId: string | null;
  rotationDegrees: number;
  selectedPdfCutLineIds?: string[];
  sheetIndex: number;
  sourceHeightMm: number | null;
  sourceFileIndex: number;
  sourceWidthMm: number | null;
  widthMm: number;
  xMm: number;
  yMm: number;
};

export type StickerPartBoundary = {
  heightMm: number;
  id: string;
  sheetIndex: number;
  widthMm: number;
  xMm: number;
  yMm: number;
};

export type StickerImposedSheet = {
  exportHeightMm: number;
  exportWidthMm: number;
  exportXMm: number;
  exportYMm: number;
  index: number;
  manualCutMarks: ManualCutMark[];
  mediaWidthMm: number;
  oposMarks: OposMarkPosition[];
  partBoundaries: StickerPartBoundary[];
  placements: StickerLayoutPlacement[];
  previewLengthMm: number;
  repeatCount?: number;
  utilizationPercent: number;
};

export type StickerImpositionPlan = {
  itemCount: number;
  mediaWidthMm: number;
  packingMode: StickerPackingMode;
  sheetCount: number;
  sheets: StickerImposedSheet[];
  totalSheetCount?: number;
  totalAreaMm2: number;
  usedAreaMm2: number;
};

export const STICKER_DEFAULT_SETTINGS: StickerImpositionSettings = {
  allowLongSheets: true,
  fillRows: true,
  groupMaxDistinctItems: 8,
  manualCutMarkLengthMm: 5,
  manualCutMarksEnabled: false,
  mediaWidthMm: 1000,
  minSpacingMm: STICKER_SINGLE_CUT_MIN_SPACING_MM,
  oposMarkClearanceMm: 10,
  oposMarkMarginMm: 10,
  oposMarkSizeMm: 3,
  oposMarkSpacingMm: 400,
  oposMarksEnabled: false,
  packingMode: stickerPackingMode.SINGLE_CUT_ROWS,
  partGapMm: 8,
  partMarginMm: STICKER_DEFAULT_PART_MARGIN_MM,
  preferredSheetLengthMm: 1000,
  previewMarginMm: 20,
  sheetGapMm: 8,
};

export function createPackingModeSettingsPatch(
  settings: StickerImpositionSettings,
  packingMode: StickerPackingMode,
): Pick<StickerImpositionSettings, "minSpacingMm" | "packingMode"> {
  if (packingMode === stickerPackingMode.SINGLE_CUT_ROWS) {
    return {
      minSpacingMm: Math.max(
        STICKER_SINGLE_CUT_MIN_SPACING_MM,
        settings.minSpacingMm,
      ),
      packingMode,
    };
  }

  return {
    minSpacingMm: STICKER_GROUPED_PARTS_DEFAULT_SPACING_MM,
    packingMode,
  };
}

export function createEmptyStickerImpositionPlan(
  settings: Pick<StickerImpositionSettings, "mediaWidthMm" | "packingMode">,
): StickerImpositionPlan {
  return {
    itemCount: 0,
    mediaWidthMm: settings.mediaWidthMm,
    packingMode: settings.packingMode,
    sheetCount: 0,
    sheets: [],
    totalSheetCount: 0,
    totalAreaMm2: 0,
    usedAreaMm2: 0,
  };
}
