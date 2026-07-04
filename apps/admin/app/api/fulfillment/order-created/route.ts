import { requireAdminAuth } from "@/actions/auth-utils";
import { processOrderCreatedFulfillment } from "@/lib/fulfillment/service";
import {
  buildFulfillmentErrorResponse,
  hasInternalFulfillmentSecret,
} from "@/lib/fulfillment/route-utils";
import { parseOrderCreatedFulfillmentData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const hasInternalSecret = hasInternalFulfillmentSecret(request);

    if (!hasInternalSecret) {
      await requireAdminAuth();
    }

    const data = parseOrderCreatedFulfillmentData(await request.json());
    const response = await processOrderCreatedFulfillment(data, {
      skipTenantAuth: hasInternalSecret,
    });

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
