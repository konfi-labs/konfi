import { describe, expect, it } from "vitest";
import {
  createMonthlyFeedPrompt,
  getMonthlyFeedSystemPrompt,
} from "./monthly-feed-prompt";

describe("monthly-feed-prompt", () => {
  it("steers monthly growth ideas away from weak trend-product pairings", () => {
    const prompt = getMonthlyFeedSystemPrompt(5);

    expect(prompt).toContain("clear product-market fit");
    expect(prompt).toContain("buyer segment");
    expect(prompt).toContain("admin action");
    expect(prompt).toContain("Do not suggest social-media stunts");
    expect(prompt).toContain("TikTok unboxing");
    expect(prompt).toContain("Do not force weak seasonal links");
    expect(prompt).toContain("not a product slogan");
    expect(prompt).toContain("idiomatic Polish");
  });

  it("keeps retry feedback attached to the monthly context", () => {
    const prompt = createMonthlyFeedPrompt(
      {
        periodKey: "2026-06",
        activeStoreProducts: [
          {
            id: "paper-bags",
            name: "Torby papierowe",
          },
        ],
      },
      ["Highlights relied on vague trend chasing."],
    );

    expect(prompt).toContain("Create a monthly growth feed entry");
    expect(prompt).toContain('"periodKey": "2026-06"');
    expect(prompt).toContain("Torby papierowe");
    expect(prompt).toContain("Highlights relied on vague trend chasing.");
    expect(prompt).toContain("Regenerate the whole entry");
  });
});
