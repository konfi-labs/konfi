import { describe, expect, it } from "vitest";
import {
  collapsePreviewPlanSheets,
  resolvePlacementCutBounds,
  resolvePlacementPrintBounds,
} from "./layout";
import {
  stickerCutShape,
  stickerPackingMode,
  type StickerImpositionPlan,
  type StickerLayoutPlacement,
} from "./types";

function createPlacement(
  overrides?: Partial<StickerLayoutPlacement>,
): StickerLayoutPlacement {
  return {
    bleedMm: 0,
    cutOffsetMm: 5,
    cutShape: stickerCutShape.RECTANGLE,
    filename: "label.pdf",
    heightMm: 40,
    instanceIndex: 0,
    itemId: "0:1",
    mirrorBleedEnabled: false,
    pageNumber: 1,
    partId: null,
    rotationDegrees: 0,
    sheetIndex: 0,
    sourceHeightMm: null,
    sourceFileIndex: 0,
    sourceWidthMm: null,
    widthMm: 80,
    xMm: 10,
    yMm: 20,
    ...overrides,
  };
}

describe("resolvePlacementCutBounds", () => {
  it("expands standard shapes by the cut offset", () => {
    expect(resolvePlacementCutBounds(createPlacement())).toEqual({
      maxXMm: 95,
      maxYMm: 65,
      minXMm: 5,
      minYMm: 15,
    });
  });

  it("supports negative cut offsets", () => {
    expect(
      resolvePlacementCutBounds(createPlacement({ cutOffsetMm: -2 })),
    ).toEqual({
      maxXMm: 88,
      maxYMm: 58,
      minXMm: 12,
      minYMm: 22,
    });
  });

  it("keeps ready sheets on their original bounds", () => {
    expect(
      resolvePlacementCutBounds(
        createPlacement({
          cutOffsetMm: 12,
          cutShape: stickerCutShape.READY_SHEET,
        }),
      ),
    ).toEqual({
      maxXMm: 90,
      maxYMm: 60,
      minXMm: 10,
      minYMm: 20,
    });
  });
});

describe("resolvePlacementPrintBounds", () => {
  it("expands artwork by bleed without using the cut offset", () => {
    expect(
      resolvePlacementPrintBounds(
        createPlacement({
          bleedMm: 3,
          cutOffsetMm: -2,
        }),
      ),
    ).toEqual({
      maxXMm: 93,
      maxYMm: 63,
      minXMm: 7,
      minYMm: 17,
    });
  });
});

function createPlan(
  sheets: StickerImpositionPlan["sheets"],
): StickerImpositionPlan {
  return {
    itemCount: sheets.reduce(
      (count, sheet) => count + sheet.placements.length,
      0,
    ),
    mediaWidthMm: 1000,
    packingMode: stickerPackingMode.SINGLE_CUT_ROWS,
    sheetCount: sheets.length,
    sheets,
    totalAreaMm2: 1_000_000,
    usedAreaMm2: 100_000,
  };
}

describe("collapsePreviewPlanSheets", () => {
  it("collapses byte-identical preview sheets into one repeated sheet", () => {
    const first = {
      exportHeightMm: 80,
      exportWidthMm: 120,
      exportXMm: 0,
      exportYMm: 0,
      index: 0,
      manualCutMarks: [],
      mediaWidthMm: 1000,
      oposMarks: [],
      partBoundaries: [],
      placements: [createPlacement()],
      previewLengthMm: 200,
      utilizationPercent: 12.5,
    };
    const second = {
      ...first,
      index: 1,
      placements: [
        createPlacement({
          instanceIndex: 99,
        }),
      ],
    };

    const result = collapsePreviewPlanSheets(createPlan([first, second]), {
      "0:1": "data:image/png;base64,AAA",
    });

    expect(result.sheetCount).toBe(1);
    expect(result.totalSheetCount).toBe(2);
    expect(result.sheets[0]?.repeatCount).toBe(2);
  });

  it("keeps sheets separate when their artwork previews differ", () => {
    const first = {
      exportHeightMm: 80,
      exportWidthMm: 120,
      exportXMm: 0,
      exportYMm: 0,
      index: 0,
      manualCutMarks: [],
      mediaWidthMm: 1000,
      oposMarks: [],
      partBoundaries: [],
      placements: [createPlacement()],
      previewLengthMm: 200,
      utilizationPercent: 12.5,
    };
    const second = {
      ...first,
      index: 1,
      placements: [
        createPlacement({
          filename: "label-2.pdf",
          itemId: "0:2",
        }),
      ],
    };

    const result = collapsePreviewPlanSheets(createPlan([first, second]), {
      "0:1": "data:image/png;base64,AAA",
      "0:2": "data:image/png;base64,BBB",
    });

    expect(result.sheetCount).toBe(2);
    expect(result.sheets[0]?.repeatCount).toBe(1);
    expect(result.sheets[1]?.repeatCount).toBe(1);
  });
});
