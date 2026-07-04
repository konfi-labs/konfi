import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  TenantDomainKind,
  TenantDomainStatus,
  type TenantContext,
  type TenantDomain,
} from "@sblyvwx/cloud-contracts";

type StorefrontTenantDomain = TenantDomain & {
  storeUrl?: string;
};

const tenantDomainsCollection = "tenantDomains";

function firstNonBlank(...values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

export function normalizeStorefrontBaseUrl(value: string): string {
  const normalizedValue = value.trim().replace(/\/+$/u, "");
  const url = new URL(
    /^https?:\/\//iu.test(normalizedValue)
      ? normalizedValue
      : `https://${normalizedValue}`,
  );

  return url.origin;
}

function isStorefrontDomain(domain: Partial<TenantDomain>) {
  const kind = domain.kind?.toString().toUpperCase();

  return (
    kind === TenantDomainKind.STOREFRONT || kind === TenantDomainKind.CUSTOM
  );
}

function isActiveStorefrontDomain(
  domain: Partial<TenantDomain> | undefined,
): domain is StorefrontTenantDomain {
  return Boolean(
    domain?.tenantId &&
    domain.channelId &&
    domain.status?.toString().toUpperCase() === TenantDomainStatus.ACTIVE &&
    isStorefrontDomain(domain),
  );
}

function storefrontDomainPriority(domain: StorefrontTenantDomain) {
  if (domain.storeUrl) {
    return 0;
  }

  if (domain.kind === TenantDomainKind.CUSTOM) {
    return 1;
  }

  return 2;
}

export async function listActiveSaasStorefrontDomains(input: {
  channelId?: string;
  tenantId: string;
}): Promise<StorefrontTenantDomain[]> {
  const domainsSnapshot = await getAdminDb()
    .collection(tenantDomainsCollection)
    .where("tenantId", "==", input.tenantId)
    .get();

  return domainsSnapshot.docs
    .map((document) => document.data() as Partial<StorefrontTenantDomain>)
    .filter(
      (domain): domain is StorefrontTenantDomain =>
        isActiveStorefrontDomain(domain) &&
        (!input.channelId || domain.channelId === input.channelId),
    )
    .sort(
      (leftDomain, rightDomain) =>
        storefrontDomainPriority(leftDomain) -
          storefrontDomainPriority(rightDomain) ||
        leftDomain.hostname.localeCompare(rightDomain.hostname),
    );
}

export async function resolveSaasStorefrontBaseUrls(input: {
  channelId?: string;
  tenantId: string;
}): Promise<string[]> {
  const domains = await listActiveSaasStorefrontDomains(input);
  const urls = new Set<string>();

  for (const domain of domains) {
    urls.add(normalizeStorefrontBaseUrl(domain.storeUrl ?? domain.hostname));
  }

  return [...urls];
}

export async function resolveSaasStorefrontBaseUrl(input: {
  channelId?: string;
  tenantId: string;
}): Promise<string> {
  const [storefrontBaseUrl] = await resolveSaasStorefrontBaseUrls(input);

  if (!storefrontBaseUrl) {
    throw new Error("Active storefront domain is required.");
  }

  return storefrontBaseUrl;
}

export function resolveDedicatedStorefrontBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitDevStoreUrl =
    env.NEXT_PUBLIC_STORE_DEV_URL?.trim() ||
    env.NEXT_PUBLIC_STORE_LOCAL_URL?.trim();

  if (env.NODE_ENV === "development") {
    return normalizeStorefrontBaseUrl(
      explicitDevStoreUrl || "http://localhost:3000",
    );
  }

  const storeUrl = firstNonBlank(env.STORE_URL, env.NEXT_PUBLIC_STORE_URL);

  if (!storeUrl) {
    throw new Error("Store URL is not configured.");
  }

  return normalizeStorefrontBaseUrl(storeUrl);
}

export async function resolveStorefrontBaseUrl(input: {
  channelId?: string;
  env?: NodeJS.ProcessEnv;
  tenantContext: TenantContext;
  tenantId: string;
}): Promise<string> {
  if (isSharedSaasTenantRuntime(input.tenantContext)) {
    return resolveSaasStorefrontBaseUrl({
      channelId: input.channelId,
      tenantId: input.tenantId,
    });
  }

  return resolveDedicatedStorefrontBaseUrl(input.env);
}

export async function resolveStorefrontBaseUrls(input: {
  channelId?: string;
  env?: NodeJS.ProcessEnv;
  tenantContext: TenantContext;
  tenantId: string;
}): Promise<string[]> {
  if (isSharedSaasTenantRuntime(input.tenantContext)) {
    const urls = await resolveSaasStorefrontBaseUrls({
      channelId: input.channelId,
      tenantId: input.tenantId,
    });

    if (urls.length === 0) {
      throw new Error("Active storefront domain is required.");
    }

    return urls;
  }

  return [resolveDedicatedStorefrontBaseUrl(input.env)];
}
