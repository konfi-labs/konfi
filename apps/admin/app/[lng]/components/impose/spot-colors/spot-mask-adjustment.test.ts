import { describe, expect, it } from "vitest";
import {
  adjustSpotMask,
  normalizeSpotChokeBleedMm,
} from "./spot-mask-adjustment";

const pagePt = 72;
const onePixelMm = ((pagePt / 72) * 25.4) / 5;

describe("adjustSpotMask", () => {
  it("bleeds a spot mask with positive values", () => {
    const mask = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0,
    ]);

    const adjusted = adjustSpotMask({
      chokeBleedMm: onePixelMm,
      height: 3,
      mask,
      pageHeightPt: pagePt,
      pageWidthPt: pagePt,
      width: 5,
    });

    expect(Array.from(adjusted)).toEqual([
      0, 255, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255, 255, 255, 0,
    ]);
  });

  it("chokes a spot mask with negative values", () => {
    const mask = new Uint8Array([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);

    const adjusted = adjustSpotMask({
      chokeBleedMm: -onePixelMm,
      height: 3,
      mask,
      pageHeightPt: pagePt,
      pageWidthPt: pagePt,
      width: 5,
    });

    expect(Array.from(adjusted)).toEqual([
      0, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe("normalizeSpotChokeBleedMm", () => {
  it("clamps invalid and out-of-range values", () => {
    expect(normalizeSpotChokeBleedMm("1")).toBe(0);
    expect(normalizeSpotChokeBleedMm(11)).toBe(10);
    expect(normalizeSpotChokeBleedMm(-11)).toBe(-10);
  });
});
