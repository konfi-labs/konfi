import { connection, NextRequest, NextResponse } from "next/server";
import { isAgentApiError } from "@/lib/ai/durable-agents/agent-api-error";
import { requireAuthorizedAgentApiRequest } from "@/lib/ai/durable-agents/agent-run-auth";
import type {
  AgentFileMetadata,
  AgentTaskType,
} from "@/lib/ai/durable-agents/types";
import type {
  ProductAgentBlockedItem,
  ProductAgentCatalogChange,
  ProductAgentCatalogSetupPlan,
  ProductAgentDraft,
} from "@/lib/ai/durable-agents/product-workflow.types";

type AgentStatus =
  | "pending"
  | "processing"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

type AgentListTaskType =
  | AgentTaskType
  | "businessUpdate"
  | "category"
  | "productType";

interface CategoryAgentDraftSummary {
  category: {
    description?: string;
    name: string;
    seo?: {
      description?: string;
      slug?: string;
      title?: string;
    };
  };
  readyForCreate?: boolean;
  reviewSummary?: string;
}

interface ProductTypeAgentDraftSummary {
  productType: {
    attributes: string[];
    id: string;
    isShippable: boolean;
    name: string;
  };
  readyForCreate?: boolean;
  reviewSummary?: string;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    // Verify authentication
    const auth = await requireAuthorizedAgentApiRequest(request);

    // Don't use orderBy("createdAt") as documents with pending serverTimestamp
    // or missing createdAt won't be returned. Sort in memory instead.
    const agentsCollection = auth.firestore.collection("agents");
    const agentsQuery = auth.tenantScopeId
      ? agentsCollection.where("tenantId", "==", auth.tenantScopeId)
      : agentsCollection;
    const snapshot = await agentsQuery.limit(20).get();

    const runs = snapshot.docs.map((doc) => {
      const data = doc.data();

      // Handle Firestore Timestamp conversion - use current time as fallback for missing timestamps
      let createdAt: Date;
      if (data.createdAt && typeof data.createdAt.toDate === "function") {
        createdAt = data.createdAt.toDate();
      } else if (
        data.createdAt &&
        typeof data.createdAt === "object" &&
        "_seconds" in data.createdAt
      ) {
        // Handle serialized Firestore timestamp format
        createdAt = new Date(
          (data.createdAt as { _seconds: number })["_seconds"] * 1000,
        );
      } else if (data.createdAt) {
        createdAt = new Date(data.createdAt as string);
      } else {
        // If no createdAt, use current time (document was just created)
        createdAt = new Date();
      }

      let completedAt: Date | undefined;
      if (data.completedAt && typeof data.completedAt.toDate === "function") {
        completedAt = data.completedAt.toDate();
      } else if (
        data.completedAt &&
        typeof data.completedAt === "object" &&
        "_seconds" in data.completedAt
      ) {
        completedAt = new Date(
          (data.completedAt as { _seconds: number })["_seconds"] * 1000,
        );
      } else if (data.completedAt) {
        completedAt = new Date(data.completedAt as string);
      }

      const errorValue = data.error;
      let error: string | undefined;
      if (typeof errorValue === "string") {
        error = errorValue;
      } else if (
        errorValue &&
        typeof errorValue === "object" &&
        "message" in errorValue
      ) {
        error = (errorValue as { message?: string }).message;
      } else if (errorValue) {
        error = JSON.stringify(errorValue);
      }

      return {
        runId: doc.id,
        taskType: (data.taskType as AgentListTaskType) ?? "quote",
        status: (data.status as AgentStatus) ?? "processing",
        hasPendingHook:
          typeof data.pendingHookToken === "string" &&
          data.pendingHookToken.length > 0,
        prompt: (data.prompt as string) ?? "",
        fileMetadata: data.fileMetadata as AgentFileMetadata[] | undefined,
        feedback: data.feedback as
          | {
              updatedAt?: unknown;
              updatedBy?: {
                email?: string;
                id: string;
                name?: string;
              };
              value?: "positive" | "negative";
            }
          | undefined,
        createdAt,
        completedAt,
        result: data.result as
          | {
              customer?: string;
              itemCount?: number;
              totalPrice?: number;
              categoryDraft?: CategoryAgentDraftSummary;
              productTypeDraft?: ProductTypeAgentDraftSummary;
              collectedData?: {
                catalogSetupPlan?: ProductAgentCatalogSetupPlan;
                catalogChanges?: ProductAgentCatalogChange[];
                catalogChangesVersion?: 1;
                categoryDraft?: CategoryAgentDraftSummary;
                productTypeDraft?: ProductTypeAgentDraftSummary;
                customer?: { name?: string };
                items?: unknown[];
                draft?:
                  | ProductAgentDraft
                  | CategoryAgentDraftSummary
                  | ProductTypeAgentDraftSummary;
                blockedItems?: ProductAgentBlockedItem[];
                readyForCreate?: boolean;
                totalPrice?: number;
              };
            }
          | undefined,
        messages: data.messages as
          | Array<{
              role: string;
              content:
                | string
                | Array<{
                    type: string;
                    text?: string;
                    toolCallId?: string;
                    toolName?: string;
                    args?: unknown;
                    result?: unknown;
                  }>;
            }>
          | undefined,
        stepsCount: data.stepsCount as number | undefined,
        error,
      };
    });

    // Sort by createdAt descending (newest first) in memory
    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ runs });
  } catch (error) {
    if (isAgentApiError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("[agents/list] Error:", error);
    return NextResponse.json(
      { error: "Failed to list agents" },
      { status: 500 },
    );
  }
}
