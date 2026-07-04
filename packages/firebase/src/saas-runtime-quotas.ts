import {
  type LimitDeniedEvent,
  type Tenant,
  type TenantContext,
  type TenantModuleFlags,
  type TenantPlanLimits,
  type UsageEventSource,
  type UsageMetricKey,
  type UsageMetricUnit,
  type UsageRecordedEvent,
} from "@sblyvwx/cloud-contracts";

export type SaasRuntimeQuotaResource =
  | "members"
  | "channels"
  | "products"
  | "categories"
  | "customers"
  | "configurableCurrencies"
  | "configurableStatuses"
  | "configurableUnits"
  | "ordersPerMonth"
  | "storageBytes";

export type SaasRuntimeModuleFlag = keyof TenantModuleFlags;

export interface SaasRuntimeQuotaAggregateSnapshot {
  data(): { count?: number };
}

export interface SaasRuntimeQuotaAggregateQuery {
  get(): Promise<SaasRuntimeQuotaAggregateSnapshot>;
}

export interface SaasRuntimeQuotaQuery {
  count(): SaasRuntimeQuotaAggregateQuery;
  where(
    fieldPath: string,
    opStr: "==" | "!=" | "<" | ">=",
    value: unknown,
  ): SaasRuntimeQuotaQuery;
}

export interface SaasRuntimeQuotaDocumentSnapshot {
  exists: boolean;
  data(): unknown;
}

export interface SaasRuntimeQuotaDocumentReference {
  readonly path?: string;
  get(): Promise<SaasRuntimeQuotaDocumentSnapshot>;
}

export interface SaasRuntimeQuotaCollectionReference extends SaasRuntimeQuotaQuery {
  add(data: Record<string, unknown>): Promise<unknown>;
  doc(path: string): SaasRuntimeQuotaDocumentReference;
}

export interface SaasRuntimeQuotaTransaction {
  get(
    reference: SaasRuntimeQuotaDocumentReference,
  ): Promise<SaasRuntimeQuotaDocumentSnapshot>;
  set(
    reference: SaasRuntimeQuotaDocumentReference,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ): unknown;
}

export interface SaasRuntimeQuotaFirestore {
  collection(path: string): SaasRuntimeQuotaCollectionReference;
  collectionGroup(collectionId: string): SaasRuntimeQuotaQuery;
  runTransaction?<T>(
    updateFunction: (transaction: SaasRuntimeQuotaTransaction) => Promise<T>,
  ): Promise<T>;
}

type RuntimeUsageSnapshot = {
  membersCount?: number;
  channelsCount?: number;
  productsCount?: number;
  categoriesCount?: number;
  configurableCurrenciesCount?: number;
  configurableStatusesCount?: number;
  configurableUnitsCount?: number;
  customersCount?: number;
  ordersThisMonthCount?: number;
  storageBytesUsed?: number;
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

type RuntimeQuotaSnapshot = {
  enforcementDisabled: boolean;
  limits: TenantPlanLimits;
  moduleFlags: TenantModuleFlags;
  usage: RuntimeUsageSnapshot;
};

export class SaasRuntimeQuotaError extends Error {
  code = "SAAS_RUNTIME_QUOTA_EXCEEDED";
  resource: SaasRuntimeQuotaResource | SaasRuntimeModuleFlag;
  limit?: number;
  current?: number;
  requested?: number;

  constructor(params: {
    current?: number;
    limit?: number;
    message: string;
    requested?: number;
    resource: SaasRuntimeQuotaResource | SaasRuntimeModuleFlag;
  }) {
    super(params.message);
    this.name = "SaasRuntimeQuotaError";
    this.resource = params.resource;
    this.limit = params.limit;
    this.current = params.current;
    this.requested = params.requested;
  }
}

const quotaLimitFieldByResource = {
  members: "maxMembers",
  channels: "maxChannels",
  products: "maxProducts",
  categories: "maxCategories",
  customers: "maxCustomers",
  configurableCurrencies: "maxConfigurableCurrencies",
  configurableStatuses: "maxConfigurableStatuses",
  configurableUnits: "maxConfigurableUnits",
  ordersPerMonth: "maxOrdersPerMonth",
  storageBytes: "maxStorageBytes",
} as const satisfies Record<SaasRuntimeQuotaResource, keyof TenantPlanLimits>;

const usageMetricByResource = {
  categories: "categories.count",
  channels: "channels.count",
  configurableCurrencies: "settings.currencies.count",
  configurableStatuses: "settings.statuses.count",
  configurableUnits: "settings.units.count",
  customers: "customers.count",
  members: "members.count",
  ordersPerMonth: "orders.monthly_count",
  products: "products.count",
  storageBytes: "storage.bytes",
} as const satisfies Record<SaasRuntimeQuotaResource, UsageMetricKey>;

const usageUnitByResource = {
  categories: "count",
  channels: "count",
  configurableCurrencies: "count",
  configurableStatuses: "count",
  configurableUnits: "count",
  customers: "count",
  members: "count",
  ordersPerMonth: "count",
  products: "count",
  storageBytes: "bytes",
} as const satisfies Record<SaasRuntimeQuotaResource, UsageMetricUnit>;

const USAGE_EVENTS_COLLECTION = "usageEvents";
const USAGE_SUMMARIES_COLLECTION = "usageSummaries";

function shouldEnforceSaasQuotas(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withoutUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readLimits(tenant: TenantRuntimeDocument): TenantPlanLimits {
  return (
    tenant.runtimePlanSnapshot?.limits ??
    tenant.planSnapshot?.limits ??
    tenant.usageLimits ??
    tenant.limits ??
    {}
  );
}

function readModuleFlags(tenant: TenantRuntimeDocument): TenantModuleFlags {
  return {
    ...(tenant.runtimePlanSnapshot?.moduleFlags ?? {}),
    ...(tenant.planSnapshot?.moduleFlags ?? {}),
    ...(tenant.moduleFlags ?? {}),
  };
}

function readUsage(tenant: TenantRuntimeDocument): RuntimeUsageSnapshot {
  return {
    ...(tenant.usage ?? {}),
    ...(tenant.usageSnapshot ?? {}),
    ...(tenant.runtimeUsage ?? {}),
  };
}

function readEnforcementDisabled(tenant: TenantRuntimeDocument): boolean {
  return Boolean(
    tenant.quotaEnforcementDisabled ??
    tenant.runtimePlanSnapshot?.quotaEnforcementDisabled ??
    tenant.planSnapshot?.quotaEnforcementDisabled,
  );
}

function getTenantId(context: TenantContext): string {
  const tenantId = context.tenantId?.trim();

  if (!tenantId) {
    throw new Error("Tenant context is required for SaaS quota enforcement.");
  }

  return tenantId;
}

function currentMonthRange(now = new Date()) {
  return {
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

function currentMonthlyUsagePeriod(now = new Date()) {
  const { end, start } = currentMonthRange(now);

  return {
    endsAt: end.toISOString(),
    key: now.toISOString().slice(0, 7),
    kind: "month",
    startsAt: start.toISOString(),
    timezone: "UTC",
  } as const;
}

function createUsageEventId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `usage_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
}

function usageSummaryIdForTenant(tenantId: string): string {
  return `${tenantId}_current`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(readRecord(value)).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function incrementCounters(
  counters: Record<string, number>,
  key: string,
  amount: number,
) {
  if (amount === 0) {
    return;
  }

  counters[key] = (counters[key] ?? 0) + amount;
}

function buildUsageCounterIncrements(deltas: UsageRecordedEvent["deltas"]) {
  const counters: Record<string, number> = {};
  const estimatedCounters: Record<string, number> = {};

  for (const delta of deltas) {
    incrementCounters(
      delta.estimated ? estimatedCounters : counters,
      delta.key,
      delta.amount,
    );
  }

  return { counters, estimatedCounters };
}

function hasIncrements(counters: Record<string, number>): boolean {
  return Object.keys(counters).length > 0;
}

function mergeCounters(
  existing: Record<string, number>,
  increments: Record<string, number>,
): Record<string, number> {
  const merged = { ...existing };

  for (const [key, amount] of Object.entries(increments)) {
    merged[key] = (merged[key] ?? 0) + amount;
  }

  return merged;
}

function aggregateUsageRecordedEvent(params: {
  event: UsageRecordedEvent;
  reference: SaasRuntimeQuotaDocumentReference;
  snapshot: SaasRuntimeQuotaDocumentSnapshot;
  transaction: SaasRuntimeQuotaTransaction;
}): boolean {
  const increments = buildUsageCounterIncrements(params.event.deltas);
  const aggregated =
    hasIncrements(increments.counters) ||
    hasIncrements(increments.estimatedCounters);

  if (!aggregated) {
    return false;
  }

  const existing = readRecord(params.snapshot.data());
  const counters = mergeCounters(
    readNumberRecord(existing.counters),
    increments.counters,
  );
  const estimatedCounters = mergeCounters(
    readNumberRecord(existing.estimatedCounters),
    increments.estimatedCounters,
  );

  params.transaction.set(
    params.reference,
    withoutUndefined({
      tenantId: params.event.tenantId,
      period: "current",
      planId: params.event.planId,
      counters,
      estimatedCounters,
      createdAt: params.snapshot.exists ? existing.createdAt : nowIso(),
      updatedAt: nowIso(),
    }),
    { merge: true },
  );

  return true;
}

async function recordUsageControlEvent(params: {
  event: LimitDeniedEvent | UsageRecordedEvent;
  firestore: SaasRuntimeQuotaFirestore;
}): Promise<void> {
  if (!params.firestore.runTransaction) {
    await params.firestore
      .collection(USAGE_EVENTS_COLLECTION)
      .add({ ...params.event });
    return;
  }

  await params.firestore.runTransaction(async (transaction) => {
    const eventReference = params.firestore
      .collection(USAGE_EVENTS_COLLECTION)
      .doc(params.event.eventId);
    const existingEvent = await transaction.get(eventReference);

    if (existingEvent.exists) {
      return;
    }

    const summaryId =
      params.event.type === "usage.recorded" && params.event.tenantId
        ? usageSummaryIdForTenant(params.event.tenantId)
        : undefined;
    const summaryReference = summaryId
      ? params.firestore.collection(USAGE_SUMMARIES_COLLECTION).doc(summaryId)
      : undefined;
    const summarySnapshot = summaryReference
      ? await transaction.get(summaryReference)
      : undefined;
    const aggregated =
      params.event.type === "usage.recorded" &&
      summaryReference &&
      summarySnapshot
        ? aggregateUsageRecordedEvent({
            event: params.event,
            reference: summaryReference,
            snapshot: summarySnapshot,
            transaction,
          })
        : false;

    transaction.set(
      eventReference,
      withoutUndefined({
        ...params.event,
        summaryId,
        aggregatedAt: aggregated ? nowIso() : undefined,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }),
    );
  });
}

function usageSourceForResource(
  resource: SaasRuntimeQuotaResource | SaasRuntimeModuleFlag,
): UsageEventSource {
  return resource === "storageBytes" ? "storage" : "runtime";
}

async function getRuntimeSnapshot(
  context: TenantContext,
  firestore: SaasRuntimeQuotaFirestore,
): Promise<RuntimeQuotaSnapshot | null> {
  if (!shouldEnforceSaasQuotas(context)) {
    return null;
  }

  const tenantId = getTenantId(context);
  const tenantSnapshot = await firestore
    .collection("tenants")
    .doc(tenantId)
    .get();

  if (!tenantSnapshot.exists) {
    throw new Error(`Tenant runtime snapshot ${tenantId} was not found.`);
  }

  const tenant = tenantSnapshot.data() as TenantRuntimeDocument;

  return {
    enforcementDisabled: readEnforcementDisabled(tenant),
    limits: readLimits(tenant),
    moduleFlags: readModuleFlags(tenant),
    usage: readUsage(tenant),
  };
}

async function countTenantQuery(query: SaasRuntimeQuotaQuery): Promise<number> {
  const snapshot = await query.count().get();
  return snapshot.data().count ?? 0;
}

function tenantScopedQuery(
  query: SaasRuntimeQuotaQuery,
  context: TenantContext,
): SaasRuntimeQuotaQuery {
  return query.where("tenantId", "==", getTenantId(context));
}

async function getCurrentResourceUsage(params: {
  context: TenantContext;
  firestore: SaasRuntimeQuotaFirestore;
  resource: SaasRuntimeQuotaResource;
  usage: RuntimeUsageSnapshot;
}): Promise<number> {
  const { context, firestore, resource, usage } = params;

  if (resource === "members") {
    return (
      readFiniteNumber(usage.membersCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collection("members"), context),
      )
    );
  }

  if (resource === "channels") {
    return (
      readFiniteNumber(usage.channelsCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collection("channels"), context),
      )
    );
  }

  if (resource === "products") {
    return (
      readFiniteNumber(usage.productsCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collectionGroup("products"), context),
      )
    );
  }

  if (resource === "categories") {
    return (
      readFiniteNumber(usage.categoriesCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collectionGroup("categories"), context),
      )
    );
  }

  if (resource === "customers") {
    return (
      readFiniteNumber(usage.customersCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collection("customers"), context),
      )
    );
  }

  if (resource === "configurableCurrencies") {
    return readFiniteNumber(usage.configurableCurrenciesCount) ?? 0;
  }

  if (resource === "configurableStatuses") {
    return readFiniteNumber(usage.configurableStatusesCount) ?? 0;
  }

  if (resource === "configurableUnits") {
    return readFiniteNumber(usage.configurableUnitsCount) ?? 0;
  }

  if (resource === "ordersPerMonth") {
    const range = currentMonthRange();
    return (
      readFiniteNumber(usage.ordersThisMonthCount) ??
      countTenantQuery(
        tenantScopedQuery(firestore.collectionGroup("orders"), context)
          .where("createdAt", ">=", range.start)
          .where("createdAt", "<", range.end),
      )
    );
  }

  return readFiniteNumber(usage.storageBytesUsed) ?? 0;
}

async function recordQuotaDenied(params: {
  context: TenantContext;
  current?: number;
  firestore: SaasRuntimeQuotaFirestore;
  limit?: number;
  operation: string;
  requested?: number;
  resource: SaasRuntimeQuotaResource | SaasRuntimeModuleFlag;
}) {
  if (!shouldEnforceSaasQuotas(params.context)) {
    return;
  }

  try {
    const metricKey =
      params.resource in usageMetricByResource
        ? usageMetricByResource[params.resource as SaasRuntimeQuotaResource]
        : `module.${params.resource}`;
    const unit =
      params.resource in usageUnitByResource
        ? usageUnitByResource[params.resource as SaasRuntimeQuotaResource]
        : "count";
    const occurredAt = new Date().toISOString();
    const event = {
      attempted: (params.current ?? 0) + (params.requested ?? 1),
      context: {
        operation: params.operation,
        resourceType: params.resource,
      },
      current: params.current ?? 0,
      eventId: createUsageEventId(),
      hard: true,
      key: metricKey,
      limit: params.limit ?? null,
      occurredAt,
      period: currentMonthlyUsagePeriod(),
      ...(params.requested !== undefined
        ? { increment: params.requested }
        : {}),
      reason:
        params.limit === undefined ? "feature_disabled" : "hard_limit_exceeded",
      source: usageSourceForResource(params.resource),
      tenantId: getTenantId(params.context),
      type: "usage.limit_denied",
      unit,
    } satisfies LimitDeniedEvent;

    await recordUsageControlEvent({
      event,
      firestore: params.firestore,
    });
  } catch (error) {
    console.error("Failed to record SaaS quota denied event", error);
  }
}

async function recordQuotaUsage(params: {
  context: TenantContext;
  counterValue: number;
  firestore: SaasRuntimeQuotaFirestore;
  limit: number;
  operation: string;
  requested: number;
  resource: SaasRuntimeQuotaResource;
}) {
  if (!shouldEnforceSaasQuotas(params.context)) {
    return;
  }

  try {
    const occurredAt = new Date().toISOString();
    const event = {
      context: {
        operation: params.operation,
        resourceType: params.resource,
      },
      deltas: [
        {
          amount: params.requested,
          counterValue: params.counterValue,
          key: usageMetricByResource[params.resource],
          limit: params.limit,
          unit: usageUnitByResource[params.resource],
        },
      ],
      eventId: createUsageEventId(),
      occurredAt,
      period: currentMonthlyUsagePeriod(),
      source: usageSourceForResource(params.resource),
      tenantId: getTenantId(params.context),
      type: "usage.recorded",
    } satisfies UsageRecordedEvent;

    await recordUsageControlEvent({
      event,
      firestore: params.firestore,
    });
  } catch (error) {
    console.error("Failed to record SaaS quota usage event", error);
  }
}

export async function assertSaasRuntimeQuota(params: {
  context: TenantContext;
  current?: number;
  firestore: SaasRuntimeQuotaFirestore;
  operation: string;
  requested?: number;
  resource: SaasRuntimeQuotaResource;
}): Promise<void> {
  const snapshot = await getRuntimeSnapshot(params.context, params.firestore);

  if (!snapshot || snapshot.enforcementDisabled) {
    return;
  }

  const requested = readFiniteNumber(params.requested) ?? 1;
  if (requested <= 0) {
    return;
  }
  const limitField = quotaLimitFieldByResource[params.resource];
  const limitValue = snapshot.limits[limitField];

  if (typeof limitValue !== "number" || !Number.isFinite(limitValue)) {
    return;
  }

  const current =
    readFiniteNumber(params.current) ??
    (await getCurrentResourceUsage({
      context: params.context,
      firestore: params.firestore,
      resource: params.resource,
      usage: snapshot.usage,
    }));

  if (current + requested <= limitValue) {
    return;
  }

  await recordQuotaDenied({
    context: params.context,
    current,
    firestore: params.firestore,
    limit: limitValue,
    operation: params.operation,
    requested,
    resource: params.resource,
  });

  throw new SaasRuntimeQuotaError({
    current,
    limit: limitValue,
    message: `SaaS quota exceeded for ${params.resource}: ${current} + ${requested} exceeds ${limitValue}.`,
    requested,
    resource: params.resource,
  });
}

export async function recordSaasRuntimeQuotaUsage(params: {
  context: TenantContext;
  current?: number;
  firestore: SaasRuntimeQuotaFirestore;
  operation: string;
  requested?: number;
  resource: SaasRuntimeQuotaResource;
}): Promise<void> {
  try {
    const snapshot = await getRuntimeSnapshot(params.context, params.firestore);

    if (!snapshot || snapshot.enforcementDisabled) {
      return;
    }

    const requested = readFiniteNumber(params.requested) ?? 1;
    if (requested <= 0) {
      return;
    }
    const limitField = quotaLimitFieldByResource[params.resource];
    const limitValue = snapshot.limits[limitField];

    if (typeof limitValue !== "number" || !Number.isFinite(limitValue)) {
      return;
    }

    const current =
      readFiniteNumber(params.current) ??
      (await getCurrentResourceUsage({
        context: params.context,
        firestore: params.firestore,
        resource: params.resource,
        usage: snapshot.usage,
      }));

    await recordQuotaUsage({
      context: params.context,
      counterValue: current,
      firestore: params.firestore,
      limit: limitValue,
      operation: params.operation,
      requested,
      resource: params.resource,
    });
  } catch (error) {
    console.error("Failed to record SaaS quota usage event", error);
  }
}

export async function assertSaasRuntimeModuleEnabled(params: {
  context: TenantContext;
  firestore: SaasRuntimeQuotaFirestore;
  module: SaasRuntimeModuleFlag;
  operation: string;
}): Promise<void> {
  const snapshot = await getRuntimeSnapshot(params.context, params.firestore);

  if (!snapshot || snapshot.enforcementDisabled) {
    return;
  }

  if (snapshot.moduleFlags[params.module] !== false) {
    return;
  }

  await recordQuotaDenied({
    context: params.context,
    firestore: params.firestore,
    operation: params.operation,
    resource: params.module,
  });

  throw new SaasRuntimeQuotaError({
    message: `SaaS module is disabled for this tenant: ${params.module}.`,
    resource: params.module,
  });
}

export async function isSaasRuntimeModuleEnabled(params: {
  context: TenantContext;
  firestore: SaasRuntimeQuotaFirestore;
  module: SaasRuntimeModuleFlag;
}): Promise<boolean> {
  const snapshot = await getRuntimeSnapshot(params.context, params.firestore);

  if (!snapshot || snapshot.enforcementDisabled) {
    return true;
  }

  return snapshot.moduleFlags[params.module] !== false;
}
