import { sendEmail } from "@/lib/email";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { resolveServerTenantContext } from "@konfi/firebase";
import { ProformaPaid } from "@konfi/emails";
import { type Invoice } from "@konfi/fakturownia/client/models";
import { getAdminBaseUrl } from "@konfi/payments";
import { type Channel } from "@konfi/types";
import { getChannelNotificationEmails } from "@konfi/utils";
import { timingSafeEqual } from "crypto";

import { type NextRequest } from "next/server";
import {
  getInvoiceMatchFields,
  mapInvoiceStatusToPaymentStatus,
  shouldApplyWebhookPaymentStatus,
} from "./status-utils";

const dedicatedWebhookModeEnv =
  "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE";

type InvoiceLikePayload = Partial<
  Pick<Invoice, "kind" | "number" | "status">
> & {
  invoice_no?: string | null;
};

type FakturowniaWebhookPayload = {
  api_token?: string;
  invoice?: InvoiceLikePayload | null;
  deal?: InvoiceLikePayload | null;
  data?: Record<string, unknown> | null;
  webhook?: Record<string, unknown> | null;
};

// Example webhook payload (invoice:update):
// {
//   "id": 123456789,
//     "deal": {
//     "name": "Product name",
//       "description": "",
//         "price": "100.00",
//           "paid": true,
//             "url": "https://example.fakturownia.net/f/P1-01-2025/key",
//               "date": "2025-11-18",
//                 "invoice_no": "P1/01/2025",
//                   "kind": "proforma",
//                     "status": "paid",
//                       "currency": "PLN",
//                         "external_ids": {
//       "fakturownia": 123456789;
//     },
//     "client": {
//       "name": "Imię Nazwisko",
//         "tax_no": "",
//           "first_name": "Imię ",
//             "last_name": "Nazwisko",
//               "bank_account": null,
//                 "bank_account_id": null,
//                   "register_number": null,
//                     "skip_webhooks": true,
//                       "external_ids": {
//         "fakturownia": 123456789;
//       }
//     },
//     "skip_webhooks": true;
//   },
//   "app_name": "fakturownia",
//     "api_token": "token_string",
//       "locale": "pl";
// }

/**
 * POST /api/fakturownia/webhook
 * Webhook endpoint for Fakturownia invoice updates
 *
 * When an invoice is updated in Fakturownia, this endpoint:
 * 1. Receives the webhook payload containing invoice data
 * 2. Extracts the invoice number
 * 3. Finds orders in configured dedicated-mode channels only
 * 4. Updates matching orders' paymentStatus based on invoice status
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInvoiceLikePayload(value: unknown): value is InvoiceLikePayload {
  if (!isRecord(value)) {
    return false;
  }

  const invoiceKeys: Array<"kind" | "number" | "status" | "invoice_no"> = [
    "kind",
    "number",
    "status",
    "invoice_no",
  ];

  return invoiceKeys.some((key) => {
    const field = value[key];
    return typeof field === "string" && field.trim().length > 0;
  });
}

function extractInvoiceCandidate(
  payload: FakturowniaWebhookPayload,
): { invoice: InvoiceLikePayload; source: string } | null {
  type InvoiceCandidate = { source: string; value: unknown };

  const directCandidates: InvoiceCandidate[] = [
    { source: "invoice", value: payload.invoice },
    { source: "deal", value: payload.deal },
  ];

  const nestedSources: Array<{
    prefix: string;
    value: Record<string, unknown> | null | undefined;
  }> = [
    { prefix: "data", value: payload.data },
    { prefix: "webhook", value: payload.webhook },
  ];

  const nestedCandidates = nestedSources.flatMap<InvoiceCandidate>(
    ({ prefix, value }) => {
      if (!isRecord(value)) {
        return [];
      }

      return [
        { source: `${prefix}.invoice`, value: value["invoice"] },
        { source: `${prefix}.deal`, value: value["deal"] },
      ];
    },
  );

  const candidates = [...directCandidates, ...nestedCandidates];

  for (const candidate of candidates) {
    if (isInvoiceLikePayload(candidate.value)) {
      return { invoice: candidate.value, source: candidate.source };
    }
  }

  return null;
}

function getInvoiceNumber(invoice: InvoiceLikePayload): string | null {
  const candidate = invoice.number ?? invoice.invoice_no;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return null;
}

function getCreatedAtSortValue(value: unknown): number {
  if (
    isRecord(value) &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return 0;
}

function getDedicatedWebhookChannelIds(): string[] {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- dedicated Fakturownia webhook order binding is configured per deployment.
  const rawValue = process.env.FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_CHANNEL_IDS;
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function isDedicatedWebhookExplicitlyEnabled(): boolean {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- the legacy global webhook path must be opt-in for dedicated deployments only.
  const rawValue = process.env[dedicatedWebhookModeEnv];
  return rawValue === "true";
}

function getChannelIdFromOrderPath(path: string): string | undefined {
  const match = /^channels\/([^/]+)\/orders\/[^/]+$/.exec(path);
  return match?.[1];
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const firestore = getAdminDb();

    // Parse the webhook payload
    const body = (await request.json()) as FakturowniaWebhookPayload;

    // Verify API token
    const expectedToken = process.env.FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN;
    if (!expectedToken) {
      console.error("FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN not configured");
      return Response.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const providedToken = body.api_token;
    if (
      !providedToken ||
      providedToken.length !== expectedToken.length ||
      !timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken))
    ) {
      console.error("Invalid or missing API token", {
        hasToken: !!providedToken,
      });
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = resolveServerTenantContext();
    if (isSharedSaasTenantRuntime(tenantContext)) {
      console.error(
        "Fakturownia global invoice webhook is not available in SaaS mode",
      );
      return Response.json(
        { error: "Webhook is not configured for this deployment" },
        { status: 403 },
      );
    }

    if (!isDedicatedWebhookExplicitlyEnabled()) {
      console.error(
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE must be true",
      );
      return Response.json(
        { error: "Webhook dedicated mode is not enabled" },
        { status: 500 },
      );
    }

    const configuredChannelIds = getDedicatedWebhookChannelIds();
    const allowedChannelIds = new Set(configuredChannelIds);

    if (configuredChannelIds.length === 0) {
      console.error(
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_CHANNEL_IDS is not configured",
      );
      return Response.json(
        { error: "Webhook channel binding is not configured" },
        { status: 500 },
      );
    }

    // Extract invoice data from the payload
    const invoiceCandidate = extractInvoiceCandidate(body);

    if (!invoiceCandidate) {
      console.error("Webhook payload missing invoice data");
      return Response.json({ error: "Missing invoice data" }, { status: 400 });
    }

    const invoiceNumber = getInvoiceNumber(invoiceCandidate.invoice);
    const invoiceStatus = invoiceCandidate.invoice.status ?? null;
    const invoiceKind = invoiceCandidate.invoice.kind ?? null;

    if (!invoiceNumber) {
      console.error("Invoice missing number field");
      return Response.json(
        { error: "Invoice missing number" },
        { status: 400 },
      );
    }

    const matchingFields = getInvoiceMatchFields(invoiceKind);

    console.log("Processing invoice:", {
      number: invoiceNumber,
      status: invoiceStatus,
      kind: invoiceKind,
      source: invoiceCandidate.source,
      matchingFields,
    });

    // Query only explicitly configured channels; never fan out across all tenants/channels.
    const queryPromises = configuredChannelIds.flatMap((channelId) => {
      const ordersRef = firestore
        .collection("channels")
        .doc(channelId)
        .collection("orders");
      return matchingFields.map((field) =>
        ordersRef.where(field, "==", invoiceNumber).get(),
      );
    });

    const snapshots = await Promise.all(queryPromises);
    const orderDocsByPath = new Map<
      string,
      FirebaseFirestore.QueryDocumentSnapshot
    >();

    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        const channelId = getChannelIdFromOrderPath(doc.ref.path);
        const orderChannelId = doc.data().channelId;
        if (
          !channelId ||
          !allowedChannelIds.has(channelId) ||
          orderChannelId !== channelId
        ) {
          console.error("Skipping Fakturownia webhook order outside binding", {
            orderPath: doc.ref.path,
          });
          continue;
        }

        orderDocsByPath.set(doc.ref.path, doc);
      }
    }

    const matchingOrderDocs = Array.from(orderDocsByPath.values()).toSorted(
      (leftDoc, rightDoc) =>
        getCreatedAtSortValue(leftDoc.data().createdAt) -
        getCreatedAtSortValue(rightDoc.data().createdAt),
    );

    if (matchingOrderDocs.length === 0) {
      console.log("No orders found with matching document:", {
        invoiceNumber,
        matchingFields,
      });
      // Return 200 OK even if no orders found - webhook should not retry
      return Response.json({
        success: true,
        message: "No matching orders found",
      });
    }

    console.log("Found orders:", {
      count: matchingOrderDocs.length,
      invoiceNumber,
      invoiceStatus,
      matchingFields,
    });

    // Map invoice status to payment status
    const newPaymentStatus = mapInvoiceStatusToPaymentStatus(invoiceStatus);

    if (!newPaymentStatus) {
      console.log(
        "Invoice status does not map to a payment status:",
        invoiceStatus,
      );
      return Response.json({
        success: true,
        message: "Invoice status not actionable",
      });
    }

    // Update all matching orders
    const updatePromises: Promise<FirebaseFirestore.WriteResult>[] = [];
    const updatedOrders: Array<{
      orderId: string;
      previousStatus: string;
      newStatus: string;
    }> = [];
    let skippedCount = 0;

    if (
      invoiceKind === "proforma" &&
      invoiceStatus === "paid" &&
      matchingOrderDocs.length > 0
    ) {
      try {
        const firstOrder = matchingOrderDocs[0];
        const firstOrderData = firstOrder.data();
        const channelId = firstOrderData.channelId as string;

        const channelDoc = await firestore
          .collection("channels")
          .doc(channelId)
          .get();

        if (channelDoc.exists) {
          const channel = channelDoc.data() as Channel;
          const recipients = getChannelNotificationEmails(
            channel,
            process.env.NOTIFICATIONS_EMAIL,
          );

          const noReplyEmail = process.env.NO_REPLY_EMAIL;
          if (!noReplyEmail) {
            console.error("NO_REPLY_EMAIL is not defined");
          } else if (recipients.length > 0) {
            const orderNumber = String(firstOrderData.number);
            const url = new URL(
              `/orders/${firstOrder.id}?channelId=${channelId}`,
              `${getAdminBaseUrl()}/`,
            ).toString();

            const emailPromises = recipients.map((email) =>
              sendEmail({
                to: email,
                from: noReplyEmail,
                subject: `Opłacono proformę do zamówienia ${orderNumber}`,
                template: ProformaPaid({ brand: "admin", orderNumber, url }),
              }),
            );

            await Promise.all(emailPromises);
            console.log(
              `Sent proforma paid notification for order ${firstOrder.id} to ${recipients.length} recipients`,
            );
          } else {
            console.log(
              `No recipients for proforma paid notification for order ${firstOrder.id}`,
            );
          }
        }
      } catch (err) {
        console.error("Failed to send proforma paid notification:", err);
      }
    }

    for (const orderDoc of matchingOrderDocs) {
      const orderId = orderDoc.id;
      const currentOrder = orderDoc.data();

      if (
        !shouldApplyWebhookPaymentStatus(
          currentOrder.paymentStatus,
          newPaymentStatus,
        )
      ) {
        skippedCount++;
        console.log("Skipped payment status update for order:", {
          orderId,
          currentStatus: currentOrder.paymentStatus,
          newStatus: newPaymentStatus,
        });
        continue;
      }

      updatedOrders.push({
        orderId,
        previousStatus: currentOrder.paymentStatus,
        newStatus: newPaymentStatus,
      });

      // Update the order payment status
      updatePromises.push(
        orderDoc.ref.update({
          paymentStatus: newPaymentStatus,
          updatedAt: new Date(),
        }),
      );
    }

    // Execute all updates in parallel
    await Promise.all(updatePromises);

    console.log("Orders payment status updated:", {
      totalOrders: matchingOrderDocs.length,
      updatedCount: updatedOrders.length,
      skippedCount,
      updates: updatedOrders,
    });

    return Response.json({
      success: true,
      message: `Payment status updated for ${updatedOrders.length} order(s)`,
      totalOrders: matchingOrderDocs.length,
      updatedCount: updatedOrders.length,
      skippedCount,
      updatedOrders,
    });
  } catch (error) {
    console.error("Fakturownia webhook error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
