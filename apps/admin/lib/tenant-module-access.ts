import type {
  TenantContext,
  TenantModuleFlags,
} from "@sblyvwx/cloud-contracts";

export type TenantModuleName = keyof TenantModuleFlags;

export type TenantModuleAccessOptions = {
  denyFreePlan?: boolean;
};

type TenantRuntimePlanSnapshot = {
  moduleFlags?: unknown;
};

type TenantModuleAccessDocument = {
  moduleFlags?: unknown;
  planId?: unknown;
  planSnapshot?: TenantRuntimePlanSnapshot;
  quotaEnforcementDisabled?: unknown;
  runtimePlanSnapshot?: TenantRuntimePlanSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignModuleFlags(
  target: Partial<TenantModuleFlags>,
  moduleFlags: unknown,
) {
  if (!isRecord(moduleFlags)) {
    return;
  }

  Object.assign(target, moduleFlags);
}

export function shouldReadTenantModuleAccess({
  deploymentMode,
  requireTenantId,
}: Pick<TenantContext, "deploymentMode" | "requireTenantId">) {
  return deploymentMode === "saas" || requireTenantId;
}

export function readTenantModuleFlags(
  tenant: TenantModuleAccessDocument,
): Partial<TenantModuleFlags> {
  const moduleFlags: Partial<TenantModuleFlags> = {};

  assignModuleFlags(moduleFlags, tenant.runtimePlanSnapshot?.moduleFlags);
  assignModuleFlags(moduleFlags, tenant.planSnapshot?.moduleFlags);
  assignModuleFlags(moduleFlags, tenant.moduleFlags);

  return moduleFlags;
}

export function isFreeTenantPlan(planId: unknown): boolean {
  return typeof planId === "string" && planId.trim().toLowerCase() === "free";
}

export function readTenantModuleAccess(
  tenant: TenantModuleAccessDocument | undefined,
  moduleName: TenantModuleName,
  options: TenantModuleAccessOptions = {},
): boolean {
  if (!tenant) {
    return false;
  }

  if (tenant.quotaEnforcementDisabled === true) {
    return true;
  }

  if (options.denyFreePlan && isFreeTenantPlan(tenant.planId)) {
    return false;
  }

  return readTenantModuleFlags(tenant)[moduleName] !== false;
}
