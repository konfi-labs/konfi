import "server-only";

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
import { assertProcessEnvIntegrationAllowed } from "@/lib/integration-runtime-config";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";

const resendIntegrationKey = "resend";
const tenantIntegrationsCollection = "tenantIntegrations";

interface TenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
}

interface ResendIntegrationMetadata {
  encryptedApiKey: unknown;
  fromEmail: unknown;
  fromName?: unknown;
}

export interface ResendRuntimeConfig {
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
}

export interface ResendRuntimeClient {
  config: ResendRuntimeConfig;
  resend: Resend;
}

function tenantIntegrationDocumentId(tenantId: string): string {
  return `${tenantId}_${resendIntegrationKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResendMetadata(
  metadata: unknown,
): ResendIntegrationMetadata | undefined {
  if (!isRecord(metadata)) {
    return;
  }

  const resend = metadata.resend;

  return isRecord(resend)
    ? {
        encryptedApiKey: resend.encryptedApiKey,
        fromEmail: resend.fromEmail,
        fromName: resend.fromName,
      }
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function getTenantResendConfig(
  context: TenantContext,
): Promise<ResendRuntimeConfig> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Resend runtime config is required.");
  }

  const snapshot = await getAdminDb()
    .collection(tenantIntegrationsCollection)
    .doc(tenantIntegrationDocumentId(context.tenantId))
    .get();

  if (!snapshot.exists) {
    throw new Error("Resend is not configured for this tenant.");
  }

  const integration = snapshot.data() as TenantIntegrationDocument | undefined;
  if (
    integration?.tenantId !== context.tenantId ||
    integration.integrationKey !== resendIntegrationKey ||
    integration.status !== "connected"
  ) {
    throw new Error("Resend is not connected for this tenant.");
  }

  const resend = getResendMetadata(integration.metadata);
  if (
    typeof resend?.fromEmail !== "string" ||
    !isEncryptedIntegrationSecret(resend?.encryptedApiKey)
  ) {
    throw new Error("Resend tenant credentials are incomplete.");
  }

  const fromName = optionalString(resend.fromName);

  return {
    apiKey: decryptIntegrationSecret({
      encrypted: resend.encryptedApiKey,
      scope: {
        integrationKey: resendIntegrationKey,
        tenantId: context.tenantId,
      },
    }),
    fromEmail: resend.fromEmail,
    ...(fromName ? { fromName } : {}),
  };
}

export async function hasTenantResendConfig(
  context?: TenantContext,
): Promise<boolean> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (!isSharedSaasTenantRuntime(resolvedContext)) {
    return Boolean(process.env.RESEND_API_KEY && process.env.NO_REPLY_EMAIL);
  }

  if (!resolvedContext.tenantId) {
    return false;
  }

  try {
    const snapshot = await getAdminDb()
      .collection(tenantIntegrationsCollection)
      .doc(tenantIntegrationDocumentId(resolvedContext.tenantId))
      .get();
    const integration = snapshot.exists
      ? (snapshot.data() as TenantIntegrationDocument | undefined)
      : undefined;
    const resend = getResendMetadata(integration?.metadata);

    return (
      integration?.tenantId === resolvedContext.tenantId &&
      integration.integrationKey === resendIntegrationKey &&
      integration.status === "connected" &&
      typeof resend?.fromEmail === "string" &&
      isEncryptedIntegrationSecret(resend?.encryptedApiKey)
    );
  } catch (error) {
    console.error("Failed to check Resend tenant config:", error);
    return false;
  }
}

export async function getResendConfig(
  context?: TenantContext,
): Promise<ResendRuntimeConfig> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantResendConfig(resolvedContext);
  }

  assertProcessEnvIntegrationAllowed("Resend", resolvedContext);

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
