"use server";

import { requireTenantAdminAuthContext } from "./auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  CART_REMINDER_COOLDOWN_HOURS,
  CART_REMINDER_STALE_HOURS,
  getCartReminderCopy,
  getCustomerReminderEmail,
  getCartReminderItemImageUrl,
  getCartReminderItemQuantity,
  isAuthenticatedCustomerCartOwner,
} from "@/lib/customer-carts/cart-reminder-helpers";
import {
  listCartIds,
  markCartReminderSent,
  resolveCustomerByCartId,
  sendCartReminderEmail,
} from "@/lib/customer-carts/cart-reminder-service";
import type { Customer, OrderItem } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

export interface CustomerCartItemSummary {
  id: string;
  description: string;
  imageUrl?: string;
  productName?: string;
  quantity: number;
  totalPrice: number;
  updatedAt: string;
}

export interface CustomerCartSummary {
  cartId: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPersonName?: string;
  itemCount: number;
  totalQuantity: number;
  totalPrice: number;
  lastUpdatedAt?: string;
  items: CustomerCartItemSummary[];
}

export interface SendCustomerCartReminderResult {
  sent: boolean;
  error?: string;
}

function getCustomerDisplayName(
  customer: Customer | undefined,
  unknownCustomerLabel: string,
): string {
  const preferredName =
    customer?.personName?.trim() ||
    customer?.name?.trim() ||
    getCustomerReminderEmail(customer);

  return preferredName || unknownCustomerLabel;
}

function getCartReminderGuardError(params: {
  cart: CustomerCartSummary;
  cartId: string;
  customer?: Customer;
  lastReminderSentAt?: Date;
  now: Date;
}): string | undefined {
  const { cart, cartId, customer, lastReminderSentAt, now } = params;

  if (!customer || !isAuthenticatedCustomerCartOwner(cartId, customer)) {
    return "Cart reminder is only available for authenticated customers.";
  }

  if (!cart.customerEmail) {
    return "Customer email is missing.";
  }

  if (!cart.lastUpdatedAt || cart.itemCount <= 0) {
    return "Cart has no items to remind about.";
  }

  const lastUpdatedAt = new Date(cart.lastUpdatedAt);
  if (Number.isNaN(lastUpdatedAt.getTime())) {
    return "Cart activity timestamp is invalid.";
  }

  const staleThresholdMs = CART_REMINDER_STALE_HOURS * 60 * 60 * 1000;
  if (now.getTime() - lastUpdatedAt.getTime() < staleThresholdMs) {
    return "Cart was updated too recently to send a reminder.";
  }

  if (
    lastReminderSentAt &&
    lastReminderSentAt.getTime() >= lastUpdatedAt.getTime()
  ) {
    return "A reminder was already sent for the current cart state.";
  }

  const cooldownMs = CART_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (
    lastReminderSentAt &&
    now.getTime() - lastReminderSentAt.getTime() < cooldownMs
  ) {
    return "A reminder was sent recently. Please wait before sending another one.";
  }
}

async function getCustomerCartSummary(
  cartId: string,
  tenantContext: TenantContext,
  locale: string = "en",
): Promise<CustomerCartSummary | undefined> {
  const firestore = getAdminDb();
  const copy = getCartReminderCopy(locale);
  const [customer, cartDocSnapshot, cartItemsSnapshot] = await Promise.all([
    resolveCustomerByCartId(cartId, tenantContext),
    firestore.collection("carts").doc(cartId).get(),
    firestore.collection(`carts/${cartId}/items`).get(),
  ]);
  const tenantId =
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
      ? tenantContext.tenantId
      : undefined;

  if (
    tenantId &&
    cartDocSnapshot.exists &&
    cartDocSnapshot.get("tenantId") !== tenantId
  ) {
    return undefined;
  }

  if (cartItemsSnapshot.empty) {
    return undefined;
  }

  const items = cartItemsSnapshot.docs
    .filter((doc) => !tenantId || doc.get("tenantId") === tenantId)
    .map((doc) => {
      const data = doc.data() as Partial<OrderItem>;

      return {
        id: doc.id,
        description:
          data.description?.trim() ||
          data.product?.name?.trim() ||
          copy.unnamedItemLabel,
        imageUrl: getCartReminderItemImageUrl(data),
        productName: data.product?.name?.trim() || undefined,
        quantity: getCartReminderItemQuantity(data),
        totalPrice: typeof data.totalPrice === "number" ? data.totalPrice : 0,
        updatedAt: doc.updateTime.toDate().toISOString(),
      } satisfies CustomerCartItemSummary;
    })
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  if (items.length === 0) {
    return undefined;
  }

  const lastUpdatedAt = items[0]?.updatedAt;
  const unknownCustomerLabel =
    locale === "pl" ? "Nieznany klient" : "Unknown customer";

  return {
    cartId,
    customerId: customer?.id,
    customerName: getCustomerDisplayName(customer, unknownCustomerLabel),
    customerEmail: getCustomerReminderEmail(customer),
    customerPersonName: customer?.personName?.trim() || undefined,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: items.reduce((sum, item) => sum + item.totalPrice, 0),
    lastUpdatedAt,
    items,
  };
}

export async function getCustomerCarts(
  locale: string = "en",
): Promise<CustomerCartSummary[]> {
  const { tenantContext } = await requireTenantAdminAuthContext();

  const cartIds = await listCartIds(tenantContext);
  const carts = await Promise.all(
    cartIds.map((cartId) =>
      getCustomerCartSummary(cartId, tenantContext, locale),
    ),
  );

  return carts
    .filter((cart): cart is CustomerCartSummary => Boolean(cart))
    .toSorted((left, right) => {
      const leftDate = left.lastUpdatedAt || "";
      const rightDate = right.lastUpdatedAt || "";
      return rightDate.localeCompare(leftDate);
    });
}

export async function sendCustomerCartReminder(
  cartId: string,
  locale: string,
): Promise<SendCustomerCartReminderResult> {
  const { tenantContext } = await requireTenantAdminAuthContext();

  try {
    const firestore = getAdminDb();
    const [cart, customer, cartDoc] = await Promise.all([
      getCustomerCartSummary(cartId, tenantContext, locale),
      resolveCustomerByCartId(cartId, tenantContext),
      firestore.collection("carts").doc(cartId).get(),
    ]);

    if (!cart) {
      return {
        sent: false,
        error: "Cart not found.",
      };
    }

    const guardError = getCartReminderGuardError({
      cart,
      cartId,
      customer,
      lastReminderSentAt: cartDoc.get("lastReminderSentAt")?.toDate(),
      now: new Date(),
    });

    if (guardError) {
      return {
        sent: false,
        error: guardError,
      };
    }

    const recipientEmail = cart.customerEmail;
    if (!recipientEmail) {
      return {
        sent: false,
        error: "Customer email is missing.",
      };
    }

    await sendCartReminderEmail({
      customerName: cart.customerPersonName || cart.customerName,
      items: cart.items.map((item) => ({
        description: item.description,
        id: item.id,
        imageUrl: item.imageUrl,
        productName: item.productName,
        quantity: item.quantity,
      })),
      locale,
      recipientEmail,
    });
    await markCartReminderSent({
      cartId,
      locale,
      source: "MANUAL",
      tenantContext,
    });

    return {
      sent: true,
    };
  } catch (error) {
    console.error("Failed to send abandoned cart reminder:", error);

    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send the reminder email.",
    };
  }
}
