import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  getCartReminderCopy,
  shouldSendAutomatedCartReminder,
} from "@/lib/customer-carts/cart-reminder-helpers";
import { sendEmail } from "@/lib/email";
import { resolveStorefrontBaseUrl } from "@/lib/storefront-domains";
import { AbandonedCartReminder } from "@konfi/emails";
import {
  DEFAULT_DEDICATED_TENANT_ID,
  requireTenantContextTenantId,
} from "@konfi/firebase";
import type { Customer, TenantContext } from "@konfi/types";
import { STORE_CART } from "@konfi/utils";
import { randomUUID } from "crypto";
import {
  FieldValue,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

const CART_REMINDER_RESERVATION_TTL_MS = 30 * 60 * 1000;

interface FirestoreTimestampLike {
  toDate(): Date;
}

interface CartReminderReservationData {
  lastReminderSentAt?: FirestoreTimestampLike;
  reminderReservationExpiresAt?: FirestoreTimestampLike;
  tenantId?: string | null;
}

interface TenantOwnedData {
  tenantId?: string | null;
}

export interface CartReminderEmailItem {
  description: string;
  id: string;
  imageUrl?: string;
  productName?: string;
  quantity: number;
}

const legacyDedicatedTenantContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: DEFAULT_DEDICATED_TENANT_ID,
};

function shouldScopeToTenant(tenantContext: TenantContext): boolean {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function getTenantScopeId(tenantContext: TenantContext): string | undefined {
  if (!shouldScopeToTenant(tenantContext)) {
    return undefined;
  }

  return requireTenantContextTenantId(
    tenantContext,
    "cart reminder tenant scope",
  );
}

function isTenantOwnedDataVisible(
  data: TenantOwnedData | undefined,
  tenantContext: TenantContext,
): boolean {
  const tenantId = getTenantScopeId(tenantContext);

  return !tenantId || data?.tenantId === tenantId;
}

async function assertCartDocumentWritableForTenant(params: {
  cartId: string;
  firestore: FirebaseFirestore.Firestore;
  tenantContext: TenantContext;
}) {
  if (!getTenantScopeId(params.tenantContext)) {
    return;
  }

  const snapshot = await params.firestore
    .collection("carts")
    .doc(params.cartId)
    .get();
  const data = snapshot.data() as TenantOwnedData | undefined;

  if (
    snapshot.exists &&
    !isTenantOwnedDataVisible(data, params.tenantContext)
  ) {
    throw new Error("Cart does not belong to the current tenant.");
  }
}

function getCartIdFromCartItemSnapshot(
  snapshot: QueryDocumentSnapshot,
): string | undefined {
  const cartDocRef = snapshot.ref.parent.parent;

  if (cartDocRef?.parent.id !== "carts") {
    return undefined;
  }

  return cartDocRef.id;
}

function toAbsoluteBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");

  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^\/+/u, "")}`;
}

export async function resolveCustomerByCartId(
  cartId: string,
  tenantContext: TenantContext = legacyDedicatedTenantContext,
): Promise<Customer | undefined> {
  const firestore = getAdminDb();
  const directMatch = await firestore.collection("customers").doc(cartId).get();

  if (directMatch.exists) {
    const customer = directMatch.data() as Customer;
    return customer.active === false ||
      !isTenantOwnedDataVisible(customer, tenantContext)
      ? undefined
      : customer;
  }

  let linkedQuery = firestore
    .collection("customers")
    .where("linkedAuthId", "==", cartId)
    .where("active", "==", true);
  const tenantId = getTenantScopeId(tenantContext);

  if (tenantId) {
    linkedQuery = linkedQuery.where("tenantId", "==", tenantId);
  }

  const linkedMatch = await linkedQuery.limit(1).get();

  if (linkedMatch.empty) {
    return undefined;
  }

  const customer = linkedMatch.docs[0]?.data() as Customer | undefined;

  return isTenantOwnedDataVisible(customer, tenantContext)
    ? customer
    : undefined;
}

export async function markCartReminderSent(params: {
  cartId: string;
  locale: string;
  source: "AUTOMATED" | "MANUAL";
  tenantContext?: TenantContext;
}) {
  const tenantContext = params.tenantContext ?? legacyDedicatedTenantContext;
  const firestore = getAdminDb();
  const tenantId = getTenantScopeId(tenantContext);

  await assertCartDocumentWritableForTenant({
    cartId: params.cartId,
    firestore,
    tenantContext,
  });

  await firestore
    .collection("carts")
    .doc(params.cartId)
    .set(
      {
        lastReminderLocale: params.locale,
        lastReminderSentAt: Timestamp.now(),
        lastReminderSource: params.source,
        reminderReservationExpiresAt: FieldValue.delete(),
        reminderReservationId: FieldValue.delete(),
        reminderReservedAt: FieldValue.delete(),
        ...(tenantId ? { tenantId } : {}),
      },
      { merge: true },
    );
}

/**
 * Atomically reserves an automated cart reminder before the email is sent.
 * Returns a reservation id when this invocation owns the send, or undefined
 * when the cart is no longer eligible or another invocation already reserved it.
 * Reservations expire after 30 minutes so failed or interrupted sends can be
 * retried by a later cron run.
 */
export async function reserveAutomatedCartReminder(params: {
  cartId: string;
  customer?: Pick<
    Customer,
    "active" | "contacts" | "email" | "id" | "linkedAuthId"
  >;
  itemCount: number;
  lastUpdatedAt?: Date;
  locale: string;
  now: Date;
  recipientEmail?: string;
  tenantContext?: TenantContext;
}): Promise<string | undefined> {
  const tenantContext = params.tenantContext ?? legacyDedicatedTenantContext;
  const firestore = getAdminDb();
  const cartDocRef = firestore.collection("carts").doc(params.cartId);
  const reservationId = randomUUID();
  const tenantId = getTenantScopeId(tenantContext);
  const newReservationExpiresAt = new Date(
    params.now.getTime() + CART_REMINDER_RESERVATION_TTL_MS,
  );

  return firestore.runTransaction(async (transaction) => {
    const cartDocSnapshot = await transaction.get(cartDocRef);
    const cartReservationData = cartDocSnapshot.data() as
      | CartReminderReservationData
      | undefined;

    if (
      cartDocSnapshot.exists &&
      !isTenantOwnedDataVisible(cartReservationData, tenantContext)
    ) {
      return undefined;
    }

    const lastReminderSentAt =
      cartReservationData?.lastReminderSentAt?.toDate();
    const existingReservationExpiresAt =
      cartReservationData?.reminderReservationExpiresAt?.toDate();
    const guard = shouldSendAutomatedCartReminder({
      cartId: params.cartId,
      customer: params.customer,
      itemCount: params.itemCount,
      lastReminderSentAt,
      lastUpdatedAt: params.lastUpdatedAt,
      now: params.now,
      recipientEmail: params.recipientEmail,
    });

    if (
      !guard.shouldSend ||
      (existingReservationExpiresAt &&
        existingReservationExpiresAt.getTime() > params.now.getTime())
    ) {
      return undefined;
    }

    transaction.set(
      cartDocRef,
      {
        reminderReservationExpiresAt: Timestamp.fromDate(
          newReservationExpiresAt,
        ),
        reminderReservationId: reservationId,
        reminderReservedAt: Timestamp.fromDate(params.now),
        ...(tenantId ? { tenantId } : {}),
      },
      { merge: true },
    );

    return reservationId;
  });
}

export async function releaseAutomatedCartReminderReservation(params: {
  cartId: string;
  tenantContext?: TenantContext;
}): Promise<void> {
  const tenantContext = params.tenantContext ?? legacyDedicatedTenantContext;
  const firestore = getAdminDb();
  const tenantId = getTenantScopeId(tenantContext);

  await assertCartDocumentWritableForTenant({
    cartId: params.cartId,
    firestore,
    tenantContext,
  });

  await firestore
    .collection("carts")
    .doc(params.cartId)
    .set(
      {
        reminderReservationExpiresAt: FieldValue.delete(),
        reminderReservationId: FieldValue.delete(),
        reminderReservedAt: FieldValue.delete(),
        ...(tenantId ? { tenantId } : {}),
      },
      { merge: true },
    );
}

export async function listCartIds(
  tenantContext: TenantContext = legacyDedicatedTenantContext,
): Promise<string[]> {
  const firestore = getAdminDb();
  const tenantId = getTenantScopeId(tenantContext);

  if (tenantId) {
    const [cartDocumentsSnapshot, cartItemsSnapshot] = await Promise.all([
      firestore.collection("carts").where("tenantId", "==", tenantId).get(),
      firestore
        .collectionGroup("items")
        .where("tenantId", "==", tenantId)
        .get(),
    ]);
    const cartIds = new Set<string>();

    cartDocumentsSnapshot.docs.forEach((doc) => cartIds.add(doc.id));
    cartItemsSnapshot.docs.forEach((doc) => {
      const cartId = getCartIdFromCartItemSnapshot(doc);

      if (cartId) {
        cartIds.add(cartId);
      }
    });

    return [...cartIds].toSorted();
  }

  const cartDocumentRefs = await firestore.collection("carts").listDocuments();

  // Firestore returns "missing" parent docs here as well, so carts that only
  // exist via /carts/{id}/items are still discoverable without scanning items.
  return cartDocumentRefs.map((ref) => ref.id);
}

export async function sendCartReminderEmail(params: {
  customerName: string;
  items: CartReminderEmailItem[];
  locale: string;
  recipientEmail: string;
  tenantContext?: TenantContext;
}) {
  const tenantContext = params.tenantContext ?? legacyDedicatedTenantContext;
  const tenantId = getTenantScopeId(tenantContext);
  const noReplyEmail = tenantId ? undefined : process.env.NO_REPLY_EMAIL;
  const storeUrl = await resolveStorefrontBaseUrl({
    tenantContext,
    tenantId: tenantId ?? DEFAULT_DEDICATED_TENANT_ID,
  });
  const cartUrl = new URL(
    STORE_CART,
    `${toAbsoluteBaseUrl(storeUrl)}/`,
  ).toString();
  const copy = getCartReminderCopy(params.locale);

  await sendEmail({
    to: params.recipientEmail,
    from: noReplyEmail,
    subject: copy.subject,
    tenantContext,
    template: (
      <AbandonedCartReminder
        buttonLabel={copy.buttonLabel}
        cartUrl={cartUrl}
        greeting={copy.greeting}
        heading={copy.heading}
        intro={copy.intro}
        items={params.items}
        brand="store"
        locale={params.locale === "pl" ? "pl" : "en"}
        name={params.customerName}
        outro={copy.outro}
        preview={copy.preview}
        quantityLabel={copy.quantityLabel}
      />
    ),
  });
}
