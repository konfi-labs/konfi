import { isRecord, optionalTrimmedString } from "./metadata-values";

export const RESEND_TENANT_INTEGRATION_KEY = "resend";

export interface ResendTenantIntegrationMetadata {
  encryptedApiKey?: unknown;
  fromEmail?: string;
  fromName?: string;
}

export interface TenantResendIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
  updatedAt?: unknown;
  updatedByUid?: unknown;
}

export const tenantResendIntegrationDocumentId = (tenantId: string) =>
  `${tenantId}_${RESEND_TENANT_INTEGRATION_KEY}`;

export function getResendTenantIntegrationMetadata(
  metadata: unknown,
): ResendTenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const resendRecord = isRecord(metadataRecord.resend)
    ? metadataRecord.resend
    : {};

  return {
    encryptedApiKey: resendRecord.encryptedApiKey,
    fromEmail: optionalTrimmedString(resendRecord.fromEmail),
    fromName: optionalTrimmedString(resendRecord.fromName),
  };
}

export function isConnectedResendTenantIntegration(
  integration: TenantResendIntegrationDocument | undefined,
  tenantId: string,
): integration is TenantResendIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === RESEND_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}
