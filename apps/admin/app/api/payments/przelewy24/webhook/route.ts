import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  handlePrzelewy24NotificationWebhook,
  type Przelewy24NotificationRequest,
} from "@konfi/payments";

export async function POST(request: Request): Promise<Response> {
  const firestore = getAdminDb();
  const body = (await request.json()) as Przelewy24NotificationRequest;
  const result = await handlePrzelewy24NotificationWebhook({
    firestore,
    notificationRequest: body,
  });

  return new Response(result.body, { status: result.status });
}
