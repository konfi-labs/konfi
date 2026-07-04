import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  runForCronTenants,
} from "@/lib/cron/tenant-runner";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  getLastSuccessfulRatingRequestRunAt,
  markRatingRequestRunSuccessful,
  runAutomatedRatingRequests,
} from "@/lib/rating-requests/rating-request-service";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

function getMissingRequiredEnvironmentVariable() {
  const requiredEnvironmentVariables = [
    "CRON_SECRET",
    "NO_REPLY_EMAIL",
    "RESEND_API_KEY",
  ] as const;

  return requiredEnvironmentVariables.find(
    (name) => !process.env[name]?.trim(),
  );
}

async function runRatingRequestsForTenant(params: {
  currentRunAt: Date;
  firestore: FirebaseFirestore.Firestore;
  tenantContext: TenantContext;
}) {
  const previousSuccessfulRunAt = await getLastSuccessfulRatingRequestRunAt({
    firestore: params.firestore,
    tenantContext: params.tenantContext,
  });

  if (!previousSuccessfulRunAt) {
    await markRatingRequestRunSuccessful({
      completedAt: params.currentRunAt,
      firestore: params.firestore,
      tenantContext: params.tenantContext,
    });

    return {
      eligible: 0,
      initialized: true,
      scanned: 0,
      sent: 0,
      skipped: 0,
    };
  }

  const result = await runAutomatedRatingRequests({
    fulfilledAfter: previousSuccessfulRunAt,
    fulfilledBefore: params.currentRunAt,
    firestore: params.firestore,
    tenantContext: params.tenantContext,
  });

  await markRatingRequestRunSuccessful({
    completedAt: params.currentRunAt,
    firestore: params.firestore,
    tenantContext: params.tenantContext,
  });

  return {
    fulfilledAfter: previousSuccessfulRunAt.toISOString(),
    fulfilledBefore: params.currentRunAt.toISOString(),
    initialized: false,
    ...result,
  };
}

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

  const missingEnvironmentVariable = isSharedSaasCronRuntime()
    ? undefined
    : getMissingRequiredEnvironmentVariable();
  if (missingEnvironmentVariable) {
    return NextResponse.json(
      { error: `${missingEnvironmentVariable} is not configured.` },
      { status: 500 },
    );
  }

  try {
    const firestore = getAdminDb();
    const currentRunAt = new Date();
    const tenantResults = await runForCronTenants(({ tenantContext }) =>
      runRatingRequestsForTenant({
        currentRunAt,
        firestore,
        tenantContext,
      }),
    );
    const failedCount = tenantResults.filter(
      (result) => result.status === "failed",
    ).length;
    const totals = tenantResults.reduce(
      (accumulator, tenantResult) => {
        const result = tenantResult.result;

        if (!result) {
          return accumulator;
        }

        return {
          eligible: accumulator.eligible + result.eligible,
          scanned: accumulator.scanned + result.scanned,
          sent: accumulator.sent + result.sent,
          skipped: accumulator.skipped + result.skipped,
        };
      },
      { eligible: 0, scanned: 0, sent: 0, skipped: 0 },
    );

    return NextResponse.json(
      {
        success: failedCount === 0,
        ...totals,
        tenants: tenantResults,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Error running automated rating requests:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown rating request cron error.",
      },
      { status: 500 },
    );
  }
}
