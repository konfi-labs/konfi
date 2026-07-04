"use server";

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  type SaasRuntimeModuleFlag,
  type SaasRuntimeQuotaResource,
  assertSaasRuntimeModuleEnabled,
  assertSaasRuntimeQuota,
  recordSaasRuntimeQuotaUsage,
} from "@/lib/saas-runtime-quotas";

export async function assertSaasRuntimeQuotaAction(input: {
  current?: number;
  operation: string;
  requested?: number;
  resource: SaasRuntimeQuotaResource;
}): Promise<void> {
  await requireAdminAuth();
  const context = await getTenantContextForRequest();

  await assertSaasRuntimeQuota({
    context,
    current: input.current,
    firestore: getAdminDb(),
    operation: input.operation,
    requested: input.requested,
    resource: input.resource,
  });
}

export async function recordSaasRuntimeQuotaUsageAction(input: {
  current?: number;
  operation: string;
  requested?: number;
  resource: SaasRuntimeQuotaResource;
}): Promise<void> {
  await requireAdminAuth();
  const context = await getTenantContextForRequest();

  await recordSaasRuntimeQuotaUsage({
    context,
    current: input.current,
    firestore: getAdminDb(),
    operation: input.operation,
    requested: input.requested,
    resource: input.resource,
  });
}

export async function assertSaasRuntimeModuleAction(input: {
  module: SaasRuntimeModuleFlag;
  operation: string;
}): Promise<void> {
  await requireAdminAuth();
  const context = await getTenantContextForRequest();

  await assertSaasRuntimeModuleEnabled({
    context,
    firestore: getAdminDb(),
    module: input.module,
    operation: input.operation,
  });
}
