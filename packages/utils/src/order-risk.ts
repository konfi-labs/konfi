import {
  DEFAULT_LOCALE,
  isNestedCustomer,
  Locale,
  Order,
  OrderRiskDeterministicEvaluation,
  OrderRiskDimension,
  OrderRiskLevel,
  OrderRiskRecommendation,
  OrderRiskSignal,
  OrderRiskSnapshot,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";

export const ORDER_RISK_ANALYSIS_COLLECTION = "analyses";
export const ORDER_RISK_ANALYSIS_LATEST_DOC_ID = "order-risk-latest";
export const ORDER_RISK_ANALYSIS_VERSION = "2026-04-23-v1";
export const ORDER_RISK_EXISTING_CUSTOMER_SKIP_MIN_ORDERS = 5;

const SUSPICIOUS_EMAIL_DOMAIN_PARTS = [
  "mailinator",
  "tempmail",
  "10minutemail",
  "guerrillamail",
  "yopmail",
  "sharklasers",
  "trashmail",
  "example.com",
];

const TEST_EMAIL_PATTERNS = [/test/i, /testowy/i, /jan@/i, /demo/i, /fake/i];

const MANUAL_ORDER_PATTERNS = [
  /phone/i,
  /telefon/i,
  /manual/i,
  /ręczn/i,
  /call/i,
];

const SAFE_PAYMENT_TYPES = new Set<string>([
  PaymentType.STRIPE,
  PaymentType.PRZELEWY24,
  PaymentType.PROFORMA,
  PaymentType.ALLEGRO,
]);
const ORDER_RISK_OUTPUT_LOCALES = Object.values(Locale);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeOrderRiskConfidence(value: unknown): unknown {
  const raw =
    typeof value === "string" ? Number(value.trim().replace(/%$/, "")) : value;

  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return value;
  }

  if (raw > 1) {
    return Math.max(0, Math.min(1, raw / 100));
  }

  return Math.max(0, Math.min(1, raw));
}

type OrderRiskLocalizedTextCandidate = {
  summary: string;
  reasons: string[];
};

export type NormalizedOrderRiskAiResult = {
  fraudScore: number;
  operationalScore: number;
  localizedContent: Record<Locale, OrderRiskLocalizedTextCandidate>;
  confidence?: number;
};

export type OrderRiskAiResultCandidate = {
  fraudScore: number;
  operationalScore: number;
  localizedContent?: unknown;
  confidence?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readStringFromKeys(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readTrimmedString(record[key]);
    if (value) return value;
  }

  return undefined;
}

function readReasonString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return readTrimmedString(value);
  }

  if (!isRecord(value)) return undefined;

  return readStringFromKeys(value, [
    "reason",
    "detail",
    "text",
    "description",
    "title",
  ]);
}

function readReasonStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readReasonString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const reason = readReasonString(value);
  return reason ? [reason] : [];
}

function readReasonsFromKeys(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const reasons = readReasonStrings(record[key]);
    if (reasons.length > 0) return reasons;
  }

  return [];
}

function normalizeSummary(summary: string): string {
  return summary.slice(0, 400);
}

function normalizeReasons(reasons: string[], summary: string): string[] {
  const normalized = reasons
    .map((reason) => reason.trim().slice(0, 180))
    .filter((reason) => reason.length > 0)
    .slice(0, 6);

  return normalized.length > 0 ? normalized : [summary.slice(0, 180)];
}

function readOrderRiskLocalizedText(
  value: unknown,
): OrderRiskLocalizedTextCandidate | undefined {
  const directText = readTrimmedString(value);
  if (directText) {
    return {
      summary: normalizeSummary(directText),
      reasons: normalizeReasons([directText], directText),
    };
  }

  if (!isRecord(value)) return undefined;

  const summary = readStringFromKeys(value, [
    "summary",
    "description",
    "assessment",
    "message",
  ]);
  const reasons = readReasonsFromKeys(value, [
    "reasons",
    "riskReasons",
    "rationale",
    "signals",
    "details",
  ]);

  if (!summary && reasons.length === 0) return undefined;

  const normalizedSummary = normalizeSummary(summary ?? reasons[0] ?? "");
  if (!normalizedSummary) return undefined;

  return {
    summary: normalizedSummary,
    reasons: normalizeReasons(reasons, normalizedSummary),
  };
}

function readLocalizedTextFromLocaleMaps(
  value: unknown,
  locale: Locale,
): OrderRiskLocalizedTextCandidate | undefined {
  if (!isRecord(value)) return undefined;

  const summaryMap = value.summary;
  const reasonsMap = value.reasons;
  if (!isRecord(summaryMap) && !isRecord(reasonsMap)) return undefined;

  const summary = isRecord(summaryMap)
    ? readTrimmedString(summaryMap[locale])
    : undefined;
  const reasons = isRecord(reasonsMap)
    ? readReasonStrings(reasonsMap[locale])
    : [];

  if (!summary && reasons.length === 0) return undefined;

  const normalizedSummary = normalizeSummary(summary ?? reasons[0] ?? "");
  if (!normalizedSummary) return undefined;

  return {
    summary: normalizedSummary,
    reasons: normalizeReasons(reasons, normalizedSummary),
  };
}

function coerceOrderRiskLocalizedContent(
  localizedContent: unknown,
): Partial<Record<Locale, OrderRiskLocalizedTextCandidate>> {
  if (!isRecord(localizedContent)) return {};

  const result: Partial<Record<Locale, OrderRiskLocalizedTextCandidate>> = {};

  for (const locale of ORDER_RISK_OUTPUT_LOCALES) {
    const localeContent =
      readOrderRiskLocalizedText(localizedContent[locale]) ??
      readLocalizedTextFromLocaleMaps(localizedContent, locale);

    if (localeContent) {
      result[locale] = localeContent;
    }
  }

  const directContent = readOrderRiskLocalizedText(localizedContent);
  if (directContent && !result[DEFAULT_LOCALE]) {
    result[DEFAULT_LOCALE] = directContent;
  }

  return result;
}

export function buildFallbackOrderRiskLocalizedText(
  evaluation: OrderRiskDeterministicEvaluation,
): OrderRiskLocalizedTextCandidate {
  const primarySignals = evaluation.signals.slice(0, 4);
  if (primarySignals.length === 0) {
    const safeSignals = evaluation.safeSignals.slice(0, 4);
    const reasons =
      safeSignals.length > 0
        ? safeSignals
        : ["No deterministic risk signals were detected."];

    return {
      summary:
        "No major risk signals were detected by the deterministic checks.",
      reasons,
    };
  }

  return {
    summary: `Risk review generated from deterministic checks. Main signal: ${primarySignals[0]?.title ?? "risk signal"}.`,
    reasons: primarySignals.map((signal) => signal.detail || signal.title),
  };
}

export function buildFallbackOrderRiskLocalizedContent(
  evaluation: OrderRiskDeterministicEvaluation,
): Record<Locale, OrderRiskLocalizedTextCandidate> {
  const fallback = buildFallbackOrderRiskLocalizedText(evaluation);

  return Object.fromEntries(
    ORDER_RISK_OUTPUT_LOCALES.map((locale) => [locale, fallback]),
  ) as Record<Locale, OrderRiskLocalizedTextCandidate>;
}

export function normalizeOrderRiskAiResult(
  result: OrderRiskAiResultCandidate,
  evaluation?: OrderRiskDeterministicEvaluation,
): NormalizedOrderRiskAiResult {
  const localizedContent = coerceOrderRiskLocalizedContent(
    result.localizedContent,
  );
  const fallback =
    localizedContent[DEFAULT_LOCALE] ??
    localizedContent[Locale.en] ??
    ORDER_RISK_OUTPUT_LOCALES.map((locale) => localizedContent[locale]).find(
      (content): content is OrderRiskLocalizedTextCandidate => Boolean(content),
    ) ??
    (evaluation ? buildFallbackOrderRiskLocalizedText(evaluation) : undefined);

  if (!fallback) {
    throw new Error("Order risk AI response did not include localizedContent.");
  }

  return {
    fraudScore: result.fraudScore,
    operationalScore: result.operationalScore,
    localizedContent: Object.fromEntries(
      ORDER_RISK_OUTPUT_LOCALES.map((locale) => [
        locale,
        localizedContent[locale] ?? fallback,
      ]),
    ) as Record<Locale, OrderRiskLocalizedTextCandidate>,
    ...(typeof result.confidence === "number"
      ? { confidence: result.confidence }
      : {}),
  };
}

function pushSignal(
  signals: OrderRiskSignal[],
  fraudScore: { value: number },
  operationalScore: { value: number },
  signal: OrderRiskSignal,
) {
  signals.push(signal);
  if (signal.dimension === OrderRiskDimension.FRAUD) {
    fraudScore.value += signal.weight;
  }
  if (signal.dimension === OrderRiskDimension.OPERATIONAL) {
    operationalScore.value += signal.weight;
  }
}

function subtractSignal(
  safeSignals: string[],
  fraudScore: { value: number },
  operationalScore: { value: number },
  label: string,
  fraudReduction: number,
  operationalReduction: number,
) {
  safeSignals.push(label);
  fraudScore.value -= fraudReduction;
  operationalScore.value -= operationalReduction;
}

function includesManualOrderMarker(specialNotes: string): boolean {
  return MANUAL_ORDER_PATTERNS.some((pattern) => pattern.test(specialNotes));
}

export function looksSuspiciousEmail(email?: string): boolean {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [, domain = ""] = normalizedEmail.split("@");

  return (
    TEST_EMAIL_PATTERNS.some((pattern) => pattern.test(normalizedEmail)) ||
    SUSPICIOUS_EMAIL_DOMAIN_PARTS.some((part) => domain.includes(part))
  );
}

export function getOrderRiskLatestDocPath(channelId: string, orderId: string) {
  return `channels/${channelId}/orders/${orderId}/${ORDER_RISK_ANALYSIS_COLLECTION}/${ORDER_RISK_ANALYSIS_LATEST_DOC_ID}`;
}

export function getOrderRiskHistoryDocPath(
  channelId: string,
  orderId: string,
  runId: string,
) {
  return `channels/${channelId}/orders/${orderId}/${ORDER_RISK_ANALYSIS_COLLECTION}/order-risk-${runId}`;
}

export function getOrderRiskLevel(score: number): OrderRiskLevel {
  if (score >= 70) {
    return OrderRiskLevel.HIGH;
  }
  if (score >= 40) {
    return OrderRiskLevel.MEDIUM;
  }
  return OrderRiskLevel.LOW;
}

export function getOrderRiskRecommendation(
  fraudScore: number,
  operationalScore: number,
): OrderRiskRecommendation {
  const overallScore = Math.max(fraudScore, operationalScore);
  if (overallScore >= 70) {
    return OrderRiskRecommendation.HOLD;
  }
  if (overallScore >= 40) {
    return OrderRiskRecommendation.REVIEW;
  }
  return OrderRiskRecommendation.PROCEED;
}

export function extractOrderRiskSnapshot(order: Order): OrderRiskSnapshot {
  const nestedCustomer = isNestedCustomer(order.customer)
    ? order.customer
    : null;
  const shipping = order.shipping;
  const billing = order.billing;

  return {
    orderId: order.id,
    channelId: order.channelId,
    number: order.number,
    totalPrice: order.totalPrice,
    currency: order.currency,
    paymentType: order.paymentType,
    paymentStatus: order.paymentStatus,
    shippingOption: order.shippingOption,
    isTest: order.isTest,
    specialNotes: order.specialNotes ?? "",
    itemNames: order.items.map((item) => item.name || item.product?.name || ""),
    customerName:
      (nestedCustomer?.personName ?? nestedCustomer?.name ?? "").trim() ||
      (typeof order.customer === "string" ? order.customer : ""),
    customerEmail: nestedCustomer?.email ?? order.email ?? order.contact.email,
    customerCompanyName: nestedCustomer?.name,
    contactName: order.contact.name,
    contactEmail: order.contact.email ?? order.email,
    contactPhone: order.contact.phone,
    shippingName: shipping?.name,
    shippingCity: shipping?.city,
    shippingCountry: shipping?.country,
    billingName: billing?.name,
    billingCity: billing?.city,
    billingCountry: billing?.country,
    externalSourceProvider: order.externalSource?.provider,
    externalBuyerLogin: order.externalSource?.externalBuyerLogin,
    externalPaymentId: order.externalSource?.externalPaymentId,
    pickupPointName: order.externalSource?.pickupPointName,
    hasNestedCustomer: nestedCustomer !== null,
    isFromStore: order.isFromStore,
  };
}

export function buildOrderRiskHashInput(
  snapshot: OrderRiskSnapshot,
): Record<string, unknown> {
  return {
    channelId: snapshot.channelId,
    orderId: snapshot.orderId,
    totalPrice: snapshot.totalPrice,
    currency: snapshot.currency,
    paymentType: snapshot.paymentType,
    paymentStatus: snapshot.paymentStatus,
    shippingOption: snapshot.shippingOption,
    isTest: snapshot.isTest,
    specialNotes: snapshot.specialNotes,
    itemNames: snapshot.itemNames,
    customerName: snapshot.customerName,
    customerEmail: snapshot.customerEmail,
    customerCompanyName: snapshot.customerCompanyName,
    contactName: snapshot.contactName,
    contactEmail: snapshot.contactEmail,
    contactPhone: snapshot.contactPhone,
    shippingName: snapshot.shippingName,
    shippingCity: snapshot.shippingCity,
    shippingCountry: snapshot.shippingCountry,
    billingName: snapshot.billingName,
    billingCity: snapshot.billingCity,
    billingCountry: snapshot.billingCountry,
    externalSourceProvider: snapshot.externalSourceProvider,
    externalBuyerLogin: snapshot.externalBuyerLogin,
    externalPaymentId: snapshot.externalPaymentId,
    pickupPointName: snapshot.pickupPointName,
    hasNestedCustomer: snapshot.hasNestedCustomer,
    isFromStore: snapshot.isFromStore,
  };
}

export function evaluateOrderRiskDeterministically(
  snapshot: OrderRiskSnapshot,
): OrderRiskDeterministicEvaluation {
  const signals: OrderRiskSignal[] = [];
  const safeSignals: string[] = [];
  const fraudScore = { value: 0 };
  const operationalScore = { value: 0 };
  const totalPriceMajor = snapshot.totalPrice / 100;
  const suspiciousEmail = looksSuspiciousEmail(
    snapshot.customerEmail ?? snapshot.contactEmail,
  );

  if (snapshot.isTest) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "explicit-test-order",
      title: "Explicit test order",
      detail: "The order is marked as a test order.",
      dimension: OrderRiskDimension.FRAUD,
      weight: 80,
    });
  }

  if (suspiciousEmail) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "suspicious-email",
      title: "Suspicious email pattern",
      detail:
        "The email looks like a test, disposable, or otherwise suspicious address.",
      dimension: OrderRiskDimension.FRAUD,
      weight: 45,
    });
  }

  if (SAFE_PAYMENT_TYPES.has(snapshot.paymentType)) {
    subtractSignal(
      safeSignals,
      fraudScore,
      operationalScore,
      "Trusted prepaid payment method",
      20,
      10,
    );
  }

  if (snapshot.paymentStatus === PaymentStatus.COMPLETED) {
    subtractSignal(
      safeSignals,
      fraudScore,
      operationalScore,
      "Payment already confirmed",
      25,
      5,
    );
  }

  if (
    snapshot.paymentType === PaymentType.ON_PICKUP ||
    snapshot.paymentType === PaymentType.ON_DELIVERY
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "manual-payment-flow",
      title: "Manual payment flow",
      detail:
        "The order uses a pay-on-pickup or pay-on-delivery flow that increases no-show / fulfillment risk.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: snapshot.paymentType === PaymentType.ON_DELIVERY ? 30 : 20,
    });
  }

  if (
    snapshot.paymentType === PaymentType.ON_PICKUP &&
    totalPriceMajor >= 1000
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "high-value-pickup-order",
      title: "High-value pickup order",
      detail:
        "A high-value order paid on pickup may be legitimate, but it carries elevated operational and no-show risk.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: 40,
    });
  } else if (
    snapshot.paymentType === PaymentType.ON_PICKUP &&
    totalPriceMajor >= 40
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "pickup-order",
      title: "Pickup payment requires review",
      detail:
        "Pickup payment still carries some operational risk even at a lower basket value.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: 12,
    });
  }

  if (
    totalPriceMajor >= 1000 &&
    snapshot.paymentStatus !== PaymentStatus.COMPLETED &&
    !SAFE_PAYMENT_TYPES.has(snapshot.paymentType)
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "high-value-unconfirmed-payment",
      title: "High-value order without confirmed payment",
      detail:
        "The order amount is high and payment is not yet confirmed by a trusted prepaid flow.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: 25,
    });
  }

  if (
    snapshot.shippingCountry &&
    snapshot.billingCountry &&
    snapshot.shippingCountry !== snapshot.billingCountry
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "country-mismatch",
      title: "Shipping and billing country mismatch",
      detail:
        "Shipping and billing countries differ, which can be a meaningful fraud signal depending on the order context.",
      dimension: OrderRiskDimension.FRAUD,
      weight: 20,
    });
  }

  if (
    snapshot.specialNotes &&
    includesManualOrderMarker(snapshot.specialNotes) &&
    snapshot.paymentType === PaymentType.ON_PICKUP
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "manual-pickup-order-note",
      title: "Manual / phone pickup order note",
      detail:
        "The order notes suggest a manual or phone-led order flow combined with payment on pickup.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: 20,
    });
  }

  if (
    !snapshot.contactPhone &&
    snapshot.paymentType === PaymentType.ON_PICKUP
  ) {
    pushSignal(signals, fraudScore, operationalScore, {
      code: "missing-phone-for-pickup",
      title: "Missing phone for pickup order",
      detail:
        "A pickup order without a phone number is harder to verify and coordinate.",
      dimension: OrderRiskDimension.OPERATIONAL,
      weight: 15,
    });
  }

  if (
    snapshot.externalSourceProvider === "ALLEGRO" &&
    snapshot.externalPaymentId
  ) {
    subtractSignal(
      safeSignals,
      fraudScore,
      operationalScore,
      "External source includes payment reference",
      8,
      4,
    );
  }

  if (snapshot.hasNestedCustomer) {
    subtractSignal(
      safeSignals,
      fraudScore,
      operationalScore,
      "Customer profile is linked to the order",
      5,
      0,
    );
  }

  return {
    snapshot,
    fraudScoreHint: clampScore(fraudScore.value),
    operationalScoreHint: clampScore(operationalScore.value),
    signals,
    safeSignals,
  };
}

export function buildOrderRiskSystemPrompt(): string {
  return `You are an order-risk analyst for a printing and e-commerce admin system.

Your job is to evaluate TWO separate dimensions:
1. Fraud / identity / payment risk
2. Operational / no-show / problematic-order risk

Important business rules:
- High-value orders paid on pickup or delivery are often an OPERATIONAL risk, not necessarily card fraud.
- Trusted prepaid methods such as STRIPE, PRZELEWY24, PROFORMA and ALLEGRO lower fraud risk.
- Confirmed payment strongly lowers fraud risk.
- Explicit test orders, suspicious test/disposable-looking emails, or obvious fake identities increase fraud risk.
- You must treat the provided deterministic signals as first-class evidence.
- You may move the scores up or down from the deterministic hints, but only when the order details clearly justify it.
- Monetary values are stored in MINOR currency units. Example: 13800 PLN cents means 138.00 PLN, not 13,800 PLN.
- Use the provided totalPriceMajor field when reasoning about order value in natural language.
- Return localized operator-facing text for every locale listed in outputLocales.
- localizedContent must be keyed by locale. Each locale value must contain a non-empty summary string and a non-empty reasons array.
- Do not return empty locale objects.
- Never expose internal enum codes such as COMPLETED, PENDING, PROFORMA, or ON_PICKUP in the operator-facing summary or reasons, instead use the localized labels.

Return JSON only. Keep reasons concise and operator-friendly.`;
}

export function buildOrderRiskPrompt(
  evaluation: OrderRiskDeterministicEvaluation,
): string {
  const totalPriceMajor = Number(
    (evaluation.snapshot.totalPrice / 100).toFixed(2),
  );

  return JSON.stringify(
    {
      order: {
        ...evaluation.snapshot,
        totalPriceMajor,
      },
      pricingContext: {
        amountUnit: "minor",
        currency: evaluation.snapshot.currency,
        totalPriceMinor: evaluation.snapshot.totalPrice,
        totalPriceMajor,
      },
      outputLocales: ORDER_RISK_OUTPUT_LOCALES,
      deterministicHints: {
        fraudScoreHint: evaluation.fraudScoreHint,
        operationalScoreHint: evaluation.operationalScoreHint,
      },
      signals: evaluation.signals,
      safeSignals: evaluation.safeSignals,
    },
    null,
    2,
  );
}
