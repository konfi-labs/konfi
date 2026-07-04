import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  runForCronTenants,
} from "@/lib/cron/tenant-runner";
import { runStalledOrdersReminderWorkflow } from "@/lib/cron/order-reminders/workflow";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

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
    const runs = await runForCronTenants(async ({ tenantId }) => {
      const run = tenantId
        ? await start(runStalledOrdersReminderWorkflow, [tenantId])
        : await start(runStalledOrdersReminderWorkflow);

      return { runId: run.runId };
    });
    const failedCount = runs.filter((run) => run.status === "failed").length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        runs,
      },
      { status: failedCount > 0 ? 207 : 202 },
    );
  } catch (error) {
    console.error("Failed to start stalled orders reminder workflow", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown stalled orders reminder start error.",
      },
      { status: 500 },
    );
  }
}
