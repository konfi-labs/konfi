import type {
  Tenant,
  TenantContext,
  TenantDomain,
  TenantModuleFlags,
  TenantStorefrontMaintenance,
} from "@sblyvwx/cloud-contracts";
import { TenantDomainKind, TenantDomainStatus } from "@sblyvwx/cloud-contracts";
import type {
  GoogleStorefrontChannelConfig,
  InpostGeowidgetConfig,
} from "@konfi/utils";

type StoreRuntimeEnvironment = Record<string, string | undefined>;

export type StoreTenantDomain = TenantDomain & {
  adminUrl?: string;
  branding?: Record<string, unknown>;
  channelId: string;
  cdnUrl?: string;
  contact?: Record<string, unknown>;
  legal?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  storeUrl?: string;
};

export interface StorefrontMaintenanceConfig {
  enabled: boolean;
  message?: string;
  title?: string;
}

export interface StoreRuntimeConfig {
  adminBaseUrl?: string;
  branding?: Record<string, unknown>;
  cdnUrl?: string;
  channelId: string;
  contact?: Record<string, unknown>;
  google?: GoogleStorefrontChannelConfig;
  inpost?: InpostGeowidgetConfig;
  hostname?: string;
  legal?: Record<string, unknown>;
  maintenance: StorefrontMaintenanceConfig;
  metadata?: Record<string, unknown>;
  paymentProviders?: {
    przelewy24Configured: boolean;
    stripeConfigured: boolean;
  };
  requestHostname?: string;
  features: {
    aiImageGeneration: boolean;
  };
  storeBaseUrl: string;
  tenantContext: TenantContext;
}

export function resolveCanonicalStorefrontRedirect(params: {
  requestTarget?: string | null;
  runtimeConfig: StoreRuntimeConfig;
}): string | undefined {
  if (params.runtimeConfig.tenantContext.deploymentMode !== "saas") {
    return;
  }

  const requestBaseUrl = normalizeRuntimeBaseUrl(
    params.runtimeConfig.requestHostname ?? params.runtimeConfig.hostname,
  );
  const canonicalBaseUrl = normalizeRuntimeBaseUrl(
    params.runtimeConfig.storeBaseUrl,
  );

  if (!requestBaseUrl || !canonicalBaseUrl) {
    return;
  }

  if (requestBaseUrl === canonicalBaseUrl) {
    return;
  }

  const requestTarget =
    params.requestTarget?.startsWith("/") === true ? params.requestTarget : "/";

  return new URL(requestTarget, `${canonicalBaseUrl}/`).toString();
}

type RuntimePlanSnapshot = {
  moduleFlags?: TenantModuleFlags;
};

type StoreRuntimeTenant = Partial<Tenant> & {
  planSnapshot?: RuntimePlanSnapshot;
  runtimePlanSnapshot?: RuntimePlanSnapshot;
};

function firstNonBlank(...values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

export function readRuntimeString(
  source: Record<string, unknown> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function buildRuntimeAssetUrl(
  cdnUrl: string | undefined,
  path: string | undefined,
) {
  const normalizedPath = path?.trim();

  if (!normalizedPath) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (!cdnUrl) {
    return undefined;
  }

  return `${cdnUrl.replace(/\/+$/g, "")}/${normalizedPath.replace(/^\/+/g, "")}`;
}

export function getRuntimeStoreDisplayName(
  runtimeConfig: Pick<
    StoreRuntimeConfig,
    "branding" | "hostname" | "metadata" | "storeBaseUrl"
  >,
  fallbackName?: string,
): string {
  return (
    readRuntimeString(
      runtimeConfig.branding,
      "displayName",
      "storeName",
      "brandName",
      "name",
      "title",
    ) ??
    readRuntimeString(
      runtimeConfig.metadata,
      "siteName",
      "storeName",
      "storeTitle",
      "title",
      "name",
    ) ??
    firstNonBlank(fallbackName) ??
    normalizeRuntimeHostname(runtimeConfig.hostname) ??
    normalizeRuntimeHostname(runtimeConfig.storeBaseUrl) ??
    "Storefront"
  );
}

export function normalizeRuntimeHostname(
  value: string | null | undefined,
): string | undefined {
  const rawHost = value
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);

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

function isLocalRuntimeHostname(hostname: string | undefined) {
  return Boolean(
    hostname &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "lvh.me" ||
      hostname.endsWith(".lvh.me")),
  );
}

function readRuntimeBoolean(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(normalizedValue);
}

export function normalizeRuntimeBaseUrl(
  value: string | null | undefined,
): string | undefined {
  const normalizedValue = value?.trim().replace(/\/+$/g, "");

  if (!normalizedValue) {
    return;
  }

  try {
    const hostname = normalizeRuntimeHostname(normalizedValue);
    const protocol = isLocalRuntimeHostname(hostname) ? "http" : "https";
    const url = new URL(
      normalizedValue.includes("://")
        ? normalizedValue
        : `${protocol}://${normalizedValue}`,
    );

    return url.origin;
  } catch {
    return;
  }
}

const defaultMaintenancePlanIds = new Set(["pro", "enterprise"]);

function planDefaultsToMaintenance(planId: string | undefined) {
  return defaultMaintenancePlanIds.has(planId?.trim().toLowerCase() ?? "");
}

function isFreeTenantPlan(planId: string | undefined) {
  return planId?.trim().toLowerCase() === "free";
}

function readTenantModuleFlags(
  tenant: StoreRuntimeTenant | undefined,
): TenantModuleFlags {
  return {
    ...tenant?.runtimePlanSnapshot?.moduleFlags,
    ...tenant?.planSnapshot?.moduleFlags,
    ...tenant?.moduleFlags,
  };
}

function resolveRuntimeFeatures(params: {
  tenant?: StoreRuntimeTenant;
  tenantContext: TenantContext;
}): StoreRuntimeConfig["features"] {
  if (params.tenantContext.deploymentMode !== "saas") {
    return {
      aiImageGeneration: true,
    };
  }

  if (params.tenant?.quotaEnforcementDisabled === true) {
    return {
      aiImageGeneration: true,
    };
  }

  const moduleFlags = readTenantModuleFlags(params.tenant);

  return {
    aiImageGeneration:
      !isFreeTenantPlan(params.tenant?.planId) && moduleFlags.aiImage !== false,
  };
}

function normalizeMaintenance(
  maintenance: TenantStorefrontMaintenance | undefined,
): Partial<StorefrontMaintenanceConfig> | undefined {
  if (!maintenance) {
    return undefined;
  }

  return {
    ...(typeof maintenance.enabled === "boolean"
      ? { enabled: maintenance.enabled }
      : {}),
    ...(typeof maintenance.message === "string" && maintenance.message.trim()
      ? { message: maintenance.message.trim() }
      : {}),
    ...(typeof maintenance.title === "string" && maintenance.title.trim()
      ? { title: maintenance.title.trim() }
      : {}),
  };
}

function resolveStorefrontMaintenance(params: {
  domain?: Partial<StoreTenantDomain>;
  env: StoreRuntimeEnvironment;
  tenant?: Partial<Tenant>;
  tenantContext: TenantContext;
}): StorefrontMaintenanceConfig {
  const domainMaintenance = normalizeMaintenance(params.domain?.maintenance);
  const tenantMaintenance = normalizeMaintenance(
    params.tenant?.storefrontMaintenance,
  );
  const defaultEnabled =
    params.tenantContext.deploymentMode === "saas"
      ? planDefaultsToMaintenance(params.tenant?.planId)
      : readRuntimeBoolean(
          firstNonBlank(
            params.env.STORE_MAINTENANCE_MODE,
            params.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE,
          ),
        );
  const message = domainMaintenance?.message ?? tenantMaintenance?.message;
  const title = domainMaintenance?.title ?? tenantMaintenance?.title;

  return {
    enabled:
      domainMaintenance?.enabled ??
      tenantMaintenance?.enabled ??
      defaultEnabled,
    ...(message ? { message } : {}),
    ...(title ? { title } : {}),
  };
}

function isStorefrontDomain(domain: Partial<TenantDomain>) {
  const kind = domain.kind?.toString().toUpperCase();

  return (
    kind === TenantDomainKind.STOREFRONT || kind === TenantDomainKind.CUSTOM
  );
}

function resolveDedicatedGoogleConfig(
  env: StoreRuntimeEnvironment,
): GoogleStorefrontChannelConfig | undefined {
  const placeId = firstNonBlank(env.GOOGLE_PLACE_ID);
  const tagManagerId = firstNonBlank(env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID);

  if (!placeId && !tagManagerId) {
    return undefined;
  }

  return {
    ...(placeId ? { placeId } : {}),
    reviewsEnabled: Boolean(placeId),
    tagManagerEnabled: Boolean(tagManagerId),
    ...(tagManagerId ? { tagManagerId } : {}),
  };
}

function resolveDedicatedInpostConfig(
  env: StoreRuntimeEnvironment,
): InpostGeowidgetConfig | undefined {
  const geowidgetToken = firstNonBlank(env.NEXT_PUBLIC_INPOST_GEOWIDGET_TOKEN);

  return geowidgetToken ? { geowidgetToken } : undefined;
}

export function isActiveStoreTenantDomain(
  domain: Partial<TenantDomain> | undefined,
): domain is StoreTenantDomain {
  return Boolean(
    domain?.tenantId &&
    domain.channelId &&
    domain.status?.toString().toUpperCase() === TenantDomainStatus.ACTIVE &&
    isStorefrontDomain(domain),
  );
}

export function resolveStoreRuntimeConfig(params: {
  domain?: Partial<StoreTenantDomain>;
  env: StoreRuntimeEnvironment;
  hostname?: string;
  tenant?: StoreRuntimeTenant;
  tenantContext: TenantContext;
}): StoreRuntimeConfig | null {
  const hostname = normalizeRuntimeHostname(params.hostname);
  const deploymentMode = params.tenantContext.deploymentMode;

  if (deploymentMode === "saas") {
    if (!isActiveStoreTenantDomain(params.domain)) {
      return null;
    }

    const localRequestBaseUrl = isLocalRuntimeHostname(hostname)
      ? params.hostname
      : undefined;
    const storeBaseUrl = normalizeRuntimeBaseUrl(
      firstNonBlank(
        localRequestBaseUrl,
        params.domain.storeUrl,
        params.domain.hostname,
        hostname,
      ),
    );

    if (!storeBaseUrl) {
      return null;
    }

    return {
      adminBaseUrl: normalizeRuntimeBaseUrl(
        firstNonBlank(
          params.domain.adminUrl,
          params.env.ADMIN_URL,
          params.env.NEXT_PUBLIC_ADMIN_URL,
        ),
      ),
      branding: params.domain.branding,
      cdnUrl: normalizeRuntimeBaseUrl(
        firstNonBlank(params.domain.cdnUrl, params.env.NEXT_PUBLIC_CDN_URL),
      ),
      channelId: params.domain.channelId,
      contact: params.domain.contact,
      google: undefined,
      inpost: undefined,
      features: resolveRuntimeFeatures({
        tenant: params.tenant,
        tenantContext: params.tenantContext,
      }),
      hostname: params.domain.hostname ?? hostname,
      legal: params.domain.legal,
      maintenance: resolveStorefrontMaintenance({
        domain: params.domain,
        env: params.env,
        tenant: params.tenant,
        tenantContext: params.tenantContext,
      }),
      metadata: params.domain.metadata,
      requestHostname: params.hostname,
      storeBaseUrl,
      tenantContext: {
        ...params.tenantContext,
        tenantId: params.domain.tenantId,
        requireTenantId: true,
      },
    };
  }

  const channelId = firstNonBlank(params.env.NEXT_PUBLIC_STORE_CHANNEL_ID);
  const storeBaseUrl = normalizeRuntimeBaseUrl(
    firstNonBlank(
      params.env.STORE_URL,
      params.env.NEXT_PUBLIC_STORE_URL,
      hostname,
    ),
  );

  if (!channelId || !storeBaseUrl) {
    return null;
  }

  return {
    adminBaseUrl: normalizeRuntimeBaseUrl(
      firstNonBlank(params.env.ADMIN_URL, params.env.NEXT_PUBLIC_ADMIN_URL),
    ),
    cdnUrl: normalizeRuntimeBaseUrl(params.env.NEXT_PUBLIC_CDN_URL),
    channelId,
    hostname,
    google: resolveDedicatedGoogleConfig(params.env),
    inpost: resolveDedicatedInpostConfig(params.env),
    features: resolveRuntimeFeatures({
      tenantContext: params.tenantContext,
    }),
    maintenance: resolveStorefrontMaintenance({
      env: params.env,
      tenantContext: params.tenantContext,
    }),
    paymentProviders: {
      przelewy24Configured: Boolean(
        params.env.PRZELEWY24_API_KEY &&
        params.env.PRZELEWY24_CRC &&
        params.env.PRZELEWY24_POS_ID,
      ),
      stripeConfigured: Boolean(
        params.env.STRIPE_SECRET_KEY && params.env.STRIPE_WEBHOOK_SECRET,
      ),
    },
    storeBaseUrl,
    tenantContext: params.tenantContext,
  };
}

export function resolveStaticStoreRuntimeConfig(params: {
  env: StoreRuntimeEnvironment;
  tenantContext: TenantContext;
}): StoreRuntimeConfig | null {
  if (params.tenantContext.deploymentMode === "saas") {
    return null;
  }

  return resolveStoreRuntimeConfig({
    env: params.env,
    tenantContext: params.tenantContext,
  });
}
