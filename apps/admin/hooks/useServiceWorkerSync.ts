"use client";

import type { Channel } from "@konfi/types";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useRef } from "react";
import {
  isUnavailableServiceWorkerScriptResponse,
  shouldRegisterAdminServiceWorker,
  shouldSkipAdminServiceWorkerForHostname,
} from "../app/[lng]/components/pwa/service-worker-registration-policy";
import { DELIVERY_CONFIG } from "../app/[lng]/delivery/config";
import {
  saveCourierSyncState,
  type CourierSyncState,
} from "../app/[lng]/delivery/location-sync-store";

// Constants
const PERIODIC_SYNC_TAG = "konfi-courier-presence";
const PERIODIC_SYNC_MIN_INTERVAL = 15 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const SERVICE_WORKER_PATH = "/sw.js";

type TokenCache = {
  token: string;
  fetchedAt: number;
} | null;

type CoordinatesSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export const useServiceWorkerSync = (
  channel: Channel | null,
  user: User | null,
  isCourierClient: boolean,
  isDevelopment: boolean,
) => {
  const tokenCacheRef = useRef<TokenCache>(null);
  const swRegistrationAttemptedRef = useRef<boolean>(false);
  const lastCoordinatesRef = useRef<{
    coords: CoordinatesSnapshot;
    timestamp: number;
  } | null>(null);
  const lastBackgroundSyncRef = useRef<{
    coords: CoordinatesSnapshot;
    timestamp: number;
  } | null>(null);

  // Helper function to calculate distance between two points using Haversine formula
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000; // Earth's radius in meters
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    [],
  );

  // Helper function to determine if background sync should occur
  const shouldSyncBackground = useCallback(
    (coords: CoordinatesSnapshot): { shouldSync: boolean; reason: string } => {
      if (
        coords.accuracy &&
        coords.accuracy > DELIVERY_CONFIG.maxAccuracyThresholdMeters
      ) {
        return { shouldSync: false, reason: "poor_accuracy" };
      }

      // Always sync if we haven't synced anything yet
      if (!lastBackgroundSyncRef.current) {
        return { shouldSync: true, reason: "first_background_sync" };
      }

      // Calculate distance from last background synced location
      const distance = calculateDistance(
        coords.latitude,
        coords.longitude,
        lastBackgroundSyncRef.current.coords.latitude,
        lastBackgroundSyncRef.current.coords.longitude,
      );

      // Always sync if distance is significant
      if (distance >= DELIVERY_CONFIG.significantDistanceMeters) {
        return { shouldSync: true, reason: "significant_distance" };
      }

      // For small movements, use reduced frequency
      if (distance < DELIVERY_CONFIG.minDistanceThresholdMeters) {
        return { shouldSync: false, reason: "insufficient_distance" };
      }

      return { shouldSync: true, reason: "moderate_distance" };
    },
    [calculateDistance],
  );

  const getIdToken = useCallback(
    async (force?: boolean): Promise<string | null> => {
      if (!user) return null;

      const now = Date.now();
      const cached = tokenCacheRef.current;

      if (
        !force &&
        cached &&
        now - cached.fetchedAt < TOKEN_REFRESH_INTERVAL_MS
      ) {
        return cached.token;
      }

      try {
        const token = await user.getIdToken(force === true);
        tokenCacheRef.current = { token, fetchedAt: now };
        return token;
      } catch (error) {
        console.warn("courier id token acquisition failed", error);
        return null;
      }
    },
    [user],
  );

  const persistBackgroundState = useCallback(
    async (coords: CoordinatesSnapshot, timestamp: number) => {
      lastCoordinatesRef.current = { coords, timestamp };
      if (!channel || !user) return;
      if (typeof window === "undefined" || !("serviceWorker" in navigator))
        return;

      // Check if we should sync this location for background sync
      const { shouldSync, reason } = shouldSyncBackground(coords);

      if (!shouldSync) {
        if (isDevelopment) {
          console.log(
            `[ServiceWorkerSync] Skipping background sync - ${reason}`,
            {
              accuracy: coords.accuracy,
              timestamp: new Date(timestamp).toISOString(),
            },
          );
        }
        return;
      }

      const idToken = await getIdToken();
      if (!idToken) return;

      if (isDevelopment) {
        console.log(
          `[ServiceWorkerSync] Persisting background state - ${reason}`,
          {
            accuracy: coords.accuracy,
            timestamp: new Date(timestamp).toISOString(),
          },
        );
      }

      const state: CourierSyncState = {
        userId: user.uid,
        channelId: channel.id,
        idToken,
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
        accuracy: coords.accuracy,
        heading: coords.heading,
        speed: coords.speed,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
        timestamp,
      };

      try {
        await saveCourierSyncState(state);
        const message = { type: "COURIER_SYNC_STATE", state };

        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(message);
        }

        const registration = await navigator.serviceWorker.ready;
        if (registration.active) {
          registration.active.postMessage(message);
        }

        // Update the last background sync reference
        lastBackgroundSyncRef.current = { coords, timestamp };

        if (isDevelopment) {
          console.log(
            `[ServiceWorkerSync] Background state persisted successfully`,
          );
        }
      } catch (error) {
        console.warn("courier sync state persist failed", error);
      }
    },
    [channel?.id, user?.uid, getIdToken, isDevelopment, shouldSyncBackground],
  );

  const requestPeriodicSyncPermission =
    useCallback(async (): Promise<boolean> => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator))
        return false;

      // Check if browser supports periodic background sync
      if (!("periodicSync" in ServiceWorkerRegistration.prototype)) {
        if (isDevelopment) {
          console.log(
            "[ServiceWorkerSync] Periodic background sync not supported in this browser",
          );
        }
        return false;
      }

      try {
        // Request permission explicitly by attempting to register
        // This will trigger the browser's permission prompt
        const registration = await navigator.serviceWorker.ready;
        const periodicManager = registration.periodicSync;

        if (!periodicManager) return false;

        // Attempt to register - this triggers permission request if not already granted
        await periodicManager.register(PERIODIC_SYNC_TAG, {
          minInterval: PERIODIC_SYNC_MIN_INTERVAL,
        });

        if (isDevelopment) {
          console.log(
            "[ServiceWorkerSync] Periodic background sync permission granted",
          );
        }

        return true;
      } catch (error) {
        if (isDevelopment) {
          console.warn(
            "[ServiceWorkerSync] Failed to request periodic sync permission",
            error,
          );
        }
        return false;
      }
    }, [isDevelopment]);

  const ensurePeriodicSyncRegistration = useCallback(async () => {
    if (!isCourierClient || !channel || !user) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;
    if (
      !shouldRegisterAdminServiceWorker({
        enableOverride: process.env.NEXT_PUBLIC_ENABLE_ADMIN_SERVICE_WORKER,
        hostname: window.location.hostname,
        nodeEnv: process.env.NODE_ENV,
      })
    ) {
      return;
    }
    if (swRegistrationAttemptedRef.current) return;

    swRegistrationAttemptedRef.current = true;

    const verifyScriptNoRedirect = async (url: string): Promise<boolean> => {
      if (typeof fetch === "undefined") return true;
      if (shouldSkipAdminServiceWorkerForHostname(window.location.hostname)) {
        if (isDevelopment) {
          console.warn(
            "[ServiceWorkerSync] SW registration skipped on Vercel deployment host",
            {
              hostname: window.location.hostname,
            },
          );
        }
        return false;
      }
      try {
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          redirect: "manual" as RequestRedirect,
        });
        if (isUnavailableServiceWorkerScriptResponse(res)) {
          if (isDevelopment) {
            console.warn("[ServiceWorkerSync] SW script fetch not ok", {
              url,
              status: res.status,
              type: res.type,
            });
          }
          return false;
        }
        return true;
      } catch (e) {
        if (isDevelopment) {
          console.warn("[ServiceWorkerSync] SW script fetch failed", e);
        }
        return false;
      }
    };

    try {
      const scriptValid = await verifyScriptNoRedirect(SERVICE_WORKER_PATH);
      if (!scriptValid) return; // Abort if redirected or invalid response.

      const registration = await navigator.serviceWorker.register(
        SERVICE_WORKER_PATH,
        {
          scope: "/",
          updateViaCache: "none",
        },
      );
      const ready = await navigator.serviceWorker.ready;
      const periodicManager = ready.periodicSync ?? registration.periodicSync;

      if (!periodicManager) {
        if (isDevelopment) {
          console.log("[ServiceWorkerSync] Periodic sync not supported");
        }
        return;
      }

      let permissionGranted = true;
      let permissionState: "granted" | "denied" | "prompt" | undefined;

      // Check permission status
      if (
        "permissions" in navigator &&
        typeof navigator.permissions.query === "function"
      ) {
        try {
          const status = await navigator.permissions.query({
            name: "periodic-background-sync",
          } as PeriodicBackgroundSyncPermissionDescriptor);
          permissionState = status.state as "granted" | "denied" | "prompt";

          if (isDevelopment) {
            console.log(
              "[ServiceWorkerSync] Periodic sync permission state:",
              permissionState,
            );
          }

          if (permissionState === "denied") {
            permissionGranted = false;
          } else if (permissionState === "prompt") {
            // Permission not yet determined, trigger permission request
            permissionGranted = await requestPeriodicSyncPermission();
          }
        } catch (error) {
          if (isDevelopment) {
            console.warn(
              "[ServiceWorkerSync] Permission query failed, will attempt registration",
              error,
            );
          }
          // If query fails, try to register anyway (will trigger permission if needed)
          permissionGranted = await requestPeriodicSyncPermission();
        }
      } else {
        // Browser doesn't support permission API, try to register directly
        permissionGranted = await requestPeriodicSyncPermission();
      }

      if (!permissionGranted) {
        if (isDevelopment) {
          console.warn(
            "[ServiceWorkerSync] Periodic sync permission denied or unavailable",
          );
        }
        return;
      }

      // Check if already registered
      const tags = await periodicManager.getTags();
      if (!tags.includes(PERIODIC_SYNC_TAG)) {
        await periodicManager.register(PERIODIC_SYNC_TAG, {
          minInterval: PERIODIC_SYNC_MIN_INTERVAL,
        });
        if (isDevelopment) {
          console.log(
            "[ServiceWorkerSync] Periodic sync registered successfully",
          );
        }
      }
    } catch (error) {
      console.warn("courier periodic sync registration failed", error);
    }
  }, [
    channel?.id,
    user?.uid,
    isCourierClient,
    isDevelopment,
    requestPeriodicSyncPermission,
  ]);

  // Reset registration attempt when dependencies change
  useEffect(() => {
    swRegistrationAttemptedRef.current = false;
  }, [channel?.id, user?.uid, isCourierClient]);

  // Register service worker when courier client is active
  useEffect(() => {
    if (!isCourierClient) return;
    void ensurePeriodicSyncRegistration();
  }, [ensurePeriodicSyncRegistration, isCourierClient]);

  // Handle service worker messages
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    const handleMessage = (event: MessageEvent) => {
      const data =
        typeof event.data === "object" && event.data
          ? (event.data as { type?: string })
          : null;
      if (!data?.type) return;

      if (data.type === "COURIER_SYNC_TOKEN_EXPIRED") {
        if (isDevelopment) {
          console.log(
            "[ServiceWorkerSync] Token expired event received – refreshing token",
          );
        }
        void (async () => {
          await getIdToken(true);
          const last = lastCoordinatesRef.current;
          if (last) {
            await persistBackgroundState(last.coords, last.timestamp);
          }
        })();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleMessage);
      }
    };
  }, [getIdToken, persistBackgroundState]);

  const cleanup = () => {
    // Intentionally left blank; effect cleanups handle everything.
  };

  const retryPeriodicSyncRegistration =
    useCallback(async (): Promise<boolean> => {
      // Reset the registration attempt flag to allow retry
      swRegistrationAttemptedRef.current = false;

      try {
        await ensurePeriodicSyncRegistration();
        return true;
      } catch (error) {
        console.warn("[ServiceWorkerSync] Retry registration failed", error);
        return false;
      }
    }, [ensurePeriodicSyncRegistration]);

  return {
    persistBackgroundState,
    getIdToken,
    requestPeriodicSyncPermission,
    retryPeriodicSyncRegistration,
    cleanup,
  };
};
