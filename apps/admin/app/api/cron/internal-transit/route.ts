import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  runForCronTenants,
} from "@/lib/cron/tenant-runner";
import { runInternalTransitSweepForTenant } from "@/lib/internal-transit/sweep";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

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
    const runs = await runForCronTenants(({ tenantContext }) =>
      runInternalTransitSweepForTenant(tenantContext),
    );
    const failedCount = runs.filter((run) => run.status === "failed").length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        runs,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Failed to run internal transit sweep", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown internal transit sweep error.",
      },
      { status: 500 },
    );
  }
}
