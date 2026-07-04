import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openNewTabWithDelay } from "../index";

describe("openNewTabWithDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.window.open = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should open a new tab after the specified delay", () => {
    const url = "https://example.com";
    const delay = 3000;

    openNewTabWithDelay(url, delay);

    // Should not open immediately
    expect(window.open).not.toHaveBeenCalled();

    // Fast-forward time
    vi.advanceTimersByTime(delay);

    // Should now have opened
    expect(window.open).toHaveBeenCalledWith(url, "_blank");
    expect(window.open).toHaveBeenCalledTimes(1);
  });

  it("should handle different delay times", () => {
    const url = "https://example.com";
    const delay = 5000;

    openNewTabWithDelay(url, delay);

    // Should not open before delay
    vi.advanceTimersByTime(4999);
    expect(window.open).not.toHaveBeenCalled();

    // Should open after delay
    vi.advanceTimersByTime(1);
    expect(window.open).toHaveBeenCalledWith(url, "_blank");
  });
});
