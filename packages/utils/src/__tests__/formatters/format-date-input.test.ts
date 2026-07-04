import { formatDateInput } from "../../formatters/format-date-input";

describe("formatDateInput", () => {
  it("should format a date correctly", () => {
    const date = new Date(2023, 5, 15); // June 15, 2023
    expect(formatDateInput(date)).toBe("2023-06-15");
  });

  it("should pad single-digit months and days with leading zeros", () => {
    const date = new Date(2023, 0, 1); // January 1, 2023
    expect(formatDateInput(date)).toBe("2023-01-01");
  });

  it("should handle month rollover correctly", () => {
    const date = new Date(2023, 11, 31); // December 31, 2023
    expect(formatDateInput(date)).toBe("2023-12-31");
  });

  it("should handle leap years correctly", () => {
    const date = new Date(2024, 1, 29); // February 29, 2024 (leap year)
    expect(formatDateInput(date)).toBe("2024-02-29");
  });
});
