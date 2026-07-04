import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  skippedSaasCronResponse,
} from "@/lib/cron/tenant-runner";
import { getMissingRequiredFakturowniaReportEnvironmentVariable } from "@/lib/fakturownia/reports/cron-env";
import { runDailyFakturowniaTurnoverReportWorkflow } from "@/lib/fakturownia/reports/workflow";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

export const maxDuration = 60;

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

  if (isSharedSaasCronRuntime()) {
    return NextResponse.json(
      skippedSaasCronResponse(
        "Fakturownia turnover reports are dedicated-only until tenant report recipients and credentials are configured.",
      ),
    );
  }

  const missingEnvironmentVariable =
    getMissingRequiredFakturowniaReportEnvironmentVariable();
  if (missingEnvironmentVariable) {
    return NextResponse.json(
      { error: `${missingEnvironmentVariable} is not configured.` },
      { status: 500 },
    );
  }

  try {
    const run = await start(runDailyFakturowniaTurnoverReportWorkflow);

    return NextResponse.json(
      {
        success: true,
        runId: run.runId,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error(
      "Failed to start Fakturownia turnover report workflow:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Fakturownia turnover report workflow start error.",
      },
      { status: 500 },
    );
  }
}
