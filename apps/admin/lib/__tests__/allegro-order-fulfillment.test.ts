import { describe, expect, it } from "vitest";
import {
  isAllegroOrderFulfillmentStatus,
  isAllegroReadonlyOrderFulfillmentStatus,
  shouldAutoMoveImportedAllegroOrderToProcessing,
} from "../allegro-order-fulfillment";

describe("shouldAutoMoveImportedAllegroOrderToProcessing", () => {
  it("allows seller-fulfilled new imports to move to processing", () => {
    expect(
      shouldAutoMoveImportedAllegroOrderToProcessing({
        fulfillment: {
          provider: { id: "SELLER" },
          status: "NEW",
        },
      }),
    ).toBe(true);
  });

  it("does not change Allegro-fulfilled imports", () => {
    expect(
      shouldAutoMoveImportedAllegroOrderToProcessing({
        externalSource: {
          externallyFulfilled: true,
          fulfillmentProvider: "ALLEGRO",
          externalFulfillmentStatus: "NEW",
        },
      }),
    ).toBe(false);
  });

  it("does not move already advanced statuses backwards", () => {
    expect(
      shouldAutoMoveImportedAllegroOrderToProcessing({
        externalSource: {
          fulfillmentProvider: "SELLER",
          externalFulfillmentStatus: "READY_FOR_SHIPMENT",
        },
      }),
    ).toBe(false);
  });

  it("treats returned as read-only instead of a settable fulfillment status", () => {
    expect(isAllegroOrderFulfillmentStatus("RETURNED")).toBe(false);
    expect(isAllegroReadonlyOrderFulfillmentStatus("RETURNED")).toBe(true);
  });
});
