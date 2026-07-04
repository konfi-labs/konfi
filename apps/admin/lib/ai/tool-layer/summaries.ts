import { formatTimestampLike } from "@/lib/ai/timestamps";
import type { Customer, NestedCustomer, Order, Product } from "@konfi/types";
import type {
  CustomerToolSummary,
  OrderToolSummary,
  ProductToolSummary,
  SearchResultSummary,
  ToolAuditSummary,
} from "./types";

const MAX_ITEMS = 10;
const MAX_CONTACTS = 5;

function readEntityName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() ? value : "Unknown";
  }

  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name;
    }
  }

  return "Unknown";
}

function readEntityId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) {
      return id;
    }
  }

  return undefined;
}

function summarizeOrderItem(item: Order["items"][number]) {
  const product = "product" in item ? item.product : undefined;
  const itemName =
    typeof item.name === "string" && item.name.trim()
      ? item.name
      : item.description;

  return {
    id: item.id,
    name: readEntityName(product ?? itemName),
    price: Number(item.totalPrice ?? item.customPrice ?? 0),
    quantity: Number(item.quantity ?? item.volume ?? 0),
  };
}

export function summarizeOrder(order: Order): OrderToolSummary {
  return {
    channelId: order.channelId,
    createdAt: formatTimestampLike(order.createdAt),
    currency: order.currency,
    customer: {
      id: readEntityId(order.customer),
      name: readEntityName(order.customer),
    },
    deadline: formatTimestampLike(order.deadline),
    filesStatus: order.filesStatus,
    id: order.id,
    itemCount: order.items.length,
    items: order.items.slice(0, MAX_ITEMS).map(summarizeOrderItem),
    number: order.number,
    paymentStatus: order.paymentStatus,
    paymentType: order.paymentType,
    shippingOption: order.shippingOption,
    status: order.status,
    totalPrice: order.totalPrice,
  };
}

export function summarizeCustomer(customer: Customer): CustomerToolSummary {
  const contacts = customer.contacts ?? [];

  return {
    b2b: customer.b2b,
    contactCount: contacts.length,
    contacts: contacts.slice(0, MAX_CONTACTS).map((contact) => ({
      hasEmail: Boolean(contact.email),
      hasPhone: Boolean(contact.phone),
      name: contact.name,
    })),
    id: customer.id,
    name: customer.name,
    nip: customer.nip,
    personName: customer.personName,
    specialNotes: customer.specialNotes || undefined,
  };
}

export function summarizeProduct(product: Product): ProductToolSummary {
  return {
    active: product.active,
    attributeCount: product.attributes.length,
    attributeOptionCount: Object.values(product.attributeOptions).reduce(
      (total, options) => total + options.length,
      0,
    ),
    category: product.category?.name,
    channelId: product.channelId,
    customSize: product.customSize,
    description: product.description,
    id: product.id,
    name: product.name,
    pageCount: product.pageCount
      ? {
          enabled: product.pageCount.enabled,
          maximum: product.pageCount.maximum,
          minimum: product.pageCount.minimum,
          step: product.pageCount.step,
        }
      : undefined,
    priceRowCount: product.prices?.length ?? 0,
    priceType: product.priceType,
    published: product.availability.published,
  };
}

export function orderSearchResult(order: Order): SearchResultSummary {
  return {
    id: order.id,
    label: `#${order.number} ${readEntityName(order.customer)}`,
    type: "order",
  };
}

export function productSearchResult(product: Product): SearchResultSummary {
  return {
    id: product.id,
    label: product.name,
    type: "product",
  };
}

export function customerSearchResult(
  customer: Customer | NestedCustomer,
): SearchResultSummary {
  return {
    id: customer.id,
    label: customer.name,
    type: "customer",
  };
}

export function countSummary(count: number): ToolAuditSummary {
  return { count };
}
