import { backPageRotation, duplexMode } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  buildHorizontalSpacingHelpers,
  buildVerticalSpacingHelpers,
  calculateGridGeometry,
  getBackPageTransform,
  getPreviewSlotLabel,
} from "./preview-helpers";

describe("buildHorizontalSpacingHelpers", () => {
  it("returns one helper per horizontal gap and anchors them to the middle row", () => {
    const gridGeometry = calculateGridGeometry({
      previewWidth: 320,
      previewHeight: 240,
      itemWidthPx: 40,
      itemHeightPx: 20,
      horizontal: 3,
      vertical: 4,
      horizontalSpacingPx: [8, 12],
      verticalSpacingPx: [6, 6, 6],
    });

    const helpers = buildHorizontalSpacingHelpers({
      gridGeometry,
      spacingValuesMm: [5, 7],
    });

    const middleRowY =
      gridGeometry.gridTop +
      (gridGeometry.yPositions[2] ?? 0) +
      gridGeometry.itemHeightPx / 2;

    expect(helpers).toHaveLength(2);
    expect(helpers).toEqual([
      {
        index: 0,
        x:
          gridGeometry.gridLeft +
          (gridGeometry.xPositions[0] ?? 0) +
          gridGeometry.itemWidthPx +
          (gridGeometry.horizontalSpacingPx[0] ?? 0) / 2,
        y: middleRowY,
        value: 5,
      },
      {
        index: 1,
        x:
          gridGeometry.gridLeft +
          (gridGeometry.xPositions[1] ?? 0) +
          gridGeometry.itemWidthPx +
          (gridGeometry.horizontalSpacingPx[1] ?? 0) / 2,
        y: middleRowY,
        value: 7,
      },
    ]);
  });
});

describe("buildVerticalSpacingHelpers", () => {
  it("returns one helper per vertical gap and anchors them to the middle column", () => {
    const gridGeometry = calculateGridGeometry({
      previewWidth: 320,
      previewHeight: 240,
      itemWidthPx: 40,
      itemHeightPx: 20,
      horizontal: 4,
      vertical: 3,
      horizontalSpacingPx: [8, 8, 8],
      verticalSpacingPx: [10, 14],
    });

    const helpers = buildVerticalSpacingHelpers({
      gridGeometry,
      spacingValuesMm: [3, 9],
    });

    const middleColumnX =
      gridGeometry.gridLeft +
      (gridGeometry.xPositions[2] ?? 0) +
      gridGeometry.itemWidthPx / 2;

    expect(helpers).toHaveLength(2);
    expect(helpers).toEqual([
      {
        index: 0,
        x: middleColumnX,
        y:
          gridGeometry.gridTop +
          (gridGeometry.yPositions[0] ?? 0) +
          gridGeometry.itemHeightPx +
          (gridGeometry.verticalSpacingPx[0] ?? 0) / 2,
        value: 3,
      },
      {
        index: 1,
        x: middleColumnX,
        y:
          gridGeometry.gridTop +
          (gridGeometry.yPositions[1] ?? 0) +
          gridGeometry.itemHeightPx +
          (gridGeometry.verticalSpacingPx[1] ?? 0) / 2,
        value: 9,
      },
    ]);
  });
});

describe("getPreviewSlotLabel", () => {
  it("preserves explicit blank labels for empty preview slots", () => {
    expect(
      getPreviewSlotLabel(
        {
          pageIndex: 3,
          pageLabel: "",
        },
        0,
      ),
    ).toBe("");
  });
});

describe("getBackPageTransform", () => {
  it("combines rotation and mirroring for duplex previews", () => {
    expect(
      getBackPageTransform(
        backPageRotation.ROTATION_90,
        duplexMode.DUPLEX_LONG_EDGE,
        true,
      ),
    ).toBe("rotate(90deg) scaleX(-1)");
  });

  it("stays empty when duplex is disabled", () => {
    expect(
      getBackPageTransform(backPageRotation.ROTATION_180, undefined, true),
    ).toBe("");
  });
});
