import type {
  DeploymentMode,
  TenantContext,
  TenantRuntimeFlags,
} from "@sblyvwx/cloud-contracts";

export type { TenantContext } from "@sblyvwx/cloud-contracts";

type TenantEnvironment = Record<string, string | undefined>;
type HeadersLike = {
  get(name: string): string | null;
};

export const DEFAULT_DEPLOYMENT_MODE: DeploymentMode = "dedicated";
export const DEFAULT_DEDICATED_TENANT_ID = "default";

function readProcessEnv(): TenantEnvironment {
  if (typeof process === "undefined") {
    return {};
  }

  return process.env;
}

function firstNonBlank(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

export function parseDeploymentMode(value: string | undefined): DeploymentMode {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_DEPLOYMENT_MODE;
  }

  if (normalized === "dedicated" || normalized === "saas") {
    return normalized;
  }

  throw new Error(
    `Invalid deployment mode "${value}". Expected "dedicated" or "saas".`,
  );
}

function parseBooleanFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeTenantId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readFirstHeaderValue(value: string | null | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
}

export function normalizeTenantHostname(
  value: string | null | undefined,
): string | undefined {
  const rawHost = readFirstHeaderValue(value);

  if (!rawHost) {
    return;
  }

  try {
    const parsed = new URL(
      rawHost.includes("://") ? rawHost : `https://${rawHost}`,
    );
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

    return hostname || undefined;
  } catch {
    return;
  }
}

export function resolveRequestTenantHostname(
  headers: HeadersLike,
): string | undefined {
  return normalizeTenantHostname(
    headers.get("x-forwarded-host") ?? headers.get("host"),
  );
}

export function resolveServerTenantContext(
  env: TenantEnvironment = readProcessEnv(),
  explicitTenantId?: string | null,
): TenantContext {
  const deploymentMode = parseDeploymentMode(
    firstNonBlank(env.KONFI_DEPLOYMENT_MODE, env.DEPLOYMENT_MODE),
  );
  const envTenantId = firstNonBlank(env.KONFI_TENANT_ID, env.DEFAULT_TENANT_ID);
  const tenantId =
    normalizeTenantId(explicitTenantId) ??
    normalizeTenantId(envTenantId) ??
    (deploymentMode === "dedicated" ? DEFAULT_DEDICATED_TENANT_ID : undefined);
  const requireTenantId =
    deploymentMode === "saas" ||
    parseBooleanFlag(
      firstNonBlank(env.KONFI_REQUIRE_TENANT_ID, env.REQUIRE_TENANT_ID),
    );

  return {
    deploymentMode,
    tenantId,
    requireTenantId,
  };
}

export function resolveClientTenantRuntimeFlags(
  env: TenantEnvironment = readProcessEnv(),
): TenantRuntimeFlags {
  const deploymentMode = parseDeploymentMode(
    firstNonBlank(
      env.NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE,
      env.KONFI_DEPLOYMENT_MODE,
      env.DEPLOYMENT_MODE,
    ),
  );

  return {
    deploymentMode,
    requireTenantId:
      deploymentMode === "saas" ||
      parseBooleanFlag(env.NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID),
  };
}

export function requireTenantContextTenantId(
  context: TenantContext,
  operationName = "tenant-owned operation",
): string {
  const tenantId = normalizeTenantId(context.tenantId);

  if (tenantId) {
    return tenantId;
  }

  if (context.requireTenantId) {
    throw new Error(
      `Missing tenantId for ${operationName} in ${context.deploymentMode} deployment mode.`,
    );
  }

  return DEFAULT_DEDICATED_TENANT_ID;
}

export function resolveDocumentTenantId(
  context: TenantContext,
  documentTenantId?: string | null,
): string {
  const tenantId = normalizeTenantId(documentTenantId);

  if (tenantId) {
    return tenantId;
  }

  if (context.deploymentMode === "dedicated") {
    return context.tenantId ?? DEFAULT_DEDICATED_TENANT_ID;
  }

  return requireTenantContextTenantId(context, "tenant-owned document read");
}

export function shouldScopeByTenant(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}

export function withTenantId<T extends object>(
  data: T & { tenantId?: string | null },
  context: TenantContext,
  operationName = "tenant-owned write",
): T & { tenantId: string } {
  const dataTenantId = normalizeTenantId(data.tenantId);
  const contextTenantId = normalizeTenantId(context.tenantId);

  if (dataTenantId && contextTenantId && dataTenantId !== contextTenantId) {
    throw new Error(
      `Tenant mismatch for ${operationName}: data tenantId "${dataTenantId}" does not match context tenantId "${contextTenantId}".`,
    );
  }

  const tenantId =
    dataTenantId ?? requireTenantContextTenantId(context, operationName);

  return {
    ...data,
    tenantId,
  };
}

export function withTenantOwned<T extends object>(
  data: T & { tenantId?: string | null },
  context: TenantContext,
  operationName = "tenant-owned write",
): T & { tenantId?: string | null } {
  return shouldScopeByTenant(context)
    ? withTenantId(data, context, operationName)
    : data;
}
