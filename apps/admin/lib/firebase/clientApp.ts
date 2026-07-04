"use client";

import {
  connectFirebaseClientEmulators,
  resolveClientTenantRuntimeFlags,
} from "@konfi/firebase";
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import {
  AppCheck,
  getToken as getAppCheckToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { Functions, getFunctions } from "firebase/functions";
import { getMessaging, isSupported, Messaging } from "firebase/messaging";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { firebaseConfig } from "./config";
export const channelId: string | undefined =
  process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
export const tenantRuntimeFlags = resolveClientTenantRuntimeFlags();
const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID?.trim() || undefined;
export const firebaseApp: FirebaseApp = getApps().some(
  (app) => app.name === "admin",
)
  ? getApp("admin")
  : initializeApp(firebaseConfig, "admin");

type AdminFirebaseGlobal = typeof globalThis & {
  __konfiAdminAppCheck?: AppCheck | null;
};

function getAdminFirebaseGlobal() {
  return globalThis as AdminFirebaseGlobal;
}

// oxlint-disable-next-line eslint/no-underscore-dangle -- Global cache intentionally uses a private app namespace.
let appCheckInstance = getAdminFirebaseGlobal().__konfiAdminAppCheck ?? null;
// oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
const isDevelopment = process.env.NODE_ENV === "development";
const shouldUseAppCheckDebugToken =
  isDevelopment ||
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

// App Check MUST be initialized before any early Firestore usage (e.g. Orders page on hard refresh)
// otherwise first Firestore requests may run without an App Check token and get rejected.
if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  !appCheckInstance &&
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
) {
  if (shouldUseAppCheckDebugToken && typeof self !== "undefined") {
    try {
      (
        self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN =
        process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ADMIN ?? "";
    } catch {
      // noop
    }
  }

  try {
    appCheckInstance = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(
        process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
      ),
      isTokenAutoRefreshEnabled: !isDevelopment,
    });

    // Warm the token cache so first Firestore listeners (e.g. Orders) don't race App Check.
    void getAppCheckToken(appCheckInstance).catch((error: unknown) => {
      if (isDevelopment) {
        console.warn("App Check token prefetch failed", error);
      }
    });
    // oxlint-disable-next-line eslint/no-underscore-dangle -- Global cache intentionally uses a private app namespace.
    getAdminFirebaseGlobal().__konfiAdminAppCheck = appCheckInstance;
  } catch (error: unknown) {
    // App Check may already be initialized elsewhere; avoid crashing the app.
    if (isDevelopment) {
      console.warn("App Check initialization skipped", error);
    }
  }
}

export const appCheck = appCheckInstance;
export const auth: Auth = (() => {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [
        browserLocalPersistence,
        browserSessionPersistence,
        indexedDBLocalPersistence,
      ],
      ...(typeof window !== "undefined"
        ? { popupRedirectResolver: browserPopupRedirectResolver }
        : {}),
    });
  } catch {
    return getAuth(firebaseApp);
  }
})();
export const firestore: Firestore = (() => {
  try {
    return initializeFirestore(
      firebaseApp,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ignoreUndefinedProperties: true,
      },
      firestoreDatabaseId,
    );
  } catch {
    return firestoreDatabaseId
      ? getFirestore(firebaseApp, firestoreDatabaseId)
      : getFirestore(firebaseApp);
  }
})();
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(
  firebaseApp,
  "europe-central2",
);
connectFirebaseClientEmulators({
  namespace: "admin-client",
  auth,
  firestore,
  storage,
  functions,
});
export const messaging: () => Promise<false | Messaging> = async () =>
  (await isSupported()) && getMessaging(firebaseApp);
