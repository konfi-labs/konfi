import type { Order, StoreOrder } from "@konfi/types";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

export type ShippingLineItem = {
  price_data: {
    currency: string;
    product_data: {
      name: string;
      description?: string;
    };
    unit_amount: number;
  };
  quantity: number;
};

export type CheckoutSessionData =
  | (Order & { shippingLineItem?: ShippingLineItem })
  | (StoreOrder & { shippingLineItem?: ShippingLineItem });

export type StripeLineItem = {
  price_data: {
    currency: string;
    product_data: {
      name: string;
      description?: string;
    };
    unit_amount: number;
  };
  quantity: number;
};

export type CreateCheckoutSessionResult = {
  message: "CHECKOUT_SESSION_CREATED";
  id: string;
  url: string;
  paymentIntent: string | null;
};

export type StripeCheckoutSessionCreator = (
  isTest: boolean,
  lineItems: StripeLineItem[],
  clientReferenceId: string,
  orderPath: string,
  options?: CheckoutRuntimeUrlOptions & {
    credentials?: StripePaymentCredentials;
  },
) => Promise<{
  id: string;
  url: string | null;
  payment_intent: string | Stripe.PaymentIntent | null;
}>;

export type Przelewy24CheckoutSessionCreator = (
  isTest: boolean,
  amount: number,
  email: string,
  orderPath: string,
  options?: CheckoutRuntimeUrlOptions & {
    credentials?: Przelewy24PaymentCredentials;
    notificationUrl?: string;
  },
) => Promise<{
  id: string;
  url: string;
  payment_intent: string;
}>;

export type CheckoutSessionProviderOverrides = {
  adminBaseUrl?: string;
  createStripeCheckoutSession?: StripeCheckoutSessionCreator;
  createPrzelewy24CheckoutSession?: Przelewy24CheckoutSessionCreator;
  przelewy24Credentials?: Przelewy24PaymentCredentials;
  przelewy24NotificationUrl?: string;
  storeBaseUrl?: string;
  stripeCredentials?: StripePaymentCredentials;
};

export type CheckoutRuntimeUrlOptions = {
  adminBaseUrl?: string;
  storeBaseUrl?: string;
};

export type StripePaymentCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

export type Przelewy24PaymentCredentials = {
  apiKey: string;
  crc: string;
  posId: string;
};

export type PaymentWebhookResult = {
  status: number;
  body: string;
};

export type StripeWebhookClient = {
  webhooks: Pick<Stripe.Webhooks, "constructEvent">;
};

export type StripeWebhookHandlerOptions = {
  firestore: Firestore;
  rawBody: string | Uint8Array | Buffer;
  signature: string | null | undefined;
  isTest?: boolean;
  stripeClient?: StripeWebhookClient;
  credentials?: StripePaymentCredentials;
  expectedTenantId?: string;
};

export type Przelewy24NotificationRequest = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: string;
  methodId: number;
  statement: string;
  sign: string;
};

export type Przelewy24WebhookHandlerOptions = {
  firestore: Firestore;
  notificationRequest: Przelewy24NotificationRequest;
  isTest?: boolean;
  fetchImpl?: typeof fetch;
  credentials?: Przelewy24PaymentCredentials;
  expectedTenantId?: string;
};
