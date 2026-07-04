import { describe, expect, it } from "vitest";
import {
  IMPOSITION_WARNING_CODES,
  isImpositionWarning,
  isStructuredImpositionWarning,
} from "./warnings";

describe("isStructuredImpositionWarning", () => {
  it("accepts known warning codes with scalar values", () => {
    expect(
      isStructuredImpositionWarning({
        code: IMPOSITION_WARNING_CODES.AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE,
        values: {
          filename: "sheet.pdf",
          retried: true,
          attempt: 1,
        },
      }),
    ).toBe(true);
  });

  it("rejects unknown warning codes", () => {
    expect(
      isStructuredImpositionWarning({
        code: "impose.warnings.unknown",
      }),
    ).toBe(false);
  });

  it("rejects non-scalar values", () => {
    expect(
      isStructuredImpositionWarning({
        code: IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_FAILED,
        values: {
          reason: {
            nested: "nope",
          },
        },
      }),
    ).toBe(false);
  });
});

describe("isImpositionWarning", () => {
  it("accepts plain string warnings", () => {
    expect(isImpositionWarning("fallback warning")).toBe(true);
  });
});