import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDeadlineColorPalette,
  timeToDeadline,
} from "../../formatters/time-to-deadline";

describe("timeToDeadline", () => {
  it("should return 1 when the deadline is exactly 1 day from now", () => {
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day in the future
    expect(timeToDeadline(deadline)).toBe(1);
  });

  it("should return 2 when the deadline is more than 1 day from now", () => {
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2); // 2 days in the future
    expect(timeToDeadline(deadline)).toBe(2);
  });

  it("should return 0 when the deadline is today", () => {
    const deadline = new Date(); // current time
    expect(timeToDeadline(deadline)).toBe(0);
  });

  it("should return 0 when an exact-time deadline is later today", () => {
    const deadline = new Date();
    deadline.setHours(23, 59, 0, 0);
    expect(timeToDeadline(deadline)).toBe(0);
  });
});

describe("getDeadlineColorPalette", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return red when the deadline was before today", () => {
    expect(getDeadlineColorPalette(new Date("2026-05-07T23:59:00"))).toBe(
      "red",
    );
  });

  it("should return orange when the deadline is today", () => {
    expect(getDeadlineColorPalette(new Date("2026-05-08T23:59:00"))).toBe(
      "orange",
    );
  });

  it("should return blue when the deadline is tomorrow", () => {
    expect(getDeadlineColorPalette(new Date("2026-05-09T00:00:00"))).toBe(
      "blue",
    );
  });

  it("should not return a color when the deadline is later than tomorrow", () => {
    expect(
      getDeadlineColorPalette(new Date("2026-05-10T00:00:00")),
    ).toBeUndefined();
  });
});
