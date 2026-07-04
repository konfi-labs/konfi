import "server-only";

import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  decryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  META_TENANT_INTEGRATION_KEY,
  MetaTenantIntegrationDocument,
  normalizeMetaTenantIntegrationMetadata,
  tenantMetaIntegrationDocumentId,
  TENANT_INTEGRATIONS_COLLECTION,
} from "@konfi/utils";

export interface MetaAppConfig {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
}

function getGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";
}

async function getTenantMetaAppConfig(
  context: TenantContext,
): Promise<MetaAppConfig | null> {
  if (!context.tenantId) {
    return null;
  }

  const snapshot = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantMetaIntegrationDocumentId(context.tenantId))
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const integration = snapshot.data() as MetaTenantIntegrationDocument | undefined;
  if (
    integration?.tenantId !== context.tenantId ||
    integration.integrationKey !== META_TENANT_INTEGRATION_KEY
  ) {
    return null;
  }

  const { meta } = normalizeMetaTenantIntegrationMetadata(integration.metadata);

  if (!meta.appId || !isEncryptedIntegrationSecret(meta.encryptedAppSecret)) {
    return null;
  }

  const appSecret = decryptIntegrationSecret({
    encrypted: meta.encryptedAppSecret,
    scope: {
      integrationKey: META_TENANT_INTEGRATION_KEY,
      tenantId: context.tenantId,
    },
  });

  return {
    appId: meta.appId,
    appSecret,
    graphApiVersion: getGraphApiVersion(),
  };
}

export async function getMetaAppConfig(
  context?: TenantContext,
): Promise<MetaAppConfig | null> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantMetaAppConfig(resolvedContext);
  }

  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    return null;
  }

  return {
    appId,
    appSecret,
    graphApiVersion: getGraphApiVersion(),
  };
}
