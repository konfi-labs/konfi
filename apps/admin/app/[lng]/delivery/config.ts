// Configuration constants for the delivery page
export const DELIVERY_CONFIG = {
  isDevelopment: process.env.NODE_ENV !== "production",
  trackingInterval: 60000, // 60 seconds
  syncInterval: 15 * 60 * 1000, // 15 minutes
  tokenRefreshInterval: 45 * 60 * 1000, // 45 minutes
  locationFreshnessWindow: 2 * 60 * 1000, // 2 minutes
  writeThrottleMs: 60000, // 60 seconds
  // Location optimization settings
  minDistanceThresholdMeters: 10, // Minimum distance to trigger sync
  stationaryTimeoutMs: 5 * 60 * 1000, // 5 minutes - time to consider stationary
  stationaryReducedSyncMs: 5 * 60 * 1000, // 5 minutes - reduced sync interval when stationary
  maxAccuracyThresholdMeters: 100, // Maximum acceptable accuracy in meters
  significantDistanceMeters: 50, // Distance that always triggers sync regardless of time
} as const;

export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 20000,
} as const;

export const INITIAL_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 60000,
} as const;

export const PERIODIC_SYNC_CONFIG = {
  tag: "konfi-courier-presence",
  minInterval: 15 * 60 * 1000, // 15 minutes
} as const;
