const DB_NAME = "konfi-delivery-sync";
const DB_VERSION = 1;
const STORE_NAME = "courier-state";
const STATE_KEY = "latest";

export type CourierSyncState = {
  userId: string;
  channelId: string;
  idToken: string;
  location: {
    latitude: number;
    longitude: number;
  };
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  userAgent: string | null;
  timestamp: number;
};

const isIndexedDbSupported = () => typeof indexedDB !== "undefined";

const openDb = (): Promise<IDBDatabase | null> => {
  if (!isIndexedDbSupported()) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"));
    };
  });
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void,
  onComplete: () => T,
): Promise<T | null> => {
  const db = await openDb();
  if (!db) {
    return null;
  }
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    try {
      action(store);
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      resolve(onComplete());
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
      db.close();
    };
  });
};

export const saveCourierSyncState = async (
  state: CourierSyncState,
): Promise<void> => {
  await runTransaction<void>(
    "readwrite",
    (store) => {
      store.put(state, STATE_KEY);
    },
    () => undefined,
  );
};

export const readCourierSyncState =
  async (): Promise<CourierSyncState | null> => {
    const db = await openDb();
    if (!db) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);
      request.onsuccess = () => {
        resolve((request.result as CourierSyncState | undefined) ?? null);
        db.close();
      };
      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB read failed"));
        db.close();
      };
    });
  };

export const clearCourierSyncState = async (): Promise<void> => {
  await runTransaction<void>(
    "readwrite",
    (store) => {
      store.delete(STATE_KEY);
    },
    () => undefined,
  );
};
