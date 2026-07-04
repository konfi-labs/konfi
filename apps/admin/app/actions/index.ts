"use server";

import { fallbackLng, headerName } from "@/i18n/settings";
import {
  adminTenantIdCookieName,
  createSessionCookie,
  getAdminDb,
  getRuntimeFirestoreDatabaseId,
  getTenantContextForRequest,
  revokeRefreshTokens,
  verifyAnyIdToken,
  verifySessionCookie,
} from "@/lib/firebase/serverApp";
import {
  ADMIN_AUTH_ERROR_COOKIE_NAME,
  ADMIN_AUTH_ERROR_QUERY_PARAM,
  type AdminAuthErrorReason,
} from "@/lib/auth-errors";
import { normalizeTenantContextHint } from "@/lib/tenant-handoff";
import { MICROSOFT_TOKENS_COOKIE } from "@/lib/microsoft-auth";
import { getFakturowniaConfig } from "@/lib/fakturownia/client";
import { getPolkurierConfig } from "@/lib/polkurier/client";
import {
  assertProcessEnvIntegrationAllowed,
  scopeEnvBackedIntegrationFlags,
} from "@/lib/integration-runtime-config";
import { getTenantIntegrationConfigFlags } from "@/lib/tenant-integration-config-flags";
import { registerDeveloperWithMerchantApi } from "@konfi/google";
import {
  searchApp,
  searchCustomersIndex,
  searchOrdersIndex,
  searchProductsIndex,
} from "@konfi/meilisearch";
import { AUTH_LOGIN } from "@konfi/utils/routes";
import { cacheLife, cacheTag } from "next/cache";
import { cookies, headers } from "next/headers";
import {
  getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId,
  getTenantMembershipForUid,
  isAdminTenantMembership,
  listActiveAdminTenantMembershipsForUid,
  pickDefaultTenantMembershipForLogin,
  requireAdminAuth,
  requireTenantAdminChannelAccess,
} from "./auth-utils";
import {
  buildRevalidateRouteUrlFromApiBaseUrl,
  buildRevalidateTagUrlFromApiBaseUrl,
} from "./revalidate-cache.utils";
import { getRevalidateApiBaseUrlsForRequest } from "./revalidate-cache.resolver";

const ADMIN_CONFIG_FLAGS_TAG = "admin-config-flags";
const ADMIN_AUTH_ERROR_COOKIE_MAX_AGE_SECONDS = 5 * 60;
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export interface TenantSwitcherOption {
  id: string;
  name: string;
  role: string;
}

function debugAdminAuth(event: string, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[admin-auth] ${event}`, details);
}

function normalizeTenantSwitcherId(value: string): string {
  const tenantId = value.trim();

  if (!tenantId || tenantId.includes("/")) {
    throw new Error("Invalid tenant ID.");
  }

  return tenantId;
}

function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

function buildLoginUrl(lng: string, reason?: AdminAuthErrorReason) {
  const loginUrl = `/${lng}${AUTH_LOGIN}`;

  if (!reason) {
    return loginUrl;
  }

  const params = new URLSearchParams({
    [ADMIN_AUTH_ERROR_QUERY_PARAM]: reason,
  });

  return `${loginUrl}?${params.toString()}`;
}

function setAdminAuthErrorCookie(
  cookieStore: CookieStore,
  reason: AdminAuthErrorReason,
) {
  cookieStore.set(ADMIN_AUTH_ERROR_COOKIE_NAME, reason, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_AUTH_ERROR_COOKIE_MAX_AGE_SECONDS,
  });
}

function clearAdminAuthErrorCookie(cookieStore: CookieStore) {
  cookieStore.set(ADMIN_AUTH_ERROR_COOKIE_NAME, "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

type AdminLoginAuthorization =
  | {
      reason: null;
      tenantId?: string;
    }
  | {
      reason: AdminAuthErrorReason;
    };

async function getAdminLoginAuthorization(
  uid: string,
  isSuperAdmin: boolean,
  tenantContextHint?: string,
): Promise<AdminLoginAuthorization> {
  const tenantContext = await getTenantContextForRequest(tenantContextHint);
  debugAdminAuth("login tenant context", {
    deploymentMode: tenantContext.deploymentMode,
    hasTenantId: Boolean(tenantContext.tenantId),
    requireTenantId: tenantContext.requireTenantId,
    tenantId: tenantContext.tenantId,
    tenantContextHint: tenantContextHint ?? null,
  });

  if (!tenantContext.requireTenantId) {
    return { reason: null };
  }

  if (!tenantContext.tenantId) {
    const memberships = await listActiveAdminTenantMembershipsForUid(uid);
    const defaultMembership = pickDefaultTenantMembershipForLogin(memberships);
    debugAdminAuth("login membership fallback", {
      adminMembershipCount: memberships.length,
      defaultTenantId: defaultMembership?.tenantId ?? null,
      tenantIds: memberships.map((membership) => membership.tenantId),
    });

    if (defaultMembership) {
      return {
        reason: null,
        tenantId: defaultMembership.tenantId,
      };
    }

    return { reason: "tenant-membership-required" };
  }

  if (isSuperAdmin) {
    return { reason: null, tenantId: tenantContext.tenantId };
  }

  const membership = await getTenantMembershipForUid(
    tenantContext.tenantId,
    uid,
  );
  debugAdminAuth("login tenant membership lookup", {
    membershipStatus: membership?.status ?? null,
    role: membership?.role ?? null,
    tenantId: tenantContext.tenantId,
  });

  return isAdminTenantMembership(membership)
    ? { reason: null, tenantId: tenantContext.tenantId }
    : { reason: "tenant-membership-required" };
}

async function getAdminConfigFlagsCached() {
  "use cache";
  cacheLife("days");
  cacheTag(ADMIN_CONFIG_FLAGS_TAG);

  return {
    microsoftConfigured: Boolean(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_REDIRECT_URI,
    ),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    allegroConfigured: Boolean(
      process.env.ALLEGRO_CLIENT_ID && process.env.ALLEGRO_CLIENT_SECRET,
    ),
    stripeConfigured: Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    ),
    przelewy24Configured: Boolean(
      process.env.PRZELEWY24_API_KEY &&
      process.env.PRZELEWY24_CRC &&
      process.env.PRZELEWY24_POS_ID,
    ),
    meilisearchApiKeyProvided: Boolean(process.env.MEILISEARCH_API_KEY),
    githubIssueReportingEnabled: Boolean(
      process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME,
    ),
    fakturowniaApiKeyProvided: Boolean(
      process.env.FAKTUROWNIA_API_KEY && process.env.FAKTUROWNIA_SUBDOMAIN,
    ),
    polkurierApiKeyProvided: Boolean(
      process.env.POLKURIER_HOST &&
      process.env.POLKURIER_LOGIN &&
      process.env.POLKURIER_TOKEN,
    ),
  };
}

type AdminConfigFlags = Awaited<ReturnType<typeof getAdminConfigFlagsCached>>;

async function getScopedAdminConfigFlags(): Promise<AdminConfigFlags> {
  const [flags, tenantContext] = await Promise.all([
    getAdminConfigFlagsCached(),
    getTenantContextForRequest(),
  ]);
  const scopedFlags = scopeEnvBackedIntegrationFlags(flags, tenantContext);

  if (
    tenantContext.deploymentMode === "saas" ||
    tenantContext.requireTenantId
  ) {
    const tenantIntegrationFlags = await getTenantIntegrationConfigFlags({
      env: {
        allegroConfigured: flags.allegroConfigured,
        microsoftConfigured: flags.microsoftConfigured,
      },
      tenantContext,
    });

    return {
      ...scopedFlags,
      ...tenantIntegrationFlags,
    };
  }

  return scopedFlags;
}

export async function handleIdToken(
  idToken: string,
  revoke: boolean = false,
  route?: string,
  tenantContextHint?: string,
) {
  let isAdminClaim = false;
  let isCourierClaim = false;
  try {
    // Set session expiration to 1 week (7 days).
    // Firebase session cookies support 5 minutes to 2 weeks
    const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days in milliseconds
    const maxAge = Math.floor(expiresIn / 1000); // Convert to seconds for cookie maxAge
    const cookieStore = await cookies();
    const headersList = await headers();

    // Get language from header set by proxy
    const lng = headersList.get(headerName) || fallbackLng;
    const loginUrl = buildLoginUrl(lng);
    debugAdminAuth("handleIdToken start", {
      hasToken: idToken.length > 0,
      lng,
      revoke,
      route,
      runtimeDatabaseId: getRuntimeFirestoreDatabaseId() ?? "(default)",
    });

    const baseCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };

    if (revoke) {
      // Clear session cookies on revoke
      const sessionCookie = cookieStore.get("__session");
      if (sessionCookie) {
        const decodedClaims = await verifySessionCookie(sessionCookie.value);
        if (decodedClaims) {
          // Revoke refresh tokens to invalidate all sessions
          await revokeRefreshTokens(decodedClaims.uid);
        }
      }

      cookieStore.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
      cookieStore.set("__isAdmin", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set("__isCourier", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set(adminTenantIdCookieName, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set(MICROSOFT_TOKENS_COOKIE, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      return { redirect: loginUrl, status: "signed-out" as const };
    }

    // Verify the ID token and get user roles
    const userRecord = await verifyAnyIdToken(idToken);

    if (!userRecord) {
      debugAdminAuth("verifyAnyIdToken failed", {
        hasToken: idToken.length > 0,
      });
      cookieStore.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
      cookieStore.set("__isAdmin", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set("__isCourier", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set(adminTenantIdCookieName, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      setAdminAuthErrorCookie(cookieStore, "session-error");
      return {
        redirect: buildLoginUrl(lng, "session-error"),
        status: "error" as const,
        reason: "session-error" as const,
      };
    }

    isAdminClaim = userRecord.customClaims?.admin === true;
    isCourierClaim = isAdminClaim
      ? false
      : userRecord.customClaims?.courier === true;
    debugAdminAuth("verified token", {
      accessLevel: userRecord.customClaims?.accessLevel ?? null,
      admin: isAdminClaim,
      courier: isCourierClaim,
      email: userRecord.email ?? null,
      uid: userRecord.uid,
    });

    if (!isAdminClaim && !isCourierClaim) {
      debugAdminAuth("authorization failed: missing role claim", {
        uid: userRecord.uid,
      });
      cookieStore.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
      cookieStore.set("__isAdmin", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set("__isCourier", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set(adminTenantIdCookieName, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      setAdminAuthErrorCookie(cookieStore, "admin-access-required");
      return {
        redirect: buildLoginUrl(lng, "admin-access-required"),
        status: "unauthorized" as const,
        reason: "admin-access-required" as const,
      };
    }

    const authorization = await getAdminLoginAuthorization(
      userRecord.uid,
      userRecord.customClaims?.accessLevel === 9999,
      normalizeTenantContextHint(tenantContextHint),
    );

    if (authorization.reason) {
      debugAdminAuth("authorization failed", {
        reason: authorization.reason,
        uid: userRecord.uid,
      });
      cookieStore.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
      cookieStore.set("__isAdmin", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set("__isCourier", "false", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      cookieStore.set(adminTenantIdCookieName, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
      setAdminAuthErrorCookie(cookieStore, authorization.reason);
      return {
        redirect: buildLoginUrl(lng, authorization.reason),
        status: "unauthorized" as const,
        reason: authorization.reason,
      };
    }

    const authorizedTenantId = authorization.tenantId;

    // Create Firebase session cookie
    const sessionCookie = await createSessionCookie(idToken, expiresIn);

    if (!sessionCookie) {
      debugAdminAuth("session cookie creation failed", {
        uid: userRecord.uid,
      });
      throw new Error("Failed to create session cookie");
    }

    // Set the session cookie
    cookieStore.set("__session", sessionCookie, {
      ...baseCookieOptions,
      maxAge,
    });

    // Set role cookies for quick access
    cookieStore.set("__isAdmin", isAdminClaim.toString(), {
      ...baseCookieOptions,
      maxAge,
    });
    cookieStore.set("__isCourier", isCourierClaim.toString(), {
      ...baseCookieOptions,
      maxAge,
    });
    if (authorizedTenantId) {
      cookieStore.set(adminTenantIdCookieName, authorizedTenantId, {
        ...baseCookieOptions,
        maxAge,
      });
    } else {
      cookieStore.set(adminTenantIdCookieName, "", {
        ...baseCookieOptions,
        maxAge: 0,
      });
    }
    clearAdminAuthErrorCookie(cookieStore);
    debugAdminAuth("session authorized", {
      admin: isAdminClaim,
      courier: isCourierClaim,
      redirect: route ?? loginUrl,
      tenantId: authorizedTenantId ?? null,
      uid: userRecord.uid,
    });

    if (!isAdminClaim) {
      // If not admin but courier, send to delivery route
      if (isCourierClaim) {
        return {
          redirect: `/${lng}/delivery`,
          status: "authorized" as const,
          tenantId: authorizedTenantId,
        };
      }
      setAdminAuthErrorCookie(cookieStore, "admin-access-required");
      return {
        redirect: buildLoginUrl(lng, "admin-access-required"),
        status: "unauthorized" as const,
        reason: "admin-access-required" as const,
      };
    } else if (isAdminClaim && route) {
      return {
        redirect: route,
        status: "authorized" as const,
        tenantId: authorizedTenantId,
      };
    }
    return {
      redirect: loginUrl,
      status: "authorized" as const,
      tenantId: authorizedTenantId,
    };
  } catch (error) {
    console.error(error);
    const cookieStore = await cookies();
    const headersList = await headers();
    const lng = headersList.get(headerName) || fallbackLng;
    debugAdminAuth("handleIdToken caught error", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error,
      hasToken: idToken.length > 0,
      revoke,
      route,
    });
    cookieStore.set(adminTenantIdCookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    setAdminAuthErrorCookie(cookieStore, "session-error");
    return {
      redirect: buildLoginUrl(lng, "session-error"),
      status: "error" as const,
      reason: "session-error" as const,
    };
  }
}

export async function listTenantSwitcherOptions(): Promise<
  TenantSwitcherOption[]
> {
  const tenantContext = await getTenantContextForRequest();
  if (
    tenantContext.deploymentMode !== "saas" &&
    !tenantContext.requireTenantId
  ) {
    return [];
  }

  const cookieStore = await cookies();
  const decodedClaims = await verifySessionCookie(
    cookieStore.get("__session")?.value ?? "",
  );

  if (!decodedClaims?.uid || decodedClaims.admin !== true) {
    return [];
  }

  const memberships = await listActiveAdminTenantMembershipsForUid(
    decodedClaims.uid,
  );

  if (memberships.length === 0) {
    return [];
  }

  const db = getAdminDb();
  const tenantSnapshots = await Promise.all(
    memberships.map((membership) =>
      db.collection("tenants").doc(membership.tenantId).get(),
    ),
  );

  return memberships
    .map((membership, index) => {
      const tenantData = tenantSnapshots[index]?.data() as
        | { name?: unknown }
        | undefined;
      const tenantName =
        typeof tenantData?.name === "string" && tenantData.name.trim()
          ? tenantData.name.trim()
          : membership.tenantId;

      return {
        id: membership.tenantId,
        name: tenantName,
        role: membership.role,
      };
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function switchTenantContextAction(
  tenantId: string,
): Promise<{ ok: true; tenantId: string }> {
  const tenantContext = await getTenantContextForRequest();
  if (
    tenantContext.deploymentMode !== "saas" &&
    !tenantContext.requireTenantId
  ) {
    throw new Error("Tenant switching is only available in SaaS runtime.");
  }

  const targetTenantId = normalizeTenantSwitcherId(tenantId);
  const cookieStore = await cookies();
  const decodedClaims = await verifySessionCookie(
    cookieStore.get("__session")?.value ?? "",
  );

  if (!decodedClaims?.uid || decodedClaims.admin !== true) {
    throw new Error("Unauthorized.");
  }

  const membership = await getTenantMembershipForUid(
    targetTenantId,
    decodedClaims.uid,
  );

  if (!isAdminTenantMembership(membership)) {
    throw new Error("Tenant access is required.");
  }

  cookieStore.set(
    adminTenantIdCookieName,
    targetTenantId,
    adminSessionCookieOptions(),
  );

  return { ok: true, tenantId: targetTenantId };
}

/**
 * Returns all admin config flags in a single cached call.
 * Use this instead of individual flag checks to avoid waterfall requests.
 */
export async function getAdminConfigFlags() {
  await checkAdmin();
  return getScopedAdminConfigFlags();
}

/**
 * Server-side prefetch of config flags for SWR fallback data.
 * Skips auth check — only returns which env vars are configured (booleans),
 * not their values. Used in the layout to eliminate client-side loading flash.
 */
export async function prefetchAdminConfigFlags() {
  return getScopedAdminConfigFlags();
}

export async function isMicrosoftConfigured() {
  await checkAdminAndEnv();
  const flags = await getScopedAdminConfigFlags();
  return flags.microsoftConfigured;
}

export async function isResendConfigured() {
  await checkAdmin();
  const flags = await getScopedAdminConfigFlags();
  return flags.resendConfigured;
}

export async function isAllegroConfigured() {
  await checkAdmin();
  const flags = await getScopedAdminConfigFlags();
  return flags.allegroConfigured;
}

export async function isStripeConfigured() {
  await checkAdmin();
  const flags = await getAdminConfigFlagsCached();
  return flags.stripeConfigured;
}

export async function isPrzelewy24Configured() {
  await checkAdmin();
  const flags = await getAdminConfigFlagsCached();
  return flags.przelewy24Configured;
}

export async function isMeilisearchApiKeyProvided() {
  await checkAdminAndEnv();
  const flags = await getAdminConfigFlagsCached();
  return flags.meilisearchApiKeyProvided;
}

export async function meilisearchSearch(
  type: "CUSTOMERS" | "ORDERS" | "PRODUCTS" | "APP",
  query: string,
  channelId?: string,
  page?: number,
  hitsPerPage?: number,
  searchFields?: import("@konfi/meilisearch").OrdersSearchField[],
) {
  await checkAdminAndEnv();
  try {
    const tenantContext = await getTenantContextForRequest();
    const tenantId = getTenantAdminScopeTenantId(tenantContext);

    if (type === "CUSTOMERS") {
      return await searchCustomersIndex(
        query,
        page,
        hitsPerPage,
        undefined,
        tenantId,
      );
    } else if (type === "ORDERS" && channelId) {
      const authorizedChannelId =
        await requireTenantAdminChannelAccess(channelId);
      return await searchOrdersIndex(
        query,
        authorizedChannelId,
        page,
        hitsPerPage,
        searchFields,
        undefined,
        tenantId,
      );
    } else if (type === "PRODUCTS" && channelId) {
      const authorizedChannelId =
        await requireTenantAdminChannelAccess(channelId);
      return await searchProductsIndex(
        query,
        authorizedChannelId,
        undefined,
        tenantId,
      );
    } else {
      console.error("Invalid type provided for MeiliSearch.");
      return undefined;
    }
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function meilisearchMultiSearch(query: string) {
  await checkAdminAndEnv();
  try {
    const { channelAccess, tenantContext } =
      await getTenantAdminChannelAccessContext();
    const tenantId = getTenantAdminScopeTenantId(tenantContext);

    return await searchApp(query, undefined, {
      ...(tenantId ? { tenantId } : {}),
      ...(!channelAccess.allChannels
        ? { channelIds: channelAccess.channelIds }
        : {}),
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function isFakturowniaApiKeyProvided() {
  await checkAdmin();
  const flags = await getScopedAdminConfigFlags();
  return flags.fakturowniaApiKeyProvided;
}

export async function isPolkurierApiKeyProvided() {
  await checkAdmin();
  const flags = await getScopedAdminConfigFlags();
  return flags.polkurierApiKeyProvided;
}

export async function checkAdmin() {
  await requireAdminAuth();
}

export async function checkAdminAndEnv() {
  await checkAdmin();
}

function getRevalidateSecret(): string {
  const secret = process.env.REVALIDATE_SECRET?.trim();

  if (!secret) {
    throw new Error("REVALIDATE_SECRET is not set in environment variables.");
  }

  return secret;
}

export async function checkPolkurierEnv() {
  await checkAdmin();
  const tenantContext = await getTenantContextForRequest();
  if (
    tenantContext.deploymentMode === "saas" ||
    tenantContext.requireTenantId
  ) {
    await getPolkurierConfig(tenantContext);
    return;
  }

  assertProcessEnvIntegrationAllowed("Polkurier", tenantContext);
  if (!process.env.POLKURIER_HOST) {
    throw new Error("POLKURIER_HOST is not set in environment variables.");
  }
  if (!process.env.POLKURIER_LOGIN) {
    throw new Error("POLKURIER_LOGIN is not set in environment variables.");
  }
  if (!process.env.POLKURIER_TOKEN) {
    throw new Error("POLKURIER_TOKEN is not set in environment variables.");
  }
}

export async function checkFakturowniaEnv() {
  await checkAdmin();
  const tenantContext = await getTenantContextForRequest();
  if (
    tenantContext.deploymentMode === "saas" ||
    tenantContext.requireTenantId
  ) {
    await getFakturowniaConfig(tenantContext);
    return;
  }

  assertProcessEnvIntegrationAllowed("Fakturownia", tenantContext);
  if (!process.env.FAKTUROWNIA_SUBDOMAIN) {
    throw new Error(
      "FAKTUROWNIA_SUBDOMAIN is not set in environment variables.",
    );
  }
  if (!process.env.FAKTUROWNIA_API_KEY) {
    throw new Error("FAKTUROWNIA_API_KEY is not set in environment variables.");
  }
}

const revalidateCache = async (url: string, secret: string) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to revalidate cache. Status: ${response.status} ${response.statusText}. Response: ${text}`,
      );
    }
  } catch (error) {
    console.error("Error revalidating cache:", error);
    throw error;
  }
};

export async function revalidateTagCache(tag: string) {
  await checkAdmin();
  const secret = getRevalidateSecret();

  try {
    const urls = (await getRevalidateApiBaseUrlsForRequest()).map((baseUrl) =>
      buildRevalidateTagUrlFromApiBaseUrl(tag, baseUrl),
    );
    await Promise.all(urls.map((url) => revalidateCache(url, secret)));
  } catch (error) {
    console.error("Error revalidating tag cache:", error);
    throw error;
  }
}

export async function revalidateRouteCache(tag: string, path: string) {
  await checkAdmin();
  const secret = getRevalidateSecret();

  try {
    const urls = (await getRevalidateApiBaseUrlsForRequest()).map((baseUrl) =>
      buildRevalidateRouteUrlFromApiBaseUrl(tag, path, baseUrl),
    );
    await Promise.all(urls.map((url) => revalidateCache(url, secret)));
  } catch (error) {
    console.error("Error revalidating route cache:", error);
    throw error;
  }
}

export async function registerDeveloper(developerEmail: string) {
  await checkAdminAndEnv();
  try {
    await registerDeveloperWithMerchantApi(developerEmail);
  } catch (error) {
    console.error("Error registering developer with Merchant API:", error);
    throw error;
  }
}

/**
 * Check if GitHub issue reporting is enabled via environment variable
 */
export async function isGitHubIssueReportingEnabled() {
  await checkAdmin();
  const flags = await getAdminConfigFlagsCached();
  return flags.githubIssueReportingEnabled;
}
