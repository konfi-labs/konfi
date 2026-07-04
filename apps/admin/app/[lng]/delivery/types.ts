import type { GeoPoint } from "firebase/firestore";

export type CoordinatesSnapshot = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type LocationRef = {
  gp?: GeoPoint;
  accuracy?: number;
  ts?: number;
  asked: boolean;
};

export type TokenCache = {
  token: string;
  fetchedAt: number;
} | null;

export type DeliveryError =
  | { type: "GEOLOCATION_DENIED"; message: string }
  | { type: "CAMERA_UNAVAILABLE"; message: string }
  | { type: "SCAN_FAILED"; message: string }
  | { type: "NETWORK_ERROR"; message: string }
  | { type: "SERVICE_WORKER_ERROR"; message: string };

export type LoadingState = {
  scanning: boolean;
  tracking: boolean;
  syncing: boolean;
};

export type DeliveryState = {
  isTracking: boolean;
  location: GeoPoint | null;
  accuracy: number | null;
  lastSync: number;
  error: DeliveryError | null;
  loadingState: LoadingState;
};
