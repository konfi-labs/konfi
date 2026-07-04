const STORAGE_SEGMENT_PATTERN = /^[^/]+$/;

function normalizeStorageSegment(value: string, label: string): string {
  const normalizedValue = value.trim().replace(/^\/+|\/+$/g, "");

  if (!normalizedValue || !STORAGE_SEGMENT_PATTERN.test(normalizedValue)) {
    throw new Error(`Invalid ${label}.`);
  }

  return normalizedValue;
}

export function normalizeOrderItemAttachmentTarget(input: {
  customerId: string;
  orderId: string;
  orderItemId: string;
}) {
  return {
    customerId: normalizeStorageSegment(input.customerId, "customer ID"),
    orderId: normalizeStorageSegment(input.orderId, "order ID"),
    orderItemId: normalizeStorageSegment(input.orderItemId, "order item ID"),
  };
}

export function buildOrderItemAttachmentPaths(input: {
  channelId?: string;
  customerId: string;
  orderId: string;
  orderItemId: string;
  fileName: string;
}) {
  const target = normalizeOrderItemAttachmentTarget(input);
  const normalizedChannelId = input.channelId
    ? normalizeStorageSegment(input.channelId, "channel ID")
    : undefined;
  const normalizedFileName = input.fileName.trim();

  if (!normalizedFileName || normalizedFileName.includes("/")) {
    throw new Error("Invalid file name.");
  }

  const orderPrefix = normalizedChannelId
    ? `channels/${normalizedChannelId}/orders`
    : "orders";
  const thumbnailPrefix = normalizedChannelId
    ? `channels/${normalizedChannelId}/thumb_orders`
    : "thumb_orders";
  const fullPath = `${orderPrefix}/${target.customerId}/${target.orderId}/items/${target.orderItemId}/${normalizedFileName}`;
  const fileNameWithoutExtension =
    normalizedFileName.slice(0, normalizedFileName.lastIndexOf(".")) ||
    normalizedFileName;
  const thumbnailPath = `${thumbnailPrefix}/${target.customerId}/${target.orderId}/items/${target.orderItemId}/thumb_${fileNameWithoutExtension}.png`;

  return {
    fullPath,
    thumbnailPath,
  };
}
