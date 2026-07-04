import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  getMonthPeriodKey,
  getWeekPeriodKey,
  mergeWhatsNewChanges,
  normalizeWhatsNewChange,
} from "./feed-utils";
import { WHATS_NEW_CHANGE_KIND, WHATS_NEW_CHANGE_SOURCE } from "./types";

describe("feed-utils", () => {
  it("builds stable UTC week keys", () => {
    expect(getWeekPeriodKey(new Date("2026-04-08T09:00:00.000Z"))).toBe(
      "2026-W15",
    );
  });

  it("builds stable UTC month keys", () => {
    expect(getMonthPeriodKey(new Date("2026-04-08T09:00:00.000Z"))).toBe(
      "2026-04",
    );
  });

  it("normalizes missing metadata for manual entries", () => {
    const change = normalizeWhatsNewChange({
      id: "manual",
      timestamp: "2026-04-01T00:00:00.000Z",
      title: { [Locale.en]: "Release" },
      description: { [Locale.en]: "Added a feature." },
    });

    expect(change.kind).toBe(WHATS_NEW_CHANGE_KIND.MANUAL);
    expect(change.source).toBe(WHATS_NEW_CHANGE_SOURCE.MANUAL);
    expect(change.title[Locale.pl]).toBe("Release");
    expect(change.description[Locale.pl]).toBe("Added a feature.");
  });

  it("merges generated and manual items in descending timestamp order", () => {
    const merged = mergeWhatsNewChanges(
      [
        {
          id: "manual-1",
          timestamp: "2026-04-01T00:00:00.000Z",
          title: { [Locale.en]: "Manual 1", [Locale.pl]: "Manual 1" },
          description: { [Locale.en]: "Manual 1", [Locale.pl]: "Manual 1" },
        },
      ],
      [
        {
          id: "generated-1",
          timestamp: "2026-04-08T00:00:00.000Z",
          title: { [Locale.en]: "Generated 1", [Locale.pl]: "Generated 1" },
          description: {
            [Locale.en]: "Generated 1",
            [Locale.pl]: "Generated 1",
          },
          kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
          source: WHATS_NEW_CHANGE_SOURCE.AI,
        },
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["generated-1", "manual-1"]);
  });
});
