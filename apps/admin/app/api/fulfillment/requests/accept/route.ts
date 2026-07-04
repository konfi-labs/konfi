import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import { acceptFulfillmentRequest } from "@/lib/fulfillment/service";
import { buildFulfillmentErrorResponse } from "@/lib/fulfillment/route-utils";
import { parseAcceptFulfillmentRequestData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedAdminMember();
    const data = parseAcceptFulfillmentRequestData(await request.json());
    const response = await acceptFulfillmentRequest(data, actor);

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
