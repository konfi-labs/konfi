import { describe, expect, it } from "vitest";
import {
  bleedType,
  layoutType,
  paperOrientation,
  sourceSizing,
} from "@konfi/types";
import {
  buildImposePreviewRequest,
  buildImposeRequestPayload,
  normalizeImposeBoolean,
  resolveImposeItemDimensions,
  resolveImposeSheetDimensions,
  roundImposeDimension,
  type ImposePayloadFormValues,
} from "./impose-payload";

// ---------------------------------------------------------------------------
// Minimal valid values used across multiple tests
// ---------------------------------------------------------------------------
const BASE_VALUES: Partial<ImposePayloadFormValues> = {
  customSheetSize: false,
  sheetSizeName: "A4",
  sheetOrientation: paperOrientation.PORTRAIT,
  customItemSize: false,
  itemSizeName: "A5",
  itemOrientation: paperOrientation.PORTRAIT,
  automaticSheetOrientation: false,
  automaticItemOrientation: false,
  automaticNumberOfHorizontalItems: false,
  automaticNumberOfVerticalItems: false,
  automaticSpacingHorizontal: true,
  automaticSpacingVertical: true,
  bleed: 3,
  bleedType: bleedType.BLEED_INCLUDED,
  sourceSizing: sourceSizing.PRESERVE_ORIGINAL_SIZE,
  cropMarks: true,
  layout: layoutType.STEP_AND_REPEAT,
  pagesPerSignature: 4,
  numItemsHorizontal: 2,
  numItemsVertical: 2,
  frontBackAlignment: false,
  mirrorBack: false,
};

// ---------------------------------------------------------------------------
// 1. normalizeImposeBoolean
// ---------------------------------------------------------------------------
describe("normalizeImposeBoolean", () => {
  it("converts string 'true' to true", () => {
    expect(normalizeImposeBoolean("true")).toBe(true);
  });

  it("converts string 'false' to false", () => {
    expect(normalizeImposeBoolean("false")).toBe(false);
  });

  it("passes through boolean true", () => {
    expect(normalizeImposeBoolean(true)).toBe(true);
  });

  it("passes through boolean false", () => {
    expect(normalizeImposeBoolean(false)).toBe(false);
  });

  it("coerces undefined to false", () => {
    expect(normalizeImposeBoolean(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. roundImposeDimension
// ---------------------------------------------------------------------------
describe("roundImposeDimension", () => {
  it("rounds fractional values", () => {
    expect(roundImposeDimension(5.6)).toBe(6);
    expect(roundImposeDimension(5.4)).toBe(5);
  });

  it("clamps negative values to 0", () => {
    expect(roundImposeDimension(-5)).toBe(0);
    expect(roundImposeDimension(-0.1)).toBe(0);
  });

  it("clamps zero to 0", () => {
    expect(roundImposeDimension(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Manual sheet orientation: LANDSCAPE swaps A4 width/height
// ---------------------------------------------------------------------------
describe("resolveImposeSheetDimensions", () => {
  it("returns portrait A4 dims for PORTRAIT orientation", () => {
    const result = resolveImposeSheetDimensions({
      customSheetSize: false,
      sheetSizeName: "A4",
      sheetOrientation: paperOrientation.PORTRAIT,
    });
    // A4 portrait: 210 x 297
    expect(result).toEqual({ width: 210, height: 297 });
  });

  it("returns landscape A4 dims for LANDSCAPE orientation (width/height swapped)", () => {
    const result = resolveImposeSheetDimensions({
      automaticSheetOrientation: false,
      sheetSizeName: "A4",
      sheetOrientation: paperOrientation.LANDSCAPE,
    });
    // A4 landscape: 297 x 210
    expect(result.width).toBe(297);
    expect(result.height).toBe(210);
  });

  it("falls back to A4 portrait when sheetSizeName is omitted", () => {
    const result = resolveImposeSheetDimensions({});
    expect(result).toEqual({ width: 210, height: 297 });
  });

  it("uses custom dimensions when customSheetSize is true and both values are set", () => {
    const result = resolveImposeSheetDimensions({
      customSheetSize: true,
      customSheetSizeWidth: 400,
      customSheetSizeHeight: 300,
    });
    expect(result).toEqual({ width: 400, height: 300 });
  });

  it("falls back to named size when customSheetSize is true but dims are missing", () => {
    const result = resolveImposeSheetDimensions({
      customSheetSize: true,
      sheetSizeName: "A4",
      sheetOrientation: paperOrientation.PORTRAIT,
    });
    // No custom dims provided → named size
    expect(result).toEqual({ width: 210, height: 297 });
  });
});

// ---------------------------------------------------------------------------
// 4. Manual item orientation
// ---------------------------------------------------------------------------
describe("resolveImposeItemDimensions", () => {
  it("returns portrait A5 dims for PORTRAIT orientation", () => {
    const result = resolveImposeItemDimensions({
      customItemSize: false,
      itemSizeName: "A5",
      itemOrientation: paperOrientation.PORTRAIT,
    });
    // A5 portrait: 148 x 210
    expect(result).toEqual({ width: 148, height: 210 });
  });

  it("returns landscape A5 dims for LANDSCAPE orientation (width/height swapped)", () => {
    const result = resolveImposeItemDimensions({
      customItemSize: false,
      itemSizeName: "A5",
      itemOrientation: paperOrientation.LANDSCAPE,
    });
    // A5 landscape: 210 x 148
    expect(result.width).toBe(210);
    expect(result.height).toBe(148);
  });

  it("falls back to A5 portrait when itemSizeName is omitted", () => {
    const result = resolveImposeItemDimensions({});
    expect(result).toEqual({ width: 148, height: 210 });
  });
});

// ---------------------------------------------------------------------------
// 5. Custom dimensions: fractional values are rounded; negative → 0
// ---------------------------------------------------------------------------
describe("buildImposeRequestPayload – custom dimensions", () => {
  it("rounds fractional custom sheet dimensions", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      customSheetSize: true,
      customSheetSizeWidth: 210.7,
      customSheetSizeHeight: 297.2,
    });
    expect(payload.customSheetSizeWidth).toBe(211);
    expect(payload.customSheetSizeHeight).toBe(297);
  });

  it("clamps negative/zero custom dimensions to 0 via roundImposeDimension", () => {
    // roundImposeDimension(-5) === 0
    expect(roundImposeDimension(-5)).toBe(0);

    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      customSheetSize: true,
      customSheetSizeWidth: 0,
      customSheetSizeHeight: -10,
    });
    // Falls back to named size since custom values are falsy (0 / negative)
    // Both resolve to 0 after clamp when a named size is missing
    const sheetFallback = resolveImposeSheetDimensions({
      customSheetSize: true,
      customSheetSizeWidth: 0,
      customSheetSizeHeight: -10,
      sheetSizeName: BASE_VALUES.sheetSizeName,
      sheetOrientation: BASE_VALUES.sheetOrientation,
    });
    expect(payload.customSheetSizeWidth).toBe(
      roundImposeDimension(sheetFallback.width),
    );
    expect(payload.customSheetSizeHeight).toBe(
      roundImposeDimension(sheetFallback.height),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Manual counts: auto flags false → numItems passed through; undefined → 0
// ---------------------------------------------------------------------------
describe("buildImposeRequestPayload – item counts", () => {
  it("carries through manual numItemsHorizontal/Vertical when auto flags are false", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      automaticNumberOfHorizontalItems: false,
      automaticNumberOfVerticalItems: false,
      numItemsHorizontal: 3,
      numItemsVertical: 2,
    });
    expect(payload.numItemsHorizontal).toBe(3);
    expect(payload.numItemsVertical).toBe(2);
  });

  it("coerces undefined counts to 0", () => {
    const { numItemsHorizontal: _h, numItemsVertical: _v, ...rest } =
      BASE_VALUES;
    const payload = buildImposeRequestPayload(rest);
    expect(payload.numItemsHorizontal).toBe(0);
    expect(payload.numItemsVertical).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Preview/submit parity: same input → buildImposePreviewRequest.data
//    contains every field of buildImposeRequestPayload with identical values
// ---------------------------------------------------------------------------
describe("preview/submit parity", () => {
  it("preview data contains every field of requestPayload with identical values", () => {
    const values: Partial<ImposePayloadFormValues> = { ...BASE_VALUES };
    const payload = buildImposeRequestPayload(values);
    const preview = buildImposePreviewRequest(values);

    expect(preview).not.toBeNull();
    expect(preview!.data).toBeDefined();

    for (const [key, value] of Object.entries(payload)) {
      expect((preview!.data as Record<string, unknown>)[key]).toEqual(value);
    }
  });

  it("preview data includes additionalData block with expected fields", () => {
    const values: Partial<ImposePayloadFormValues> = { ...BASE_VALUES };
    const preview = buildImposePreviewRequest(values);

    expect(preview!.data!.additionalData).toBeDefined();
    expect(preview!.data!.additionalData!.customItemSize).toBe(false);
    expect(preview!.data!.additionalData!.customSheetSize).toBe(false);
    expect(preview!.data!.additionalData!.files).toEqual([]);
    expect(preview!.data!.additionalData!.saveAsTemplate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Guard: buildImposePreviewRequest returns null for invalid inputs
// ---------------------------------------------------------------------------
describe("buildImposePreviewRequest – guard", () => {
  it("returns null when layout is missing", () => {
    const { layout: _l, ...values } = BASE_VALUES;
    expect(buildImposePreviewRequest(values)).toBeNull();
  });

  it("returns null when bleedType is missing", () => {
    const { bleedType: _b, ...values } = BASE_VALUES;
    expect(buildImposePreviewRequest(values)).toBeNull();
  });

  it("falls back to named-size dimensions instead of null when custom dims are zero", () => {
    const result = buildImposePreviewRequest({
      ...BASE_VALUES,
      customSheetSize: true,
      customSheetSizeWidth: 0,
      customSheetSizeHeight: 0,
    });

    // Zero custom sizes fall back to the named A4 dimensions, so the guard
    // does not fire; it only fires when layout or bleedType are missing.
    expect(result).not.toBeNull();
    expect(result!.data!.customSheetSizeWidth).toBe(210);
    expect(result!.data!.customSheetSizeHeight).toBe(297);
  });

  it("returns null when both layout and bleedType are absent (empty input)", () => {
    expect(buildImposePreviewRequest({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. sourceSizing parity with resolveImpositionSourceSizing for DIFFERENTIAL_DIFFUSION
// ---------------------------------------------------------------------------
describe("sourceSizing – DIFFERENTIAL_DIFFUSION forces FIT_OUTPUT_BOX", () => {
  it("sets sourceSizing to FIT_OUTPUT_BOX for DIFFERENTIAL_DIFFUSION bleed type", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      sourceSizing: sourceSizing.PRESERVE_ORIGINAL_SIZE,
    });
    expect(payload.sourceSizing).toBe(sourceSizing.FIT_OUTPUT_BOX);
  });

  it("preserves PRESERVE_ORIGINAL_SIZE for NO_BLEED", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      bleedType: bleedType.NO_BLEED,
      sourceSizing: sourceSizing.PRESERVE_ORIGINAL_SIZE,
    });
    expect(payload.sourceSizing).toBe(sourceSizing.PRESERVE_ORIGINAL_SIZE);
  });

  it("preserves FIT_OUTPUT_BOX for BLEED_INCLUDED", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      bleedType: bleedType.BLEED_INCLUDED,
      sourceSizing: sourceSizing.FIT_OUTPUT_BOX,
    });
    expect(payload.sourceSizing).toBe(sourceSizing.FIT_OUTPUT_BOX);
  });

  it("forces FIT_OUTPUT_BOX for ONE_POINT_FIVE_MM_SCALE", () => {
    const payload = buildImposeRequestPayload({
      ...BASE_VALUES,
      bleedType: bleedType.ONE_POINT_FIVE_MM_SCALE,
      sourceSizing: sourceSizing.PRESERVE_ORIGINAL_SIZE,
    });
    expect(payload.sourceSizing).toBe(sourceSizing.FIT_OUTPUT_BOX);
  });
});
