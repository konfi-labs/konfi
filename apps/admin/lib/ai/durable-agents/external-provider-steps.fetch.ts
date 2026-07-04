import "server-only";

import {
  createWorkflowRuntimeDeadline,
  fetchWithinWorkflowRuntime,
  WorkflowRuntimeLimitError,
} from "@/lib/workflow-runtime-limit";
import { fetchExternalProviderUrl } from "@/lib/external-products/provider-url-policy";
import { FatalError, RetryableError } from "workflow";

export async function fetchEndpointJsonStep({
  url,
  headers,
  workflowStartedAtMs,
}: {
  url: string;
  headers?: Record<string, string>;
  workflowStartedAtMs?: number;
}): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
}> {
  "use step";

  const runtimeDeadline =
    typeof workflowStartedAtMs === "number"
      ? createWorkflowRuntimeDeadline(workflowStartedAtMs)
      : undefined;

  try {
    const response = await fetchExternalProviderUrl(
      url,
      {
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      {
        fetchImpl: (input, init) =>
          fetchWithinWorkflowRuntime(
            runtimeDeadline,
            "fetching external provider endpoint data",
            input,
            init,
          ),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new RetryableError("Rate limited while fetching endpoint", {
          retryAfter: "5m",
        });
      }

      if (response.status >= 500) {
        throw new RetryableError(
          `Upstream error while fetching endpoint (HTTP ${response.status})`,
          { retryAfter: "1m" },
        );
      }

      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text) as unknown;
      return { success: true, data, status: response.status };
    } catch {
      return {
        success: false,
        status: response.status,
        error: "Response was not valid JSON",
      };
    }
  } catch (error) {
    console.error("Error fetching from endpoint:", error);
    if (error instanceof WorkflowRuntimeLimitError) {
      throw new FatalError(error.message);
    }
    if (error instanceof RetryableError) {
      throw error;
    }

    throw new RetryableError(
      error instanceof Error ? error.message : "Unknown error",
      { retryAfter: "1m" },
    );
  }
}
