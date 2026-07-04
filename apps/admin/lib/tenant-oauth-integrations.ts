import "server-only";

import { TENANT_INTEGRATIONS_COLLECTION } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";

type TenantOAuthIntegrationKey = "allegro" | "microsoft" | "outlook";

interface TenantOAuthIntegrationDocument {
  integrationKey?: unknown;
  status?: unknown;
  tenantId?: unknown;
}

const visibleTenantOAuthStatuses = new Set([
  "connected",
  "needs_attention",
  "oauth_pending",
]);

const tenantOAuthIntegrationDocumentId = (
  tenantId: string,
  integrationKey: TenantOAuthIntegrationKey,
) => `${tenantId}_${integrationKey}`;

function isVisibleTenantOAuthIntegration(
  integration: TenantOAuthIntegrationDocument | undefined,
  tenantId: string,
  integrationKeys: readonly TenantOAuthIntegrationKey[],
) {
  return (
    integration?.tenantId === tenantId &&
    typeof integration.integrationKey === "string" &&
    integrationKeys.includes(
      integration.integrationKey as TenantOAuthIntegrationKey,
    ) &&
    typeof integration.status === "string" &&
    visibleTenantOAuthStatuses.has(integration.status)
  );
}

async function hasTenantOAuthIntegration({
  context,
  envConfigured,
  integrationKeys,
}: {
  context?: TenantContext;
  envConfigured: boolean;
  integrationKeys: readonly TenantOAuthIntegrationKey[];
}): Promise<boolean> {
  if (!envConfigured) {
    return false;
  }

  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (!isSharedSaasTenantRuntime(resolvedContext)) {
    return true;
  }

  const tenantId = resolvedContext.tenantId;

  if (!tenantId) {
    return false;
  }

  try {
    const firestore = getAdminDb();
    const snapshots = await Promise.all(
      integrationKeys.map((integrationKey) =>
        firestore
          .collection(TENANT_INTEGRATIONS_COLLECTION)
          .doc(tenantOAuthIntegrationDocumentId(tenantId, integrationKey))
          .get(),
      ),
    );

    return snapshots.some((snapshot) =>
      isVisibleTenantOAuthIntegration(
        snapshot.exists
          ? (snapshot.data() as TenantOAuthIntegrationDocument | undefined)
          : undefined,
        tenantId,
        integrationKeys,
      ),
    );
  } catch (error) {
    console.error("Failed to check tenant OAuth integration config:", error);
    return false;
  }
}

export async function hasTenantAllegroOAuthConfig(
  context?: TenantContext,
): Promise<boolean> {
  return hasTenantOAuthIntegration({
    context,
    envConfigured: Boolean(
      process.env.ALLEGRO_CLIENT_ID && process.env.ALLEGRO_CLIENT_SECRET,
    ),
    integrationKeys: ["allegro"],
  });
}

export async function hasTenantMicrosoftOAuthConfig(
  context?: TenantContext,
): Promise<boolean> {
  return hasTenantOAuthIntegration({
    context,
    envConfigured: Boolean(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_REDIRECT_URI,
    ),
    integrationKeys: ["microsoft", "outlook"],
  });
}
