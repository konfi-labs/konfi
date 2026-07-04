import { PaymentType, UnitReadable, type CurrencyCode } from "@konfi/types";

import { createPrzelewy24CheckoutSession } from "./providers/przelewy24-provider";
import { createStripeCheckoutSession } from "./providers/stripe-provider";
import type {
  CheckoutSessionData,
  CheckoutSessionProviderOverrides,
  CreateCheckoutSessionResult,
  ShippingLineItem,
  StripeLineItem,
} from "./types";

type OrderWithOptionalEmail = CheckoutSessionData & {
  email?: string;
};

type OrderWithOptionalContact = CheckoutSessionData & {
  contact?: {
    email?: string;
  };
};

function validateItems(items: CheckoutSessionData["items"]) {
  if (items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  items.forEach((item) => {
    if (!item) {
      throw new Error("Order contains an invalid item");
    }

    if (!item.quantity || item.quantity < 1) {
      throw new Error("Order item quantity must be greater than 0");
    }

    if (!item.product) {
      throw new Error("Order item is missing product data");
    }
  });
}

function normalizeLineItem(
  lineItem: ShippingLineItem | StripeLineItem,
): StripeLineItem {
  return {
    ...lineItem,
    price_data: {
      ...lineItem.price_data,
      unit_amount: Math.floor(lineItem.price_data.unit_amount),
    },
    quantity: 1,
  } satisfies StripeLineItem;
}

function getCheckoutCurrency(data: CheckoutSessionData): CurrencyCode {
  return data.currency ?? "PLN";
}

function getStripeCurrencyCode(data: CheckoutSessionData): string {
  return getCheckoutCurrency(data).toLowerCase();
}

function getLineItemsTotal(lineItems: StripeLineItem[]) {
  return lineItems.reduce(
    (sum, lineItem) =>
      sum + lineItem.price_data.unit_amount * lineItem.quantity,
    0,
  );
}

function getShippingLineItem(data: CheckoutSessionData) {
  if (data.shippingLineItem) {
    return normalizeLineItem(data.shippingLineItem);
  }

  if (!data.shippingPrice || data.shippingPrice <= 0) {
    return undefined;
  }

  return normalizeLineItem({
    price_data: {
      currency: getStripeCurrencyCode(data),
      product_data: {
        name: "Dostawa",
      },
      unit_amount: Math.floor(data.shippingPrice),
    },
    quantity: 1,
  });
}

function reconcileLineItemsToOrderTotal(
  lineItems: StripeLineItem[],
  orderTotal: number,
) {
  const targetTotal = Math.floor(orderTotal);
  const lineItemsTotal = getLineItemsTotal(lineItems);

  if (targetTotal <= 0 || lineItemsTotal === targetTotal) {
    return lineItems;
  }

  if (lineItemsTotal <= 0) {
    return lineItems;
  }

  let allocatedTotal = 0;

  return lineItems.map((lineItem, index) => {
    const lineTotal = lineItem.price_data.unit_amount * lineItem.quantity;
    const isLastLineItem = index === lineItems.length - 1;
    const unitAmount = isLastLineItem
      ? Math.max(0, targetTotal - allocatedTotal)
      : Math.max(0, Math.floor((lineTotal / lineItemsTotal) * targetTotal));
    allocatedTotal += unitAmount;

    return {
      ...lineItem,
      price_data: {
        ...lineItem.price_data,
        unit_amount: unitAmount,
      },
      quantity: 1,
    } satisfies StripeLineItem;
  });
}

function getCheckoutEmail(data: CheckoutSessionData): string {
  const contactEmail = (data as OrderWithOptionalContact).contact?.email;
  if (typeof contactEmail === "string" && contactEmail.length > 0) {
    return contactEmail;
  }

  const email = (data as OrderWithOptionalEmail).email;
  if (typeof email === "string" && email.length > 0) {
    return email;
  }

  throw new Error("Order contact email is not defined");
}

export function buildStripeLineItems(data: CheckoutSessionData) {
  validateItems(data.items);

  const itemLineItems = data.items.map((item) => {
    if (!item.product?.name || !item.description) {
      throw new Error(
        "Order item must include a product name and description to create checkout session",
      );
    }

    return normalizeLineItem({
      price_data: {
        currency: getStripeCurrencyCode(data),
        product_data: {
          name: item.product.name,
          description: `${item.volume ? item.volume : item.quantity} ${UnitReadable[item.unit as keyof typeof UnitReadable] ?? item.unit}, ${item.description}`,
        },
        unit_amount: Math.floor(item.totalPrice),
      },
      quantity: 1,
    });
  });

  const shippingLineItem = getShippingLineItem(data);
  const lineItems = shippingLineItem
    ? [...itemLineItems, shippingLineItem]
    : itemLineItems;

  return reconcileLineItemsToOrderTotal(lineItems, data.totalPrice);
}

export async function createCheckoutSession(
  data: CheckoutSessionData,
  overrides: CheckoutSessionProviderOverrides = {},
): Promise<CreateCheckoutSessionResult> {
  if (data.paymentType === undefined) {
    throw new Error("paymentType is not defined");
  }

  if (!data.path) {
    throw new Error("data.path is not defined");
  }

  if (!data.id) {
    throw new Error("data.id is not defined");
  }

  const lineItems = buildStripeLineItems(data);
  const stripeCheckout =
    overrides.createStripeCheckoutSession ?? createStripeCheckoutSession;
  const przelewy24Checkout =
    overrides.createPrzelewy24CheckoutSession ??
    createPrzelewy24CheckoutSession;

  switch (data.paymentType) {
    case PaymentType.STRIPE: {
      const session = await stripeCheckout(
        data.isTest,
        lineItems,
        data.id,
        data.path,
        {
          adminBaseUrl: overrides.adminBaseUrl,
          credentials: overrides.stripeCredentials,
          storeBaseUrl: overrides.storeBaseUrl,
        },
      );

      return {
        message: "CHECKOUT_SESSION_CREATED",
        id: session.id,
        url: session.url ?? "",
        paymentIntent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
      };
    }
    case PaymentType.PRZELEWY24: {
      if (getCheckoutCurrency(data) !== "PLN") {
        // Przelewy24 sessions in this integration are registered in PLN, and
        // its webhook signature also verifies the provider-reported currency.
        throw new Error("Przelewy24 checkout requires PLN order currency");
      }

      const session = await przelewy24Checkout(
        data.isTest,
        data.totalPrice,
        getCheckoutEmail(data),
        data.path,
        {
          adminBaseUrl: overrides.adminBaseUrl,
          credentials: overrides.przelewy24Credentials,
          notificationUrl: overrides.przelewy24NotificationUrl,
          storeBaseUrl: overrides.storeBaseUrl,
        },
      );

      return {
        message: "CHECKOUT_SESSION_CREATED",
        id: session.id,
        url: session.url,
        paymentIntent: session.payment_intent,
      };
    }
    default:
      throw new Error("paymentType is not valid");
  }
}
