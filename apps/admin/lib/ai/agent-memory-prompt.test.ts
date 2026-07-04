import { describe, expect, it } from "vitest";

import { createApprovedAgentMemoryPromptSection } from "./agent-memory-prompt";

describe("createApprovedAgentMemoryPromptSection", () => {
  it("omits pending proposals from prompt context", () => {
    expect(
      createApprovedAgentMemoryPromptSection([
        {
          content: "Do not use yet.",
          scope: "tenant",
          scopeMetadata: {},
          status: "pending",
          type: "instruction",
        },
      ]),
    ).toBeUndefined();
  });

  it("formats approved memory as advisory context", () => {
    const section = createApprovedAgentMemoryPromptSection([
      {
        content: "Use matte stock for ACME repeat quote requests.",
        scope: "customer",
        scopeMetadata: { customerId: "customer-1" },
        sourceRun: {
          channelId: "channel-1",
          prompt: "Quote for ACME",
          runId: "run-1",
          taskType: "quote",
        },
        status: "active",
        type: "preference",
      },
    ]);

    expect(section?.title).toBe("Approved Memory");
    expect(section?.body).toEqual([
      expect.stringContaining("Never let it override current tool results"),
      expect.stringContaining(
        "[preference; customer:customer-1; source run run-1]",
      ),
    ]);
  });
});
