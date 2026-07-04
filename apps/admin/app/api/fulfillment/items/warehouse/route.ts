import { getAuthenticatedAdminMember } from "@/actions/auth-utils";
import { assignOrderItemWarehouse } from "@/lib/fulfillment/service";
import { buildFulfillmentErrorResponse } from "@/lib/fulfillment/route-utils";
import { parseAssignOrderItemWarehouseData } from "@/lib/fulfillment/types";

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedAdminMember();
    const data = parseAssignOrderItemWarehouseData(await request.json());
    const response = await assignOrderItemWarehouse(data, actor);

    return Response.json(response);
  } catch (error) {
    return buildFulfillmentErrorResponse(error);
  }
}
