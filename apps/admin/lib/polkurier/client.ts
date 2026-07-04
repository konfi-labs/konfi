import {
  AnonymousAuthenticationProvider,
  createPolkurierClient,
  FetchRequestAdapter,
  type Authorization,
  type PolkurierClient,
} from "@konfi/polkurier";
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

type PolkurierPostBody = Parameters<PolkurierClient["post"]>[0];
const polkurierIntegrationKey = "polkurier";
const tenantIntegrationsCollection = "tenantIntegrations";

interface TenantIntegrationDocument {
  integrationKey?: unknown;
  metadata?: unknown;
  status?: unknown;
  tenantId?: unknown;
}

interface PolkurierIntegrationMetadata {
  authLogin: unknown;
  baseUrl: unknown;
  encryptedAuthToken: unknown;
}

function tenantIntegrationDocumentId(tenantId: string): string {
  return `${tenantId}_${polkurierIntegrationKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPolkurierMetadata(
  metadata: unknown,
): PolkurierIntegrationMetadata | undefined {
  if (!isRecord(metadata)) {
    return;
  }

  const polkurier = metadata.polkurier;

  return isRecord(polkurier)
    ? {
        authLogin: polkurier.authLogin,
        baseUrl: polkurier.baseUrl,
        encryptedAuthToken: polkurier.encryptedAuthToken,
      }
    : undefined;
}

async function getTenantPolkurierConfig(context: TenantContext): Promise<{
  authLogin: string;
  authToken: string;
  baseUrl: string;
}> {
  if (!context.tenantId) {
    throw new Error("Tenant-specific Polkurier runtime config is required.");
  }

  const snapshot = await getAdminDb()
    .collection(tenantIntegrationsCollection)
    .doc(tenantIntegrationDocumentId(context.tenantId))
    .get();

  if (!snapshot.exists) {
    throw new Error("Polkurier is not configured for this tenant.");
  }

  const integration = snapshot.data() as TenantIntegrationDocument | undefined;
  if (
    integration?.tenantId !== context.tenantId ||
    integration.integrationKey !== polkurierIntegrationKey ||
    integration.status !== "connected"
  ) {
    throw new Error("Polkurier is not connected for this tenant.");
  }

  const polkurier = getPolkurierMetadata(integration.metadata);
  if (
    typeof polkurier?.authLogin !== "string" ||
    typeof polkurier?.baseUrl !== "string" ||
    !isEncryptedIntegrationSecret(polkurier?.encryptedAuthToken)
  ) {
    throw new Error("Polkurier tenant credentials are incomplete.");
  }

  return {
    authLogin: polkurier.authLogin,
    authToken: decryptIntegrationSecret({
      encrypted: polkurier.encryptedAuthToken,
      scope: {
        integrationKey: polkurierIntegrationKey,
        tenantId: context.tenantId,
      },
    }),
    baseUrl: polkurier.baseUrl,
  };
}

export async function hasTenantPolkurierConfig(
  context?: TenantContext,
): Promise<boolean> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (!isSharedSaasTenantRuntime(resolvedContext)) {
    return Boolean(process.env.POLKURIER_LOGIN && process.env.POLKURIER_TOKEN);
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
    const polkurier = getPolkurierMetadata(integration?.metadata);

    return (
      integration?.tenantId === resolvedContext.tenantId &&
      integration.integrationKey === polkurierIntegrationKey &&
      integration.status === "connected" &&
      typeof polkurier?.authLogin === "string" &&
      typeof polkurier?.baseUrl === "string" &&
      isEncryptedIntegrationSecret(polkurier?.encryptedAuthToken)
    );
  } catch (error) {
    console.error("Failed to check Polkurier tenant config:", error);
    return false;
  }
}

export async function getPolkurierConfig(context?: TenantContext): Promise<{
  authLogin: string;
  authToken: string;
  baseUrl: string;
}> {
  const resolvedContext = context ?? (await getTenantContextForRequest());

  if (isSharedSaasTenantRuntime(resolvedContext)) {
    return getTenantPolkurierConfig(resolvedContext);
  }

  assertProcessEnvIntegrationAllowed("Polkurier", resolvedContext);

  const authLogin = process.env.POLKURIER_LOGIN;
  const authToken = process.env.POLKURIER_TOKEN;
  const baseUrl = process.env.POLKURIER_HOST ?? "https://api.polkurier.pl";

  if (!authLogin || !authToken) {
    throw new Error(
      "Missing POLKURIER_LOGIN or POLKURIER_TOKEN environment variables",
    );
  }

  return {
    authLogin,
    authToken,
    baseUrl,
  };
}

export async function getPolkurierAuthorization(
  context?: TenantContext,
): Promise<Authorization> {
  const { authLogin, authToken } = await getPolkurierConfig(context);

  return {
    login: authLogin,
    token: authToken,
  };
}

export async function getPolkurierClient(
  context?: TenantContext,
): Promise<PolkurierClient> {
  const { baseUrl } = await getPolkurierConfig(context);

  const authProvider = new AnonymousAuthenticationProvider();
  const adapter = new FetchRequestAdapter(authProvider);
  adapter.baseUrl = baseUrl;

  return createPolkurierClient(adapter);
}

export function unwrapPolkurierResponsePayload<T>(
  payload: unknown,
): T | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }

  if (Array.isArray(payload)) {
    return payload as T;
  }

  if (typeof payload !== "object") {
    return payload as T;
  }

  const record = payload as Record<string, unknown>;
  const additionalData =
    typeof record.additionalData === "object" && record.additionalData !== null
      ? (record.additionalData as Record<string, unknown>)
      : undefined;
  const ownData = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => key !== "additionalData" && value !== undefined,
    ),
  );

  if (Object.keys(ownData).length > 0) {
    return (
      additionalData && Object.keys(additionalData).length > 0
        ? { ...additionalData, ...ownData }
        : ownData
    ) as T;
  }

  if (additionalData) {
    const additionalKeys = Object.keys(additionalData);

    if (
      additionalKeys.length > 0 &&
      additionalKeys.every((key) => /^\d+$/.test(key))
    ) {
      return additionalKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => additionalData[key]) as T;
    }

    return additionalData as T;
  }

  return record as T;
}

export async function postPolkurierEnvelope<T>(
  body: PolkurierPostBody,
): Promise<T | undefined> {
  const client = await getPolkurierClient();
  const response = await client.post(body);

  return unwrapPolkurierResponsePayload<T>(response?.response);
}

export type PolkurierRawRpcResponse = {
  status?: string;
  response?: unknown;
  [key: string]: unknown;
};

export async function postPolkurierRawEnvelope(
  body: Record<string, unknown>,
): Promise<PolkurierRawRpcResponse | string | undefined> {
  const { baseUrl } = await getPolkurierConfig();
  const requestUrl = `${baseUrl.replace(/\/$/, "")}/`;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const rawBody = await response.text();

  let parsedBody: unknown = rawBody;
  if (rawBody.length > 0) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      parsedBody = rawBody;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
    throw new Error(
      `Polkurier API request failed (${response.status}): ${message}`,
    );
  }

  if (!parsedBody) {
    return undefined;
  }

  return parsedBody as PolkurierRawRpcResponse | string;
}
