import {
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
} from "@/actions/auth-utils";
import { getFakturowniaCostSyncProgress } from "@/lib/fakturownia/cost-intelligence";
import { connection, NextResponse } from "next/server";

// Polled by the cost-intelligence page while a manual sync is running. Reads the
// per-tenant progress doc via the Admin SDK so no client-side Firestore rule is
// required.
export async function GET() {
  await connection();

  try {
    const authContext = await requireTenantAdminAuthContext();
    const tenantId = getTenantAdminScopeTenantId(authContext.tenantContext);
    const progress = await getFakturowniaCostSyncProgress({
      ...(tenantId ? { tenantId } : {}),
    });

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("[Fakturownia Cost Sync Progress] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load progress.",
      },
      { status: 500 },
    );
  }
}
