import { describe, expect, it } from "vitest";

import {
  AI_INSTRUCTION_MAX_LENGTH,
  buildAiInstructionOverlaySection,
  getEnabledAiInstructionOverlay,
  normalizeAiInstructionSettings,
} from "../ai-instructions";

describe("ai instruction settings", () => {
  it("normalizes missing and blank capability overlays", () => {
    const settings = normalizeAiInstructionSettings({
      capabilities: {
        printMethodResolution: {
          enabled: true,
          instructions: "  Prefer UV for rigid boards.  ",
        },
        adminAssistant: {
          enabled: true,
          instructions: "   ",
        },
      },
    });

    expect(settings.capabilities.printMethodResolution.instructions).toBe(
      "Prefer UV for rigid boards.",
    );
    expect(settings.capabilities.adminAssistant.instructions).toBe("");
    expect(settings.capabilities.storefrontAssistant).toEqual({
      enabled: false,
      instructions: "",
    });
  });

  it("does not return disabled or blank overlays", () => {
    const settings = normalizeAiInstructionSettings({
      capabilities: {
        printMethodResolution: {
          enabled: false,
          instructions: "Use sublimation for mugs.",
        },
        adminAssistant: {
          enabled: true,
          instructions: "",
        },
        storefrontAssistant: {
          enabled: true,
          instructions: "Explain file prep first.",
        },
      },
    });

    expect(
      getEnabledAiInstructionOverlay(settings, "printMethodResolution"),
    ).toBeUndefined();
    expect(
      getEnabledAiInstructionOverlay(settings, "adminAssistant"),
    ).toBeUndefined();
    expect(
      getEnabledAiInstructionOverlay(settings, "storefrontAssistant"),
    ).toBe("Explain file prep first.");
  });

  it("truncates overlong overlays", () => {
    const settings = normalizeAiInstructionSettings({
      capabilities: {
        printMethodResolution: {
          enabled: true,
          instructions: "x".repeat(AI_INSTRUCTION_MAX_LENGTH + 10),
        },
      },
    });

    expect(
      settings.capabilities.printMethodResolution.instructions,
    ).toHaveLength(AI_INSTRUCTION_MAX_LENGTH);
  });

  it("builds a guarded prompt section for enabled overlays", () => {
    const section = buildAiInstructionOverlaySection(
      {
        capabilities: {
          printMethodResolution: {
            enabled: true,
            instructions: "Prefer large format for banners.",
          },
          adminAssistant: {
            enabled: false,
            instructions: "",
          },
          storefrontAssistant: {
            enabled: false,
            instructions: "",
          },
        },
      },
      "printMethodResolution",
    );

    expect(section).toContain("Channel AI instruction overlay");
    expect(section).toContain("do not override platform safety rules");
    expect(section).toContain("Prefer large format for banners.");
  });
});
