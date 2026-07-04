import {
  CurrencyEnum,
  DEFAULT_LOCALE,
  Locale,
  OrderRiskDimension,
  OrderRiskRecommendation,
  OrderRiskSnapshot,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  buildOrderRiskPrompt,
  evaluateOrderRiskDeterministically,
  getOrderRiskRecommendation,
  looksSuspiciousEmail,
  normalizeOrderRiskAiResult,
  normalizeOrderRiskConfidence,
} from "../order-risk";

function createSnapshot(
  overrides: Partial<OrderRiskSnapshot> = {},
): OrderRiskSnapshot {
  return {
    orderId: "order-1",
    channelId: "channel-1",
    number: 101,
    totalPrice: 2000,
    currency: CurrencyEnum.PLN,
    paymentType: PaymentType.STRIPE,
    paymentStatus: PaymentStatus.COMPLETED,
    shippingOption: null,
    isTest: false,
    specialNotes: "",
    itemNames: ["Business cards"],
    customerName: "Jane Doe",
    customerEmail: "jane@example.org",
    customerCompanyName: "Example Company",
    contactName: "Jane Doe",
    contactEmail: "jane@example.org",
    contactPhone: "+48123123123",
    shippingName: "Jane Doe",
    shippingCity: "Poznan",
    shippingCountry: "PL",
    billingName: "Jane Doe",
    billingCity: "Poznan",
    billingCountry: "PL",
    externalSourceProvider: undefined,
    externalBuyerLogin: undefined,
    externalPaymentId: undefined,
    pickupPointName: undefined,
    hasNestedCustomer: true,
    isFromStore: true,
    ...overrides,
  };
}

describe("looksSuspiciousEmail", () => {
  it("marks obvious test and disposable emails as suspicious", () => {
    expect(looksSuspiciousEmail("test@example.test")).toBe(true);
    expect(looksSuspiciousEmail("hello@mailinator.com")).toBe(true);
  });

  it("keeps regular customer emails safe", () => {
    expect(looksSuspiciousEmail("customer@example.org")).toBe(false);
  });
});

describe("evaluateOrderRiskDeterministically", () => {
  it("lowers risk for trusted prepaid orders", () => {
    const evaluation = evaluateOrderRiskDeterministically(createSnapshot());

    expect(evaluation.fraudScoreHint).toBe(0);
    expect(evaluation.operationalScoreHint).toBe(0);
    expect(evaluation.safeSignals).toContain("Trusted prepaid payment method");
    expect(evaluation.safeSignals).toContain("Payment already confirmed");
  });

  it("flags high-value pickup orders as operational risk", () => {
    const evaluation = evaluateOrderRiskDeterministically(
      createSnapshot({
        totalPrice: 100000,
        paymentType: PaymentType.ON_PICKUP,
        paymentStatus: PaymentStatus.PENDING,
      }),
    );

    expect(evaluation.operationalScoreHint).toBeGreaterThanOrEqual(60);
    expect(
      evaluation.signals.some(
        (signal) =>
          signal.code === "high-value-pickup-order" &&
          signal.dimension === OrderRiskDimension.OPERATIONAL,
      ),
    ).toBe(true);
  });

  it("treats explicit test orders as high fraud risk", () => {
    const evaluation = evaluateOrderRiskDeterministically(
      createSnapshot({
        isTest: true,
        customerEmail: "test@example.test",
        contactEmail: "test@example.test",
      }),
    );

    expect(evaluation.fraudScoreHint).toBeGreaterThanOrEqual(75);
    expect(
      evaluation.signals.some(
        (signal) => signal.code === "explicit-test-order",
      ),
    ).toBe(true);
    expect(
      evaluation.signals.some((signal) => signal.code === "suspicious-email"),
    ).toBe(true);
  });
});

describe("getOrderRiskRecommendation", () => {
  it("maps scores to proceed, review, and hold", () => {
    expect(getOrderRiskRecommendation(15, 25)).toBe(
      OrderRiskRecommendation.PROCEED,
    );
    expect(getOrderRiskRecommendation(45, 10)).toBe(
      OrderRiskRecommendation.REVIEW,
    );
    expect(getOrderRiskRecommendation(10, 75)).toBe(
      OrderRiskRecommendation.HOLD,
    );
  });
});

describe("normalizeOrderRiskConfidence", () => {
  it("accepts decimal and percentage-style confidence values", () => {
    expect(normalizeOrderRiskConfidence(0.82)).toBe(0.82);
    expect(normalizeOrderRiskConfidence(82)).toBe(0.82);
    expect(normalizeOrderRiskConfidence("82%")).toBe(0.82);
  });

  it("clamps out-of-range model confidence values", () => {
    expect(normalizeOrderRiskConfidence(-5)).toBe(0);
    expect(normalizeOrderRiskConfidence(150)).toBe(1);
  });
});

describe("normalizeOrderRiskAiResult", () => {
  it("falls back to deterministic text when the AI returns empty locale objects", () => {
    const evaluation = evaluateOrderRiskDeterministically(
      createSnapshot({
        paymentType: PaymentType.ON_PICKUP,
        paymentStatus: PaymentStatus.PENDING,
        totalPrice: 150000,
      }),
    );
    const emptyLocalizedContent = Object.fromEntries(
      Object.values(Locale).map((locale) => [locale, {}]),
    );

    const result = normalizeOrderRiskAiResult(
      {
        fraudScore: 18,
        operationalScore: 82,
        confidence: 0.74,
        localizedContent: emptyLocalizedContent,
      },
      evaluation,
    );

    expect(result.operationalScore).toBe(82);
    expect(result.confidence).toBe(0.74);
    expect(result.localizedContent[DEFAULT_LOCALE].summary).toContain(
      "deterministic checks",
    );
    expect(result.localizedContent.pl.reasons.length).toBeGreaterThan(0);
    expect(result.localizedContent.en.reasons.length).toBeGreaterThan(0);
  });

  it("uses a valid locale as fallback for invalid locale entries", () => {
    const evaluation = evaluateOrderRiskDeterministically(createSnapshot());

    const result = normalizeOrderRiskAiResult(
      {
        fraudScore: 12,
        operationalScore: 20,
        localizedContent: {
          pl: {},
          en: {
            summary: "Review the pickup payment context.",
            reasons: ["Payment on pickup needs operator review."],
          },
        },
      },
      evaluation,
    );

    expect(result.localizedContent.en.summary).toBe(
      "Review the pickup payment context.",
    );
    expect(result.localizedContent.pl.summary).toBe(
      "Review the pickup payment context.",
    );
    expect(result.localizedContent.uk.reasons).toEqual([
      "Payment on pickup needs operator review.",
    ]);
  });
});

describe("buildOrderRiskPrompt", () => {
  it("includes major-unit pricing context for the LLM", () => {
    const evaluation = evaluateOrderRiskDeterministically(
      createSnapshot({ totalPrice: 13800 }),
    );

    const prompt = buildOrderRiskPrompt(evaluation);

    expect(prompt).toContain('"totalPrice": 13800');
    expect(prompt).toContain('"totalPriceMajor": 138');
    expect(prompt).toContain('"amountUnit": "minor"');
    expect(prompt).toContain('"outputLocales": [');
    expect(prompt).toContain('"pl"');
    expect(prompt).toContain('"en"');
  });
});
