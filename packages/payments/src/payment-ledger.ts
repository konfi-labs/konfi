import {
  type Order,
  type PaymentLedgerEntry,
  PaymentLedgerEntryStatus,
  PaymentLedgerEntryType,
  type PaymentMethodId,
  type PaymentMethodProviderKind,
} from "@konfi/types";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

const SYSTEM_USER = {
  id: "system",
  name: "System",
};

function normalizeMinorAmount(amount: number) {
  return Number.isFinite(amount) ? Math.abs(Math.floor(amount)) : 0;
}

function createPaymentLedgerDocId(parts: readonly (string | undefined)[]) {
  return Buffer.from(parts.map((part) => part ?? "").join("|")).toString(
    "base64url",
  );
}

export function getOrderPathParts(orderPath: string) {
  const [channelsSegment, channelId, ordersSegment, orderId] =
    orderPath.split("/");

  if (
    channelsSegment !== "channels" ||
    ordersSegment !== "orders" ||
    !channelId ||
    !orderId
  ) {
    throw new Error("Invalid order path");
  }

  return { channelId, orderId };
}

export function getProviderPaymentLedgerEntryId(params: {
  entryType: PaymentLedgerEntryType;
  orderId: string;
  providerEventId?: string;
  providerReference?: string;
}) {
  return createPaymentLedgerDocId([
    params.orderId,
    params.entryType,
    params.providerEventId || params.providerReference || "provider",
  ]);
}

export function createPaymentLedgerEntry(params: {
  amount: number;
  entryType: PaymentLedgerEntryType;
  id: string;
  order: Order;
  orderId: string;
  orderPath: string;
  paymentMethodId: PaymentMethodId;
  providerEventId?: string;
  providerKind?: PaymentMethodProviderKind;
  providerReference?: string;
  status: PaymentLedgerEntryStatus;
}): PaymentLedgerEntry {
  const { channelId } = getOrderPathParts(params.orderPath);
  const timestamp = Timestamp.now() as PaymentLedgerEntry["createdAt"];

  const entry: PaymentLedgerEntry = {
    active: true,
    amount: normalizeMinorAmount(params.amount),
    channelId,
    createdAt: timestamp,
    createdBy: SYSTEM_USER,
    currency: params.order.currency ?? "PLN",
    entryType: params.entryType,
    id: params.id,
    idempotencyKey: params.id,
    name: `${params.entryType} ${params.order.number}`,
    orderId: params.orderId,
    orderNumber: params.order.number,
    paymentMethodId: params.paymentMethodId,
    status: params.status,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
  };

  if (params.providerEventId !== undefined) {
    entry.providerEventId = params.providerEventId;
  }

  if (params.providerKind !== undefined) {
    entry.providerKind = params.providerKind;
  }

  if (params.providerReference !== undefined) {
    entry.providerReference = params.providerReference;
  }

  if (params.order.tenantId !== undefined) {
    entry.tenantId = params.order.tenantId;
  }

  return entry;
}

export async function writeOrderPaymentLedgerEntry(params: {
  entry: PaymentLedgerEntry;
  firestore: Firestore;
  orderPath: string;
}) {
  await params.firestore
    .doc(`${params.orderPath}/paymentLedgerEntries/${params.entry.id}`)
    .set(params.entry, { merge: true });
}
