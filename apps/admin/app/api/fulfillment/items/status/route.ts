import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import { updateFulfillmentItemStatus } from "@/lib/fulfillment/service";
import { buildFulfillmentErrorResponse } from "@/lib/fulfillment/route-utils";
import { parseUpdateItemStatusData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedAdminMember();
    const data = parseUpdateItemStatusData(await request.json());
    const response = await updateFulfillmentItemStatus(data, actor);

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
