import "server-only";

import i18next from "@/i18n/i18next";
import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import { formatTimestampLike, isTimestampLike } from "@/lib/ai/timestamps";
import { getEmailOrderImportAgentModel } from "@/lib/ai/durable-agents/durable-agent-models.server";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import {
  InboundEmailAgentResponse,
  type InboundEmailAgentResponseProps,
} from "@konfi/emails";
import {
  MODELS,
  requireTenantContextTenantId,
  shouldScopeByTenant,
  withTenantOwned,
} from "@konfi/firebase";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type {
  Attribute,
  Channel,
  FormattedOrderItem,
  Member,
  NestedCustomer,
  Order,
  Settings,
} from "@konfi/types";
import { DEFAULT_LOCALE, ShippingOptions, Unit } from "@konfi/types";
import type {
  AgentOrderItem,
  QuoteAgentData,
} from "@/lib/ai/durable-agents/types";
import type { AgentTaskType } from "@/lib/ai/durable-agents/types";
import type { TFunction } from "i18next";
import { FieldValue } from "firebase-admin/firestore";
import { Output, generateText } from "ai";
import { createElement } from "react";
import {
  searchCustomersStep,
  searchProductsStep,
} from "../durable-agents/steps";
import {
  buildInboundSpecialNotes,
  createInboundOrder,
  createInboundQuote,
} from "./creation";
import { buildInboundCustomerDraft } from "./customer-draft";
import {
  parseEmailAddress,
  parseEmailAddressList,
  resolveAdminForwardingSender,
  resolveInboundEmailChannel,
} from "./addressing";
import { matchInboundSenderToCustomer } from "./sender-match";
import {
  evaluateInboundAdminForwarderAuthentication,
  evaluateInboundSenderAuthentication,
  normalizeHeaders,
} from "./sender-auth";
import {
  buildInboundMissingInformationLabels,
  buildInboundRoutingRationaleMessages,
  buildInboundRoutingPrompt,
  createBlockedRoutingDecision,
  decideInboundEmailRouting,
  inboundRoutingModelOutputSchema,
  normalizeInboundRoutingModelOutput,
} from "./routing";
import { sendInboundAdminOnlyEmail } from "./resend";
import type {
  InboundEmailBenchmarkRoutingContext,
  InboundEmailRecord,
  InboundRecentCustomerOrder,
  InboundEmailStartContext,
  InboundEmailStatus,
  InboundRoutingModelOutput,
  InboundRoutingDecision,
  InboundWorkflowResolution,
} from "./types";
import { isShippingFree } from "@konfi/utils";

const defaultSettings: Settings = {
  buying: {
    enabled: false,
    max: 500000,
    min: 5000,
  },
  express: {
    enabled: false,
    percent: 20,
  },
  freeShipping: {
    enabled: false,
    min: 500000,
  },
  shippingOptionsPrices: {
    COMPANY_COURIER: 4000,
    CUSTOM: 0,
    DHL: 3000,
    DPD: 3000,
    FEDEX: 3000,
    INPOST: 3000,
    PACZKOMATY_INPOST: 1500,
    PERSONAL_COLLECTION: 0,
  },
  underConstruction: {
    enabled: false,
    message: "",
  },
};

interface InboundAdminResponse {
  body: string;
  subject: string;
  templateProps: InboundEmailAgentResponseProps;
  to: string;
}

function getDb() {
  return getAdminDb();
}

function getScopedTenantId(
  tenantContext: TenantContext | undefined,
  operationName: string,
) {
  return tenantContext && shouldScopeByTenant(tenantContext)
    ? requireTenantContextTenantId(tenantContext, operationName)
    : undefined;
}

function withInboundTenant<T extends object>(
  data: T & { tenantId?: string | null },
  tenantContext: TenantContext | undefined,
  operationName: string,
) {
  return tenantContext
    ? withTenantOwned(data, tenantContext, operationName)
    : data;
}

function uniqueCustomers(customers: readonly NestedCustomer[]) {
  return Array.from(
    new Map(customers.map((customer) => [customer.id, customer])).values(),
  );
}

function removeUndefinedDeep(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value instanceof Date) {
    return value;
  }

  if (isTimestampLike(value)) {
    return value.toDate();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item, seen))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return undefined;
    }

    seen.add(value);
    const cleaned: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      const cleanedEntry = removeUndefinedDeep(entry, seen);
      if (cleanedEntry !== undefined) {
        cleaned[key] = cleanedEntry;
      }
    }

    seen.delete(value);
    return cleaned;
  }

  return value;
}

function toWorkflowSafe<T>(value: T): T {
  return removeUndefinedDeep(value) as T;
}

function getInboundAgentTaskType(
  decision: InboundRoutingDecision,
): AgentTaskType {
  return decision.outcome === "order" ? "order" : "quote";
}

async function getDefaultLocaleT() {
  if (!i18next.hasLoadedNamespace("translation")) {
    await i18next.loadNamespaces("translation");
  }

  return i18next.getFixedT(DEFAULT_LOCALE, "translation");
}

function getInboundAgentTaskTypeLabel(
  decision: InboundRoutingDecision,
  t: TFunction,
) {
  return t(`agents.taskType.${getInboundAgentTaskType(decision)}`, {
    defaultValue:
      getInboundAgentTaskType(decision) === "order" ? "Order" : "Quote",
  });
}

function getInboundAgentPrompt(record: InboundEmailRecord, t: TFunction) {
  const sender = parseEmailAddress(record.from);
  return t("agents.inboundEmail.prompt", {
    defaultValue: "Inbound email from {{email}}: {{subject}}",
    email: sender.email,
    subject: record.subject || record.resendEmailId,
  });
}

function getInboundAgentManualReviewMessage(
  decision: InboundRoutingDecision,
  t: TFunction,
) {
  return t("agents.inboundEmail.manualReview", {
    defaultValue:
      "Inbound email was routed as a {{taskType}}. Direct creation is temporarily disabled, so review the prepared draft and create it manually from this task.",
    taskType: getInboundAgentTaskTypeLabel(decision, t),
  });
}

function getInboundAgentReplySentMessage(
  decision: InboundRoutingDecision,
  t: TFunction,
) {
  if (decision.outcome === "blocked") {
    return t("agents.inboundEmail.replySentBlocked", {
      defaultValue:
        "Inbound email was blocked and the forwarding admin was notified.",
    });
  }

  return t("agents.inboundEmail.replySentManualCreate", {
    defaultValue:
      "The forwarding admin was notified. No quote or order was created automatically.",
  });
}

function getInboundAgentBenchmarkCompletedMessage(
  decision: InboundRoutingDecision,
  t: TFunction,
) {
  if (decision.outcome === "blocked") {
    return t("agents.inboundEmail.benchmarkCompletedBlocked", {
      defaultValue:
        "Inbound email benchmark completed. The email was blocked and no outbound admin email was sent.",
    });
  }

  return t("agents.inboundEmail.benchmarkCompletedManualCreate", {
    defaultValue:
      "Inbound email benchmark completed. Review the prepared draft and create it manually from this task. No outbound admin email was sent.",
  });
}

function getItemsSubtotalPrice(items: readonly AgentOrderItem[]) {
  return Math.floor(
    items.reduce((total, item) => total + Number(item.totalPrice ?? 0), 0),
  );
}

function calculateAgentShippingPrice({
  items,
  settings,
  shippingOption,
}: {
  items: readonly AgentOrderItem[];
  settings: Settings;
  shippingOption: string;
}) {
  const subtotal = getItemsSubtotalPrice(items);
  return isShippingFree(
    subtotal,
    settings.freeShipping.enabled,
    settings.freeShipping.min,
  )
    ? 0
    : ((settings.shippingOptionsPrices as Record<string, number>)[
        shippingOption
      ] ?? 0);
}

function mapInboundItemToAgentOrderItem(
  item: FormattedOrderItem,
  index: number,
): AgentOrderItem {
  return {
    id: item.id || `inbound-item-${index + 1}`,
    productId: item.product?.id ?? "",
    productName: item.product?.name ?? item.name ?? "",
    description: item.description ?? item.product?.name ?? item.name ?? "",
    combination: item.combination ? { value: item.combination } : undefined,
    calculatedCombination: item.calculatedCombination ?? undefined,
    customFormat: item.customFormat ?? false,
    quantity: item.quantity ?? 1,
    volume: item.volume,
    width: item.width,
    height: item.height,
    totalPrice: item.totalPrice ?? 0,
    customPrice: item.customPrice ?? null,
    discount: item.discount ?? {
      type: "PERCENTAGE",
      discountValue: 0,
      discountedAmount: 0,
      code: null,
    },
    unit: item.unit ?? Unit.PCS,
    customSizes: item.customSizes,
    expressPercent: item.expressPercent,
  };
}

export function buildInboundAgentCollectedData({
  decision,
  record,
  settings,
}: {
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  settings: Settings;
}): QuoteAgentData {
  const items = decision.items.map(mapInboundItemToAgentOrderItem);
  const shippingOption =
    decision.model?.shippingOption ?? ShippingOptions.PERSONAL_COLLECTION;
  const shippingPrice = calculateAgentShippingPrice({
    items,
    settings,
    shippingOption,
  });
  const totalPrice = getItemsSubtotalPrice(items) + shippingPrice;

  return removeUndefinedDeep({
    customer: decision.customer,
    contact: decision.contact,
    items,
    shippingOption,
    shippingPrice,
    specialNotes: buildInboundSpecialNotes({ decision, record }),
    totalPrice,
  }) as QuoteAgentData;
}

function buildAdminResponse({
  collectedData,
  decision,
  record,
  t,
}: {
  collectedData?: QuoteAgentData;
  decision: InboundRoutingDecision;
  record: InboundEmailRecord;
  t: TFunction;
}): InboundAdminResponse {
  const subjectPrefixKey =
    decision.outcome === "order"
      ? decision.createdResourceId
        ? "orderCreated"
        : "orderReady"
      : decision.outcome === "quote"
        ? decision.createdResourceId
          ? "quoteCreated"
          : "quoteReady"
        : "blocked";
  const subjectPrefix = t(
    `agents.inboundEmail.admin.subjectPrefix.${subjectPrefixKey}`,
    {
      defaultValue:
        subjectPrefixKey === "orderCreated"
          ? "Order created"
          : subjectPrefixKey === "orderReady"
            ? "Order ready for review"
            : subjectPrefixKey === "quoteCreated"
              ? "Quote created"
              : subjectPrefixKey === "quoteReady"
                ? "Quote ready for review"
                : "Inbound email blocked",
    },
  );

  const resourceLine = decision.createdResourceId
    ? t("agents.inboundEmail.admin.createdResource", {
        defaultValue: "Created resource ID: {{id}}",
        id: decision.createdResourceId,
      })
    : decision.outcome === "blocked"
      ? t("agents.inboundEmail.admin.noResourceBlocked", {
          defaultValue: "No quote or order was created.",
        })
      : t("agents.inboundEmail.admin.noResourceManualCreate", {
          defaultValue:
            "No quote or order was created. Open the agent task to review and create it manually.",
        });
  const missingLine =
    decision.missingInformation.length > 0
      ? t("agents.inboundEmail.admin.missingDetails", {
          defaultValue: "Missing or unsafe details: {{details}}",
          details: decision.missingInformation.join(", "),
        })
      : t("agents.inboundEmail.admin.noMissingDetails", {
          defaultValue: "No missing details detected.",
        });
  const customerReply = buildInboundCustomerDraft({
    collectedData,
    decision,
    locale: DEFAULT_LOCALE,
    t,
  });
  const rationale = decision.model?.rationale.trim() || decision.rationale;
  const heading = t("agents.inboundEmail.admin.heading", {
    defaultValue: "{{subjectPrefix}} for inbound email {{emailId}}.",
    emailId: record.resendEmailId,
    subjectPrefix,
  });
  const statusLine = t("agents.inboundEmail.admin.status", {
    defaultValue: "Status: {{status}}",
    status: subjectPrefix,
  });
  const rationaleLine = t("agents.inboundEmail.admin.rationale", {
    defaultValue: "Rationale: {{rationale}}",
    rationale,
  });
  const customerDraftLabel = t(
    "agents.inboundEmail.admin.customerDraftHeader",
    {
      defaultValue: "Draft customer response for manual review:",
    },
  );
  const customerDraft =
    customerReply ||
    t("agents.inboundEmail.admin.noCustomerDraft", {
      defaultValue: "No customer response draft was generated.",
    });
  const subject = t("agents.inboundEmail.admin.subject", {
    defaultValue: "[Konfi inbound] {{subjectPrefix}}: {{subject}}",
    subject: record.subject || record.resendEmailId,
    subjectPrefix,
  });

  return {
    body: [
      heading,
      resourceLine,
      statusLine,
      rationaleLine,
      missingLine,
      "",
      customerDraftLabel,
      customerDraft,
    ].join("\n"),
    subject,
    templateProps: {
      customerDraft,
      customerDraftLabel,
      heading,
      missingDetails: missingLine,
      preview: subject,
      rationale: rationaleLine,
      resource: resourceLine,
      statusLine,
    },
    to: record.adminRecipientEmail,
  };
}

async function loadInboundRecord(inboundEmailId: string) {
  const snapshot = await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .get();

  if (!snapshot.exists) {
    throw new Error(`Inbound email ${inboundEmailId} was not found`);
  }

  return snapshot.data() as InboundEmailRecord;
}

async function loadInboundRecordIfExists(inboundEmailId: string) {
  const snapshot = await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .get();

  return snapshot.exists ? (snapshot.data() as InboundEmailRecord) : null;
}

async function loadTenantContextForInboundRecord(
  record: Pick<InboundEmailRecord, "channelId" | "tenantId">,
) {
  if (record.tenantId?.trim()) {
    return getTenantContext(record.tenantId);
  }

  if (!record.channelId.trim()) {
    return undefined;
  }

  const channelSnapshot = await getDb()
    .collection("channels")
    .doc(record.channelId)
    .get();

  if (!channelSnapshot.exists) {
    return undefined;
  }

  const channel = channelSnapshot.data() as Pick<Channel, "tenantId">;
  return getTenantContext(channel.tenantId ?? undefined);
}

async function findSenderCustomers({
  record,
  tenantId,
}: {
  record: InboundEmailRecord;
  tenantId?: string;
}) {
  const sender = parseEmailAddress(record.from);
  const queries = [sender.email, sender.name].filter(
    (query) => query.trim().length > 0,
  );

  const results = await Promise.all(
    queries.map((query) => searchCustomersStep({ limit: 10, query, tenantId })),
  );

  return {
    customers: uniqueCustomers(
      results.flatMap((result) => result.customers ?? []),
    ),
    sender,
  };
}

async function loadAttributes() {
  const snapshot = await getDb().collection("attributes").get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Attribute[];
}

async function loadChannelSettings(channelId: string): Promise<Settings> {
  const [
    buyingSnapshot,
    expressSnapshot,
    freeShippingSnapshot,
    shippingOptionsPricesSnapshot,
    underConstructionSnapshot,
  ] = await Promise.all([
    getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc("buying")
      .get(),
    getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc("express")
      .get(),
    getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc("freeShipping")
      .get(),
    getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc("shippingOptionsPrices")
      .get(),
    getDb()
      .collection("channels")
      .doc(channelId)
      .collection("settings")
      .doc("underConstruction")
      .get(),
  ]);

  return {
    buying:
      (buyingSnapshot.data() as Settings["buying"] | undefined) ??
      defaultSettings.buying,
    express:
      (expressSnapshot.data() as Settings["express"] | undefined) ??
      defaultSettings.express,
    freeShipping:
      (freeShippingSnapshot.data() as Settings["freeShipping"] | undefined) ??
      defaultSettings.freeShipping,
    shippingOptionsPrices:
      (shippingOptionsPricesSnapshot.data() as
        | Settings["shippingOptionsPrices"]
        | undefined) ?? defaultSettings.shippingOptionsPrices,
    underConstruction:
      (underConstructionSnapshot.data() as
        | Settings["underConstruction"]
        | undefined) ?? defaultSettings.underConstruction,
  };
}

async function loadRecentCustomerOrdersForRouting({
  channelId,
  customerId,
  tenantId,
}: {
  channelId: string;
  customerId: string;
  tenantId?: string;
}): Promise<InboundRecentCustomerOrder[]> {
  let query = getDb()
    .collection("channels")
    .doc(channelId)
    .collection("orders")
    .where("active", "==", true)
    .where("customer.id", "==", customerId);

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.orderBy("createdAt", "desc").limit(2).get();

  return snapshot.docs.map((doc) => {
    const order = doc.data() as Order;

    return {
      createdAt: formatTimestampLike(order.createdAt),
      id: doc.id,
      number: typeof order.number === "number" ? order.number : null,
      paymentType: order.paymentType ?? null,
      shippingAddress: order.shipping ?? null,
      shippingOption: order.shippingOption ?? null,
    };
  });
}

function needsRecentCustomerOrderLookup(model: InboundRoutingModelOutput) {
  return (
    !model.paymentType ||
    !model.requiredOrderFields.paymentExplicit ||
    !model.shippingOption ||
    !model.requiredOrderFields.shippingMethodExplicit
  );
}

export async function loadInboundEmailStartContextStep({
  channelId,
  recipients,
  sender,
}: {
  channelId?: string;
  recipients?: readonly string[];
  sender?: string;
}): Promise<InboundEmailStartContext> {
  const db = getDb();
  const [channelsSnapshot, attributes, membersSnapshot] = await Promise.all([
    db.collection("channels").get(),
    loadAttributes(),
    db.collection("members").get(),
  ]);

  const channels = channelsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Channel[];
  const members = membersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Member[];
  const forwardingAdmin = sender
    ? resolveAdminForwardingSender({ members, sender })
    : null;
  const memberChannelIds =
    forwardingAdmin?.member.id && sender
      ? (members.find((member) => member.id === forwardingAdmin.member.id)
          ?.channelIds ?? [])
      : [];
  const channel = resolveInboundEmailChannel({
    channelId,
    channels,
    memberChannelIds,
    recipients,
    sender,
  });

  if (!channel) {
    return {
      attributes,
      channel: null,
      channelId: "",
      members,
      settings: defaultSettings,
    };
  }

  const resolvedChannelId = channel.id;

  return {
    attributes,
    channel,
    channelId: resolvedChannelId,
    members,
    settings: await loadChannelSettings(resolvedChannelId),
  };
}

export async function routeInboundEmailStep({
  benchmarkRoutingContext,
  inboundEmailId,
  channelId,
}: {
  benchmarkRoutingContext?: InboundEmailBenchmarkRoutingContext;
  inboundEmailId: string;
  channelId: string;
}): Promise<InboundRoutingDecision> {
  const record = await loadInboundRecord(inboundEmailId);
  const tenantContext = await loadTenantContextForInboundRecord(record);
  const tenantId = getScopedTenantId(tenantContext, "inbound email routing");
  const headers = normalizeHeaders(record.headers);
  const directSenderAuthentication = evaluateInboundSenderAuthentication({
    from: record.from,
    headers,
  });
  const senderAuthentication = record.adminRecipientEmail
    ? evaluateInboundAdminForwarderAuthentication({
        adminEmail: record.adminRecipientEmail,
        from: record.from,
        headers,
      })
    : directSenderAuthentication;
  const isTrustedAdminForwarder =
    senderAuthentication.verdict === "trusted" &&
    record.adminRecipientEmail === parseEmailAddress(record.from).email;

  if (senderAuthentication.verdict !== "trusted") {
    const decision = toWorkflowSafe(
      createBlockedRoutingDecision({
        blockReason: "untrusted-sender",
        missingInformation: senderAuthentication.reasons,
        rationale: "Sender authentication was not trusted.",
        senderAuthentication,
      }),
    );
    await saveInboundRoutingDecisionStep({
      decision,
      inboundEmailId,
      tenantContext,
    });
    return decision;
  }

  const senderMatch = benchmarkRoutingContext?.senderMatch
    ? benchmarkRoutingContext.senderMatch
    : await findSenderCustomers({ record, tenantId }).then(
        ({ customers, sender }) =>
          matchInboundSenderToCustomer({ customers, sender }),
      );

  if (senderMatch.status !== "exact" && !isTrustedAdminForwarder) {
    const decision = toWorkflowSafe(
      createBlockedRoutingDecision({
        blockReason: senderMatch.reason,
        rationale: `Sender did not resolve to one exact trusted customer/contact: ${senderMatch.reason}.`,
        senderAuthentication,
      }),
    );
    await saveInboundRoutingDecisionStep({
      decision,
      inboundEmailId,
      tenantContext,
    });
    return decision;
  }

  const model = await getEmailOrderImportAgentModel();
  const routingPrompt = buildInboundRoutingPrompt(record);
  const meteringRunId =
    typeof record.runId === "string" ? record.runId : undefined;
  const meteringUserId =
    typeof record.createdBy === "string"
      ? record.createdBy
      : record.createdBy?.id;
  const result = await runMeteredAdminAiText({
    channelId,
    input: routingPrompt,
    model: MODELS.GEMINI_3_FLASH_LITE,
    provider: "google-vertex",
    run: () =>
      generateText({
        model,
        output: Output.object({
          name: "InboundEmailRouting",
          schema: inboundRoutingModelOutputSchema,
        }),
        prompt: routingPrompt,
      }),
    runId: meteringRunId,
    source: "durable-agent",
    tenantId,
    userId: meteringUserId,
  });
  let modelOutput = normalizeInboundRoutingModelOutput(result.output);

  let usedRecentCustomerOrders = false;

  if (
    !benchmarkRoutingContext &&
    senderMatch.status === "exact" &&
    needsRecentCustomerOrderLookup(modelOutput)
  ) {
    const recentCustomerOrders = await loadRecentCustomerOrdersForRouting({
      channelId,
      customerId: senderMatch.candidate.customer.id,
      tenantId,
    });

    if (recentCustomerOrders.length > 0) {
      const recentOrdersPrompt = buildInboundRoutingPrompt(record, {
        previousModelOutput: modelOutput,
        recentCustomerOrders,
      });
      const resultWithRecentOrders = await runMeteredAdminAiText({
        channelId,
        input: recentOrdersPrompt,
        model: MODELS.GEMINI_3_FLASH_LITE,
        provider: "google-vertex",
        run: () =>
          generateText({
            model,
            output: Output.object({
              name: "InboundEmailRouting",
              schema: inboundRoutingModelOutputSchema,
            }),
            prompt: recentOrdersPrompt,
          }),
        runId: meteringRunId,
        source: "durable-agent",
        tenantId,
        userId: meteringUserId,
      });

      modelOutput = normalizeInboundRoutingModelOutput(
        resultWithRecentOrders.output,
      );
      usedRecentCustomerOrders = true;
    }
  }

  const productSearch = benchmarkRoutingContext
    ? { products: benchmarkRoutingContext.items }
    : modelOutput.productRequest
      ? await searchProductsStep(
          { query: modelOutput.productRequest },
          { attributes: await loadAttributes(), channelId, tenantId },
        )
      : { products: [] };
  const t = await getDefaultLocaleT();
  const decision = toWorkflowSafe(
    decideInboundEmailRouting({
      items: productSearch.products ?? [],
      allowRecentOrderResolvedFields: usedRecentCustomerOrders,
      allowAdminForwarderWithoutCustomer: isTrustedAdminForwarder,
      missingInformationLabels: buildInboundMissingInformationLabels(t),
      model: modelOutput,
      rationaleMessages: buildInboundRoutingRationaleMessages(t),
      senderAuthentication,
      senderMatch,
    }),
  );

  await saveInboundRoutingDecisionStep({
    decision,
    inboundEmailId,
    tenantContext,
  });
  return decision;
}

export async function saveInboundRoutingDecisionStep({
  decision,
  inboundEmailId,
  status,
  tenantContext,
}: {
  decision: InboundRoutingDecision;
  inboundEmailId: string;
  status?: InboundEmailStatus;
  tenantContext?: TenantContext;
}) {
  await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .set(
      withInboundTenant(
        {
          routingDecision: decision,
          status:
            status ??
            (decision.outcome === "blocked" ? "blocked" : "processing"),
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email routing decision",
      ),
      { merge: true },
    );
}

export async function finalizeInboundEmailStep({
  decision,
  inboundEmailId,
  settings,
}: {
  decision: InboundRoutingDecision;
  inboundEmailId: string;
  settings: Settings;
}): Promise<InboundRoutingDecision> {
  const record = await loadInboundRecord(inboundEmailId);
  const channelSnapshot = await getDb()
    .collection("channels")
    .doc(record.channelId)
    .get();

  if (!channelSnapshot.exists) {
    throw new Error(`Channel ${record.channelId} was not found`);
  }

  const channel = {
    id: channelSnapshot.id,
    ...channelSnapshot.data(),
  } as Channel;
  const tenantContext = getTenantContext(
    record.tenantId ?? channel.tenantId ?? undefined,
  );
  let createdResourceId: string | undefined;

  if (decision.outcome === "quote") {
    createdResourceId = await createInboundQuote({
      channel,
      decision,
      record,
      settings,
      tenantContext,
    });
  } else if (decision.outcome === "order") {
    createdResourceId = await createInboundOrder({
      channel,
      decision,
      record,
      settings,
      tenantContext,
    });
  }

  const nextDecision = {
    ...decision,
    createdResourceId: createdResourceId ?? null,
  };

  await saveInboundRoutingDecisionStep({
    decision: nextDecision,
    inboundEmailId,
    status:
      decision.outcome === "order"
        ? "order-created"
        : decision.outcome === "quote"
          ? "quote-created"
          : "blocked",
    tenantContext,
  });

  return nextDecision;
}

export async function persistInboundEmailManualCreateStep({
  decision,
  inboundEmailId,
  workflowRunId,
}: {
  decision: InboundRoutingDecision;
  inboundEmailId: string;
  workflowRunId: string;
}): Promise<{
  collectedData: QuoteAgentData;
  decision: InboundRoutingDecision;
}> {
  const record = await loadInboundRecord(inboundEmailId);
  const tenantContext = await loadTenantContextForInboundRecord(record);
  const nextDecision = toWorkflowSafe({
    ...decision,
    createdResourceId: null,
  });
  const settings = await loadChannelSettings(record.channelId);
  const t = await getDefaultLocaleT();
  const collectedData = buildInboundAgentCollectedData({
    decision: nextDecision,
    record,
    settings,
  });
  const db = getDb();

  await Promise.all([
    db
      .collection("inboundEmails")
      .doc(inboundEmailId)
      .set(
        withInboundTenant(
          {
            routingDecision: nextDecision,
            status: "awaiting-manual-create",
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email manual create status",
        ),
        { merge: true },
      ),
    db
      .collection("agents")
      .doc(workflowRunId)
      .set(
        withInboundTenant(
          {
            runId: workflowRunId,
            taskType: getInboundAgentTaskType(nextDecision),
            prompt: getInboundAgentPrompt(record, t),
            channelId: record.channelId,
            createdBy: record.createdBy,
            status: "completed",
            result: removeUndefinedDeep({
              collectedData,
              inboundEmailId,
              manualCreateRequired: true,
              routingOutcome: nextDecision.outcome,
            }),
            messages: FieldValue.arrayUnion({
              role: "assistant",
              content: getInboundAgentManualReviewMessage(nextDecision, t),
            }),
            stepsCount: 2,
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email manual create agent",
        ),
        { merge: true },
      ),
  ]);

  return toWorkflowSafe({
    collectedData,
    decision: nextDecision,
  });
}

export async function markInboundEmailProcessingStep({
  inboundEmailId,
  workflowRunId,
}: {
  inboundEmailId: string;
  workflowRunId: string;
}) {
  const record = await loadInboundRecord(inboundEmailId);
  const tenantContext = await loadTenantContextForInboundRecord(record);
  const db = getDb();
  const t = await getDefaultLocaleT();

  await Promise.all([
    db
      .collection("inboundEmails")
      .doc(inboundEmailId)
      .set(
        withInboundTenant(
          {
            runId: workflowRunId,
            status: "processing",
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email processing status",
        ),
        { merge: true },
      ),
    db
      .collection("agents")
      .doc(workflowRunId)
      .set(
        withInboundTenant(
          {
            runId: workflowRunId,
            taskType: "quote",
            prompt: getInboundAgentPrompt(record, t),
            channelId: record.channelId,
            createdBy: record.createdBy,
            status: "processing",
            messages: [
              {
                role: "user",
                content: createInboundEmailText(record),
              },
              {
                role: "assistant",
                content: t("agents.inboundEmail.routingStarted", {
                  defaultValue: "Inbound email received. Routing request...",
                }),
              },
            ],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email processing agent",
        ),
        { merge: true },
      ),
  ]);
}

export async function markInboundEmailFailureStep({
  error,
  inboundEmailId,
  workflowRunId,
}: {
  error: string;
  inboundEmailId: string;
  workflowRunId: string;
}) {
  const db = getDb();
  const record = await loadInboundRecordIfExists(inboundEmailId);
  const tenantContext = record
    ? await loadTenantContextForInboundRecord(record)
    : undefined;

  await Promise.all([
    db
      .collection("inboundEmails")
      .doc(inboundEmailId)
      .set(
        withInboundTenant(
          {
            error,
            runId: workflowRunId,
            status: "failed",
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email failure status",
        ),
        { merge: true },
      ),
    db
      .collection("agents")
      .doc(workflowRunId)
      .set(
        withInboundTenant(
          {
            error,
            runId: workflowRunId,
            status: "failed",
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email failure agent",
        ),
        { merge: true },
      ),
  ]);
}

export async function sendInboundAdminReplyStep({
  collectedData,
  decision,
  inboundEmailId,
  sendEmail = true,
}: {
  collectedData?: QuoteAgentData;
  decision: InboundRoutingDecision;
  inboundEmailId: string;
  sendEmail?: boolean;
}): Promise<InboundWorkflowResolution> {
  const record = await loadInboundRecord(inboundEmailId);
  const tenantContext = await loadTenantContextForInboundRecord(record);
  const t = await getDefaultLocaleT();
  const response = buildAdminResponse({ collectedData, decision, record, t });
  const adminResponse = {
    body: response.body,
    subject: response.subject,
    to: response.to,
  };

  if (sendEmail) {
    await sendInboundAdminOnlyEmail({
      ...adminResponse,
      template: createElement(
        InboundEmailAgentResponse,
        response.templateProps,
      ),
    });
  }

  await getDb()
    .collection("inboundEmails")
    .doc(inboundEmailId)
    .set(
      withInboundTenant(
        {
          adminResponse,
          updatedAt: FieldValue.serverTimestamp(),
        },
        tenantContext,
        "inbound email admin response",
      ),
      { merge: true },
    );

  if (record.runId) {
    await getDb()
      .collection("agents")
      .doc(record.runId)
      .set(
        withInboundTenant(
          {
            messages: FieldValue.arrayUnion({
              role: "assistant",
              content: sendEmail
                ? getInboundAgentReplySentMessage(decision, t)
                : getInboundAgentBenchmarkCompletedMessage(decision, t),
            }),
            result: removeUndefinedDeep({
              collectedData,
              inboundEmailId,
              manualCreateRequired: decision.outcome !== "blocked",
              routingOutcome: decision.outcome,
            }),
            status: "completed",
            stepsCount: decision.outcome === "blocked" ? 2 : 3,
            updatedAt: FieldValue.serverTimestamp(),
          },
          tenantContext,
          "inbound email reply agent",
        ),
        { merge: true },
      );
  }

  return removeUndefinedDeep({
    collectedData,
    decision,
    orderId:
      decision.outcome === "order"
        ? (decision.createdResourceId ?? undefined)
        : undefined,
    quoteId:
      decision.outcome === "quote"
        ? (decision.createdResourceId ?? undefined)
        : undefined,
    response: adminResponse,
  }) as InboundWorkflowResolution;
}

export function createInboundEmailText(record: InboundEmailRecord) {
  const recipients = parseEmailAddressList(record.to)
    .map((recipient) => recipient.email)
    .join(", ");

  return [
    `From: ${record.from}`,
    `To: ${recipients}`,
    `Subject: ${record.subject}`,
    "",
    record.text || record.html || "",
  ].join("\n");
}
