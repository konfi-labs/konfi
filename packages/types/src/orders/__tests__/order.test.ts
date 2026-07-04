import { describe, expect, it } from "vitest";
import { isAllegroFulfillmentManagedOrder } from "../order";

describe("isAllegroFulfillmentManagedOrder", () => {
  it("requires the explicit Allegro fulfillment provider", () => {
    expect(
      isAllegroFulfillmentManagedOrder({
        externalSource: {
          provider: "ALLEGRO",
          externalOrderId: "checkout-form-1",
          fulfillmentProvider: "ALLEGRO",
          externallyFulfilled: true,
        },
      }),
    ).toBe(true);
  });

  it("does not treat legacy externallyFulfilled metadata as Allegro-managed", () => {
    expect(
      isAllegroFulfillmentManagedOrder({
        externalSource: {
          provider: "ALLEGRO",
          externalOrderId: "checkout-form-1",
          externallyFulfilled: true,
        },
      }),
    ).toBe(false);
  });
});
