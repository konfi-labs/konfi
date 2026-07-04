import { describe, expect, it } from "vitest";
import {
  getStoreCreditRedemptionLimit,
  isStoreCreditRedemptionAllowed,
  normalizeStoreCreditAmount,
} from "../store-credit";

describe("store credit helpers", () => {
  it("normalizes invalid or fractional amounts to safe minor units", () => {
    expect(normalizeStoreCreditAmount(undefined)).toBe(0);
    expect(normalizeStoreCreditAmount(-100)).toBe(0);
    expect(normalizeStoreCreditAmount(Number.NaN)).toBe(0);
    expect(normalizeStoreCreditAmount(123.9)).toBe(123);
  });

  it("limits redemption to the lower of available balance and order total", () => {
    expect(
      getStoreCreditRedemptionLimit({
        balance: 1_000,
        orderTotal: 2_500,
      }),
    ).toBe(1_000);
    expect(
      getStoreCreditRedemptionLimit({
        balance: 2_500,
        orderTotal: 1_000,
      }),
    ).toBe(1_000);
  });

  it("allows empty redemptions and rejects over-redemption", () => {
    expect(
      isStoreCreditRedemptionAllowed({
        balance: 500,
        orderTotal: 1_000,
        requestedAmount: 0,
      }),
    ).toBe(true);
    expect(
      isStoreCreditRedemptionAllowed({
        balance: 500,
        orderTotal: 1_000,
        requestedAmount: 500,
      }),
    ).toBe(true);
    expect(
      isStoreCreditRedemptionAllowed({
        balance: 500,
        orderTotal: 1_000,
        requestedAmount: 501,
      }),
    ).toBe(false);
  });
});
