import type { Auth } from "firebase/auth";
import { connectAuthEmulator } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import { connectFunctionsEmulator } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";
import { connectStorageEmulator } from "firebase/storage";

type FirebaseEmulatorGlobal = typeof globalThis & {
  konfiFirebaseEmulatorConnections?: WeakSet<object>;
};

type EmulatorTarget = {
  host: string;
  port: number;
};

export type FirebaseClientEmulatorServices = {
  namespace: string;
  auth?: Auth;
  firestore?: Firestore;
  storage?: FirebaseStorage;
  functions?: Functions;
};

function getFirebaseEmulatorGlobal() {
  return globalThis as FirebaseEmulatorGlobal;
}

function getConnectionSet() {
  const state = getFirebaseEmulatorGlobal();

  if (!state.konfiFirebaseEmulatorConnections) {
    state.konfiFirebaseEmulatorConnections = new WeakSet<object>();
  }

  return state.konfiFirebaseEmulatorConnections;
}

function parseEmulatorTarget(value: string): EmulatorTarget | null {
  const [host, portValue] = value.split(":");
  const port = Number(portValue);

  if (!host || !Number.isInteger(port)) {
    return null;
  }

  return { host, port };
}

function getEmulatorTarget(
  configuredValue: string | undefined,
  fallbackValue: string,
): EmulatorTarget {
  return (
    parseEmulatorTarget(configuredValue ?? "") ??
    parseEmulatorTarget(fallbackValue) ?? { host: "127.0.0.1", port: 8080 }
  );
}

export function shouldUseFirebaseEmulators(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  );
}

function connectOnce(service: object, connect: () => void): void {
  const connections = getConnectionSet();

  if (connections.has(service)) {
    return;
  }

  try {
    connect();
    connections.add(service);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("already")) {
      connections.add(service);
      return;
    }

    throw error;
  }
}

export function connectFirebaseClientEmulators(
  services: FirebaseClientEmulatorServices,
): void {
  if (!shouldUseFirebaseEmulators()) {
    return;
  }

  if (services.auth) {
    const auth = services.auth;
    const target = getEmulatorTarget(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ??
        process.env.FIREBASE_AUTH_EMULATOR_HOST,
      "127.0.0.1:9099",
    );

    connectOnce(auth, () => {
      connectAuthEmulator(auth, `http://${target.host}:${target.port}`, {
        disableWarnings: true,
      });
    });
  }

  if (services.firestore) {
    const firestore = services.firestore;
    const target = getEmulatorTarget(
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ??
        process.env.FIRESTORE_EMULATOR_HOST,
      "127.0.0.1:8080",
    );

    connectOnce(firestore, () => {
      connectFirestoreEmulator(firestore, target.host, target.port);
    });
  }

  if (services.storage) {
    const storage = services.storage;
    const target = getEmulatorTarget(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST ??
        process.env.FIREBASE_STORAGE_EMULATOR_HOST,
      "127.0.0.1:9199",
    );

    connectOnce(storage, () => {
      connectStorageEmulator(storage, target.host, target.port);
    });
  }

  if (services.functions) {
    const functions = services.functions;
    const target = getEmulatorTarget(
      process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST,
      "127.0.0.1:5001",
    );

    connectOnce(functions, () => {
      connectFunctionsEmulator(functions, target.host, target.port);
    });
  }
}
