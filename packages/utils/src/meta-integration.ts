import { isRecord, optionalTrimmedString } from "./metadata-values";
import { TENANT_INTEGRATIONS_COLLECTION } from "./google-integration";

// Re-export for consumers who import only from meta-integration directly
export { TENANT_INTEGRATIONS_COLLECTION };

export const META_TENANT_INTEGRATION_KEY = "meta";

export const tenantMetaIntegrationDocumentId = (tenantId: string) =>
  `${tenantId}_${META_TENANT_INTEGRATION_KEY}`;

export interface MetaTenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
  updatedAt?: unknown;
  updatedByUid?: unknown;
}

export interface MetaTenantIntegrationMetadata {
  meta: {
    // BYO app credentials (SaaS mode)
    appId?: string;
    encryptedAppSecret?: unknown;
    // connection state written by the OAuth callback
    encryptedUserToken?: unknown; // long-lived user token (~60 days)
    userTokenExpiresAt?: number; // ms epoch
    userTokenRefreshedAt?: number; // ms epoch
    pages?: {
      id: string;
      name: string;
      encryptedPageToken: unknown; // non-expiring page token
      igAccount?: { id: string; username: string }; // linked IG business account
    }[];
  };
}

export function normalizeMetaTenantIntegrationMetadata(
  metadata: unknown,
): MetaTenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const metaRecord = isRecord(metadataRecord.meta) ? metadataRecord.meta : {};

  const rawPages = Array.isArray(metaRecord.pages) ? metaRecord.pages : [];
  const pages = rawPages
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .flatMap((entry) => {
      const id = optionalTrimmedString(entry.id);
      const name = optionalTrimmedString(entry.name);

      if (!id || !name || entry.encryptedPageToken === undefined) {
        return [];
      }

      const igAccountRaw = isRecord(entry.igAccount) ? entry.igAccount : null;
      const igAccount =
        igAccountRaw &&
        typeof igAccountRaw.id === "string" &&
        typeof igAccountRaw.username === "string"
          ? { id: igAccountRaw.id, username: igAccountRaw.username }
          : undefined;

      return [
        {
          id,
          name,
          encryptedPageToken: entry.encryptedPageToken,
          igAccount,
        },
      ];
    });

  return {
    meta: {
      appId: optionalTrimmedString(metaRecord.appId),
      encryptedAppSecret: metaRecord.encryptedAppSecret,
      encryptedUserToken: metaRecord.encryptedUserToken,
      userTokenExpiresAt:
        typeof metaRecord.userTokenExpiresAt === "number"
          ? metaRecord.userTokenExpiresAt
          : undefined,
      userTokenRefreshedAt:
        typeof metaRecord.userTokenRefreshedAt === "number"
          ? metaRecord.userTokenRefreshedAt
          : undefined,
      pages: pages.length > 0 ? pages : undefined,
    },
  };
}

export function isConnectedMetaTenantIntegration(
  integration: MetaTenantIntegrationDocument | undefined,
  tenantId: string,
): integration is MetaTenantIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === META_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}
