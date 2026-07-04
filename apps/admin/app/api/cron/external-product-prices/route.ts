import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  skippedSaasCronResponse,
} from "@/lib/cron/tenant-runner";
import { runMonthlyExternalProductPriceCheck } from "@/lib/external-products/monthly-price-check";
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

  if (isSharedSaasCronRuntime()) {
    return NextResponse.json(
      skippedSaasCronResponse(
        "External product price checks are dedicated-only until tenant provider integrations run per tenant.",
      ),
    );
  }

  try {
    const summary = await runMonthlyExternalProductPriceCheck();

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Error running monthly external product price check:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown external product price check error.",
      },
      { status: 500 },
    );
  }
}
