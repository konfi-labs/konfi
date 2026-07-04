"use client";

import {
  connectFirebaseClientEmulators,
  resolveClientTenantRuntimeFlags,
} from "@konfi/firebase";
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import {
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
  initializeFirestore,
  getFirestore,
} from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { firebaseConfig } from "./config";
import { Analytics, getAnalytics, isSupported } from "firebase/analytics";
import type { AppCheck, AppCheckTokenResult } from "firebase/app-check";

export const channelId: string | undefined =
  process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
export const tenantRuntimeFlags = resolveClientTenantRuntimeFlags();
const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID?.trim() || undefined;

export const firebaseApp: FirebaseApp = getApps().some(
  (app) => app.name === "store",
)
  ? getApp("store")
  : initializeApp(firebaseConfig, "store");

const STORE_APP_CHECK_KEY = "__konfiStoreAppCheck";
const STORE_APP_CHECK_PROMISE_KEY = "__konfiStoreAppCheckPromise";
const STORE_APP_CHECK_SITE_KEY = "__konfiStoreAppCheckSiteKey";

type StoreAppCheckGlobal = typeof globalThis & {
  [STORE_APP_CHECK_KEY]?: AppCheck | null;
  [STORE_APP_CHECK_PROMISE_KEY]?: Promise<AppCheck | null>;
  [STORE_APP_CHECK_SITE_KEY]?: string;
  FIREBASE_APPCHECK_DEBUG_TOKEN?: string;
};

function getStoreAppCheckGlobal() {
  return globalThis as StoreAppCheckGlobal;
}

// oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
const isDevelopment = process.env.NODE_ENV === "development";
const shouldUseAppCheckDebugToken =
  isDevelopment || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

function shouldTreatAppCheckInitializationAsExpected(error: unknown) {
  const firebaseError = error as { code?: string; message?: string };
  const errorText = `${firebaseError.code ?? ""}\n${firebaseError.message ?? ""}`;

  return (
    /appCheck\/already-initialized|already called initializeAppCheck/i.test(
      errorText,
    ) ||
    /recaptcha has already been rendered|pending promise was never set/i.test(
      errorText,
    )
  );
}

function initializeStoreAppCheck() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const appCheckGlobal = getStoreAppCheckGlobal();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (
    appCheckGlobal[STORE_APP_CHECK_KEY] !== undefined &&
    appCheckGlobal[STORE_APP_CHECK_SITE_KEY] === siteKey
  ) {
    return appCheckGlobal[STORE_APP_CHECK_KEY];
  }

  if (!siteKey) {
    appCheckGlobal[STORE_APP_CHECK_KEY] = null;
    appCheckGlobal[STORE_APP_CHECK_SITE_KEY] = siteKey;
    return null;
  }

  if (shouldUseAppCheckDebugToken && typeof self !== "undefined") {
    try {
      (
        self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN =
        process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_STORE ?? "";
    } catch {
      // noop
    }
  }

  try {
    appCheckGlobal[STORE_APP_CHECK_KEY] = null;
    appCheckGlobal[STORE_APP_CHECK_SITE_KEY] = siteKey;
    const initializedAppCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: !isDevelopment,
    });
    appCheckGlobal[STORE_APP_CHECK_KEY] = initializedAppCheck;
    void getAppCheckToken(initializedAppCheck).catch((error: unknown) => {
      if (isDevelopment) {
        console.warn("App Check token prefetch failed", error);
      }
    });

    return initializedAppCheck;
  } catch (error: unknown) {
    appCheckGlobal[STORE_APP_CHECK_KEY] = null;
    appCheckGlobal[STORE_APP_CHECK_SITE_KEY] = siteKey;
    if (shouldTreatAppCheckInitializationAsExpected(error)) {
      return null;
    }
    if (isDevelopment) {
      console.warn("App Check initialization skipped", error);
    }

    return null;
  }
}

export const appCheck =
  typeof window !== "undefined"
    ? (getStoreAppCheckGlobal()[STORE_APP_CHECK_KEY] ?? null)
    : null;

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

export let firestore: Firestore;
export let storage: FirebaseStorage;

export function initStorage() {
  storage = getStorage(firebaseApp);
  return storage;
}

export function initFirestore() {
  try {
    firestore = initializeFirestore(
      firebaseApp,
      {
        ignoreUndefinedProperties: true,
      },
      firestoreDatabaseId,
    );
  } catch {
    firestore = firestoreDatabaseId
      ? getFirestore(firebaseApp, firestoreDatabaseId)
      : getFirestore(firebaseApp);
  }
  return firestore;
}

export async function getStoreAppCheck() {
  const appCheckGlobal = getStoreAppCheckGlobal();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (
    appCheckGlobal[STORE_APP_CHECK_KEY] &&
    appCheckGlobal[STORE_APP_CHECK_SITE_KEY] === siteKey
  ) {
    return appCheckGlobal[STORE_APP_CHECK_KEY];
  }

  if (appCheckGlobal[STORE_APP_CHECK_PROMISE_KEY]) {
    return appCheckGlobal[STORE_APP_CHECK_PROMISE_KEY];
  }

  appCheckGlobal[STORE_APP_CHECK_PROMISE_KEY] = Promise.resolve()
    .then(() => initializeStoreAppCheck())
    .catch((error: unknown) => {
      if (
        !shouldTreatAppCheckInitializationAsExpected(error) &&
        isDevelopment
      ) {
        console.warn("App Check initialization skipped", error);
      }

      appCheckGlobal[STORE_APP_CHECK_KEY] = null;
      appCheckGlobal[STORE_APP_CHECK_SITE_KEY] = siteKey;
      return null;
    })
    .finally(() => {
      appCheckGlobal[STORE_APP_CHECK_PROMISE_KEY] = undefined;
    });

  return appCheckGlobal[STORE_APP_CHECK_PROMISE_KEY];
}

export async function getStoreAppCheckToken() {
  const storeAppCheck = await getStoreAppCheck();

  if (!storeAppCheck) {
    return null;
  }

  const { getToken } = await import("firebase/app-check");
  return getToken(storeAppCheck).catch(
    (error: unknown): AppCheckTokenResult | null => {
      void error;
      return null;
    },
  );
}

function initializeServices() {
  try {
    initFirestore();
    initStorage();
    connectFirebaseClientEmulators({
      namespace: "store-client",
      auth,
      firestore,
      storage,
    });
  } catch {
    // Firebase service registration can lag behind app bootstrap during
    // development/HMR. Retry after the current tick without surfacing a
    // client-side exception or noisy console warning.
  }
}

if (typeof window !== "undefined") {
  initializeServices();
  queueMicrotask(() => {
    if (!firestore || !storage) {
      initializeServices();
    }
  });
}
export let analytics: Analytics | undefined;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported && process.env.NODE_ENV !== "development") {
      try {
        analytics = getAnalytics(firebaseApp);
      } catch (error) {
        console.warn("Firebase Analytics failed to load:", error);
      }
    }
  });
}
