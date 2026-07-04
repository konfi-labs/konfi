import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  INTERNAL_TRANSIT_SETTINGS_DOC_ID,
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  computeNextTransitArrival,
  normalizeInternalTransitSettings,
  normalizeOrderWorkflowStatusesSettings,
  transitDayOverrideDocId,
  type TransitArrivalResult,
} from "@konfi/utils";
import type {
  DesignatedPickupArea,
  InternalTransitSettings,
  OrderInternalTransit,
  OrderWorkflowStatusesSettings,
  StoreOrder,
  TransferRoute,
  TransitDayOverride,
} from "@konfi/types";
import { Timestamp } from "firebase-admin/firestore";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function settingsDocRef(channelId: string, docId: string) {
  return getAdminDb().doc(`channels/${channelId}/settings/${docId}`);
}

export async function loadOrderWorkflowStatusesSettingsForChannel(
  channelId: string,
): Promise<OrderWorkflowStatusesSettings> {
  const snapshot = await settingsDocRef(
    channelId,
    ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  ).get();

  return normalizeOrderWorkflowStatusesSettings(
    snapshot.exists ? (snapshot.data() as OrderWorkflowStatusesSettings) : null,
  );
}

export async function loadInternalTransitSettingsForChannel(
  channelId: string,
): Promise<InternalTransitSettings> {
  const snapshot = await settingsDocRef(
    channelId,
    INTERNAL_TRANSIT_SETTINGS_DOC_ID,
  ).get();

  return normalizeInternalTransitSettings(
    snapshot.exists ? (snapshot.data() as InternalTransitSettings) : null,
  );
}

async function resolvePickupAreaWarehouseId(
  designatedPickupAreaId: string | undefined,
  tenantId?: string,
): Promise<string | undefined> {
  if (!designatedPickupAreaId) {
    return undefined;
  }

  const snapshot = await getAdminDb()
    .doc(`designatedPickupAreas/${designatedPickupAreaId}`)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  const pickupArea = snapshot.data() as DesignatedPickupArea;
  if (tenantId && pickupArea.tenantId !== tenantId) {
    return undefined;
  }

  return pickupArea.warehouseId;
}

function findMatchingRoute(
  settings: InternalTransitSettings,
  destinationWarehouseId: string,
): TransferRoute | undefined {
  return settings.routes.find(
    (route) =>
      route.enabled && route.toWarehouseId === destinationWarehouseId,
  );
}

/**
 * Load the day-override docs that could affect an ETA computed from
 * `dispatchedAt` — today and the next few days in the tenant timezone.
 * The forward search in `computeNextTransitArrival` only looks at a handful of
 * days, so a small window is sufficient; we load 16 days to comfortably cover
 * the 14-day search plus timezone edges.
 */
async function loadDayOverrides(
  channelId: string,
  routeId: string,
  dispatchedAt: Date,
  timezone: string,
): Promise<TransitDayOverride[]> {
  const dateKeys = new Set<string>();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  for (let offset = 0; offset <= 16; offset += 1) {
    dateKeys.add(formatter.format(new Date(dispatchedAt.getTime() + offset * MS_PER_DAY)));
  }

  const refs = [...dateKeys].map((date) =>
    getAdminDb().doc(
      `channels/${channelId}/transitDayOverrides/${transitDayOverrideDocId(routeId, date)}`,
    ),
  );

  if (refs.length === 0) {
    return [];
  }

  const snapshots = await getAdminDb().getAll(...refs);

  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() as TransitDayOverride);
}

export interface ScheduledInternalTransit {
  internalTransit: OrderInternalTransit;
  route: TransferRoute;
  arrival: TransitArrivalResult;
}

export type InternalTransitScheduleOutcome =
  | { scheduled: true; data: ScheduledInternalTransit }
  | {
      scheduled: false;
      reason:
        | "no-pickup-area"
        | "no-matching-route"
        | "no-departure-window";
    };

/**
 * Resolve the destination warehouse and matching route for an order entering a
 * transit-flagged status, then compute the ETA. Pure of any writes — the caller
 * persists the returned `internalTransit` object.
 */
export async function scheduleInternalTransitForOrder(params: {
  channelId: string;
  order: Pick<StoreOrder, "designatedPickupAreaId">;
  dispatchedAt: Date;
  settings: InternalTransitSettings;
  tenantId?: string;
}): Promise<InternalTransitScheduleOutcome> {
  const { channelId, order, dispatchedAt, settings, tenantId } = params;

  const destinationWarehouseId = await resolvePickupAreaWarehouseId(
    order.designatedPickupAreaId,
    tenantId,
  );

  if (!destinationWarehouseId) {
    return { scheduled: false, reason: "no-pickup-area" };
  }

  const route = findMatchingRoute(settings, destinationWarehouseId);
  if (!route) {
    return { scheduled: false, reason: "no-matching-route" };
  }

  const overrides = await loadDayOverrides(
    channelId,
    route.id,
    dispatchedAt,
    settings.timezone,
  );

  const arrival = computeNextTransitArrival(
    dispatchedAt,
    route,
    overrides,
    settings.timezone,
  );

  if (!arrival) {
    return { scheduled: false, reason: "no-departure-window" };
  }

  const internalTransit: OrderInternalTransit = {
    state: "SCHEDULED",
    routeId: route.id,
    departureAt: Timestamp.fromDate(arrival.departureAt),
    expectedArrivalAt: Timestamp.fromDate(arrival.expectedArrivalAt),
    scheduledAt: Timestamp.fromDate(dispatchedAt),
    destinationWarehouseId,
  };

  return {
    scheduled: true,
    data: { internalTransit, route, arrival },
  };
}
