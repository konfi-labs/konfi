import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { validateStorePlacesRequest } from "@/lib/google/places-route-security";
import { NextRequest, NextResponse } from "next/server";

export async function guardStorePlacesRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const securityResponse = await validateStorePlacesRequest(request);

  if (securityResponse) {
    return securityResponse;
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    return NextResponse.json(
      { error: "Store runtime config could not be resolved." },
      { status: 404 },
    );
  }

  return null;
}
