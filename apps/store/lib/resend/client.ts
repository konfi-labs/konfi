import "server-only";

import {
  getResendTenantIntegrationMetadata,
  isConnectedResendTenantIntegration,
  RESEND_TENANT_INTEGRATION_KEY,
  TENANT_INTEGRATIONS_COLLECTION,
  tenantResendIntegrationDocumentId,
  type TenantResendIntegrationDocument,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { Resend } from "resend";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  decryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secret-crypto";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";

export interface ResendRuntimeConfig {
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
}

export interface ResendRuntimeClient {
  config: ResendRuntimeConfig;
  resend: Resend;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function getTenantResendIntegration(
  tenantId: string,
): Promise<TenantResendIntegrationDocument | undefined> {
  const snapshot = await getAdminDb()
    .collection(TENANT_INTEGRATIONS_COLLECTION)
    .doc(tenantResendIntegrationDocumentId(tenantId))
    .get();

  return snapshot.exists
    ? (snapshot.data() as TenantResendIntegrationDocument | undefined)
    : undefined;
}

async function getTenantResendConfig(
  context: TenantContext,
): Promise<ResendRuntimeConfig> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Resend runtime config is required.");
  }

  const integration = await getTenantResendIntegration(context.tenantId);

  if (!integration) {
    throw new Error("Resend is not configured for this tenant.");
  }

  if (!isConnectedResendTenantIntegration(integration, context.tenantId)) {
    throw new Error("Resend is not connected for this tenant.");
  }

  const resend = getResendTenantIntegrationMetadata(integration.metadata);
  if (
    !resend.fromEmail ||
    !isEncryptedIntegrationSecret(resend.encryptedApiKey)
  ) {
    throw new Error("Resend tenant credentials are incomplete.");
  }

  return {
    apiKey: decryptIntegrationSecret({
      encrypted: resend.encryptedApiKey,
      scope: {
        integrationKey: RESEND_TENANT_INTEGRATION_KEY,
        tenantId: context.tenantId,
      },
    }),
    fromEmail: resend.fromEmail,
    ...(resend.fromName ? { fromName: resend.fromName } : {}),
  };
}

export async function getResendConfig(
  context?: TenantContext,
): Promise<ResendRuntimeConfig> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantResendConfig(resolvedContext);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = optionalString(process.env.NO_REPLY_EMAIL);

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not defined");
  }

  return {
    apiKey,
    ...(fromEmail ? { fromEmail } : {}),
    ...(process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME
      ? { fromName: process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME }
      : {}),
  };
}

export async function getResendRuntimeClient(
  context?: TenantContext,
): Promise<ResendRuntimeClient> {
  const config = await getResendConfig(context);

  return {
    config,
    resend: new Resend(config.apiKey),
  };
}

export function resolveResendSenderAddress(
  config: Pick<ResendRuntimeConfig, "fromEmail" | "fromName">,
  preferredFrom?: string,
): string {
  const email = config.fromEmail?.trim() || preferredFrom?.trim();

  if (!email) {
    throw new Error("No valid sender provided");
  }

  const senderName = config.fromName?.trim();

  if (!senderName || email.includes("<")) {
    return email;
  }

  return `${senderName} <${email}>`;
}
