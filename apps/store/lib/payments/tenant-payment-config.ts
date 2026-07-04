import "server-only";

import {
  type Przelewy24PaymentCredentials,
  type StripePaymentCredentials,
} from "@konfi/payments";
import {
  getPrzelewy24TenantIntegrationMetadata,
  getStripeTenantIntegrationMetadata,
  isConnectedPrzelewy24TenantIntegration,
  isConnectedStripeTenantIntegration,
  PRZELEWY24_CRC_TENANT_INTEGRATION_KEY,
  PRZELEWY24_TENANT_INTEGRATION_KEY,
  STRIPE_TENANT_INTEGRATION_KEY,
  STRIPE_WEBHOOK_TENANT_INTEGRATION_KEY,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantPrzelewy24IntegrationDocumentId,
  tenantStripeIntegrationDocumentId,
  type TenantPaymentIntegrationDocument,
} from "@konfi/utils";
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

async function getTenantPaymentIntegration(
  tenantId: string,
  documentId: string,
): Promise<TenantPaymentIntegrationDocument | undefined> {
  const snapshot = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(documentId)
    .get();

  return snapshot.exists
    ? (snapshot.data() as TenantPaymentIntegrationDocument | undefined)
    : undefined;
}

async function getTenantStripePaymentCredentials(
  context: TenantContext,
): Promise<StripePaymentCredentials> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Stripe runtime config is required.");
  }

  const integration = await getTenantPaymentIntegration(
    context.tenantId,
    tenantStripeIntegrationDocumentId(context.tenantId),
  );

  if (!isConnectedStripeTenantIntegration(integration, context.tenantId)) {
    throw new Error("Stripe is not connected for this tenant.");
  }

  const stripe = getStripeTenantIntegrationMetadata(integration.metadata);
  if (
    !isEncryptedIntegrationSecret(stripe.encryptedSecretKey) ||
    !isEncryptedIntegrationSecret(stripe.encryptedWebhookSecret)
  ) {
    throw new Error("Stripe tenant credentials are incomplete.");
  }

  return {
    secretKey: decryptIntegrationSecret({
      encrypted: stripe.encryptedSecretKey,
      scope: {
        integrationKey: STRIPE_TENANT_INTEGRATION_KEY,
        tenantId: context.tenantId,
      },
    }),
    webhookSecret: decryptIntegrationSecret({
      encrypted: stripe.encryptedWebhookSecret,
      scope: {
        integrationKey: STRIPE_WEBHOOK_TENANT_INTEGRATION_KEY,
        tenantId: context.tenantId,
      },
    }),
  };
}

async function getTenantPrzelewy24PaymentCredentials(
  context: TenantContext,
): Promise<Przelewy24PaymentCredentials> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Przelewy24 runtime config is required.");
  }

  const integration = await getTenantPaymentIntegration(
    context.tenantId,
    tenantPrzelewy24IntegrationDocumentId(context.tenantId),
  );

  if (!isConnectedPrzelewy24TenantIntegration(integration, context.tenantId)) {
    throw new Error("Przelewy24 is not connected for this tenant.");
  }

  const przelewy24 = getPrzelewy24TenantIntegrationMetadata(
    integration.metadata,
  );
  if (
    !przelewy24.posId ||
    !isEncryptedIntegrationSecret(przelewy24.encryptedApiKey) ||
    !isEncryptedIntegrationSecret(przelewy24.encryptedCrc)
  ) {
    throw new Error("Przelewy24 tenant credentials are incomplete.");
  }

  return {
    apiKey: decryptIntegrationSecret({
      encrypted: przelewy24.encryptedApiKey,
      scope: {
        integrationKey: PRZELEWY24_TENANT_INTEGRATION_KEY,
        tenantId: context.tenantId,
      },
    }),
    crc: decryptIntegrationSecret({
      encrypted: przelewy24.encryptedCrc,
      scope: {
        integrationKey: PRZELEWY24_CRC_TENANT_INTEGRATION_KEY,
        tenantId: context.tenantId,
      },
    }),
    posId: przelewy24.posId,
  };
}

export async function getStripePaymentCredentials(
  context?: TenantContext,
): Promise<StripePaymentCredentials> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantStripePaymentCredentials(resolvedContext);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET environment variables",
    );
  }

  return { secretKey, webhookSecret };
}

export async function getPrzelewy24PaymentCredentials(
  context?: TenantContext,
): Promise<Przelewy24PaymentCredentials> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantPrzelewy24PaymentCredentials(resolvedContext);
  }

  const apiKey = process.env.PRZELEWY24_API_KEY;
  const crc = process.env.PRZELEWY24_CRC;
  const posId = process.env.PRZELEWY24_POS_ID;

  if (!apiKey || !crc || !posId) {
    throw new Error(
      "Missing PRZELEWY24_API_KEY, PRZELEWY24_CRC, or PRZELEWY24_POS_ID environment variables",
    );
  }

  return { apiKey, crc, posId };
}
