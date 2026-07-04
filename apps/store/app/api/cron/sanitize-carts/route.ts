import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { runForCronTenants } from "@/lib/cron/tenant-runner";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { requireTenantContextTenantId } from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const CART_DELETE_BATCH_SIZE = 500;

function shouldScopeToTenant(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

async function deleteCartBatch(tenantContext: TenantContext) {
  let query: FirebaseFirestore.Query = getAdminDb().collectionGroup("carts");

  if (shouldScopeToTenant(tenantContext)) {
    query = query.where(
      "tenantId",
      "==",
      requireTenantContextTenantId(tenantContext, "sanitize carts cron"),
    );
  }

  const snapshot = await query.limit(CART_DELETE_BATCH_SIZE).get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = getAdminDb().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  return snapshot.size;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantResults = await runForCronTenants(({ tenantContext }) =>
      deleteCartBatch(tenantContext),
    );
    const deletedCount = tenantResults.reduce(
      (count, result) => count + (result.result ?? 0),
      0,
    );
    const failedCount = tenantResults.filter(
      (result) => result.status === "failed",
    ).length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        deletedCount,
        hasMore: tenantResults.some(
          (result) => result.result === CART_DELETE_BATCH_SIZE,
        ),
        tenants: tenantResults,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Failed to sanitize carts:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown sanitize carts error.",
      },
      { status: 500 },
    );
  }
}
