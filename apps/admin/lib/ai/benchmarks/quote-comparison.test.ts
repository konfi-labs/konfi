import { describe, expect, it } from "vitest";
import {
  compareOrderBenchmarkOutput,
  compareQuoteBenchmarkOutput,
  summarizeOrderForBenchmark,
} from "./quote-comparison";
import {
  CurrencyEnum,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  ShippingOptions,
  Unit,
  type Order,
  type Quote,
} from "@konfi/types";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";

const baseQuote: Quote = {
  active: true,
  appliedPromotionCodes: [],
  contact: {
    active: true,
    email: "buyer@example.com",
    name: "Buyer",
  },
  createdAt: new Date(),
  createdBy: { id: "admin", name: "Admin" },
  currency: CurrencyEnum.PLN,
  customer: {
    allowedBankPayments: false,
    allowedDefferedPayments: false,
    allowedOnPickupPayments: false,
    id: "customer-1",
    name: "Acme",
    specialNotes: "",
  },
  id: "quote-1",
  items: [
    {
      combination: "paper:mat",
      customFormat: false,
      customPrice: null,
      description: "Business cards",
      discount: { amount: 0, type: "PERCENTAGE" },
      id: "item-1",
      name: "Business cards",
      product: { id: "product-1", name: "Business cards" },
      quantity: 100,
      totalPrice: 120,
      unit: Unit.PIECES,
    },
  ],
  keywords: [],
  name: "Quote 1",
  number: 1,
  shippingOption: ShippingOptions.COURIER,
  shippingPrice: 20,
  specialNotes: "Deliver fast",
  totalPrice: 140,
  updatedAt: new Date(),
  updatedBy: { id: "admin", name: "Admin" },
};

describe("compareQuoteBenchmarkOutput", () => {
  it("scores a matching quote output as 100 percent", () => {
    const generatedData: QuoteAgentData = {
      contact: baseQuote.contact,
      customer: baseQuote.customer,
      items: [
        {
          calculatedCombination: "paper:mat",
          customFormat: false,
          customPrice: null,
          description: "Business cards",
          discount: { amount: 0, type: "PERCENTAGE" },
          id: "agent-item-1",
          productId: "product-1",
          productName: "Business cards",
          quantity: 100,
          totalPrice: 120,
          unit: Unit.PIECES,
        },
      ],
      shippingOption: ShippingOptions.COURIER,
      shippingPrice: 20,
      totalPrice: 140,
    };

    const comparison = compareQuoteBenchmarkOutput({
      expectedQuote: baseQuote,
      generatedData,
    });

    expect(comparison.percentage).toBe(100);
    expect(comparison.summary.mismatchedFields).toBe(0);
  });

  it("penalizes customer, price, and item mismatches", () => {
    const generatedData: QuoteAgentData = {
      contact: {
        active: true,
        email: "other@example.com",
        name: "Other",
      },
      customer: "Other customer",
      items: [],
      shippingOption: ShippingOptions.PICKUP,
      shippingPrice: 0,
      totalPrice: 10,
    };

    const comparison = compareQuoteBenchmarkOutput({
      expectedQuote: baseQuote,
      generatedData,
    });

    expect(comparison.percentage).toBeLessThan(50);
    expect(comparison.summary.mismatchedFields).toBeGreaterThan(0);
  });
});

describe("compareOrderBenchmarkOutput", () => {
  const baseOrder: Order = {
    ...baseQuote,
    anonymousPackageShipping: false,
    billing: null,
    carriedOutBy: [],
    complaints: [],
    deadline: new Date() as unknown as Order["deadline"],
    deadlineString: "2026-05-10",
    designatedPickupAreaId: undefined,
    difficulty: 1,
    exactTime: false,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    fulfilledItems: [],
    inProgressItems: [],
    invoice: false,
    isFromStore: false,
    isTest: false,
    messages: [],
    paymentStatus: PaymentStatus.NEW,
    paymentType: PaymentType.BANK_TRANSFER,
    priority: 1,
    priorityItems: [],
    shipping: null,
    shippingPriceDiscount: null,
    status: OrderStatus.NEW,
    totalPriceDiscount: null,
  };

  it("scores a matching order output as 100 percent", () => {
    const comparison = compareOrderBenchmarkOutput({
      expectedOrder: baseOrder,
      generatedData: {
        contact: baseOrder.contact,
        customer: baseOrder.customer,
        items: [
          {
            calculatedCombination: "paper:mat",
            customFormat: false,
            customPrice: null,
            description: "Business cards",
            discount: { amount: 0, type: "PERCENTAGE" },
            id: "agent-item-1",
            productId: "product-1",
            productName: "Business cards",
            quantity: 100,
            totalPrice: 120,
            unit: Unit.PIECES,
          },
        ],
        shippingOption: ShippingOptions.COURIER,
        shippingPrice: 20,
        totalPrice: 140,
      },
    });

    expect(comparison.percentage).toBe(100);
    expect(comparison.summary.mismatchedFields).toBe(0);
  });

  it("summarizes an order target", () => {
    expect(summarizeOrderForBenchmark(baseOrder)).toEqual({
      customerName: "Acme",
      id: "quote-1",
      itemsCount: 1,
      number: 1,
      totalPrice: 140,
    });
  });
});
