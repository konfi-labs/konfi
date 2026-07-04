import { describe, expect, it } from "vitest";
import { isNestedCustomer } from "../customers/customer";
import { isNestedSupplier } from "../suppliers/supplier";

describe("nested entity guards", () => {
  it("accepts objects with a defined id", () => {
    expect(isNestedCustomer({ id: "customer-1" })).toBe(true);
    expect(isNestedSupplier({ id: "supplier-1" })).toBe(true);
  });

  it("rejects missing, undefined, and non-object ids", () => {
    expect(isNestedCustomer({})).toBe(false);
    expect(isNestedCustomer({ id: undefined })).toBe(false);
    expect(isNestedCustomer(null)).toBe(false);
    expect(isNestedCustomer("customer-1")).toBe(false);

    expect(isNestedSupplier({})).toBe(false);
    expect(isNestedSupplier({ id: undefined })).toBe(false);
    expect(isNestedSupplier(null)).toBe(false);
    expect(isNestedSupplier("supplier-1")).toBe(false);
  });
});
