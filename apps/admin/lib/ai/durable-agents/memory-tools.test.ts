import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  proposeAgentMemoryStep: vi.fn(),
  searchAgentMemoryStep: vi.fn(),
}));

vi.mock("./steps", () => ({
  proposeAgentMemoryStep: mocks.proposeAgentMemoryStep,
  searchAgentMemoryStep: mocks.searchAgentMemoryStep,
}));

import { createDurableAgentMemoryTools } from "./memory-tools";

describe("createDurableAgentMemoryTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.proposeAgentMemoryStep.mockResolvedValue({ success: true });
    mocks.searchAgentMemoryStep.mockResolvedValue({ memories: [] });
  });

  it("searches memory with the workflow tenant and task type", async () => {
    const tools = createDurableAgentMemoryTools({
      channelId: "channel-1",
      prompt: "Create a quote",
      taskType: "quote",
      tenantId: "tenant-1",
      workflowRunId: "run-1",
    });

    await tools.searchAgentMemory.execute({
      customerId: "customer-1",
      query: "matte paper",
    });

    expect(mocks.searchAgentMemoryStep).toHaveBeenCalledWith({
      channelId: "channel-1",
      customerId: "customer-1",
      query: "matte paper",
      taskType: "quote",
      tenantId: "tenant-1",
    });
  });

  it("defaults channel-scoped proposals to the current channel", async () => {
    const tools = createDurableAgentMemoryTools({
      channelId: "channel-1",
      prompt: "Create a quote",
      taskType: "quote",
      tenantId: "tenant-1",
      workflowRunId: "run-1",
    });

    await tools.proposeAgentMemory.execute({
      content: "Use matte stock for ACME quote requests.",
      rationale: "The admin corrected this during the run.",
      scope: "channel",
      type: "preference",
    });

    expect(mocks.proposeAgentMemoryStep).toHaveBeenCalledWith({
      channelId: "channel-1",
      content: "Use matte stock for ACME quote requests.",
      rationale: "The admin corrected this during the run.",
      scope: "channel",
      sourceRun: {
        channelId: "channel-1",
        prompt: "Create a quote",
        runId: "run-1",
        taskType: "quote",
      },
      taskTypes: ["quote"],
      tenantId: "tenant-1",
      type: "preference",
    });
  });
});
