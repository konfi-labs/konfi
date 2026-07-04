import { isRecord, optionalTrimmedString } from "./metadata-values";

export const STRIPE_TENANT_INTEGRATION_KEY = "stripe";
export const STRIPE_WEBHOOK_TENANT_INTEGRATION_KEY = "stripe:webhook";
export const PRZELEWY24_TENANT_INTEGRATION_KEY = "przelewy24";
export const PRZELEWY24_CRC_TENANT_INTEGRATION_KEY = "przelewy24:crc";

export type PaymentTenantIntegrationKey =
  | typeof STRIPE_TENANT_INTEGRATION_KEY
  | typeof PRZELEWY24_TENANT_INTEGRATION_KEY;

export interface TenantPaymentIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
  updatedAt?: unknown;
  updatedByUid?: unknown;
}

export interface StripeTenantIntegrationMetadata {
  encryptedSecretKey?: unknown;
  encryptedWebhookSecret?: unknown;
  secretKeyLast4?: string;
  webhookSecretLast4?: string;
}

export interface Przelewy24TenantIntegrationMetadata {
  apiKeyLast4?: string;
  encryptedApiKey?: unknown;
  encryptedCrc?: unknown;
  posId?: string;
}

export const tenantPaymentIntegrationDocumentId = (
  tenantId: string,
  integrationKey: PaymentTenantIntegrationKey,
) => `${tenantId}_${integrationKey}`;

export const tenantStripeIntegrationDocumentId = (tenantId: string) =>
  tenantPaymentIntegrationDocumentId(tenantId, STRIPE_TENANT_INTEGRATION_KEY);

export const tenantPrzelewy24IntegrationDocumentId = (tenantId: string) =>
  tenantPaymentIntegrationDocumentId(
    tenantId,
    PRZELEWY24_TENANT_INTEGRATION_KEY,
  );

export function getStripeTenantIntegrationMetadata(
  metadata: unknown,
): StripeTenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const stripeRecord = isRecord(metadataRecord.stripe)
    ? metadataRecord.stripe
    : {};

  return {
    encryptedSecretKey: stripeRecord.encryptedSecretKey,
    encryptedWebhookSecret: stripeRecord.encryptedWebhookSecret,
    secretKeyLast4: optionalTrimmedString(stripeRecord.secretKeyLast4),
    webhookSecretLast4: optionalTrimmedString(stripeRecord.webhookSecretLast4),
  };
}

export function getPrzelewy24TenantIntegrationMetadata(
  metadata: unknown,
): Przelewy24TenantIntegrationMetadata {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const przelewy24Record = isRecord(metadataRecord.przelewy24)
    ? metadataRecord.przelewy24
    : {};

  return {
    apiKeyLast4: optionalTrimmedString(przelewy24Record.apiKeyLast4),
    encryptedApiKey: przelewy24Record.encryptedApiKey,
    encryptedCrc: przelewy24Record.encryptedCrc,
    posId: optionalTrimmedString(przelewy24Record.posId),
  };
}

export function isConnectedStripeTenantIntegration(
  integration: TenantPaymentIntegrationDocument | undefined,
  tenantId: string,
): integration is TenantPaymentIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === STRIPE_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}

export function isConnectedPrzelewy24TenantIntegration(
  integration: TenantPaymentIntegrationDocument | undefined,
  tenantId: string,
): integration is TenantPaymentIntegrationDocument {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === PRZELEWY24_TENANT_INTEGRATION_KEY &&
    integration.status === "connected"
  );
}
