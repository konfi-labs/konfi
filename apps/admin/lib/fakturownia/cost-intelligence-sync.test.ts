import { describe, expect, it } from "vitest";
import {
  deriveIncrementalDateFrom,
  INCREMENTAL_OVERLAP_DAYS,
} from "./cost-intelligence-sync";

describe("deriveIncrementalDateFrom", () => {
  it("returns undefined for a missing timestamp (full scan fallback)", () => {
    expect(deriveIncrementalDateFrom(undefined)).toBeUndefined();
  });

  it("returns undefined for an unparsable timestamp", () => {
    expect(deriveIncrementalDateFrom("not-a-date")).toBeUndefined();
  });

  it("subtracts the default overlap window and formats YYYY-MM-DD", () => {
    expect(deriveIncrementalDateFrom("2026-06-10T08:30:00.000Z")).toBe(
      "2026-06-07",
    );
  });

  it("uses the default overlap of 3 days", () => {
    const iso = "2026-06-10T00:00:00.000Z";
    expect(deriveIncrementalDateFrom(iso)).toBe(
      deriveIncrementalDateFrom(iso, INCREMENTAL_OVERLAP_DAYS),
    );
  });

  it("honors a custom overlap window", () => {
    expect(deriveIncrementalDateFrom("2026-06-10T08:30:00.000Z", 7)).toBe(
      "2026-06-03",
    );
  });

  it("treats a zero overlap as same-day", () => {
    expect(deriveIncrementalDateFrom("2026-06-10T23:59:59.000Z", 0)).toBe(
      "2026-06-10",
    );
  });

  it("clamps negative overlap to zero", () => {
    expect(deriveIncrementalDateFrom("2026-06-10T12:00:00.000Z", -5)).toBe(
      "2026-06-10",
    );
  });

  it("rolls back across month boundaries", () => {
    expect(deriveIncrementalDateFrom("2026-06-02T00:00:00.000Z", 3)).toBe(
      "2026-05-30",
    );
  });
});
