import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  skippedSaasCronResponse,
} from "@/lib/cron/tenant-runner";
import { runFakturowniaEstimateInvoicesWorkflow } from "@/lib/fakturownia/estimate-invoices-workflow";
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
        "Fakturownia estimate invoices are dedicated-only until tenant Fakturownia automation runs per tenant.",
      ),
    );
  }

  try {
    const run = await start(runFakturowniaEstimateInvoicesWorkflow);

    return NextResponse.json(
      {
        success: true,
        runId: run.runId,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error(
      "Failed to start Fakturownia estimate invoices workflow:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Fakturownia estimate invoices workflow start error.",
      },
      { status: 500 },
    );
  }
}
