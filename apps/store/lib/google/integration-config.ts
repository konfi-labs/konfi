import "server-only";

import {
  getGoogleStorefrontChannelConfig,
  GOOGLE_TENANT_INTEGRATION_KEY,
  isConnectedGoogleTenantIntegration,
  normalizeGoogleTenantIntegrationMetadata,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantGoogleIntegrationDocumentId,
  type GoogleStorefrontChannelConfig,
  type GoogleStorefrontChannelsConfig,
  type GoogleTenantIntegrationDocument,
} from "@konfi/utils";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";
import type { Firestore } from "firebase-admin/firestore";

export interface TenantGoogleStorefrontIntegration {
  channels: GoogleStorefrontChannelsConfig;
  tenantId: string;
}

function emptyGoogleConfig(): GoogleStorefrontChannelConfig {
  return {
    reviewsEnabled: false,
    tagManagerEnabled: false,
  };
}

export async function getTenantGoogleStorefrontConfig({
  channelId,
  db,
  tenantId,
}: {
  channelId: string;
  db: Firestore;
  tenantId: string;
}): Promise<GoogleStorefrontChannelConfig> {
  const snapshot = await db
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantGoogleIntegrationDocumentId(tenantId))
    .get();
  const integration = snapshot.exists
    ? (snapshot.data() as GoogleTenantIntegrationDocument | undefined)
    : undefined;

  if (!isConnectedGoogleTenantIntegration(integration, tenantId)) {
    return emptyGoogleConfig();
  }

  return getGoogleStorefrontChannelConfig(integration.metadata, channelId);
}

export async function withTenantGoogleStorefrontConfig(
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

  const google = await getTenantGoogleStorefrontConfig({
    channelId: runtimeConfig.channelId,
    db,
    tenantId,
  });

  return {
    ...runtimeConfig,
    google,
  };
}

export async function listConnectedTenantGoogleStorefrontIntegrations(
  db: Firestore,
): Promise<TenantGoogleStorefrontIntegration[]> {
  const snapshot = await db
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .where("integrationKey", "==", GOOGLE_TENANT_INTEGRATION_KEY)
    .where("status", "==", "connected")
    .get();

  return snapshot.docs.flatMap((document) => {
    const integration = document.data() as
      | GoogleTenantIntegrationDocument
      | undefined;
    const tenantId =
      typeof integration?.tenantId === "string"
        ? integration.tenantId.trim()
        : "";

    if (
      !tenantId ||
      !isConnectedGoogleTenantIntegration(integration, tenantId)
    ) {
      return [];
    }

    return [
      {
        channels: normalizeGoogleTenantIntegrationMetadata(integration.metadata)
          .google.channels,
        tenantId,
      },
    ];
  });
}
