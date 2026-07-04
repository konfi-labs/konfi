import {
  Order,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
} from "@konfi/types";

import {
  createPaymentLedgerEntry,
  getOrderPathParts,
  getProviderPaymentLedgerEntryId,
  writeOrderPaymentLedgerEntry,
} from "../payment-ledger";
import {
  getPrzelewy24PosId,
  getPrzelewy24WebhookApiKey,
  getPrzelewy24WebhookCrc,
} from "../env";
import { calculateSHA384 } from "../providers/przelewy24-provider";
import type {
  PaymentWebhookResult,
  Przelewy24PaymentCredentials,
  Przelewy24WebhookHandlerOptions,
} from "../types";

function isValidOrderDocumentPath(path: string): boolean {
  return /^channels\/[^/]+\/orders\/[^/]+$/u.test(path);
}

function getCredentials(
  isTest: boolean,
  credentials?: Przelewy24PaymentCredentials,
): Przelewy24PaymentCredentials {
  return {
    apiKey: credentials?.apiKey ?? getPrzelewy24WebhookApiKey(),
    crc: credentials?.crc ?? getPrzelewy24WebhookCrc(),
    posId: credentials?.posId ?? getPrzelewy24PosId(isTest),
  };
}

export async function verifyPrzelewy24Notification({
  firestore,
  notificationRequest,
  credentials,
  expectedTenantId,
  fetchImpl = fetch,
  isTest = false,
}: Przelewy24WebhookHandlerOptions): Promise<boolean> {
  const { apiKey, crc, posId } = getCredentials(isTest, credentials);

  if (notificationRequest.currency !== "PLN") {
    console.error("Przelewy24 notification currency must be PLN.");
    return false;
  }

  const notificationHash = {
    sessionId: notificationRequest.sessionId,
    orderId: notificationRequest.orderId,
    amount: notificationRequest.amount,
    // Przelewy24 checkout sessions are registered in PLN in this integration;
    // keep the signature payload fixed to match the provider contract.
    currency: "PLN",
    crc,
  };

  const headers = new Headers();
  headers.set(
    "Authorization",
    `Basic ${Buffer.from(`${posId}:${apiKey}`).toString("base64")}`,
  );
  headers.set("Content-Type", "application/json");

  const response = (await (
    await fetchImpl("https://secure.przelewy24.pl/api/v1/transaction/verify", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        merchantId: notificationRequest.merchantId,
        posId: notificationRequest.posId,
        sessionId: notificationRequest.sessionId,
        amount: notificationRequest.amount,
        currency: notificationRequest.currency,
        orderId: notificationRequest.orderId,
        sign: calculateSHA384(JSON.stringify(notificationHash)),
      }),
    })
  ).json()) as {
    data?: {
      status?: string;
    };
  };

  if (response.data?.status !== "success") {
    return false;
  }

  if (!isValidOrderDocumentPath(notificationRequest.sessionId)) {
    console.error(
      "Invalid Przelewy24 order path",
      notificationRequest.sessionId,
    );
    return false;
  }

  const orderRef = firestore.doc(notificationRequest.sessionId);
  const snapshot = await orderRef.get();

  if (!snapshot.exists) {
    console.error("No matching documents.");
    return false;
  }

  const order = snapshot.data() as Order | undefined;

  if (!order) {
    console.error("No order.");
    return false;
  }

  if (expectedTenantId && order.tenantId !== expectedTenantId) {
    console.error("Przelewy24 webhook tenant mismatch", {
      expectedTenantId,
      orderPath: notificationRequest.sessionId,
      orderTenantId: order.tenantId,
    });
    return false;
  }

  if (!order.checkoutSession?.paymentIntent) {
    await orderRef.update({
      checkoutSession: {
        ...order.checkoutSession,
        paymentIntent: notificationRequest.statement,
      },
    });
  }

  const { orderId } = getOrderPathParts(notificationRequest.sessionId);
  const entryId = getProviderPaymentLedgerEntryId({
    entryType: PaymentLedgerEntryType.PAYMENT,
    orderId,
    providerEventId: notificationRequest.orderId.toString(),
    providerReference: notificationRequest.statement,
  });

  await writeOrderPaymentLedgerEntry({
    firestore,
    orderPath: notificationRequest.sessionId,
    entry: createPaymentLedgerEntry({
      amount: notificationRequest.amount,
      entryType: PaymentLedgerEntryType.PAYMENT,
      id: entryId,
      order,
      orderId,
      orderPath: notificationRequest.sessionId,
      paymentMethodId: order.paymentType,
      providerEventId: notificationRequest.orderId.toString(),
      providerKind: "przelewy24",
      providerReference: notificationRequest.statement,
      status: PaymentLedgerEntryStatus.SUCCEEDED,
    }),
  });

  await orderRef.update({ paymentStatus: PaymentStatus.COMPLETED });

  return true;
}

export async function handlePrzelewy24NotificationWebhook(
  options: Przelewy24WebhookHandlerOptions,
): Promise<PaymentWebhookResult> {
  try {
    const isVerified = await verifyPrzelewy24Notification(options);

    return {
      status: isVerified ? 200 : 400,
      body: isVerified ? "OK" : "ERROR",
    };
  } catch (error) {
    console.error(error);
    return {
      status: 400,
      body: "ERROR",
    };
  }
}
