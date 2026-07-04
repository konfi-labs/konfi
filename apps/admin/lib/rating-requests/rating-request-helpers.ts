import { OrderStatus, StoreOrder } from "@konfi/types";

export function shouldProcessRatingFlow(
  data: Pick<StoreOrder, "isFromStore" | "ratingsAdded" | "status" | "userId">,
): boolean {
  return (
    !!data.userId &&
    !data.ratingsAdded &&
    data.status === OrderStatus.FULFILLED &&
    data.isFromStore
  );
}

export function getRatingProductIds(data: Pick<StoreOrder, "items">): string[] {
  return [
    ...new Set(
      data.items
        .map((item) => item.product?.id)
        .filter((productId): productId is string => !!productId),
    ),
  ];
}

export function getRatingDocumentId(userId: string): string {
  // base64url creates a Firestore-safe id while staying deterministic for retries.
  return Buffer.from(userId).toString("base64url");
}
