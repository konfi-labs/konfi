import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getVertexThinkingProviderOptions } from "./server-vertex";

describe("getVertexThinkingProviderOptions", () => {
  it("uses thinkingBudget for Gemini 2.5 models", () => {
    expect(
      getVertexThinkingProviderOptions(
        {
          includeThoughts: true,
          thinkingLevel: "minimal",
        },
        { modelId: "gemini-2.5-flash-lite" },
      ),
    ).toEqual({
      vertex: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 0,
        },
      },
    });
  });

  it("uses thinkingLevel for Gemini 3.1 Flash-Lite", () => {
    expect(
      getVertexThinkingProviderOptions(
        {
          includeThoughts: true,
          thinkingLevel: "minimal",
        },
        { modelId: "gemini-3.1-flash-lite" },
      ),
    ).toEqual({
      vertex: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "minimal",
        },
      },
    });
  });

  it("uses thinkingLevel for Gemini 3 models", () => {
    expect(
      getVertexThinkingProviderOptions(
        {
          includeThoughts: true,
          thinkingBudget: 2048,
          thinkingLevel: "high",
        },
        { modelId: "gemini-3.1-pro-preview" },
      ),
    ).toEqual({
      vertex: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "high",
        },
      },
    });
  });
});
