import "server-only";

import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { isEncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";

const tenantIntegrationsCollection = "tenantIntegrations";
const visibleTenantOAuthStatuses = new Set([
  "connected",
  "needs_attention",
  "oauth_pending",
]);

interface TenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
}

interface TenantIntegrationConfigFlagEnv {
  allegroConfigured: boolean;
  microsoftConfigured: boolean;
}

export interface TenantIntegrationConfigFlags {
  allegroConfigured: boolean;
  fakturowniaApiKeyProvided: boolean;
  microsoftConfigured: boolean;
  polkurierApiKeyProvided: boolean;
  przelewy24Configured: boolean;
  resendConfigured: boolean;
  stripeConfigured: boolean;
}

function tenantIntegrationDocumentId(tenantId: string, integrationKey: string) {
  return `${tenantId}_${integrationKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function isVisibleOAuthIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
  integrationKeys: readonly string[],
) {
  return (
    integration?.tenantId === tenantId &&
    typeof integration.integrationKey === "string" &&
    integrationKeys.includes(integration.integrationKey) &&
    typeof integration.status === "string" &&
    visibleTenantOAuthStatuses.has(integration.status)
  );
}

function isConnectedIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
  integrationKey: string,
) {
  return (
    integration?.tenantId === tenantId &&
    integration.integrationKey === integrationKey &&
    integration.status === "connected"
  );
}

function hasTenantFakturowniaIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
) {
  const fakturownia = nestedRecord(integration?.metadata, "fakturownia");

  return (
    isConnectedIntegration(integration, tenantId, "fakturownia") &&
    typeof fakturownia?.subdomain === "string" &&
    isEncryptedIntegrationSecret(fakturownia.encryptedApiKey)
  );
}

function hasTenantPolkurierIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
) {
  const polkurier = nestedRecord(integration?.metadata, "polkurier");

  return (
    isConnectedIntegration(integration, tenantId, "polkurier") &&
    typeof polkurier?.authLogin === "string" &&
    typeof polkurier?.baseUrl === "string" &&
    isEncryptedIntegrationSecret(polkurier.encryptedAuthToken)
  );
}

function hasTenantPrzelewy24Integration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
) {
  const przelewy24 = nestedRecord(integration?.metadata, "przelewy24");

  return (
    isConnectedIntegration(integration, tenantId, "przelewy24") &&
    typeof przelewy24?.posId === "string" &&
    przelewy24.posId.trim().length > 0 &&
    isEncryptedIntegrationSecret(przelewy24.encryptedApiKey) &&
    isEncryptedIntegrationSecret(przelewy24.encryptedCrc)
  );
}

function hasTenantResendIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
) {
  const resend = nestedRecord(integration?.metadata, "resend");

  return (
    isConnectedIntegration(integration, tenantId, "resend") &&
    typeof resend?.fromEmail === "string" &&
    isEncryptedIntegrationSecret(resend.encryptedApiKey)
  );
}

function hasTenantStripeIntegration(
  integration: TenantIntegrationDocument | undefined,
  tenantId: string,
) {
  const stripe = nestedRecord(integration?.metadata, "stripe");

  return (
    isConnectedIntegration(integration, tenantId, "stripe") &&
    isEncryptedIntegrationSecret(stripe?.encryptedSecretKey) &&
    isEncryptedIntegrationSecret(stripe?.encryptedWebhookSecret)
  );
}

export async function getTenantIntegrationConfigFlags({
  env,
  tenantContext,
}: {
  env: TenantIntegrationConfigFlagEnv;
  tenantContext: TenantContext;
}): Promise<TenantIntegrationConfigFlags> {
  if (!isSharedSaasTenantRuntime(tenantContext) || !tenantContext.tenantId) {
    return {
      allegroConfigured: false,
      fakturowniaApiKeyProvided: false,
      microsoftConfigured: false,
      polkurierApiKeyProvided: false,
      przelewy24Configured: false,
      resendConfigured: false,
      stripeConfigured: false,
    };
  }

  const tenantId = tenantContext.tenantId;
  const integrationKeys = [
    "allegro",
    "fakturownia",
    "microsoft",
    "outlook",
    "polkurier",
    "przelewy24",
    "resend",
    "stripe",
  ];
  const firestore = getAdminDb();
  const refs = integrationKeys.map((integrationKey) =>
    firestore
      .collection(tenantIntegrationsCollection)
      .doc(tenantIntegrationDocumentId(tenantId, integrationKey)),
  );

  try {
    const snapshots = await firestore.getAll(...refs);
    const integrations = new Map<string, TenantIntegrationDocument | undefined>(
      snapshots.map((snapshot, index) => [
        integrationKeys[index],
        snapshot.exists
          ? (snapshot.data() as TenantIntegrationDocument | undefined)
          : undefined,
      ]),
    );

    return {
      allegroConfigured:
        env.allegroConfigured &&
        isVisibleOAuthIntegration(integrations.get("allegro"), tenantId, [
          "allegro",
        ]),
      fakturowniaApiKeyProvided: hasTenantFakturowniaIntegration(
        integrations.get("fakturownia"),
        tenantId,
      ),
      microsoftConfigured:
        env.microsoftConfigured &&
        (isVisibleOAuthIntegration(integrations.get("microsoft"), tenantId, [
          "microsoft",
          "outlook",
        ]) ||
          isVisibleOAuthIntegration(integrations.get("outlook"), tenantId, [
            "microsoft",
            "outlook",
          ])),
      polkurierApiKeyProvided: hasTenantPolkurierIntegration(
        integrations.get("polkurier"),
        tenantId,
      ),
      przelewy24Configured: hasTenantPrzelewy24Integration(
        integrations.get("przelewy24"),
        tenantId,
      ),
      resendConfigured: hasTenantResendIntegration(
        integrations.get("resend"),
        tenantId,
      ),
      stripeConfigured: hasTenantStripeIntegration(
        integrations.get("stripe"),
        tenantId,
      ),
    };
  } catch (error) {
    console.error("Failed to read tenant integration config flags:", error);
    return {
      allegroConfigured: false,
      fakturowniaApiKeyProvided: false,
      microsoftConfigured: false,
      polkurierApiKeyProvided: false,
      przelewy24Configured: false,
      resendConfigured: false,
      stripeConfigured: false,
    };
  }
}
