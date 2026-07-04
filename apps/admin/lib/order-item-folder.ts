import { OrderItem } from "@konfi/types";

const INVALID_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

export const sanitizeOrderItemName = (name: string): string => {
  return name
    .replace(INVALID_CHARS_REGEX, "")
    .replace(/\s+/g, "-")
    .replace(/\.+$/, "")
    .trim();
};

export const getOrderItemFolderName = (orderItem: OrderItem): string => {
  const name =
    orderItem.product?.name || orderItem.description || `Item-${orderItem.id}`;
  return sanitizeOrderItemName(name);
};
