import "server-only";

import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { EntityType, type Product } from "@konfi/types";

export async function scheduleExternalProductChangeLog({
  before,
  channelId,
  productId,
}: {
  before: Product | null;
  channelId: string;
  productId: string;
}) {
  const beforeSnapshot = before ? createChangeSnapshot(before) : null;
  if (before && !beforeSnapshot) {
    console.error(
      "[externalProducts] Failed to serialize previous product for change log",
      {
        channelId,
        productId,
      },
    );
    return;
  }

  try {
    await scheduleChangeLogAfterFormSubmit({
      entityType: EntityType.Product,
      entityId: productId,
      channelId,
      before: beforeSnapshot,
    });
  } catch (error) {
    console.error("[externalProducts] Failed to schedule product change log", {
      error,
      channelId,
      productId,
    });
  }
}
