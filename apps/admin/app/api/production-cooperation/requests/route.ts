import { authorizeProductionCooperationAppApiRequest } from "@/lib/production-cooperation/app-api-auth";
import { receiveProductionCooperationAppApiRequest } from "@/lib/production-cooperation/service";
import { ProductionCooperationError } from "@/lib/production-cooperation/types";

function errorResponse(message: string, status: number) {
  return Response.json({ message, ok: false }, { status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    authorizeProductionCooperationAppApiRequest(request);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return errorResponse("Expected application/json request body.", 415);
    }

    const result = await receiveProductionCooperationAppApiRequest(
      await request.json(),
    );

    return Response.json(
      {
        created: result.created,
        historyEventId: result.historyEventId,
        notificationId: result.notificationId,
        ok: true,
        requestId: result.request.id,
        status: result.request.status,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof ProductionCooperationError) {
      return errorResponse(error.message, error.statusCode);
    }

    console.error("Production cooperation app API receiver error", error);
    return errorResponse(
      "Production cooperation request could not be received.",
      500,
    );
  }
}
