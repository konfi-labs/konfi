import { requireAdminAuth } from "@/actions/auth-utils";
import { isSameOriginRequest } from "@konfi/utils";
import { NextRequest, NextResponse } from "next/server";

export async function validateAdminPlacesRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sameOrigin = isSameOriginRequest({
    headers: request.headers,
    requestOrigin: request.nextUrl.origin,
    allowMissingHeaders: process.env.NODE_ENV !== "production",
  });

  if (!sameOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await requireAdminAuth();
  } catch (error) {
    console.error("Unauthorized Google Places admin request:", error);
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}
