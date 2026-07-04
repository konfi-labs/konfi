import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: () => () => "model",
}));

import { WHATS_NEW_CHANGE_KIND } from "@/lib/whats-new/types";
import { compactBenchmarkValue } from "./judge";

describe("compactBenchmarkValue", () => {
  it("preserves weekly What's New evidence without nested placeholders", () => {
    const compacted = compactBenchmarkValue({
      benchmarkType: "whats-new-weekly",
      result: {
        created: true,
        id: "weekly-2026-W18",
        kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
        output: {
          description: {
            en: "Reviewed 24 recent admin changes.",
            pl: "Przejrzano 24 ostatnie zmiany w panelu admina.",
          },
          highlightFeatures: [
            {
              category: {
                en: "Attributes",
                pl: "Atrybuty",
              },
              colorPalette: "primary",
              en: "A new attribute 'Cover Varnish' of type radio group has been created.",
              pl: "Utworzono nowy atrybut 'Lakier na okładkę' typu radio group.",
            },
          ],
          title: {
            en: "Weekly admin updates",
            pl: "Tygodniowe aktualizacje panelu",
          },
        },
        periodKey: "2026-W18",
        evaluationContext: {
          changeCount: 24,
          changes: [
            {
              description:
                "A new attribute 'Cover Varnish' of type radio group has been created.",
              entityType: "attributes",
              timestamp: "2026-05-03T10:00:00.000Z",
            },
          ],
          entityBreakdown: {
            attributes: 18,
            products: 6,
          },
          periodKey: "2026-W18",
        },
      },
    });

    const serialized = JSON.stringify(compacted);

    expect(serialized).not.toContain("[nested]");
    expect(serialized).toContain("Cover Varnish");
    expect(serialized).toContain("Reviewed 24 recent admin changes");
    expect(serialized).toContain("attributes");
  });
});
