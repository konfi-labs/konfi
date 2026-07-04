import { describe, expect, it } from "vitest";

import { buildAdminAssistantSystemPrompt } from "./admin-assistant-prompt";

describe("admin assistant prompt", () => {
  it("adds enabled admin assistant overlays before final guardrails", () => {
    const prompt = buildAdminAssistantSystemPrompt({
      clientSystemPrompt: "Client prompt.",
      defaultSystemPrompt: "Default prompt.",
      finalAnswerGuardrail: "Final guardrail.",
      settings: {
        capabilities: {
          adminAssistant: {
            enabled: true,
            instructions: "Use concise operational language.",
          },
          printMethodResolution: {
            enabled: true,
            instructions: "Prefer UV for rigid boards.",
          },
          storefrontAssistant: {
            enabled: false,
            instructions: "",
          },
        },
      },
    });

    expect(prompt).toContain("Client prompt.");
    expect(prompt).toContain("Default prompt.");
    expect(prompt).toContain("Use concise operational language.");
    expect(prompt).not.toContain("Prefer UV for rigid boards.");
    expect(prompt.indexOf("Use concise operational language.")).toBeLessThan(
      prompt.indexOf("Final guardrail."),
    );
  });
});
