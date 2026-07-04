import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  formatLocalDateOnly,
  getLastDayOfMonthDateOnly,
} from "../invoice-date-utils";

describe("invoice date utilities", () => {
  it("formats local dates without UTC conversion", () => {
    const localMidnight = new Date(2026, 5, 1);

    expect(formatLocalDateOnly(localMidnight)).toBe("2026-06-01");
  });

  it("keeps the local last day of month for estimate payment deadlines", () => {
    const monthDate = new Date(2026, 5, 12);

    expect(getLastDayOfMonthDateOnly(monthDate)).toBe("2026-06-30");
  });

  it("adds payment term days to a date-only value", () => {
    expect(addDaysToDateOnly("2026-06-23", 7)).toBe("2026-06-30");
  });

  it("handles month rollover without moving the result one day back", () => {
    expect(addDaysToDateOnly("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("ignores invalid date-only values", () => {
    expect(addDaysToDateOnly("2026-02-31", 7)).toBeUndefined();
    expect(addDaysToDateOnly("2026-06-30T00:00", 7)).toBeUndefined();
  });
});
