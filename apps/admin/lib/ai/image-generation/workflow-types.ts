import type { ImageGenerationRequest } from "@konfi/types";

export type ImageGenerationAiUsageReservation = {
  id: string;
  tenantId: string;
  deploymentMode: string;
  mode: "disabled" | "enforce" | "log-only";
  modality: string;
  source: string;
  periodKey: string;
  weeklyPeriodKey?: string;
  fiveHourPeriodKey?: string;
  planId?: string;
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

export interface ImageGenerationWorkflowInput {
  /** Client-generated ID for idempotency (NOT the workflow runId). */
  jobId: string;
  /** Authenticated admin account identifier (Firebase UID). */
  accountId: string;
  aiUsageReservation?: ImageGenerationAiUsageReservation;
  request: ImageGenerationRequest;
}

export type ImageGenerationWorkflowResult = {
  images: Array<{ id: string; storagePath: string; url: string }>;
  filteredReason?: string;
  chargedUsdCents: number;
};
