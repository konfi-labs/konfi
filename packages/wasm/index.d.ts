import type { PreflightIssue } from "@konfi/types";
import type { XLSXParseResult } from "@konfi/types";

export type PreviewSlot = {
  col?: number | null;
  heightMm?: number | null;
  heightPoints?: number | null;
  index?: number | null;
  pageIndex?: number | null;
  pageLabel?: string | null;
  row?: number | null;
  widthMm?: number | null;
  widthPoints?: number | null;
  xMm?: number | null;
  xPoints?: number | null;
  yMm?: number | null;
  yPoints?: number | null;
  [key: string]: unknown;
};

export interface DisplayPreview {
  back?: DisplayPreviewBack | null;
  front?: DisplayPreviewSide | null;
  mode?: string | null;
  [key: string]: unknown;
}

export interface DisplayPreviewBack extends DisplayPreviewSide {
  available?: boolean | null;
  frontBackAlignment?: string | null;
  mirrorBack?: boolean | null;
  transform?: string | null;
  [key: string]: unknown;
}

export interface DisplayPreviewSide {
  side?: string | null;
  slots?: PreviewSlot[] | null;
  [key: string]: unknown;
}

export interface DimensionPoints {
  widthMm?: number | null;
  widthPoints?: number | null;
  heightMm?: number | null;
  heightPoints?: number | null;
}

export interface ImpositionResolvedWorkflow {
  automaticItemOrientation?: boolean | null;
  automaticNumberOfHorizontalItems?: boolean | null;
  automaticNumberOfVerticalItems?: boolean | null;
  automaticSheetOrientation?: boolean | null;
  automaticSpacingHorizontal?: boolean | null;
  automaticSpacingVertical?: boolean | null;
  backPageRotation?: string | null;
  bindingEdge?: string | null;
  bleedMm?: number | null;
  bleedType?: string | null;
  cropMarks?: boolean | null;
  duplexMode?: string | null;
  frontBackAlignment?: boolean | null;
  itemSizeMm?: DimensionPoints | null;
  layoutType?: string | null;
  mirrorBack?: boolean | null;
  numItemsHorizontal?: number | null;
  numItemsVertical?: number | null;
  pagesPerSignature?: number | string | null;
  sheetSizeMm?: DimensionPoints | null;
  spacingHorizontalMm?: number[] | null;
  spacingVerticalMm?: number[] | null;
}

export interface ImpositionData {
  additionalData?: {
    customItemSize?: boolean | null;
    customSheetSize?: boolean | null;
    files?: string[] | null;
    itemOrientation?: string | null;
    itemSizeName?: string | null;
    saveAsTemplate?: boolean | null;
    sheetOrientation?: string | null;
    sheetSizeName?: string | null;
    [key: string]: unknown;
  } | null;
  automaticItemOrientation?: boolean | null;
  automaticNumberOfHorizontalItems?: boolean | null;
  automaticNumberOfVerticalItems?: boolean | null;
  automaticSheetOrientation?: boolean | null;
  automaticSpacingHorizontal?: boolean | null;
  automaticSpacingVertical?: boolean | null;
  backPageRotation?: string | null;
  bindingEdge?: string | null;
  bleed?: number | null;
  bleedType?: string | null;
  cropMarks?: boolean | null;
  customItemSizeHeight?: number | null;
  customItemSizeWidth?: number | null;
  customSheetSizeHeight?: number | null;
  customSheetSizeWidth?: number | null;
  duplexMode?: string | null;
  frontBackAlignment?: boolean | null;
  layout?: string | null;
  mirrorBack?: boolean | null;
  numItemsHorizontal?: number | null;
  numItemsVertical?: number | null;
  pagesPerSignature?: number | string | null;
  sourceSizing?: string | null;
  spacingHorizontal?: string | null;
  spacingVertical?: string | null;
  [key: string]: unknown;
}

export interface ImposePreviewRequest {
  data?: ImpositionData | null;
  [key: string]: unknown;
}

export interface ImposePreviewResponse {
  displayPreview?: DisplayPreview | null;
  item?: DimensionPoints | null;
  layout?: unknown | null;
  matchesFinalRender?: boolean | null;
  pendingSourceDimensions?: DimensionPoints | null;
  previewMode?: string | null;
  rendering?: string | null;
  requiresSourceFileForRender?: boolean | null;
  resolvedWorkflow?: ImpositionResolvedWorkflow | null;
  sheet?: DimensionPoints | null;
  slots?: PreviewSlot[] | null;
  sourceFileAttached?: boolean | null;
  [key: string]: unknown;
}

export type ExportPricingWorkbookInput = {
  pricesRowData: string;
  thresholdRowData: string;
  deliveryTimesRowData: string;
  activeRowData: string;
};

export type ImpositionRequestInput =
  | string
  | ImposePreviewRequest
  | NonNullable<ImposePreviewRequest["data"]>;

export type ImposePdfFileInput = {
  request: ImpositionRequestInput;
  bytes: Uint8Array;
  contentType: string;
};

export type ImposeArchiveFileInput = {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
};

export type ImposeArchiveProgressUpdate = {
  completedFiles: number;
  failedFiles: number;
  fileIndex: number;
  filename: string;
  phase: "started" | "completed" | "failed";
  totalFiles: number;
  warning?: string;
};

export type ImposedArchiveFile = {
  filename: string;
  bytes: Uint8Array;
};

export type StructuredImpositionWarning = {
  code: string;
  values?: Record<string, string | number | boolean>;
};

export type ImposeArchiveResult = {
  bytes: Uint8Array;
  contentType: "application/pdf" | "application/gzip";
  filename: string;
  files: ImposedArchiveFile[];
  warnings: Array<string | StructuredImpositionWarning>;
};

export type StickerPackingMode = "grouped_parts" | "single_cut_rows";

export type StickerCutShape =
  | "circle"
  | "die_cut"
  | "ready_sheet"
  | "rectangle";

export type StickerBleedFillMode = "mirror" | "content_aware_fast";

export type StickerImpositionSettings = {
  allowLongSheets: boolean;
  fillRows: boolean;
  groupMaxDistinctItems: number;
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

export type StickerImpositionItem = {
  bleedMm: number;
  bleedFillMode?: StickerBleedFillMode;
  cutOffsetMm: number;
  cutShape: StickerCutShape;
  filename: string;
  heightMm: number;
  id: string;
  mirrorBleedEnabled: boolean;
  pageNumber: number;
  quantity: number;
  sourceHeightMm?: number | null;
  sourceFileIndex: number;
  sourceWidthMm?: number | null;
  widthMm: number;
  selectedPdfCutLineIds?: string[];
};

export type StickerArtworkAsset = {
  dataUrl: string;
  itemId: string;
};

export type GenerateWhiteUnderbaseMaskInput = {
  alphaThreshold: number;
  height: number;
  lumaThreshold: number;
  rgba: Uint8Array;
  width: number;
};

export type ApplySpotBrushInput = {
  artworkMask: Uint8Array;
  centerX: number;
  centerY: number;
  height: number;
  mask: Uint8Array;
  radiusPx: number;
  value: number;
  width: number;
};

export type PdfCutLineBounds = {
  heightMm: number;
  widthMm: number;
  xMm: number;
  yMm: number;
};

export type PdfCutLineCandidate = {
  bounds: PdfCutLineBounds;
  id: string;
  operationIndex: number;
  pageNumber: number;
  pageHeightMm: number;
  pageWidthMm: number;
  previewPath: string;
  suggested: boolean;
  strokeWidthMm?: number | null;
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

export type OposMarkPosition = {
  clearanceMm: number;
  heightMm: number;
  kind: "bar" | "square";
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
  mediaWidthMm: number;
  oposMarks: OposMarkPosition[];
  partBoundaries: StickerPartBoundary[];
  placements: StickerLayoutPlacement[];
  previewLengthMm: number;
  utilizationPercent: number;
};

export type StickerImpositionPlan = {
  itemCount: number;
  mediaWidthMm: number;
  packingMode: StickerPackingMode;
  sheetCount: number;
  sheets: StickerImposedSheet[];
  totalAreaMm2: number;
  usedAreaMm2: number;
};

export type StickerImpositionRequestInput =
  | string
  | {
      assets?: StickerArtworkAsset[];
      items: StickerImpositionItem[];
      settings: StickerImpositionSettings;
    };

export type StickerImpositionArchiveResult = {
  bytes: Uint8Array;
  contentType: "application/gzip";
  filename: string;
  files: ImposedArchiveFile[];
  warnings: StructuredImpositionWarning[];
};

export function init(): Promise<void>;

export function readPricingWorkbookJsonFromBytes(
  bytes: Uint8Array,
): Promise<XLSXParseResult>;

export function getPdfPageCount(bytes: Uint8Array): Promise<number>;

export function inspectPdfPreflightFromBytes(
  bytes: Uint8Array,
): Promise<PreflightIssue[]>;

export function inspectPdfCutLineCandidatesFromBytes(
  bytes: Uint8Array,
): Promise<PdfCutLineCandidate[]>;

export function inspectImagePreflightFromBytes(
  bytes: Uint8Array,
  contentType: string,
): Promise<PreflightIssue[]>;

export function resolveImpositionPreview(
  request: ImpositionRequestInput,
): Promise<ImposePreviewResponse>;

export function resolveStickerImpositionPreview(
  request: StickerImpositionRequestInput,
): Promise<StickerImpositionPlan>;

export function generateWhiteUnderbaseMaskRgba(
  input: GenerateWhiteUnderbaseMaskInput,
): Promise<Uint8Array>;

export function applySpotBrush(input: ApplySpotBrushInput): Promise<Uint8Array>;

export function createStickerImpositionArchive(input: {
  assets?: StickerArtworkAsset[];
  request: StickerImpositionRequestInput;
}): Promise<StickerImpositionArchiveResult>;

export function imposePdfFileToBytes(
  input: ImposePdfFileInput,
): Promise<Uint8Array>;

export function imposeFilesToArchive(input: {
  request: ImpositionRequestInput;
  files: ImposeArchiveFileInput[];
  onProgress?: (progress: ImposeArchiveProgressUpdate) => void | Promise<void>;
}): Promise<ImposeArchiveResult>;

export function exportPricingWorkbookToBytes(
  input: ExportPricingWorkbookInput,
): Promise<Uint8Array>;

export default init;
