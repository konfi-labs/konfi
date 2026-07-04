import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import {
  isSharedSaasCronRuntime,
  runForCronTenants,
} from "@/lib/cron/tenant-runner";
import {
  getCartReminderCopy,
  getCustomerReminderEmail,
  getCartReminderItemImageUrl,
  getCartReminderItemQuantity,
  normalizeEmail,
  shouldSendAutomatedCartReminder,
} from "@/lib/customer-carts/cart-reminder-helpers";
import {
  listCartIds,
  markCartReminderSent,
  releaseAutomatedCartReminderReservation,
  resolveCustomerByCartId,
  reserveAutomatedCartReminder,
  sendCartReminderEmail,
} from "@/lib/customer-carts/cart-reminder-service";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { OrderItem } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

import type { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

// This cron can scan many carts, fetch Firestore subcollections, and send emails,
// so it uses the longer 5-minute execution window available to route handlers.
export const maxDuration = 300;

// Balance Firestore reads and email sends against completing daily scans promptly.
const CART_REMINDER_CONCURRENCY_LIMIT = 5;

interface CustomerCartItemSnapshot {
  description: string;
  id: string;
  imageUrl?: string;
  productName?: string;
  quantity: number;
}

interface CartReminderMetadata {
  lastReminderLocale?: string;
  lastReminderSentAt?: Timestamp;
}

type CartReminderProcessingResult = "sent" | "skipped";

function getCartReminderLocale(metadata?: CartReminderMetadata): string {
  return metadata?.lastReminderLocale === "en" ? "en" : "pl";
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = Array.from({ length: items.length }) as R[];
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) {
      return;
    }

    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runNext(),
    ),
  );

  return results;
}

async function processCartReminder(params: {
  cartId: string;
  firestore: FirebaseFirestore.Firestore;
  now: Date;
  tenantContext: TenantContext;
}): Promise<CartReminderProcessingResult> {
  const cartDocRef = params.firestore.collection("carts").doc(params.cartId);
  const [cartDocSnapshot, itemsSnapshot, customer] = await Promise.all([
    cartDocRef.get(),
    params.firestore.collection(`carts/${params.cartId}/items`).get(),
    resolveCustomerByCartId(params.cartId, params.tenantContext),
  ]);

  if (itemsSnapshot.empty) {
    return "skipped";
  }

  const metadata = cartDocSnapshot.data() as CartReminderMetadata | undefined;
  const locale = getCartReminderLocale(metadata);
  const copy = getCartReminderCopy(locale);
  const recipientEmail = getCustomerReminderEmail(customer);
  const lastUpdatedAt = itemsSnapshot.docs.reduce<Date | undefined>(
    (latest, doc) => {
      const docUpdatedAt = doc.updateTime.toDate();

      if (!latest || docUpdatedAt.getTime() > latest.getTime()) {
        return docUpdatedAt;
      }

      return latest;
    },
    undefined,
  );

  const guard = shouldSendAutomatedCartReminder({
    cartId: params.cartId,
    customer,
    itemCount: itemsSnapshot.size,
    lastReminderSentAt: metadata?.lastReminderSentAt?.toDate(),
    lastUpdatedAt,
    now: params.now,
    recipientEmail,
  });

  if (!guard.shouldSend) {
    return "skipped";
  }

  const safeRecipientEmail = recipientEmail;
  if (!safeRecipientEmail) {
    return "skipped";
  }

  const reservationId = await reserveAutomatedCartReminder({
    cartId: params.cartId,
    customer,
    itemCount: itemsSnapshot.size,
    lastUpdatedAt,
    locale,
    now: params.now,
    recipientEmail,
    tenantContext: params.tenantContext,
  });

  if (!reservationId) {
    return "skipped";
  }

  const items = itemsSnapshot.docs.map((doc) => {
    const data = doc.data() as Partial<OrderItem>;

    return {
      description:
        data.description?.trim() ||
        data.product?.name?.trim() ||
        copy.unnamedItemLabel,
      id: doc.id,
      imageUrl: getCartReminderItemImageUrl(data),
      productName: data.product?.name?.trim() || undefined,
      quantity: getCartReminderItemQuantity(data),
    } satisfies CustomerCartItemSnapshot;
  });

  const customerName =
    customer?.personName?.trim() ||
    customer?.name?.trim() ||
    normalizeEmail(safeRecipientEmail) ||
    copy.fallbackName;

  try {
    await sendCartReminderEmail({
      customerName,
      items: items.map((item) => ({
        description: item.description,
        id: item.id,
        imageUrl: item.imageUrl,
        productName: item.productName,
        quantity: item.quantity,
      })),
      locale,
      recipientEmail: safeRecipientEmail,
      tenantContext: params.tenantContext,
    });
    await markCartReminderSent({
      cartId: params.cartId,
      locale,
      source: "AUTOMATED",
      tenantContext: params.tenantContext,
    });
  } catch (error) {
    try {
      await releaseAutomatedCartReminderReservation({
        cartId: params.cartId,
        tenantContext: params.tenantContext,
      });
    } catch (releaseError) {
      console.error("Failed to release automated cart reminder reservation:", {
        cartId: params.cartId,
        releaseError,
        reservationId,
        sendError: error,
      });
    }

    throw error;
  }

  return "sent";
}

async function runCustomerCartRemindersForTenant(params: {
  firestore: FirebaseFirestore.Firestore;
  tenantContext: TenantContext;
}) {
  const cartIds = await listCartIds(params.tenantContext);

  if (cartIds.length === 0) {
    return {
      scanned: 0,
      sent: 0,
      skipped: 0,
    };
  }

  const now = new Date();
  const results = await runWithConcurrency(
    cartIds,
    (cartId) =>
      processCartReminder({
        cartId,
        firestore: params.firestore,
        now,
        tenantContext: params.tenantContext,
      }),
    CART_REMINDER_CONCURRENCY_LIMIT,
  );
  const sent = results.filter((result) => result === "sent").length;
  const skipped = results.length - sent;

  return {
    scanned: cartIds.length,
    sent,
    skipped,
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSharedSaasCronRuntime() && !process.env.NO_REPLY_EMAIL) {
    return NextResponse.json(
      { error: "NO_REPLY_EMAIL is not configured." },
      { status: 500 },
    );
  }

  try {
    const firestore = getAdminDb();
    const tenantResults = await runForCronTenants(({ tenantContext }) =>
      runCustomerCartRemindersForTenant({
        firestore,
        tenantContext,
      }),
    );
    const failedCount = tenantResults.filter(
      (result) => result.status === "failed",
    ).length;
    const totals = tenantResults.reduce(
      (accumulator, tenantResult) => {
        const result = tenantResult.result;

        if (!result) {
          return accumulator;
        }

        return {
          scanned: accumulator.scanned + result.scanned,
          sent: accumulator.sent + result.sent,
          skipped: accumulator.skipped + result.skipped,
        };
      },
      { scanned: 0, sent: 0, skipped: 0 },
    );

    return NextResponse.json(
      {
        success: failedCount === 0,
        ...totals,
        tenants: tenantResults,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Error running automated cart reminders:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown customer cart reminder cron error.",
      },
      { status: 500 },
    );
  }
}
