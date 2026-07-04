import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
} from "@ai-sdk/workflow";
import type { UIMessageChunk } from "ai";
import { connection, NextRequest } from "next/server";
import { getRun } from "workflow/api";
import { WorkflowRunNotFoundError } from "workflow/errors";

export const maxDuration = 300;

/**
 * GET /api/agents/[runId]/stream?startIndex={n}
 *
 * Streams workflow model-call parts as UIMessageChunk NDJSON.
 * The x-workflow-stream-tail-index header carries the resolved tail position
 * so the client can reconnect with a positive startIndex on retry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  await connection();

  const { runId } = await params;
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);
    await requireAuthorizedAgentRun({ auth, runId });
  } catch (error) {
    if (isAgentApiError(error)) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw error;
  }

  const rawStartIndex = request.nextUrl.searchParams.get("startIndex");
  const startIndex = rawStartIndex ? parseInt(rawStartIndex, 10) : 0;
  const resolvedStartIndex = Number.isNaN(startIndex) ? 0 : startIndex;

  const run = getRun(runId);
  const workflowRunExists = await run.exists;
  if (!workflowRunExists) {
    return new Response(
      JSON.stringify({ error: "Workflow run not found", runId }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const readable = run.getReadable<ModelCallStreamPart>({
    startIndex: resolvedStartIndex,
  });

  let tailIndex: number;
  try {
    tailIndex = await readable.getTailIndex();
  } catch (error) {
    if (!WorkflowRunNotFoundError.is(error)) {
      throw error;
    }

    return new Response(
      JSON.stringify({ error: "Workflow run not found", runId: error.runId }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();
  const ndjsonStream = readable
    .pipeThrough(createModelCallToUIChunkTransform())
    .pipeThrough(
      new TransformStream<UIMessageChunk, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
        },
      }),
    );

  return new Response(ndjsonStream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "x-workflow-stream-tail-index": String(tailIndex),
    },
  });
}
