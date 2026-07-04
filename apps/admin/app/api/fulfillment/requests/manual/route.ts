import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import { buildFulfillmentErrorResponse } from "@/lib/fulfillment/route-utils";
import { createManualFulfillmentRequest } from "@/lib/fulfillment/service";
import { parseCreateManualFulfillmentRequestData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedAdminMember();
    const data = parseCreateManualFulfillmentRequestData(await request.json());
    const response = await createManualFulfillmentRequest(data, actor);

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
