import { getAdminDb } from "@/lib/firebase/serverApp";
import { handleStripePaymentIntentWebhook } from "@konfi/payments";

export async function POST(request: Request): Promise<Response> {
  const firestore = getAdminDb();
  const rawBody = Buffer.from(await request.arrayBuffer());
  const result = await handleStripePaymentIntentWebhook({
    firestore,
    rawBody,
    signature: request.headers.get("stripe-signature"),
  });

  return new Response(result.body, { status: result.status });
}
