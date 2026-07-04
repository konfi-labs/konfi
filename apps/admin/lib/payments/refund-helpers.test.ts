import { describe, expect, it } from "vitest";

import {
  formatMinorAmountInput,
  getRefundHistory,
  getRefundedAmount,
  getRemainingRefundableAmount,
  hasActiveRefundRequest,
  parseRefundAmountInput,
} from "./refund-helpers";

describe("parseRefundAmountInput", () => {
  it("parses amounts with two decimal places into minor units", () => {
    expect(parseRefundAmountInput("12.34")).toBe(1234);
    expect(parseRefundAmountInput("12,3")).toBe(1230);
    expect(parseRefundAmountInput("12")).toBe(1200);
  });

  it("rejects invalid amount formats", () => {
    expect(parseRefundAmountInput("")).toBeUndefined();
    expect(parseRefundAmountInput("12.345")).toBeUndefined();
    expect(parseRefundAmountInput("-1")).toBeUndefined();
    expect(parseRefundAmountInput("abc")).toBeUndefined();
  });
});

describe("formatMinorAmountInput", () => {
  it("formats minor units into a decimal input value", () => {
    expect(formatMinorAmountInput(1234)).toBe("12.34");
  });
});

describe("refund aggregate helpers", () => {
  it("sums completed refund history entries", () => {
    const refund = {
      refundHistory: [
        {
          requestId: "req-1",
          amount: 2500,
          status: "COMPLETED" as const,
          reason: "First partial refund",
          requestedBy: "admin-1",
        },
        {
          requestId: "req-2",
          amount: 1000,
          status: "FAILED" as const,
          reason: "Failed refund",
          requestedBy: "admin-1",
        },
        {
          requestId: "req-3",
          amount: 1500,
          status: "COMPLETED" as const,
          reason: "Second partial refund",
          requestedBy: "admin-1",
        },
      ],
    };

    expect(getRefundedAmount(refund)).toBe(4000);
    expect(getRemainingRefundableAmount(10_000, refund)).toBe(6000);
  });

  it("falls back to legacy single refund documents", () => {
    const refund = {
      amount: 10_000,
      status: "COMPLETED" as const,
      reason: "Legacy refund",
      requestedBy: "admin-1",
    };

    expect(getRefundHistory(refund)).toEqual([
      expect.objectContaining({
        requestId: "legacy",
        amount: 10_000,
        status: "COMPLETED",
      }),
    ]);
    expect(getRefundedAmount(refund)).toBe(10_000);
  });

  it("detects in-flight refund requests from the latest request", () => {
    expect(
      hasActiveRefundRequest({
        refundHistory: [
          {
            requestId: "req-1",
            amount: 1000,
            status: "COMPLETED",
            reason: "Done",
            requestedBy: "admin-1",
          },
          {
            requestId: "req-2",
            amount: 500,
            status: "PENDING",
            reason: "Queued",
            requestedBy: "admin-1",
          },
        ],
      }),
    ).toBe(true);
  });
});
