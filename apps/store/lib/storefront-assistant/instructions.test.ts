import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";

import { buildStorefrontAssistantInstructions } from "./instructions";

describe("storefront assistant instructions", () => {
  it("adds enabled storefront overlays only", () => {
    const prompt = buildStorefrontAssistantInstructions(Locale.en, {
      capabilities: {
        adminAssistant: {
          enabled: true,
          instructions: "Use admin wording.",
        },
        printMethodResolution: {
          enabled: true,
          instructions: "Prefer UV for rigid boards.",
        },
        storefrontAssistant: {
          enabled: true,
          instructions: "Explain file preparation before product suggestions.",
        },
      },
    });

    expect(prompt).toContain("public storefront AI assistant");
    expect(prompt).toContain(
      "Explain file preparation before product suggestions.",
    );
    expect(prompt).not.toContain("Use admin wording.");
    expect(prompt).not.toContain("Prefer UV for rigid boards.");
  });
});
