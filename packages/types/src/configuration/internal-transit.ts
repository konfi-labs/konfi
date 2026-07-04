import { Timestamp } from "firebase/firestore";
import type { OrderWorkflowStatusId } from "./order-workflow-statuses";

/**
 * A scheduled courier departure on a transfer route.
 * `time` is "HH:mm" wall-clock in the tenant-configured timezone.
 * `daysOfWeek` are 0–6 (Sunday=0) — days the departure runs.
 */
export interface TransitDeparture {
  id: string;
  time: string;
  daysOfWeek: number[];
}

/**
 * A tenant-configured internal transfer route to a destination (pickup)
 * warehouse, with scheduled courier departures and transit duration.
 */
export interface TransferRoute {
  id: string;
  name: string;
  toWarehouseId: string;
  fromWarehouseIds?: string[];
  departures: TransitDeparture[];
  transitMinutes: number;
  graceMinutes: number;
  arrivalStatusId?: OrderWorkflowStatusId;
  enabled: boolean;
}

export interface InternalTransitSettings {
  routes: TransferRoute[];
  timezone: string;
  updatedAt?: unknown;
  tenantId?: string;
}

/**
 * Per route+date override doc, allowing staff to skip a scheduled
 * departure or add an extra one for a single day.
 */
export interface TransitDayOverride {
  date: string;
  routeId: string;
  skipDepartureIds?: string[];
  extraDepartures?: { time: string }[];
}

export type OrderInternalTransitState = "SCHEDULED" | "ARRIVED" | "CANCELED";

export interface OrderInternalTransit {
  state: OrderInternalTransitState;
  routeId: string;
  departureAt: Omit<Timestamp, "toJSON">;
  expectedArrivalAt: Omit<Timestamp, "toJSON">;
  scheduledAt: Omit<Timestamp, "toJSON">;
  destinationWarehouseId: string;
}
