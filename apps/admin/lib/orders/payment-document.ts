import { Order, PaymentStatus } from "@konfi/types";

export type PaymentDocumentOrderUpdate = Partial<
  Pick<Order, "paymentDocumentId" | "proformaDocumentId" | "paymentStatus">
>;

type PaymentDocumentFields = Pick<
  Order,
  "paymentDocumentId" | "proformaDocumentId"
>;

export function getPaymentDocumentValue(
  order?: Partial<PaymentDocumentFields> | null,
): string {
  return (
    order?.paymentDocumentId?.trim() || order?.proformaDocumentId?.trim() || ""
  );
}

export function hasPaymentDocumentValue(
  order?: Partial<PaymentDocumentFields> | null,
): boolean {
  return getPaymentDocumentValue(order).length > 0;
}

export function getPaymentDocumentOrderUpdate(
  paymentDocumentId?: string,
  proformaDocumentId?: string,
): PaymentDocumentOrderUpdate {
  const update: PaymentDocumentOrderUpdate = {};

  if (paymentDocumentId !== undefined) {
    update.paymentDocumentId = paymentDocumentId;
  }

  if (proformaDocumentId !== undefined) {
    update.proformaDocumentId = proformaDocumentId;
  }

  if (paymentDocumentId) {
    update.paymentStatus = PaymentStatus.COMPLETED;
  } else if (proformaDocumentId) {
    update.paymentStatus = PaymentStatus.PENDING;
  }

  return update;
}

export function updateOrderCollection(
  orders: Order[] | null,
  orderId: string,
  patch: Partial<Order>,
  channelId?: string,
): Order[] | null {
  if (!orders) {
    return orders;
  }

  let hasMatch = false;

  const nextOrders = orders.map((order) => {
    if (order.id !== orderId) {
      return order;
    }

    if (
      channelId !== undefined &&
      order.channelId &&
      order.channelId !== channelId
    ) {
      return order;
    }

    hasMatch = true;
    return {
      ...order,
      ...patch,
    };
  });

  return hasMatch ? nextOrders : orders;
}
