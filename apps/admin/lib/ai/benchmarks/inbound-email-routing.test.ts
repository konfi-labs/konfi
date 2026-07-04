import { describe, expect, it } from "vitest";
import type { FormattedOrderItem, NestedCustomer } from "@konfi/types";
import type {
  InboundMissingInformationLabels,
  InboundRoutingRationaleMessages,
} from "@/lib/ai/inbound-email/routing";
import type { InboundEmailRecord } from "@/lib/ai/inbound-email/types";
import {
  buildInboundEmailRoutingBenchmarkContext,
  buildInboundEmailRoutingBenchmarkRequestText,
  runInboundEmailRoutingBenchmark,
  selectInboundEmailRoutingBenchmarkSender,
  summarizeInboundEmailRoutingLiveRun,
} from "./inbound-email-routing";

const missingInformationLabels: InboundMissingInformationLabels = {
  billingAddress: "billing address",
  catalogProductMatch: "catalog product match",
  paymentMethod: "payment method",
  productRequest: "product request",
  shippingAddress: "shipping address",
  shippingDestination: "delivery destination",
  shippingMethod: "delivery or pickup method",
};

const rationaleMessages: InboundRoutingRationaleMessages = {
  adminForwarderManualCustomer:
    "Known admin forwarder was trusted, but the customer must be selected manually.",
  exactExplicit:
    "Exact sender identity and all required order fields were explicit.",
  exactExplicitPersonalPickup:
    "Exact sender identity matched and all required order fields were explicit; personal pickup does not require a shipping address.",
  exactResolved:
    "Exact sender identity matched and required order fields were explicit or resolved from recent order history.",
  exactResolvedPersonalPickup:
    "Exact sender identity matched and required order fields were explicit or resolved from recent order history; personal pickup does not require a shipping address.",
  missingOrderFields:
    "Exact sender identity matched, but one or more order-required fields were missing.",
  noCatalogItem: "No catalog items could be matched for the product request.",
  noProductRequest: "The email does not contain an explicit product request.",
  senderAuthenticationFailed:
    "Sender authentication did not pass trusted checks.",
  senderIdentityBlocked: (reason) => `Sender identity was blocked: ${reason}.`,
};

function collectUndefinedPaths(
  value: unknown,
  path = "$",
  paths: string[] = [],
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectUndefinedPaths(entry, `${path}.${index}`, paths);
    });

    return paths;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        paths.push(`${path}.${key}`);
      } else {
        collectUndefinedPaths(entry, `${path}.${key}`, paths);
      }
    }
  }

  return paths;
}

describe("runInboundEmailRoutingBenchmark", () => {
  it("passes every deterministic routing fixture with outcome coverage", () => {
    const summary = runInboundEmailRoutingBenchmark(
      missingInformationLabels,
      rationaleMessages,
    );
    const actualOutcomes = new Set(
      summary.fixtures.map((fixture) => fixture.actualOutcome),
    );

    expect(summary.score).toBe(summary.maxScore);
    expect(summary.percentage).toBe(100);
    expect(summary.fixtures.every((fixture) => fixture.passed)).toBe(true);
    expect(actualOutcomes).toEqual(new Set(["blocked", "order", "quote"]));
  });

  it("does not emit undefined values for Firestore persistence", () => {
    const summary = runInboundEmailRoutingBenchmark(
      missingInformationLabels,
      rationaleMessages,
    );

    expect(collectUndefinedPaths(summary)).toEqual([]);
  });
});

describe("selectInboundEmailRoutingBenchmarkSender", () => {
  it("skips duplicate sender emails that production routing would block", () => {
    const duplicateCustomer = {
      contacts: [
        {
          email: "shared@example.com",
          name: "Shared Contact",
        },
      ],
      email: "first@example.com",
      id: "customer-1",
      name: "First Customer",
    } as unknown as NestedCustomer;
    const duplicateContactCustomer = {
      contacts: [
        {
          email: "shared@example.com",
          name: "Shared Contact",
        },
      ],
      email: "second@example.com",
      id: "customer-2",
      name: "Second Customer",
    } as unknown as NestedCustomer;
    const exactCustomer = {
      contacts: [
        {
          email: "unique@example.com",
          name: "Unique Contact",
        },
      ],
      email: "third@example.com",
      id: "customer-3",
      name: "Third Customer",
    } as unknown as NestedCustomer;

    const sender = selectInboundEmailRoutingBenchmarkSender([
      duplicateCustomer,
      duplicateContactCustomer,
      exactCustomer,
    ]);

    expect(sender).toEqual({
      email: "first@example.com",
      name: "First Customer",
    });
  });
});

describe("buildInboundEmailRoutingBenchmarkContext", () => {
  it("creates deterministic guardrail context while leaving extraction to AI", () => {
    const context = buildInboundEmailRoutingBenchmarkContext({
      channelId: "channel-1",
    });

    expect(context).toMatchObject({
      senderMatch: {
        status: "exact",
      },
    });
    expect(context.senderMatch.status).toBe("exact");
    if (context.senderMatch.status === "exact") {
      expect(context.senderMatch.candidate.contact.email).toContain("@");
      expect(context.senderMatch.candidate.customer.id).toBeTruthy();
    }
    expect(context.items).toHaveLength(1);
    expect(context.items[0]?.product.channelId).toBe("channel-1");
    expect(collectUndefinedPaths(context)).toEqual([]);
  });
});

describe("buildInboundEmailRoutingBenchmarkRequestText", () => {
  it("includes the same concrete product specs that the benchmark context injects", () => {
    const context = buildInboundEmailRoutingBenchmarkContext({
      channelId: "channel-1",
    });

    const text = buildInboundEmailRoutingBenchmarkRequestText({
      item: context.items[0],
    });

    expect(text).toContain("500 A5 flyers, 250 gsm, full color");
    expect(text).toContain("DPD courier");
    expect(text).toContain("bank transfer");
    expect(text).not.toContain("100 Flyers");
  });
});

describe("summarizeInboundEmailRoutingLiveRun", () => {
  it("keeps the live inbound workflow decision with the fixture summary", () => {
    const item = {
      description: "500 business cards",
      product: {
        name: "Business cards",
      },
      quantity: 500,
    } as unknown as FormattedOrderItem;
    const customer = {
      id: "customer-1",
      name: "Example Sp. z o.o.",
    } as unknown as NestedCustomer;
    const record: InboundEmailRecord = {
      adminRecipientEmail: "orders@example.com",
      adminResponse: {
        body: "Response body",
        subject: "Order confirmation",
        to: "orders@example.com",
      },
      attachments: [],
      bcc: [],
      cc: [],
      channelId: "channel-1",
      createdBy: {
        id: "member-1",
        name: "Example Admin",
      } as InboundEmailRecord["createdBy"],
      eventCreatedAt: "2026-05-05T20:29:17.000Z",
      from: "Buyer <buyer@example.com>",
      headers: {},
      html: null,
      id: "benchmark-run-1",
      messageId: "<benchmark-run-1@example.com>",
      resendEmailId: "email-1",
      routingDecision: {
        customer,
        items: [item],
        missingInformation: [],
        model: null,
        outcome: "order",
        rationale: "Trusted customer provided complete order details.",
        senderAuthentication: {
          dkim: "pass",
          dmarc: "pass",
          reasons: [],
          spf: "pass",
          verdict: "trusted",
        },
      },
      runId: "wrun_1",
      status: "awaiting-manual-create",
      subject: "Business cards",
      text: "Please prepare 500 business cards.",
      to: ["orders@example.com"],
    };

    const summary = summarizeInboundEmailRoutingLiveRun(record);

    expect(summary).toMatchObject({
      blockReason: null,
      customerName: "Example Sp. z o.o.",
      inboundEmailId: "benchmark-run-1",
      itemCount: 1,
      outcome: "order",
      productNames: ["Business cards"],
      responseSubject: "Order confirmation",
      status: "awaiting-manual-create",
    });
    expect(collectUndefinedPaths(summary)).toEqual([]);
  });
});
