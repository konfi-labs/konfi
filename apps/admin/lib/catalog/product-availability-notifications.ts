import "server-only";

import { publishCreatedAppNotification } from "@/lib/notifications/app-notifications";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { Notification } from "@konfi/types";
import type { ChannelAvailabilityAudit, AvailabilityAuditEntry } from "./product-availability-audit";
import { Timestamp } from "firebase-admin/firestore";

export const AVAILABILITY_THRESHOLD_DAYS = [7, 30, 90] as const;

export function thresholdKeyForDays(days: number): "7" | "30" | "90" | null {
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  if (days <= 90) return "90";
  return null;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function earliestExpirationDate(entries: AvailabilityAuditEntry[]): Date | null {
  let earliest: Date | null = null;
  for (const entry of entries) {
    const d = entry.status.expirationDate;
    if (d && (!earliest || d < earliest)) {
      earliest = d;
    }
  }
  return earliest;
}

export async function createAvailabilityNotifications(params: {
  firestore: FirebaseFirestore.Firestore;
  audits: ChannelAvailabilityAudit[];
  now: Date;
  tenantContext?: TenantContext;
}): Promise<number> {
  const { firestore, audits } = params;
  let created = 0;

  for (const audit of audits) {
    const { channelId, entries } = audit;

    const buckets = new Map<string, AvailabilityAuditEntry[]>();

    for (const entry of entries) {
      if (entry.status.isExpired) {
        const bucket = buckets.get("expired") ?? [];
        bucket.push(entry);
        buckets.set("expired", bucket);
      } else if (entry.status.daysUntilExpiration != null) {
        const key = thresholdKeyForDays(entry.status.daysUntilExpiration);
        if (key === null) continue;
        const bucket = buckets.get(key) ?? [];
        bucket.push(entry);
        buckets.set(key, bucket);
      }
    }

    // 7-day window index; bounds re-notify cadence to at most once per week even
    // after a user archives the previous window's notification.
    const windowIndex = Math.floor(params.now.getTime() / (7 * 86_400_000));

    for (const [bucketKey, bucketEntries] of buckets) {
      if (bucketEntries.length === 0) continue;

      const id = `product-availability::${channelId}::${bucketKey}::${windowIndex}`;
      const existing = await firestore.collection("notifications").doc(id).get();

      if (existing.exists) {
        continue;
      }

      const title =
        bucketKey === "expired"
          ? "Produkty wygasly i sa ukryte"
          : `Produkty wygasaja w ciagu ${bucketKey} dni`;

      const earliest = earliestExpirationDate(bucketEntries);
      const dateStr = earliest ? formatDate(earliest) : "nieznana";
      const body = `Liczba produktow: ${bucketEntries.length}. Najblizsze wygasniecie: ${dateStr}.`;

      const notification: Notification = {
        id,
        title,
        options: { body },
        archived: false,
        channelId,
        url: `/catalog/products?channelId=${channelId}`,
        createdAt: Timestamp.now(),
      };

      await firestore.collection("notifications").doc(id).set(notification);
      await publishCreatedAppNotification(notification);
      created++;
    }
  }

  return created;
}
