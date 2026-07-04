import "server-only";

import {
  isConnectedInpostTenantIntegration,
  normalizeInpostTenantIntegrationMetadata,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantInpostIntegrationDocumentId,
  type InpostTenantIntegrationDocument,
} from "@konfi/utils";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";
import type { Firestore } from "firebase-admin/firestore";

export async function getTenantInpostGeowidgetConfig({
  db,
  tenantId,
}: {
  db: Firestore;
  tenantId: string;
}) {
  const snapshot = await db
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantInpostIntegrationDocumentId(tenantId))
    .get();
  const integration = snapshot.exists
    ? (snapshot.data() as InpostTenantIntegrationDocument | undefined)
    : undefined;

  if (!isConnectedInpostTenantIntegration(integration, tenantId)) {
    return undefined;
  }

  return normalizeInpostTenantIntegrationMetadata(integration.metadata).inpost;
}

export async function withTenantInpostGeowidgetConfig(
  runtimeConfig: StoreRuntimeConfig,
  db: Firestore,
): Promise<StoreRuntimeConfig> {
  if (
    runtimeConfig.tenantContext.deploymentMode !== "saas" &&
    !runtimeConfig.tenantContext.requireTenantId
  ) {
    return runtimeConfig;
  }

  const tenantId = runtimeConfig.tenantContext.tenantId;
  if (!tenantId) {
    return runtimeConfig;
  }

  const inpost = await getTenantInpostGeowidgetConfig({
    db,
    tenantId,
  });

  return {
    ...runtimeConfig,
    inpost,
  };
}
