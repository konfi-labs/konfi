import { FirebaseApp, getApp, getApps } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";
import { Functions, getFunctions } from "firebase/functions";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { resolveClientTenantRuntimeFlags } from "./tenant-context";

export let app: FirebaseApp | undefined;

function getRuntimeFirestoreDatabaseId(): string | undefined {
  const databaseId =
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID?.trim() || undefined;

  if (databaseId) {
    return databaseId;
  }

  if (resolveClientTenantRuntimeFlags().deploymentMode === "saas") {
    throw new Error(
      "Missing NEXT_PUBLIC_FIRESTORE_DATABASE_ID for Firestore in saas deployment mode.",
    );
  }
}

if (getApps().length) {
  initApp();
}

export function initApp() {
  if (!app) {
    app = getApp(getApps()[0] ? getApps()[0].name : "");
  }
}

export let storage: FirebaseStorage;
export let firestore: Firestore;
export let functions: Functions;

function getRuntimeFirestore(firebaseApp: FirebaseApp): Firestore {
  const firestoreDatabaseId = getRuntimeFirestoreDatabaseId();

  return firestoreDatabaseId
    ? getFirestore(firebaseApp, firestoreDatabaseId)
    : getFirestore(firebaseApp);
}

try {
  if (app) {
    storage = getStorage(app);
    firestore = getRuntimeFirestore(app);
    functions = getFunctions(app, "europe-central2");
  }
} catch {
  // Services may not be available during SSR/build; they will be
  // initialised lazily via initFirestore / initStorage / initFunctions.
}

export function initStorage() {
  if (!app) initApp();
  if (app) storage = getStorage(app);
}

export function initFirestore() {
  if (!app) initApp();
  if (app) firestore = getRuntimeFirestore(app);
}

export function initFunctions() {
  if (!app) initApp();
  if (app) functions = getFunctions(app, "europe-central2");
}

/**
 * Gets the appropriate Firestore instance
 * @param firestore - Optional Firestore instance (typically from server)
 * @returns Firestore instance to use
 */
export function getFirestoreInstance(_firestore?: Firestore): Firestore {
  if (_firestore) return _firestore;
  if (!firestore) initFirestore();
  return firestore as Firestore;
}
