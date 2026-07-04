import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { runWeeklyWhatsNewWorkflow } from "@/lib/whats-new/weekly-workflow";
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

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const run = await start(runWeeklyWhatsNewWorkflow, [force]);

    return NextResponse.json(
      {
        success: true,
        force,
        runId: run.runId,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Failed to start weekly What's New workflow:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown weekly What's New workflow start error.",
      },
      { status: 500 },
    );
  }
}
