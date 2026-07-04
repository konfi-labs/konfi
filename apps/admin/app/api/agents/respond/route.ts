import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import {
  ProductAgentCatalogSetupPlan,
  quoteApprovalHook,
  userConfirmationHook,
} from "@/lib/ai/durable-agents/hooks";
import { getLatestPendingAgentHook } from "@/lib/ai/durable-agents/pending-hooks";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";

export const maxDuration = 120;

interface RespondRequestBody {
  catalogSetupPlan?: ProductAgentCatalogSetupPlan;
  runId: string;
  response: string;
  confirmed?: boolean; // For confirmation responses
  approved?: boolean; // For quote approval responses
  toolCallId?: string; // Hook token (toolCallId) for resume
  modifications?: {
    specialNotes?: string;
    removeItemIds?: string[];
  };
}

/**
 * POST /api/agents/respond
 * Continue a workflow with a user response to an agent question.
 *
 * Workflow runs remain in status "running" while waiting on a hook.
 * We only allow responses when we have a pending hook token for this run.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    // Parse request body
    const body: RespondRequestBody = await request.json();
    const {
      runId,
      response,
      confirmed,
      approved,
      toolCallId,
      modifications,
      catalogSetupPlan,
    } = body;

    if (!runId || !response?.trim()) {
      return NextResponse.json(
        { error: "Bad Request: runId and response required" },
        { status: 400 },
      );
    }

    const authorizedRun = await requireAuthorizedAgentRun({ auth, runId });
    const agentData = authorizedRun.data;

    // Check the workflow status
    const run = getRun(runId);
    const workflowStatus = await run.status;

    console.log(
      `[Agent Respond] runId=${runId}, workflowStatus=${workflowStatus}, pendingHookToken=${agentData.pendingHookToken}, pendingHookType=${agentData.pendingHookType}`,
    );

    // Check if we have a pending hook token - if so, try to resume regardless of workflow status
    // The workflow status might lag behind or be "running" while waiting at the hook
    const hasPendingHook =
      typeof agentData.pendingHookToken === "string" &&
      agentData.pendingHookToken.length > 0;
    const hookType =
      agentData.pendingHookType === "userConfirmation" ||
      agentData.pendingHookType === "quoteApproval"
        ? agentData.pendingHookType
        : undefined;
    const latestHookCall = getLatestPendingAgentHook(agentData.messages);
    const resolvedHookType = hookType ?? latestHookCall?.hookType;

    // Only resume when Firestore still marks the run as waiting on a hook.
    // An explicit toolCallId from stale UI state must not be enough on its own,
    // otherwise users can accidentally resume an already-consumed hook.
    if (hasPendingHook) {
      // Find the hook token (toolCallId). Prefer the stored pending hook token,
      // then fall back to the explicit payload or message log if needed.
      const hookToken =
        (typeof agentData.pendingHookToken === "string"
          ? agentData.pendingHookToken
          : null) ||
        toolCallId ||
        latestHookCall?.toolCallId;

      console.log(
        `[Agent Respond] hookToken=${hookToken}, hookType=${resolvedHookType ?? hookType}, response=${response}`,
      );

      if (!hookToken) {
        return NextResponse.json(
          { error: "Hook token not found for this run" },
          { status: 400 },
        );
      }

      if (resolvedHookType === "quoteApproval" && approved === undefined) {
        return NextResponse.json(
          { error: "Bad Request: approved boolean required" },
          { status: 400 },
        );
      }

      if (resolvedHookType !== "quoteApproval" && confirmed === undefined) {
        return NextResponse.json(
          { error: "Bad Request: confirmed boolean required" },
          { status: 400 },
        );
      }

      const resumeApproved = approved ?? false;
      const resumeConfirmed = confirmed ?? false;

      const userMessage = {
        role: "user",
        content: response,
      };

      await authorizedRun.agentRef.set(
        {
          status: "processing",
          pendingHookToken: FieldValue.delete(),
          pendingHookCreatedAt: FieldValue.delete(),
          pendingHookType: FieldValue.delete(),
          messages: FieldValue.arrayUnion(userMessage),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Resume the appropriate hook based on hookType
      try {
        if (resolvedHookType === "quoteApproval") {
          console.log(
            `[Agent Respond] Calling quoteApprovalHook.resume(${hookToken}, approved=${resumeApproved})`,
          );
          const resumeResult = await quoteApprovalHook.resume(hookToken, {
            approved: resumeApproved,
            comment: response,
            modifications: modifications,
          });
          console.log(
            `[Agent Respond] Quote approval resume result:`,
            resumeResult,
          );
        } else {
          console.log(
            `[Agent Respond] Calling userConfirmationHook.resume(${hookToken}, confirmed=${resumeConfirmed})`,
          );
          const resumeResult = await userConfirmationHook.resume(hookToken, {
            ...(catalogSetupPlan ? { catalogSetupPlan } : {}),
            confirmed: resumeConfirmed,
            response: response,
          });
          console.log(
            `[Agent Respond] User confirmation resume result:`,
            resumeResult,
          );
        }
      } catch (resumeError) {
        console.error(`[Agent Respond] Resume error:`, resumeError);
        await authorizedRun.agentRef.set(
          {
            status: "awaiting-approval",
            pendingHookToken: hookToken,
            pendingHookCreatedAt: FieldValue.serverTimestamp(),
            pendingHookType: resolvedHookType ?? "userConfirmation",
            messages: FieldValue.arrayRemove(userMessage),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        // If resume fails, the hook might not exist yet - return a retry-able error
        return NextResponse.json(
          { error: "Hook not ready yet, please retry", retryable: true },
          { status: 503 },
        );
      }

      return NextResponse.json({
        success: true,
        resumed: true,
        message: "Workflow resumed with user response",
      });
    }

    // If not paused and no pending hook, do not create a new run or reuse an
    // old hook token from stale UI state.
    return NextResponse.json(
      {
        success: false,
        resumed: false,
        message: `Workflow is ${workflowStatus} and not awaiting input. Wait until the agent asks for confirmation.`,
      },
      { status: 409 },
    );
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("[Agent Respond API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
