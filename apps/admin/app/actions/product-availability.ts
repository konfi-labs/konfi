"use server";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId,
} from "@/actions/auth-utils";
import { auditChannelAvailability } from "@/lib/catalog/product-availability-audit";

export interface ChannelAvailabilitySummary {
  channelId: string;
  expiringSoonCount: number;
  hiddenByExpirationCount: number;
  nearestExpiration: string | null;
}

export async function getChannelAvailabilitySummary(
  channelId: string,
): Promise<ChannelAvailabilitySummary> {
  const { tenantContext } = await getTenantAdminChannelAccessContext();
  const tenantId = getTenantAdminScopeTenantId(tenantContext);
  const db = getAdminDb();

  const audit = await auditChannelAvailability({
    firestore: db,
    channelId,
    tenantId,
  });

  const expiringSoonCount = audit.entries.filter(
    (entry) => entry.status.isExpiringSoon,
  ).length;

  const hiddenByExpirationCount = audit.entries.filter(
    (entry) => entry.status.hiddenByExpiration,
  ).length;

  const expirationDates = audit.entries
    .map((entry) => entry.status.expirationDate)
    .filter((date): date is Date => date !== null);

  const nearestExpiration =
    expirationDates.length > 0
      ? new Date(
          Math.min(...expirationDates.map((d) => d.getTime())),
        ).toISOString()
      : null;

  return {
    channelId,
    expiringSoonCount,
    hiddenByExpirationCount,
    nearestExpiration,
  };
}
