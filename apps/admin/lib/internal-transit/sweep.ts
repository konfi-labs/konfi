import "server-only";

import { maybeSendPickupReadyEmailForArrivedOrder } from "@/actions/order-updates";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  loadInternalTransitSettingsForChannel,
  loadOrderWorkflowStatusesSettingsForChannel,
} from "@/lib/internal-transit/server";
import { requireTenantContextTenantId } from "@konfi/firebase";
import {
  ActivityStatus,
  IActivity,
  ShippingOptions,
  StoreOrder,
  Tracking,
} from "@konfi/types";
import { doesOrderWorkflowStatusStartInternalTransit } from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const INTERNAL_TRANSIT_SOURCE = "internal-transit-scheduler";

export interface InternalTransitSweepResult {
  arrived: number;
  failed: number;
  scanned: number;
  skipped: number;
}

function shouldScopeToTenant(tenantContext: TenantContext): boolean {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function getTenantScopeId(tenantContext: TenantContext): string | undefined {
  return shouldScopeToTenant(tenantContext)
    ? requireTenantContextTenantId(tenantContext, "internal transit cron")
    : undefined;
}

/**
 * Sweep due internal-transit orders for one tenant context: find orders whose
 * scheduled arrival has passed, mark them arrived (releasing the suppressed
 * pickup-ready email), flip transit state to ARRIVED, log activities, and apply
 * any configured arrival-status transition. Idempotent per order; failures are
 * logged and do not abort the batch.
 */
export async function runInternalTransitSweepForTenant(
  tenantContext: TenantContext,
): Promise<InternalTransitSweepResult> {
  const firestore = getAdminDb();
  const tenantScopeId = getTenantScopeId(tenantContext);
  const now = Timestamp.now();

  let ordersQuery: FirebaseFirestore.Query = firestore
    .collectionGroup("orders")
    .where("internalTransit.state", "==", "SCHEDULED")
    .where("internalTransit.expectedArrivalAt", "<=", now);

  if (tenantScopeId) {
    ordersQuery = ordersQuery.where("tenantId", "==", tenantScopeId);
  }

  const ordersSnapshot = await ordersQuery.get();
  const result: InternalTransitSweepResult = {
    arrived: 0,
    failed: 0,
    scanned: ordersSnapshot.size,
    skipped: 0,
  };

  // Cache workflow-status settings per channel within a sweep.
  const workflowSettingsCache = new Map<
    string,
    Awaited<ReturnType<typeof loadOrderWorkflowStatusesSettingsForChannel>>
  >();

  for (const orderDoc of ordersSnapshot.docs) {
    const order = orderDoc.data() as StoreOrder;
    const channelId = order.channelId;
    const orderId = orderDoc.id;
    const orderRef = orderDoc.ref;

    try {
      const transit = order.internalTransit;

      // Re-check state after the query (defensive against races).
      if (!transit || transit.state !== "SCHEDULED") {
        result.skipped += 1;
        continue;
      }

      if (!channelId) {
        result.skipped += 1;
        continue;
      }

      let workflowSettings = workflowSettingsCache.get(channelId);
      if (!workflowSettings) {
        workflowSettings =
          await loadOrderWorkflowStatusesSettingsForChannel(channelId);
        workflowSettingsCache.set(channelId, workflowSettings);
      }

      // Verify the order is still in a transit-flagged status. If staff already
      // moved it on, skip the auto-arrival.
      if (
        !doesOrderWorkflowStatusStartInternalTransit(
          order.status,
          workflowSettings,
        )
      ) {
        result.skipped += 1;
        continue;
      }

      const arrivalActivity: IActivity = {
        type: ActivityStatus.INTERNAL_TRANSIT_ARRIVED,
        value: ActivityStatus.INTERNAL_TRANSIT_ARRIVED,
        timestamp: Timestamp.now(),
        metadata: {
          source: INTERNAL_TRANSIT_SOURCE,
          routeId: transit.routeId,
          destinationWarehouseId: transit.destinationWarehouseId,
        },
      };

      const activities: IActivity[] = [arrivalActivity];

      // Optional auto-transition to a configured arrival status. Applied
      // directly (the cron has no admin session, and we deliberately skip the
      // transit dispatch hook for the arrival status).
      const settings = await loadInternalTransitSettingsForChannel(channelId);
      const route = settings.routes.find((item) => item.id === transit.routeId);
      const arrivalStatusId = route?.arrivalStatusId;
      const shouldTransition =
        !!arrivalStatusId && arrivalStatusId !== order.status;
      const previousDeliveredAt = Boolean(order.tracking?.deliveredAt);
      const deliveredAt = order.tracking?.deliveredAt
        ? (order.tracking.deliveredAt as Timestamp)
        : Timestamp.now();
      const tracking: Tracking = order.tracking
        ? { ...order.tracking, deliveredAt }
        : {
            deliveredAt,
            link: "",
            number: "",
            shippingOption:
              order.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION,
          };
      const nextStatus =
        shouldTransition && arrivalStatusId ? arrivalStatusId : order.status;
      const updatedOrder: StoreOrder = {
        ...order,
        status: nextStatus,
        tracking,
      };

      const updateData: Record<string, unknown> = {
        "internalTransit.state": "ARRIVED",
      };

      if (!previousDeliveredAt) {
        updateData.tracking = tracking;
      }

      if (shouldTransition && arrivalStatusId) {
        updateData.status = arrivalStatusId;
        activities.push({
          type: ActivityStatus.ORDER_STATUS_UPDATE,
          value: arrivalStatusId,
          timestamp: Timestamp.now(),
          metadata: {
            after: arrivalStatusId,
            before: order.status,
            source: INTERNAL_TRANSIT_SOURCE,
          },
        });
      }

      updateData.activities = FieldValue.arrayUnion(...activities);

      await orderRef.update(updateData);
      await maybeSendPickupReadyEmailForArrivedOrder({
        order: updatedOrder,
        orderRef,
        previousDeliveredAt,
        tenantContext,
      });

      result.arrived += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        `Internal transit sweep failed for order ${orderId} in channel ${channelId}:`,
        error,
      );
    }
  }

  return result;
}
