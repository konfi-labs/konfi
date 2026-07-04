import "server-only";

import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { TenantStatus, type TenantContext } from "@sblyvwx/cloud-contracts";

interface TenantRuntimeDocument {
  deploymentMode?: unknown;
  id?: unknown;
  status?: unknown;
}

export interface CronTenantRunContext {
  tenantContext: TenantContext;
  tenantId?: string;
}

export interface CronTenantRunResult<TResult = unknown> {
  error?: string;
  result?: TResult;
  status: "processed" | "skipped" | "failed";
  tenantId?: string;
}

function normalizeTenantId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isActiveSaasTenant(
  document: TenantRuntimeDocument | undefined,
): boolean {
  return (
    document?.status === TenantStatus.ACTIVE &&
    document.deploymentMode === "saas"
  );
}

export function isSharedSaasCronRuntime(): boolean {
  return isSharedSaasTenantRuntime(getTenantContext());
}

export async function listCronTenantRunContexts(): Promise<
  CronTenantRunContext[]
> {
  const baseContext = getTenantContext();

  if (!isSharedSaasTenantRuntime(baseContext)) {
    return [
      {
        tenantContext: baseContext,
        tenantId: baseContext.tenantId,
      },
    ];
  }

  const snapshot = await getAdminDb()
    .collection("tenants")
    .where("status", "==", TenantStatus.ACTIVE)
    .where("deploymentMode", "==", "saas")
    .get();

  return snapshot.docs.flatMap((document) => {
    const tenant = document.data() as TenantRuntimeDocument | undefined;
    const tenantId = normalizeTenantId(tenant?.id) ?? document.id;

    if (!tenantId || !isActiveSaasTenant(tenant)) {
      return [];
    }

    return [
      {
        tenantContext: getTenantContext(tenantId),
        tenantId,
      },
    ];
  });
}

export async function runForCronTenants<TResult>(
  runner: (context: CronTenantRunContext) => Promise<TResult>,
): Promise<CronTenantRunResult<TResult>[]> {
  const contexts = await listCronTenantRunContexts();
  const results: CronTenantRunResult<TResult>[] = [];

  for (const context of contexts) {
    try {
      results.push({
        tenantId: context.tenantId,
        status: "processed",
        result: await runner(context),
      });
    } catch (error) {
      results.push({
        tenantId: context.tenantId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown cron error.",
      });
    }
  }

  return results;
}

export function skippedSaasCronResponse(reason: string) {
  return {
    success: true,
    skipped: true,
    mode: "saas",
    reason,
  };
}
