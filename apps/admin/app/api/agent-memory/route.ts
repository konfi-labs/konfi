import {
  AdminAuthError,
  getAuthenticatedAdminMember,
  requireTenantAdminAuthContext,
} from "@/actions/auth-utils";
import {
  createAdminAgentMemory,
  createAdminMemoryActor,
  listAgentMemories,
  searchAgentMemories,
} from "@/lib/ai/agent-memory";
import { requireTenantContextTenantId } from "@konfi/firebase";
import {
  normalizeAgentMemoryScope,
  normalizeAgentMemoryStatus,
  normalizeAgentMemoryType,
  normalizeAgentTaskType,
  validateAgentMemoryPayload,
} from "@konfi/utils";
import { connection, NextRequest, NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readOptionalId(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

export async function GET(request: NextRequest) {
  await connection();

  try {
    const { tenantContext } = await requireTenantAdminAuthContext();
    const tenantId = requireTenantContextTenantId(
      tenantContext,
      "agent memory read",
    );
    const searchParams = request.nextUrl.searchParams;
    const status = normalizeAgentMemoryStatus(searchParams.get("status"));
    const type = normalizeAgentMemoryType(searchParams.get("type"));
    const scope = normalizeAgentMemoryScope(searchParams.get("scope"));
    const taskType = normalizeAgentTaskType(searchParams.get("taskType"));
    const query = searchParams.get("query")?.trim() || undefined;
    const limit = readPositiveInt(searchParams.get("limit"));
    const semantic = searchParams.get("semantic") === "true";

    if (semantic) {
      if (!query || !taskType || taskType === "invoice") {
        return NextResponse.json(
          { error: "Semantic search requires query and supported taskType." },
          { status: 400 },
        );
      }

      const memories = await searchAgentMemories({
        channelId: readOptionalId(searchParams.get("channelId")),
        customerId: readOptionalId(searchParams.get("customerId")),
        limit,
        orderId: readOptionalId(searchParams.get("orderId")),
        productId: readOptionalId(searchParams.get("productId")),
        query,
        quoteId: readOptionalId(searchParams.get("quoteId")),
        taskType,
        tenantId,
      });

      return NextResponse.json({ memories });
    }

    const memories = await listAgentMemories({
      limit,
      query,
      scope,
      status,
      taskType,
      tenantId,
      type,
    });

    return NextResponse.json({ memories });
  } catch (error) {
    return errorResponse(error, "Failed to list agent memory.");
  }
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const { tenantContext } = await requireTenantAdminAuthContext();
    const tenantId = requireTenantContextTenantId(
      tenantContext,
      "agent memory create",
    );
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "Request body must be an object." },
        { status: 400 },
      );
    }

    const validation = validateAgentMemoryPayload(body);
    if (!validation.value) {
      return NextResponse.json(
        { error: validation.errors.join(" ") },
        { status: 400 },
      );
    }

    const member = await getAuthenticatedAdminMember();
    const memory = await createAdminAgentMemory({
      actor: createAdminMemoryActor(member),
      payload: validation.value,
      tenantId,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to create agent memory.");
  }
}
