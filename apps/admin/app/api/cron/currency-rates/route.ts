import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { runForCronTenants } from "@/lib/cron/tenant-runner";
import { refreshFrankfurterCurrencyRates } from "@/lib/currency-rates/frankfurter-refresh";
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
    const tenantResults = await runForCronTenants(({ tenantContext }) =>
      refreshFrankfurterCurrencyRates(tenantContext),
    );
    const summary = tenantResults.reduce(
      (accumulator, tenantResult) => {
        const result = tenantResult.result;

        if (!result) {
          return {
            ...accumulator,
            failedCount: accumulator.failedCount + 1,
          };
        }

        return {
          failedCount: accumulator.failedCount + result.failedCount,
          refreshedCount: accumulator.refreshedCount + result.refreshedCount,
          scannedCount: accumulator.scannedCount + result.scannedCount,
          skippedCount: accumulator.skippedCount + result.skippedCount,
        };
      },
      {
        failedCount: 0,
        refreshedCount: 0,
        scannedCount: 0,
        skippedCount: 0,
      },
    );

    return NextResponse.json(
      {
        success: summary.failedCount === 0,
        ...summary,
        tenants: tenantResults,
      },
      { status: summary.failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Error refreshing Frankfurter currency rates:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown currency rate refresh error.",
      },
      { status: 500 },
    );
  }
}
