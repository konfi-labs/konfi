import type { TenantContext } from "@sblyvwx/cloud-contracts";

export function isSharedSaasTenantRuntime(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}
