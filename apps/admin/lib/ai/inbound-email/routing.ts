import {
  AddressTypeEnum,
  ShippingOptions,
  type Address,
  type FormattedOrderItem,
} from "@konfi/types";
import { hasShippingDestination } from "@konfi/utils";
import { z } from "zod";
import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { agentPaymentTypeValues } from "@/lib/ai/durable-agents/constants";
import type { TFunction } from "i18next";
import type { SenderAuthentication } from "./sender-auth";
import type {
  InboundEmailRecord,
  InboundRecentCustomerOrder,
  InboundRoutingDecision,
  InboundRoutingModelOutput,
  SenderMatchResult,
} from "./types";

const shippingOptionValues = Object.values(ShippingOptions) as [
  ShippingOptions,
  ...ShippingOptions[],
];

export interface InboundMissingInformationLabels {
  billingAddress: string;
  catalogProductMatch: string;
  paymentMethod: string;
  productRequest: string;
  shippingAddress: string;
  shippingDestination: string;
  shippingMethod: string;
}

export interface InboundRoutingRationaleMessages {
  adminForwarderManualCustomer: string;
  exactExplicit: string;
  exactExplicitPersonalPickup: string;
  exactResolved: string;
  exactResolvedPersonalPickup: string;
  missingOrderFields: string;
  noCatalogItem: string;
  noProductRequest: string;
  senderAuthenticationFailed: string;
  senderIdentityBlocked: (reason: string) => string;
}

export function buildInboundMissingInformationLabels(
  t: TFunction,
): InboundMissingInformationLabels {
  return {
    billingAddress: t("agents.inboundEmail.missingInformation.billingAddress", {
      defaultValue: "billing address",
    }),
    catalogProductMatch: t(
      "agents.inboundEmail.missingInformation.catalogProductMatch",
      {
        defaultValue: "catalog product match",
      },
    ),
    paymentMethod: t("agents.inboundEmail.missingInformation.paymentMethod", {
      defaultValue: "payment method",
    }),
    productRequest: t("agents.inboundEmail.missingInformation.productRequest", {
      defaultValue: "product request",
    }),
    shippingAddress: t(
      "agents.inboundEmail.missingInformation.shippingAddress",
      {
        defaultValue: "shipping address",
      },
    ),
    shippingDestination: t(
      "agents.inboundEmail.missingInformation.shippingDestination",
      {
        defaultValue: "delivery destination",
      },
    ),
    shippingMethod: t("agents.inboundEmail.missingInformation.shippingMethod", {
      defaultValue: "delivery or pickup method",
    }),
  };
}

export function buildInboundRoutingRationaleMessages(
  t: TFunction,
): InboundRoutingRationaleMessages {
  return {
    adminForwarderManualCustomer: t(
      "agents.inboundEmail.routingRationale.adminForwarderManualCustomer",
      {
        defaultValue:
          "Known admin forwarder was trusted, but the customer must be selected manually.",
      },
    ),
    exactExplicit: t("agents.inboundEmail.routingRationale.exactExplicit", {
      defaultValue:
        "Exact sender identity and all required order fields were explicit.",
    }),
    exactExplicitPersonalPickup: t(
      "agents.inboundEmail.routingRationale.exactExplicitPersonalPickup",
      {
        defaultValue:
          "Exact sender identity matched and all required order fields were explicit; personal pickup does not require a shipping address.",
      },
    ),
    exactResolved: t("agents.inboundEmail.routingRationale.exactResolved", {
      defaultValue:
        "Exact sender identity matched and required order fields were explicit or resolved from recent order history.",
    }),
    exactResolvedPersonalPickup: t(
      "agents.inboundEmail.routingRationale.exactResolvedPersonalPickup",
      {
        defaultValue:
          "Exact sender identity matched and required order fields were explicit or resolved from recent order history; personal pickup does not require a shipping address.",
      },
    ),
    missingOrderFields: t(
      "agents.inboundEmail.routingRationale.missingOrderFields",
      {
        defaultValue:
          "Exact sender identity matched, but one or more order-required fields were missing.",
      },
    ),
    noCatalogItem: t("agents.inboundEmail.routingRationale.noCatalogItem", {
      defaultValue:
        "No catalog items could be matched for the product request.",
    }),
    noProductRequest: t(
      "agents.inboundEmail.routingRationale.noProductRequest",
      {
        defaultValue: "The email does not contain an explicit product request.",
      },
    ),
    senderAuthenticationFailed: t(
      "agents.inboundEmail.routingRationale.senderAuthenticationFailed",
      {
        defaultValue: "Sender authentication did not pass trusted checks.",
      },
    ),
    senderIdentityBlocked: (reason) =>
      t("agents.inboundEmail.routingRationale.senderIdentityBlocked", {
        defaultValue: "Sender identity was blocked: {{reason}}.",
        reason,
      }),
  };
}

const addressSchema = z.object({
  active: z.boolean().default(true),
  city: z.string().optional().describe("City, for example Example City."),
  companyName: z.string().optional(),
  country: z.string().optional(),
  local: z.string().optional(),
  name: z.string().default(""),
  nip: z.string().optional(),
  number: z.string().optional().describe("Street/building number."),
  street: z
    .string()
    .optional()
    .describe("Street name without building number."),
  type: z.enum([AddressTypeEnum.BILLING, AddressTypeEnum.SHIPPING]),
  zip: z.string().optional().describe("Postal code, for example 00-001."),
});

export const inboundRoutingModelOutputSchema = z.object({
  billingAddress: addressSchema.nullable(),
  deadlineString: z.string().nullable(),
  invoiceRequested: z.boolean(),
  missingInformation: z.array(z.string()),
  paymentType: z.enum(agentPaymentTypeValues).nullable(),
  productRequest: z.string(),
  rationale: z.string(),
  requiredOrderFields: z.object({
    itemsExplicit: z
      .boolean()
      .describe("True when the email explicitly asks for a product/service."),
    paymentExplicit: z
      .boolean()
      .describe("True when the email explicitly states a payment method."),
    shippingDestinationExplicit: z
      .boolean()
      .describe(
        "True when the email explicitly states street, postal code, and city. Company name and country are not required.",
      ),
    shippingMethodExplicit: z
      .boolean()
      .describe("True when the email explicitly states the shipping method."),
  }),
  responseDraft: z.object({
    body: z.string(),
    subject: z.string(),
  }),
  shippingAddress: addressSchema
    .nullable()
    .describe(
      "Shipping address from explicit delivery text. Street plus number, postal code, and city are enough for order routing.",
    ),
  shippingOption: z.enum(shippingOptionValues).nullable(),
  specialNotes: z.string(),
}) satisfies z.ZodType<InboundRoutingModelOutput>;

function getMissingInformation(
  model: InboundRoutingModelOutput,
  allowRecentOrderResolvedFields: boolean,
  labels: InboundMissingInformationLabels,
) {
  const missing = new Set(
    model.missingInformation.map((item) => item.trim()).filter(Boolean),
  );

  if (
    !model.paymentType ||
    (!model.requiredOrderFields.paymentExplicit &&
      !allowRecentOrderResolvedFields)
  ) {
    missing.add(labels.paymentMethod);
  }

  if (
    !model.shippingOption ||
    (!model.requiredOrderFields.shippingMethodExplicit &&
      !allowRecentOrderResolvedFields)
  ) {
    missing.add(labels.shippingMethod);
  }

  if (
    model.shippingOption !== ShippingOptions.PERSONAL_COLLECTION &&
    (!hasShippingDestination(model.shippingAddress) ||
      (!model.requiredOrderFields.shippingDestinationExplicit &&
        !allowRecentOrderResolvedFields))
  ) {
    missing.add(labels.shippingDestination);
    missing.add(labels.shippingAddress);
  }

  if (model.invoiceRequested && !hasShippingDestination(model.billingAddress)) {
    missing.add(labels.billingAddress);
  }

  return Array.from(missing);
}

function hasOrderRequiredFields(
  model: InboundRoutingModelOutput,
  allowRecentOrderResolvedFields: boolean,
) {
  const paymentResolved =
    Boolean(model.paymentType) &&
    (model.requiredOrderFields.paymentExplicit ||
      allowRecentOrderResolvedFields);
  const shippingMethodResolved =
    Boolean(model.shippingOption) &&
    (model.requiredOrderFields.shippingMethodExplicit ||
      allowRecentOrderResolvedFields);
  const shippingDestinationResolved =
    model.shippingOption === ShippingOptions.PERSONAL_COLLECTION ||
    (hasShippingDestination(model.shippingAddress) &&
      (model.requiredOrderFields.shippingDestinationExplicit ||
        allowRecentOrderResolvedFields));
  const billingResolved =
    !model.invoiceRequested || hasShippingDestination(model.billingAddress);

  return (
    paymentResolved &&
    shippingMethodResolved &&
    shippingDestinationResolved &&
    billingResolved
  );
}

function getOrderRoutingRationale({
  allowRecentOrderResolvedFields,
  model,
  rationaleMessages,
}: {
  allowRecentOrderResolvedFields: boolean;
  model: InboundRoutingModelOutput;
  rationaleMessages: InboundRoutingRationaleMessages;
}) {
  if (allowRecentOrderResolvedFields) {
    return model.shippingOption === ShippingOptions.PERSONAL_COLLECTION
      ? rationaleMessages.exactResolvedPersonalPickup
      : rationaleMessages.exactResolved;
  }

  if (model.shippingOption === ShippingOptions.PERSONAL_COLLECTION) {
    return rationaleMessages.exactExplicitPersonalPickup;
  }

  return rationaleMessages.exactExplicit;
}

function normalizeAddress(address: Address | null, type: AddressTypeEnum) {
  if (!address) {
    return null;
  }

  return {
    ...address,
    active: true,
    name: address.name || address.companyName || "",
    type,
  };
}

function buildRecentCustomerOrdersPromptSection(
  recentCustomerOrders: readonly InboundRecentCustomerOrder[] | undefined,
) {
  if (!recentCustomerOrders?.length) {
    return [];
  }

  return [
    "Recent customer orders are available because the email did not clearly state payment and/or delivery details. Use them only to resolve missing payment, delivery, pickup, and delivery-address fields.",
    "If only one previous order exists, you may use its paymentType, shippingOption, and shippingAddress when the current email does not contradict it.",
    "If two previous orders agree on a paymentType, shippingOption, or shippingAddress, you may use the agreed value. If they differ, leave the conflicting field unresolved unless the current email settles it.",
    "When recent orders resolve a field, fill paymentType, shippingOption, or shippingAddress from history, but keep requiredOrderFields.*Explicit false unless the current email stated that field directly.",
    "If the history points to PERSONAL_COLLECTION, set shippingOption=PERSONAL_COLLECTION and shippingAddress=null. Do not ask for a shipping address for personal pickup.",
    "If delivery or pickup remains unclear, ask whether the customer prefers courier delivery, parcel locker/pickup point, or personal pickup.",
    "Recent customer orders (newest first):",
    JSON.stringify(recentCustomerOrders, null, 2),
  ];
}

export function buildInboundRoutingPrompt(
  record: InboundEmailRecord,
  options: {
    previousModelOutput?: InboundRoutingModelOutput;
    recentCustomerOrders?: readonly InboundRecentCustomerOrder[];
  } = {},
) {
  return [
    "Classify this inbound email for a printing/e-commerce admin workflow.",
    "Return only structured fields. Do not invent business details.",
    "Write rationale, missingInformation, responseDraft.subject, and responseDraft.body in Polish because the default customer locale is Polish.",
    "missingInformation must list every missing or unsafe order detail in Polish. Include missing product request, payment method, delivery/pickup method, delivery address, billing address, customer match, or catalog product match when applicable.",
    "Set requiredOrderFields booleans only when the customer stated the value directly in the email. Do not set them to true for values inferred from recent customer orders.",
    "Order routing requires a product request, payment method, and delivery or pickup method. Courier or parcel delivery also requires a destination address; personal pickup does not.",
    "A shipping destination is complete when the email states street with building number, postal code, and city. Company name, country, billing details, and invoice details are not required for shipping destination completeness.",
    "Example: 'Delivery to Example Street 10, 00-000 Example City by DPD courier' means shippingDestinationExplicit=true, shippingMethodExplicit=true, shippingOption=DPD, and shippingAddress.street='Example Street', number='10', zip='00-000', city='Example City'.",
    "Example: 'Odbiór osobisty' means shippingMethodExplicit=true, shippingOption=PERSONAL_COLLECTION, shippingDestinationExplicit=true, and shippingAddress=null.",
    "Set invoiceRequested=true only when the customer explicitly asks for an invoice. If no invoice is requested, set invoiceRequested=false and billingAddress=null.",
    "If product request, payment method, delivery/pickup method, or the required street/zip/city delivery destination are missing, the deterministic workflow will create a quote instead of an order.",
    "For quote outcomes, responseDraft.body must first state the quote or quote scope that can already be prepared from the recognized products, then ask for missing order details only after that. Do not lead with questions when the product request is clear enough for a quote.",
    "Mention the recognized product names and quantities before any questions. Do not write that a quote will be prepared later when the recognized product request is already enough to prepare a quote. Do not invent prices.",
    "Keep responseDraft.body natural, concise, and less formal. Do not use phrases like 'Abyśmy mogli przejść do realizacji zamówienia' or 'Abyśmy mogli przejść do finalizacji'.",
    "When order details are missing, ask only for the missing details needed to place the order, after the quote/scope. For delivery uncertainty, ask whether the customer prefers courier delivery, parcel locker/pickup point, or personal pickup.",
    ...(options.previousModelOutput
      ? [
          `Previous extraction before recent-order lookup:\n${JSON.stringify(
            options.previousModelOutput,
            null,
            2,
          )}`,
        ]
      : []),
    ...buildRecentCustomerOrdersPromptSection(options.recentCustomerOrders),
    AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS,
    `Subject: ${record.subject}`,
    `From: ${record.from}`,
    `To: ${record.to.join(", ")}`,
    "Body:",
    record.text || record.html || "(empty)",
  ].join("\n\n");
}

export function normalizeInboundRoutingModelOutput(
  output: InboundRoutingModelOutput,
): InboundRoutingModelOutput {
  return {
    ...output,
    billingAddress: normalizeAddress(
      output.billingAddress,
      AddressTypeEnum.BILLING,
    ),
    productRequest: output.productRequest.trim(),
    shippingAddress: normalizeAddress(
      output.shippingAddress,
      AddressTypeEnum.SHIPPING,
    ),
    specialNotes: output.specialNotes.trim(),
  };
}

export function decideInboundEmailRouting({
  allowRecentOrderResolvedFields = false,
  allowAdminForwarderWithoutCustomer = false,
  items,
  missingInformationLabels,
  model,
  rationaleMessages,
  senderAuthentication,
  senderMatch,
}: {
  allowRecentOrderResolvedFields?: boolean;
  allowAdminForwarderWithoutCustomer?: boolean;
  items: readonly FormattedOrderItem[];
  missingInformationLabels: InboundMissingInformationLabels;
  model: InboundRoutingModelOutput;
  rationaleMessages: InboundRoutingRationaleMessages;
  senderAuthentication: SenderAuthentication;
  senderMatch: SenderMatchResult;
}): InboundRoutingDecision {
  if (senderAuthentication.verdict !== "trusted") {
    return {
      blockReason: "untrusted-sender",
      items: [],
      missingInformation: senderAuthentication.reasons,
      model,
      outcome: "blocked",
      rationale: rationaleMessages.senderAuthenticationFailed,
      senderAuthentication,
    };
  }

  const isAdminForwardedWithoutCustomer =
    allowAdminForwarderWithoutCustomer && senderMatch.status !== "exact";

  if (senderMatch.status !== "exact" && !isAdminForwardedWithoutCustomer) {
    return {
      blockReason: senderMatch.reason,
      items: [],
      missingInformation: [],
      model,
      outcome: "blocked",
      rationale: rationaleMessages.senderIdentityBlocked(senderMatch.reason),
      senderAuthentication,
    };
  }

  const identityFields =
    senderMatch.status === "exact"
      ? {
          contact: senderMatch.candidate.contact,
          customer: senderMatch.candidate.customer,
        }
      : {};

  if (!model.requiredOrderFields.itemsExplicit || !model.productRequest) {
    return {
      blockReason: "no-product-request",
      ...identityFields,
      items: [],
      missingInformation: [missingInformationLabels.productRequest],
      model,
      outcome: "blocked",
      rationale: rationaleMessages.noProductRequest,
      senderAuthentication,
    };
  }

  if (items.length === 0) {
    return {
      blockReason: "model-unclear",
      ...identityFields,
      items: [],
      missingInformation: [missingInformationLabels.catalogProductMatch],
      model,
      outcome: "blocked",
      rationale: rationaleMessages.noCatalogItem,
      senderAuthentication,
    };
  }

  const missingInformation = getMissingInformation(
    model,
    allowRecentOrderResolvedFields,
    missingInformationLabels,
  );
  const hasRequiredOrderFields = hasOrderRequiredFields(
    model,
    allowRecentOrderResolvedFields,
  );
  const canCreateOrder =
    senderMatch.status === "exact" &&
    hasRequiredOrderFields &&
    missingInformation.length === 0;
  const rationale = canCreateOrder
    ? getOrderRoutingRationale({
        allowRecentOrderResolvedFields,
        model,
        rationaleMessages,
      })
    : isAdminForwardedWithoutCustomer
      ? rationaleMessages.adminForwarderManualCustomer
      : rationaleMessages.missingOrderFields;

  return {
    ...identityFields,
    items: [...items],
    missingInformation,
    model,
    outcome: canCreateOrder ? "order" : "quote",
    rationale,
    senderAuthentication,
  };
}

export function createBlockedRoutingDecision({
  blockReason,
  missingInformation = [],
  rationale,
  senderAuthentication,
}: {
  blockReason: NonNullable<InboundRoutingDecision["blockReason"]>;
  missingInformation?: string[];
  rationale: string;
  senderAuthentication: SenderAuthentication;
}): InboundRoutingDecision {
  return {
    blockReason,
    items: [],
    missingInformation,
    model: null,
    outcome: "blocked",
    rationale,
    senderAuthentication,
  };
}
