import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import { rejectFulfillmentRequest } from "@/lib/fulfillment/service";
import { buildFulfillmentErrorResponse } from "@/lib/fulfillment/route-utils";
import { parseRejectFulfillmentRequestData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedAdminMember();
    const data = parseRejectFulfillmentRequestData(await request.json());
    const response = await rejectFulfillmentRequest(data, actor);

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
