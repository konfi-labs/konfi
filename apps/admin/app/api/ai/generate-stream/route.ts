import {
  getAuthenticatedAdminUid,
  requireAdminAuth,
} from "@/actions/auth-utils";
import { streamAdminText } from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

interface GenerateStreamRequestBody {
  systemPrompt: string;
  context: string;
  modelId?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth();

    const body = (await request.json()) as GenerateStreamRequestBody;

    if (!body?.systemPrompt || !body?.context) {
      return NextResponse.json(
        { error: "Bad Request: systemPrompt and context are required" },
        { status: 400 },
      );
    }

    const { getVertexClient } = await import("@/lib/ai/server-vertex");
    const providerModelId = body.modelId ?? MODELS.GEMINI_3_FLASH;
    const vertex = await getVertexClient();
    const model = vertex(providerModelId);
    const [tenantContext, userId] = await Promise.all([
      getTenantContextForRequest(),
      getAuthenticatedAdminUid(),
    ]);

    const result = await streamAdminText({
      model,
      instructions: body.systemPrompt,
      messages: [{ role: "user", content: body.context }],
      maxRetries: 2,
      metering: {
        context: tenantContext,
        firestore: getAdminDb(),
        model: providerModelId,
        provider: "google-vertex",
        source: "admin-action",
        userId,
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[AI Generate Stream Error]:", error);

    if (error instanceof Error) {
      const status = error.message.includes("Unauthorized") ? 401 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
