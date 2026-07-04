import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

const mocks = vi.hoisted(() => ({
  mockDetectAttributePayloadStep: vi.fn(),
  mockDiscoverProviderEndpointsStep: vi.fn(),
  mockFetchEndpointJsonStep: vi.fn(),
  mockGenerateSchemaFromResponseStep: vi.fn(),
  mockUpdateExternalProviderStep: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/ai/durable-agents/external-provider-steps", () => ({
  detectAttributePayloadStep: mocks.mockDetectAttributePayloadStep,
  discoverProviderEndpointsStep: mocks.mockDiscoverProviderEndpointsStep,
  fetchEndpointJsonStep: mocks.mockFetchEndpointJsonStep,
  generateSchemaFromResponseStep: mocks.mockGenerateSchemaFromResponseStep,
  updateExternalProviderStep: mocks.mockUpdateExternalProviderStep,
}));

import { processExternalProviderWorkflow } from "./external-provider-workflow";

describe("processExternalProviderWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T02:00:01.000Z"));
    mocks.mockDiscoverProviderEndpointsStep.mockResolvedValue({ method: "none" });
    mocks.mockUpdateExternalProviderStep.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails fatally before running any step once the runtime limit is exceeded", async () => {
    await expect(
      processExternalProviderWorkflow({
        providerId: "provider-1",
        provider: {
          name: "Provider",
          baseUrl: "https://example.com",
          auth: { type: "none" },
        },
        workflowStartedAtMs: new Date("2026-01-01T00:00:00.000Z").getTime(),
      }),
    ).rejects.toBeInstanceOf(FatalError);

    expect(mocks.mockDiscoverProviderEndpointsStep).not.toHaveBeenCalled();
    expect(mocks.mockFetchEndpointJsonStep).not.toHaveBeenCalled();
    expect(mocks.mockGenerateSchemaFromResponseStep).not.toHaveBeenCalled();
    expect(mocks.mockUpdateExternalProviderStep).not.toHaveBeenCalled();
  });

  it("threads the original workflow start time into the discovery step", async () => {
    const workflowStartedAtMs = new Date("2026-01-01T01:00:00.000Z").getTime();

    await expect(
      processExternalProviderWorkflow({
        providerId: "provider-2",
        provider: {
          name: "Provider",
          baseUrl: "https://example.com",
          auth: { type: "none" },
        },
        workflowStartedAtMs,
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.mockDiscoverProviderEndpointsStep).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      requestHeaders: {},
      sampleProductId: undefined,
      workflowStartedAtMs,
    });
    expect(mocks.mockUpdateExternalProviderStep).toHaveBeenCalledOnce();
  });
});
