import {
  ApiKeyAuthenticationProvider,
  ApiKeyLocation,
  createFakturowniaClient,
  FetchRequestAdapter,
  type FakturowniaClient,
} from "@konfi/fakturownia";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
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

const fakturowniaIntegrationKey = "fakturownia";
const tenantIntegrationsCollection = "tenantIntegrations";

interface TenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
}

interface FakturowniaIntegrationMetadata {
  encryptedApiKey: unknown;
  subdomain: unknown;
}

function tenantIntegrationDocumentId(tenantId: string): string {
  return `${tenantId}_${fakturowniaIntegrationKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFakturowniaMetadata(
  metadata: unknown,
): FakturowniaIntegrationMetadata | undefined {
  if (!isRecord(metadata)) {
    return;
  }

  const fakturownia = metadata.fakturownia;

  return isRecord(fakturownia)
    ? {
        encryptedApiKey: fakturownia.encryptedApiKey,
        subdomain: fakturownia.subdomain,
      }
    : undefined;
}

async function getTenantFakturowniaConfig(
  context: TenantContext,
): Promise<{ apiKey: string; baseUrl: string }> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Fakturownia runtime config is required.");
  }

  const snapshot = await getAdminDb()
    .collection(tenantIntegrationsCollection)
    .doc(tenantIntegrationDocumentId(context.tenantId))
    .get();

  if (!snapshot.exists) {
    throw new Error("Fakturownia is not configured for this tenant.");
  }

  const integration = snapshot.data() as TenantIntegrationDocument | undefined;
  if (
    integration?.tenantId !== context.tenantId ||
    integration.integrationKey !== fakturowniaIntegrationKey ||
    integration.status !== "connected"
  ) {
    throw new Error("Fakturownia is not connected for this tenant.");
  }

  const fakturownia = getFakturowniaMetadata(integration.metadata);
  if (
    typeof fakturownia?.subdomain !== "string" ||
    !isEncryptedIntegrationSecret(fakturownia.encryptedApiKey)
  ) {
    throw new Error("Fakturownia tenant credentials are incomplete.");
  }

  return {
    apiKey: decryptIntegrationSecret({
      encrypted: fakturownia.encryptedApiKey,
      scope: {
        integrationKey: fakturowniaIntegrationKey,
        tenantId: context.tenantId,
      },
    }),
    baseUrl: `https://${fakturownia.subdomain}.fakturownia.pl`,
  };
}

export async function hasTenantFakturowniaConfig(
  context?: TenantContext,
): Promise<boolean> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (!isSharedSaasTenantRuntime(resolvedContext)) {
    return Boolean(
      process.env.FAKTUROWNIA_API_KEY && process.env.FAKTUROWNIA_SUBDOMAIN,
    );
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
    const fakturownia = getFakturowniaMetadata(integration?.metadata);

    return (
      integration?.tenantId === resolvedContext.tenantId &&
      integration.integrationKey === fakturowniaIntegrationKey &&
      integration.status === "connected" &&
      typeof fakturownia?.subdomain === "string" &&
      isEncryptedIntegrationSecret(fakturownia.encryptedApiKey)
    );
  } catch (error) {
    console.error("Failed to check Fakturownia tenant config:", error);
    return false;
  }
}

export async function getFakturowniaConfig(context?: TenantContext): Promise<{
  apiKey: string;
  baseUrl: string;
}> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantFakturowniaConfig(resolvedContext);
  }

  assertProcessEnvIntegrationAllowed("Fakturownia", resolvedContext);

  const apiKey = process.env.FAKTUROWNIA_API_KEY;
  const subdomain = process.env.FAKTUROWNIA_SUBDOMAIN;

  if (!apiKey || !subdomain) {
    throw new Error(
      "Missing FAKTUROWNIA_API_KEY or FAKTUROWNIA_SUBDOMAIN environment variables",
    );
  }

  return {
    apiKey,
    baseUrl: `https://${subdomain}.fakturownia.pl`,
  };
}

export async function getFakturowniaClient(
  context?: TenantContext,
): Promise<FakturowniaClient> {
  const { apiKey, baseUrl } = await getFakturowniaConfig(context);

  const authProvider = new ApiKeyAuthenticationProvider(
    apiKey,
    "api_token",
    ApiKeyLocation.QueryParameter,
  );

  const adapter = new FetchRequestAdapter(authProvider);
  adapter.baseUrl = baseUrl;

  return createFakturowniaClient(adapter);
}

export function formatFakturowniaError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const maybeStatusCode = (error as { statusCode?: number }).statusCode;
    const maybeMessage = (error as { messageEscaped?: string }).messageEscaped;
    if (maybeMessage) {
      return maybeStatusCode
        ? `status ${maybeStatusCode}: ${maybeMessage}`
        : maybeMessage;
    }
  }
  return String(error);
}
