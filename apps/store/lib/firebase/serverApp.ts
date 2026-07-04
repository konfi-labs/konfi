// enforces that this code can only be called on the server
// https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment
import "server-only";

import {
  connectFirebaseClientEmulators,
  resolveRequestTenantHostname,
  resolveServerTenantContext,
  shouldUseFirebaseEmulators,
} from "@konfi/firebase";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import {
  getMessaging,
  type Messaging as AdminMessaging,
} from "firebase-admin/messaging";
import {
  getAppCheck,
  type AppCheck,
  type VerifyAppCheckTokenResponse,
} from "firebase-admin/app-check";
import {
  DEFAULT_LOCALE,
  Locale,
  type StorefrontSharingSettings,
  type dbMetadata,
  type dbPageContent,
} from "@konfi/types";
import {
  type TenantContext,
  type TenantDomain,
  TenantDomainStatus,
  type Tenant,
} from "@sblyvwx/cloud-contracts";
import { formatMetadataResult } from "@konfi/utils";
import { initializeServerApp, type FirebaseServerApp } from "firebase/app";
import { type AppCheckTokenResult } from "firebase/app-check";
import {
  getFirestore as getClientFirestore,
  type Firestore as ClientFirestore,
} from "firebase/firestore";
import { getStorage as getClientStorage } from "firebase/storage";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { firebaseConfig } from "./config";
import { applyStorefrontSharingMetadata } from "../storefront-editor/metadata-assets";
import {
  sanitizeStorefrontSharing,
  storefrontSharingCacheTag,
} from "../storefront-editor/sharing-settings";
import {
  normalizeRuntimeHostname,
  resolveStoreRuntimeConfig,
  resolveStaticStoreRuntimeConfig,
  type StoreRuntimeConfig,
  type StoreTenantDomain,
} from "../runtime-config";
import { withTenantGoogleStorefrontConfig } from "../google/integration-config";
import { withTenantInpostGeowidgetConfig } from "../inpost/integration-config";
import { withTenantPaymentProviderStatus } from "../payments/tenant-payment-status";

export const channelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
export const STORE_SESSION_COOKIE = "__konfi_store_session";
const tenantDomainsCollection = "tenantDomains";
type HeadersLike = {
  get(name: string): string | null;
};

export function getTenantContext(tenantId?: string | null): TenantContext {
  return resolveServerTenantContext(process.env, tenantId);
}

function isFirestoreNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === 5 || code === "5" || code === "not-found";
}

function isFirebasePermissionDeniedError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (error as { code?: unknown }).code === "permission-denied";
}

export function isExpectedTransientBackendError(error: unknown) {
  const text =
    typeof error === "object" && error !== null
      ? [
          (error as { code?: unknown }).code,
          (error as { details?: unknown }).details,
          (error as { message?: unknown }).message,
          (error as { name?: unknown }).name,
        ]
          .filter((value): value is string | number => {
            return typeof value === "string" || typeof value === "number";
          })
          .join("\n")
      : typeof error === "string"
        ? error
        : "";

  return /(?:^|\b)(?:14|unavailable)(?:\b|$)|econnreset|etimedout|socket hang up|connection (?:closed|reset)|deadline exceeded/i.test(
    text,
  );
}

export function shouldSilentlyFallbackFromOptionalStaticDataError(
  error: unknown,
) {
  return (
    isExpectedTransientBackendError(error) ||
    (process.env.NEXT_PHASE === "phase-production-build" &&
      isFirebasePermissionDeniedError(error))
  );
}

function isActiveTenantDomain(domain: Partial<TenantDomain>) {
  return domain.status?.toString().toUpperCase() === TenantDomainStatus.ACTIVE;
}

function debugStoreRuntimeLookup(
  event: string,
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[store-runtime] ${event}`, details);
}

function readRequestHost(headers: HeadersLike): string | undefined {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? undefined)
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
}

function isLocalDevelopmentHost(hostname: string | undefined) {
  const normalizedHostname = normalizeRuntimeHostname(hostname);

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname?.endsWith(".localhost") ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "lvh.me" ||
    normalizedHostname?.endsWith(".lvh.me") ||
    normalizedHostname === "[::1]" ||
    normalizedHostname === "::1"
  );
}

function resolveLocalStorefrontProductionHostname(
  requestHost: string | null | undefined,
  env: Record<string, string | undefined>,
): string | undefined {
  const hostname = normalizeRuntimeHostname(requestHost);
  const productionSuffix =
    normalizeRuntimeHostname(env.KONFI_DEV_STOREFRONT_PRODUCTION_SUFFIX) ??
    "store.getkonfi.com";
  const localSuffixes = ["store.localhost", "store.lvh.me"];

  for (const localSuffix of localSuffixes) {
    if (hostname?.endsWith(`.${localSuffix}`)) {
      return `${hostname.slice(0, -localSuffix.length)}${productionSuffix}`;
    }
  }
}

export function resolveDevStorefrontDomainLookupHostname(input: {
  env?: Record<string, string | undefined>;
  requestHost?: string | null;
}): string | undefined {
  const env = input.env ?? process.env;

  if (env.NODE_ENV === "production") {
    return;
  }

  if (!isLocalDevelopmentHost(input.requestHost ?? undefined)) {
    return;
  }

  return (
    normalizeRuntimeHostname(env.KONFI_DEV_STOREFRONT_HOSTNAME) ??
    resolveLocalStorefrontProductionHostname(input.requestHost, env)
  );
}

export async function getTenantIdForHostname(
  hostname: string,
): Promise<string | undefined> {
  const domain = await getTenantDomainForHostname(hostname);

  if (!(domain?.tenantId && isActiveTenantDomain(domain))) {
    return;
  }

  return domain.tenantId;
}

export async function getTenantDomainForHostname(
  hostname: string,
): Promise<StoreTenantDomain | undefined> {
  const snapshot = await getAdminDb()
    .collection(tenantDomainsCollection)
    .doc(hostname)
    .get()
    .catch((error) => {
      if (isFirestoreNotFoundError(error)) {
        return undefined;
      }

      throw error;
    });

  if (!snapshot) {
    return;
  }

  if (!snapshot.exists) {
    return;
  }

  return snapshot.data() as StoreTenantDomain | undefined;
}

async function getTenantForRuntimeConfig(
  tenantId: string | undefined,
): Promise<Partial<Tenant> | undefined> {
  if (!tenantId) {
    return;
  }

  const snapshot = await getAdminDb()
    .collection("tenants")
    .doc(tenantId)
    .get()
    .catch((error) => {
      if (isFirestoreNotFoundError(error)) {
        return undefined;
      }

      throw error;
    });

  if (!snapshot) {
    return;
  }

  return snapshot.exists ? (snapshot.data() as Partial<Tenant>) : undefined;
}

export async function getTenantContextForRequest(
  tenantId?: string | null,
): Promise<TenantContext> {
  const baseContext = getTenantContext(tenantId);

  if (baseContext.deploymentMode !== "saas" || baseContext.tenantId) {
    return baseContext;
  }

  const requestHeaders = await headers();
  const requestHost = readRequestHost(requestHeaders);
  const hostname = resolveRequestTenantHostname(requestHeaders);
  const lookupHostname =
    resolveDevStorefrontDomainLookupHostname({
      env: process.env,
      requestHost,
    }) ?? hostname;

  if (!lookupHostname) {
    return baseContext;
  }

  return getTenantContext(await getTenantIdForHostname(lookupHostname));
}

export async function getStoreRuntimeConfigForRequest(
  tenantId?: string | null,
): Promise<StoreRuntimeConfig | null> {
  const baseContext = getTenantContext(tenantId);
  const staticRuntimeConfig = getStaticStoreRuntimeConfig(tenantId);

  if (staticRuntimeConfig) {
    return staticRuntimeConfig;
  }

  const requestHeaders = await headers();
  const requestHost = readRequestHost(requestHeaders);
  const hostname = resolveRequestTenantHostname(requestHeaders);
  const lookupHostname =
    resolveDevStorefrontDomainLookupHostname({
      env: process.env,
      requestHost,
    }) ?? hostname;

  debugStoreRuntimeLookup("request", {
    databaseId: process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ?? null,
    deploymentMode: baseContext.deploymentMode,
    explicitTenantId: tenantId ?? null,
    hostname: hostname ?? null,
    lookupHostname: lookupHostname ?? null,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    requestHost: requestHost ?? null,
    usingDevStorefrontHostname: lookupHostname !== hostname,
  });

  const domain =
    baseContext.deploymentMode === "saas" && lookupHostname
      ? await getTenantDomainForHostname(lookupHostname)
      : undefined;
  const tenant =
    baseContext.deploymentMode === "saas"
      ? await getTenantForRuntimeConfig(domain?.tenantId)
      : undefined;

  debugStoreRuntimeLookup("firestore", {
    domain: domain
      ? {
          channelId: domain.channelId ?? null,
          hostname: domain.hostname ?? lookupHostname ?? null,
          kind: domain.kind ?? null,
          status: domain.status ?? null,
          storeUrl: domain.storeUrl ?? null,
          tenantId: domain.tenantId ?? null,
          verified: domain.verified ?? null,
        }
      : null,
    tenant: tenant
      ? {
          defaultChannelId: tenant.defaultChannelId ?? null,
          deploymentMode: tenant.deploymentMode ?? null,
          moduleFlags: tenant.moduleFlags ?? null,
          planId: tenant.planId ?? null,
          status: tenant.status ?? null,
        }
      : null,
  });

  const runtimeConfig = resolveStoreRuntimeConfig({
    domain,
    env: process.env,
    hostname: requestHost ?? hostname,
    tenant,
    tenantContext: baseContext,
  });

  if (!runtimeConfig) {
    debugStoreRuntimeLookup("resolved-null", {
      hasDomain: Boolean(domain),
      hostname: hostname ?? null,
      lookupHostname: lookupHostname ?? null,
      requestHost: requestHost ?? null,
    });
    return null;
  }

  debugStoreRuntimeLookup("resolved", {
    channelId: runtimeConfig.channelId,
    hostname: runtimeConfig.hostname ?? null,
    requestHostname: runtimeConfig.requestHostname ?? null,
    storeBaseUrl: runtimeConfig.storeBaseUrl,
    tenantId: runtimeConfig.tenantContext.tenantId ?? null,
  });

  const adminDb = getAdminDb();
  const runtimeConfigWithGoogle = await withTenantGoogleStorefrontConfig(
    runtimeConfig,
    adminDb,
  );
  const runtimeConfigWithInpost = await withTenantInpostGeowidgetConfig(
    runtimeConfigWithGoogle,
    adminDb,
  );

  return withTenantPaymentProviderStatus(runtimeConfigWithInpost, adminDb);
}

export function getStaticStoreRuntimeConfig(
  tenantId?: string | null,
): StoreRuntimeConfig | null {
  return resolveStaticStoreRuntimeConfig({
    env: process.env,
    tenantContext: getTenantContext(tenantId),
  });
}

export async function getRequiredStoreRuntimeConfigForRequest(
  tenantId?: string | null,
): Promise<StoreRuntimeConfig> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest(tenantId);

  if (!runtimeConfig) {
    throw new Error("Store runtime config could not be resolved.");
  }

  return runtimeConfig;
}

let cachedFirebaseAdminApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: AdminFirestore | null = null;
let cachedMessaging: AdminMessaging | null = null;
let cachedAppCheck: AppCheck | null = null;

function firstNonBlank(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

function hasFirebaseAdminCredentials() {
  return Boolean(
    firstNonBlank(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    firstNonBlank(process.env.ADMIN_FIREBASE_CLIENT_EMAIL) &&
    firstNonBlank(process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT),
  );
}

export function getRuntimeFirestoreDatabaseId(): string | undefined {
  const databaseId = firstNonBlank(
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID,
  );

  if (databaseId) {
    return databaseId;
  }

  const deploymentMode = firstNonBlank(
    process.env.KONFI_DEPLOYMENT_MODE,
    process.env.NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE,
  );

  if (deploymentMode === "saas") {
    throw new Error(
      "Missing NEXT_PUBLIC_FIRESTORE_DATABASE_ID for Firestore in saas deployment mode.",
    );
  }
}

export function getRuntimeFirestore(
  firebaseServerApp: FirebaseServerApp,
): ClientFirestore {
  const databaseId = getRuntimeFirestoreDatabaseId();

  return databaseId
    ? getClientFirestore(firebaseServerApp, databaseId)
    : getClientFirestore(firebaseServerApp);
}

export function shouldSkipStaticDataDuringCiBuild() {
  if (process.env.SKIP_STATIC_PARAMS_DURING_CI_BUILD === "true") {
    return true;
  }

  if (process.env.NEXT_PHASE !== "phase-production-build") {
    return false;
  }

  if (shouldUseFirebaseEmulators()) {
    return false;
  }

  return !hasFirebaseAdminCredentials();
}

export function shouldDeferStorefrontDataDuringProductionBuild() {
  return (
    process.env.KONFI_PRERENDER_STOREFRONT_DATA !== "true" &&
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

function getFirebaseAdminCredentials() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!projectId || typeof projectId !== "string") {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID for Firebase Admin initialization.",
    );
  }

  if (!clientEmail || typeof clientEmail !== "string") {
    throw new Error(
      "Missing ADMIN_FIREBASE_CLIENT_EMAIL for Firebase Admin initialization.",
    );
  }

  if (!privateKeyRaw || typeof privateKeyRaw !== "string") {
    throw new Error(
      "Missing ADMIN_FIREBASE_SERVICE_ACCOUNT (private key) for Firebase Admin initialization.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/gm, "\n"),
  };
}

export function getFirebaseAdminApp(): App {
  if (cachedFirebaseAdminApp) {
    return cachedFirebaseAdminApp;
  }

  const existing = getApps().find((app) => app.name === "store-firebase-admin");
  if (existing) {
    cachedFirebaseAdminApp = existing;
    return existing;
  }

  if (shouldUseFirebaseEmulators()) {
    cachedFirebaseAdminApp = initializeApp(
      {
        projectId:
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
          firebaseConfig.projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      },
      "store-firebase-admin",
    );
  } else {
    cachedFirebaseAdminApp = initializeApp(
      {
        credential: cert(getFirebaseAdminCredentials()),
      },
      "store-firebase-admin",
    );
  }

  return cachedFirebaseAdminApp;
}

export function getAdminAuth(): Auth {
  if (cachedAuth) {
    return cachedAuth;
  }

  cachedAuth = getAuth(getFirebaseAdminApp());
  return cachedAuth;
}

export function getAdminDb(): AdminFirestore {
  if (cachedFirestore) {
    return cachedFirestore;
  }

  const databaseId = getRuntimeFirestoreDatabaseId();
  cachedFirestore = databaseId
    ? getAdminFirestore(getFirebaseAdminApp(), databaseId)
    : getAdminFirestore(getFirebaseAdminApp());
  return cachedFirestore;
}

export function getAdminMessaging(): AdminMessaging {
  if (cachedMessaging) {
    return cachedMessaging;
  }

  cachedMessaging = getMessaging(getFirebaseAdminApp());
  return cachedMessaging;
}

export function getAdminAppCheck(): AppCheck {
  if (cachedAppCheck) {
    return cachedAppCheck;
  }

  cachedAppCheck = getAppCheck(getFirebaseAdminApp());
  return cachedAppCheck;
}

export async function verifyAnyIdToken(
  idToken: string,
): Promise<DecodedIdToken | null> {
  try {
    return await getAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Error verifying Firebase ID token", error);
    return null;
  }
}

export async function createSessionCookie(
  idToken: string,
  expiresIn: number,
): Promise<string | null> {
  try {
    if (expiresIn < 5 * 60 * 1000) {
      throw new Error(
        `Session cookie duration must be at least 5 minutes. Provided: ${expiresIn}ms`,
      );
    }

    if (expiresIn > 14 * 24 * 60 * 60 * 1000) {
      throw new Error(
        `Session cookie duration must be at most 2 weeks. Provided: ${expiresIn}ms`,
      );
    }

    return await getAdminAuth().createSessionCookie(idToken, { expiresIn });
  } catch (error) {
    console.error("Error creating store session cookie", error);
    return null;
  }
}

export async function verifySessionCookie(
  sessionCookie: string,
): Promise<DecodedIdToken | null> {
  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch (error) {
    console.error("Error verifying store session cookie", error);
    return null;
  }
}

export async function verifyAppCheckToken(
  appCheckToken: string,
): Promise<VerifyAppCheckTokenResponse | null> {
  try {
    return await getAdminAppCheck().verifyToken(appCheckToken);
  } catch (error) {
    console.error("Error verifying Firebase App Check token", error);
    return null;
  }
}

export async function getAppForServer(
  appCheckToken?: AppCheckTokenResult | string,
): Promise<{
  firebaseServerApp: FirebaseServerApp;
  firestore: ClientFirestore;
}> {
  const token =
    typeof appCheckToken === "string" ? appCheckToken : appCheckToken?.token;
  const firebaseServerApp = initializeServerApp(firebaseConfig, {
    appCheckToken: token,
  });
  const firestore = getRuntimeFirestore(firebaseServerApp);
  connectFirebaseClientEmulators({
    namespace: "store-server-app",
    firestore,
    storage: getClientStorage(firebaseServerApp),
  });

  return { firebaseServerApp, firestore };
}

export async function fetchMetadata(
  route: string,
  lng: Locale,
): Promise<Metadata> {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return {
      title: process.env.NEXT_PUBLIC_STORE_NAME,
      description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION,
    } as Metadata;
  }

  try {
    const runtimeConfig = await getStoreRuntimeConfigForRequest();

    if (!runtimeConfig) {
      return {
        robots: {
          follow: false,
          index: false,
        },
        title: "Store not found",
      } as Metadata;
    }

    const [metadataResult, sharingSettings] = await Promise.all([
      fetchMetadataForChannel(route, lng, runtimeConfig.channelId),
      fetchSharingSettingsForChannel(runtimeConfig.channelId),
    ]);

    return {
      ...applyStorefrontSharingMetadata({
        metadata: metadataResult,
        sharing: sharingSettings,
      }),
      metadataBase: new URL(runtimeConfig.storeBaseUrl),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching metadata:", error);
    return {
      title: process.env.NEXT_PUBLIC_STORE_NAME,
      description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION,
    } as Metadata;
  }
}

async function fetchMetadataForChannel(
  route: string,
  lng: Locale,
  targetChannelId: string,
): Promise<Metadata> {
  "use cache";
  cacheTag(
    `pageMetadata-${route}`,
    `pageMetadata-${route}-${lng}`,
    `pageMetadata-${route}-${targetChannelId}`,
  );
  cacheLife("max");

  const metadataPath =
    lng === DEFAULT_LOCALE
      ? `channels/${targetChannelId}/metadata/${route}`
      : `channels/${targetChannelId}/metadata/${route}/translations/${lng}`;
  const metadataSnapshot = await getAdminDb().doc(metadataPath).get();
  const metadataResult = metadataSnapshot.exists
    ? (metadataSnapshot.data() as dbMetadata)
    : {
        id: "",
        title: "",
        description: "",
        keywords: "",
      };

  return formatMetadataResult(metadataResult);
}

async function fetchSharingSettingsForChannel(
  targetChannelId: string,
): Promise<StorefrontSharingSettings> {
  "use cache";
  cacheTag(
    storefrontSharingCacheTag,
    `${storefrontSharingCacheTag}-${targetChannelId}`,
  );
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return sanitizeStorefrontSharing(undefined);
  }

  try {
    const snapshot = await getAdminDb()
      .doc(`channels/${targetChannelId}/storefront/sharing`)
      .get();

    return sanitizeStorefrontSharing(snapshot.data());
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error fetching storefront sharing settings:", error);
    }
    return sanitizeStorefrontSharing(undefined);
  }
}

export async function fetchPageContent(route: string, lng: Locale) {
  try {
    if (shouldSkipStaticDataDuringCiBuild()) {
      return "";
    }

    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return "";
    }

    return await fetchPageContentForChannel(
      route,
      lng,
      runtimeConfig.channelId,
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching page content:", error);
    return "";
  }
}

export async function fetchPageContentForChannel(
  route: string,
  lng: Locale,
  targetChannelId: string,
) {
  "use cache";
  cacheTag(
    `pageContent-${route}`,
    `pageContent-${route}-${lng}`,
    `pageContent-${route}-${targetChannelId}`,
  );
  cacheLife("max");

  const contentPath =
    lng === DEFAULT_LOCALE
      ? `channels/${targetChannelId}/pages/${route}`
      : `channels/${targetChannelId}/pages/${route}/translations/${lng}`;
  const pageContentSnapshot = await getAdminDb().doc(contentPath).get();
  const pageContentResult = pageContentSnapshot.exists
    ? (pageContentSnapshot.data() as dbPageContent)
    : {
        id: "",
        content: [],
      };

  const { content } = pageContentResult;
  return content.map((item) => item.value).join();
}
