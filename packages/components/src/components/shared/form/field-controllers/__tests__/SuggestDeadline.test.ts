import { formatShortcutDeadline } from "../SuggestDeadline";

describe("formatShortcutDeadline", () => {
  const date = new Date(2026, 4, 9, 14, 30);

  test("formats date-only shortcuts when exact time is disabled", () => {
    expect(formatShortcutDeadline(date, false)).toBe("2026-05-09");
  });

  test("keeps the current time when exact time is enabled", () => {
    expect(formatShortcutDeadline(date, true, "2026-05-12T16:45")).toBe(
      "2026-05-09T16:45",
    );
  });

  test("uses the default deadline time when exact time is enabled without a current time", () => {
    expect(formatShortcutDeadline(date, true)).toBe("2026-05-09T12:00");
  });
});
