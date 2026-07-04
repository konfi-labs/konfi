import { describe, expect, it } from "vitest";
import { stickerPackingMode, type StickerImpositionPlan } from "./types";
import {
  isStickerBadRequestMessage,
  validateStickerImpositionPlan,
} from "./validation";

function createPlan(
  overrides?: Partial<StickerImpositionPlan>,
): StickerImpositionPlan {
  return {
    itemCount: 1,
    mediaWidthMm: 1000,
    packingMode: stickerPackingMode.SINGLE_CUT_ROWS,
    sheetCount: 1,
    sheets: [
      {
        exportHeightMm: 300,
        exportWidthMm: 800,
        exportXMm: 0,
        exportYMm: 0,
        index: 0,
        manualCutMarks: [],
        mediaWidthMm: 1000,
        oposMarks: [],
        partBoundaries: [],
        placements: [],
        previewLengthMm: 1000,
        utilizationPercent: 80,
      },
    ],
    totalAreaMm2: 1_000_000,
    usedAreaMm2: 800_000,
    ...overrides,
  };
}

describe("validateStickerImpositionPlan", () => {
  it("allows plans that fit within the selected media width", () => {
    expect(() => validateStickerImpositionPlan(createPlan())).not.toThrow();
  });

  it("rejects sheets that exceed the selected media width", () => {
    expect(() =>
      validateStickerImpositionPlan(
        createPlan({
          sheets: [
            {
              ...createPlan().sheets[0],
              exportWidthMm: 1005,
            },
          ],
        }),
      ),
    ).toThrow("Sticker sheet 1 is wider than the selected media.");
  });
});

describe("isStickerBadRequestMessage", () => {
  it("treats layout fit failures as client errors", () => {
    expect(
      isStickerBadRequestMessage(
        "Sticker sheet 1 is wider than the selected media.",
      ),
    ).toBe(true);
  });
});
