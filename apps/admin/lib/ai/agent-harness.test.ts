import { describe, expect, it } from "vitest";

import {
  buildAgentHarnessSystemPrompt,
  createAgentFormInteraction,
} from "./agent-harness";

describe("agent harness helpers", () => {
  it("builds prompts with deterministic-boundary and interface-neutral rules", () => {
    const prompt = buildAgentHarnessSystemPrompt({
      language: "Polish",
      role: "a test agent",
      rules: ["Use tools for durable work."],
      workflow: ["Inspect state.", "Act safely."],
    });

    expect(prompt).toContain("Do not parse model prose with regex");
    expect(prompt).toContain("tasks page, assistant chat, sidebar");
    expect(prompt).toContain("Use ground-truth tool results");
  });

  it("creates json-render-style form interactions with prefilled data", () => {
    const catalogSetupPlan = {
      attributes: [{ id: "paper", name: "Paper" }],
    };

    const interaction = createAgentFormInteraction({
      body: "Review the proposed catalog changes.",
      fields: [
        {
          id: "catalogSetupPlan",
          kind: "json",
          label: "Catalog setup plan",
          required: true,
          value: catalogSetupPlan,
        },
      ],
      submitLabel: "Approve plan",
      title: "Catalog setup",
    });

    expect(interaction.version).toBe("konfi.agent-interaction.v1");
    expect(interaction.kind).toBe("form");
    expect(interaction.fields?.[0]?.value).toEqual(catalogSetupPlan);
    expect(interaction.actions?.[0]?.intent).toBe("submit");
  });
});
