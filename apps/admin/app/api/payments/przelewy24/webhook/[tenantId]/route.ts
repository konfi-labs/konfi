import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { getPrzelewy24PaymentCredentials } from "@/lib/payments/tenant-payment-config";
import {
  handlePrzelewy24NotificationWebhook,
  type Przelewy24NotificationRequest,
} from "@konfi/payments";

export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const { tenantId } = await context.params;
  const tenantContext = getTenantContext(tenantId);
  const firestore = getAdminDb();
  const body = (await request.json()) as Przelewy24NotificationRequest;
  const result = await handlePrzelewy24NotificationWebhook({
    credentials: await getPrzelewy24PaymentCredentials(tenantContext),
    expectedTenantId: tenantId,
    firestore,
    notificationRequest: body,
  });

  return new Response(result.body, { status: result.status });
}
