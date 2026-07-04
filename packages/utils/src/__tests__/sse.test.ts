import { describe, expect, it } from "vitest";
import { shouldFallbackToPolling } from "../sse";

describe("shouldFallbackToPolling", () => {
  it("returns false when finished", () => {
    const now = Date.now();
    expect(
      shouldFallbackToPolling({
        startedAt: now - 60000,
        finished: true,
        timeoutMs: 30000,
      }),
    ).toBe(false);
  });

  it("returns false when within timeout and events flowing", () => {
    const now = Date.now();
    expect(
      shouldFallbackToPolling({
        startedAt: now - 10000,
        lastEventAt: now - 5000,
        finished: false,
        timeoutMs: 30000,
      }),
    ).toBe(false);
  });

  it("returns true when exceeded timeout with no events", () => {
    const now = Date.now();
    expect(
      shouldFallbackToPolling({
        startedAt: now - 40000,
        finished: false,
        timeoutMs: 30000,
      }),
    ).toBe(true);
  });

  it("returns true when exceeded timeout since last event", () => {
    const now = Date.now();
    expect(
      shouldFallbackToPolling({
        startedAt: now - 60000,
        lastEventAt: now - 40000,
        finished: false,
        timeoutMs: 30000,
      }),
    ).toBe(true);
  });
});
