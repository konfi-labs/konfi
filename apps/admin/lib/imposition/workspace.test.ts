import { describe, expect, it } from "vitest";
import { bleedType } from "@konfi/types";
import { parseSpacingValues, selectableBleedTypeOptions } from "./workspace";

describe("parseSpacingValues", () => {
  it("preserves fractional spacing values for template workflows", () => {
    expect(parseSpacingValues("1.5, 2, 3.25")).toEqual([1.5, 2, 3.25]);
  });
});

describe("selectableBleedTypeOptions", () => {
  it("shows fast content-aware bleed separately from AI bleed", () => {
    expect(
      selectableBleedTypeOptions.some(
        (option) => option.value === bleedType.CONTENT_AWARE_FAST,
      ),
    ).toBe(true);
    expect(
      selectableBleedTypeOptions.some(
        (option) => option.value === bleedType.DIFFERENTIAL_DIFFUSION,
      ),
    ).toBe(false);
  });
});
