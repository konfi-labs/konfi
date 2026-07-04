import { isRecord, optionalTrimmedString } from "./metadata-values";

export const INPOST_TENANT_INTEGRATION_KEY = "inpost";

export interface InpostGeowidgetConfig {
  geowidgetToken?: string;
}

export interface InpostTenantIntegrationMetadata {
  inpost: InpostGeowidgetConfig;
}

export interface InpostTenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
  updatedAt?: unknown;
  updatedByUid?: unknown;
}

export const tenantInpostIntegrationDocumentId = (tenantId: string) =>
  `${tenantId}_${INPOST_TENANT_INTEGRATION_KEY}`;

export function normalizeInpostTenantIntegrationMetadata(
  metadata: unknown,
): InpostTenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const inpostRecord = isRecord(metadataRecord.inpost)
    ? metadataRecord.inpost
    : {};

  return {
    inpost: {
      geowidgetToken: optionalTrimmedString(inpostRecord.geowidgetToken),
    },
  };
}

export function isConnectedInpostTenantIntegration(
  integration: InpostTenantIntegrationDocument | undefined,
  tenantId: string,
): integration is InpostTenantIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === INPOST_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}
