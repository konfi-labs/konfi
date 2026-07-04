import { updateItemStatus } from "@/lib/fulfillment/client";
import { OrderItem } from "@konfi/types";

export interface UpdateItemStatusParams {
  orderId: string;
  channelId: string;
  itemId: string;
  item?: OrderItem;
  inProgress?: boolean;
  fulfilled?: boolean;
  contextUpdate: (
    orderId: string,
    channelId: string,
    itemId: string,
    value: boolean,
  ) => void;
}

/**
 * Helper function to update item status consistently across the app.
 * Uses the admin fulfillment API for items with warehouse assignment,
 * context method for regular items.
 */
export async function updateItemStatusHelper({
  orderId,
  channelId,
  itemId,
  item,
  inProgress,
  fulfilled,
  contextUpdate,
}: UpdateItemStatusParams) {
  const hasWarehouseAssignment = item?.warehouseId && item.warehouseId !== "";
  if (hasWarehouseAssignment) {
    return await updateItemStatus({
      channelId,
      orderId,
      itemId,
      inProgress,
      fulfilled,
    });
  } else {
    contextUpdate(orderId, channelId, itemId, inProgress ?? fulfilled ?? false);
  }
}
