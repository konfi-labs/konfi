import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { validateAdminPlacesRequest } from "@/lib/google/places-route-security";
import { NextRequest, NextResponse } from "next/server";

export async function guardAdminPlacesRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const securityResponse = await validateAdminPlacesRequest(request);

  if (securityResponse) {
    return securityResponse;
  }

  const tenantContext = await getTenantContextForRequest();

  if (tenantContext.requireTenantId && !tenantContext.tenantId) {
    return NextResponse.json(
      { error: "Tenant context could not be resolved." },
      { status: 403 },
    );
  }

  return null;
}
