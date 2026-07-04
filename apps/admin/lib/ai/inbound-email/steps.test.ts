vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { CurrencyEnum, Discount, Locale, Unit } from "@konfi/types";
import type { TFunction } from "i18next";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type { InboundRoutingDecision } from "./types";
import {
  buildInboundCustomerDraft,
  buildInboundPricedCustomerDraft,
} from "./customer-draft";

const translations: Record<string, string> = {
  "agents.inboundEmail.customerDraft.itemLine":
    "- {{name}}, nakład {{amount}}: {{price}}",
  "agents.inboundEmail.customerDraft.itemsSubtotal": "Suma pozycji: {{price}}",
  "agents.inboundEmail.customerDraft.missingDetails":
    "Do finalizacji potrzebujemy jeszcze: {{details}}.",
  "agents.inboundEmail.customerDraft.pricedQuoteIntro":
    "Dzień dobry, przygotowana wycena:",
  "agents.inboundEmail.customerDraft.readyForReview":
    "Jeśli wszystko się zgadza, możemy przejść dalej.",
  "agents.inboundEmail.customerDraft.shipping": "Dostawa: {{price}}",
  "agents.inboundEmail.customerDraft.total": "Razem: {{price}}",
};

const t = ((key: string, options?: Record<string, unknown>) => {
  const template = translations[key] ?? String(options?.defaultValue ?? key);

  return template.replace(/\{\{(\w+)\}\}/gu, (_, token: string) =>
    String(options?.[token] ?? ""),
  );
}) as unknown as TFunction;

const decision: InboundRoutingDecision = {
  items: [],
  missingInformation: ["metoda dostawy lub odbioru", "sposób płatności"],
  model: null,
  outcome: "quote",
  rationale: "Quote can be prepared.",
  senderAuthentication: {
    dkim: "pass",
    dmarc: "pass",
    reasons: [],
    spf: "pass",
    verdict: "trusted",
  },
};

const decisionWithAiDraft: InboundRoutingDecision = {
  ...decision,
  model: {
    billingAddress: null,
    deadlineString: null,
    invoiceRequested: false,
    missingInformation: decision.missingInformation,
    paymentType: null,
    productRequest: "wizytówki 250 szt. i ulotki A5 500 szt.",
    rationale: "Quote can be prepared from recognized products.",
    requiredOrderFields: {
      itemsExplicit: true,
      paymentExplicit: false,
      shippingDestinationExplicit: false,
      shippingMethodExplicit: false,
    },
    responseDraft: {
      body: "Dzień dobry, możemy przygotować wizytówki i ulotki A5. Proszę jeszcze o metodę dostawy i płatność.",
      subject: "Wycena wizytówek i ulotek",
    },
    shippingAddress: null,
    shippingOption: null,
    specialNotes: "",
  },
};

const collectedData: QuoteAgentData = {
  items: [
    {
      customFormat: false,
      customPrice: null,
      description: "250 szt. wizytówek",
      discount: new Discount().object,
      id: "item-1",
      productId: "business-cards",
      productName: "Wizytówki",
      quantity: 1,
      totalPrice: 12300,
      unit: Unit.PCS,
      volume: 250,
    },
    {
      customFormat: false,
      customPrice: null,
      description: "500 szt. ulotek A5",
      discount: new Discount().object,
      id: "item-2",
      productId: "flyers-a5",
      productName: "Ulotki A5",
      quantity: 1,
      totalPrice: 45600,
      unit: Unit.PCS,
      volume: 500,
    },
  ],
  shippingPrice: 0,
  totalPrice: 57900,
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, " ");

describe("buildInboundPricedCustomerDraft", () => {
  it("uses collected priced items instead of a generic future quote response", () => {
    const draft = buildInboundPricedCustomerDraft({
      collectedData,
      currency: CurrencyEnum.PLN,
      decision,
      locale: Locale.pl,
      t,
    });
    const normalizedDraft = normalizeWhitespace(draft ?? "");

    expect(normalizedDraft).toContain("Dzień dobry, przygotowana wycena:");
    expect(normalizedDraft).toContain("Wizytówki");
    expect(normalizedDraft).toContain("Wizytówki, nakład 250");
    expect(normalizedDraft).not.toContain("Wizytówki, nakład 1");
    expect(normalizedDraft).toContain("123,00 zł");
    expect(normalizedDraft).toContain("Ulotki A5");
    expect(normalizedDraft).toContain("Ulotki A5, nakład 500");
    expect(normalizedDraft).not.toContain("Ulotki A5, nakład 1");
    expect(normalizedDraft).toContain("456,00 zł");
    expect(normalizedDraft).toContain("579,00 zł");
    expect(normalizedDraft).toContain("metoda dostawy lub odbioru");
    expect(normalizedDraft).not.toContain("przygotujemy dla Pana wycenę");
    expect(normalizedDraft).not.toContain("Abyśmy mogli");
  });

  it("falls back when the task has no priced items", () => {
    expect(
      buildInboundPricedCustomerDraft({
        collectedData: {
          items: [],
        },
        decision,
        t,
      }),
    ).toBeNull();
  });

  it("falls back to quantity when volume is not available", () => {
    const draft = buildInboundPricedCustomerDraft({
      collectedData: {
        items: [
          {
            customFormat: false,
            customPrice: null,
            description: "75 plakatów",
            discount: new Discount().object,
            id: "item-1",
            productId: "posters",
            productName: "Plakaty",
            quantity: 75,
            totalPrice: 21000,
            unit: Unit.PCS,
          },
        ],
      },
      decision,
      locale: Locale.pl,
      t,
    });
    const normalizedDraft = normalizeWhitespace(draft ?? "");

    expect(normalizedDraft).toContain("Plakaty, nakład 75");
  });

  it("keeps subtotal consistent with rendered priced lines", () => {
    const dataWithoutTotal: QuoteAgentData = {
      items: collectedData.items,
      shippingPrice: collectedData.shippingPrice,
    };
    const draft = buildInboundPricedCustomerDraft({
      collectedData: {
        ...dataWithoutTotal,
        items: [
          ...(collectedData.items ?? []),
          {
            customFormat: false,
            customPrice: null,
            description: "Unpriced add-on",
            discount: new Discount().object,
            id: "item-3",
            productId: "addon",
            productName: "Unpriced add-on",
            quantity: 1,
            totalPrice: 0,
            unit: Unit.PCS,
          },
        ],
      },
      decision,
      locale: Locale.pl,
      t,
    });
    const normalizedDraft = normalizeWhitespace(draft ?? "");

    expect(normalizedDraft).not.toContain("Unpriced add-on");
    expect(normalizedDraft).toContain("Suma pozycji: 579,00 zł");
  });
});

describe("buildInboundCustomerDraft", () => {
  it("prefers the AI-generated draft over the priced structured fallback", () => {
    const draft = buildInboundCustomerDraft({
      collectedData,
      decision: decisionWithAiDraft,
      locale: Locale.pl,
      t,
    });

    expect(draft).toBe(
      "Dzień dobry, możemy przygotować wizytówki i ulotki A5. Proszę jeszcze o metodę dostawy i płatność.",
    );
    expect(draft).not.toContain("Suma pozycji");
    expect(draft).not.toContain("123,00 zł");
  });

  it("falls back to the priced draft when no AI draft is available", () => {
    const draft = buildInboundCustomerDraft({
      collectedData,
      decision,
      locale: Locale.pl,
      t,
    });
    const normalizedDraft = normalizeWhitespace(draft ?? "");

    expect(normalizedDraft).toContain("Dzień dobry, przygotowana wycena:");
    expect(normalizedDraft).toContain("Suma pozycji: 579,00 zł");
  });
});
