import { timingSafeEqual } from "node:crypto";
import { AdminAuthError } from "@/actions/auth-utils";
import { FulfillmentApiError } from "./types";

export function hasInternalFulfillmentSecret(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || !authHeader) {
    return false;
  }

  const expectedBuffer = Buffer.from(`Bearer ${secret}`);
  const actualBuffer = Buffer.from(authHeader);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function buildFulfillmentErrorResponse(error: unknown): Response {
  if (error instanceof AdminAuthError) {
    return Response.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  if (error instanceof FulfillmentApiError) {
    return Response.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  console.error("Fulfillment route error", error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}
