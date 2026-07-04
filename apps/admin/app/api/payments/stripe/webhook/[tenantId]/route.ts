import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { getStripePaymentCredentials } from "@/lib/payments/tenant-payment-config";
import { handleStripePaymentIntentWebhook } from "@konfi/payments";

export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const { tenantId } = await context.params;
  const tenantContext = getTenantContext(tenantId);
  const firestore = getAdminDb();
  const rawBody = Buffer.from(await request.arrayBuffer());
  const result = await handleStripePaymentIntentWebhook({
    credentials: await getStripePaymentCredentials(tenantContext),
    expectedTenantId: tenantId,
    firestore,
    rawBody,
    signature: request.headers.get("stripe-signature"),
  });

  return new Response(result.body, { status: result.status });
}
