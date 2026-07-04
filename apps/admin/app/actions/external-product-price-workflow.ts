"use server";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  getExpectedPricingConfigurationCount,
  getProviderOnlyPricingSelections,
} from "@/lib/external-products/provider-pricing";
import { abortActiveExternalProductPriceFetchWorkflowRun } from "@/lib/external-products/price-fetch-workflow-cancellation";
import type {
  ExternalProduct,
  ExternalProductPriceFetchStrategy,
  ExternalProductPriceFetchWorkflow,
} from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";
import { updateTag } from "next/cache";
import { getRun, start } from "workflow/api";
import type {
  ExternalProductPriceFetchWorkflowInput,
  ExternalProductPriceFetchWorkflowResult,
} from "../../lib/external-products/price-fetch-workflow";
import { checkAdmin } from "./index";

const EXTERNAL_PRODUCTS_TAG = "external-products";

type StartExternalProductPriceFetchWorkflowResponse = {
  success: boolean;
  runId?: string;
  alreadyRunning?: boolean;
  estimatedConfigurationCount?: number;
  fetchStrategy?: ExternalProductPriceFetchStrategy;
  error?: string;
};

type CancelExternalProductPriceFetchWorkflowResponse = {
  success: boolean;
  status?: ExternalProductPriceFetchWorkflow["status"];
  error?: string;
};

export type ExternalProductPriceFetchWorkflowStatusResponse =
  | { status: "pending" | "running" | "cancelled" }
  | { status: "completed"; result: ExternalProductPriceFetchWorkflowResult }
  | { status: "failed"; error: string };

function getDb() {
  return getAdminDb();
}

function compactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function isActiveWorkflowStatus(
  status?: ExternalProductPriceFetchWorkflow["status"],
): boolean {
  return status === "pending" || status === "running";
}

function isCancellationRequested(
  workflow?: ExternalProductPriceFetchWorkflow,
): boolean {
  return workflow?.cancelRequestedAt !== undefined;
}

function getEstimatedConfigurationCount(
  externalProduct: ExternalProduct,
): number {
  const count = getExpectedPricingConfigurationCount({
    externalAttributes: externalProduct.attributes ?? [],
    attributeMappings: externalProduct.attributeMappings,
    configurationParams: externalProduct.pricingSelection?.configurationParams,
    fixedSelections: getProviderOnlyPricingSelections(
      externalProduct.attributeMappings,
      externalProduct.attributes ?? [],
    ),
  });

  return count > 0 ? count : 1;
}

async function persistPriceFetchWorkflowState(options: {
  externalProductId: string;
  workflow: Record<string, unknown>;
}) {
  const { externalProductId, workflow } = options;

  await getDb()
    .collection("externalProducts")
    .doc(externalProductId)
    .update({
      priceFetchWorkflow: compactRecord(workflow),
      updatedAt: FieldValue.serverTimestamp(),
    });
  updateTag(EXTERNAL_PRODUCTS_TAG);
}

function getWorkflowErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow failed";
}

export async function startExternalProductPriceFetchWorkflow(
  input: ExternalProductPriceFetchWorkflowInput,
): Promise<StartExternalProductPriceFetchWorkflowResponse> {
  await checkAdmin();

  const {
    externalProductId,
    mode,
    marginPercent,
    taxPercent,
    discountPercent,
    fetchStrategy = "reuse",
  } = input;

  try {
    const db = getDb();
    const externalRef = db
      .collection("externalProducts")
      .doc(externalProductId);
    const externalDoc = await externalRef.get();

    if (!externalDoc.exists) {
      return { success: false, error: "External product not found" };
    }

    const externalProduct = externalDoc.data() as ExternalProduct;
    const existingWorkflow = externalProduct.priceFetchWorkflow;

    if (
      existingWorkflow?.runId &&
      (isActiveWorkflowStatus(existingWorkflow.status) ||
        isCancellationRequested(existingWorkflow))
    ) {
      try {
        const existingRun = getRun(existingWorkflow.runId);
        const existingStatus = await existingRun.status;

        if (existingStatus === "pending" || existingStatus === "running") {
          return {
            success: true,
            runId: existingWorkflow.runId,
            alreadyRunning: true,
            estimatedConfigurationCount:
              existingWorkflow.estimatedConfigurationCount,
            fetchStrategy: existingWorkflow.fetchStrategy ?? "reuse",
          };
        }
      } catch {
        // Ignore stale run ids and allow a new workflow to start.
      }
    }

    const { externalProductPriceFetchWorkflow } =
      await import("../../lib/external-products/price-fetch-workflow");
    const workflowInput: ExternalProductPriceFetchWorkflowInput = {
      ...input,
      workflowStartedAtMs: Date.now(),
    };
    const run = await start(externalProductPriceFetchWorkflow, [workflowInput]);
    const estimatedConfigurationCount =
      getEstimatedConfigurationCount(externalProduct);

    await persistPriceFetchWorkflowState({
      externalProductId,
      workflow: {
        runId: run.runId,
        mode,
        status: "pending",
        startedAt: FieldValue.serverTimestamp(),
        estimatedConfigurationCount,
        fetchStrategy,
        marginPercent,
        taxPercent,
        discountPercent,
      },
    });

    return {
      success: true,
      runId: run.runId,
      estimatedConfigurationCount,
      fetchStrategy,
    };
  } catch (error) {
    console.error(
      "Error starting external product price fetch workflow:",
      error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function cancelExternalProductPriceFetchWorkflow(
  externalProductId: string,
  runId: string,
): Promise<CancelExternalProductPriceFetchWorkflowResponse> {
  await checkAdmin();

  const db = getDb();
  const externalDoc = await db
    .collection("externalProducts")
    .doc(externalProductId)
    .get();

  if (!externalDoc.exists) {
    return { success: false, error: "External product not found" };
  }

  const externalProduct = externalDoc.data() as ExternalProduct;
  const persistedWorkflow = externalProduct.priceFetchWorkflow;

  if (persistedWorkflow?.runId && persistedWorkflow.runId !== runId) {
    return {
      success: false,
      error: "This price fetch workflow is no longer the active run",
    };
  }

  try {
    const run = getRun(runId);

    if (!(await run.exists)) {
      return { success: false, error: "Workflow run not found" };
    }

    const status = await run.status;

    if (status !== "pending" && status !== "running") {
      const latestStatus = await getExternalProductPriceFetchWorkflowStatus(
        externalProductId,
        runId,
      );

      return latestStatus.status === "failed"
        ? {
            success: true,
            status: "failed",
            error: latestStatus.error,
          }
        : { success: true, status: latestStatus.status };
    }

    await run.cancel();
    abortActiveExternalProductPriceFetchWorkflowRun(runId);

    if (persistedWorkflow?.runId === runId) {
      await persistPriceFetchWorkflowState({
        externalProductId,
        workflow: {
          runId,
          mode: persistedWorkflow.mode ?? "apply",
          status: "cancelled",
          startedAt: persistedWorkflow.startedAt,
          cancelRequestedAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
          estimatedConfigurationCount:
            persistedWorkflow.estimatedConfigurationCount,
          fetchedConfigurationCount:
            persistedWorkflow.fetchedConfigurationCount,
          fetchStrategy: persistedWorkflow.fetchStrategy,
          marginPercent: persistedWorkflow.marginPercent,
          taxPercent: persistedWorkflow.taxPercent,
          discountPercent: persistedWorkflow.discountPercent,
        },
      });
    }

    return { success: true, status: "cancelled" };
  } catch (error) {
    console.error(
      "Error cancelling external product price fetch workflow:",
      error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getExternalProductPriceFetchWorkflowStatus(
  externalProductId: string,
  runId: string,
): Promise<ExternalProductPriceFetchWorkflowStatusResponse> {
  await checkAdmin();

  const db = getDb();
  const externalDoc = await db
    .collection("externalProducts")
    .doc(externalProductId)
    .get();

  if (!externalDoc.exists) {
    return { status: "failed", error: "External product not found" };
  }

  const externalProduct = externalDoc.data() as ExternalProduct;
  const persistedWorkflow = externalProduct.priceFetchWorkflow;

  if (
    persistedWorkflow?.runId === runId &&
    (persistedWorkflow.status === "cancelled" ||
      persistedWorkflow.cancelRequestedAt !== undefined)
  ) {
    return { status: "cancelled" };
  }

  try {
    const run = getRun(runId);
    const status = await run.status;

    if (status === "completed") {
      const result =
        (await run.returnValue) as ExternalProductPriceFetchWorkflowResult;

      if (persistedWorkflow?.runId === runId) {
        await persistPriceFetchWorkflowState({
          externalProductId,
          workflow: {
            runId,
            mode: persistedWorkflow.mode ?? result.mode,
            status: "completed",
            startedAt: persistedWorkflow.startedAt,
            completedAt: FieldValue.serverTimestamp(),
            estimatedConfigurationCount:
              persistedWorkflow.estimatedConfigurationCount,
            fetchedConfigurationCount: result.fetchedConfigurationCount,
            fetchStrategy:
              persistedWorkflow.fetchStrategy ?? result.fetchStrategy,
            marginPercent: persistedWorkflow.marginPercent,
            taxPercent: persistedWorkflow.taxPercent,
            discountPercent: persistedWorkflow.discountPercent,
          },
        });
      }

      return { status: "completed", result };
    }

    if (status === "failed") {
      let errorMessage = "Workflow failed";

      try {
        await run.returnValue;
      } catch (error) {
        errorMessage = getWorkflowErrorMessage(error);
      }

      if (persistedWorkflow?.runId === runId) {
        await persistPriceFetchWorkflowState({
          externalProductId,
          workflow: {
            runId,
            mode: persistedWorkflow.mode ?? "apply",
            status: "failed",
            startedAt: persistedWorkflow.startedAt,
            completedAt: FieldValue.serverTimestamp(),
            estimatedConfigurationCount:
              persistedWorkflow.estimatedConfigurationCount,
            fetchedConfigurationCount:
              persistedWorkflow.fetchedConfigurationCount,
            fetchStrategy: persistedWorkflow.fetchStrategy,
            marginPercent: persistedWorkflow.marginPercent,
            taxPercent: persistedWorkflow.taxPercent,
            discountPercent: persistedWorkflow.discountPercent,
            error: errorMessage,
          },
        });
      }

      return { status: "failed", error: errorMessage };
    }

    if (status === "cancelled") {
      if (persistedWorkflow?.runId === runId) {
        await persistPriceFetchWorkflowState({
          externalProductId,
          workflow: {
            runId,
            mode: persistedWorkflow.mode ?? "apply",
            status: "cancelled",
            startedAt: persistedWorkflow.startedAt,
            completedAt: FieldValue.serverTimestamp(),
            estimatedConfigurationCount:
              persistedWorkflow.estimatedConfigurationCount,
            fetchedConfigurationCount:
              persistedWorkflow.fetchedConfigurationCount,
            fetchStrategy: persistedWorkflow.fetchStrategy,
            marginPercent: persistedWorkflow.marginPercent,
            taxPercent: persistedWorkflow.taxPercent,
            discountPercent: persistedWorkflow.discountPercent,
          },
        });
      }

      return { status: "cancelled" };
    }

    const nextStatus = status === "running" ? "running" : "pending";

    if (
      persistedWorkflow?.runId === runId &&
      persistedWorkflow.status !== nextStatus
    ) {
      await persistPriceFetchWorkflowState({
        externalProductId,
        workflow: {
          runId,
          mode: persistedWorkflow.mode,
          status: nextStatus,
          startedAt: persistedWorkflow.startedAt,
          estimatedConfigurationCount:
            persistedWorkflow.estimatedConfigurationCount,
          fetchedConfigurationCount:
            persistedWorkflow.fetchedConfigurationCount,
          fetchStrategy: persistedWorkflow.fetchStrategy,
          marginPercent: persistedWorkflow.marginPercent,
          taxPercent: persistedWorkflow.taxPercent,
          discountPercent: persistedWorkflow.discountPercent,
        },
      });
    }

    return { status: nextStatus };
  } catch (error) {
    const errorMessage = getWorkflowErrorMessage(error);

    if (persistedWorkflow?.runId === runId) {
      await persistPriceFetchWorkflowState({
        externalProductId,
        workflow: {
          runId,
          mode: persistedWorkflow.mode ?? "apply",
          status: "failed",
          startedAt: persistedWorkflow.startedAt,
          completedAt: FieldValue.serverTimestamp(),
          estimatedConfigurationCount:
            persistedWorkflow.estimatedConfigurationCount,
          fetchedConfigurationCount:
            persistedWorkflow.fetchedConfigurationCount,
          fetchStrategy: persistedWorkflow.fetchStrategy,
          marginPercent: persistedWorkflow.marginPercent,
          taxPercent: persistedWorkflow.taxPercent,
          discountPercent: persistedWorkflow.discountPercent,
          error: errorMessage,
        },
      });
    }

    return { status: "failed", error: errorMessage };
  }
}
