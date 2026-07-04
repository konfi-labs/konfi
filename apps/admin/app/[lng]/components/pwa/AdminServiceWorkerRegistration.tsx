"use client";

import { useEffect } from "react";
import {
  ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY,
  isUnavailableServiceWorkerScriptResponse,
  shouldReloadAfterAdminServiceWorkerCleanup,
  shouldRegisterAdminServiceWorker,
} from "./service-worker-registration-policy";

async function deleteAdminPwaIndexedDb() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("konfi-delivery-sync");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearAdminPwaCaches() {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("konfi-admin-"))
      .map((cacheName) => window.caches.delete(cacheName)),
  );
}

export function AdminServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;

    const unregisterExistingServiceWorkers = async () => {
      const registrations =
        typeof navigator.serviceWorker.getRegistrations === "function"
          ? await navigator.serviceWorker.getRegistrations()
          : [await navigator.serviceWorker.getRegistration("/")].filter(
              (registration): registration is ServiceWorkerRegistration =>
                Boolean(registration),
            );
      const hadRegistrations = registrations.length > 0;
      const hadController = Boolean(navigator.serviceWorker.controller);

      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
      await clearAdminPwaCaches();
      await deleteAdminPwaIndexedDb();

      return { hadController, hadRegistrations };
    };

    const reloadAfterLocalCleanupIfNeeded = ({
      hadController,
      hadRegistrations,
    }: Awaited<ReturnType<typeof unregisterExistingServiceWorkers>>) => {
      let cleanupReloaded = false;
      try {
        cleanupReloaded =
          window.sessionStorage.getItem(
            ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY,
          ) === "true";
      } catch {
        cleanupReloaded = false;
      }

      if (
        !shouldReloadAfterAdminServiceWorkerCleanup({
          cleanupReloaded,
          hadController,
          hadRegistrations,
        })
      ) {
        return;
      }

      try {
        window.sessionStorage.setItem(
          ADMIN_SERVICE_WORKER_CLEANUP_RELOAD_KEY,
          "true",
        );
      } catch {
        // Reload anyway; the marker only prevents repeated cleanup reloads.
      }

      window.location.reload();
    };

    const registerServiceWorker = async () => {
      try {
        if (
          !shouldRegisterAdminServiceWorker({
            enableOverride: process.env.NEXT_PUBLIC_ENABLE_ADMIN_SERVICE_WORKER,
            hostname: window.location.hostname,
            nodeEnv: process.env.NODE_ENV,
          })
        ) {
          const cleanupState = await unregisterExistingServiceWorkers();
          if (!cancelled) {
            reloadAfterLocalCleanupIfNeeded(cleanupState);
          }
          return;
        }

        const response = await fetch("/sw.js", {
          cache: "no-store",
          redirect: "manual",
        });
        if (isUnavailableServiceWorkerScriptResponse(response)) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[admin-sw] script fetch failed", response.status);
          }
          await unregisterExistingServiceWorkers();
          return;
        }

        if (cancelled) {
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[admin-sw] registration failed", error);
        }
      }
    };

    if (document.readyState === "complete") {
      void registerServiceWorker();
      return () => {
        cancelled = true;
      };
    }

    window.addEventListener("load", registerServiceWorker, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
