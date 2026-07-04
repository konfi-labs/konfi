import "server-only";

import {
  type AiUsageEventSource,
  type AiUsageModality,
  type DeploymentMode,
  type LimitDeniedEvent,
  type LimitDeniedReason,
  type Tenant,
  type TenantContext,
  type TenantModuleFlags,
  type TenantPlanId,
  type TenantPlanLimits,
  type UsageDelta,
  type UsageMetricKey,
  type UsageRecordedEvent,
} from "@sblyvwx/cloud-contracts";
import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

export type AiUsageEnforcementMode = "enforce" | "log-only" | "disabled";

export type AiUsageTextUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
  };
  outputTokenDetails?: {
    reasoningTokens?: number;
  };
};

export type AiUsageReservation = {
  id: string;
  tenantId: string;
  deploymentMode: DeploymentMode;
  mode: AiUsageEnforcementMode;
  modality: AiUsageModality;
  source: AiUsageEventSource;
  periodKey: string;
  /**
   * ISO week key (e.g. `2025-W02`) used to track the weekly AI text token
   * window. Only populated for `modality === "text"`.
   */
  weeklyPeriodKey?: string;
  /**
   * 5-hour bucket key (e.g. `2025-01-08T15`) aligned to UTC hours
   * 00/05/10/15/20 used to track the burst AI text token window.
   * Only populated for `modality === "text"`.
   */
  fiveHourPeriodKey?: string;
  planId?: TenantPlanId;
  model?: string;
  provider?: string;
  userId?: string;
  channelId?: string;
  runId?: string;
  jobId?: string;
  conversationId?: string;
  estimatedTotalTokens: number;
  reservedImageGenerations: number;
  reservedVideoGenerations: number;
};

export class AiUsageQuotaError extends Error {
  code = "AI_USAGE_QUOTA_EXCEEDED";
  modality: AiUsageModality;
  source: AiUsageEventSource;
  current?: number;
  limit?: number;
  requested?: number;

  constructor(params: {
    current?: number;
    limit?: number;
    message: string;
    modality: AiUsageModality;
    requested?: number;
    source: AiUsageEventSource;
  }) {
    super(params.message);
    this.name = "AiUsageQuotaError";
    this.modality = params.modality;
    this.source = params.source;
    this.current = params.current;
    this.limit = params.limit;
    this.requested = params.requested;
  }
}

type RuntimeUsageSnapshot = {
  aiTextTokensUsed?: number;
  aiImageGenerationsUsed?: number;
  aiVideoGenerationsUsed?: number;
};

type RuntimePlanSnapshot = {
  limits?: TenantPlanLimits;
  moduleFlags?: TenantModuleFlags;
  quotaEnforcementDisabled?: boolean;
};

type TenantRuntimeDocument = Tenant & {
  planSnapshot?: RuntimePlanSnapshot;
  runtimePlanSnapshot?: RuntimePlanSnapshot;
  usage?: RuntimeUsageSnapshot;
  usageLimits?: TenantPlanLimits;
  usageSnapshot?: RuntimeUsageSnapshot;
  runtimeUsage?: RuntimeUsageSnapshot;
};

type RuntimeSnapshot = {
  tenant: TenantRuntimeDocument | null;
  tenantId: string;
  deploymentMode: DeploymentMode;
  limits: TenantPlanLimits;
  moduleFlags: TenantModuleFlags;
  planId?: TenantPlanId;
  enforcementDisabled: boolean;
};

type LimitDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      current?: number;
      limit?: number;
      message: string;
      reason: LimitDeniedReason;
      requested?: number;
    };

const DEFAULT_DEDICATED_TENANT_ID = "dedicated";
const AI_USAGE_MONTHLY_COLLECTION = "aiUsageMonthly";
const AI_USAGE_WEEKLY_COLLECTION = "aiUsageWeekly";
const AI_USAGE_5H_COLLECTION = "aiUsage5h";
const AI_USAGE_EVENTS_COLLECTION = "aiUsageEvents";
const USAGE_EVENTS_COLLECTION = "usageEvents";
const USAGE_SUMMARIES_COLLECTION = "usageSummaries";
const USAGE_WINDOW_SUMMARIES_COLLECTION = "usageWindowSummaries";

function getMonthlyPeriodKeyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * ISO 8601 week key `YYYY-Www` in UTC. Week 1 contains the first Thursday of
 * the year.
 */
function getWeeklyPeriodKeyUtc(date = new Date()): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${weekNumber.toString().padStart(2, "0")}`;
}

/**
 * 5-hour bucket key `YYYY-MM-DDTHH` aligned to UTC hours 00/05/10/15/20.
 */
function getFiveHourPeriodKeyUtc(date = new Date()): string {
  const bucketHour = Math.floor(date.getUTCHours() / 5) * 5;
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}T${bucketHour.toString().padStart(2, "0")}`;
}

function getWeeklyUsagePeriod(periodKey: string): {
  endsAt: string;
  key: string;
  kind: "week";
  startsAt: string;
  timezone: string;
} {
  // periodKey: `YYYY-Www` (ISO 8601). Compute Monday 00:00 UTC start and the
  // following Monday 00:00 UTC end.
  const [yearText, weekText] = periodKey.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  // ISO week 1 contains Jan 4. Find that, then offset by week-1 weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return {
    endsAt: end.toISOString(),
    key: periodKey,
    kind: "week",
    startsAt: start.toISOString(),
    timezone: "UTC",
  };
}

function getFiveHourUsagePeriod(periodKey: string): {
  endsAt: string;
  key: string;
  kind: "five_hour";
  startsAt: string;
  timezone: string;
} {
  // periodKey: `YYYY-MM-DDTHH` where HH ∈ {00,05,10,15,20}.
  const [datePart, hourText] = periodKey.split("T");
  const [yearText, monthText, dayText] = datePart.split("-");
  const start = new Date(
    Date.UTC(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText),
    ),
  );
  const end = new Date(start);
  end.setUTCHours(start.getUTCHours() + 5);
  return {
    endsAt: end.toISOString(),
    key: periodKey,
    kind: "five_hour",
    startsAt: start.toISOString(),
    timezone: "UTC",
  };
}

function withoutUndefined<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as T;
}

function getMonthlyUsagePeriod(periodKey: string) {
  const [yearText, monthText] = periodKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  return {
    endsAt: end.toISOString(),
    key: periodKey,
    kind: "month",
    startsAt: start.toISOString(),
    timezone: "UTC",
  } as const;
}

function aiMetricKeyForModality(modality: AiUsageModality): UsageMetricKey {
  if (modality === "image") return "ai.image_generations";
  if (modality === "video") return "ai.video_generations";
  return "ai.text_tokens";
}

function hasIncrements(increments: Record<string, number>) {
  return Object.keys(increments).length > 0;
}

function getUsageSummaryId(tenantId: string) {
  return `${tenantId}_current`;
}

function getUsageWindowSummaryId(params: {
  metric: string;
  periodKey: string;
  periodKind: "five_hour" | "week";
  tenantId: string;
}) {
  return `${params.tenantId}_${params.metric}_${params.periodKind}_${params.periodKey}`;
}

function isUsageWindowKind(value: string): value is "five_hour" | "week" {
  return value === "five_hour" || value === "week";
}

function buildUsageCounterIncrements(deltas: UsageDelta[]) {
  const counters: Record<string, number> = {};
  const estimatedCounters: Record<string, number> = {};

  for (const delta of deltas) {
    if (delta.amount === 0) continue;

    const target = delta.estimated ? estimatedCounters : counters;
    target[delta.key] = (target[delta.key] ?? 0) + delta.amount;
  }

  return { counters, estimatedCounters };
}

function applyCounterIncrements(params: {
  counters: Record<string, number>;
  field: "counters" | "estimatedCounters";
  reference: DocumentReference;
  transaction: Transaction;
}) {
  for (const [counterKey, amount] of Object.entries(params.counters)) {
    params.transaction.update(
      params.reference,
      new FieldPath(params.field, counterKey),
      FieldValue.increment(amount),
    );
  }
}

function aggregateUsageRecordedEvent(params: {
  event: UsageRecordedEvent;
  reference: DocumentReference;
  snapshotExists: boolean;
  transaction: Transaction;
}) {
  const increments = buildUsageCounterIncrements(params.event.deltas);
  const aggregated =
    hasIncrements(increments.counters) ||
    hasIncrements(increments.estimatedCounters);

  params.transaction.set(
    params.reference,
    withoutUndefined({
      tenantId: params.event.tenantId,
      period: "current",
      planId: params.event.planId,
      updatedAt: FieldValue.serverTimestamp(),
      ...(params.snapshotExists
        ? {}
        : {
            counters: increments.counters,
            estimatedCounters: increments.estimatedCounters,
            createdAt: FieldValue.serverTimestamp(),
          }),
    }),
    { merge: true },
  );

  if (params.snapshotExists) {
    applyCounterIncrements({
      counters: increments.counters,
      field: "counters",
      reference: params.reference,
      transaction: params.transaction,
    });
    applyCounterIncrements({
      counters: increments.estimatedCounters,
      field: "estimatedCounters",
      reference: params.reference,
      transaction: params.transaction,
    });
  }

  return aggregated;
}

function resolveUsageWindowReference(
  firestore: Firestore,
  event: UsageRecordedEvent,
) {
  if (!event.tenantId || !isUsageWindowKind(event.period.kind)) {
    return;
  }

  const windowMetric = event.deltas[0]?.key;
  if (!windowMetric) {
    return;
  }

  return firestore.collection(USAGE_WINDOW_SUMMARIES_COLLECTION).doc(
    getUsageWindowSummaryId({
      metric: windowMetric,
      periodKey: event.period.key,
      periodKind: event.period.kind,
      tenantId: event.tenantId,
    }),
  );
}

function aggregateUsageWindowEvent(params: {
  event: UsageRecordedEvent;
  reference: DocumentReference;
  snapshotExists: boolean;
  transaction: Transaction;
}) {
  if (!isUsageWindowKind(params.event.period.kind)) {
    return false;
  }

  const increments = buildUsageCounterIncrements(params.event.deltas);
  if (
    !(
      hasIncrements(increments.counters) ||
      hasIncrements(increments.estimatedCounters)
    )
  ) {
    return false;
  }

  params.transaction.set(
    params.reference,
    withoutUndefined({
      metric: params.event.deltas[0]?.key,
      periodKey: params.event.period.key,
      periodKind: params.event.period.kind,
      planId: params.event.planId,
      tenantId: params.event.tenantId,
      updatedAt: FieldValue.serverTimestamp(),
      ...(params.snapshotExists
        ? {}
        : {
            counters: increments.counters,
            estimatedCounters: increments.estimatedCounters,
            createdAt: FieldValue.serverTimestamp(),
          }),
    }),
    { merge: true },
  );

  if (params.snapshotExists) {
    applyCounterIncrements({
      counters: increments.counters,
      field: "counters",
      reference: params.reference,
      transaction: params.transaction,
    });
    applyCounterIncrements({
      counters: increments.estimatedCounters,
      field: "estimatedCounters",
      reference: params.reference,
      transaction: params.transaction,
    });
  }

  return true;
}

function shouldAggregateCurrentUsageSummary(event: UsageRecordedEvent) {
  return event.period.kind !== "five_hour";
}

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function getConfiguredMode(
  context: TenantContext,
  env: NodeJS.ProcessEnv,
): AiUsageEnforcementMode {
  const configured = normalizeEnvValue(env.AI_USAGE_ENFORCEMENT);

  if (configured === "disabled" || configured === "off" || configured === "0") {
    return "disabled";
  }

  if (
    configured === "log-only" ||
    configured === "log_only" ||
    configured === "log"
  ) {
    return "log-only";
  }

  if (
    configured === "enforce" ||
    configured === "enabled" ||
    configured === "1"
  ) {
    return "enforce";
  }

  if (context.deploymentMode === "saas" || context.requireTenantId) {
    return "enforce";
  }

  return normalizeEnvValue(env.AI_USAGE_LOG_ONLY) === "true"
    ? "log-only"
    : "disabled";
}

function getTenantIdForUsage(
  context: TenantContext,
  env: NodeJS.ProcessEnv,
): string {
  const tenantId = context.tenantId?.trim();
  if (tenantId) return tenantId;

  if (context.deploymentMode === "saas" || context.requireTenantId) {
    throw new Error("Tenant context is required for AI usage metering.");
  }

  return (
    env.KONFI_DEDICATED_TENANT_ID?.trim() ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    DEFAULT_DEDICATED_TENANT_ID
  );
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  if (number === undefined || number < 0) return undefined;
  return Math.floor(number);
}

function readLimits(tenant: TenantRuntimeDocument | null): TenantPlanLimits {
  if (!tenant) return {};

  return (
    tenant.runtimePlanSnapshot?.limits ??
    tenant.planSnapshot?.limits ??
    tenant.usageLimits ??
    tenant.limits ??
    {}
  );
}

function readModuleFlags(
  tenant: TenantRuntimeDocument | null,
): TenantModuleFlags {
  if (!tenant) return {};

  return {
    ...(tenant.runtimePlanSnapshot?.moduleFlags ?? {}),
    ...(tenant.planSnapshot?.moduleFlags ?? {}),
    ...(tenant.moduleFlags ?? {}),
  };
}

function readEnforcementDisabled(
  tenant: TenantRuntimeDocument | null,
): boolean {
  if (!tenant) return false;

  return Boolean(
    tenant.quotaEnforcementDisabled ??
    tenant.runtimePlanSnapshot?.quotaEnforcementDisabled ??
    tenant.planSnapshot?.quotaEnforcementDisabled,
  );
}

function isFreePlan(planId: TenantPlanId | undefined): boolean {
  return planId?.trim().toLowerCase() === "free";
}

function isFreePlanTextModelAllowed(model: string | undefined): boolean {
  if (!model) return true;

  const normalized = model.toLowerCase();
  if (
    normalized.includes("pro") ||
    normalized.includes("image") ||
    normalized.includes("veo") ||
    normalized.includes("flux") ||
    normalized.includes("grok") ||
    normalized.includes("gpt-image")
  ) {
    return false;
  }

  return (
    normalized.includes("flash") ||
    normalized.includes("lite") ||
    normalized === "assistant-fast"
  );
}

function moduleFlagForModality(
  modality: AiUsageModality,
): keyof TenantModuleFlags {
  if (modality === "image") return "aiImage";
  if (modality === "video") return "aiVideo";
  return "aiText";
}

function getWeeklyTextLimit(limits: TenantPlanLimits) {
  return readPositiveInteger(limits.aiTextTokensPerWeek);
}

function getFiveHourTextLimit(limits: TenantPlanLimits) {
  return readPositiveInteger(limits.aiTextTokensPer5Hours);
}

function getMonthlyDocPath(periodKey: string, tenantId: string): string {
  return `${AI_USAGE_MONTHLY_COLLECTION}/${periodKey}/tenants/${tenantId}`;
}

function getWeeklyDocPath(periodKey: string, tenantId: string): string {
  return `${AI_USAGE_WEEKLY_COLLECTION}/${periodKey}/tenants/${tenantId}`;
}

function getFiveHourDocPath(periodKey: string, tenantId: string): string {
  return `${AI_USAGE_5H_COLLECTION}/${periodKey}/tenants/${tenantId}`;
}

function getUsedTextTokens(data: Record<string, unknown>): number {
  return (
    (readFiniteNumber(data.usedInputTokens) ?? 0) +
    (readFiniteNumber(data.usedOutputTokens) ?? 0)
  );
}

function getReservedTextTokens(data: Record<string, unknown>): number {
  return readFiniteNumber(data.reservedEstimatedTokens) ?? 0;
}

function getMonthlyUsageForModality(
  data: Record<string, unknown>,
  modality: AiUsageModality,
): number {
  if (modality === "image") {
    return readFiniteNumber(data.usedImageGenerations) ?? 0;
  }

  if (modality === "video") {
    return readFiniteNumber(data.usedVideoGenerations) ?? 0;
  }

  return getUsedTextTokens(data) + getReservedTextTokens(data);
}

function getRequestedUnits(params: {
  estimatedTotalTokens: number;
  imageGenerations?: number;
  modality: AiUsageModality;
  videoGenerations?: number;
}): number {
  if (params.modality === "image") {
    return Math.max(1, Math.floor(params.imageGenerations ?? 1));
  }

  if (params.modality === "video") {
    return Math.max(1, Math.floor(params.videoGenerations ?? 1));
  }

  return Math.max(1, Math.floor(params.estimatedTotalTokens));
}

function getLimitForModality(params: {
  limits: TenantPlanLimits;
  modality: AiUsageModality;
  planId?: TenantPlanId;
}): number | undefined {
  if (params.modality === "image") {
    return readPositiveInteger(params.limits.aiImageGenerationsPerMonth);
  }

  if (params.modality === "video") {
    return readPositiveInteger(params.limits.aiVideoGenerationsPerMonth);
  }

  return;
}

function getDeniedMessage(params: {
  current?: number;
  limit?: number;
  modality: AiUsageModality;
  requested?: number;
}): string {
  if (params.limit === undefined) {
    return `AI ${params.modality} usage is not available on this plan.`;
  }

  return `AI ${params.modality} quota exceeded: ${params.current ?? 0} + ${
    params.requested ?? 0
  } exceeds ${params.limit}.`;
}

function getBaseMonthlyPayload(snapshot: RuntimeSnapshot) {
  return {
    tenantId: snapshot.tenantId,
    deploymentMode: snapshot.deploymentMode,
    ...(snapshot.planId ? { planId: snapshot.planId } : {}),
    ...(snapshot.limits.aiImageGenerationsPerMonth !== undefined
      ? { includedImageGenerations: snapshot.limits.aiImageGenerationsPerMonth }
      : {}),
    ...(snapshot.limits.aiVideoGenerationsPerMonth !== undefined
      ? { includedVideoGenerations: snapshot.limits.aiVideoGenerationsPerMonth }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function getRuntimeSnapshot(params: {
  context: TenantContext;
  env: NodeJS.ProcessEnv;
  firestore: Firestore;
}): Promise<RuntimeSnapshot> {
  const tenantId = getTenantIdForUsage(params.context, params.env);
  const requiresTenantDoc =
    params.context.deploymentMode === "saas" || params.context.requireTenantId;
  let tenant: TenantRuntimeDocument | null = null;

  if (params.context.tenantId) {
    const tenantSnapshot = await params.firestore
      .collection("tenants")
      .doc(tenantId)
      .get();

    if (!tenantSnapshot.exists) {
      if (requiresTenantDoc) {
        throw new Error(`Tenant runtime snapshot ${tenantId} was not found.`);
      }
    } else {
      tenant = tenantSnapshot.data() as TenantRuntimeDocument;
    }
  }

  return {
    tenant,
    tenantId,
    deploymentMode: params.context.deploymentMode,
    limits: readLimits(tenant),
    moduleFlags: readModuleFlags(tenant),
    planId: tenant?.planId,
    enforcementDisabled: readEnforcementDisabled(tenant),
  };
}

async function recordAiUsageEvent(params: {
  cachedInputTokens?: number;
  channelId?: string;
  conversationId?: string;
  costUsdCents?: number;
  current?: number;
  estimated?: boolean;
  firestore: Firestore;
  inputTokens?: number;
  jobId?: string;
  limit?: number;
  modality: AiUsageModality;
  model?: string;
  outputTokens?: number;
  overLimit?: boolean;
  provider?: string;
  reasoningTokens?: number;
  requested?: number;
  reservationId?: string;
  runId?: string;
  source: AiUsageEventSource;
  status: "reserved" | "finalized" | "released" | "denied" | "logged";
  tenantId: string;
  userId?: string;
}): Promise<void> {
  await params.firestore.collection(AI_USAGE_EVENTS_COLLECTION).add({
    tenantId: params.tenantId,
    source: params.source,
    modality: params.modality,
    status: params.status,
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.channelId ? { channelId: params.channelId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.jobId ? { jobId: params.jobId } : {}),
    ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    ...(params.reservationId ? { reservationId: params.reservationId } : {}),
    ...(params.model ? { model: params.model } : {}),
    ...(params.provider ? { provider: params.provider } : {}),
    ...(params.inputTokens !== undefined
      ? { inputTokens: params.inputTokens }
      : {}),
    ...(params.outputTokens !== undefined
      ? { outputTokens: params.outputTokens }
      : {}),
    ...(params.reasoningTokens !== undefined
      ? { reasoningTokens: params.reasoningTokens }
      : {}),
    ...(params.cachedInputTokens !== undefined
      ? { cachedInputTokens: params.cachedInputTokens }
      : {}),
    ...(params.estimated !== undefined ? { estimated: params.estimated } : {}),
    ...(params.costUsdCents !== undefined
      ? { costUsdCents: params.costUsdCents }
      : {}),
    ...(params.overLimit !== undefined ? { overLimit: params.overLimit } : {}),
    ...(params.current !== undefined ? { current: params.current } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.requested !== undefined ? { requested: params.requested } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function recordUsageControlEvent(
  firestore: Firestore,
  event: LimitDeniedEvent | UsageRecordedEvent,
): Promise<void> {
  try {
    await firestore.runTransaction(async (tx) => {
      const eventRef = firestore
        .collection(USAGE_EVENTS_COLLECTION)
        .doc(event.eventId);
      const eventSnapshot = await tx.get(eventRef);

      if (eventSnapshot.exists) {
        return;
      }

      const summaryId =
        event.type === "usage.recorded" &&
        event.tenantId &&
        shouldAggregateCurrentUsageSummary(event)
          ? getUsageSummaryId(event.tenantId)
          : undefined;
      const summaryRef = summaryId
        ? firestore.collection(USAGE_SUMMARIES_COLLECTION).doc(summaryId)
        : undefined;
      const summarySnapshot = summaryRef ? await tx.get(summaryRef) : undefined;
      const windowRef =
        event.type === "usage.recorded"
          ? resolveUsageWindowReference(firestore, event)
          : undefined;
      const windowSnapshot = windowRef ? await tx.get(windowRef) : undefined;

      const summaryAggregated =
        event.type === "usage.recorded" && summaryRef && summarySnapshot
          ? aggregateUsageRecordedEvent({
              event,
              reference: summaryRef,
              snapshotExists: summarySnapshot.exists,
              transaction: tx,
            })
          : false;
      const windowAggregated =
        event.type === "usage.recorded" && windowRef && windowSnapshot
          ? aggregateUsageWindowEvent({
              event,
              reference: windowRef,
              snapshotExists: windowSnapshot.exists,
              transaction: tx,
            })
          : false;

      tx.set(
        eventRef,
        withoutUndefined({
          ...event,
          summaryId,
          aggregatedAt:
            summaryAggregated || windowAggregated
              ? FieldValue.serverTimestamp()
              : undefined,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
      );
    });
  } catch (error) {
    console.error("Failed to record usage control event", error);
  }
}

function usageEventContext(reservation: AiUsageReservation) {
  return withoutUndefined({
    channelId: reservation.channelId,
    conversationId: reservation.conversationId,
    jobId: reservation.jobId,
    model: reservation.model,
    operation: `ai.${reservation.modality}`,
    provider: reservation.provider,
    resourceId: reservation.id,
    resourceType: reservation.modality,
    runId: reservation.runId,
  });
}

function baseUsageEvent(reservation: AiUsageReservation, type: string) {
  return withoutUndefined({
    context: usageEventContext(reservation),
    deploymentMode: reservation.deploymentMode,
    eventId: `${reservation.id}:${type}`,
    occurredAt: new Date().toISOString(),
    period: getMonthlyUsagePeriod(reservation.periodKey),
    planId: reservation.planId,
    source: "ai",
    tenantId: reservation.tenantId,
  });
}

async function recordAiUsageDeniedEvent(params: {
  current?: number;
  firestore: Firestore;
  limit?: number;
  reason: LimitDeniedReason;
  requested?: number;
  reservation: AiUsageReservation;
}): Promise<void> {
  const event = {
    ...baseUsageEvent(params.reservation, "denied"),
    attempted: (params.current ?? 0) + (params.requested ?? 1),
    current: params.current ?? 0,
    hard: true,
    key: aiMetricKeyForModality(params.reservation.modality),
    limit: params.limit ?? null,
    reason: params.reason,
    ...(params.requested !== undefined ? { increment: params.requested } : {}),
    type: "usage.limit_denied",
    unit: params.reservation.modality === "text" ? "tokens" : "count",
  } satisfies LimitDeniedEvent;

  await recordUsageControlEvent(params.firestore, event);
}

async function recordAiUsageRecordedEvent(params: {
  deltas: UsageDelta[];
  firestore: Firestore;
  reservation: AiUsageReservation;
  type: "finalized";
}): Promise<void> {
  if (params.deltas.length === 0) return;

  if (params.reservation.modality !== "text") {
    const event = {
      ...baseUsageEvent(params.reservation, params.type),
      deltas: params.deltas,
      type: "usage.recorded",
    } satisfies UsageRecordedEvent;
    await recordUsageControlEvent(params.firestore, event);
    return;
  }

  if (params.reservation.weeklyPeriodKey) {
    const weeklyEvent = {
      ...baseUsageEvent(params.reservation, `${params.type}:weekly`),
      deltas: params.deltas,
      period: getWeeklyUsagePeriod(params.reservation.weeklyPeriodKey),
      type: "usage.recorded",
    } satisfies UsageRecordedEvent;
    await recordUsageControlEvent(params.firestore, weeklyEvent);
  }

  if (params.reservation.fiveHourPeriodKey) {
    const fiveHourEvent = {
      ...baseUsageEvent(params.reservation, `${params.type}:five_hour`),
      deltas: params.deltas,
      period: getFiveHourUsagePeriod(params.reservation.fiveHourPeriodKey),
      type: "usage.recorded",
    } satisfies UsageRecordedEvent;
    await recordUsageControlEvent(params.firestore, fiveHourEvent);
  }
}

async function recordDeniedUsage(params: {
  current?: number;
  firestore: Firestore;
  limit?: number;
  reason: LimitDeniedReason;
  requested?: number;
  reservation: AiUsageReservation;
}) {
  await recordAiUsageEvent({
    firestore: params.firestore,
    tenantId: params.reservation.tenantId,
    source: params.reservation.source,
    modality: params.reservation.modality,
    status: "denied",
    overLimit: true,
    current: params.current,
    limit: params.limit,
    requested: params.requested,
    reservationId: params.reservation.id,
    userId: params.reservation.userId,
    channelId: params.reservation.channelId,
    runId: params.reservation.runId,
    jobId: params.reservation.jobId,
    conversationId: params.reservation.conversationId,
    model: params.reservation.model,
    provider: params.reservation.provider,
  });
  await recordAiUsageDeniedEvent({
    current: params.current,
    firestore: params.firestore,
    limit: params.limit,
    reason: params.reason,
    requested: params.requested,
    reservation: params.reservation,
  });
}

function getReservePayload(reservation: AiUsageReservation) {
  if (reservation.modality === "image") {
    return {
      reservedImageGenerations: FieldValue.increment(
        reservation.reservedImageGenerations,
      ),
    };
  }

  if (reservation.modality === "video") {
    return {
      reservedVideoGenerations: FieldValue.increment(
        reservation.reservedVideoGenerations,
      ),
    };
  }

  return {
    reservedEstimatedTokens: FieldValue.increment(
      reservation.estimatedTotalTokens,
    ),
  };
}

function decideStaticLimit(params: {
  mode: AiUsageEnforcementMode;
  modality: AiUsageModality;
  moduleFlags: TenantModuleFlags;
  planId?: TenantPlanId;
  model?: string;
}): LimitDecision {
  if (params.mode !== "enforce") {
    return { allowed: true };
  }

  if (params.moduleFlags[moduleFlagForModality(params.modality)] === false) {
    return {
      allowed: false,
      message: `AI ${params.modality} usage is disabled for this plan.`,
      reason: "feature_disabled",
    };
  }

  if (isFreePlan(params.planId)) {
    if (params.modality === "image" || params.modality === "video") {
      return {
        allowed: false,
        limit: 0,
        reason: "feature_disabled",
        requested: 1,
        message: `AI ${params.modality} generation is not available on the Free plan.`,
      };
    }

    if (!isFreePlanTextModelAllowed(params.model)) {
      return {
        allowed: false,
        message: "Free plan AI text usage is limited to low-cost text models.",
        reason: "feature_disabled",
      };
    }
  }

  return { allowed: true };
}

async function reserveInTransaction(params: {
  estimatedTotalTokens: number;
  firestore: Firestore;
  imageGenerations?: number;
  reservation: AiUsageReservation;
  snapshot: RuntimeSnapshot;
  videoGenerations?: number;
}): Promise<LimitDecision> {
  const { firestore, reservation, snapshot } = params;
  const monthlyRef = firestore.doc(
    getMonthlyDocPath(reservation.periodKey, reservation.tenantId),
  );
  const requested = getRequestedUnits({
    estimatedTotalTokens: params.estimatedTotalTokens,
    imageGenerations: params.imageGenerations,
    modality: reservation.modality,
    videoGenerations: params.videoGenerations,
  });

  // Image/video use monthly quota enforcement; text uses dual weekly + 5-hour
  // windows below.
  if (reservation.modality !== "text") {
    const limit = getLimitForModality({
      limits: snapshot.limits,
      modality: reservation.modality,
      planId: snapshot.planId,
    });

    return firestore.runTransaction(async (tx: Transaction) => {
      const monthlySnapshot = await tx.get(monthlyRef);
      const monthlyData = monthlySnapshot.exists
        ? (monthlySnapshot.data() as Record<string, unknown>)
        : {};
      const current = getMonthlyUsageForModality(
        monthlyData,
        reservation.modality,
      );

      if (limit !== undefined && current + requested > limit) {
        return {
          allowed: false,
          current,
          limit,
          reason: "hard_limit_exceeded",
          requested,
          message: getDeniedMessage({
            current,
            limit,
            modality: reservation.modality,
            requested,
          }),
        };
      }

      tx.set(
        monthlyRef,
        {
          ...getBaseMonthlyPayload(snapshot),
          ...getReservePayload(reservation),
        },
        { merge: true },
      );

      return { allowed: true };
    });
  }

  const weeklyLimit = getWeeklyTextLimit(snapshot.limits);
  const fiveHourLimit = getFiveHourTextLimit(snapshot.limits);
  const weeklyRef = reservation.weeklyPeriodKey
    ? firestore.doc(
        getWeeklyDocPath(reservation.weeklyPeriodKey, reservation.tenantId),
      )
    : undefined;
  const fiveHourRef = reservation.fiveHourPeriodKey
    ? firestore.doc(
        getFiveHourDocPath(reservation.fiveHourPeriodKey, reservation.tenantId),
      )
    : undefined;

  return firestore.runTransaction(async (tx: Transaction) => {
    const [weeklySnapshot, fiveHourSnapshot] = await Promise.all([
      weeklyRef ? tx.get(weeklyRef) : Promise.resolve(undefined),
      fiveHourRef ? tx.get(fiveHourRef) : Promise.resolve(undefined),
    ]);
    const weeklyData =
      weeklySnapshot && weeklySnapshot.exists
        ? (weeklySnapshot.data() as Record<string, unknown>)
        : {};
    const fiveHourData =
      fiveHourSnapshot && fiveHourSnapshot.exists
        ? (fiveHourSnapshot.data() as Record<string, unknown>)
        : {};

    const weeklyCurrent = getMonthlyUsageForModality(weeklyData, "text");
    const fiveHourCurrent = getMonthlyUsageForModality(fiveHourData, "text");

    // Reservations must satisfy BOTH the weekly and 5-hour windows before
    // any provider call.
    if (
      fiveHourLimit !== undefined &&
      fiveHourCurrent + requested > fiveHourLimit
    ) {
      return {
        allowed: false,
        current: fiveHourCurrent,
        limit: fiveHourLimit,
        reason: "hard_limit_exceeded",
        requested,
        message: `AI text quota exceeded for the 5-hour burst window: ${fiveHourCurrent} + ${requested} exceeds ${fiveHourLimit}.`,
      };
    }

    if (weeklyLimit !== undefined && weeklyCurrent + requested > weeklyLimit) {
      return {
        allowed: false,
        current: weeklyCurrent,
        limit: weeklyLimit,
        reason: "hard_limit_exceeded",
        requested,
        message: `AI text quota exceeded for the weekly window: ${weeklyCurrent} + ${requested} exceeds ${weeklyLimit}.`,
      };
    }

    if (weeklyRef) {
      tx.set(
        weeklyRef,
        {
          ...getBaseMonthlyPayload(snapshot),
          periodKey: reservation.weeklyPeriodKey,
          periodKind: "week",
          ...getReservePayload(reservation),
        },
        { merge: true },
      );
    }

    if (fiveHourRef) {
      tx.set(
        fiveHourRef,
        {
          ...getBaseMonthlyPayload(snapshot),
          periodKey: reservation.fiveHourPeriodKey,
          periodKind: "five_hour",
          ...getReservePayload(reservation),
        },
        { merge: true },
      );
    }

    return { allowed: true };
  });
}

export function estimateAiUsageTextTokens(value: unknown): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 1;
    return Math.max(1, Math.ceil(trimmed.length / 4));
  }

  try {
    return estimateAiUsageTextTokens(JSON.stringify(value));
  } catch {
    return 1024;
  }
}

export async function reserveAiUsage(params: {
  channelId?: string;
  context: TenantContext;
  conversationId?: string;
  estimatedTotalTokens?: number;
  firestore: Firestore;
  imageGenerations?: number;
  jobId?: string;
  modality: AiUsageModality;
  model?: string;
  provider?: string;
  runId?: string;
  source: AiUsageEventSource;
  userId?: string;
  videoGenerations?: number;
}): Promise<AiUsageReservation> {
  const configuredMode = getConfiguredMode(params.context, process.env);
  const snapshot = await getRuntimeSnapshot({
    context: params.context,
    env: process.env,
    firestore: params.firestore,
  });
  const mode =
    configuredMode === "enforce" && snapshot.enforcementDisabled
      ? "log-only"
      : configuredMode;
  const periodKey = getMonthlyPeriodKeyUtc();
  const weeklyPeriodKey =
    params.modality === "text" ? getWeeklyPeriodKeyUtc() : undefined;
  const fiveHourPeriodKey =
    params.modality === "text" ? getFiveHourPeriodKeyUtc() : undefined;
  const reservation: AiUsageReservation = {
    id: randomUUID(),
    tenantId: snapshot.tenantId,
    deploymentMode: snapshot.deploymentMode,
    mode,
    modality: params.modality,
    source: params.source,
    periodKey,
    weeklyPeriodKey,
    fiveHourPeriodKey,
    planId: snapshot.planId,
    model: params.model,
    provider: params.provider,
    userId: params.userId,
    channelId: params.channelId,
    runId: params.runId,
    jobId: params.jobId,
    conversationId: params.conversationId,
    estimatedTotalTokens: Math.max(
      1,
      Math.floor(params.estimatedTotalTokens ?? 1024),
    ),
    reservedImageGenerations: Math.max(
      1,
      Math.floor(params.imageGenerations ?? 1),
    ),
    reservedVideoGenerations: Math.max(
      1,
      Math.floor(params.videoGenerations ?? 1),
    ),
  };

  if (mode === "disabled") {
    return reservation;
  }

  const staticDecision = decideStaticLimit({
    mode,
    modality: params.modality,
    moduleFlags: snapshot.moduleFlags,
    planId: snapshot.planId,
    model: params.model,
  });

  if (!staticDecision.allowed) {
    await recordDeniedUsage({
      firestore: params.firestore,
      reservation,
      current: staticDecision.current,
      limit: staticDecision.limit,
      reason: staticDecision.reason,
      requested: staticDecision.requested,
    });
    throw new AiUsageQuotaError({
      current: staticDecision.current,
      limit: staticDecision.limit,
      message: staticDecision.message,
      modality: params.modality,
      requested: staticDecision.requested,
      source: params.source,
    });
  }

  if (mode === "log-only") {
    return reservation;
  }

  const reserveDecision = await reserveInTransaction({
    estimatedTotalTokens: reservation.estimatedTotalTokens,
    firestore: params.firestore,
    imageGenerations: params.imageGenerations,
    reservation,
    snapshot,
    videoGenerations: params.videoGenerations,
  });

  if (!reserveDecision.allowed) {
    await recordDeniedUsage({
      firestore: params.firestore,
      reservation,
      current: reserveDecision.current,
      limit: reserveDecision.limit,
      reason: reserveDecision.reason,
      requested: reserveDecision.requested,
    });
    throw new AiUsageQuotaError({
      current: reserveDecision.current,
      limit: reserveDecision.limit,
      message: reserveDecision.message,
      modality: params.modality,
      requested: reserveDecision.requested,
      source: params.source,
    });
  }

  return reservation;
}

type FinalAiUsageTextUsage = Required<
  Pick<
    AiUsageTextUsage,
    | "cachedInputTokens"
    | "inputTokens"
    | "outputTokens"
    | "reasoningTokens"
    | "totalTokens"
  >
>;

function getFinalTextUsage(params: {
  reservation: AiUsageReservation;
  usage?: AiUsageTextUsage;
}): FinalAiUsageTextUsage {
  const inputTokens = Math.max(0, Math.floor(params.usage?.inputTokens ?? 0));
  const reportedOutputTokens = params.usage?.outputTokens;
  const fallbackTotalTokens =
    inputTokens + (reportedOutputTokens ?? 0) > 0
      ? inputTokens + (reportedOutputTokens ?? 0)
      : params.reservation.estimatedTotalTokens;
  const totalTokens = Math.max(
    0,
    Math.floor(params.usage?.totalTokens ?? fallbackTotalTokens),
  );
  const outputTokens = Math.max(
    0,
    Math.floor(reportedOutputTokens ?? totalTokens - inputTokens),
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: Math.max(
      0,
      Math.floor(
        params.usage?.outputTokenDetails?.reasoningTokens ??
          params.usage?.reasoningTokens ??
          0,
      ),
    ),
    cachedInputTokens: Math.max(
      0,
      Math.floor(
        params.usage?.inputTokenDetails?.cacheReadTokens ??
          params.usage?.cachedInputTokens ??
          0,
      ),
    ),
  };
}

function getFinalMonthlyPayload(params: {
  costUsdCents?: number;
  imageGenerations?: number;
  reservation: AiUsageReservation;
  textUsage: FinalAiUsageTextUsage;
  videoGenerations?: number;
}) {
  const { reservation } = params;

  if (reservation.modality === "image") {
    return {
      ...(reservation.mode === "enforce"
        ? {
            reservedImageGenerations: FieldValue.increment(
              -reservation.reservedImageGenerations,
            ),
          }
        : {}),
      usedImageGenerations: FieldValue.increment(
        Math.max(1, Math.floor(params.imageGenerations ?? 1)),
      ),
      ...(params.costUsdCents !== undefined
        ? {
            usedImageUsdCents: FieldValue.increment(
              Math.max(0, params.costUsdCents),
            ),
          }
        : {}),
    };
  }

  if (reservation.modality === "video") {
    return {
      ...(reservation.mode === "enforce"
        ? {
            reservedVideoGenerations: FieldValue.increment(
              -reservation.reservedVideoGenerations,
            ),
          }
        : {}),
      usedVideoGenerations: FieldValue.increment(
        Math.max(1, Math.floor(params.videoGenerations ?? 1)),
      ),
    };
  }

  return {
    ...(reservation.mode === "enforce"
      ? {
          reservedEstimatedTokens: FieldValue.increment(
            -reservation.estimatedTotalTokens,
          ),
        }
      : {}),
    usedInputTokens: FieldValue.increment(params.textUsage.inputTokens),
    usedOutputTokens: FieldValue.increment(params.textUsage.outputTokens),
    usedReasoningTokens: FieldValue.increment(params.textUsage.reasoningTokens),
    usedCachedInputTokens: FieldValue.increment(
      params.textUsage.cachedInputTokens,
    ),
  };
}

function finalUsageDeltas(params: {
  costUsdCents?: number;
  imageGenerations?: number;
  reservation: AiUsageReservation;
  textUsage: FinalAiUsageTextUsage;
  videoGenerations?: number;
}): UsageDelta[] {
  const deltas: UsageDelta[] = [];

  if (params.reservation.modality === "image") {
    deltas.push({
      amount: Math.max(1, Math.floor(params.imageGenerations ?? 1)),
      key: "ai.image_generations",
      unit: "count",
    });
  } else if (params.reservation.modality === "video") {
    deltas.push({
      amount: Math.max(1, Math.floor(params.videoGenerations ?? 1)),
      key: "ai.video_generations",
      unit: "count",
    });
  } else {
    deltas.push(
      {
        amount: params.textUsage.inputTokens,
        key: "ai.input_tokens",
        unit: "tokens",
      },
      {
        amount: params.textUsage.outputTokens,
        key: "ai.output_tokens",
        unit: "tokens",
      },
    );

    if (params.textUsage.reasoningTokens > 0) {
      deltas.push({
        amount: params.textUsage.reasoningTokens,
        key: "ai.reasoning_tokens",
        unit: "tokens",
      });
    }

    if (params.textUsage.cachedInputTokens > 0) {
      deltas.push({
        amount: params.textUsage.cachedInputTokens,
        key: "ai.cached_input_tokens",
        unit: "tokens",
      });
    }
  }

  if (params.costUsdCents !== undefined) {
    deltas.push({
      amount: Math.max(0, params.costUsdCents),
      key: "ai.image_usd_cents",
      unit: "usd_cents",
    });
  }

  return deltas.filter((delta) => delta.amount !== 0);
}

async function mergeMonthlyUsage(params: {
  costUsdCents?: number;
  firestore: Firestore;
  imageGenerations?: number;
  reservation: AiUsageReservation;
  textUsage: FinalAiUsageTextUsage;
  videoGenerations?: number;
}) {
  const { reservation } = params;
  const writeMonthly = reservation.modality !== "text";
  const monthlyRef = writeMonthly
    ? params.firestore.doc(
        getMonthlyDocPath(reservation.periodKey, reservation.tenantId),
      )
    : undefined;
  const weeklyRef =
    reservation.modality === "text" && reservation.weeklyPeriodKey
      ? params.firestore.doc(
          getWeeklyDocPath(reservation.weeklyPeriodKey, reservation.tenantId),
        )
      : undefined;
  const fiveHourRef =
    reservation.modality === "text" && reservation.fiveHourPeriodKey
      ? params.firestore.doc(
          getFiveHourDocPath(
            reservation.fiveHourPeriodKey,
            reservation.tenantId,
          ),
        )
      : undefined;

  await params.firestore.runTransaction(async (tx) => {
    const basePayload = {
      tenantId: reservation.tenantId,
      deploymentMode: reservation.deploymentMode,
      ...(reservation.planId ? { planId: reservation.planId } : {}),
      ...getFinalMonthlyPayload(params),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (monthlyRef) {
      tx.set(monthlyRef, basePayload, { merge: true });
    }

    if (weeklyRef) {
      tx.set(
        weeklyRef,
        {
          ...basePayload,
          periodKey: reservation.weeklyPeriodKey,
          periodKind: "week",
        },
        { merge: true },
      );
    }

    if (fiveHourRef) {
      tx.set(
        fiveHourRef,
        {
          ...basePayload,
          periodKey: reservation.fiveHourPeriodKey,
          periodKind: "five_hour",
        },
        { merge: true },
      );
    }
  });
}

export async function finalizeAiUsage(params: {
  costUsdCents?: number;
  firestore: Firestore;
  imageGenerations?: number;
  reservation: AiUsageReservation;
  textUsage?: AiUsageTextUsage;
  videoGenerations?: number;
}): Promise<void> {
  const { reservation } = params;

  if (reservation.mode === "disabled") {
    return;
  }

  const textUsage = getFinalTextUsage({
    reservation,
    usage: params.textUsage,
  });
  const estimated =
    reservation.modality === "text" &&
    params.textUsage?.totalTokens === undefined;

  await mergeMonthlyUsage({
    costUsdCents: params.costUsdCents,
    firestore: params.firestore,
    imageGenerations: params.imageGenerations,
    reservation,
    textUsage,
    videoGenerations: params.videoGenerations,
  });

  await recordAiUsageEvent({
    firestore: params.firestore,
    tenantId: reservation.tenantId,
    source: reservation.source,
    modality: reservation.modality,
    status: reservation.mode === "log-only" ? "logged" : "finalized",
    reservationId: reservation.id,
    userId: reservation.userId,
    channelId: reservation.channelId,
    runId: reservation.runId,
    jobId: reservation.jobId,
    conversationId: reservation.conversationId,
    model: reservation.model,
    provider: reservation.provider,
    inputTokens:
      reservation.modality === "text" ? textUsage.inputTokens : undefined,
    outputTokens:
      reservation.modality === "text" ? textUsage.outputTokens : undefined,
    reasoningTokens:
      reservation.modality === "text" ? textUsage.reasoningTokens : undefined,
    cachedInputTokens:
      reservation.modality === "text" ? textUsage.cachedInputTokens : undefined,
    estimated,
    costUsdCents: params.costUsdCents,
  });
  await recordAiUsageRecordedEvent({
    deltas: finalUsageDeltas({
      costUsdCents: params.costUsdCents,
      imageGenerations: params.imageGenerations,
      reservation,
      textUsage,
      videoGenerations: params.videoGenerations,
    }),
    firestore: params.firestore,
    reservation,
    type: "finalized",
  });
}

function getReleaseMonthlyPayload(reservation: AiUsageReservation) {
  if (reservation.modality === "image") {
    return {
      reservedImageGenerations: FieldValue.increment(
        -reservation.reservedImageGenerations,
      ),
    };
  }

  if (reservation.modality === "video") {
    return {
      reservedVideoGenerations: FieldValue.increment(
        -reservation.reservedVideoGenerations,
      ),
    };
  }

  return {
    reservedEstimatedTokens: FieldValue.increment(
      -reservation.estimatedTotalTokens,
    ),
  };
}

export async function releaseAiUsageReservation(params: {
  firestore: Firestore;
  reservation: AiUsageReservation;
}): Promise<void> {
  const { reservation } = params;

  if (reservation.mode !== "enforce") {
    return;
  }

  const monthlyRef =
    reservation.modality === "text"
      ? undefined
      : params.firestore.doc(
          getMonthlyDocPath(reservation.periodKey, reservation.tenantId),
        );
  const weeklyRef =
    reservation.modality === "text" && reservation.weeklyPeriodKey
      ? params.firestore.doc(
          getWeeklyDocPath(reservation.weeklyPeriodKey, reservation.tenantId),
        )
      : undefined;
  const fiveHourRef =
    reservation.modality === "text" && reservation.fiveHourPeriodKey
      ? params.firestore.doc(
          getFiveHourDocPath(
            reservation.fiveHourPeriodKey,
            reservation.tenantId,
          ),
        )
      : undefined;

  await params.firestore.runTransaction(async (tx) => {
    const basePayload = {
      tenantId: reservation.tenantId,
      deploymentMode: reservation.deploymentMode,
      ...(reservation.planId ? { planId: reservation.planId } : {}),
      ...getReleaseMonthlyPayload(reservation),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (monthlyRef) {
      tx.set(monthlyRef, basePayload, { merge: true });
    }

    if (weeklyRef) {
      tx.set(
        weeklyRef,
        {
          ...basePayload,
          periodKey: reservation.weeklyPeriodKey,
          periodKind: "week",
        },
        { merge: true },
      );
    }

    if (fiveHourRef) {
      tx.set(
        fiveHourRef,
        {
          ...basePayload,
          periodKey: reservation.fiveHourPeriodKey,
          periodKind: "five_hour",
        },
        { merge: true },
      );
    }
  });

  await recordAiUsageEvent({
    firestore: params.firestore,
    tenantId: reservation.tenantId,
    source: reservation.source,
    modality: reservation.modality,
    status: "released",
    reservationId: reservation.id,
    userId: reservation.userId,
    channelId: reservation.channelId,
    runId: reservation.runId,
    jobId: reservation.jobId,
    conversationId: reservation.conversationId,
    model: reservation.model,
    provider: reservation.provider,
  });
}

export async function runMeteredAiText<
  T extends {
    usage?: AiUsageTextUsage;
  },
>(params: {
  estimatedTotalTokens?: number;
  metering: Omit<
    Parameters<typeof reserveAiUsage>[0],
    "estimatedTotalTokens" | "modality"
  >;
  run: () => Promise<T>;
}): Promise<T> {
  const reservation = await reserveAiUsage({
    ...params.metering,
    modality: "text",
    estimatedTotalTokens: params.estimatedTotalTokens,
  });

  try {
    const result = await params.run();
    await finalizeAiUsage({
      firestore: params.metering.firestore,
      reservation,
      textUsage: result.usage,
    });
    return result;
  } catch (error) {
    await releaseAiUsageReservation({
      firestore: params.metering.firestore,
      reservation,
    });
    throw error;
  }
}
