import {
  AddressTypeEnum,
  PaymentType,
  ShippingOptions,
  Unit,
  type Contact,
  type FormattedOrderItem,
  type NestedCustomer,
} from "@konfi/types";
import {
  decideInboundEmailRouting,
  type InboundMissingInformationLabels,
  type InboundRoutingRationaleMessages,
} from "@/lib/ai/inbound-email/routing";
import type { SenderAuthentication } from "@/lib/ai/inbound-email/sender-auth";
import type {
  InboundEmailBenchmarkRoutingContext,
  InboundEmailBlockReason,
  InboundEmailRecord,
  InboundRoutingModelOutput,
  SenderMatchResult,
} from "@/lib/ai/inbound-email/types";
import type {
  AiBenchmarkInboundEmailRoutingFixtureResult,
  AiBenchmarkInboundEmailRoutingLiveSummary,
  AiBenchmarkInboundEmailRoutingSummary,
} from "./types";

interface InboundEmailRoutingFixture {
  expectedBlockReason?: InboundEmailBlockReason;
  expectedMissingInformation?: (
    labels: InboundMissingInformationLabels,
  ) => string[];
  expectedOutcome: "blocked" | "order" | "quote";
  id: string;
  items?: FormattedOrderItem[];
  model?: InboundRoutingModelOutput;
  name: string;
  senderAuthentication?: SenderAuthentication;
  senderMatch?: SenderMatchResult;
}

export interface InboundEmailRoutingBenchmarkSender {
  email: string;
  name: string;
}

const trustedSenderAuthentication: SenderAuthentication = {
  dkim: "pass",
  dmarc: "pass",
  reasons: [],
  spf: "pass",
  verdict: "trusted",
};

const untrustedSenderAuthentication: SenderAuthentication = {
  dkim: "none",
  dmarc: "none",
  reasons: ["No sender authentication headers were present."],
  spf: "none",
  verdict: "untrusted",
};

const contact: Contact = {
  active: true,
  email: "buyer@example.com",
  name: "Buyer Example",
  phone: "+48123123123",
};

const customer = {
  active: true,
  billingAddresses: [],
  contacts: [contact],
  email: "buyer@example.com",
  id: "customer-1",
  name: "Example Sp. z o.o.",
  nip: "0000000000",
  personName: "Buyer Example",
  shippingAddresses: [],
} as unknown as NestedCustomer;

const exactSenderMatch: SenderMatchResult = {
  candidate: {
    contact,
    customer,
    matchField: "contact-email",
  },
  candidates: [
    {
      contact,
      customer,
      matchField: "contact-email",
    },
  ],
  status: "exact",
};

const unknownSenderMatch: SenderMatchResult = {
  candidates: [],
  reason: "unknown-sender",
  status: "blocked",
};

const catalogItem = {
  customFormat: false,
  customPrice: null,
  discount: {
    type: "AMOUNT",
    value: 0,
  },
  description: "A5 flyers, 250 gsm, full color",
  product: {
    channelId: "channel-1",
    id: "product-1",
    name: "Flyers",
    spec: {
      images: [],
    },
  },
  productName: "Flyers",
  quantity: 500,
  totalPrice: 15000,
  unit: Unit.PCS,
} as unknown as FormattedOrderItem;

export const inboundEmailRoutingBenchmarkExpectation = {
  expectedBlockReason: null,
  expectedCustomerName: "Example Sp. z o.o.",
  expectedMissingInformation: [],
  expectedOutcome: "order",
  expectedPaymentType: PaymentType.BANK_TRANSFER,
  expectedProductDescription: "A5 flyers, 250 gsm, full color",
  expectedProductName: "Flyers",
  expectedQuantity: 500,
  expectedShippingOption: ShippingOptions.DPD,
  expectedStatus: "awaiting-manual-create",
} as const;

const shippingAddress = {
  active: true,
  city: "Example City",
  country: "Polska",
  name: "Example Sp. z o.o.",
  number: "10",
  street: "Example Street",
  type: AddressTypeEnum.SHIPPING,
  zip: "00-001",
};

const completeModel: InboundRoutingModelOutput = {
  billingAddress: null,
  deadlineString: "2026-05-15",
  invoiceRequested: false,
  missingInformation: [],
  paymentType: PaymentType.BANK_TRANSFER,
  productRequest: "500 A5 flyers",
  rationale: "Customer provided a specific flyer order.",
  requiredOrderFields: {
    itemsExplicit: true,
    paymentExplicit: true,
    shippingDestinationExplicit: true,
    shippingMethodExplicit: true,
  },
  responseDraft: {
    body: "Draft response for admin review.",
    subject: "Order confirmation",
  },
  shippingAddress,
  shippingOption: ShippingOptions.DPD,
  specialNotes: "",
};

const fixtures: InboundEmailRoutingFixture[] = [
  {
    expectedOutcome: "order",
    id: "complete-order",
    name: "Exact trusted sender with all order fields",
  },
  {
    expectedMissingInformation: (labels) => [labels.paymentMethod],
    expectedOutcome: "quote",
    id: "missing-payment",
    model: {
      ...completeModel,
      paymentType: null,
      requiredOrderFields: {
        ...completeModel.requiredOrderFields,
        paymentExplicit: false,
      },
    },
    name: "Missing payment stays quote",
  },
  {
    expectedMissingInformation: (labels) => [
      labels.shippingDestination,
      labels.shippingAddress,
    ],
    expectedOutcome: "quote",
    id: "missing-shipping-destination",
    model: {
      ...completeModel,
      requiredOrderFields: {
        ...completeModel.requiredOrderFields,
        shippingDestinationExplicit: false,
      },
      shippingAddress: null,
    },
    name: "Missing shipping destination stays quote",
  },
  {
    expectedBlockReason: "untrusted-sender",
    expectedMissingInformation: () => [
      "No sender authentication headers were present.",
    ],
    expectedOutcome: "blocked",
    id: "untrusted-sender",
    name: "Untrusted sender is blocked",
    senderAuthentication: untrustedSenderAuthentication,
  },
  {
    expectedBlockReason: "unknown-sender",
    expectedOutcome: "blocked",
    id: "unknown-sender",
    name: "Unknown sender is blocked",
    senderMatch: unknownSenderMatch,
  },
  {
    expectedBlockReason: "model-unclear",
    expectedMissingInformation: (labels) => [labels.catalogProductMatch],
    expectedOutcome: "blocked",
    id: "no-catalog-item",
    items: [],
    name: "Unmatched catalog item is blocked",
  },
];

function containsAll(
  actual: readonly string[],
  expected: readonly string[] | undefined,
) {
  if (!expected?.length) {
    return true;
  }

  const actualValues = new Set(actual);
  return expected.every((value) => actualValues.has(value));
}

function normalizeBenchmarkEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function countExactSenderMatches(
  customers: readonly NestedCustomer[],
  email: string,
) {
  const normalizedEmail = normalizeBenchmarkEmail(email);
  let count = 0;

  for (const customerRecord of customers) {
    for (const contactRecord of customerRecord.contacts ?? []) {
      if (normalizeBenchmarkEmail(contactRecord.email) === normalizedEmail) {
        count += 1;
      }
    }

    if (normalizeBenchmarkEmail(customerRecord.email) === normalizedEmail) {
      count += 1;
    }
  }

  return count;
}

function isUsableBenchmarkEmail(value: string | null | undefined) {
  return normalizeBenchmarkEmail(value).includes("@");
}

export function selectInboundEmailRoutingBenchmarkSender(
  customers: readonly NestedCustomer[],
): InboundEmailRoutingBenchmarkSender | null {
  for (const customerRecord of customers) {
    for (const contactRecord of customerRecord.contacts ?? []) {
      const email = normalizeBenchmarkEmail(contactRecord.email);

      if (
        isUsableBenchmarkEmail(email) &&
        countExactSenderMatches(customers, email) === 1
      ) {
        return {
          email,
          name:
            contactRecord.name ||
            customerRecord.personName ||
            customerRecord.name ||
            "",
        };
      }
    }

    const customerEmail = normalizeBenchmarkEmail(customerRecord.email);

    if (
      isUsableBenchmarkEmail(customerEmail) &&
      countExactSenderMatches(customers, customerEmail) === 1
    ) {
      return {
        email: customerEmail,
        name: customerRecord.personName || customerRecord.name || "",
      };
    }
  }

  return null;
}

function scoreFixture(
  fixture: InboundEmailRoutingFixture,
  missingInformationLabels: InboundMissingInformationLabels,
  rationaleMessages: InboundRoutingRationaleMessages,
): AiBenchmarkInboundEmailRoutingFixtureResult {
  const decision = decideInboundEmailRouting({
    items: fixture.items ?? [catalogItem],
    missingInformationLabels,
    model: fixture.model ?? completeModel,
    rationaleMessages,
    senderAuthentication:
      fixture.senderAuthentication ?? trustedSenderAuthentication,
    senderMatch: fixture.senderMatch ?? exactSenderMatch,
  });
  const expectedMissingInformation =
    fixture.expectedMissingInformation?.(missingInformationLabels) ?? [];
  const outcomeMatches = decision.outcome === fixture.expectedOutcome;
  const blockReasonMatches =
    !fixture.expectedBlockReason ||
    decision.blockReason === fixture.expectedBlockReason;
  const missingInformationMatches = containsAll(
    decision.missingInformation,
    expectedMissingInformation,
  );
  const score =
    Number(outcomeMatches) +
    Number(blockReasonMatches) +
    Number(missingInformationMatches);

  return {
    actualBlockReason: decision.blockReason ?? null,
    actualMissingInformation: decision.missingInformation,
    actualOutcome: decision.outcome,
    expectedBlockReason: fixture.expectedBlockReason ?? null,
    expectedMissingInformation,
    expectedOutcome: fixture.expectedOutcome,
    id: fixture.id,
    name: fixture.name,
    passed: score === 3,
    score,
  };
}

function getInboundItemProductName(item: FormattedOrderItem) {
  return item.product?.name || item.description || "";
}

export function summarizeInboundEmailRoutingLiveRun(
  record: InboundEmailRecord,
): AiBenchmarkInboundEmailRoutingLiveSummary {
  const decision = record.routingDecision ?? null;
  const productNames = decision
    ? decision.items.map(getInboundItemProductName).filter(Boolean)
    : [];

  return {
    adminRecipientEmail: record.adminRecipientEmail,
    blockReason: decision?.blockReason ?? null,
    customerName: decision?.customer?.name ?? null,
    from: record.from,
    inboundEmailId: record.id,
    itemCount: decision?.items.length ?? 0,
    missingInformation: decision?.missingInformation ?? [],
    outcome: decision?.outcome ?? null,
    productNames,
    responseSubject: record.adminResponse?.subject ?? null,
    routingRationale: decision?.rationale ?? null,
    status: record.status,
    subject: record.subject,
  };
}

export function buildInboundEmailRoutingBenchmarkContext({
  channelId,
}: {
  channelId: string;
}): InboundEmailBenchmarkRoutingContext {
  return {
    items: [
      {
        ...catalogItem,
        product: {
          ...catalogItem.product,
          channelId,
        },
      },
    ],
    senderMatch: exactSenderMatch,
  };
}

export function buildInboundEmailRoutingBenchmarkRequestText({
  item,
}: {
  item?: FormattedOrderItem;
}) {
  const productRequest =
    item?.description.trim() ||
    item?.product?.name ||
    inboundEmailRoutingBenchmarkExpectation.expectedProductDescription;
  const quantity =
    item?.quantity ?? inboundEmailRoutingBenchmarkExpectation.expectedQuantity;

  return [
    `Please prepare ${quantity} ${productRequest}.`,
    "Delivery to Example Street 10, 00-000 Example City by DPD courier.",
    "Payment by bank transfer. Please prepare this for review.",
  ].join("\n");
}

export function runInboundEmailRoutingBenchmark(
  missingInformationLabels: InboundMissingInformationLabels,
  rationaleMessages: InboundRoutingRationaleMessages,
): AiBenchmarkInboundEmailRoutingSummary {
  const results = fixtures.map((fixture) =>
    scoreFixture(fixture, missingInformationLabels, rationaleMessages),
  );
  const score = results.reduce((total, result) => total + result.score, 0);
  const maxScore = results.length * 3;

  return {
    fixtures: results,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    score,
  };
}
