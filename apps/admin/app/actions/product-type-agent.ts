"use server";

import { checkAdmin } from "@/actions";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { ProductTypeCreateForm } from "@konfi/types";

export interface ProductTypeAgentDraft {
  blockedItems: unknown[];
  productType: Pick<
    ProductTypeCreateForm,
    "attributes" | "id" | "isShippable" | "name"
  >;
  readyForCreate: boolean;
  reviewSummary?: string;
}

export type ProductTypeAgentDraftForCreateResponse =
  | {
      draft: ProductTypeAgentDraft;
      productType: ProductTypeAgentDraft["productType"];
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

function getProductTypeAgentDraft(
  result: unknown,
): ProductTypeAgentDraft | null {
  if (!isRecord(result)) {
    return null;
  }

  const collectedData = result.collectedData;
  if (isRecord(collectedData)) {
    const collectedDraft =
      collectedData.productTypeDraft ?? collectedData.draft;
    if (isRecord(collectedDraft)) {
      return collectedDraft as unknown as ProductTypeAgentDraft;
    }
  }

  const productTypeDraft = result.productTypeDraft;
  if (isRecord(productTypeDraft)) {
    return productTypeDraft as unknown as ProductTypeAgentDraft;
  }

  return null;
}

export async function getProductTypeAgentDraftForCreate(
  runId: string,
): Promise<ProductTypeAgentDraftForCreateResponse> {
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
  if (data?.taskType !== "productType") {
    return {
      success: false,
      error: "This agent run is not a product type creation run.",
    };
  }

  const draft = getProductTypeAgentDraft(data.result);
  if (!draft?.productType) {
    return {
      success: false,
      blockedItems: draft?.blockedItems,
      error: "The product type agent has not produced a draft yet.",
      readyForCreate: draft?.readyForCreate,
    };
  }

  return {
    success: true,
    draft,
    productType: draft.productType,
    readyForCreate: draft.readyForCreate,
  };
}
