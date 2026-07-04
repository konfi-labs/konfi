import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import {
  requireAuthorizedAgentApiRequest,
  requireAuthorizedAgentRun,
} from "@/lib/ai/durable-agents/agent-run-auth";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

type AgentFeedbackValue = "positive" | "negative";

interface AgentFeedbackRequestBody {
  runId?: string;
  value?: AgentFeedbackValue | null;
}

function isAgentFeedbackValue(value: unknown): value is AgentFeedbackValue {
  return value === "positive" || value === "negative";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthorizedAgentApiRequest(request);

    const body = (await request.json()) as AgentFeedbackRequestBody;
    const runId = body.runId?.trim();

    if (!runId) {
      return NextResponse.json(
        { error: "Bad Request: runId is required" },
        { status: 400 },
      );
    }

    if (body.value !== null && !isAgentFeedbackValue(body.value)) {
      return NextResponse.json(
        { error: "Bad Request: value must be positive, negative, or null" },
        { status: 400 },
      );
    }

    const { agentRef } = await requireAuthorizedAgentRun({ auth, runId });

    if (body.value === null) {
      await agentRef.update({
        feedback: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, feedback: null });
    }

    const updatedBy = {
      id: auth.user.uid,
      ...(auth.user.email ? { email: auth.user.email } : {}),
      ...(auth.user.displayName ? { name: auth.user.displayName } : {}),
    };

    await agentRef.update({
      feedback: {
        value: body.value,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      feedback: {
        value: body.value,
        updatedBy,
      },
    });
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("[Agent Feedback API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
