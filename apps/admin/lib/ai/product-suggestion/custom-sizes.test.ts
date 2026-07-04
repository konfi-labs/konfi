import { describe, expect, it } from "vitest";
import {
  getPrimaryCustomSize,
  normalizeSuggestedCustomSizes,
} from "./custom-sizes";

describe("product suggestion custom sizes", () => {
  it("preserves requested order while merging duplicate sizes", () => {
    const result = normalizeSuggestedCustomSizes([
      { width: 707, height: 1000, quantity: 20 },
      { width: 500, height: 707, quantity: 40 },
      { width: 707, height: 1000, quantity: 20 },
    ]);

    expect(result).toEqual([
      { width: 707, height: 1000, quantity: 40 },
      { width: 500, height: 707, quantity: 40 },
    ]);
  });

  it("uses the smallest size as primary dimensions without reordering sizes", () => {
    const sizes = [
      { width: 707, height: 1000, quantity: 40 },
      { width: 500, height: 707, quantity: 40 },
    ];

    expect(getPrimaryCustomSize(sizes)).toEqual({
      width: 500,
      height: 707,
      quantity: 40,
    });
    expect(sizes).toEqual([
      { width: 707, height: 1000, quantity: 40 },
      { width: 500, height: 707, quantity: 40 },
    ]);
  });

  it("drops invalid sizes returned by AI extraction", () => {
    expect(
      normalizeSuggestedCustomSizes([
        { width: 0, height: 1000, quantity: 40 },
        { width: 707, height: 1000, quantity: 0 },
        { width: 500, height: 707, quantity: 40 },
      ]),
    ).toEqual([{ width: 500, height: 707, quantity: 40 }]);
  });
});
