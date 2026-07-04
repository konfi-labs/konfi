import "server-only";

import {
  getPrzelewy24TenantIntegrationMetadata,
  getStripeTenantIntegrationMetadata,
  isConnectedPrzelewy24TenantIntegration,
  isConnectedStripeTenantIntegration,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantPrzelewy24IntegrationDocumentId,
  tenantStripeIntegrationDocumentId,
  type TenantPaymentIntegrationDocument,
} from "@konfi/utils";
import type { Firestore } from "firebase-admin/firestore";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";
import { isEncryptedIntegrationSecret } from "@/lib/integration-secret-crypto";

export interface StorePaymentProviderStatus {
  przelewy24Configured: boolean;
  stripeConfigured: boolean;
}

const emptyStatus = (): StorePaymentProviderStatus => ({
  przelewy24Configured: false,
  stripeConfigured: false,
});

async function getTenantPaymentIntegration(
  db: Firestore,
  documentId: string,
): Promise<TenantPaymentIntegrationDocument | undefined> {
  const snapshot = await db
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(documentId)
    .get();

  return snapshot.exists
    ? (snapshot.data() as TenantPaymentIntegrationDocument | undefined)
    : undefined;
}

export async function getTenantPaymentProviderStatus({
  db,
  tenantId,
}: {
  db: Firestore;
  tenantId: string;
}): Promise<StorePaymentProviderStatus> {
  const [stripeIntegration, przelewy24Integration] = await Promise.all([
    getTenantPaymentIntegration(
      db,
      tenantStripeIntegrationDocumentId(tenantId),
    ),
    getTenantPaymentIntegration(
      db,
      tenantPrzelewy24IntegrationDocumentId(tenantId),
    ),
  ]);
  const stripe = getStripeTenantIntegrationMetadata(
    stripeIntegration?.metadata,
  );
  const przelewy24 = getPrzelewy24TenantIntegrationMetadata(
    przelewy24Integration?.metadata,
  );

  return {
    przelewy24Configured:
      isConnectedPrzelewy24TenantIntegration(przelewy24Integration, tenantId) &&
      Boolean(przelewy24.posId) &&
      isEncryptedIntegrationSecret(przelewy24.encryptedApiKey) &&
      isEncryptedIntegrationSecret(przelewy24.encryptedCrc),
    stripeConfigured:
      isConnectedStripeTenantIntegration(stripeIntegration, tenantId) &&
      isEncryptedIntegrationSecret(stripe.encryptedSecretKey) &&
      isEncryptedIntegrationSecret(stripe.encryptedWebhookSecret),
  };
}

export async function withTenantPaymentProviderStatus(
  runtimeConfig: StoreRuntimeConfig,
  db: Firestore,
): Promise<StoreRuntimeConfig> {
  if (
    runtimeConfig.tenantContext.deploymentMode !== "saas" &&
    !runtimeConfig.tenantContext.requireTenantId
  ) {
    return {
      ...runtimeConfig,
      paymentProviders: {
        przelewy24Configured: Boolean(
          process.env.PRZELEWY24_API_KEY &&
          process.env.PRZELEWY24_CRC &&
          process.env.PRZELEWY24_POS_ID,
        ),
        stripeConfigured: Boolean(
          process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
        ),
      },
    };
  }

  const tenantId = runtimeConfig.tenantContext.tenantId;
  if (!tenantId) {
    return {
      ...runtimeConfig,
      paymentProviders: emptyStatus(),
    };
  }

  return {
    ...runtimeConfig,
    paymentProviders: await getTenantPaymentProviderStatus({ db, tenantId }),
  };
}
