import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import { stopAgentWorkflowRunIfActive } from "@/lib/ai/durable-agents/workflow-stop";

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface RemoveRequestBody {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    const body: RemoveRequestBody = await request.json();
    const { runId } = body;

    const authorizedRun = await requireAuthorizedAgentRun({ auth, runId });

    const stopResult = await stopAgentWorkflowRunIfActive(authorizedRun.runId);

    await authorizedRun.agentRef.delete();

    return NextResponse.json({
      success: true,
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

    console.error("[Agent Remove API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
