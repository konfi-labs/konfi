import { describe, expect, it } from "vitest";

import {
  buildCompactProductContext,
  stripMarkdownLikeText,
} from "./context";

describe("product image context helpers", () => {
  it("strips markdown and html-like formatting", () => {
    expect(
      stripMarkdownLikeText(
        "## Premium banner\n**Bold** copy with [link](https://example.com) and <br /> spacing.",
      ),
    ).toBe("Premium banner Bold copy with link and spacing.");
  });

  it("builds a compact deduplicated context", () => {
    const context = buildCompactProductContext({
      name: "Premium Banner",
      category: { name: "Premium Banner" },
      productType: { name: "Large Format" },
      description:
        "## Premium banner\nPremium banner for events. Premium banner for events.",
      customSize: true,
      priceType: "matrix-pricing",
      spec: {
        minimumWidth: 100,
        maximumWidth: 300,
        minimumHeight: 80,
        maximumHeight: 200,
      },
      specialNotes: "Indoor use only. Indoor use only.",
    });

    expect(context).toContain("Premium Banner");
    expect(context).toContain("type: Large Format");
    expect(context).toContain("description: Premium banner Premium banner for events.");
    expect(context).toContain("notes: Indoor use only.");
    expect(context).not.toContain("category: Premium Banner");
    expect(context).not.toContain("attributes:");
    expect(context).not.toContain("size:");
    expect(context).not.toContain("pricing:");
  });
});