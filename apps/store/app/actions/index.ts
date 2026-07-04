"use server";

import {
  STORE_SESSION_COOKIE,
  createSessionCookie,
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import type {
  CartPreflightJob,
  StartCartPreflightWorkflowResponse,
} from "@/lib/cart-preflight/types";
import {
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@/lib/saas-runtime-quotas";
import { searchLocalizedStorefrontProducts } from "@/lib/search/localized-storefront-search.server";
import type { StorefrontProductSearchResult } from "@/lib/search/product-search.server";
import type { AppCheckTokenResult } from "firebase/app-check";
import { cookies } from "next/headers";
import { start } from "workflow/api";

const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const customerSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function handleCustomerIdToken(
  idToken: string,
  revoke: boolean = false,
): Promise<void> {
  const cookieStore = await cookies();

  if (revoke || !idToken.trim()) {
    cookieStore.set(STORE_SESSION_COOKIE, "", {
      ...customerSessionCookieOptions,
      maxAge: 0,
    });
    return;
  }

  const sessionCookie = await createSessionCookie(
    idToken,
    CUSTOMER_SESSION_TTL_MS,
  );

  if (!sessionCookie) {
    throw new Error("Failed to create store session cookie.");
  }

  cookieStore.set(STORE_SESSION_COOKIE, sessionCookie, {
    ...customerSessionCookieOptions,
    maxAge: Math.floor(CUSTOMER_SESSION_TTL_MS / 1000),
  });
}

function createPendingPreflightJob(params: {
  filename: string;
  itemId: string;
  jobId: string;
  runId: string;
  tenantId?: string;
}): CartPreflightJob {
  return {
    filename: params.filename,
    id: params.jobId,
    itemId: params.itemId,
    runId: params.runId,
    status: "pending",
    tenantId: params.tenantId,
  };
}

function getRequiredFormDataString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key} for preflight check.`);
  }

  return value.trim();
}

export async function preflightCheck(
  formData: FormData,
): Promise<StartCartPreflightWorkflowResponse> {
  try {
    const filename = getRequiredFormDataString(formData, "filename");
    const filePath = getRequiredFormDataString(formData, "file_path");
    const itemId = getRequiredFormDataString(formData, "item_id");
    const userId = getRequiredFormDataString(formData, "user_id");
    const jobId = getRequiredFormDataString(formData, "job_id");
    const tenantId = formData.get("tenant_id");
    const normalizedTenantId =
      typeof tenantId === "string" && tenantId.trim().length > 0
        ? tenantId.trim()
        : undefined;
    await assertSaasRuntimeModuleEnabled({
      context: await getTenantContextForRequest(normalizedTenantId),
      firestore: getAdminDb(),
      module: "preflight",
      operation: "store.cart.preflight",
    });
    const { runCartPreflightWorkflow } =
      await import("@/lib/cart-preflight/workflow");
    const run = await start(runCartPreflightWorkflow, [
      {
        filename,
        filePath,
        itemId,
        jobId,
        tenantId: normalizedTenantId,
        userId,
      },
    ]);

    return {
      job: createPendingPreflightJob({
        filename,
        itemId,
        jobId,
        runId: run.runId,
        tenantId: normalizedTenantId,
      }),
      runId: run.runId,
    };
  } catch (error) {
    console.error("Error starting preflight check workflow:", error);
    return { error: "Failed to start preflight check." };
  }
}

export async function assertStoreStorageQuota(input: {
  requestedBytes: number;
  tenantId?: string;
}): Promise<void> {
  await assertSaasRuntimeQuota({
    context: await getTenantContextForRequest(input.tenantId),
    firestore: getAdminDb(),
    operation: "store.cart.file-upload",
    requested: input.requestedBytes,
    resource: "storageBytes",
  });
}

export async function recordStoreStorageUsage(input: {
  requestedBytes: number;
  tenantId?: string;
}): Promise<void> {
  await recordSaasRuntimeQuotaUsage({
    context: await getTenantContextForRequest(input.tenantId),
    firestore: getAdminDb(),
    operation: "store.cart.file-upload",
    requested: input.requestedBytes,
    resource: "storageBytes",
  });
}

export async function storefrontProductSearch(
  appCheckToken: AppCheckTokenResult | string | undefined,
  lng: string,
  query: string,
  channelId?: string,
): Promise<StorefrontProductSearchResult[] | null> {
  return searchLocalizedStorefrontProducts({
    appCheckToken,
    channelId,
    lng,
    query,
  });
}
