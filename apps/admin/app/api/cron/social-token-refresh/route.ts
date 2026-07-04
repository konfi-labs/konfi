import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import { runForCronTenants } from "@/lib/cron/tenant-runner";
import { refreshMetaTokenForTenant } from "@/lib/cron/social-token-refresh";
import { NextRequest, NextResponse } from "next/server";

// Token refresh calls the Graph API per tenant; allow generous runtime.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not configured; rejecting cron request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSocialFeatureEnabled()) {
    return NextResponse.json({ skipped: true, reason: "social feature disabled" }, { status: 200 });
  }

  try {
    const tenantResults = await runForCronTenants(({ tenantContext }) =>
      refreshMetaTokenForTenant(tenantContext),
    );

    const failedCount = tenantResults.filter(
      (r) => r.status === "failed",
    ).length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        tenants: tenantResults,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Error running social-token-refresh cron:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown social-token-refresh cron error.",
      },
      { status: 500 },
    );
  }
}
