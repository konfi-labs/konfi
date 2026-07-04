import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { runForCronTenants } from "@/lib/cron/tenant-runner";
import { auditAllChannels } from "@/lib/catalog/product-availability-audit";
import { createAvailabilityNotifications } from "@/lib/catalog/product-availability-notifications";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantResults = await runForCronTenants(
      async ({ tenantContext, tenantId }) => {
        const db = getAdminDb();
        const now = new Date();
        const audits = await auditAllChannels({ firestore: db, now, tenantId });
        const notificationsCreated = await createAvailabilityNotifications({
          firestore: db,
          audits,
          now,
          tenantContext,
        });

        return { channelsScanned: audits.length, notificationsCreated };
      },
    );

    const totals = tenantResults.reduce(
      (accumulator, tenantResult) => {
        const result = tenantResult.result;

        if (!result) {
          return accumulator;
        }

        return {
          channelsScanned: accumulator.channelsScanned + result.channelsScanned,
          notificationsCreated:
            accumulator.notificationsCreated + result.notificationsCreated,
        };
      },
      { channelsScanned: 0, notificationsCreated: 0 },
    );

    return NextResponse.json(
      {
        channelsScanned: totals.channelsScanned,
        notificationsCreated: totals.notificationsCreated,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to run product availability notifications:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown product availability notification error.",
      },
      { status: 500 },
    );
  }
}
