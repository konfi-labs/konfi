const CACHE_PREFIX = "konfi-admin-";
const STATIC_CACHE = `${CACHE_PREFIX}static-v2`;
const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v2`;
const ACTIVE_CACHES = new Set([STATIC_CACHE, OFFLINE_CACHE]);
const OFFLINE_URL = "/__konfi-admin-offline__";
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const DB_NAME = "konfi-delivery-sync";
const DB_VERSION = 1;
const STORE_NAME = "courier-state";
const STATE_KEY = "latest";
const LAST_SYNC_KEY = "last-sync";
const SYNC_TAG = "konfi-courier-presence";

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Konfi offline</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        align-items: center;
        display: grid;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }

      main {
        max-width: 560px;
      }

      h1 {
        font-size: 1.5rem;
        margin: 0 0 12px;
      }

      p {
        line-height: 1.5;
        margin: 0 0 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Konfi is offline / Konfi jest offline</h1>
      <p>Reconnect and refresh this page to continue.</p>
      <p>Polacz sie z internetem i odswiez strone, aby kontynuowac.</p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.put(
        OFFLINE_URL,
        new Response(OFFLINE_HTML, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(CACHE_PREFIX) &&
              !ACTIVE_CACHES.has(cacheName),
          )
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

const isRscRequest = (request, url) =>
  url.searchParams.has("_rsc") ||
  request.headers.get("rsc") === "1" ||
  request.headers.has("next-router-state-tree");

const isLocalDevelopmentHost = () =>
  LOCAL_DEVELOPMENT_HOSTS.has(self.location.hostname) ||
  self.location.hostname.endsWith(".localhost");

const isBypassedPath = (pathname) =>
  pathname.startsWith("/api/") ||
  pathname.startsWith("/mcp/") ||
  pathname.startsWith("/__/auth") ||
  pathname.startsWith("/__/firebase") ||
  pathname.startsWith("/.well-known/workflow/") ||
  pathname === "/sw.js" ||
  pathname === "/_next/image" ||
  pathname.startsWith("/_next/webpack-hmr");

const isStaticAsset = (pathname) =>
  pathname.startsWith("/_next/static/") ||
  pathname === "/favicon.ico" ||
  pathname === "/manifest.webmanifest" ||
  pathname === "/site.webmanifest" ||
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|wasm|js|css)$/.test(
    pathname,
  );

const shouldHandleFetch = (request) => {
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  if (
    isLocalDevelopmentHost() &&
    (url.pathname.startsWith("/_next/") || /\.(?:js|css)$/.test(url.pathname))
  ) {
    return false;
  }

  if (
    request.headers.has("next-action") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    isRscRequest(request, url) ||
    isBypassedPath(url.pathname)
  ) {
    return false;
  }

  return request.mode === "navigate" || isStaticAsset(url.pathname);
};

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkResponsePromise = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  return cached || networkResponsePromise;
};

const navigationFallback = async (request) => {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) {
      return cached;
    }
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
};

self.addEventListener("fetch", (event) => {
  if (!shouldHandleFetch(event.request)) {
    return;
  }

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(navigationFallback(event.request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
});

const clearAdminPwaState = async () => {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
      .map((cacheName) => caches.delete(cacheName)),
  );

  if (typeof indexedDB !== "undefined") {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }
};

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB open failed"));
  });

const writeState = async (state) => {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB write failed"));
      };
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
    });
  } catch (error) {
    console.warn("[admin-sw] failed to persist courier state", error);
  }
};

const readState = async () => {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB read failed"));
      };
      const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        reject(request.error || new Error("IndexedDB read failed"));
      };
    });
  } catch (error) {
    console.warn("[admin-sw] failed to read courier state", error);
    return null;
  }
};

const writeLastSyncState = async (lastSyncState) => {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB write failed"));
      };
      tx.objectStore(STORE_NAME).put(lastSyncState, LAST_SYNC_KEY);
    });
  } catch (error) {
    console.warn("[admin-sw] failed to persist courier last sync state", error);
  }
};

const readLastSyncState = async () => {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB read failed"));
      };
      const request = tx.objectStore(STORE_NAME).get(LAST_SYNC_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        reject(request.error || new Error("IndexedDB read failed"));
      };
    });
  } catch (error) {
    console.warn("[admin-sw] failed to read courier last sync state", error);
    return null;
  }
};

const notifyClients = async (message) => {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    client.postMessage(message);
  }
};

const LOCATION_CONFIG = {
  minDistanceThresholdMeters: 10,
  stationaryReducedSyncMs: 5 * 60 * 1000,
  maxAccuracyThresholdMeters: 100,
  significantDistanceMeters: 50,
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const radiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusMeters * c;
};

const shouldSyncInBackground = (state, lastSyncState) => {
  const hasLocation =
    state.location &&
    typeof state.location.latitude === "number" &&
    typeof state.location.longitude === "number";

  if (!hasLocation) {
    return { shouldSync: false, reason: "no_location" };
  }

  if (
    state.accuracy &&
    state.accuracy > LOCATION_CONFIG.maxAccuracyThresholdMeters
  ) {
    return { shouldSync: false, reason: "poor_accuracy" };
  }

  if (!lastSyncState || !lastSyncState.location) {
    return { shouldSync: true, reason: "first_background_sync" };
  }

  const distance = calculateDistance(
    state.location.latitude,
    state.location.longitude,
    lastSyncState.location.latitude,
    lastSyncState.location.longitude,
  );

  if (distance >= LOCATION_CONFIG.significantDistanceMeters) {
    return { shouldSync: true, reason: "significant_distance" };
  }

  if (distance < LOCATION_CONFIG.minDistanceThresholdMeters) {
    const now = Date.now();
    const timeSinceLastSync = lastSyncState.timestamp
      ? now - lastSyncState.timestamp
      : 0;

    if (timeSinceLastSync >= LOCATION_CONFIG.stationaryReducedSyncMs) {
      return { shouldSync: true, reason: "stationary_interval" };
    }

    return { shouldSync: false, reason: "insufficient_distance" };
  }

  return { shouldSync: true, reason: "moderate_distance" };
};

const syncCourierPresence = async () => {
  const state = await readState();
  if (!state || !state.idToken || !state.channelId || !state.userId) {
    return;
  }

  const lastSyncState = await readLastSyncState();
  const { shouldSync, reason } = shouldSyncInBackground(state, lastSyncState);

  if (!shouldSync) {
    console.log(`[admin-sw] Skipping courier background sync - ${reason}`);
    return;
  }

  console.log(`[admin-sw] Performing courier background sync - ${reason}`);

  const hasLocation =
    state.location &&
    typeof state.location.latitude === "number" &&
    typeof state.location.longitude === "number";
  const payload = {
    channelId: state.channelId,
    userId: state.userId,
    location: hasLocation
      ? {
          latitude: state.location.latitude,
          longitude: state.location.longitude,
        }
      : null,
    accuracy: Object.prototype.hasOwnProperty.call(state, "accuracy")
      ? state.accuracy
      : null,
    heading: Object.prototype.hasOwnProperty.call(state, "heading")
      ? state.heading
      : null,
    speed: Object.prototype.hasOwnProperty.call(state, "speed")
      ? state.speed
      : null,
    userAgent: Object.prototype.hasOwnProperty.call(state, "userAgent")
      ? state.userAgent
      : null,
    timestamp:
      typeof state.timestamp === "number" ? state.timestamp : Date.now(),
    source: "periodic-sync",
  };

  try {
    const response = await fetch("/api/courier/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.idToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 401 || response.status === 403) {
      await notifyClients({ type: "COURIER_SYNC_TOKEN_EXPIRED" });
      return;
    }
    if (!response.ok) {
      throw new Error(`Courier periodic sync failed: ${response.status}`);
    }

    const timestamp = Date.now();
    await writeState({ ...state, timestamp });
    await writeLastSyncState({
      location: state.location,
      timestamp,
      accuracy: state.accuracy,
    });
    await notifyClients({ type: "COURIER_SYNC_SUCCESS" });
  } catch (error) {
    console.warn("[admin-sw] courier periodic sync error", error);
    throw error;
  }
};

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "KONFI_CLEAR_ADMIN_PWA_CACHES") {
    event.waitUntil(clearAdminPwaState());
    return;
  }

  if (data.type === "COURIER_SYNC_STATE" && data.state) {
    event.waitUntil(writeState(data.state));
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncCourierPresence());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncCourierPresence());
  }
});
