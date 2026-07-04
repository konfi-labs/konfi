"use client";

import { firestore } from "@/lib/firebase/clientApp";
import { db } from "@konfi/firebase";
import type { Channel } from "@konfi/types";
import type { User } from "firebase/auth";
import { GeoPoint, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { DELIVERY_CONFIG } from "../app/[lng]/delivery/config";

// Constants
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 20000,
} as const;

const INITIAL_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 60000,
} as const;

type CoordinatesSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

type LocationRef = {
  gp?: GeoPoint;
  accuracy?: number;
  ts?: number;
  asked: boolean;
  lastSyncedLocation?: GeoPoint;
  lastSyncedAt?: number;
  lastMovementAt?: number;
  isStationary?: boolean;
};

type GeolocationError =
  | { type: "PERMISSION_DENIED"; message: string; }
  | { type: "POSITION_UNAVAILABLE"; message: string; }
  | { type: "TIMEOUT"; message: string; }
  | { type: "UNKNOWN"; message: string; };

type GeolocationElementLike = HTMLElement & {
  position: GeolocationPosition | null;
  error: GeolocationPositionError | null;
  autolocate: boolean;
  watch: boolean;
  onlocation: ((this: GlobalEventHandlers, ev: Event) => unknown) | null;
};

const GEOLOCATION_ELEMENT_FALLBACK_DELAY_MS = 1500;
const GEOLOCATION_ELEMENT_WAIT_TIMEOUT_MS = 4000;

export const useGeolocationTracking = (
  channel: Channel | null,
  user: User | null,
  isCourierClient: boolean,
  isDevelopment: boolean,
  onLocationUpdate?: (coords: CoordinatesSnapshot, timestamp: number) => void,
) => {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const locationRef = useRef<LocationRef>({ asked: false });
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef<number>(0);
  const geolocationElementRef = useRef<GeolocationElementLike | null>(null);
  const geolocationElementCleanupRef = useRef<(() => void) | null>(null);

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

  // Helper function to determine if location update should be synced
  const shouldSyncLocation = useCallback(
    (pos: GeolocationPosition): { shouldSync: boolean; reason: string; } => {
      const now = Date.now();
      const accuracy = pos.coords.accuracy;
      const currentLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      // Always sync if accuracy is too poor (we need better data)
      if (accuracy > DELIVERY_CONFIG.maxAccuracyThresholdMeters) {
        return { shouldSync: false, reason: "poor_accuracy" };
      }

      // Always sync if we haven't synced anything yet
      if (
        !locationRef.current.lastSyncedLocation ||
        !locationRef.current.lastSyncedAt
      ) {
        return { shouldSync: true, reason: "first_sync" };
      }

      // Calculate distance from last synced location
      const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        locationRef.current.lastSyncedLocation.latitude,
        locationRef.current.lastSyncedLocation.longitude,
      );

      // Always sync if distance is significant (regardless of time)
      if (distance >= DELIVERY_CONFIG.significantDistanceMeters) {
        return { shouldSync: true, reason: "significant_distance" };
      }

      // Check if minimum distance threshold is met
      if (distance < DELIVERY_CONFIG.minDistanceThresholdMeters) {
        // Update stationary status
        const timeSinceLastMovement = locationRef.current.lastMovementAt
          ? now - locationRef.current.lastMovementAt
          : 0;

        const wasStationary = locationRef.current.isStationary;
        const isNowStationary =
          timeSinceLastMovement > DELIVERY_CONFIG.stationaryTimeoutMs;

        // If newly stationary, we should sync to mark the transition
        if (!wasStationary && isNowStationary) {
          return { shouldSync: true, reason: "newly_stationary" };
        }

        // If stationary, check reduced sync interval
        if (isNowStationary) {
          const timeSinceLastSync = now - locationRef.current.lastSyncedAt;
          if (timeSinceLastSync >= DELIVERY_CONFIG.stationaryReducedSyncMs) {
            return { shouldSync: true, reason: "stationary_interval" };
          }
          return { shouldSync: false, reason: "stationary_throttled" };
        }

        // Not enough distance and not enough time
        return { shouldSync: false, reason: "insufficient_distance" };
      }

      // Check time-based throttling for normal movement
      const timeSinceLastSync = now - locationRef.current.lastSyncedAt;
      if (timeSinceLastSync < DELIVERY_CONFIG.writeThrottleMs) {
        return { shouldSync: false, reason: "time_throttled" };
      }

      return { shouldSync: true, reason: "distance_and_time" };
    },
    [calculateDistance],
  );

  const handleGeolocationError = useCallback(
    (err: GeolocationPositionError): GeolocationError => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          return {
            type: "PERMISSION_DENIED",
            message: "Location access denied",
          };
        case err.POSITION_UNAVAILABLE:
          return {
            type: "POSITION_UNAVAILABLE",
            message: "Location unavailable",
          };
        case err.TIMEOUT:
          return { type: "TIMEOUT", message: "Location request timeout" };
        default:
          return {
            type: "UNKNOWN",
            message: err.message || "Unknown geolocation error",
          };
      }
    },
    [],
  );

  const supportsGeolocationElement = useCallback((): boolean => {
    if (typeof window === "undefined") return false;

    const windowWithGeolocationElement = window as Window & {
      HTMLGeolocationElement?: unknown;
    };

    return Boolean(windowWithGeolocationElement.HTMLGeolocationElement);
  }, []);

  const ensureGeolocationElement = useCallback(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      !supportsGeolocationElement()
    ) {
      return null;
    }

    if (geolocationElementRef.current?.isConnected) {
      return geolocationElementRef.current;
    }

    const element = document.createElement(
      "geolocation",
    ) as GeolocationElementLike;

    element.autolocate = true;
    element.setAttribute("autolocate", "");
    element.setAttribute("accuracymode", "precise");
    element.style.display = "none";

    document.body.appendChild(element);
    geolocationElementRef.current = element;

    return element;
  }, [supportsGeolocationElement]);

  const clearGeolocationElementBindings = useCallback(() => {
    geolocationElementCleanupRef.current?.();
    geolocationElementCleanupRef.current = null;
  }, []);

  const destroyGeolocationElement = useCallback(() => {
    clearGeolocationElementBindings();

    const element = geolocationElementRef.current;
    if (!element) return;

    element.watch = false;
    element.autolocate = false;
    element.removeAttribute("watch");
    element.removeAttribute("autolocate");
    element.onlocation = null;

    if (element.isConnected) {
      element.remove();
    }

    geolocationElementRef.current = null;
  }, [clearGeolocationElementBindings]);

  const writePresence = useCallback(
    async (pos: GeolocationPosition) => {
      if (!channel || !user || isDevelopment) return;

      const now = Date.now();

      // Check if we should sync this location update
      const { shouldSync, reason } = shouldSyncLocation(pos);

      if (!shouldSync) {
        if (isDevelopment) {
          console.log(`[GeolocationTracking] Skipping sync - ${reason}`, {
            accuracy: pos.coords.accuracy,
            timestamp: new Date(pos.timestamp || now).toISOString(),
          });
        }
        return;
      }

      if (isDevelopment) {
        console.log(`[GeolocationTracking] Syncing location - ${reason}`, {
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp || now).toISOString(),
        });
      }

      lastWriteRef.current = now;

      try {
        const coordsSnapshot: CoordinatesSnapshot = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
          heading:
            typeof pos.coords.heading === "number" ? pos.coords.heading : null,
          speed: typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        const timestamp =
          typeof pos.timestamp === "number" ? pos.timestamp : now;
        const gp = new GeoPoint(pos.coords.latitude, pos.coords.longitude);

        // Calculate if this represents movement
        const hasLastLocation = locationRef.current.lastSyncedLocation;
        let isMovement = true;

        if (hasLastLocation) {
          const distance = calculateDistance(
            pos.coords.latitude,
            pos.coords.longitude,
            hasLastLocation.latitude,
            hasLastLocation.longitude,
          );
          isMovement = distance >= DELIVERY_CONFIG.minDistanceThresholdMeters;
        }

        // Update local state
        setLocation(gp);
        setAccuracy(coordsSnapshot.accuracy);

        // Update location ref with movement tracking
        const previousRef = locationRef.current;
        locationRef.current = {
          asked: true,
          gp,
          accuracy: coordsSnapshot.accuracy ?? undefined,
          ts: timestamp,
          lastSyncedLocation: gp,
          lastSyncedAt: now,
          lastMovementAt: isMovement ? now : previousRef.lastMovementAt || now,
          isStationary:
            !isMovement && previousRef.lastMovementAt
              ? now - previousRef.lastMovementAt >
              DELIVERY_CONFIG.stationaryTimeoutMs
              : false,
        };

        // Notify parent component
        onLocationUpdate?.(coordsSnapshot, timestamp);

        // Write to Firestore
        const presenceRef = db.doc(
          firestore,
          `/channels/${channel.id}/couriers`,
          user.uid,
        );
        await setDoc(
          presenceRef,
          {
            uid: user.uid,
            updatedAt: serverTimestamp(),
            location: gp,
            accuracy: coordsSnapshot.accuracy,
            heading: coordsSnapshot.heading,
            speed: coordsSnapshot.speed,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
            activePage: "delivery",
            isStationary: locationRef.current.isStationary,
          },
          { merge: true },
        );
      } catch (e) {
        console.warn("courier presence write failed", e);
      }
    },
    [
      channel,
      user,
      isDevelopment,
      onLocationUpdate,
      shouldSyncLocation,
      calculateDistance,
    ],
  );

  const requestInitialLocationWithNavigator = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gp = new GeoPoint(pos.coords.latitude, pos.coords.longitude);
        locationRef.current = {
          asked: true,
          gp,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        setLocation(gp);
        setAccuracy(pos.coords.accuracy);
        setError(null);
      },
      (err) => {
        const geoError = handleGeolocationError(err);
        setError(geoError);
      },
      INITIAL_GEOLOCATION_OPTIONS,
    );
  }, [handleGeolocationError]);

  const requestInitialLocation = useCallback(async () => {
    if (!isCourierClient || isDevelopment) return;
    if (locationRef.current.asked || typeof window === "undefined")
      return;

    locationRef.current.asked = true;

    const geolocationElement = ensureGeolocationElement();

    if (!geolocationElement) {
      if (!navigator.geolocation) return;
      requestInitialLocationWithNavigator();
      return;
    }

    geolocationElement.watch = false;
    geolocationElement.removeAttribute("watch");
    geolocationElement.autolocate = true;
    geolocationElement.setAttribute("autolocate", "");

    const handleLocationEvent = () => {
      const position = geolocationElement.position;
      const geolocationError = geolocationElement.error;

      if (position) {
        const gp = new GeoPoint(
          position.coords.latitude,
          position.coords.longitude,
        );
        locationRef.current = {
          asked: true,
          gp,
          accuracy: position.coords.accuracy,
          ts: Date.now(),
        };
        setLocation(gp);
        setAccuracy(position.coords.accuracy);
        setError(null);
      } else if (geolocationError) {
        const geoError = handleGeolocationError(geolocationError);
        setError(geoError);
      }
    };

    geolocationElement.addEventListener("location", handleLocationEvent);
    geolocationElement.onlocation = handleLocationEvent;

    handleLocationEvent();

    const fallbackTimeoutId = window.setTimeout(() => {
      if (!locationRef.current.gp) {
        requestInitialLocationWithNavigator();
      }

      geolocationElement.removeEventListener("location", handleLocationEvent);
      if (geolocationElement.onlocation === handleLocationEvent) {
        geolocationElement.onlocation = null;
      }
    }, GEOLOCATION_ELEMENT_FALLBACK_DELAY_MS);

    geolocationElementCleanupRef.current = () => {
      window.clearTimeout(fallbackTimeoutId);
      geolocationElement.removeEventListener("location", handleLocationEvent);
      if (geolocationElement.onlocation === handleLocationEvent) {
        geolocationElement.onlocation = null;
      }
    };
  }, [
    isCourierClient,
    isDevelopment,
    ensureGeolocationElement,
    handleGeolocationError,
    requestInitialLocationWithNavigator,
  ]);

  const clearPresenceAndWatch = useCallback(() => {
    clearGeolocationElementBindings();

    if (geolocationElementRef.current) {
      geolocationElementRef.current.watch = false;
      geolocationElementRef.current.removeAttribute("watch");
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (channel && user) {
      const presenceRef = db.doc(
        firestore,
        `/channels/${channel.id}/couriers`,
        user.uid,
      );
      void setDoc(
        presenceRef,
        { activePage: null, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  }, [channel, user, clearGeolocationElementBindings]);

  const startTracking = useCallback(() => {
    if (!channel || !user || !isCourierClient || isDevelopment) return;
    if (isTracking || typeof window === "undefined") return;

    setIsTracking(true);
    setError(null);

    const geolocationElement = ensureGeolocationElement();

    if (geolocationElement) {
      clearGeolocationElementBindings();

      geolocationElement.watch = true;
      geolocationElement.setAttribute("watch", "");
      geolocationElement.autolocate = true;
      geolocationElement.setAttribute("autolocate", "");
      geolocationElement.setAttribute("accuracymode", "precise");

      const handleElementLocation = () => {
        const position = geolocationElement.position;
        const geolocationError = geolocationElement.error;

        if (position) {
          setError(null);
          void writePresence(position);
          return;
        }

        if (geolocationError) {
          const geoError = handleGeolocationError(geolocationError);
          setError(geoError);
        }
      };

      geolocationElement.addEventListener("location", handleElementLocation);
      geolocationElement.onlocation = handleElementLocation;
      geolocationElementCleanupRef.current = () => {
        geolocationElement.removeEventListener("location", handleElementLocation);
        if (geolocationElement.onlocation === handleElementLocation) {
          geolocationElement.onlocation = null;
        }
      };

      // If the element already has a position, use it immediately.
      handleElementLocation();
      return;
    }

    if (!navigator.geolocation) {
      setError({
        type: "POSITION_UNAVAILABLE",
        message: "Geolocation API unavailable",
      });
      setIsTracking(false);
      return;
    }

    const handleError = (err: GeolocationPositionError) => {
      const geoError = handleGeolocationError(err);
      setError(geoError);
    };

    const id = navigator.geolocation.watchPosition(
      writePresence,
      handleError,
      GEOLOCATION_OPTIONS,
    );
    watchIdRef.current = id;

    // Initial heartbeat if we already have a position
    if (locationRef.current.gp && channel && user) {
      const presenceRef = db.doc(
        firestore,
        `/channels/${channel.id}/couriers`,
        user.uid,
      );
      void setDoc(
        presenceRef,
        {
          uid: user.uid,
          updatedAt: serverTimestamp(),
          location: locationRef.current.gp,
          accuracy: locationRef.current.accuracy ?? null,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
          activePage: "delivery",
        },
        { merge: true },
      );
    }
  }, [
    channel,
    user,
    isCourierClient,
    isDevelopment,
    isTracking,
    ensureGeolocationElement,
    clearGeolocationElementBindings,
    writePresence,
    handleGeolocationError,
  ]);

  const stopTracking = useCallback(() => {
    if (!isTracking) return;

    setIsTracking(false);
    clearPresenceAndWatch();
  }, [isTracking, clearPresenceAndWatch]);

  const getCurrentLocation = useCallback(async (): Promise<{
    gp: GeoPoint | null;
    accuracy: number | null;
  }> => {
    const freshMs = 2 * 60 * 1000; // 2 minutes freshness window
    const now = Date.now();

    // Return cached location if fresh
    if (
      locationRef.current.gp &&
      locationRef.current.ts &&
      now - locationRef.current.ts < freshMs
    ) {
      return {
        gp: locationRef.current.gp,
        accuracy: locationRef.current.accuracy ?? null,
      };
    }

    const geolocationElement = ensureGeolocationElement();

    if (geolocationElement) {
      const currentPosition = geolocationElement.position;
      if (currentPosition) {
        const coordsSnapshot: CoordinatesSnapshot = {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
          accuracy:
            typeof currentPosition.coords.accuracy === "number"
              ? currentPosition.coords.accuracy
              : null,
          heading:
            typeof currentPosition.coords.heading === "number"
              ? currentPosition.coords.heading
              : null,
          speed:
            typeof currentPosition.coords.speed === "number"
              ? currentPosition.coords.speed
              : null,
        };

        const timestamp =
          typeof currentPosition.timestamp === "number"
            ? currentPosition.timestamp
            : Date.now();
        const gp = new GeoPoint(
          coordsSnapshot.latitude,
          coordsSnapshot.longitude,
        );

        locationRef.current = {
          asked: true,
          gp,
          accuracy: coordsSnapshot.accuracy ?? undefined,
          ts: timestamp,
          lastSyncedLocation: gp,
          lastSyncedAt: timestamp,
          lastMovementAt: timestamp,
          isStationary: false,
        };

        setLocation(gp);
        setAccuracy(coordsSnapshot.accuracy);
        onLocationUpdate?.(coordsSnapshot, timestamp);

        return { gp, accuracy: coordsSnapshot.accuracy };
      }

      const positionFromEvent = await new Promise<GeolocationPosition | null>(
        (resolve) => {
          const handleLocationEvent = () => {
            if (geolocationElement.position) {
              cleanup();
              resolve(geolocationElement.position);
              return;
            }

            if (geolocationElement.error) {
              const geoError = handleGeolocationError(geolocationElement.error);
              setError(geoError);
              cleanup();
              resolve(null);
            }
          };

          const timeoutId = window.setTimeout(() => {
            cleanup();
            resolve(null);
          }, GEOLOCATION_ELEMENT_WAIT_TIMEOUT_MS);

          const cleanup = () => {
            window.clearTimeout(timeoutId);
            geolocationElement.removeEventListener("location", handleLocationEvent);
            if (geolocationElement.onlocation === handleLocationEvent) {
              geolocationElement.onlocation = null;
            }
          };

          geolocationElement.addEventListener("location", handleLocationEvent);
          geolocationElement.onlocation = handleLocationEvent;

          handleLocationEvent();
        },
      );

      if (positionFromEvent) {
        const coordsSnapshot: CoordinatesSnapshot = {
          latitude: positionFromEvent.coords.latitude,
          longitude: positionFromEvent.coords.longitude,
          accuracy:
            typeof positionFromEvent.coords.accuracy === "number"
              ? positionFromEvent.coords.accuracy
              : null,
          heading:
            typeof positionFromEvent.coords.heading === "number"
              ? positionFromEvent.coords.heading
              : null,
          speed:
            typeof positionFromEvent.coords.speed === "number"
              ? positionFromEvent.coords.speed
              : null,
        };

        const timestamp =
          typeof positionFromEvent.timestamp === "number"
            ? positionFromEvent.timestamp
            : Date.now();
        const gp = new GeoPoint(
          coordsSnapshot.latitude,
          coordsSnapshot.longitude,
        );

        locationRef.current = {
          asked: true,
          gp,
          accuracy: coordsSnapshot.accuracy ?? undefined,
          ts: timestamp,
          lastSyncedLocation: gp,
          lastSyncedAt: timestamp,
          lastMovementAt: timestamp,
          isStationary: false,
        };

        setLocation(gp);
        setAccuracy(coordsSnapshot.accuracy);
        onLocationUpdate?.(coordsSnapshot, timestamp);

        return { gp, accuracy: coordsSnapshot.accuracy };
      }
    }

    // Get fresh location
    if (typeof window === "undefined" || !navigator.geolocation) {
      return {
        gp: locationRef.current.gp ?? null,
        accuracy: locationRef.current.accuracy ?? null,
      };
    }

    const getPosition = (): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        try {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 4000,
            maximumAge: 30000,
          });
        } catch (e) {
          reject(e);
        }
      });

    try {
      const pos = await getPosition();
      const coordsSnapshot: CoordinatesSnapshot = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:
          typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
        heading:
          typeof pos.coords.heading === "number" ? pos.coords.heading : null,
        speed: typeof pos.coords.speed === "number" ? pos.coords.speed : null,
      };

      const timestamp =
        typeof pos.timestamp === "number" ? pos.timestamp : Date.now();
      const gp = new GeoPoint(
        coordsSnapshot.latitude,
        coordsSnapshot.longitude,
      );

      locationRef.current = {
        asked: true,
        gp,
        accuracy: coordsSnapshot.accuracy ?? undefined,
        ts: timestamp,
        lastSyncedLocation: gp,
        lastSyncedAt: timestamp,
        lastMovementAt: timestamp,
        isStationary: false,
      };

      setLocation(gp);
      setAccuracy(coordsSnapshot.accuracy);

      // Notify parent component
      onLocationUpdate?.(coordsSnapshot, timestamp);

      return { gp, accuracy: coordsSnapshot.accuracy };
    } catch {
      // Fall back to cached location
      return {
        gp: locationRef.current.gp ?? null,
        accuracy: locationRef.current.accuracy ?? null,
      };
    }
  }, [onLocationUpdate, ensureGeolocationElement, handleGeolocationError]);

  // Initialize location on mount
  useEffect(() => {
    void requestInitialLocation();
  }, [requestInitialLocation]);

  // Auto-start tracking when conditions are met
  useEffect(() => {
    if (channel && user && isCourierClient && !isDevelopment && !isTracking) {
      startTracking();
    }
  }, [
    channel,
    user,
    isCourierClient,
    isDevelopment,
    isTracking,
    startTracking,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPresenceAndWatch();
      destroyGeolocationElement();
    };
  }, [clearPresenceAndWatch, destroyGeolocationElement]);

  return {
    isTracking,
    location,
    accuracy,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
    cleanup: clearPresenceAndWatch,
  };
};
