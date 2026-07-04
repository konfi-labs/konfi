import { isWithinLastMonth } from "../../validators/is-within-last-month";

describe("isWithinLastMonth", () => {
  // Mock the current date to make tests deterministic
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-15"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should return false for undefined date", () => {
    expect(isWithinLastMonth(undefined)).toBe(false);
  });

  it("should return true for date within the last month", () => {
    const dateInLastMonth = new Date("2024-01-20"); // Within last month from 2024-02-15
    expect(isWithinLastMonth(dateInLastMonth)).toBe(true);

    const todayDate = new Date("2024-02-15");
    expect(isWithinLastMonth(todayDate)).toBe(true);

    const almostMonthOld = new Date("2024-01-16"); // Just within a month
    expect(isWithinLastMonth(almostMonthOld)).toBe(true);
  });

  it("should return false for date older than a month", () => {
    const olderThanMonth = new Date("2024-01-14"); // More than a month old from 2024-02-15
    expect(isWithinLastMonth(olderThanMonth)).toBe(false);

    const muchOlderDate = new Date("2023-12-15"); // Two months old
    expect(isWithinLastMonth(muchOlderDate)).toBe(false);
  });

  it("should handle year transitions correctly", () => {
    vi.setSystemTime(new Date("2024-01-15"));

    const decemberDate = new Date("2023-12-20"); // Within last month
    expect(isWithinLastMonth(decemberDate)).toBe(true);

    const tooOldDecemberDate = new Date("2023-12-14"); // More than a month old
    expect(isWithinLastMonth(tooOldDecemberDate)).toBe(false);
  });
});
