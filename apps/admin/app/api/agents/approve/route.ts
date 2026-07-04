import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  findAuthorizedAgentRunByPendingHookToken,
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import { quoteApprovalHook } from "@/lib/ai/durable-agents/hooks";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface ApprovalRequestBody {
  /** Workflow run id (agents/<runId>). Preferred for UI calls. */
  runId?: string;
  /** Hook token (toolCallId). Backward-compatible. */
  token?: string;
  approved: boolean;
  comment?: string;
  modifications?: {
    specialNotes?: string;
    removeItemIds?: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    // Parse request body
    const body: ApprovalRequestBody = await request.json();
    const { runId, token, approved, comment, modifications } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Bad Request: approved status required" },
        { status: 400 },
      );
    }

    // Resolve hook token (toolCallId). Prefer explicit token; otherwise look up pendingHookToken by runId.
    const runIdCandidate =
      typeof runId === "string" && runId.trim().length > 0 ? runId : undefined;

    let hookToken: string | undefined;
    let resolvedHookType = "quoteApproval";

    const authorizedRun = runIdCandidate
      ? await requireAuthorizedAgentRun({ auth, runId: runIdCandidate })
      : await findAuthorizedAgentRunByPendingHookToken({ auth, token });

    const pendingHookToken =
      typeof authorizedRun.data.pendingHookToken === "string"
        ? authorizedRun.data.pendingHookToken
        : undefined;
    const pendingHookTypeRaw = authorizedRun.data.pendingHookType;
    const pendingHookType =
      typeof pendingHookTypeRaw === "string" &&
      pendingHookTypeRaw.trim().length > 0
        ? pendingHookTypeRaw
        : undefined;

    // If we have a pending hook token in Firestore, it's authoritative.
    if (pendingHookToken) {
      hookToken = pendingHookToken;
    }

    // Only default to quoteApproval when the stored value is missing/invalid.
    resolvedHookType = pendingHookType ?? "quoteApproval";

    // Guardrail: this endpoint only handles approval-type hooks.
    // userConfirmation hooks should be resumed via /api/agents/respond.
    if (pendingHookType === "userConfirmation") {
      return NextResponse.json(
        {
          error: `Bad Request: pending hook type is userConfirmation — use /api/agents/respond instead`,
        },
        { status: 400 },
      );
    }

    if (!hookToken) {
      return NextResponse.json(
        {
          error:
            "Bad Request: hook token not found (no token provided and no pendingHookToken stored)",
        },
        { status: 400 },
      );
    }

    if (resolvedHookType !== "quoteApproval") {
      return NextResponse.json(
        { error: `Bad Request: unknown hook type "${resolvedHookType}"` },
        { status: 400 },
      );
    }

    const approvalMessage = {
      role: "user",
      content:
        typeof comment === "string" && comment.trim().length > 0
          ? comment
          : approved
            ? "Approved"
            : "Rejected",
    };

    await authorizedRun.agentRef.set(
      {
        status: "processing",
        pendingHookToken: FieldValue.delete(),
        pendingHookCreatedAt: FieldValue.delete(),
        pendingHookType: FieldValue.delete(),
        messages: FieldValue.arrayUnion(approvalMessage),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    try {
      await quoteApprovalHook.resume(hookToken, {
        approved,
        comment,
        modifications,
      });
    } catch (resumeError) {
      await authorizedRun.agentRef.set(
        {
          status: "awaiting-approval",
          pendingHookToken: hookToken,
          pendingHookCreatedAt: FieldValue.serverTimestamp(),
          pendingHookType: resolvedHookType,
          messages: FieldValue.arrayRemove(approvalMessage),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw resumeError;
    }

    return NextResponse.json({
      success: true,
      message: approved ? "Quote approved" : "Quote rejected",
    });
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("[Agent Approval API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
