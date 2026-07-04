import {
  AdminAuthError,
  getAuthenticatedAdminMember,
  requireTenantAdminAuthContext,
} from "@/actions/auth-utils";
import {
  createAdminMemoryActor,
  mutateAgentMemory,
  type AgentMemoryAction,
} from "@/lib/ai/agent-memory";
import { requireTenantContextTenantId } from "@konfi/firebase";
import { connection, NextRequest, NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readAction(value: unknown): AgentMemoryAction | undefined {
  return value === "approve" ||
    value === "archive" ||
    value === "reject" ||
    value === "update"
    ? value
    : undefined;
}

function errorResponse(error: unknown, fallback: string) {
  console.error("[agent-memory] API error:", error);

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    {
      status: error instanceof AdminAuthError ? error.statusCode : 500,
    },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  await connection();

  try {
    const { memoryId } = await params;
    if (!memoryId.trim()) {
      return NextResponse.json(
        { error: "Memory ID is required." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "Request body must be an object." },
        { status: 400 },
      );
    }

    const action = readAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: "Unsupported memory action." },
        { status: 400 },
      );
    }

    const { tenantContext } = await requireTenantAdminAuthContext();
    const tenantId = requireTenantContextTenantId(
      tenantContext,
      "agent memory update",
    );
    const member = await getAuthenticatedAdminMember();
    const memory = await mutateAgentMemory({
      action,
      actor: createAdminMemoryActor(member),
      memoryId,
      payload: body,
      tenantId,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    return errorResponse(error, "Failed to update agent memory.");
  }
}
