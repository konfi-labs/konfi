import { isShippingFree } from "../../validators/is-shipping-free";

describe("isShippingFree", () => {
  it("should return true when free shipping is enabled and subtotal is greater than or equal to the minimum", () => {
    expect(isShippingFree(100, true, 50)).toBe(true);
    expect(isShippingFree(50, true, 50)).toBe(true);
  });

  it("should return false when free shipping is enabled but subtotal is less than the minimum", () => {
    expect(isShippingFree(30, true, 50)).toBe(false);
  });

  it("should return false when free shipping is not enabled regardless of the subtotal", () => {
    expect(isShippingFree(100, false, 50)).toBe(false);
    expect(isShippingFree(50, false, 50)).toBe(false);
    expect(isShippingFree(30, false, 50)).toBe(false);
  });

  it("should return false when free shipping is disabled", () => {
    expect(isShippingFree(1000, false, 500)).toBe(false);
    expect(isShippingFree(200, false, 500)).toBe(false);
  });

  it("should return true when subtotal meets or exceeds minimum and free shipping is enabled", () => {
    expect(isShippingFree(500, true, 500)).toBe(true);
    expect(isShippingFree(1000, true, 500)).toBe(true);
  });

  it("should return false when subtotal is below minimum even if free shipping is enabled", () => {
    expect(isShippingFree(499, true, 500)).toBe(false);
    expect(isShippingFree(0, true, 500)).toBe(false);
  });
});
