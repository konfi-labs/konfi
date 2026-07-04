import { describe, expect, it } from "vitest";

import {
  buildSuggestedProductImagePrompt,
  resolvePromptLanguageLabel,
} from "./prompt";

describe("product image prompt helpers", () => {
  it("resolves known language codes to human-readable names", () => {
    expect(resolvePromptLanguageLabel("pl")).toBe("Polish");
    expect(resolvePromptLanguageLabel("en")).toBe("English");
  });

  it("adds restrained pastel design guidance for design-led print products", () => {
    const prompt = buildSuggestedProductImagePrompt({
      name: "## Wizytówka premium",
      category: { name: "Wizytówki" },
      productType: { name: "Business cards" },
      description: "Minimalistyczna wizytówka dla nowoczesnej marki.",
      currentLanguage: "pl",
    });

    expect(prompt).toContain(
      "Create an ultra-realistic premium editorial product photo of the physical product described below.",
    );
    expect(prompt).toContain(
      "The entire image background must be plain white (#ffffff), including every corner and edge.",
    );
    expect(prompt).toContain(
      "Use this product context only to understand the product format, purpose, and how much visible graphic design belongs on the product. Never reproduce or closely paraphrase this source wording as printed text on the design:",
    );
    expect(prompt).toContain(
      "Keep the outer background pure #ffffff edge-to-edge",
    );
    expect(prompt).toContain(
      "design-led print products need a finished calm premium layout with large readable modern typography",
    );
    expect(prompt).toContain(
      "Avoid abstract placeholder blobs, random patterns, busy collage",
    );
    expect(prompt).toContain("Product context is not visible copy");
    expect(prompt).toContain("one to three short original Polish phrases");
    expect(prompt).toContain(
      "Render letters as clean contemporary sans-serif type, not gibberish, symbols, or abstract marks.",
    );
    expect(prompt).toContain("muted elegant contrast");
    expect(prompt.length).toBeLessThan(2300);
    expect(prompt).not.toContain("placeholder text");
  });

  it("keeps functional products restrained instead of forcing artwork onto them", () => {
    const prompt = buildSuggestedProductImagePrompt({
      name: "Decorative envelope",
      currentLanguage: "en",
    });

    expect(prompt).toContain("plain white (#ffffff)");
    expect(prompt).toContain(
      "Never reproduce or closely paraphrase this source wording as printed text on the design: Decorative envelope.",
    );
    expect(prompt).toContain(
      "functional utility products should stay restrained and mostly plain",
    );
    expect(prompt).not.toContain("generic placeholder text");
    expect(prompt).not.toContain("This product likely should remain text-free");
  });

  it("tells the model to preserve only structural reference details while redesigning artwork", () => {
    const prompt = buildSuggestedProductImagePrompt({
      name: "Wall calendar with tear-off strips",
      currentLanguage: "en",
    });

    expect(prompt).toContain(
      "If references are provided, use them only for material, shape, composition, or fixed structure.",
    );
    expect(prompt).toContain(
      "Do not copy reference artwork, branding, layout, text, or illustrations.",
    );
    expect(prompt).toContain(
      "calendar grids, tear-off strips, covers, backing cards, or header cards",
    );
    expect(prompt).toContain("redesign the editable printed face from scratch");
  });
});
