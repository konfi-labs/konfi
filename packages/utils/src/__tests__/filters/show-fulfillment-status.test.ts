import { OrderStatus } from "@konfi/types";
import { showFulfillmentStatus } from "../../filters/show-fullfillment-status";

describe("showFulfillmentStatus", () => {
  it("should return false for CANCELED status", () => {
    expect(showFulfillmentStatus(OrderStatus.CANCELED)).toBe(false);
  });

  it("should return false for DRAFT status", () => {
    expect(showFulfillmentStatus(OrderStatus.DRAFT)).toBe(false);
  });

  it("should return false for FULFILLED status", () => {
    expect(showFulfillmentStatus(OrderStatus.FULFILLED)).toBe(false);
  });

  it("should return true for READY status", () => {
    expect(showFulfillmentStatus(OrderStatus.READY)).toBe(true);
  });
});
