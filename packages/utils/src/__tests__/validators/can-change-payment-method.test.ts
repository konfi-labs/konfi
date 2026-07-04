import { PaymentStatus } from "@konfi/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canChangePaymentMethod,
  getDisallowedPaymentStatuses,
} from "../../validators/can-change-payment-method";

describe("canChangePaymentMethod", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return false for COMPLETED payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.COMPLETED, [])).toBe(false);
  });

  it("should return false for PENDING payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.PENDING, [])).toBe(false);
  });

  it("should return false for PARTIALLY_PAID payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.PARTIALLY_PAID, [])).toBe(
      false,
    );
  });

  it("should return false for REFUNDED payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.REFUNDED, [])).toBe(false);
  });

  it("should return false for DRAFT payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.DRAFT, [])).toBe(false);
  });

  it("should return true for NEW payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.NEW, [])).toBe(true);
  });

  it("should return true for CANCELED payment status", () => {
    expect(canChangePaymentMethod(PaymentStatus.CANCELED, [])).toBe(true);
  });

  describe("getDisallowedPaymentStatuses", () => {
    it("should return correct array of disallowed statuses", () => {
      const disallowed = getDisallowedPaymentStatuses();
      expect(disallowed).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.PENDING,
        PaymentStatus.PARTIALLY_PAID,
        PaymentStatus.REFUNDED,
        PaymentStatus.DRAFT,
      ]);
    });

    it("should contain exactly 5 disallowed statuses", () => {
      const disallowed = getDisallowedPaymentStatuses();
      expect(disallowed).toHaveLength(5);
    });
  });
});
