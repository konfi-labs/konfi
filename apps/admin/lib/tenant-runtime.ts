import type { TenantContext } from "@konfi/types";

export function isSharedSaasTenantRuntime(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}
