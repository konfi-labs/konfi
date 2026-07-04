import {
  Order,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  PaymentStatus,
} from "@konfi/types";
import Stripe from "stripe";

import {
  createPaymentLedgerEntry,
  getOrderPathParts,
  getProviderPaymentLedgerEntryId,
  writeOrderPaymentLedgerEntry,
} from "../payment-ledger";
import {
  STRIPE_API_VERSION,
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "../env";
import type {
  PaymentWebhookResult,
  StripePaymentCredentials,
  StripeWebhookClient,
  StripeWebhookHandlerOptions,
} from "../types";

const GENERIC_STRIPE_WEBHOOK_ERROR_BODY = "Webhook Error";

function isValidOrderDocumentPath(path: string): boolean {
  return /^channels\/[^/]+\/orders\/[^/]+$/u.test(path);
}

function createStripeWebhookClient(
  isTest: boolean,
  credentials?: StripePaymentCredentials,
): StripeWebhookClient {
  return new Stripe(credentials?.secretKey ?? getStripeSecretKey(isTest), {
    apiVersion: STRIPE_API_VERSION,
  });
}

function shouldApplyStripePaymentStatusUpdate(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  if (
    (currentStatus === PaymentStatus.COMPLETED ||
      currentStatus === PaymentStatus.REFUNDED ||
      currentStatus === PaymentStatus.PARTIALLY_PAID) &&
    (nextStatus === PaymentStatus.NEW ||
      nextStatus === PaymentStatus.PENDING ||
      nextStatus === PaymentStatus.CANCELED)
  ) {
    return false;
  }

  return true;
}

async function updateStripeOrderPaymentStatus(params: {
  nextStatus: PaymentStatus;
  order: Order;
  orderRef: ReturnType<StripeWebhookHandlerOptions["firestore"]["doc"]>;
}) {
  if (
    shouldApplyStripePaymentStatusUpdate(
      params.order.paymentStatus,
      params.nextStatus,
    )
  ) {
    await params.orderRef.update({ paymentStatus: params.nextStatus });
  }
}

async function writeStripePaymentLedgerEntry(params: {
  amount: number;
  entryType: PaymentLedgerEntryType;
  event: Stripe.Event;
  firestore: StripeWebhookHandlerOptions["firestore"];
  order: Order;
  orderPath: string;
  providerEventId?: string;
  providerReference?: string;
  status: PaymentLedgerEntryStatus;
}) {
  const { orderId } = getOrderPathParts(params.orderPath);
  const providerEventId = params.providerEventId ?? params.event.id;
  const id = getProviderPaymentLedgerEntryId({
    entryType: params.entryType,
    orderId,
    providerEventId,
    providerReference: params.providerReference,
  });

  await writeOrderPaymentLedgerEntry({
    firestore: params.firestore,
    orderPath: params.orderPath,
    entry: createPaymentLedgerEntry({
      amount: params.amount,
      entryType: params.entryType,
      id,
      order: params.order,
      orderId,
      orderPath: params.orderPath,
      paymentMethodId: params.order.paymentType,
      providerEventId,
      providerKind: "stripe",
      providerReference: params.providerReference,
      status: params.status,
    }),
  });
}

async function processStripeEvent(
  firestore: StripeWebhookHandlerOptions["firestore"],
  event: Stripe.Event,
  expectedTenantId?: string,
): Promise<PaymentWebhookResult> {
  const eventDataObject = event.data.object;
  const metadata =
    "metadata" in eventDataObject &&
    typeof eventDataObject.metadata === "object" &&
    eventDataObject.metadata !== null
      ? eventDataObject.metadata
      : {};
  const orderPath =
    typeof metadata.orderPath === "string" ? metadata.orderPath : undefined;

  if (!orderPath) {
    return {
      status: 200,
      body: "OK",
    };
  }

  if (!isValidOrderDocumentPath(orderPath)) {
    console.error("Invalid Stripe order path", orderPath);
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  const paymentIntentId =
    event.type.startsWith("payment_intent.") && "id" in eventDataObject
      ? eventDataObject.id
      : undefined;
  const orderRef = firestore.doc(orderPath);
  const snapshot = await orderRef.get();

  if (!snapshot.exists) {
    console.error("No matching documents.");
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  const order = snapshot.data() as Order | undefined;

  if (!order) {
    console.error("No order.");
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  if (expectedTenantId && order.tenantId !== expectedTenantId) {
    console.error("Stripe webhook tenant mismatch", {
      expectedTenantId,
      orderPath,
      orderTenantId: order.tenantId,
    });
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  if (paymentIntentId && !order.checkoutSession?.paymentIntent) {
    await orderRef.update({
      checkoutSession: {
        ...order.checkoutSession,
        paymentIntent: paymentIntentId,
      },
    });
  }

  switch (event.type) {
    case "payment_intent.canceled": {
      const paymentIntent = eventDataObject as Stripe.PaymentIntent;
      await writeStripePaymentLedgerEntry({
        amount: paymentIntent.amount,
        entryType: PaymentLedgerEntryType.AUTHORIZATION,
        event,
        firestore,
        order,
        orderPath,
        providerReference: paymentIntent.id,
        status: PaymentLedgerEntryStatus.CANCELED,
      });
      await updateStripeOrderPaymentStatus({
        nextStatus: PaymentStatus.CANCELED,
        order,
        orderRef,
      });
      return { status: 200, body: "OK" };
    }
    case "payment_intent.created":
      if (order.status === "NEW") {
        return { status: 200, body: "OK" };
      }
      await writeStripePaymentLedgerEntry({
        amount: (eventDataObject as Stripe.PaymentIntent).amount,
        entryType: PaymentLedgerEntryType.AUTHORIZATION,
        event,
        firestore,
        order,
        orderPath,
        providerReference: paymentIntentId,
        status: PaymentLedgerEntryStatus.PENDING,
      });
      await updateStripeOrderPaymentStatus({
        nextStatus: PaymentStatus.NEW,
        order,
        orderRef,
      });
      return { status: 200, body: "OK" };
    case "payment_intent.processing": {
      const paymentIntent = eventDataObject as Stripe.PaymentIntent;
      await writeStripePaymentLedgerEntry({
        amount: paymentIntent.amount,
        entryType: PaymentLedgerEntryType.AUTHORIZATION,
        event,
        firestore,
        order,
        orderPath,
        providerReference: paymentIntent.id,
        status: PaymentLedgerEntryStatus.PENDING,
      });
      await updateStripeOrderPaymentStatus({
        nextStatus: PaymentStatus.PENDING,
        order,
        orderRef,
      });
      return { status: 200, body: "OK" };
    }
    case "payment_intent.succeeded": {
      const paymentIntent = eventDataObject as Stripe.PaymentIntent;
      await writeStripePaymentLedgerEntry({
        amount:
          paymentIntent.amount_received > 0
            ? paymentIntent.amount_received
            : paymentIntent.amount,
        entryType: PaymentLedgerEntryType.PAYMENT,
        event,
        firestore,
        order,
        orderPath,
        providerReference: paymentIntent.id,
        status: PaymentLedgerEntryStatus.SUCCEEDED,
      });
      await orderRef.update({ paymentStatus: PaymentStatus.COMPLETED });
      return { status: 200, body: "OK" };
    }
    case "charge.refunded": {
      const charge = eventDataObject as Stripe.Charge;
      if (charge.refunded) {
        const latestRefund =
          charge.refunds && charge.refunds.data.length > 0
            ? charge.refunds.data[charge.refunds.data.length - 1]
            : undefined;
        const providerReference =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        await writeStripePaymentLedgerEntry({
          amount: charge.amount_refunded,
          entryType: PaymentLedgerEntryType.REFUND,
          event,
          firestore,
          order,
          orderPath,
          providerEventId: latestRefund?.id,
          providerReference,
          status: PaymentLedgerEntryStatus.SUCCEEDED,
        });
        await orderRef.update({ paymentStatus: PaymentStatus.REFUNDED });
      }
      return { status: 200, body: "OK" };
    }
    default:
      console.log(`Unhandled event type ${event.type}`);
      return { status: 200, body: "OK" };
  }
}

export async function handleStripePaymentIntentWebhook({
  firestore,
  rawBody,
  signature,
  credentials,
  expectedTenantId,
  isTest = false,
  stripeClient,
}: StripeWebhookHandlerOptions): Promise<PaymentWebhookResult> {
  if (!signature) {
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  let event: Stripe.Event;
  const normalizedRawBody =
    typeof rawBody === "string" || Buffer.isBuffer(rawBody)
      ? Buffer.from(rawBody)
      : Buffer.from(rawBody);

  try {
    const stripe =
      stripeClient ?? createStripeWebhookClient(isTest, credentials);
    event = stripe.webhooks.constructEvent(
      normalizedRawBody,
      signature,
      credentials?.webhookSecret ?? getStripeWebhookSecret(),
    );
  } catch (error) {
    console.error(error);
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }

  try {
    return await processStripeEvent(firestore, event, expectedTenantId);
  } catch (error) {
    console.error(error);
    return {
      status: 400,
      body: GENERIC_STRIPE_WEBHOOK_ERROR_BODY,
    };
  }
}
