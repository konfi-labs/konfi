import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import { stopAgentWorkflowRunIfActive } from "@/lib/ai/durable-agents/workflow-stop";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface CancelRequestBody {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    const body: CancelRequestBody = await request.json();
    const { runId } = body;

    const authorizedRun = await requireAuthorizedAgentRun({ auth, runId });

    const stopResult = await stopAgentWorkflowRunIfActive(authorizedRun.runId);

    await authorizedRun.agentRef.set(
      {
        status: "failed",
        error: "Cancelled by user",
        pendingHookToken: FieldValue.delete(),
        pendingHookCreatedAt: FieldValue.delete(),
        pendingHookType: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      success: true,
      status: "cancelled",
      workflowStopStatus: stopResult.status,
      workflowStatus: stopResult.workflowStatus,
    });
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("[Agent Cancel API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
