import "server-only";

import { getTenantAdminScopeTenantId } from "@/actions/auth-utils";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { resolveStorefrontBaseUrls } from "@/lib/storefront-domains";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { getRevalidateApiBaseUrl } from "./revalidate-cache.utils";

export async function getRevalidateApiBaseUrlsForRequest(): Promise<string[]> {
  const tenantContext = await getTenantContextForRequest();

  if (!isSharedSaasTenantRuntime(tenantContext)) {
    return [getRevalidateApiBaseUrl()];
  }

  if (process.env.FRONTEND_REVALIDATE_URL?.trim()) {
    return [getRevalidateApiBaseUrl()];
  }

  const tenantId =
    getTenantAdminScopeTenantId(tenantContext) ?? tenantContext.tenantId;

  if (!tenantId) {
    throw new Error("Tenant context is required for store revalidation.");
  }

  return (await resolveStorefrontBaseUrls({ tenantContext, tenantId })).map(
    (storefrontBaseUrl) =>
      new URL("api/revalidate", `${storefrontBaseUrl}/`).toString(),
  );
}
