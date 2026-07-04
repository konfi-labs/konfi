import "server-only";

import type {
  AiUsageEventSource,
  TenantContext,
} from "@sblyvwx/cloud-contracts";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
  type AiUsageTextUsage,
} from "@/lib/ai/usage-metering";

type AiGenerateText = (typeof import("ai"))["generateText"];
type MeterableAiTextResult = {
  totalUsage?: AiUsageTextUsage;
  usage?: AiUsageTextUsage;
};

type MeteredAdminAiTextParams<T extends MeterableAiTextResult> = {
  channelId?: string;
  context?: TenantContext;
  conversationId?: string;
  estimatedTotalTokens?: number;
  input?: unknown;
  jobId?: string;
  model?: string;
  provider?: string;
  run: () => Promise<T>;
  runId?: string;
  source: AiUsageEventSource;
  tenantId?: string | null;
  userId?: string;
};

function readPromptInput(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const candidate = input as {
    instructions?: unknown;
    messages?: unknown;
    prompt?: unknown;
    system?: unknown;
  };

  return {
    instructions: candidate.instructions,
    messages: candidate.messages,
    prompt: candidate.prompt,
    system: candidate.system,
  };
}

export async function runMeteredAdminAiText<T extends MeterableAiTextResult>(
  params: MeteredAdminAiTextParams<T>,
): Promise<T> {
  return runMeteredAiText({
    estimatedTotalTokens:
      params.estimatedTotalTokens ??
      estimateAiUsageTextTokens(readPromptInput(params.input)),
    metering: {
      channelId: params.channelId,
      context: params.context ?? getTenantContext(params.tenantId),
      conversationId: params.conversationId,
      firestore: getAdminDb(),
      jobId: params.jobId,
      model: params.model,
      provider: params.provider,
      runId: params.runId,
      source: params.source,
      userId: params.userId,
    },
    run: params.run,
  });
}

export function createMeteredAdminGenerateText(params: {
  channelId?: string;
  context?: TenantContext;
  conversationId?: string;
  generateText: AiGenerateText;
  jobId?: string;
  model?: string;
  provider?: string;
  runId?: string;
  source: AiUsageEventSource;
  tenantId?: string | null;
  userId?: string;
}): AiGenerateText {
  return (async (options) =>
    runMeteredAdminAiText({
      channelId: params.channelId,
      context: params.context,
      conversationId: params.conversationId,
      input: options,
      jobId: params.jobId,
      model: params.model,
      provider: params.provider,
      run: () => params.generateText(options),
      runId: params.runId,
      source: params.source,
      tenantId: params.tenantId,
      userId: params.userId,
    })) as AiGenerateText;
}
