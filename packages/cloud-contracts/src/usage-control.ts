import type { DeploymentMode, TenantId, TenantPlanId } from "./index";

export const usageControlEventTypes = [
  "usage.recorded",
  "usage.limit_denied",
  "tenant.kill_switch.changed",
  "tenant.read_only.changed",
  "tenant.suspension.changed",
  "quota.warning.changed",
] as const;

export type UsageControlEventType = (typeof usageControlEventTypes)[number];

/**
 * Kinds of usage aggregation windows.
 *
 * Period key conventions:
 * - `month`: `YYYY-MM` (UTC calendar month).
 * - `day`: `YYYY-MM-DD` (UTC day).
 * - `hour`: `YYYY-MM-DDTHH` (UTC hour).
 * - `week`: `YYYY-Www` (ISO 8601 week, UTC).
 * - `five_hour`: `YYYY-MM-DDTHH` where the hour is the UTC start of a 5-hour
 *   bucket aligned to 00, 05, 10, 15, 20 (a 24h day yields five buckets, with
 *   the last covering 20:00–01:00 of the next day).
 * - `billing_period`: provider-supplied billing period key.
 */
export type UsagePeriodKind =
  | "billing_period"
  | "day"
  | "five_hour"
  | "hour"
  | "month"
  | "week";

export interface UsagePeriod {
  endsAt: string;
  key: string;
  kind: UsagePeriodKind;
  startsAt: string;
  timezone?: string;
}

export type UsageMetricUnit = "bytes" | "count" | "tokens" | "usd_cents";

export type KnownUsageMetricKey =
  | "ai.cached_input_tokens"
  | "ai.image_generations"
  | "ai.image_usd_cents"
  | "ai.input_tokens"
  | "ai.output_tokens"
  | "ai.reasoning_tokens"
  | "ai.text_tokens"
  | "ai.video_generations"
  | "categories.count"
  | "channels.count"
  | "customers.count"
  | "firestore.reads"
  | "firestore.writes"
  | "free_tenants.count"
  | "members.count"
  | "orders.monthly_count"
  | "products.count"
  | "settings.statuses.count"
  | "settings.units.count"
  | "settings.currencies.count"
  | "storage.bytes";

export type UsageMetricKey = KnownUsageMetricKey | (string & {});

export type UsageEventSource =
  | "ai"
  | "billing"
  | "import"
  | "operator"
  | "provisioning"
  | "runtime"
  | "storage"
  | "storefront"
  | (string & {});

export interface UsageEventActor {
  id?: string;
  kind: "operator" | "service" | "system" | "user";
}

export interface UsageEventContext {
  channelId?: string;
  conversationId?: string;
  jobId?: string;
  model?: string;
  operation?: string;
  provider?: string;
  requestId?: string;
  resourceId?: string;
  resourceType?: string;
  runId?: string;
}

export interface UsageEventBase {
  actor?: UsageEventActor;
  context?: UsageEventContext;
  deploymentMode?: DeploymentMode;
  eventId: string;
  idempotencyKey?: string;
  observedAt?: string;
  occurredAt: string;
  planId?: TenantPlanId;
  source: UsageEventSource;
  tenantId?: TenantId;
  type: UsageControlEventType;
}

export interface UsageDelta {
  amount: number;
  counterValue?: number;
  estimated?: boolean;
  key: UsageMetricKey;
  limit?: number | null;
  unit: UsageMetricUnit;
}

export interface UsageRecordedEvent extends UsageEventBase {
  deltas: UsageDelta[];
  period: UsagePeriod;
  type: "usage.recorded";
}

export type LimitDeniedReason =
  | "feature_disabled"
  | "hard_limit_exceeded"
  | "kill_switch"
  | "read_only"
  | "suspended";

export interface LimitDeniedEvent extends UsageEventBase {
  attempted: number;
  current: number;
  hard: boolean;
  increment?: number;
  key: UsageMetricKey;
  limit: number | null;
  period?: UsagePeriod;
  reason: LimitDeniedReason;
  type: "usage.limit_denied";
  unit: UsageMetricUnit;
}

export type TenantControlSource = "abuse" | "billing" | "operator" | "quota";

export type TenantKillSwitchTarget =
  | "ai"
  | "external_provider_import"
  | "storefront"
  | "tenant"
  | "uploads"
  | "write_paths";

export interface TenantKillSwitch {
  enabled: boolean;
  endsAt?: string;
  id: string;
  reason?: string;
  reasonCode: string;
  source: TenantControlSource;
  startsAt: string;
  target: TenantKillSwitchTarget;
  tenantId: TenantId;
  updatedAt: string;
  updatedBy?: UsageEventActor;
}

export interface TenantReadOnlyState {
  enabled: boolean;
  endsAt?: string;
  reason?: string;
  reasonCode: string;
  source: TenantControlSource;
  startsAt: string;
  tenantId: TenantId;
  updatedAt: string;
  updatedBy?: UsageEventActor;
  violationEventIds?: string[];
}

export type TenantSuspensionSurface =
  | "admin"
  | "api"
  | "background_jobs"
  | "storefront";

export interface TenantSuspensionState {
  blockedSurfaces: TenantSuspensionSurface[];
  enabled: boolean;
  endsAt?: string;
  reason?: string;
  reasonCode: string;
  source: TenantControlSource;
  startsAt: string;
  tenantId: TenantId;
  updatedAt: string;
  updatedBy?: UsageEventActor;
}

export type QuotaWarningStatus = "acknowledged" | "active" | "resolved";

export interface QuotaWarning {
  current: number;
  key: UsageMetricKey;
  limit: number;
  period: UsagePeriod;
  status: QuotaWarningStatus;
  tenantId: TenantId;
  thresholdRatio: number;
  unit: UsageMetricUnit;
  updatedAt: string;
  warningId: string;
}

export interface KillSwitchChangedEvent extends UsageEventBase {
  action: "disabled" | "enabled" | "updated";
  killSwitch: TenantKillSwitch;
  type: "tenant.kill_switch.changed";
}

export interface ReadOnlyChangedEvent extends UsageEventBase {
  action: "disabled" | "enabled" | "updated";
  readOnly: TenantReadOnlyState;
  type: "tenant.read_only.changed";
}

export interface TenantSuspensionChangedEvent extends UsageEventBase {
  action: "disabled" | "enabled" | "updated";
  suspension: TenantSuspensionState;
  type: "tenant.suspension.changed";
}

export interface QuotaWarningChangedEvent extends UsageEventBase {
  action: "acknowledged" | "opened" | "resolved" | "updated";
  quotaWarning: QuotaWarning;
  type: "quota.warning.changed";
}

export type UsageControlEvent =
  | KillSwitchChangedEvent
  | LimitDeniedEvent
  | QuotaWarningChangedEvent
  | ReadOnlyChangedEvent
  | TenantSuspensionChangedEvent
  | UsageRecordedEvent;
