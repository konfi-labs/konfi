import "server-only";

import {
  buildStripeLineItems as buildSharedStripeLineItems,
  createCheckoutSession as createSharedCheckoutSession,
  type CheckoutSessionData,
  type CheckoutSessionProviderOverrides,
} from "@konfi/payments";

export const buildStripeLineItems = buildSharedStripeLineItems;

export async function createCheckoutSession(
  data: CheckoutSessionData,
  overrides?: CheckoutSessionProviderOverrides,
) {
  return await createSharedCheckoutSession(data, overrides);
}