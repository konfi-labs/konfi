import type { PreviewSlot } from "@konfi/wasm";
import { backPageRotation, duplexMode, layoutType } from "@konfi/types";

export const PRINTER_MARGIN_MM = 8;
export const MAX_PREVIEW_SIZE = 560;

export type PreviewDimensions = { width: number; height: number };
export type SpacingAxis = "horizontal" | "vertical";

export interface SpacingEditorState {
  axis: SpacingAxis;
  index: number;
  x: number;
  y: number;
}

export interface GridGeometry {
  itemWidthPx: number;
  itemHeightPx: number;
  xPositions: number[];
  yPositions: number[];
  gridLeft: number;
  gridTop: number;
  totalGridWidth: number;
  totalGridHeight: number;
  horizontalSpacingPx: number[];
  verticalSpacingPx: number[];
}

export interface SpacingHelperPosition {
  index: number;
  x: number;
  y: number;
  value: number;
}

export function isDuplexMode(duplexModeValue: string | undefined): boolean {
  return (
    duplexModeValue === duplexMode.DUPLEX_LONG_EDGE ||
    duplexModeValue === duplexMode.DUPLEX_SHORT_EDGE
  );
}

export function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "true";
  }

  return Boolean(value);
}

export function getPreviewSlotLabel(
  slot: PreviewSlot,
  fallbackIndex: number,
): string {
  if (slot.pageLabel !== undefined && slot.pageLabel !== null) {
    return slot.pageLabel;
  }

  if (typeof slot.pageIndex === "number") {
    return (slot.pageIndex + 1).toString();
  }

  if (typeof slot.index === "number") {
    return (slot.index + 1).toString();
  }

  return (fallbackIndex + 1).toString();
}

export function toRoundedDimension(value: number): number {
  return Math.max(0, Math.round(value));
}

export function formatMillimeters(value: number): string {
  const normalized = Math.max(0, value);
  return Number.isInteger(normalized)
    ? `${normalized} mm`
    : `${normalized.toFixed(2).replace(/\.?0+$/, "")} mm`;
}

export function getBackPageTransform(
  rotation: string | undefined,
  duplexModeValue: string | undefined,
  mirrorBack: boolean = false,
): string {
  if (!isDuplexMode(duplexModeValue)) return "";

  let rotationTransform = "";

  switch (rotation) {
    case backPageRotation.ROTATION_90:
      rotationTransform = "rotate(90deg)";
      break;
    case backPageRotation.ROTATION_180:
      rotationTransform = "rotate(180deg)";
      break;
    case backPageRotation.ROTATION_270:
      rotationTransform = "rotate(270deg)";
      break;
    case backPageRotation.ROTATION_0:
    default:
      rotationTransform = "";
  }

  if (mirrorBack) {
    return rotationTransform
      ? `${rotationTransform} scaleX(-1)`
      : "scaleX(-1)";
  }

  return rotationTransform;
}

function sequentialPage(position: number): string {
  return (position + 1).toString();
}

function getBookletPageNumber(
  position: number,
  totalPages: number,
  isBack: boolean,
  columns: number,
  rows: number,
): number {
  if (columns === 2 && rows === 1) {
    if (isBack) {
      return position === 0 ? 2 : 3;
    }

    return position === 0 ? totalPages : 1;
  }

  if (columns === 1 && rows === 2) {
    if (isBack) {
      return position === 0 ? 2 : 3;
    }

    return position === 0 ? totalPages : 1;
  }

  if (columns === 2 && rows === 2) {
    if (isBack) {
      const backPages = [2, 3, 6, 7];
      return backPages[position] || 2 + position;
    }

    const frontPages = [totalPages, 1, totalPages - 3, 4];
    return frontPages[position] || totalPages - position;
  }

  const sheetIndex = Math.floor(position / 2);
  const positionInSheet = position % 2;

  if (isBack) {
    return 2 + sheetIndex * 4 + positionInSheet;
  }

  if (positionInSheet === 0) {
    return totalPages - sheetIndex * 4;
  }

  return 1 + sheetIndex * 4;
}

export function pagesPerGrid(horizontal: number, vertical: number): number {
  return Math.max(1, horizontal * vertical);
}

export function getPageNumber(
  layout: layoutType | undefined,
  rowIndex: number,
  colIndex: number,
  horizontal: number,
  vertical: number,
  isBackSide: boolean = false,
  pagesPerSignature?: number,
): string {
  const index = rowIndex * horizontal + colIndex;

  switch (layout) {
    case layoutType.STEP_AND_REPEAT:
      return isBackSide ? "2" : "1";
    case layoutType.N_UP:
    case layoutType.CUT_STACK:
    case layoutType.SHUFFLE:
    case layoutType.DUTCH_CUT:
      return sequentialPage(index + (isBackSide ? horizontal * vertical : 0));
    case layoutType.BOOKLET: {
      const totalPages =
        pagesPerSignature && pagesPerSignature >= 4
          ? pagesPerSignature
          : Math.max(4, pagesPerGrid(horizontal, vertical) * 2);

      return getBookletPageNumber(
        index,
        totalPages,
        isBackSide,
        horizontal,
        vertical,
      ).toString();
    }
    default:
      return isBackSide ? "2" : "1";
  }
}

export function calculateGridGeometry({
  previewWidth,
  previewHeight,
  itemWidthPx,
  itemHeightPx,
  horizontal,
  vertical,
  horizontalSpacingPx,
  verticalSpacingPx,
}: {
  previewWidth: number;
  previewHeight: number;
  itemWidthPx: number;
  itemHeightPx: number;
  horizontal: number;
  vertical: number;
  horizontalSpacingPx: number[];
  verticalSpacingPx: number[];
}): GridGeometry {
  const xPositions: number[] = [];
  const yPositions: number[] = [];

  let totalGridWidth = 0;
  for (let column = 0; column < horizontal; column += 1) {
    xPositions.push(totalGridWidth);
    totalGridWidth += itemWidthPx;
    if (column < horizontal - 1) {
      totalGridWidth += horizontalSpacingPx[column] ?? 0;
    }
  }

  let totalGridHeight = 0;
  for (let row = 0; row < vertical; row += 1) {
    yPositions.push(totalGridHeight);
    totalGridHeight += itemHeightPx;
    if (row < vertical - 1) {
      totalGridHeight += verticalSpacingPx[row] ?? 0;
    }
  }

  return {
    itemWidthPx,
    itemHeightPx,
    xPositions,
    yPositions,
    gridLeft: Math.max(0, (previewWidth - totalGridWidth) / 2),
    gridTop: Math.max(0, (previewHeight - totalGridHeight) / 2),
    totalGridWidth,
    totalGridHeight,
    horizontalSpacingPx,
    verticalSpacingPx,
  };
}

function getCenteredSlotIndex(trackPositions: number[]): number {
  if (trackPositions.length === 0) {
    return 0;
  }

  return Math.floor(trackPositions.length / 2);
}

export function buildHorizontalSpacingHelpers({
  gridGeometry,
  spacingValuesMm,
}: {
  gridGeometry: GridGeometry;
  spacingValuesMm: number[];
}): SpacingHelperPosition[] {
  const rowIndex = getCenteredSlotIndex(gridGeometry.yPositions);
  const y =
    gridGeometry.gridTop +
    (gridGeometry.yPositions[rowIndex] ?? 0) +
    gridGeometry.itemHeightPx / 2;

  return spacingValuesMm.map((value, index) => {
    const spacingPx = gridGeometry.horizontalSpacingPx[index] ?? 0;

    return {
      index,
      x:
        gridGeometry.gridLeft +
        (gridGeometry.xPositions[index] ?? 0) +
        gridGeometry.itemWidthPx +
        spacingPx / 2,
      y,
      value: Math.max(0, value),
    };
  });
}

export function buildVerticalSpacingHelpers({
  gridGeometry,
  spacingValuesMm,
}: {
  gridGeometry: GridGeometry;
  spacingValuesMm: number[];
}): SpacingHelperPosition[] {
  const columnIndex = getCenteredSlotIndex(gridGeometry.xPositions);
  const x =
    gridGeometry.gridLeft +
    (gridGeometry.xPositions[columnIndex] ?? 0) +
    gridGeometry.itemWidthPx / 2;

  return spacingValuesMm.map((value, index) => {
    const spacingPx = gridGeometry.verticalSpacingPx[index] ?? 0;

    return {
      index,
      x,
      y:
        gridGeometry.gridTop +
        (gridGeometry.yPositions[index] ?? 0) +
        gridGeometry.itemHeightPx +
        spacingPx / 2,
      value: Math.max(0, value),
    };
  });
}
