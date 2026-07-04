import type { AgentTaskType } from "@/lib/ai/durable-agents/types";
import { INBOUND_EMAIL_BENCHMARK_TASK_TYPE } from "@/lib/ai/inbound-email/types";
import type { NestedMember, Order, Product, Quote } from "@konfi/types";

export type BenchmarkAgentTaskType = Exclude<AgentTaskType, "invoice">;

export const WHATS_NEW_BENCHMARK_TASK_TYPES = {
  MONTHLY: "whats-new-monthly",
  WEEKLY: "whats-new-weekly",
} as const;

export type WhatsNewBenchmarkTaskType =
  (typeof WHATS_NEW_BENCHMARK_TASK_TYPES)[keyof typeof WHATS_NEW_BENCHMARK_TASK_TYPES];

export type AiBenchmarkTaskType =
  | BenchmarkAgentTaskType
  | typeof INBOUND_EMAIL_BENCHMARK_TASK_TYPE
  | WhatsNewBenchmarkTaskType;

export function isWhatsNewBenchmarkTaskType(
  value: string,
): value is WhatsNewBenchmarkTaskType {
  return (
    value === WHATS_NEW_BENCHMARK_TASK_TYPES.WEEKLY ||
    value === WHATS_NEW_BENCHMARK_TASK_TYPES.MONTHLY
  );
}

export function isInboundEmailRoutingBenchmarkTaskType(
  value: string,
): value is typeof INBOUND_EMAIL_BENCHMARK_TASK_TYPE {
  return value === INBOUND_EMAIL_BENCHMARK_TASK_TYPE;
}

export type AiBenchmarkStatus =
  | "starting"
  | "running"
  | "awaiting-user-input"
  | "completed"
  | "failed";

export type AiBenchmarkType =
  | typeof INBOUND_EMAIL_BENCHMARK_TASK_TYPE
  | "order-match"
  | "product-match"
  | "quote-match"
  | "live-run"
  | WhatsNewBenchmarkTaskType;

export interface AiBenchmarkTargetQuoteSummary {
  id: Quote["id"];
  number: Quote["number"];
  customerName: string;
  totalPrice: Quote["totalPrice"];
  itemsCount: number;
}

export interface AiBenchmarkTargetOrderSummary {
  id: Order["id"];
  number: Order["number"];
  customerName: string;
  totalPrice: Order["totalPrice"];
  itemsCount: number;
}

export interface AiBenchmarkTargetProductSummary {
  id: Product["id"];
  name: Product["name"];
  priceType: Product["priceType"];
  priceRows: number;
  attributeCount: number;
}

export interface AiBenchmarkMetricSummary {
  startedAt: string;
  stoppedAt?: string;
  agentActiveDurationMs?: number;
  statusPolls: number;
  stepsCount?: number;
}

export type AiBenchmarkDiffSeverity =
  | "match"
  | "partial"
  | "mismatch"
  | "missing"
  | "extra";

export interface AiBenchmarkDiffEntry {
  field: string;
  label: string;
  expected: string;
  actual: string;
  score: number;
  weight: number;
  severity: AiBenchmarkDiffSeverity;
}

export interface AiBenchmarkComparisonResult {
  score: number;
  maxScore: number;
  percentage: number;
  diffs: AiBenchmarkDiffEntry[];
  summary: {
    matchedFields: number;
    partialFields: number;
    mismatchedFields: number;
  };
}

export interface AiBenchmarkJudgeResult {
  score: number;
  rationale: string;
  strengths: string[];
  problems: string[];
  model: string;
}

export interface AiBenchmarkLiveRunField {
  field: string;
  label: string;
  value: string;
}

export interface AiBenchmarkLiveRunSummary {
  fields: AiBenchmarkLiveRunField[];
  taskType: BenchmarkAgentTaskType;
}

export interface AiBenchmarkWhatsNewSummary {
  created: boolean;
  description?: Record<string, string>;
  highlightFeatures?: Array<Record<string, string>>;
  kind: "weekly-update" | "monthly-growth";
  periodKey: string;
  campaignProposal?: {
    campaign: {
      campaignIdentifier: string;
      description: string;
      endsAt: string;
      name: string;
      startsAt: string;
    };
    calendarEvent: {
      endsAt: string;
      id: string;
      name: Record<string, string>;
      source: "api" | "agent";
      startsAt: string;
    };
    discountPercent: number;
    justification: Record<string, string>;
    localizedDescription: Record<string, string>;
    productIds: string[];
    promotion: {
      code: string;
      isAutomatic: boolean;
      productIds: string[];
      value: number;
    };
  };
  campaignProposalCount?: number;
  campaignProposalError?: string;
  campaignProposalReason?: string;
  reason?: string;
  seoSuggestionAppliedCount?: number;
  seoSuggestionApplyFailures?: string[];
  seoSuggestionCount?: number;
  skipped?: boolean;
  title?: Record<string, string>;
}

export interface AiBenchmarkInboundEmailRoutingFixtureResult {
  actualBlockReason: string | null;
  actualMissingInformation: string[];
  actualOutcome: string;
  expectedBlockReason: string | null;
  expectedMissingInformation: string[];
  expectedOutcome: string;
  id: string;
  name: string;
  passed: boolean;
  score: number;
}

export interface AiBenchmarkInboundEmailRoutingLiveSummary {
  adminRecipientEmail: string;
  blockReason: string | null;
  customerName: string | null;
  from: string;
  inboundEmailId: string;
  itemCount: number;
  missingInformation: string[];
  outcome: string | null;
  productNames: string[];
  responseSubject: string | null;
  routingRationale: string | null;
  status: string;
  subject: string;
}

export interface AiBenchmarkInboundEmailRoutingSummary {
  fixtures: AiBenchmarkInboundEmailRoutingFixtureResult[];
  liveRun?: AiBenchmarkInboundEmailRoutingLiveSummary;
  maxScore: number;
  percentage: number;
  score: number;
}

export interface AiBenchmarkRun {
  id: string;
  benchmarkType: AiBenchmarkType;
  agentTaskType: AiBenchmarkTaskType;
  status: AiBenchmarkStatus;
  prompt: string;
  channelId: string;
  createdBy: NestedMember;
  createdAt: string;
  updatedAt: string;
  targetQuote?: AiBenchmarkTargetQuoteSummary;
  targetOrder?: AiBenchmarkTargetOrderSummary;
  targetProduct?: AiBenchmarkTargetProductSummary;
  agentRunId?: string;
  metrics: AiBenchmarkMetricSummary;
  deterministicComparison?: AiBenchmarkComparisonResult;
  judge?: AiBenchmarkJudgeResult;
  judgeError?: string;
  inboundEmailRouting?: AiBenchmarkInboundEmailRoutingSummary;
  liveRun?: AiBenchmarkLiveRunSummary;
  whatsNew?: AiBenchmarkWhatsNewSummary;
  error?: string;
}

export interface AiBenchmarkAgentOption {
  benchmarkType: AiBenchmarkType;
  requiresPrompt: boolean;
  requiresQuoteTarget: boolean;
  targetType?: "order" | "product" | "quote";
  taskType: AiBenchmarkTaskType;
  label: string;
  description: string;
}

export interface AiBenchmarkQuoteOption extends AiBenchmarkTargetQuoteSummary {
  createdAt?: string;
}

export interface AiBenchmarkOrderOption extends AiBenchmarkTargetOrderSummary {
  createdAt?: string;
}

export interface AiBenchmarkProductOption extends AiBenchmarkTargetProductSummary {
  updatedAt?: string;
}
