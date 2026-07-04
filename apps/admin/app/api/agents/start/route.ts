import {
  getAdminDb,
  getTenantContextForRequest,
  isAdmin,
  verifyIdToken,
} from "@/lib/firebase/serverApp";
import { sanitizeAgentFileMetadata } from "@/lib/ai/durable-agents/file-metadata";
import {
  getWorkflow,
  isTaskTypeSupported,
} from "@/lib/ai/durable-agents/registry";
import { requireTenantContextTenantId } from "@konfi/firebase";
import type { Attribute, NestedMember } from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

export const maxDuration = 120;

interface AgentStartRequestBody {
  taskType: string;
  prompt: string;
  channelId: string;
  createdBy: NestedMember;
  attributes?: Attribute[];
  fileMetadata?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "Agent manual runs are only available in development" },
        { status: 403 },
      );
    }

    // Get authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const idToken = authHeader.replace("Bearer ", "");

    // Verify admin status
    const adminVerified = await isAdmin(idToken);
    if (!adminVerified) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    // Verify user exists
    const user = await verifyIdToken(idToken);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    // Parse request body
    const body: AgentStartRequestBody = await request.json();
    const {
      taskType,
      prompt,
      channelId,
      createdBy,
      attributes = [],
      fileMetadata: rawFileMetadata,
    } = body;
    const fileMetadata = sanitizeAgentFileMetadata(rawFileMetadata);
    const tenantContext = await getTenantContextForRequest();
    const tenantId = requireTenantContextTenantId(
      tenantContext,
      "manual agent start",
    );

    if (!taskType || !prompt || !channelId || !createdBy) {
      return NextResponse.json(
        {
          error:
            "Bad Request: taskType, prompt, channelId, and createdBy required",
        },
        { status: 400 },
      );
    }

    // Validate task type against registry
    if (!isTaskTypeSupported(taskType)) {
      return NextResponse.json(
        { error: `Not Implemented: task type "${taskType}" is not supported` },
        { status: 501 },
      );
    }

    // Resolve workflow function from registry
    const workflow = await getWorkflow(taskType);

    // Create workflow context - must remain serializable (no Firestore objects)
    const context = {
      channelId,
      attributes,
      tenantId,
    };

    // Start the workflow via the registry
    const run = await start(workflow, [
      {
        prompt,
        createdBy,
        channelId,
        tenantId,
        fileMetadata,
      },
      context,
    ]);

    // Persist run metadata to Firestore so it survives across deployments
    const firestore = getAdminDb();
    await firestore
      .collection("agents")
      .doc(run.runId)
      .set(
        {
          runId: run.runId,
          taskType,
          prompt,
          channelId,
          tenantId,
          createdBy,
          status: "processing",
          attributes,
          fileMetadata,
          messages: [{ role: "user", content: prompt }],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json({
      success: true,
      taskType,
      runId: run.runId,
      message: `${taskType} agent workflow started`,
    });
  } catch (error) {
    console.error("[Agent Start API Error]:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
