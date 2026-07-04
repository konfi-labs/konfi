import { describe, expect, it } from "vitest";
import { dateFromTimestamp, formatDate } from "../../formatters/format-date";

describe("dateFromTimestamp", () => {
  it("normalizes Firestore Timestamp instances", () => {
    const date = new Date("2026-04-05T10:15:30.000Z");

    expect(
      dateFromTimestamp({
        toDate: () => date,
        toMillis: () => date.getTime(),
      })?.toISOString(),
    ).toBe(date.toISOString());
  });

  it("normalizes serialized Firestore timestamp objects", () => {
    expect(
      dateFromTimestamp({
        nanoseconds: 500_000_000,
        seconds: 1_775_384_130,
      })?.toISOString(),
    ).toBe("2026-04-05T10:15:30.500Z");
  });

  it("normalizes admin SDK serialized timestamp objects", () => {
    expect(
      dateFromTimestamp({
        _nanoseconds: 0,
        _seconds: 1_775_384_130,
      })?.toISOString(),
    ).toBe("2026-04-05T10:15:30.000Z");
  });

  it("returns undefined for invalid timestamp values", () => {
    expect(dateFromTimestamp("not a date")).toBeUndefined();
    expect(dateFromTimestamp({ seconds: Number.NaN })).toBeUndefined();
  });
});

describe("formatDate", () => {
  it("formats serialized timestamps without requiring toDate", () => {
    expect(
      formatDate(
        {
          nanoseconds: 0,
          seconds: 1_775_385_330,
        },
        "en-US",
        {
          day: "2-digit",
          month: "long",
          timeZone: "UTC",
          year: "numeric",
        },
      ),
    ).toBe("April 05, 2026");
  });

  it("returns an empty string for invalid timestamp values", () => {
    expect(formatDate(undefined, "en-US")).toBe("");
    expect(formatDate("not a date", "en-US")).toBe("");
  });
});
