import { DEFAULT_LOCALE } from "@konfi/types";
import Stripe from "stripe";

import {
  STRIPE_API_VERSION,
  getStoreBaseUrl,
  getStripeSecretKey,
} from "../env";
import type {
  StripeCheckoutSessionCreator,
  StripePaymentCredentials,
} from "../types";

function stripeSecretKey(
  isTest: boolean,
  credentials?: StripePaymentCredentials,
) {
  return credentials?.secretKey ?? getStripeSecretKey(isTest);
}

export const createStripeCheckoutSession: StripeCheckoutSessionCreator = async (
  isTest,
  lineItems,
  clientReferenceId,
  orderPath,
  options,
) => {
  const stripe = new Stripe(stripeSecretKey(isTest, options?.credentials), {
    apiVersion: STRIPE_API_VERSION,
  });

  const successUrl = new URL(
    `/${DEFAULT_LOCALE}/account/orders`,
    `${getStoreBaseUrl(options?.storeBaseUrl)}/`,
  ).toString();

  return await stripe.checkout.sessions.create({
    payment_method_types: ["card", "blik", "klarna"],
    line_items:
      lineItems satisfies Stripe.Checkout.SessionCreateParams.LineItem[],
    mode: "payment",
    success_url: successUrl,
    client_reference_id: clientReferenceId,
    payment_intent_data: {
      metadata: {
        orderPath,
      },
    },
  });
};

export async function refundStripePayment(params: {
  isTest: boolean;
  paymentIntentId: string;
  amount?: number;
  credentials?: StripePaymentCredentials;
  idempotencyKey: string;
  reason?: Stripe.RefundCreateParams.Reason;
  metadata?: Record<string, string>;
}) {
  const stripe = new Stripe(
    stripeSecretKey(params.isTest, params.credentials),
    {
      apiVersion: STRIPE_API_VERSION,
    },
  );

  return await stripe.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      ...(typeof params.amount === "number" ? { amount: params.amount } : {}),
      reason: params.reason,
      metadata: params.metadata,
    },
    {
      idempotencyKey: params.idempotencyKey,
    },
  );
}

export async function getStripePaymentIntentById(params: {
  isTest: boolean;
  paymentIntentId: string;
  credentials?: StripePaymentCredentials;
}) {
  const stripe = new Stripe(
    stripeSecretKey(params.isTest, params.credentials),
    {
      apiVersion: STRIPE_API_VERSION,
    },
  );

  return await stripe.paymentIntents.retrieve(params.paymentIntentId);
}
