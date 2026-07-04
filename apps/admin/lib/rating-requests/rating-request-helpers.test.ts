import { OrderStatus } from "@konfi/types";
import { describe, expect, it } from "vitest";
import type { StoreOrder } from "@konfi/types";
import {
  getRatingDocumentId,
  getRatingProductIds,
  shouldProcessRatingFlow,
} from "./rating-request-helpers";

describe("shouldProcessRatingFlow", () => {
  it("starts only for unreserved fulfilled store orders with a user", () => {
    expect(
      shouldProcessRatingFlow({
        isFromStore: true,
        status: OrderStatus.FULFILLED,
        userId: "user-1",
      }),
    ).toBe(true);

    expect(
      shouldProcessRatingFlow({
        isFromStore: true,
        ratingsAdded: true,
        status: OrderStatus.FULFILLED,
        userId: "user-1",
      }),
    ).toBe(false);

    expect(
      shouldProcessRatingFlow({
        isFromStore: false,
        status: OrderStatus.FULFILLED,
        userId: "user-1",
      }),
    ).toBe(false);

    expect(
      shouldProcessRatingFlow({
        isFromStore: true,
        status: OrderStatus.READY,
        userId: "user-1",
      }),
    ).toBe(false);
  });
});

describe("getRatingProductIds", () => {
  it("deduplicates rating requests for repeated products in one order", () => {
    const order = {
      items: [
        { product: { id: "product-1" } },
        { product: { id: "product-2" } },
        { product: { id: "product-1" } },
      ],
    } as unknown as Pick<StoreOrder, "items">;

    expect(getRatingProductIds(order)).toEqual(["product-1", "product-2"]);
  });
});

describe("getRatingDocumentId", () => {
  it("uses a deterministic Firestore-safe document id for duplicate handling", () => {
    expect(getRatingDocumentId("customer-uid")).toBe(
      getRatingDocumentId("customer-uid"),
    );
    expect(getRatingDocumentId("customer-uid")).not.toContain("/");
  });
});
