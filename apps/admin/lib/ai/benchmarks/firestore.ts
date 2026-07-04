import "server-only";

import type {
  AiBenchmarkRun,
  AiBenchmarkStatus,
  AiBenchmarkTaskType,
  AiBenchmarkType,
} from "./types";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import type { NestedMember } from "@konfi/types";

function serializeDate(value: unknown, fallback = new Date()): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().toISOString();
    }
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback.toISOString();
}

function normalizeStatus(value: unknown): AiBenchmarkStatus {
  return value === "starting" ||
    value === "running" ||
    value === "awaiting-user-input" ||
    value === "completed" ||
    value === "failed"
    ? value
    : "running";
}

function normalizeBenchmarkType(data: DocumentData): AiBenchmarkType {
  const value = data.benchmarkType;

  if (
    value === "inbound-email-routing" ||
    value === "order-match" ||
    value === "product-match" ||
    value === "quote-match" ||
    value === "live-run" ||
    value === "whats-new-weekly" ||
    value === "whats-new-monthly"
  ) {
    return value;
  }

  return data.targetQuote ? "quote-match" : "live-run";
}

export function mapBenchmarkDocToRun(options: {
  id: string;
  data: DocumentData;
}): AiBenchmarkRun {
  const { id, data } = options;
  const now = new Date();
  const legacyAgentActiveDurationMs = data["metrics.agentActiveDurationMs"];
  const legacyStatusPolls = data["metrics.statusPolls"];
  const legacyStepsCount = data["metrics.stepsCount"];
  const legacyStoppedAt = data["metrics.stoppedAt"];

  return {
    agentRunId:
      typeof data.agentRunId === "string" ? data.agentRunId : undefined,
    agentTaskType: (data.agentTaskType ?? "quote") as AiBenchmarkTaskType,
    benchmarkType: normalizeBenchmarkType(data),
    channelId: typeof data.channelId === "string" ? data.channelId : "",
    createdAt: serializeDate(data.createdAt, now),
    createdBy: data.createdBy as NestedMember,
    deterministicComparison: data.deterministicComparison,
    error: typeof data.error === "string" ? data.error : undefined,
    id,
    judge: data.judge,
    judgeError:
      typeof data.judgeError === "string" ? data.judgeError : undefined,
    inboundEmailRouting: data.inboundEmailRouting,
    liveRun: data.liveRun,
    metrics: {
      agentActiveDurationMs:
        typeof data.metrics?.agentActiveDurationMs === "number"
          ? data.metrics.agentActiveDurationMs
          : typeof legacyAgentActiveDurationMs === "number"
            ? legacyAgentActiveDurationMs
            : undefined,
      startedAt: serializeDate(data.metrics?.startedAt ?? data.createdAt, now),
      statusPolls:
        typeof data.metrics?.statusPolls === "number"
          ? data.metrics.statusPolls
          : typeof legacyStatusPolls === "number"
            ? legacyStatusPolls
            : 0,
      stepsCount:
        typeof data.metrics?.stepsCount === "number"
          ? data.metrics.stepsCount
          : typeof legacyStepsCount === "number"
            ? legacyStepsCount
            : undefined,
      stoppedAt:
        (data.metrics?.stoppedAt ?? legacyStoppedAt)
          ? serializeDate(data.metrics?.stoppedAt ?? legacyStoppedAt, now)
          : undefined,
    },
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    status: normalizeStatus(data.status),
    targetOrder: data.targetOrder,
    targetProduct: data.targetProduct,
    targetQuote: data.targetQuote,
    updatedAt: serializeDate(data.updatedAt ?? data.createdAt, now),
    whatsNew: data.whatsNew,
  };
}

export function buildBenchmarkUpdateTimestamp() {
  return FieldValue.serverTimestamp();
}
