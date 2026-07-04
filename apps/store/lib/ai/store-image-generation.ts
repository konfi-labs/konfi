import "server-only";

import { randomUUID } from "node:crypto";
import {
  getAdminDb,
  getFirebaseAdminApp,
  getTenantContext,
} from "../firebase/serverApp";
import {
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "./usage-metering";
import { Attribute, Product } from "@konfi/types";
import { generateText, jsonSchema, Output, type ModelMessage } from "ai";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  getProductImageGenerationConfigPath,
  normalizeProductImageGenerationConfig,
  removeUndefined,
} from "@konfi/utils";
import {
  assertReferenceImages,
  buildStoreGeneratedImageHistoryEntry,
  buildGenerationPrompt,
  buildStoreGenerationStylePrompt,
  canAccessStoreImageGenerationProduct,
  deriveGenerationContext,
  IMPROVE_GENERATION_PROMPT_SYSTEM,
  getStoreGeneratedImageExpiresAt,
  getStoreImageGenerationMonthKey,
  isStoreImageGenerationRateLimitEnabled,
  resolveStoreGenerationStyle,
  reserveStoreImageGenerationBudget,
  resolveStoreGeneratedImageExpiryMs,
  sanitizePrompt,
  STORE_IMAGE_GENERATION_EXPIRED_ERROR,
  storeImageGenerationLimits,
  type StoreGenerationImage,
  type StoreGenerationReferenceImage,
  type StoreGenerationRequest,
  type StoreGenerationResult,
  type StoreGenerationSide,
  type StoreGenerationStyle,
} from "./store-image-generation.shared";

const IMAGE_MODEL = storeImageGenerationLimits.imageModel;
const FAST_TEXT_MODEL = "gemini-3.1-flash-lite";
const PRE_RESERVED_STORE_IMAGE_GENERATIONS = 2;

type VertexModel = Parameters<typeof generateText>[0]["model"];
type VertexClient = (model: string) => VertexModel;
type CreateVertex = (options: {
  googleAuthOptions: {
    credentials: {
      client_email: string;
      private_key: string;
    };
  };
  location: string;
  project: string;
}) => VertexClient;

type PrintSideCountOutput = {
  sideCount: number;
};

type SideSplitOutput = {
  frontBrief: string;
  backBrief: string;
};

type UsageDoc = {
  attempts?: Timestamp[];
  updatedAt?: Timestamp;
};

type MonthlyBudgetDoc = {
  generationCount?: number;
  month?: string;
  reservedUsdMicros?: number;
  updatedAt?: Timestamp;
};

type StoreImageGenerationJobDoc = {
  jobId: string;
  runId?: string;
  userId: string;
  status?: "pending" | "running" | "completed" | "failed";
  remainingAttempts?: number;
  result?: StoreGenerationResult;
  error?: string;
  expiresAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

let cachedVertexClient: VertexClient | null = null;
const GOOGLE_VERTEX_PACKAGE = "@ai-sdk/" + "google-vertex";

async function getVertexClient(): Promise<VertexClient> {
  if (cachedVertexClient) {
    return cachedVertexClient;
  }

  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!project) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID for Vertex AI.");
  }

  if (!clientEmail) {
    throw new Error("Missing ADMIN_FIREBASE_CLIENT_EMAIL for Vertex AI.");
  }

  if (!privateKeyRaw) {
    throw new Error("Missing ADMIN_FIREBASE_SERVICE_ACCOUNT for Vertex AI.");
  }

  const { createVertex } = (await import(GOOGLE_VERTEX_PACKAGE)) as unknown as {
    createVertex: CreateVertex;
  };

  cachedVertexClient = createVertex({
    project,
    location: "global",
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKeyRaw.replace(/\\n/g, "\n"),
      },
    },
  });

  return cachedVertexClient;
}

function getStorageBucketName(): string {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for generated image storage.",
    );
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

function parseGeneratedImageDataUrl(dataUrl: string): {
  bytes: Buffer;
  contentType: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Generated image is missing a valid base64 data URL.");
  }

  const [, contentType, base64] = match;

  return {
    bytes: Buffer.from(base64, "base64"),
    contentType,
  };
}

function sanitizeStorageMetadataValue(
  value: string | number | undefined,
  maxLength = 500,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = String(value).replace(/\s+/g, " ").trim();

  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue.slice(0, maxLength);
}

function resolveStoreImageGenerationJobExpiryMs(
  job: StoreImageGenerationJobDoc | undefined,
): number | null {
  if (!job) {
    return null;
  }

  return resolveStoreGeneratedImageExpiryMs({
    expiresAt:
      job.expiresAt instanceof Timestamp
        ? job.expiresAt.toMillis()
        : job.result?.expiresAtMs,
    generatedAt:
      job.createdAt instanceof Timestamp ? job.createdAt.toMillis() : undefined,
  });
}

export function isStoreImageGenerationJobExpired(
  job: StoreImageGenerationJobDoc | undefined,
  nowMs = Date.now(),
): boolean {
  const expiryMs = resolveStoreImageGenerationJobExpiryMs(job);
  if (expiryMs === null) {
    return false;
  }

  return expiryMs <= nowMs;
}

async function persistGeneratedStoreImage(params: {
  userId: string;
  productId: string;
  image: StoreGenerationImage;
  prompt: string;
  generatedAt: Date;
  context: StoreGenerationResult["context"];
  fileId?: string;
}): Promise<StoreGenerationImage> {
  const { userId, productId, image, prompt, generatedAt, context } = params;
  const { bytes, contentType } = parseGeneratedImageDataUrl(image.imageDataUrl);
  const bucketName = getStorageBucketName();
  const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
  const token = randomUUID();
  const dateStr = generatedAt.toISOString().slice(0, 10);
  const expiresAt = getStoreGeneratedImageExpiresAt(generatedAt);
  const fileId =
    params.fileId ?? `${generatedAt.getTime()}-${image.side}-${image.id}`;
  const storagePath = `ai/generated/users/${userId}/${dateStr}/${IMAGE_MODEL}/${productId}/${fileId}.png`;
  const promptMetadata = sanitizeStorageMetadataValue(prompt);
  const productNameMetadata = sanitizeStorageMetadataValue(
    context.productName,
    160,
  );
  const modelMetadata = sanitizeStorageMetadataValue(IMAGE_MODEL, 120);
  const pageLabelMetadata = sanitizeStorageMetadataValue(context.pageLabel, 80);
  const sizeLabelMetadata = sanitizeStorageMetadataValue(context.sizeLabel, 80);
  const aspectRatioMetadata = sanitizeStorageMetadataValue(
    context.aspectRatio,
    20,
  );
  const downloadUrl = buildFirebaseDownloadUrl(bucketName, storagePath, token);

  await bucket.file(storagePath).save(bytes, {
    contentType,
    resumable: false,
    metadata: {
      metadata: {
        ...(promptMetadata ? { prompt: promptMetadata } : {}),
        productId: sanitizeStorageMetadataValue(productId, 120),
        ...(productNameMetadata ? { productName: productNameMetadata } : {}),
        ...(modelMetadata ? { model: modelMetadata } : {}),
        side: sanitizeStorageMetadataValue(image.side, 20),
        generatedAt: sanitizeStorageMetadataValue(
          generatedAt.toISOString(),
          40,
        ),
        expiresAt: sanitizeStorageMetadataValue(expiresAt.toISOString(), 40),
        ...(pageLabelMetadata ? { pageLabel: pageLabelMetadata } : {}),
        ...(sizeLabelMetadata ? { sizeLabel: sizeLabelMetadata } : {}),
        ...(aspectRatioMetadata ? { aspectRatio: aspectRatioMetadata } : {}),
        printSideCount: sanitizeStorageMetadataValue(context.printSideCount, 4),
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const historyEntry = buildStoreGeneratedImageHistoryEntry({
    context,
    generatedAt,
    imageSide: image.side,
    model: IMAGE_MODEL,
    productId,
    prompt,
    storagePath,
    url: downloadUrl,
  });
  await getAdminDb()
    .collection("users")
    .doc(userId)
    .collection("imageGenerations")
    .doc(fileId)
    .set(removeUndefined(historyEntry));

  return {
    id: image.id,
    side: image.side,
    imageDataUrl: downloadUrl,
  };
}

function buildImageGenerationMessages(params: {
  prompt: string;
  referenceImages: StoreGenerationReferenceImage[];
}): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: params.prompt,
        },
        ...params.referenceImages.map((referenceImage) => ({
          type: "image" as const,
          image: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        })),
      ],
    },
  ];
}

async function improveGenerationPrompt(params: {
  prompt: string;
  context: ReturnType<typeof deriveGenerationContext>;
  style?: StoreGenerationStyle;
  language?: string | null;
}): Promise<string> {
  const vertex = await getVertexClient();
  const languageInstruction = params.language
    ? `Return the improved brief in ${params.language}.`
    : "Return the improved brief in the same language as the user's brief.";
  const result = await generateText({
    model: vertex(FAST_TEXT_MODEL),
    instructions: IMPROVE_GENERATION_PROMPT_SYSTEM,
    prompt: [
      `Product: ${params.context.productName}`,
      params.context.productCategory
        ? `Category: ${params.context.productCategory}`
        : undefined,
      params.context.productType
        ? `Type: ${params.context.productType}`
        : undefined,
      params.context.sizeLabel
        ? `Size: ${params.context.sizeLabel}`
        : undefined,
      params.context.pageLabel
        ? `Pages: ${params.context.pageLabel}`
        : undefined,
      params.context.combinationDescription
        ? `Selected combination: ${params.context.combinationDescription}`
        : undefined,
      buildStoreGenerationStylePrompt(params.style),
      params.context.isLargeFormat ? "Large format: yes" : undefined,
      languageInstruction,
      "Focus on layout, color palette, hierarchy, mood, typography direction, and how the design should fit the printed product as flat printable artwork only.",
      "Do not describe a photographed product, sheet mockup, hand-held print, desk scene, wall scene, packaging, or any 3D visualization.",
      "If the user included exact text or business details that should appear in the design, keep that copy verbatim in the improved brief.",
      `Original brief: ${params.prompt}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return sanitizePrompt(result.text);
}

async function resolveRequestedPrintSideCount(params: {
  context: ReturnType<typeof deriveGenerationContext>;
}): Promise<1 | 2> {
  if (!params.context.combinationDescription) {
    return 1;
  }

  const vertex = await getVertexClient();
  const result = await generateText({
    model: vertex(FAST_TEXT_MODEL),
    output: Output.object({
      name: "print_side_count",
      description:
        "Detect how many printable sides are required by the selected print combination.",
      schema: jsonSchema<PrintSideCountOutput>(
        {
          type: "object",
          additionalProperties: false,
          properties: {
            sideCount: {
              type: "integer",
              description:
                "Return 1 for a single printable side and 2 for front/back printing.",
            },
          },
          required: ["sideCount"],
        },
        {
          validate(value) {
            if (
              !value ||
              typeof value !== "object" ||
              !("sideCount" in value) ||
              typeof value.sideCount !== "number" ||
              !Number.isFinite(value.sideCount)
            ) {
              return {
                success: false as const,
                error: new Error("Expected a numeric sideCount."),
              };
            }

            return {
              success: true as const,
              value: {
                sideCount: Math.min(
                  2,
                  Math.max(1, Math.round(value.sideCount)),
                ),
              },
            };
          },
        },
      ),
    }),
    instructions:
      "You decide how many printable sides a configured print product requires. Use the selected combination description as the main signal. Return 1 for simplex/front-only/single-sided configurations. Return 2 for duplex/front-and-back/double-sided/both-sides configurations. Never return anything above 2.",
    prompt: [
      `Product: ${params.context.productName}`,
      params.context.productCategory
        ? `Category: ${params.context.productCategory}`
        : undefined,
      params.context.productType
        ? `Type: ${params.context.productType}`
        : undefined,
      `Selected combination: ${params.context.combinationDescription}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return result.output.sideCount <= 1 ? 1 : 2;
}

async function splitPromptAcrossSides(params: {
  prompt: string;
  context: ReturnType<typeof deriveGenerationContext>;
  style?: StoreGenerationStyle;
  language?: string | null;
}): Promise<
  Array<{
    side: Extract<StoreGenerationSide, "front" | "back">;
    prompt: string;
  }>
> {
  const vertex = await getVertexClient();
  const languageInstruction = params.language
    ? `Return both briefs in ${params.language}.`
    : "Return both briefs in the same language as the user's brief.";
  const result = await generateText({
    model: vertex(FAST_TEXT_MODEL),
    output: Output.object({
      name: "two_sided_print_briefs",
      description:
        "Separate front-side and back-side design briefs for a two-sided printed product.",
      schema: jsonSchema<SideSplitOutput>(
        {
          type: "object",
          additionalProperties: false,
          properties: {
            frontBrief: {
              type: "string",
              description:
                "A concise but production-focused brief for the front side artwork only.",
            },
            backBrief: {
              type: "string",
              description:
                "A concise but production-focused brief for the back side artwork only.",
            },
          },
          required: ["frontBrief", "backBrief"],
        },
        {
          validate(value) {
            if (!value || typeof value !== "object") {
              return {
                success: false as const,
                error: new Error("Expected an object response."),
              };
            }

            const frontBrief =
              "frontBrief" in value && typeof value.frontBrief === "string"
                ? value.frontBrief.trim()
                : "";
            const backBrief =
              "backBrief" in value && typeof value.backBrief === "string"
                ? value.backBrief.trim()
                : "";

            if (!frontBrief || !backBrief) {
              return {
                success: false as const,
                error: new Error("Expected both front and back briefs."),
              };
            }

            return {
              success: true as const,
              value: {
                frontBrief,
                backBrief,
              },
            };
          },
        },
      ),
    }),
    instructions:
      "You split a two-sided print brief into separate front-side and back-side artwork briefs. Keep both outputs focused on flat production artwork only. Never mention mockups, photography, staged scenes, hands, paper sheets, or 3D renderings. Keep both sides visually compatible, but do not simply duplicate the same sentence twice.",
    prompt: [
      `Product: ${params.context.productName}`,
      params.context.productCategory
        ? `Category: ${params.context.productCategory}`
        : undefined,
      params.context.productType
        ? `Type: ${params.context.productType}`
        : undefined,
      params.context.sizeLabel
        ? `Size: ${params.context.sizeLabel}`
        : undefined,
      params.context.combinationDescription
        ? `Selected combination: ${params.context.combinationDescription}`
        : "This product is printed on both sides.",
      buildStoreGenerationStylePrompt(params.style),
      languageInstruction,
      "Return separate briefs for the front and back sides. If the user only described one side explicitly, infer a complementary back side that fits the same campaign or brand direction while staying simpler and clearly separate.",
      `Original brief: ${params.prompt}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return [
    {
      side: "front",
      prompt: sanitizePrompt(result.output.frontBrief, {
        enforceWordCount: false,
      }),
    },
    {
      side: "back",
      prompt: sanitizePrompt(result.output.backBrief, {
        enforceWordCount: false,
      }),
    },
  ];
}

export async function consumeGenerationAttempt(
  userId: string,
  estimatedImageCount = 1,
): Promise<number> {
  const adminDb = getAdminDb();
  const usageRef = adminDb
    .collection("storeAiImageGenerationUsage")
    .doc(userId);
  const now = Date.now();
  const currentMonthKey = getStoreImageGenerationMonthKey(new Date(now));
  const monthlyBudgetRef = adminDb
    .collection("storeAiImageGenerationMonthlyBudget")
    .doc(currentMonthKey);
  const windowStart = now - storeImageGenerationLimits.rateLimitWindowMs;
  const normalizedImageCount = Math.max(1, Math.floor(estimatedImageCount));
  const shouldEnforceRateLimit = isStoreImageGenerationRateLimitEnabled();

  return adminDb.runTransaction(async (transaction) => {
    const [snapshot, monthlyBudgetSnapshot] = await Promise.all([
      transaction.get(usageRef),
      transaction.get(monthlyBudgetRef),
    ]);
    const data = (snapshot.data() as UsageDoc | undefined) ?? {};
    const monthlyBudgetData =
      (monthlyBudgetSnapshot.data() as MonthlyBudgetDoc | undefined) ?? {};
    const recentAttempts = (data.attempts ?? []).filter(
      (attempt) => attempt.toMillis() >= windowStart,
    );

    if (
      shouldEnforceRateLimit &&
      recentAttempts.length >= storeImageGenerationLimits.rateLimitMaxAttempts
    ) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    const reservedBudget = reserveStoreImageGenerationBudget({
      currentReservedUsdMicros: monthlyBudgetData.reservedUsdMicros ?? 0,
      estimatedGenerationCostUsdMicros:
        storeImageGenerationLimits.estimatedGenerationCostUsdMicros *
        normalizedImageCount,
      monthlyBudgetUsdMicros: storeImageGenerationLimits.monthlyBudgetUsdMicros,
    });

    const nextAttempts = shouldEnforceRateLimit
      ? [...recentAttempts, Timestamp.fromMillis(now)]
      : recentAttempts;
    // Reserve budget before generation so concurrent requests cannot overspend
    // the monthly cap. Failed generations are not refunded automatically;
    // this intentionally favors budget safety over perfect cost reconciliation.
    if (shouldEnforceRateLimit) {
      transaction.set(
        usageRef,
        {
          attempts: nextAttempts,
          updatedAt: Timestamp.fromMillis(now),
        },
        { merge: true },
      );
    }
    transaction.set(
      monthlyBudgetRef,
      {
        generationCount: (monthlyBudgetData.generationCount ?? 0) + 1,
        month: currentMonthKey,
        reservedUsdMicros: reservedBudget.nextReservedUsdMicros,
        updatedAt: Timestamp.fromMillis(now),
      },
      { merge: true },
    );

    return shouldEnforceRateLimit
      ? Math.max(
          0,
          storeImageGenerationLimits.rateLimitMaxAttempts - nextAttempts.length,
        )
      : storeImageGenerationLimits.rateLimitMaxAttempts;
  });
}

function getStoreImageGenerationJobRef(jobId: string) {
  return getAdminDb().collection("storeAiImageGenerationJobs").doc(jobId);
}

export async function upsertStoreImageGenerationJob(params: {
  jobId: string;
  userId: string;
  runId?: string;
  status?: StoreImageGenerationJobDoc["status"];
}) {
  const { jobId, userId, runId, status } = params;
  const now = Timestamp.now();

  await getStoreImageGenerationJobRef(jobId).set(
    removeUndefined({
      jobId,
      userId,
      runId,
      status,
      createdAt: now,
      updatedAt: now,
    } satisfies StoreImageGenerationJobDoc),
    { merge: true },
  );
}

export async function getStoreImageGenerationJobByRunId(
  runId: string,
): Promise<{
  id: string;
  data: StoreImageGenerationJobDoc;
} | null> {
  const snapshot = await getAdminDb()
    .collection("storeAiImageGenerationJobs")
    .where("runId", "==", runId)
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  if (!doc) {
    return null;
  }

  return {
    id: doc.id,
    data: doc.data() as StoreImageGenerationJobDoc,
  };
}

async function consumeGenerationAttemptForJob(params: {
  jobId: string;
  userId: string;
  estimatedImageCount: number;
}): Promise<number> {
  const { jobId, userId, estimatedImageCount } = params;
  const adminDb = getAdminDb();
  const jobRef = getStoreImageGenerationJobRef(jobId);
  const usageRef = adminDb
    .collection("storeAiImageGenerationUsage")
    .doc(userId);
  const now = Date.now();
  const currentMonthKey = getStoreImageGenerationMonthKey(new Date(now));
  const monthlyBudgetRef = adminDb
    .collection("storeAiImageGenerationMonthlyBudget")
    .doc(currentMonthKey);
  const windowStart = now - storeImageGenerationLimits.rateLimitWindowMs;
  const normalizedImageCount = Math.max(1, Math.floor(estimatedImageCount));
  const shouldEnforceRateLimit = isStoreImageGenerationRateLimitEnabled();

  return adminDb.runTransaction(async (transaction) => {
    const [jobSnapshot, usageSnapshot, monthlyBudgetSnapshot] =
      await Promise.all([
        transaction.get(jobRef),
        transaction.get(usageRef),
        transaction.get(monthlyBudgetRef),
      ]);
    const job = (jobSnapshot.data() as
      | StoreImageGenerationJobDoc
      | undefined) ?? {
      jobId,
      userId,
    };

    if (typeof job.remainingAttempts === "number") {
      return job.remainingAttempts;
    }

    const usage = (usageSnapshot.data() as UsageDoc | undefined) ?? {};
    const monthlyBudgetData =
      (monthlyBudgetSnapshot.data() as MonthlyBudgetDoc | undefined) ?? {};
    const recentAttempts = (usage.attempts ?? []).filter(
      (attempt) => attempt.toMillis() >= windowStart,
    );

    if (
      shouldEnforceRateLimit &&
      recentAttempts.length >= storeImageGenerationLimits.rateLimitMaxAttempts
    ) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    const reservedBudget = reserveStoreImageGenerationBudget({
      currentReservedUsdMicros: monthlyBudgetData.reservedUsdMicros ?? 0,
      estimatedGenerationCostUsdMicros:
        storeImageGenerationLimits.estimatedGenerationCostUsdMicros *
        normalizedImageCount,
      monthlyBudgetUsdMicros: storeImageGenerationLimits.monthlyBudgetUsdMicros,
    });

    const nextAttempts = shouldEnforceRateLimit
      ? [...recentAttempts, Timestamp.fromMillis(now)]
      : recentAttempts;
    const remainingAttempts = shouldEnforceRateLimit
      ? Math.max(
          0,
          storeImageGenerationLimits.rateLimitMaxAttempts - nextAttempts.length,
        )
      : storeImageGenerationLimits.rateLimitMaxAttempts;

    if (shouldEnforceRateLimit) {
      transaction.set(
        usageRef,
        {
          attempts: nextAttempts,
          updatedAt: Timestamp.fromMillis(now),
        },
        { merge: true },
      );
    }

    transaction.set(
      monthlyBudgetRef,
      {
        generationCount: (monthlyBudgetData.generationCount ?? 0) + 1,
        month: currentMonthKey,
        reservedUsdMicros: reservedBudget.nextReservedUsdMicros,
        updatedAt: Timestamp.fromMillis(now),
      },
      { merge: true },
    );

    transaction.set(
      jobRef,
      {
        jobId,
        userId,
        status: job.status === "completed" ? "completed" : "running",
        remainingAttempts,
        createdAt:
          job.createdAt instanceof Timestamp
            ? job.createdAt
            : Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now),
      } satisfies StoreImageGenerationJobDoc,
      { merge: true },
    );

    return remainingAttempts;
  });
}

function extractImageBase64(params: {
  base64?: string;
  uint8Array?: Uint8Array;
}): string | undefined {
  if (params.base64 && params.base64.length > 0) {
    return params.base64.includes(",")
      ? params.base64.split(",")[1]
      : params.base64;
  }

  if (params.uint8Array) {
    return Buffer.from(params.uint8Array).toString("base64");
  }

  return undefined;
}

async function generateImageVariant(params: {
  vertex: VertexClient;
  prompt: string;
  referenceImages?: StoreGenerationReferenceImage[];
  side: StoreGenerationSide;
}): Promise<StoreGenerationImage> {
  const result = await generateText({
    model: params.vertex(IMAGE_MODEL),
    ...(params.referenceImages && params.referenceImages.length > 0
      ? {
          messages: buildImageGenerationMessages({
            prompt: params.prompt,
            referenceImages: params.referenceImages,
          }),
        }
      : {
          prompt: params.prompt,
        }),
  });

  const imageFile = result.files?.find((file) =>
    file.mediaType?.startsWith("image/"),
  );
  if (!imageFile) {
    throw new Error("Image generation failed.");
  }

  const base64 = extractImageBase64({
    base64: imageFile.base64,
    uint8Array: imageFile.uint8Array,
  });

  if (!base64) {
    throw new Error("Image generation failed.");
  }

  return {
    id: params.side,
    imageDataUrl: `data:${imageFile.mediaType ?? "image/png"};base64,${base64}`,
    side: params.side,
  };
}

async function generateStoreImageInternal(params: {
  request: StoreGenerationRequest;
  generatedAt: Date;
  resolveRemainingAttempts: (estimatedImageCount: number) => Promise<number>;
  createFileId: (params: {
    index: number;
    image: StoreGenerationImage;
  }) => string;
}): Promise<StoreGenerationResult> {
  const { request, generatedAt, resolveRemainingAttempts, createFileId } =
    params;
  const prompt = sanitizePrompt(request.prompt);
  const adminDb = getAdminDb();
  const productSnapshot = await adminDb
    .doc(`channels/${request.channelId}/products/${request.productId}`)
    .get();

  if (!productSnapshot.exists) {
    throw new Error("Product not found.");
  }

  const product = productSnapshot.data() as Product;

  if (
    !canAccessStoreImageGenerationProduct(
      product,
      request.allowAdminPreview ?? false,
    )
  ) {
    throw new Error("Product not found.");
  }

  const imageGenerationConfigSnapshot = await adminDb
    .doc(
      getProductImageGenerationConfigPath(request.channelId, request.productId),
    )
    .get();
  const imageGenerationConfig = normalizeProductImageGenerationConfig(
    imageGenerationConfigSnapshot.exists
      ? imageGenerationConfigSnapshot.data()
      : undefined,
  );

  if (!imageGenerationConfig?.enabled) {
    throw new Error("PRODUCT_IMAGE_GENERATION_DISABLED");
  }

  const attributeIds = Array.isArray(product.attributes)
    ? product.attributes
    : [];
  const attributeSnapshots = await Promise.all(
    attributeIds.map((attributeId) =>
      adminDb.doc(`attributes/${attributeId}`).get(),
    ),
  );
  const attributes = attributeSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() as Attribute);

  const context = deriveGenerationContext({
    product,
    attributes,
    selectedAttributeOptions: request.selectedAttributeOptions,
    requestedWidth: request.width,
    requestedHeight: request.height,
    requestedPageCount: request.pageCount,
  });
  const tenantContext = getTenantContext(request.tenantId);
  const aiUsageReservation = await reserveAiUsage({
    channelId: request.channelId,
    context: tenantContext,
    firestore: adminDb,
    imageGenerations: PRE_RESERVED_STORE_IMAGE_GENERATIONS,
    modality: "image",
    model: IMAGE_MODEL,
    provider: "google-vertex",
    source: "store-image",
    userId: request.userId,
  });
  let completedAiUsage = false;
  let generationPlans:
    | Array<{
        prompt: string;
        side: StoreGenerationSide;
      }>
    | undefined;

  try {
    const resolvedPrintSideCount = await resolveRequestedPrintSideCount({
      context,
    });
    const resolvedContext = {
      ...context,
      printSideCount: resolvedPrintSideCount,
    } satisfies typeof context;

    const improvedPrompt = request.improvePrompt
      ? await improveGenerationPrompt({
          prompt,
          context: resolvedContext,
          style: request.style,
          language: request.language,
        })
      : undefined;
    generationPlans =
      resolvedContext.printSideCount > 1
        ? await splitPromptAcrossSides({
            prompt: improvedPrompt ?? prompt,
            context: resolvedContext,
            style: request.style,
            language: request.language,
          })
        : [
            {
              side: "single" as const,
              prompt: improvedPrompt ?? prompt,
            },
          ];
    const resolvedGenerationPlans = generationPlans;
    const remainingAttempts = await resolveRemainingAttempts(
      resolvedGenerationPlans.length,
    );
    const vertex = await getVertexClient();
    const images = await Promise.all(
      resolvedGenerationPlans.map((plan) =>
        generateImageVariant({
          vertex,
          side: plan.side,
          prompt: buildGenerationPrompt({
            prompt: plan.prompt,
            context: resolvedContext,
            style: request.style,
            language: request.language,
            promptEnhancement: imageGenerationConfig.promptEnhancement,
            targetSide: plan.side === "single" ? undefined : plan.side,
          }),
          referenceImages: request.referenceImages,
        }),
      ),
    );
    const persistedImages = await Promise.all(
      images.map((image, index) =>
        persistGeneratedStoreImage({
          userId: request.userId,
          productId: product.id,
          image,
          fileId: createFileId({ index, image }),
          prompt: resolvedGenerationPlans[index]?.prompt ?? prompt,
          generatedAt,
          context: resolvedContext,
        }),
      ),
    );
    const expiresAt = getStoreGeneratedImageExpiresAt(generatedAt);
    completedAiUsage = true;

    return {
      images: persistedImages,
      context: resolvedContext,
      remainingAttempts,
      expiresAt: expiresAt.toISOString(),
      expiresAtMs: expiresAt.getTime(),
    };
  } finally {
    try {
      if (completedAiUsage && generationPlans) {
        await finalizeAiUsage({
          costUsdCents: Math.ceil(
            (storeImageGenerationLimits.estimatedGenerationCostUsdMicros *
              generationPlans.length) /
              10_000,
          ),
          firestore: adminDb,
          imageGenerations: generationPlans.length,
          reservation: aiUsageReservation,
        });
      } else {
        await releaseAiUsageReservation({
          firestore: adminDb,
          reservation: aiUsageReservation,
        });
      }
    } catch (error) {
      console.error("Failed to finalize store AI image usage metering", error);
    }
  }
}

export async function generateStoreImage(
  request: StoreGenerationRequest,
): Promise<StoreGenerationResult> {
  const generatedAt = new Date();

  return generateStoreImageInternal({
    request,
    generatedAt,
    resolveRemainingAttempts: (estimatedImageCount) =>
      consumeGenerationAttempt(request.userId, estimatedImageCount),
    createFileId: ({ image, index }) =>
      `${generatedAt.getTime()}-${image.side}-${image.id}-${index}`,
  });
}

export async function generateStoreImageForJob(params: {
  jobId: string;
  request: StoreGenerationRequest;
}): Promise<StoreGenerationResult> {
  const { jobId, request } = params;
  const jobRef = getStoreImageGenerationJobRef(jobId);
  const jobSnapshot = await jobRef.get();
  const job = jobSnapshot.exists
    ? (jobSnapshot.data() as StoreImageGenerationJobDoc)
    : undefined;

  if (
    job?.status === "completed" &&
    job.result &&
    !isStoreImageGenerationJobExpired(job)
  ) {
    return job.result;
  }

  const generatedAt =
    job?.createdAt instanceof Timestamp ? job.createdAt.toDate() : new Date();

  await jobRef.set(
    {
      jobId,
      userId: request.userId,
      status: "running",
      createdAt:
        job?.createdAt instanceof Timestamp ? job.createdAt : Timestamp.now(),
      updatedAt: Timestamp.now(),
    } satisfies StoreImageGenerationJobDoc,
    { merge: true },
  );

  try {
    const result = await generateStoreImageInternal({
      request,
      generatedAt,
      resolveRemainingAttempts: (estimatedImageCount) =>
        consumeGenerationAttemptForJob({
          jobId,
          userId: request.userId,
          estimatedImageCount,
        }),
      createFileId: ({ image, index }) => `${jobId}-${image.side}-${index}`,
    });

    await jobRef.set(
      removeUndefined({
        jobId,
        userId: request.userId,
        status: "completed",
        remainingAttempts: result.remainingAttempts,
        expiresAt: Timestamp.fromMillis(result.expiresAtMs),
        result,
        updatedAt: Timestamp.now(),
      } satisfies StoreImageGenerationJobDoc),
      { merge: true },
    );

    return result;
  } catch (error) {
    await jobRef.set(
      {
        jobId,
        userId: request.userId,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Image generation failed.",
        updatedAt: Timestamp.now(),
      } satisfies StoreImageGenerationJobDoc,
      { merge: true },
    );

    throw error;
  }
}

export {
  assertReferenceImages,
  buildGenerationPrompt,
  deriveGenerationContext,
  resolveStoreGenerationStyle,
  sanitizePrompt,
  STORE_IMAGE_GENERATION_EXPIRED_ERROR,
  storeImageGenerationLimits,
};
export type {
  StoreGenerationContext,
  StoreGenerationReferenceImage,
  StoreGenerationRequest,
  StoreGenerationResult,
} from "./store-image-generation.shared";
