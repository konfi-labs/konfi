import { describe, expect, it } from "vitest";
import { formatOrderPrintDate, toOrderPrintDate } from "./order-print-date";

describe("order print date formatting", () => {
  it("formats a timestamp-like deadline", () => {
    const formatted = formatOrderPrintDate(
      { toDate: () => new Date(2026, 5, 9, 14, 30) },
      {
        exactTime: true,
        locale: "en-US",
      },
    );

    expect(formatted).toContain("Tue");
    expect(formatted).toContain("Jun");
    expect(formatted).toContain("09");
    expect(formatted).toContain("02:30 PM");
  });

  it("falls back to deadlineString when the printed order lacks deadline", () => {
    expect(
      formatOrderPrintDate(null, {
        fallbackDateString: "2026-06-09",
        locale: "en-US",
      }),
    ).toContain("Jun 09");
  });

  it("parses date-only deadline strings as local dates", () => {
    expect(toOrderPrintDate(null, "2026-06-09")?.getDate()).toBe(9);
  });

  it("returns a placeholder when neither deadline source is printable", () => {
    expect(
      formatOrderPrintDate(null, {
        fallbackDateString: "not-a-date",
        locale: "en-US",
      }),
    ).toBe("-");
  });
});
