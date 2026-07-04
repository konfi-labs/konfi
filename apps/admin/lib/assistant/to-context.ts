import { Customer, FormattedOrderItem, Order, OrderItem } from "@konfi/types";
import { TFunction } from "i18next";

type CustomerContextSource = Pick<
  Customer,
  | "id"
  | "name"
  | "personName"
  | "email"
  | "nip"
  | "b2b"
  | "discount"
  | "specialNotes"
  | "addresses"
  | "contacts"
> & {
  createdAt?: Customer["createdAt"] | string | null;
};

export function orderToContext(order: Order, t: TFunction) {
  return {
    id: order.id,
    channelId: order.channelId,
    customer:
      typeof order.customer === "string"
        ? order.customer
        : customerToContext(order.customer),
    items: order.items.map((item) => orderItemToContext(item)),
    totalPrice: order.totalPrice / 100,
    status: t(`OrderStatus.${order.status}`, { defaultValue: order.status }),
    paymentStatus: t(`PaymentStatus.${order.paymentStatus}`, {
      defaultValue: order.paymentStatus,
    }),
  };
}

export function orderItemToContext(
  orderItem: FormattedOrderItem | OrderItem,
): FormattedOrderItem {
  return {
    id: orderItem.id,
    name: orderItem.name,
    product: {
      id: orderItem.product?.id ?? "",
      name: orderItem.product?.name ?? "",
      channelId: orderItem.product?.channelId ?? "",
      linkedWarehouses: orderItem.product?.linkedWarehouses,
      spec: {
        images: orderItem.product?.spec?.images ?? [],
      },
    },
    discount: orderItem.discount,
    customFormat: orderItem.customFormat,
    customPrice: orderItem.customPrice,
    description: orderItem.description,
    totalPrice: orderItem.totalPrice / 100,
    volume: orderItem.volume,
    width: orderItem.width,
    height: orderItem.height,
    quantity: orderItem.quantity,
    customSizes: orderItem.customSizes?.map((size) => ({
      width: size.width,
      height: size.height,
      quantity: size.quantity,
    })),
    unit: orderItem.unit,
  };
}

export function customerToContext(customer: CustomerContextSource) {
  // Get primary address if available
  const primaryAddress = customer.addresses?.[0];
  // Get primary contact if available
  const primaryContact = customer.contacts?.[0];

  return {
    id: customer.id,
    name: customer.name ?? customer.personName,
    email: customer.email,
    phone: primaryContact?.phone,
    nip: customer.nip,
    b2b: customer.b2b,
    address: primaryAddress
      ? {
          street: primaryAddress.street,
          city: primaryAddress.city,
          zip: primaryAddress.zip,
          country: primaryAddress.country,
        }
      : undefined,
    createdAt:
      typeof customer.createdAt === "string"
        ? customer.createdAt
        : (customer.createdAt?.toDate?.()?.toISOString?.() ?? undefined),
    discount: customer.discount,
    specialNotes: customer.specialNotes,
  };
}
