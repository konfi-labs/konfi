import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import { mergeAgentMessagesForPersistence } from "@/lib/ai/durable-agents/steps";
import { FieldValue } from "firebase-admin/firestore";
import { getRun } from "workflow/api";
import { WorkflowRunNotFoundError } from "workflow/errors";
import { connection, NextRequest, NextResponse } from "next/server";

/**
 * Recursively remove undefined values from an object
 * Firestore doesn't allow undefined values
 */
function removeUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned;
  }

  return obj;
}

function isTerminalAgentStatus(status: string | undefined): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "approved" ||
    status === "rejected"
  );
}

/**
 * GET /api/agents/status?runId=xxx
 * Check the status of a workflow run
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    // Get runId from query params
    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId parameter" },
        { status: 400 },
      );
    }

    const { agentRef, data: agentData } = await requireAuthorizedAgentRun({
      auth,
      runId,
    });
    const storedAgentStatus =
      typeof agentData?.status === "string" ? agentData.status : undefined;

    // Get the workflow run
    const run = getRun(runId);
    const workflowRunExists = await run.exists;
    if (!workflowRunExists) {
      const errorMessage = `Workflow run ${runId} was not found in the local workflow world.`;
      const agentStatus = isTerminalAgentStatus(storedAgentStatus)
        ? storedAgentStatus
        : "failed";

      if (!isTerminalAgentStatus(storedAgentStatus)) {
        await agentRef.set(
          {
            status: agentStatus,
            workflowStatus: "not_found",
            error: errorMessage,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      return NextResponse.json({
        runId,
        status: agentStatus,
        workflowStatus: "not_found",
        workflowName: null,
        createdAt: null,
        completedAt: null,
        result: agentData?.result ?? null,
        messages: Array.isArray(agentData?.messages)
          ? agentData.messages
          : null,
        fileMetadata: agentData?.fileMetadata,
        stepsCount: agentData?.stepsCount ?? null,
        error: errorMessage,
      });
    }

    // Get status (this is a promise)
    const status = await run.status;
    const workflowName = await run.workflowName;
    const createdAt = await run.createdAt;
    const completedAt = await run.completedAt;

    const hasPendingHook =
      typeof agentData?.pendingHookToken === "string" &&
      agentData.pendingHookToken.length > 0;

    // Map workflow status to agent status
    let agentStatus: string;
    switch (status) {
      case "pending":
        agentStatus = "pending";
        break;
      case "running":
        agentStatus = hasPendingHook ? "awaiting-approval" : "processing";
        break;
      case "completed":
        agentStatus = "completed";
        break;
      case "failed":
        agentStatus = "failed";
        break;
      case "cancelled":
        agentStatus = "failed";
        break;
      default:
        agentStatus = hasPendingHook ? "awaiting-approval" : "processing";
    }

    // If completed, try to get the return value
    let result = null;
    if (status === "completed") {
      try {
        result = await run.returnValue;
      } catch {
        // Return value might not be available
      }
    } else if (agentData?.result) {
      result = agentData.result;
    }

    // Extract messages from result if available
    let messages: unknown = null;
    let workflowMessages: unknown[] | null = null;
    let steps = null;
    if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      if (Array.isArray(resultObj.messages)) {
        workflowMessages = resultObj.messages;
      }
      if (typeof resultObj.steps === "number") {
        steps = resultObj.steps;
      }
    }

    if (workflowMessages) {
      messages = mergeAgentMessagesForPersistence(
        agentData?.messages,
        workflowMessages,
      );
    } else if (agentData?.messages && Array.isArray(agentData.messages)) {
      messages = agentData.messages;
    }

    // Persist latest status to Firestore
    try {
      const updateData: Record<string, unknown> = {
        status: agentStatus,
        workflowStatus: status,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (status === "completed") {
        updateData.completedAt = FieldValue.serverTimestamp();
      }

      if (result) {
        // Clean the result to remove undefined values before saving to Firestore
        updateData.result = removeUndefined(result);
      }

      // Store messages separately for easier retrieval
      if (messages) {
        updateData.messages = removeUndefined(messages);
      }

      if (steps !== null) {
        updateData.stepsCount = steps;
      }

      await agentRef.set(updateData, { merge: true });
    } catch (error) {
      console.error("[Agents Status] Failed to persist status", error);
    }

    return NextResponse.json({
      runId,
      status: agentStatus,
      workflowStatus: status,
      workflowName,
      createdAt,
      completedAt,
      result,
      messages,
      fileMetadata: agentData?.fileMetadata,
      stepsCount: steps,
    });
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    if (WorkflowRunNotFoundError.is(error)) {
      return NextResponse.json(
        {
          error: "Workflow run not found",
          runId: error.runId,
          status: "failed",
          workflowStatus: "not_found",
        },
        { status: 404 },
      );
    }

    console.error("[Agents Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to get workflow status" },
      { status: 500 },
    );
  }
}
