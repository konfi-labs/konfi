"use server";

import { checkAdmin } from "@/actions";
import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import { getVertexClient } from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getFirebaseAdminApp,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/ai/usage-metering";
import { MODELS } from "@konfi/firebase";
import {
  VIDEO_MODEL_CAPABILITIES,
  type VideoGenerationRequest,
  type VideoModel,
  isVertexVideoModel,
} from "@konfi/types";
import { experimental_generateVideo as generateVideo, generateText } from "ai";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

type GoogleVertexVideoProviderOptions = {
  generateAudio?: boolean;
  personGeneration?: "allow_adult" | "allow_all" | "dont_allow";
  pollTimeoutMs?: number;
};

type GeneratedVideoUrl = {
  id: string;
  storagePath: string;
  url: string;
};

// Video pricing (USD cents per generated video)
const VIDEO_PRICE_USD_CENTS: Record<VideoModel, number> = {
  "veo-3.1-generate-001": 20,
  "veo-3.1-fast-generate-001": 20,
};

const DEFAULT_MONTHLY_LIMIT_USD_CENTS = 10 * 100;

type AiImageGenerationQuotaDoc = {
  enabled: boolean;
  monthlyLimitUsdCents?: number;
  monthlyLimitUsd?: number;
};

type AiImageGenerationUsageDoc = {
  usedUsdCents: number;
  reservedUsdCents: number;
  updatedAt: Timestamp;
};

const DEFAULT_VIDEO_REFERENCE_PROMPT =
  "Animate this reference image naturally.";

function hasReferenceImageForVideo(request: VideoGenerationRequest): boolean {
  return typeof request.image === "string" && request.image.trim().length > 0;
}

function resolveEffectiveVideoPrompt(params: {
  request: VideoGenerationRequest;
  supportsImageInput: boolean;
}): string {
  const { request, supportsImageInput } = params;
  const trimmedPrompt = request.prompt.trim();
  if (trimmedPrompt) {
    return trimmedPrompt;
  }

  if (supportsImageInput && hasReferenceImageForVideo(request)) {
    return DEFAULT_VIDEO_REFERENCE_PROMPT;
  }

  throw new Error(
    "Prompt is required unless a reference image is provided for an image-input video model.",
  );
}

function formatUsdCents(usdCents: number): string {
  const safe = Math.max(0, usdCents);
  return `$${(safe / 100).toFixed(2)}`;
}

function getMonthlyPeriodKeyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function getQuotaDocPath(): string {
  return "aiImageGenerationQuota/global";
}

function getUsageDocPath(periodKey: string, accountId: string): string {
  return `aiImageGenerationUsageMonthly/${periodKey}/accounts/${accountId}`;
}

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  }
  return bucketName;
}

function buildFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

async function reserveVideoQuota(params: {
  accountId: string;
  request: VideoGenerationRequest;
}): Promise<{
  periodKey: string;
  reservedUsdCents: number;
  accountId: string;
} | null> {
  const { accountId, request } = params;
  const reservedUsdCents = VIDEO_PRICE_USD_CENTS[request.model];
  const periodKey = getMonthlyPeriodKeyUtc();

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));

  const isReserved = await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.exists
      ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
      : undefined;

    if (!quota?.enabled) {
      return false;
    }

    const limitFromUsd =
      typeof quota.monthlyLimitUsd === "number" &&
      Number.isFinite(quota.monthlyLimitUsd)
        ? Math.round(quota.monthlyLimitUsd * 100)
        : undefined;

    const limit =
      typeof quota.monthlyLimitUsdCents === "number" &&
      Number.isFinite(quota.monthlyLimitUsdCents)
        ? quota.monthlyLimitUsdCents
        : (limitFromUsd ?? DEFAULT_MONTHLY_LIMIT_USD_CENTS);

    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(
        "AI generation quota is enabled but monthlyLimitUsdCents is missing or invalid.",
      );
    }

    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.exists
      ? (usageSnap.data() as Partial<AiImageGenerationUsageDoc>)
      : undefined;
    const usedUsdCents =
      typeof usage?.usedUsdCents === "number" ? usage.usedUsdCents : 0;
    const alreadyReservedUsdCents =
      typeof usage?.reservedUsdCents === "number" ? usage.reservedUsdCents : 0;

    const wouldBe = usedUsdCents + alreadyReservedUsdCents + reservedUsdCents;
    if (wouldBe > limit) {
      const remainingUsdCents = Math.max(
        0,
        limit - usedUsdCents - alreadyReservedUsdCents,
      );
      throw new Error(
        `AI generation quota exceeded for this account. Remaining this month: ${formatUsdCents(remainingUsdCents)}.`,
      );
    }

    tx.set(
      usageRef,
      {
        usedUsdCents,
        reservedUsdCents: alreadyReservedUsdCents + reservedUsdCents,
        updatedAt: Timestamp.now(),
      } satisfies AiImageGenerationUsageDoc,
      { merge: true },
    );

    return true;
  });

  return isReserved ? { periodKey, reservedUsdCents, accountId } : null;
}

async function finalizeVideoQuota(params: {
  reservation: {
    periodKey: string;
    reservedUsdCents: number;
    accountId: string;
  };
  chargedUsdCents: number;
}): Promise<void> {
  const { reservation, chargedUsdCents } = params;
  const { accountId, periodKey, reservedUsdCents } = reservation;
  const safeChargedUsdCents = Math.max(0, Math.floor(chargedUsdCents));

  const db = getAdminDb();
  const quotaRef = db.doc(getQuotaDocPath());
  const usageRef = db.doc(getUsageDocPath(periodKey, accountId));

  await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.exists
      ? (quotaSnap.data() as Partial<AiImageGenerationQuotaDoc>)
      : undefined;

    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.exists
      ? (usageSnap.data() as Partial<AiImageGenerationUsageDoc>)
      : undefined;
    const currentReservedUsdCents =
      typeof usage?.reservedUsdCents === "number" ? usage.reservedUsdCents : 0;
    const nextReservedUsdCents = Math.max(
      0,
      currentReservedUsdCents - reservedUsdCents,
    );

    if (!usageSnap.exists) {
      tx.set(
        usageRef,
        {
          usedUsdCents: 0,
          reservedUsdCents: 0,
          updatedAt: Timestamp.now(),
        } satisfies AiImageGenerationUsageDoc,
        { merge: true },
      );
    }

    tx.update(usageRef, {
      reservedUsdCents: nextReservedUsdCents,
      updatedAt: Timestamp.now(),
      ...(quota?.enabled && safeChargedUsdCents > 0
        ? { usedUsdCents: FieldValue.increment(safeChargedUsdCents) }
        : {}),
    });
  });
}

async function translateToEnglish(text: string): Promise<string> {
  const vertex = await getVertexClient();

  const { text: translatedText } = await generateText({
    model: vertex(MODELS.GEMINI_3_FLASH_LITE),
    instructions: `You are a professional translator for video generation prompts. Translate the given text to English.
Return ONLY the translated text, nothing else. If the text is already in English, return it as is.`,
    prompt: text,
    temperature: 0,
  });

  return translatedText.trim();
}

async function uploadVideoToFirebaseStorage(params: {
  bytes: Uint8Array;
  contentType: string;
  storagePath: string;
  customMetadata: Record<string, string>;
}): Promise<GeneratedVideoUrl> {
  const { bytes, contentType, storagePath, customMetadata } = params;

  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();

  await bucket.file(storagePath).save(Buffer.from(bytes), {
    contentType,
    resumable: false,
    metadata: {
      metadata: {
        ...customMetadata,
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return {
    id:
      storagePath
        .split("/")
        .pop()
        ?.replace(/\.mp4$/i, "") ?? token,
    storagePath,
    url: buildFirebaseDownloadUrl(bucketName, storagePath, token),
  };
}

/**
 * Generate a video using AI SDK experimental_generateVideo.
 *
 * Currently supports:
 * - Vertex: veo-3.1-generate-001
 * - Vertex: veo-3.1-fast-generate-001
 */
export async function generateVideos(request: VideoGenerationRequest): Promise<{
  videos: GeneratedVideoUrl[];
}> {
  await checkAdmin();
  const accountId = await getAuthenticatedAdminUid();
  const tenantContext = await getTenantContextForRequest();
  const capabilities = VIDEO_MODEL_CAPABILITIES[request.model];
  const effectivePrompt = resolveEffectiveVideoPrompt({
    request,
    supportsImageInput: capabilities.supportsImageInput,
  });
  const normalizedRequest: VideoGenerationRequest = {
    ...request,
    prompt: effectivePrompt,
  };

  const aiUsageReservation = await reserveAiUsage({
    context: tenantContext,
    firestore: getAdminDb(),
    modality: "video",
    model: normalizedRequest.model,
    provider: "google-vertex",
    source: "video",
    userId: accountId,
    videoGenerations: 1,
  });
  let quotaReservation: Awaited<ReturnType<typeof reserveVideoQuota>> = null;
  let chargedUsdCentsForQuota = 0;
  let completedAiUsage = false;
  let generatedVideoCountForUsage = 0;

  try {
    quotaReservation = await reserveVideoQuota({
      accountId,
      request: normalizedRequest,
    });

    // Auto-translate prompts to English if needed
    let translatedPrompt = normalizedRequest.prompt;
    if (normalizedRequest.language && normalizedRequest.language !== "en") {
      if (
        !capabilities.supportedLanguages.includes(normalizedRequest.language)
      ) {
        translatedPrompt = await translateToEnglish(normalizedRequest.prompt);
      }
    }

    const aspectRatio = capabilities.supportsAspectRatio
      ? normalizedRequest.aspectRatio
      : undefined;
    const duration = capabilities.supportsDuration
      ? (() => {
          const requested = Math.min(
            normalizedRequest.duration ?? capabilities.defaultDurationSeconds,
            capabilities.maxDurationSeconds,
          );
          // Snap to nearest supported duration if model has fixed values
          if (capabilities.supportedDurations) {
            return capabilities.supportedDurations.reduce((prev, curr) =>
              Math.abs(curr - requested) < Math.abs(prev - requested)
                ? curr
                : prev,
            );
          }
          return requested;
        })()
      : undefined;

    // Vertex SDK silently drops URL-based images, so we must convert to base64
    let imageBase64: string | undefined;
    if (normalizedRequest.image) {
      const res = await fetch(normalizedRequest.image);
      const buffer = Buffer.from(await res.arrayBuffer());
      imageBase64 = buffer.toString("base64");
    }

    const prompt: string | { text: string; image: string } = imageBase64
      ? { text: translatedPrompt, image: imageBase64 }
      : translatedPrompt;

    if (!isVertexVideoModel(normalizedRequest.model)) {
      throw new Error(`Unsupported video model: ${normalizedRequest.model}`);
    }

    const vertex = await getVertexClient();

    const { videos } = await generateVideo({
      model: vertex.video(normalizedRequest.model),
      prompt,
      aspectRatio,
      duration,
      providerOptions: {
        vertex: {
          personGeneration: "allow_adult",
          generateAudio: normalizedRequest.generateAudio ?? false,
          pollTimeoutMs: 600_000,
        } satisfies GoogleVertexVideoProviderOptions,
      },
    });

    chargedUsdCentsForQuota = VIDEO_PRICE_USD_CENTS[normalizedRequest.model];

    const uploaded = await uploadGeneratedVideos({
      accountId,
      videos,
      request: normalizedRequest,
      prompt: translatedPrompt,
      aspectRatio,
      duration,
    });

    generatedVideoCountForUsage = uploaded.length;
    completedAiUsage = true;
    return { videos: uploaded };
  } finally {
    if (quotaReservation) {
      try {
        await finalizeVideoQuota({
          reservation: quotaReservation,
          chargedUsdCents: chargedUsdCentsForQuota,
        });
      } catch (error) {
        console.error("Failed to finalize AI video generation quota:", error);
      }
    }
    try {
      if (completedAiUsage) {
        await finalizeAiUsage({
          costUsdCents: chargedUsdCentsForQuota,
          firestore: getAdminDb(),
          reservation: aiUsageReservation,
          videoGenerations: generatedVideoCountForUsage || 1,
        });
      } else {
        await releaseAiUsageReservation({
          firestore: getAdminDb(),
          reservation: aiUsageReservation,
        });
      }
    } catch (error) {
      console.error("Failed to finalize AI video usage metering:", error);
    }
  }
}

async function uploadGeneratedVideos(params: {
  accountId: string;
  videos: Array<{ base64: string; uint8Array: Uint8Array; mediaType?: string }>;
  request: VideoGenerationRequest;
  prompt: string;
  aspectRatio: string | undefined;
  duration: number | undefined;
}): Promise<GeneratedVideoUrl[]> {
  const { accountId, videos, request, prompt, aspectRatio, duration } = params;

  const baseTimestamp = Date.now();
  const dateStr = new Date().toISOString().split("T")[0];

  const uploadTasks = videos.map((video, index) => {
    const bytes = video.uint8Array;
    const videoId = `${baseTimestamp}-${index}`;
    const storagePath = `ai/generated-videos/accounts/${accountId}/${dateStr}/${request.model.replace("/", "_")}/${videoId}.mp4`;

    return uploadVideoToFirebaseStorage({
      bytes,
      contentType: video.mediaType ?? "video/mp4",
      storagePath,
      customMetadata: {
        prompt,
        model: request.model,
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(duration ? { duration: String(duration) } : {}),
      },
    });
  });

  const uploaded = await Promise.all(uploadTasks);

  if (uploaded.length === 0) {
    throw new Error("No videos were generated. Try rephrasing your prompt.");
  }

  return uploaded;
}
