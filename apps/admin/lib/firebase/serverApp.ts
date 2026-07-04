// enforces that this code can only be called on the server
// https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment
import "server-only";

import {
  connectFirebaseClientEmulators,
  normalizeTenantHostname,
  resolveRequestTenantHostname,
  resolveServerTenantContext,
  shouldUseFirebaseEmulators,
} from "@konfi/firebase";
import {
  type TenantContext,
  type TenantDomain,
  TenantDomainStatus,
} from "@sblyvwx/cloud-contracts";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import {
  getMessaging,
  type Messaging as AdminMessaging,
} from "firebase-admin/messaging";
import {
  getStorage,
  type Storage as AdminStorage,
} from "firebase-admin/storage";
import { initializeServerApp, type FirebaseServerApp } from "firebase/app";
import {
  getFirestore as getClientFirestore,
  type Firestore as ClientFirestore,
} from "firebase/firestore";
import { getStorage as getClientStorage } from "firebase/storage";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { firebaseConfig } from "@/lib/firebase/config";

export const channelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
export const adminTenantIdCookieName = "__tenantId";
const tenantDomainsCollection = "tenantDomains";

function debugTenantContext(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[admin-tenant] ${event}`, details);
}

function getTenantRuntimeEnvDebugInfo() {
  return {
    deploymentMode: process.env.KONFI_DEPLOYMENT_MODE ?? null,
    publicDeploymentMode: process.env.NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE ?? null,
    publicRequireTenantId:
      process.env.NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID ?? null,
    requireTenantId: process.env.KONFI_REQUIRE_TENANT_ID ?? null,
  };
}

export function getTenantContext(tenantId?: string | null): TenantContext {
  return resolveServerTenantContext(process.env, tenantId);
}

function isActiveTenantDomain(domain: Partial<TenantDomain>) {
  return domain.status?.toString().toUpperCase() === TenantDomainStatus.ACTIVE;
}

export function isLocalDevelopmentTenantHost(
  hostname: string | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    hostname &&
    env.NODE_ENV !== "production" &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "lvh.me" ||
      hostname.endsWith(".lvh.me") ||
      hostname === "[::1]" ||
      hostname === "::1"),
  );
}

export function resolveDevAdminDomainLookupHostname(input: {
  env?: Record<string, string | undefined>;
  requestHostname?: string | null;
}): string | undefined {
  const env = input.env ?? process.env;

  if (env.NODE_ENV === "production") {
    return;
  }

  if (!isLocalDevelopmentTenantHost(input.requestHostname ?? undefined, env)) {
    return;
  }

  return normalizeTenantHostname(env.KONFI_DEV_ADMIN_HOSTNAME);
}

export async function isLocalDevelopmentTenantRequest(): Promise<boolean> {
  return isLocalDevelopmentTenantHost(
    resolveRequestTenantHostname(await headers()),
  );
}

export async function getTenantIdForHostname(
  hostname: string,
): Promise<string | undefined> {
  const snapshot = await getAdminDb()
    .collection(tenantDomainsCollection)
    .doc(hostname)
    .get();

  if (!snapshot.exists) {
    return;
  }

  const domain = snapshot.data() as Partial<TenantDomain> | undefined;

  if (!(domain?.tenantId && isActiveTenantDomain(domain))) {
    return;
  }

  return domain.tenantId;
}

async function resolveTenantContextForRequest(
  tenantId?: string | null,
): Promise<TenantContext> {
  const baseContext = getTenantContext(tenantId);
  const hasExplicitTenantId = Boolean(tenantId?.trim());
  const requestBaseContext =
    hasExplicitTenantId || baseContext.deploymentMode !== "saas"
      ? baseContext
      : { ...baseContext, tenantId: undefined };

  if (
    requestBaseContext.deploymentMode !== "saas" ||
    requestBaseContext.tenantId
  ) {
    debugTenantContext("resolved base context", {
      deploymentMode: requestBaseContext.deploymentMode,
      env: getTenantRuntimeEnvDebugInfo(),
      requireTenantId: requestBaseContext.requireTenantId,
      tenantId: requestBaseContext.tenantId ?? null,
    });
    return requestBaseContext;
  }

  const headersList = await headers();
  const hostname = resolveRequestTenantHostname(headersList);
  const lookupHostname =
    resolveDevAdminDomainLookupHostname({
      env: process.env,
      requestHostname: hostname,
    }) ?? hostname;

  if (lookupHostname) {
    const hostnameTenantId = await getTenantIdForHostname(lookupHostname);
    if (hostnameTenantId) {
      debugTenantContext("resolved hostname context", {
        hostname: lookupHostname,
        requestHostname: hostname ?? null,
        tenantId: hostnameTenantId,
      });
      return getTenantContext(hostnameTenantId);
    }
    debugTenantContext("hostname did not resolve tenant", {
      hostname: lookupHostname,
      requestHostname: hostname ?? null,
    });
  }

  if (
    baseContext.tenantId &&
    isLocalDevelopmentTenantHost(hostname) &&
    !hasExplicitTenantId
  ) {
    debugTenantContext("resolved local env context", {
      hostname: hostname ?? null,
      tenantId: baseContext.tenantId,
    });
    return baseContext;
  }

  const cookieTenantId = (await cookies())
    .get(adminTenantIdCookieName)
    ?.value.trim();

  if (cookieTenantId) {
    debugTenantContext("resolved cookie context", {
      tenantId: cookieTenantId,
    });
    return getTenantContext(cookieTenantId);
  }

  debugTenantContext("missing tenant context", {
    deploymentMode: requestBaseContext.deploymentMode,
    env: getTenantRuntimeEnvDebugInfo(),
    requireTenantId: requestBaseContext.requireTenantId,
  });
  return requestBaseContext;
}

export const getTenantContextForRequest = cache(resolveTenantContextForRequest);

export async function getAppForServer(): Promise<{
  firebaseServerApp: FirebaseServerApp;
  firestore: ClientFirestore;
}> {
  const firebaseServerApp = initializeServerApp(firebaseConfig, {});
  const databaseId = getRuntimeFirestoreDatabaseId();
  const firestore = databaseId
    ? getClientFirestore(firebaseServerApp, databaseId)
    : getClientFirestore(firebaseServerApp);
  connectFirebaseClientEmulators({
    namespace: "admin-server-app",
    firestore,
    storage: getClientStorage(firebaseServerApp),
  });

  return { firebaseServerApp, firestore };
}

let cachedFirebaseAdminApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: AdminFirestore | null = null;
let cachedMessaging: AdminMessaging | null = null;
let cachedStorage: AdminStorage | null = null;

function firstNonBlank(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
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

function getFirebaseAdminCredentials() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  // NOTE: Despite its name, this is expected to contain the *private key* string.
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

  const existing = getApps().find((it) => it.name === "firebase-admin-app");
  if (existing) {
    cachedFirebaseAdminApp = existing;
    return existing;
  }

  if (shouldUseFirebaseEmulators()) {
    const projectId =
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfig.projectId;

    cachedFirebaseAdminApp = initializeApp(
      {
        projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      },
      "firebase-admin-app",
    );
  } else {
    const credentials = getFirebaseAdminCredentials();

    cachedFirebaseAdminApp = initializeApp(
      {
        credential: cert(credentials),
      },
      "firebase-admin-app",
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

export function getAdminStorage(): AdminStorage {
  if (cachedStorage) {
    return cachedStorage;
  }

  cachedStorage = getStorage(getFirebaseAdminApp());
  return cachedStorage;
}

export async function verifyIdToken(idToken: string) {
  try {
    const auth = getAdminAuth();
    const decodedIdToken = await auth.verifyIdToken(idToken);
    if (decodedIdToken.admin === true) {
      const currentUser = await auth.getUser(decodedIdToken.uid);
      return currentUser;
    } else {
      throw new Error("UNAUTHORIZED REQUEST!");
    }
  } catch (error) {
    console.error("Error verifying ID token", error);
    return null;
  }
}

// Verifies any valid Firebase ID token and returns the user record regardless of claims
export async function verifyAnyIdToken(idToken: string) {
  try {
    const auth = getAdminAuth();
    const decodedIdToken = await auth.verifyIdToken(idToken);
    const currentUser = await auth.getUser(decodedIdToken.uid);
    return currentUser;
  } catch (error) {
    console.error("Error verifying ID token (any)", error);
    return null;
  }
}

export async function isAdmin(idToken: string) {
  if (!idToken) {
    return false;
  }
  const user = await verifyIdToken(idToken);
  if (!user) {
    return false;
  }

  return user.customClaims?.admin === true;
}

export async function isCourier(idToken: string) {
  if (!idToken) {
    return false;
  }
  const user = await verifyAnyIdToken(idToken);
  if (!user) {
    return false;
  }
  return user.customClaims?.courier === true;
}

// Create a Firebase session cookie from an ID token
export async function createSessionCookie(idToken: string, expiresIn: number) {
  try {
    const auth = getAdminAuth();
    // Firebase session cookies must be between 5 minutes and 2 weeks
    const MIN_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
    const MAX_DURATION = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds

    if (expiresIn < MIN_DURATION) {
      throw new Error(
        `Session cookie duration must be at least 5 minutes. Provided: ${expiresIn}ms`,
      );
    }
    if (expiresIn > MAX_DURATION) {
      throw new Error(
        `Session cookie duration must be at most 2 weeks. Provided: ${expiresIn}ms`,
      );
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn,
    });
    return sessionCookie;
  } catch (error) {
    console.error("Error creating session cookie", error);
    return null;
  }
}

// Verify a Firebase session cookie
export async function verifySessionCookie(sessionCookie: string) {
  try {
    const auth = getAdminAuth();
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    return decodedClaims;
  } catch (error) {
    console.error("Error verifying session cookie", error);
    return null;
  }
}

// Revoke all refresh tokens for a user (invalidates session cookies)
export async function revokeRefreshTokens(uid: string) {
  try {
    const auth = getAdminAuth();
    await auth.revokeRefreshTokens(uid);
  } catch (error) {
    console.error("Error revoking refresh tokens", error);
  }
}
