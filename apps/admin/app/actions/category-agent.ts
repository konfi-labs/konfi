"use server";

import { checkAdmin } from "@/actions";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { CategoryCreateForm } from "@konfi/types";

export interface CategoryAgentDraft {
  blockedItems: unknown[];
  category: Pick<
    CategoryCreateForm,
    "description" | "name" | "parentId" | "seo"
  >;
  readyForCreate: boolean;
  reviewSummary?: string;
}

export type CategoryAgentDraftForCreateResponse =
  | {
      category: CategoryAgentDraft["category"];
      draft: CategoryAgentDraft;
      readyForCreate: boolean;
      success: true;
    }
  | {
      blockedItems?: unknown[];
      error: string;
      readyForCreate?: boolean;
      success: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCategoryAgentDraft(result: unknown): CategoryAgentDraft | null {
  if (!isRecord(result)) {
    return null;
  }

  const collectedData = result.collectedData;
  if (isRecord(collectedData)) {
    const collectedDraft = collectedData.categoryDraft ?? collectedData.draft;
    if (isRecord(collectedDraft)) {
      return collectedDraft as unknown as CategoryAgentDraft;
    }
  }

  const categoryDraft = result.categoryDraft;
  if (isRecord(categoryDraft)) {
    return categoryDraft as unknown as CategoryAgentDraft;
  }

  return null;
}

export async function getCategoryAgentDraftForCreate(
  runId: string,
): Promise<CategoryAgentDraftForCreateResponse> {
  await checkAdmin();

  const trimmedRunId = runId.trim();
  if (!trimmedRunId) {
    return {
      success: false,
      error: "Agent run ID is required.",
    };
  }

  const db = getAdminDb();
  const doc = await db.collection("agents").doc(trimmedRunId).get();

  if (!doc.exists) {
    return {
      success: false,
      error: "Agent run was not found.",
    };
  }

  const data = doc.data();
  if (data?.taskType !== "category") {
    return {
      success: false,
      error: "This agent run is not a category creation run.",
    };
  }

  const draft = getCategoryAgentDraft(data.result);
  if (!draft?.category) {
    return {
      success: false,
      blockedItems: draft?.blockedItems,
      error: "The category agent has not produced a draft yet.",
      readyForCreate: draft?.readyForCreate,
    };
  }

  return {
    success: true,
    category: draft.category,
    draft,
    readyForCreate: draft.readyForCreate,
  };
}
