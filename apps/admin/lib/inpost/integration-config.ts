import "server-only";

import {
  isConnectedInpostTenantIntegration,
  normalizeInpostTenantIntegrationMetadata,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantInpostIntegrationDocumentId,
  type InpostTenantIntegrationDocument,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";

export async function getInpostGeowidgetToken(
  context: TenantContext,
): Promise<string | undefined> {
  if (!isSharedSaasTenantRuntime(context)) {
    return process.env.NEXT_PUBLIC_INPOST_GEOWIDGET_TOKEN?.trim() || undefined;
  }

  if (!context.tenantId) {
    return undefined;
  }

  try {
    const snapshot = await getAdminDb()
      .collection(TENANT_INTEGRATIONS_COLLECTION)
      .doc(tenantInpostIntegrationDocumentId(context.tenantId))
      .get();
    const integration = snapshot.exists
      ? (snapshot.data() as InpostTenantIntegrationDocument | undefined)
      : undefined;

    if (!isConnectedInpostTenantIntegration(integration, context.tenantId)) {
      return undefined;
    }

    return normalizeInpostTenantIntegrationMetadata(integration.metadata).inpost
      .geowidgetToken;
  } catch (error) {
    console.error("Failed to read InPost tenant config:", error);
    return undefined;
  }
}
