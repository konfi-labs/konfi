import { describe, expect, it } from "vitest";

import {
  buildOrderItemAttachmentPaths,
  normalizeOrderItemAttachmentTarget,
} from "./attach-generated-order-item-image.utils";

describe("attach generated order item image helpers", () => {
  it("normalizes order item attachment target segments", () => {
    expect(
      normalizeOrderItemAttachmentTarget({
        customerId: " customer-1 ",
        orderId: "order-1",
        orderItemId: "item-1",
      }),
    ).toEqual({
      customerId: "customer-1",
      orderId: "order-1",
      orderItemId: "item-1",
    });
  });

  it("rejects invalid target segments", () => {
    expect(() =>
      normalizeOrderItemAttachmentTarget({
        customerId: "customer-1",
        orderId: "bad/order",
        orderItemId: "item-1",
      }),
    ).toThrow("Invalid order ID.");
  });

  it("builds attachment and thumbnail paths", () => {
    expect(
      buildOrderItemAttachmentPaths({
        customerId: "customer-1",
        orderId: "order-1",
        orderItemId: "item-1",
        fileName: "ai-generated.png",
      }),
    ).toEqual({
      fullPath: "orders/customer-1/order-1/items/item-1/ai-generated.png",
      thumbnailPath:
        "thumb_orders/customer-1/order-1/items/item-1/thumb_ai-generated.png",
    });
  });

  it("builds channel-aware attachment and thumbnail paths", () => {
    expect(
      buildOrderItemAttachmentPaths({
        channelId: "channel-1",
        customerId: "customer-1",
        orderId: "order-1",
        orderItemId: "item-1",
        fileName: "ai-generated.png",
      }),
    ).toEqual({
      fullPath:
        "channels/channel-1/orders/customer-1/order-1/items/item-1/ai-generated.png",
      thumbnailPath:
        "channels/channel-1/thumb_orders/customer-1/order-1/items/item-1/thumb_ai-generated.png",
    });
  });
});
