import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  skippedSaasCronResponse,
} from "@/lib/cron/tenant-runner";
import { cleanupExpiredFulfillmentRequests } from "@/lib/fulfillment/service";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSharedSaasCronRuntime()) {
    return Response.json(
      skippedSaasCronResponse(
        "Fulfillment request cleanup is dedicated-only until cooperation cleanup runs per tenant.",
      ),
    );
  }

  try {
    const response = await cleanupExpiredFulfillmentRequests();
    return Response.json(response, {
      status: response.errors.length > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("Fulfillment cleanup cron failed", error);
    return Response.json(
      { error: "Unknown fulfillment cleanup error." },
      { status: 500 },
    );
  }
}
