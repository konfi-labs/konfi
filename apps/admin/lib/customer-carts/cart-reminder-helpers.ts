import { buildProductCdnThumbnail } from "@konfi/firebase";
import { PriceTypeEnum, type Customer, type OrderItem } from "@konfi/types";
import { calculateQuantityForMultipleSizes } from "@konfi/utils";

// Carts must be inactive for at least 24 hours before we treat them as abandoned.
export const CART_REMINDER_STALE_HOURS = 24;
// After sending a reminder, wait 7 days before allowing another reminder.
export const CART_REMINDER_COOLDOWN_HOURS = 24 * 7;

type ReminderCustomer = Pick<
  Customer,
  "active" | "contacts" | "email" | "id" | "linkedAuthId"
>;

export interface AutomatedCartReminderGuardInput {
  cartId: string;
  customer?: ReminderCustomer;
  itemCount: number;
  lastReminderSentAt?: Date;
  lastUpdatedAt?: Date;
  now: Date;
  recipientEmail?: string;
}

export interface AutomatedCartReminderGuardResult {
  reason?:
    | "already-reminded"
    | "cart-too-fresh"
    | "customer-inactive"
    | "missing-customer"
    | "missing-items"
    | "missing-recipient"
    | "not-authenticated-customer";
  shouldSend: boolean;
}

interface CartReminderItemImageSource {
  product?: {
    channelId?: string | null;
    id?: string | null;
    spec?: {
      images?: string[] | null;
    } | null;
  } | null;
}

export function getCartReminderItemQuantity(item: Partial<OrderItem>): number {
  if (item.customSizes && item.customSizes.length > 0) {
    try {
      return calculateQuantityForMultipleSizes(
        item.customSizes,
        item.product?.designSpec?.includeBleed
          ? item.product.designSpec.bleed
          : undefined,
      );
    } catch (error) {
      console.error(
        "Error calculating cart reminder amount from custom sizes:",
        error,
      );
    }
  }

  if (item.product?.priceType === PriceTypeEnum.MATRIX) {
    return typeof item.volume === "number" ? item.volume : 0;
  }

  if (item.product?.priceType !== undefined) {
    return typeof item.quantity === "number" ? item.quantity : 0;
  }

  return typeof item.volume === "number"
    ? item.volume
    : typeof item.quantity === "number"
      ? item.quantity
      : 0;
}

export function getCartReminderItemImageUrl(
  item: CartReminderItemImageSource,
): string | undefined {
  const imageUrl = buildProductCdnThumbnail({
    channelId: item.product?.channelId,
    fallback: "",
    imageFiles: item.product?.spec?.images ?? undefined,
    productId: item.product?.id,
    storeChannelIdFallback:
      process.env.STORE_CHANNEL_ID ?? process.env.NEXT_PUBLIC_STORE_CHANNEL_ID,
  });

  return imageUrl ? `${imageUrl}?fit=crop&auto=format,compress` : undefined;
}

export function getCartReminderCopy(locale: string) {
  if (locale === "pl") {
    return {
      buttonLabel: "Przejdź do koszyka",
      fallbackName: "Kliencie",
      greeting: "Cześć",
      heading: "Masz produkty w koszyku",
      intro:
        "Zostawiłeś produkty w koszyku. Wróć do niego, aby dokończyć zamówienie:",
      outro:
        "Dokończ zamówienie, zanim konfiguracja lub dostępność produktów się zmieni.",
      preview: "Masz produkty w koszyku",
      quantityLabel: "Ilość",
      subject: "Masz produkty w koszyku",
      unnamedItemLabel: "Nienazwany produkt",
    };
  }

  return {
    buttonLabel: "Go to cart",
    fallbackName: "there",
    greeting: "Hello",
    heading: "You have products in your cart",
    intro:
      "You left products in your cart. Return to it to complete your order:",
    outro:
      "Complete your order before the configuration or product availability changes.",
    preview: "You have products in your cart",
    quantityLabel: "Quantity",
    subject: "You have products in your cart",
    unnamedItemLabel: "Unnamed item",
  };
}

export function normalizeEmail(email?: string | null): string | undefined {
  const normalized = email?.trim().toLowerCase();

  return normalized ? normalized : undefined;
}

export function getCustomerReminderEmail(
  customer?: Pick<Customer, "email" | "contacts">,
): string | undefined {
  const customerEmail = normalizeEmail(customer?.email);
  if (customerEmail) {
    return customerEmail;
  }

  const activeContactEmail = customer?.contacts?.find(
    (contact) => contact.active,
  )?.email;

  return normalizeEmail(activeContactEmail);
}

export function isAuthenticatedCustomerCartOwner(
  cartId: string,
  customer?: Pick<Customer, "id" | "linkedAuthId">,
): boolean {
  if (!customer) {
    return false;
  }

  return customer.id === cartId || customer.linkedAuthId === cartId;
}

export function shouldSendAutomatedCartReminder(
  input: AutomatedCartReminderGuardInput,
): AutomatedCartReminderGuardResult {
  const {
    cartId,
    customer,
    itemCount,
    lastReminderSentAt,
    lastUpdatedAt,
    now,
    recipientEmail,
  } = input;

  if (!customer) {
    return { shouldSend: false, reason: "missing-customer" };
  }

  if (customer.active === false) {
    return { shouldSend: false, reason: "customer-inactive" };
  }

  if (!isAuthenticatedCustomerCartOwner(cartId, customer)) {
    return { shouldSend: false, reason: "not-authenticated-customer" };
  }

  if (!recipientEmail) {
    return { shouldSend: false, reason: "missing-recipient" };
  }

  if (itemCount <= 0 || !lastUpdatedAt) {
    return { shouldSend: false, reason: "missing-items" };
  }

  const staleThresholdMs = CART_REMINDER_STALE_HOURS * 60 * 60 * 1000;
  if (now.getTime() - lastUpdatedAt.getTime() < staleThresholdMs) {
    return { shouldSend: false, reason: "cart-too-fresh" };
  }

  if (
    lastReminderSentAt &&
    lastReminderSentAt.getTime() >= lastUpdatedAt.getTime()
  ) {
    return { shouldSend: false, reason: "already-reminded" };
  }

  const cooldownMs = CART_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (
    lastReminderSentAt &&
    now.getTime() - lastReminderSentAt.getTime() < cooldownMs
  ) {
    return { shouldSend: false, reason: "already-reminded" };
  }

  return { shouldSend: true };
}
