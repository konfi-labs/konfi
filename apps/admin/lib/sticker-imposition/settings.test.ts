import { describe, expect, it } from "vitest";
import {
  STICKER_GROUPED_PARTS_DEFAULT_SPACING_MM,
  STICKER_SINGLE_CUT_MIN_SPACING_MM,
  STICKER_DEFAULT_SETTINGS,
  createPackingModeSettingsPatch,
  stickerPackingMode,
} from "./types";

describe("createPackingModeSettingsPatch", () => {
  it("defaults grouped parts spacing to zero when switching from single-cut rows", () => {
    expect(
      createPackingModeSettingsPatch(
        STICKER_DEFAULT_SETTINGS,
        stickerPackingMode.GROUPED_PARTS,
      ),
    ).toEqual({
      minSpacingMm: STICKER_GROUPED_PARTS_DEFAULT_SPACING_MM,
      packingMode: stickerPackingMode.GROUPED_PARTS,
    });
  });

  it("keeps single-cut rows at the required minimum spacing", () => {
    expect(
      createPackingModeSettingsPatch(
        {
          ...STICKER_DEFAULT_SETTINGS,
          minSpacingMm: 0,
          packingMode: stickerPackingMode.GROUPED_PARTS,
        },
        stickerPackingMode.SINGLE_CUT_ROWS,
      ),
    ).toEqual({
      minSpacingMm: STICKER_SINGLE_CUT_MIN_SPACING_MM,
      packingMode: stickerPackingMode.SINGLE_CUT_ROWS,
    });
  });
});
