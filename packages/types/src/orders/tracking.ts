import { GeoPoint, Timestamp } from "firebase/firestore";
import type { ShippingMethodId } from "../configuration/shipping-methods";

export type TrackingScanStage = "PICKUP" | "DELIVERY" | "OTHER";

export interface TrackingScan {
  id: string;
  stage: TrackingScanStage;
  scannedAt: Omit<Timestamp, "toJSON">;
  by?: string;
  location?: GeoPoint;
  accuracy?: number;
  raw: string;
  userAgent?: string;
}

export interface Tracking {
  shippingOption: ShippingMethodId;
  number: string | string[];
  link: string;

  // Rollups (optional)
  pickupAt?: Omit<Timestamp, "toJSON">;
  deliveredAt?: Omit<Timestamp, "toJSON">;
  lastScan?: TrackingScan;
  // Optional small in-doc history
  scans?: TrackingScan[];
}
