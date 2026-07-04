import { describe, expect, it } from "vitest";
import {
  normalizeExternalDeliveryTime,
  resolveExternalDeliveryTime,
} from "./delivery-time";

describe("normalizeExternalDeliveryTime", () => {
  it("rounds day-based values up to whole days", () => {
    expect(normalizeExternalDeliveryTime(2)).toBe(2);
    expect(normalizeExternalDeliveryTime("2.2 days")).toBe(3);
    expect(normalizeExternalDeliveryTime("3 dni robocze")).toBe(3);
  });

  it("converts hour-based values into days", () => {
    expect(normalizeExternalDeliveryTime("24h")).toBe(1);
    expect(normalizeExternalDeliveryTime("25 godzin")).toBe(2);
  });

  it("resolves absolute date strings into days when the schema marks them as dates", () => {
    expect(
      resolveExternalDeliveryTime("2026-04-13T00:00:00.000Z", {
        format: "date-string",
        now: new Date("2026-04-10T00:00:00.000Z"),
      }),
    ).toBe(3);
  });

  it("heuristically resolves ISO delivery dates even without an explicit format", () => {
    expect(
      resolveExternalDeliveryTime("2026-04-11T12:00:00.000Z", {
        now: new Date("2026-04-10T00:00:00.000Z"),
      }),
    ).toBe(2);
  });

  it("resolves unix timestamps when the learned schema marks them explicitly", () => {
    expect(
      resolveExternalDeliveryTime(
        new Date("2026-04-12T00:00:00.000Z").getTime() / 1000,
        {
        format: "unix-seconds",
        now: new Date("2026-04-10T00:00:00.000Z"),
        },
      ),
    ).toBe(2);
  });
});
