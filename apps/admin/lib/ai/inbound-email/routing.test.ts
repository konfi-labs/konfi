import { describe, expect, it } from "vitest";
import {
  AddressTypeEnum,
  PaymentType,
  ShippingOptions,
  type Contact,
  type FormattedOrderItem,
  type NestedCustomer,
} from "@konfi/types";
import {
  buildInboundRoutingPrompt,
  decideInboundEmailRouting,
  type InboundMissingInformationLabels,
  type InboundRoutingRationaleMessages,
} from "./routing";
import type { InboundEmailRecord } from "./types";
import type { SenderAuthentication } from "./sender-auth";
import type { InboundRoutingModelOutput, SenderMatchResult } from "./types";

const trustedSenderAuthentication: SenderAuthentication = {
  dkim: "pass",
  dmarc: "pass",
  reasons: [],
  spf: "pass",
  verdict: "trusted",
};

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

const contact: Contact = {
  active: true,
  email: "buyer@example.com",
  name: "Buyer Example",
  phone: "",
};

const customer = {
  contacts: [contact],
  email: "buyer@example.com",
  id: "customer-1",
  name: "Example Print",
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

const item = {
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
  totalPrice: 12000,
} as unknown as FormattedOrderItem;

const completeModel: InboundRoutingModelOutput = {
  billingAddress: null,
  deadlineString: "2026-05-15",
  invoiceRequested: false,
  missingInformation: [],
  paymentType: PaymentType.BANK_TRANSFER,
  productRequest: "500 flyers",
  rationale: "Customer provided order details.",
  requiredOrderFields: {
    itemsExplicit: true,
    paymentExplicit: true,
    shippingDestinationExplicit: true,
    shippingMethodExplicit: true,
  },
  responseDraft: {
    body: "Draft response.",
    subject: "Draft",
  },
  shippingAddress: {
    active: true,
    city: "Example City",
    country: "Example Country",
    name: "Example Print",
    number: "10",
    street: "Example Street",
    type: AddressTypeEnum.SHIPPING,
    zip: "00-000",
  },
  shippingOption: ShippingOptions.DPD,
  specialNotes: "",
};

describe("decideInboundEmailRouting", () => {
  it("creates an order only with exact identity and all explicit order fields", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: completeModel,
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("order");
    expect(decision.missingInformation).toEqual([]);
  });

  it("creates a quote when payment is missing", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        missingInformation: [missingInformationLabels.paymentMethod],
        paymentType: null,
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          paymentExplicit: false,
        },
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("quote");
    expect(decision.missingInformation).toContain(
      missingInformationLabels.paymentMethod,
    );
  });

  it("derives missing payment details when the model omits them", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        paymentType: null,
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          paymentExplicit: false,
        },
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("quote");
    expect(decision.missingInformation).toContain(
      missingInformationLabels.paymentMethod,
    );
  });

  it("keeps non-explicit payment and shipping unresolved without recent order context", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        missingInformation: [
          missingInformationLabels.paymentMethod,
          missingInformationLabels.shippingMethod,
        ],
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          paymentExplicit: false,
          shippingMethodExplicit: false,
        },
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("quote");
    expect(decision.missingInformation).toEqual(
      expect.arrayContaining([
        missingInformationLabels.paymentMethod,
        missingInformationLabels.shippingMethod,
      ]),
    );
  });

  it("allows payment and shipping resolved from recent order context", () => {
    const decision = decideInboundEmailRouting({
      allowRecentOrderResolvedFields: true,
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          paymentExplicit: false,
          shippingMethodExplicit: false,
        },
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("order");
    expect(decision.missingInformation).toEqual([]);
    expect(decision.rationale).toContain("recent order history");
  });

  it("creates a quote when shipping destination is missing", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        missingInformation: [
          missingInformationLabels.shippingDestination,
          missingInformationLabels.shippingAddress,
        ],
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          shippingDestinationExplicit: false,
        },
        shippingAddress: null,
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("quote");
    expect(decision.missingInformation).toEqual(
      expect.arrayContaining([
        missingInformationLabels.shippingDestination,
        missingInformationLabels.shippingAddress,
      ]),
    );
  });

  it("does not require a shipping address for personal pickup", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: {
        ...completeModel,
        requiredOrderFields: {
          ...completeModel.requiredOrderFields,
          shippingDestinationExplicit: false,
        },
        shippingAddress: null,
        shippingOption: ShippingOptions.PERSONAL_COLLECTION,
      },
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: exactSenderMatch,
    });

    expect(decision.outcome).toBe("order");
    expect(decision.missingInformation).not.toContain(
      missingInformationLabels.shippingAddress,
    );
  });

  it("blocks untrusted senders before order or quote creation", () => {
    const decision = decideInboundEmailRouting({
      items: [item],
      missingInformationLabels,
      model: completeModel,
      rationaleMessages,
      senderAuthentication: {
        dkim: "none",
        dmarc: "none",
        reasons: ["No sender authentication headers were present."],
        spf: "none",
        verdict: "untrusted",
      },
      senderMatch: exactSenderMatch,
    });

    expect(decision).toMatchObject({
      blockReason: "untrusted-sender",
      outcome: "blocked",
    });
  });

  it("creates a quote for a trusted admin forwarder when the customer must be selected manually", () => {
    const decision = decideInboundEmailRouting({
      allowAdminForwarderWithoutCustomer: true,
      items: [item],
      missingInformationLabels,
      model: completeModel,
      rationaleMessages,
      senderAuthentication: trustedSenderAuthentication,
      senderMatch: unknownSenderMatch,
    });

    expect(decision.outcome).toBe("quote");
    expect(decision.contact).toBeUndefined();
    expect(decision.customer).toBeUndefined();
    expect(decision.missingInformation).toEqual([]);
    expect(decision.rationale).toContain("customer must be selected manually");
  });
});

describe("buildInboundRoutingPrompt", () => {
  it("tells the model that street, zip, and city are a complete shipping destination", () => {
    const record: InboundEmailRecord = {
      adminRecipientEmail: "admin@example.com",
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
      id: "email-1",
      messageId: "<email-1@example.com>",
      resendEmailId: "email-1",
      status: "received",
      subject: "Flyers",
      text: "Delivery to Example Street 10, 00-000 Example City by DPD courier.",
      to: ["Konfi inbound <admin@example.com>"],
    };

    const prompt = buildInboundRoutingPrompt(record);

    expect(prompt).toContain("street with building number");
    expect(prompt).toContain("postal code, and city");
    expect(prompt).toContain(
      "shippingAddress.street='Example Street', number='10', zip='00-000', city='Example City'",
    );
    expect(prompt).toContain("billingAddress=null");
    expect(prompt).toContain(
      "Write rationale, missingInformation, responseDraft.subject, and responseDraft.body in Polish",
    );
    expect(prompt).toContain(
      "missingInformation must list every missing or unsafe order detail in Polish",
    );
    expect(prompt).toContain(
      "Do not set them to true for values inferred from recent customer orders",
    );
    expect(prompt).toContain(
      "responseDraft.body must first state the quote or quote scope",
    );
    expect(prompt).toContain(
      "Do not use phrases like 'Abyśmy mogli przejść do realizacji zamówienia'",
    );
    expect(prompt).toContain("Abyśmy mogli przejść do finalizacji");
    expect(prompt).toContain(
      "courier delivery, parcel locker/pickup point, or personal pickup",
    );
  });

  it("includes recent customer orders when provided", () => {
    const record: InboundEmailRecord = {
      adminRecipientEmail: "admin@example.com",
      attachments: [],
      bcc: [],
      cc: [],
      channelId: "channel-1",
      createdBy: {
        id: "member-1",
        name: "Dawid Sobolewski",
      } as InboundEmailRecord["createdBy"],
      eventCreatedAt: "2026-05-05T20:29:17.000Z",
      from: "Buyer <buyer@example.com>",
      headers: {},
      html: null,
      id: "email-1",
      messageId: "<email-1@example.com>",
      resendEmailId: "email-1",
      status: "received",
      subject: "Flyers",
      text: "Please prepare 500 A5 flyers.",
      to: ["Konfi inbound <admin@example.com>"],
    };
    const prompt = buildInboundRoutingPrompt(record, {
      previousModelOutput: completeModel,
      recentCustomerOrders: [
        {
          createdAt: "2026-05-01T10:00:00.000Z",
          id: "order-1",
          number: 123,
          paymentType: PaymentType.BANK_TRANSFER,
          shippingAddress: null,
          shippingOption: ShippingOptions.PERSONAL_COLLECTION,
        },
      ],
    });

    expect(prompt).toContain("Recent customer orders (newest first):");
    expect(prompt).toContain("PERSONAL_COLLECTION");
    expect(prompt).toContain("Previous extraction before recent-order lookup");
    expect(prompt).toContain("keep requiredOrderFields.*Explicit false");
  });
});
