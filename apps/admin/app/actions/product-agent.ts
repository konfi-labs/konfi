"use server";

import { checkAdmin } from "@/actions";
import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import {
  applyProductCreationCatalogSetupStep,
  sanitizeProductCreationCatalogSetupPlan,
} from "@/lib/ai/durable-agents/product-workflow.steps";
import type {
  ProductAgentBlockedItem,
  ProductAgentCatalogChange,
  ProductAgentCatalogSetupPlan,
  ProductAgentData,
  ProductAgentDraft,
} from "@/lib/ai/durable-agents/product-workflow.types";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { Product } from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";

export type ProductAgentDraftForCreateResponse =
  | {
      success: true;
      blockedItems: ProductAgentBlockedItem[];
      draft: ProductAgentDraft;
      product: Partial<Product>;
      readyForCreate: boolean;
    }
  | {
      success: false;
      blockedItems?: ProductAgentBlockedItem[];
      error: string;
      readyForCreate?: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getProductAgentData(result: unknown): ProductAgentData | null {
  if (!isRecord(result)) {
    return null;
  }

  const collectedData = result.collectedData;
  if (isRecord(collectedData)) {
    return collectedData as unknown as ProductAgentData;
  }

  if ("draft" in result || "readyForCreate" in result) {
    return result as unknown as ProductAgentData;
  }

  return null;
}

function removeUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => typeof item !== "undefined");
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value)) {
      if (typeof val === "undefined") {
        continue;
      }

      const next = removeUndefinedDeep(val);
      if (typeof next !== "undefined") {
        cleaned[key] = next;
      }
    }

    return cleaned;
  }

  return value;
}

function isCatalogSetupBlockedItemType(item: ProductAgentBlockedItem): boolean {
  return (
    item.type === "attribute" ||
    item.type === "option" ||
    item.type === "productType"
  );
}

function hasCatalogSetupWork(plan: ProductAgentCatalogSetupPlan): boolean {
  return (
    plan.attributes.length > 0 ||
    plan.options.some((optionUpdate) => optionUpdate.options.length > 0) ||
    Boolean(plan.productType)
  );
}

function markCatalogChangesApplied(
  catalogChanges: ProductAgentCatalogChange[] | undefined,
): ProductAgentCatalogChange[] | undefined {
  if (!catalogChanges || catalogChanges.length === 0) {
    return undefined;
  }

  return catalogChanges.map((change) => ({
    ...change,
    status: "applied",
  }));
}

export type ApplyProductAgentCatalogSetupResponse =
  | {
      openUrl?: string;
      readyForCreate: boolean;
      success: true;
      summary: string;
      warnings: string[];
    }
  | {
      error: string;
      success: false;
      warnings?: string[];
    };

export async function getProductAgentDraftForCreate(
  runId: string,
): Promise<ProductAgentDraftForCreateResponse> {
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
  if (data?.taskType !== "product") {
    return {
      success: false,
      error: "This agent run is not a product creation run.",
    };
  }

  const productAgentData = getProductAgentData(data.result);
  const draft = productAgentData?.draft;

  if (!draft) {
    return {
      success: false,
      blockedItems: productAgentData?.blockedItems,
      error: "The product agent has not produced a draft yet.",
      readyForCreate: productAgentData?.readyForCreate,
    };
  }

  return {
    success: true,
    blockedItems: productAgentData.blockedItems,
    draft,
    product: draft.product,
    readyForCreate: productAgentData.readyForCreate,
  };
}

export async function applyProductAgentCatalogSetup(
  runId: string,
  catalogSetupPlan: ProductAgentCatalogSetupPlan,
): Promise<ApplyProductAgentCatalogSetupResponse> {
  const createdBy = await getAuthenticatedAdminMember();

  const trimmedRunId = runId.trim();
  if (!trimmedRunId) {
    return {
      success: false,
      error: "Agent run ID is required.",
    };
  }

  const db = getAdminDb();
  const agentRef = db.collection("agents").doc(trimmedRunId);
  const doc = await agentRef.get();

  if (!doc.exists) {
    return {
      success: false,
      error: "Agent run was not found.",
    };
  }

  const data = doc.data();
  if (data?.taskType !== "product") {
    return {
      success: false,
      error: "This agent run is not a product creation run.",
    };
  }

  const resultRecord = isRecord(data.result) ? data.result : {};
  const collectedDataRecord = isRecord(resultRecord.collectedData)
    ? resultRecord.collectedData
    : {};
  const productAgentData = getProductAgentData(data.result);
  const draft = productAgentData?.draft;

  if (!productAgentData || !draft) {
    return {
      success: false,
      error: "The product agent has not produced a draft yet.",
    };
  }

  const sanitizedPlan =
    sanitizeProductCreationCatalogSetupPlan(catalogSetupPlan);

  if (!hasCatalogSetupWork(sanitizedPlan)) {
    return {
      success: false,
      error: "There are no catalog changes to apply.",
    };
  }

  try {
    const applyResult = await applyProductCreationCatalogSetupStep({
      createdBy,
      plan: sanitizedPlan,
    });

    if (applyResult.warnings.length > 0) {
      return {
        success: false,
        error: applyResult.summary,
        warnings: applyResult.warnings,
      };
    }

    const remainingBlockedItems = (
      productAgentData.blockedItems ??
      draft.blockedItems ??
      []
    ).filter((item) => !isCatalogSetupBlockedItemType(item));
    const catalogChanges = markCatalogChangesApplied(
      productAgentData.catalogChanges ?? draft.catalogChanges,
    );
    const readyForCreate = remainingBlockedItems.length === 0;
    const nextDraft: ProductAgentDraft = {
      ...draft,
      blockedItems: remainingBlockedItems,
      ...(catalogChanges
        ? {
            catalogChanges,
            catalogChangesVersion: 1,
          }
        : {}),
      readyForCreate,
    };
    const nextCollectedData = {
      ...collectedDataRecord,
      blockedItems: remainingBlockedItems,
      ...(catalogChanges
        ? {
            catalogChanges,
            catalogChangesVersion: 1,
          }
        : {}),
      catalogSetupApplyResult: {
        createdAttributes: applyResult.createdAttributes,
        createdProductType: applyResult.createdProductType,
        summary: applyResult.summary,
        updatedOptions: applyResult.updatedOptions,
        warnings: applyResult.warnings,
      },
      catalogSetupPlan: null,
      draft: nextDraft,
      readyForCreate,
    };
    const nextResult = {
      ...resultRecord,
      blockedItems: remainingBlockedItems,
      ...(catalogChanges
        ? {
            catalogChanges,
            catalogChangesVersion: 1,
          }
        : {}),
      collectedData: nextCollectedData,
      productDraft: nextDraft,
      readyForCreate,
    };

    await agentRef.set(
      removeUndefinedDeep({
        result: nextResult,
        updatedAt: FieldValue.serverTimestamp(),
      }) as Record<string, unknown>,
      { merge: true },
    );

    return {
      success: true,
      summary: applyResult.summary,
      warnings: applyResult.warnings,
      readyForCreate,
      ...(readyForCreate
        ? {
            openUrl: `/catalog/products/create?agentRunId=${encodeURIComponent(
              trimmedRunId,
            )}`,
          }
        : {}),
    };
  } catch (error) {
    console.error("Error applying product agent catalog setup:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to apply catalog changes.",
    };
  }
}
