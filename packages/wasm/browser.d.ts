import type { PreflightIssue, XLSXParseResult } from "@konfi/types";
import type {
  ImposePreviewRequest,
  ImposePreviewResponse,
  PreviewSlot,
} from "./index";

export type ImposeArchiveFileInput =
  | {
      bytes: Uint8Array;
      contentType?: string;
      filename?: string;
    }
  | (Blob & { name?: string; filename?: string; contentType?: string });

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

export type GenerateHalftoneMaskInput = {
  alphaThreshold: number;
  cellSizePx: number;
  dotPercent: number;
  fullGraphic: boolean;
  height: number;
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

export type StickerImpositionArchiveResult = {
  bytes: Uint8Array;
  contentType: "application/gzip";
  filename: string;
  files: ImposedArchiveFile[];
  warnings: StructuredImpositionWarning[];
};

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

export type StickerImposedSheet = {
  exportHeightMm: number;
  exportWidthMm: number;
  exportXMm: number;
  exportYMm: number;
  index: number;
  mediaWidthMm: number;
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
      items: StickerImpositionItem[];
      settings: StickerImpositionSettings;
    };

export type BrowserWasmInitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export function init(input?: BrowserWasmInitInput): Promise<void>;

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

export function generateHalftoneMaskRgba(
  input: GenerateHalftoneMaskInput,
): Promise<Uint8Array>;

export function applySpotBrush(input: ApplySpotBrushInput): Promise<Uint8Array>;

export function exportSpotPdfForPdfSource(
  sourcePdf: Uint8Array,
  requestJson: string,
): Promise<Uint8Array>;

export function imposePdfFileToBytes(
  input: ImposePdfFileInput,
): Promise<Uint8Array>;

export function exportPricingWorkbookToBytes(
  input: ExportPricingWorkbookInput,
): Promise<Uint8Array>;

export function imposeFilesToArchive(input: {
  request: ImpositionRequestInput;
  files: ImposeArchiveFileInput[];
  onProgress?: (progress: ImposeArchiveProgressUpdate) => void | Promise<void>;
}): Promise<ImposeArchiveResult>;

export function createStickerImpositionArchive(input: {
  request: StickerImpositionRequestInput;
  assets?: StickerArtworkAsset[];
}): Promise<StickerImpositionArchiveResult>;

export default init;
