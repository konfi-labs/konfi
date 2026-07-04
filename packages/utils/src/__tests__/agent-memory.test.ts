import { describe, expect, it } from "vitest";

import {
  agentMemoryMatchesScope,
  normalizeAgentMemoryTaskTypes,
  validateAgentMemoryPayload,
  validateAgentMemorySearchPayload,
} from "../agent-memory";

describe("agent memory utilities", () => {
  it("normalizes supported memory task types and rejects invoice memory", () => {
    expect(normalizeAgentMemoryTaskTypes(["quote", "quote", "order"])).toEqual([
      "quote",
      "order",
    ]);
    expect(normalizeAgentMemoryTaskTypes(["invoice"])).toBeUndefined();
    expect(
      normalizeAgentMemoryTaskTypes([
        "quote",
        "order",
        "product",
        "autonomous",
        "extra",
      ]),
    ).toBeUndefined();
  });

  it("requires the matching metadata for scoped memory", () => {
    expect(
      validateAgentMemoryPayload({
        content: "Remember this customer prefers matte stock.",
        scope: "customer",
        taskTypes: ["quote"],
        type: "preference",
      }).errors,
    ).toContain('Memory scope "customer" is missing required metadata.');

    expect(
      validateAgentMemoryPayload({
        content: "Remember this customer prefers matte stock.",
        customerId: "customer-1",
        scope: "customer",
        taskTypes: ["quote"],
        type: "preference",
      }).value,
    ).toMatchObject({
      scope: "customer",
      scopeMetadata: { customerId: "customer-1" },
      taskTypes: ["quote"],
      type: "preference",
    });
  });

  it("validates semantic search input with supported task types only", () => {
    expect(
      validateAgentMemorySearchPayload({
        query: "paper preference",
        taskType: "invoice",
      }).errors,
    ).toContain("Search task type is not supported.");

    expect(
      validateAgentMemorySearchPayload({
        channelId: "channel-1",
        query: "paper preference",
        taskType: "product",
      }).value,
    ).toMatchObject({
      channelId: "channel-1",
      limit: 5,
      query: "paper preference",
      taskType: "product",
    });
  });

  it("matches tenant memory globally and scoped memory narrowly", () => {
    expect(agentMemoryMatchesScope("tenant", {}, {})).toBe(true);
    expect(
      agentMemoryMatchesScope(
        "channel",
        { channelId: "channel-1" },
        { channelId: "channel-1" },
      ),
    ).toBe(true);
    expect(
      agentMemoryMatchesScope(
        "channel",
        { channelId: "channel-1" },
        { channelId: "channel-2" },
      ),
    ).toBe(false);
  });
});
