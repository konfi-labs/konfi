import type { ImageGenerationWorkflowStatusResponse } from "@/actions/generate-images-workflow";
import { describe, expect, it } from "vitest";

import { generateProductImageOptions } from "./product-image-generation-workflows";

function shiftWorkflowStatus(
  responses: Map<string, ImageGenerationWorkflowStatusResponse[]>,
  runId: string,
): ImageGenerationWorkflowStatusResponse {
  const queue = responses.get(runId);

  if (!queue || queue.length <= 0) {
    throw new Error(`No workflow status queued for ${runId}.`);
  }

  const status = queue.shift();
  if (!status) {
    throw new Error(`No workflow status queued for ${runId}.`);
  }

  return status;
}

describe("generateProductImageOptions", () => {
  it("uses a single workflow by default", async () => {
    const responses = new Map<string, ImageGenerationWorkflowStatusResponse[]>([
      [
        "run-1",
        [
          { status: "running" },
          {
            status: "completed",
            result: {
              images: [
                {
                  id: "image-1",
                  storagePath: "ai/generated/accounts/admin/run-1.png",
                  url: "https://example.com/run-1.png",
                },
              ],
              chargedUsdCents: 12,
            },
          },
        ],
      ],
    ]);
    let nextRunIndex = 0;
    const runIds = ["run-1", "run-2"];
    const statusCalls: Array<{ runId: string; jobId?: string }> = [];

    const result = await generateProductImageOptions({
      startWorkflow: async () => ({
        runId: runIds[nextRunIndex++],
        jobId: "job-1",
      }),
      getWorkflowStatus: async (runId, jobId) => {
        statusCalls.push({ runId, jobId });
        return shiftWorkflowStatus(responses, runId);
      },
      pollTimeoutMs: 1_000,
      sleep: async () => undefined,
    });

    expect(nextRunIndex).toBe(1);
    expect(statusCalls).toEqual([
      { runId: "run-1", jobId: "job-1" },
      { runId: "run-1", jobId: "job-1" },
    ]);
    expect(result.images).toEqual([
      {
        id: "image-1",
        storagePath: "ai/generated/accounts/admin/run-1.png",
        url: "https://example.com/run-1.png",
      },
    ]);
    expect(result.filteredReasons).toEqual([]);
    expect(result.errorMessages).toEqual([]);
  });

  it("collects generated images from all requested workflows", async () => {
    const responses = new Map<string, ImageGenerationWorkflowStatusResponse[]>([
      [
        "run-1",
        [
          { status: "running" },
          {
            status: "completed",
            result: {
              images: [
                {
                  id: "image-1",
                  storagePath: "ai/generated/accounts/admin/run-1.png",
                  url: "https://example.com/run-1.png",
                },
              ],
              chargedUsdCents: 12,
            },
          },
        ],
      ],
      [
        "run-2",
        [
          { status: "pending" },
          {
            status: "completed",
            result: {
              images: [
                {
                  id: "image-2",
                  storagePath: "ai/generated/accounts/admin/run-2.png",
                  url: "https://example.com/run-2.png",
                },
              ],
              filteredReason: "One background variant was filtered.",
              chargedUsdCents: 12,
            },
          },
        ],
      ],
    ]);
    let nextRunIndex = 0;
    const runIds = ["run-1", "run-2"];

    const result = await generateProductImageOptions({
      workflowCount: 2,
      startWorkflow: async () => ({ runId: runIds[nextRunIndex++] }),
      getWorkflowStatus: async (runId) => shiftWorkflowStatus(responses, runId),
      pollTimeoutMs: 1_000,
      sleep: async () => undefined,
    });

    expect(nextRunIndex).toBe(2);
    expect(result.images).toEqual([
      {
        id: "image-1",
        storagePath: "ai/generated/accounts/admin/run-1.png",
        url: "https://example.com/run-1.png",
      },
      {
        id: "image-2",
        storagePath: "ai/generated/accounts/admin/run-2.png",
        url: "https://example.com/run-2.png",
      },
    ]);
    expect(result.filteredReasons).toEqual([
      "One background variant was filtered.",
    ]);
    expect(result.errorMessages).toEqual([]);
  });

  it("keeps successful images when one workflow fails", async () => {
    const responses = new Map<string, ImageGenerationWorkflowStatusResponse[]>([
      [
        "run-1",
        [
          {
            status: "completed",
            result: {
              images: [
                {
                  id: "image-1",
                  storagePath: "ai/generated/accounts/admin/run-1.png",
                  url: "https://example.com/run-1.png",
                },
              ],
              chargedUsdCents: 12,
            },
          },
        ],
      ],
      [
        "run-2",
        [
          {
            status: "failed",
            error: "Provider unavailable",
          },
        ],
      ],
    ]);
    let nextRunIndex = 0;
    const runIds = ["run-1", "run-2"];

    const result = await generateProductImageOptions({
      workflowCount: 2,
      startWorkflow: async () => ({ runId: runIds[nextRunIndex++] }),
      getWorkflowStatus: async (runId) => shiftWorkflowStatus(responses, runId),
      pollTimeoutMs: 1_000,
      sleep: async () => undefined,
    });

    expect(result.images).toEqual([
      {
        id: "image-1",
        storagePath: "ai/generated/accounts/admin/run-1.png",
        url: "https://example.com/run-1.png",
      },
    ]);
    expect(result.filteredReasons).toEqual([]);
    expect(result.errorMessages).toEqual(["Provider unavailable"]);
  });
});
