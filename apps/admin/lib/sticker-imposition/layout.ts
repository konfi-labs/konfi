import { stickerCutShape, type StickerLayoutPlacement } from "./types";
import type {
  ManualCutMark,
  OposMarkPosition,
  StickerImposedSheet,
  StickerImpositionPlan,
  StickerPartBoundary,
} from "./types";

export type StickerCutBounds = {
  maxXMm: number;
  maxYMm: number;
  minXMm: number;
  minYMm: number;
};

export function resolvePlacementCutBounds(
  placement: StickerLayoutPlacement,
): StickerCutBounds {
  const offset =
    placement.cutShape === stickerCutShape.READY_SHEET
      ? 0
      : placement.cutOffsetMm;

  if (placement.cutShape === stickerCutShape.CIRCLE) {
    const radius = Math.max(
      0.5,
      Math.max(placement.widthMm, placement.heightMm) / 2 + offset,
    );
    const centerXMm = placement.xMm + placement.widthMm / 2;
    const centerYMm = placement.yMm + placement.heightMm / 2;

    return {
      maxXMm: centerXMm + radius,
      maxYMm: centerYMm + radius,
      minXMm: centerXMm - radius,
      minYMm: centerYMm - radius,
    };
  }

  if (offset < 0) {
    const inset = Math.min(
      -offset,
      Math.max(0, placement.widthMm - 1) / 2,
      Math.max(0, placement.heightMm - 1) / 2,
    );

    return {
      maxXMm: placement.xMm + placement.widthMm - inset,
      maxYMm: placement.yMm + placement.heightMm - inset,
      minXMm: placement.xMm + inset,
      minYMm: placement.yMm + inset,
    };
  }

  return {
    maxXMm: placement.xMm + placement.widthMm + offset,
    maxYMm: placement.yMm + placement.heightMm + offset,
    minXMm: placement.xMm - offset,
    minYMm: placement.yMm - offset,
  };
}

export function resolvePlacementPrintBounds(
  placement: StickerLayoutPlacement,
): StickerCutBounds {
  const bleed =
    placement.cutShape === stickerCutShape.READY_SHEET
      ? 0
      : Math.max(0, placement.bleedMm);

  if (placement.cutShape === stickerCutShape.CIRCLE) {
    const radius = Math.max(placement.widthMm, placement.heightMm) / 2 + bleed;
    const centerXMm = placement.xMm + placement.widthMm / 2;
    const centerYMm = placement.yMm + placement.heightMm / 2;

    return {
      maxXMm: centerXMm + radius,
      maxYMm: centerYMm + radius,
      minXMm: centerXMm - radius,
      minYMm: centerYMm - radius,
    };
  }

  return {
    maxXMm: placement.xMm + placement.widthMm + bleed,
    maxYMm: placement.yMm + placement.heightMm + bleed,
    minXMm: placement.xMm - bleed,
    minYMm: placement.yMm - bleed,
  };
}

function roundLayoutNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildOposMarkSignature(mark: OposMarkPosition): string {
  return JSON.stringify({
    clearanceMm: roundLayoutNumber(mark.clearanceMm),
    heightMm: roundLayoutNumber(mark.heightMm),
    kind: mark.kind,
    widthMm: roundLayoutNumber(mark.widthMm),
    xMm: roundLayoutNumber(mark.xMm),
    yMm: roundLayoutNumber(mark.yMm),
  });
}

function buildManualCutMarkSignature(mark: ManualCutMark): string {
  return JSON.stringify({
    x1Mm: roundLayoutNumber(mark.x1Mm),
    x2Mm: roundLayoutNumber(mark.x2Mm),
    y1Mm: roundLayoutNumber(mark.y1Mm),
    y2Mm: roundLayoutNumber(mark.y2Mm),
  });
}

function buildPartBoundarySignature(part: StickerPartBoundary): string {
  return JSON.stringify({
    heightMm: roundLayoutNumber(part.heightMm),
    widthMm: roundLayoutNumber(part.widthMm),
    xMm: roundLayoutNumber(part.xMm),
    yMm: roundLayoutNumber(part.yMm),
  });
}

function buildPlacementSignature(
  placement: StickerLayoutPlacement,
  artworkPreviews: Record<string, string>,
): string {
  return JSON.stringify({
    artworkKey:
      artworkPreviews[placement.itemId] ??
      `${placement.itemId}:${placement.filename}:${placement.pageNumber}`,
    bleedMm: roundLayoutNumber(placement.bleedMm),
    bleedFillMode: placement.bleedFillMode,
    cutOffsetMm: roundLayoutNumber(placement.cutOffsetMm),
    cutShape: placement.cutShape,
    heightMm: roundLayoutNumber(placement.heightMm),
    mirrorBleedEnabled: placement.mirrorBleedEnabled,
    rotationDegrees: placement.rotationDegrees,
    widthMm: roundLayoutNumber(placement.widthMm),
    xMm: roundLayoutNumber(placement.xMm),
    yMm: roundLayoutNumber(placement.yMm),
  });
}

function buildSheetSignature(
  sheet: StickerImposedSheet,
  artworkPreviews: Record<string, string>,
): string {
  return JSON.stringify({
    exportHeightMm: roundLayoutNumber(sheet.exportHeightMm),
    exportWidthMm: roundLayoutNumber(sheet.exportWidthMm),
    exportXMm: roundLayoutNumber(sheet.exportXMm),
    exportYMm: roundLayoutNumber(sheet.exportYMm),
    manualCutMarks: sheet.manualCutMarks.map(buildManualCutMarkSignature),
    mediaWidthMm: roundLayoutNumber(sheet.mediaWidthMm),
    oposMarks: sheet.oposMarks.map(buildOposMarkSignature),
    partBoundaries: sheet.partBoundaries.map(buildPartBoundarySignature),
    placements: sheet.placements.map((placement) =>
      buildPlacementSignature(placement, artworkPreviews),
    ),
    previewLengthMm: roundLayoutNumber(sheet.previewLengthMm),
  });
}

export function collapsePreviewPlanSheets(
  plan: StickerImpositionPlan,
  artworkPreviews: Record<string, string>,
): StickerImpositionPlan {
  if (plan.sheets.length <= 1) {
    return {
      ...plan,
      sheets: plan.sheets.map((sheet, index) => ({
        ...sheet,
        index,
        repeatCount: sheet.repeatCount ?? 1,
      })),
      totalSheetCount: plan.totalSheetCount ?? plan.sheetCount,
    };
  }

  const signatureToSheetIndex = new Map<string, number>();
  const collapsedSheets: StickerImposedSheet[] = [];

  for (const sheet of plan.sheets) {
    const signature = buildSheetSignature(sheet, artworkPreviews);
    const existingIndex = signatureToSheetIndex.get(signature);

    if (existingIndex === undefined) {
      signatureToSheetIndex.set(signature, collapsedSheets.length);
      collapsedSheets.push({
        ...sheet,
        index: collapsedSheets.length,
        repeatCount: 1,
      });
      continue;
    }

    const existingSheet = collapsedSheets[existingIndex];
    collapsedSheets[existingIndex] = {
      ...existingSheet,
      repeatCount: (existingSheet.repeatCount ?? 1) + 1,
    };
  }

  return {
    ...plan,
    sheetCount: collapsedSheets.length,
    sheets: collapsedSheets,
    totalSheetCount: plan.totalSheetCount ?? plan.sheetCount,
  };
}
