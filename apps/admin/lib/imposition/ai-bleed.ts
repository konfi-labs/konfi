import "server-only";

import {
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/ai/usage-metering";
import { getVertexClient } from "@/lib/ai/server-vertex";
import { getAdminDb, getTenantContext } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { bleedType } from "@konfi/types";
import { generateText } from "ai";
import sharp from "sharp";
import { rasterizePdfFirstPageToPng } from "./pdf-rasterize";
import type { ImpositionInputFile, ImpositionPayload } from "./types";
import { IMPOSITION_WARNING_CODES, type ImpositionWarning } from "./warnings";

const AI_BLEED_GEMINI_MODEL = MODELS.NANO_BANANA_2;
const AI_BLEED_DEFAULT_MM = 3;
const AI_BLEED_MAX_WORKING_DIMENSION_PX = 2048;
const AI_BLEED_CHROMA_GREEN = { r: 0, g: 255, b: 0 } as const;
const AI_BLEED_GREEN_REPLACEMENT_THRESHOLD = {
  maxRed: 80,
  minGreen: 180,
  maxBlue: 120,
} as const;
const AI_BLEED_PROMPT =
  "You are extending print artwork into bleed margins for press-ready output. The reference image is a working canvas: its center contains the original artwork, and the bright green outer border is temporary empty space that must be replaced by a seamless continuation of the artwork. Return exactly one edited image at the same dimensions as the working canvas. Replace the green border with believable continuation of the existing design on all four sides. Preserve the original central artwork exactly. Continue colors, gradients, textures, backgrounds, and edge details naturally into the bleed area. The generated bleed must meet the original artwork edge perfectly without visible seams, shifts, halos, gaps, or misalignment. Do not add or change text, logos, people, product silhouettes, or layout structure. Do not leave green, blank, white, black, or transparent bars in the bleed area.";

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/gif",
  "image/avif",
]);

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".gif",
  ".avif",
];

type PreparedAiBleedInput = {
  payload: ImpositionPayload;
  files: ImpositionInputFile[];
  warnings: ImpositionWarning[];
};

type OrientedItemSizeMm = {
  widthMm: number;
  heightMm: number;
};

type BleedInsetsPx = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type WorkingBleedDimensions = {
  scale: number;
  targetSourceWidth: number;
  targetSourceHeight: number;
  targetCanvasWidth: number;
  targetCanvasHeight: number;
  targetBleedX: number;
  targetBleedY: number;
  workingSourceWidth: number;
  workingSourceHeight: number;
  workingCanvasWidth: number;
  workingCanvasHeight: number;
  workingBleedX: number;
  workingBleedY: number;
};

type ProcessedAiBleedFile = {
  file: ImpositionInputFile;
  warning?: ImpositionWarning;
};

type GeminiPromptContent = Array<
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType: "image/png" }
>;

function normalizeMimeType(contentType: string | undefined): string {
  const normalized = (contentType ?? "").trim().toLowerCase();
  const base = normalized.split(";")[0]?.trim() ?? "";

  if (base === "image/jpg") {
    return "image/jpeg";
  }

  return base;
}

function isImageCandidate(file: ImpositionInputFile): boolean {
  const normalizedContentType = normalizeMimeType(file.contentType);
  if (SUPPORTED_IMAGE_MIME_TYPES.has(normalizedContentType)) {
    return true;
  }

  const lowerFilename = file.filename.trim().toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) =>
    lowerFilename.endsWith(extension),
  );
}

function isPdfCandidate(file: ImpositionInputFile): boolean {
  const normalizedContentType = normalizeMimeType(file.contentType);
  if (normalizedContentType === "application/pdf") {
    return true;
  }

  return file.filename.trim().toLowerCase().endsWith(".pdf");
}

async function normalizeFileForAiBleed(
  file: ImpositionInputFile,
): Promise<ImpositionInputFile> {
  if (!isPdfCandidate(file)) {
    return file;
  }

  const rasterizedBytes = await rasterizePdfFirstPageToPng({
    bytes: file.bytes,
  });

  return {
    ...file,
    bytes: rasterizedBytes,
    contentType: "image/png",
  };
}

function resolveBleedMm(payload: ImpositionPayload): number {
  const configuredBleed = payload.bleed ?? 0;
  return configuredBleed > 0 ? configuredBleed : AI_BLEED_DEFAULT_MM;
}

function resolveItemSizeMm(
  payload: ImpositionPayload,
  sourceWidthPx: number,
  sourceHeightPx: number,
): OrientedItemSizeMm | undefined {
  const itemWidthMm = payload.customItemSizeWidth ?? 0;
  const itemHeightMm = payload.customItemSizeHeight ?? 0;

  if (itemWidthMm <= 0 || itemHeightMm <= 0) {
    return undefined;
  }

  const sourceRatio = sourceWidthPx / sourceHeightPx;
  const directRatio = itemWidthMm / itemHeightMm;
  const swappedRatio = itemHeightMm / itemWidthMm;

  if (
    Math.abs(swappedRatio - sourceRatio) < Math.abs(directRatio - sourceRatio)
  ) {
    return {
      widthMm: itemHeightMm,
      heightMm: itemWidthMm,
    };
  }

  return {
    widthMm: itemWidthMm,
    heightMm: itemHeightMm,
  };
}

export function calculateBleedInsetsPx(params: {
  bleedMm: number;
  itemWidthMm: number;
  itemHeightMm: number;
  sourceWidthPx: number;
  sourceHeightPx: number;
}): BleedInsetsPx {
  const { bleedMm, itemWidthMm, itemHeightMm, sourceWidthPx, sourceHeightPx } =
    params;

  const horizontalBleed = Math.max(
    1,
    Math.round((sourceWidthPx * bleedMm) / itemWidthMm),
  );
  const verticalBleed = Math.max(
    1,
    Math.round((sourceHeightPx * bleedMm) / itemHeightMm),
  );

  return {
    left: horizontalBleed,
    right: horizontalBleed,
    top: verticalBleed,
    bottom: verticalBleed,
  };
}

function calculateWorkingBleedDimensions(params: {
  sourceWidthPx: number;
  sourceHeightPx: number;
  insetsPx: BleedInsetsPx;
}): WorkingBleedDimensions {
  const { sourceWidthPx, sourceHeightPx, insetsPx } = params;

  const targetCanvasWidth = sourceWidthPx + insetsPx.left + insetsPx.right;
  const targetCanvasHeight = sourceHeightPx + insetsPx.top + insetsPx.bottom;
  const targetMaxDimension = Math.max(targetCanvasWidth, targetCanvasHeight);
  const scale = Math.min(
    1,
    AI_BLEED_MAX_WORKING_DIMENSION_PX / targetMaxDimension,
  );

  const workingSourceWidth = Math.max(1, Math.round(sourceWidthPx * scale));
  const workingSourceHeight = Math.max(1, Math.round(sourceHeightPx * scale));
  const workingBleedX = Math.max(1, Math.round(insetsPx.left * scale));
  const workingBleedY = Math.max(1, Math.round(insetsPx.top * scale));
  const workingCanvasWidth = workingSourceWidth + workingBleedX * 2;
  const workingCanvasHeight = workingSourceHeight + workingBleedY * 2;

  return {
    scale,
    targetSourceWidth: sourceWidthPx,
    targetSourceHeight: sourceHeightPx,
    targetCanvasWidth,
    targetCanvasHeight,
    targetBleedX: insetsPx.left,
    targetBleedY: insetsPx.top,
    workingSourceWidth,
    workingSourceHeight,
    workingCanvasWidth,
    workingCanvasHeight,
    workingBleedX,
    workingBleedY,
  };
}

function createPngFilename(filename: string): string {
  const trimmedFilename = filename.trim();
  const baseName = trimmedFilename.replace(/\.[^.]+$/u, "") || "source";
  return `${baseName}-ai-bleed.png`;
}

function getGeneratedImageBytes(resultImage: {
  mediaType?: string;
  uint8Array?: Uint8Array;
  base64?: string;
}): Uint8Array {
  if (resultImage.uint8Array) {
    return resultImage.uint8Array;
  }

  if (resultImage.base64) {
    const base64 = resultImage.base64.includes(",")
      ? resultImage.base64.split(",")[1]
      : resultImage.base64;
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  throw new Error("AI bleed did not return image bytes.");
}

function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

async function createWorkingCanvasPng(params: {
  normalizedSourcePng: Buffer;
  workingDimensions: WorkingBleedDimensions;
}): Promise<Buffer> {
  const { normalizedSourcePng, workingDimensions } = params;
  const resizedSource = await sharp(normalizedSourcePng, {
    limitInputPixels: false,
  })
    .resize({
      width: workingDimensions.workingSourceWidth,
      height: workingDimensions.workingSourceHeight,
      fit: "fill",
    })
    .flatten({
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();

  return sharp(resizedSource, {
    limitInputPixels: false,
  })
    .extend({
      top: workingDimensions.workingBleedY,
      bottom: workingDimensions.workingBleedY,
      left: workingDimensions.workingBleedX,
      right: workingDimensions.workingBleedX,
      background: AI_BLEED_CHROMA_GREEN,
    })
    .png()
    .toBuffer();
}

async function createFallbackCanvasPng(params: {
  normalizedSourcePng: Buffer;
  workingDimensions: WorkingBleedDimensions;
}): Promise<Buffer> {
  const { normalizedSourcePng, workingDimensions } = params;
  const resizedSource = await sharp(normalizedSourcePng, {
    limitInputPixels: false,
  })
    .resize({
      width: workingDimensions.workingSourceWidth,
      height: workingDimensions.workingSourceHeight,
      fit: "fill",
    })
    .flatten({
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();

  return sharp(resizedSource, {
    limitInputPixels: false,
  })
    .extend({
      top: workingDimensions.workingBleedY,
      bottom: workingDimensions.workingBleedY,
      left: workingDimensions.workingBleedX,
      right: workingDimensions.workingBleedX,
      extendWith: "copy",
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();
}

async function createTargetFallbackCanvasPng(params: {
  normalizedSourcePng: Buffer;
  insetsPx: BleedInsetsPx;
}): Promise<Buffer> {
  const { normalizedSourcePng, insetsPx } = params;

  return sharp(normalizedSourcePng, {
    limitInputPixels: false,
  })
    .flatten({
      background: { r: 255, g: 255, b: 255 },
    })
    .extend({
      top: insetsPx.top,
      bottom: insetsPx.bottom,
      left: insetsPx.left,
      right: insetsPx.right,
      extendWith: "copy",
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();
}

function resolveAiBleedFailureWarning(error: unknown): ImpositionWarning {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Missing ADMIN_FIREBASE") ||
    message.includes("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
  ) {
    return {
      code: IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_VERTEX_CONFIG_INCOMPLETE,
    };
  }

  return {
    code: IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_FAILED,
    values: {
      reason: message,
    },
  };
}

function isLikelyGreenScreenPixel(
  red: number,
  green: number,
  blue: number,
): boolean {
  return (
    red <= AI_BLEED_GREEN_REPLACEMENT_THRESHOLD.maxRed &&
    green >= AI_BLEED_GREEN_REPLACEMENT_THRESHOLD.minGreen &&
    blue <= AI_BLEED_GREEN_REPLACEMENT_THRESHOLD.maxBlue
  );
}

async function replaceGreenBleedPixels(params: {
  generatedCanvasPng: Buffer;
  fallbackCanvasPng: Buffer;
  workingDimensions: WorkingBleedDimensions;
}): Promise<Buffer> {
  const { generatedCanvasPng, fallbackCanvasPng, workingDimensions } = params;

  const [generatedRaw, fallbackRaw] = await Promise.all([
    sharp(generatedCanvasPng, {
      limitInputPixels: false,
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(fallbackCanvasPng, {
      limitInputPixels: false,
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);

  const { width, height, channels } = generatedRaw.info;
  const centerLeft = workingDimensions.targetBleedX;
  const centerTop = workingDimensions.targetBleedY;
  const centerRight = centerLeft + workingDimensions.targetSourceWidth;
  const centerBottom = centerTop + workingDimensions.targetSourceHeight;
  const output = Buffer.from(generatedRaw.data);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isInsideOriginalBounds =
        x >= centerLeft &&
        x < centerRight &&
        y >= centerTop &&
        y < centerBottom;

      if (isInsideOriginalBounds) {
        continue;
      }

      const offset = (y * width + x) * channels;
      const red = output[offset] ?? 0;
      const green = output[offset + 1] ?? 0;
      const blue = output[offset + 2] ?? 0;

      if (!isLikelyGreenScreenPixel(red, green, blue)) {
        continue;
      }

      for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
        output[offset + channelIndex] =
          fallbackRaw.data[offset + channelIndex] ??
          output[offset + channelIndex];
      }
    }
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels,
    },
  })
    .png()
    .toBuffer();
}

async function outpaintSingleFile(params: {
  file: ImpositionInputFile;
  payload: ImpositionPayload;
  bleedMm: number;
}): Promise<ProcessedAiBleedFile> {
  const { file, payload, bleedMm } = params;

  const normalizedSource = sharp(Buffer.from(file.bytes), {
    limitInputPixels: false,
  }).rotate();
  const metadata = await normalizedSource.metadata();
  const sourceWidthPx = metadata.width;
  const sourceHeightPx = metadata.height;

  if (!sourceWidthPx || !sourceHeightPx) {
    throw new Error(
      `Failed to determine source image size for ${file.filename}.`,
    );
  }

  const itemSizeMm = resolveItemSizeMm(payload, sourceWidthPx, sourceHeightPx);
  if (!itemSizeMm) {
    throw new Error(
      `AI bleed requires valid item dimensions in the imposition request for ${file.filename}.`,
    );
  }

  const normalizedSourcePng = await normalizedSource.png().toBuffer();
  const insetsPx = calculateBleedInsetsPx({
    bleedMm,
    itemWidthMm: itemSizeMm.widthMm,
    itemHeightMm: itemSizeMm.heightMm,
    sourceWidthPx,
    sourceHeightPx,
  });

  const workingDimensions = calculateWorkingBleedDimensions({
    sourceWidthPx,
    sourceHeightPx,
    insetsPx,
  });
  const [workingCanvasPng, fallbackCanvasPng, targetFallbackCanvasPng] =
    await Promise.all([
      createWorkingCanvasPng({
        normalizedSourcePng,
        workingDimensions,
      }),
      createFallbackCanvasPng({
        normalizedSourcePng,
        workingDimensions,
      }),
      createTargetFallbackCanvasPng({
        normalizedSourcePng,
        insetsPx,
      }),
    ]);

  const vertex = await getVertexClient();
  const prompt: Array<{ role: "user"; content: GeminiPromptContent }> = [
    {
      role: "user",
      content: [
        { type: "text", text: AI_BLEED_PROMPT },
        {
          type: "image",
          image: bufferToBase64(workingCanvasPng),
          mimeType: "image/png",
        },
      ],
    },
  ];

  const firestore = getAdminDb();
  const aiUsageReservation = await reserveAiUsage({
    context: getTenantContext(),
    firestore,
    imageGenerations: 1,
    modality: "image",
    model: AI_BLEED_GEMINI_MODEL,
    provider: "google-vertex",
    source: "image",
  });
  let completedAiUsage = false;

  try {
    const result = await generateText({
      model: vertex(AI_BLEED_GEMINI_MODEL),
      prompt,
      providerOptions: {
        vertex: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      },
    });

    const generatedImage = result.files?.find((file) =>
      file.mediaType?.startsWith("image/"),
    );

    if (!generatedImage) {
      throw new Error(`AI bleed did not return an image for ${file.filename}.`);
    }

    completedAiUsage = true;

    const generatedBytes = getGeneratedImageBytes(generatedImage);
    const resizedOutpaintedCanvas = await sharp(Buffer.from(generatedBytes), {
      limitInputPixels: false,
    })
      .resize({
        width: workingDimensions.targetCanvasWidth,
        height: workingDimensions.targetCanvasHeight,
        fit: "fill",
      })
      .flatten({
        background: { r: 255, g: 255, b: 255 },
      })
      .png()
      .toBuffer();

    const compositedCanvas = await sharp(resizedOutpaintedCanvas, {
      limitInputPixels: false,
    })
      .composite([
        {
          input: normalizedSourcePng,
          left: workingDimensions.targetBleedX,
          top: workingDimensions.targetBleedY,
        },
      ])
      .png()
      .toBuffer();

    const finalBytes = await replaceGreenBleedPixels({
      generatedCanvasPng: compositedCanvas,
      fallbackCanvasPng: targetFallbackCanvasPng,
      workingDimensions,
    });

    return {
      file: {
        bytes: new Uint8Array(finalBytes),
        contentType: "image/png",
        filename: createPngFilename(file.filename),
      },
      ...(workingDimensions.scale < 1
        ? {
            warning: {
              code: IMPOSITION_WARNING_CODES.AI_BLEED_REDUCED_WORKING_RESOLUTION,
              values: {
                filename: file.filename,
              },
            },
          }
        : {}),
    };
  } finally {
    try {
      if (completedAiUsage) {
        await finalizeAiUsage({
          firestore,
          imageGenerations: 1,
          reservation: aiUsageReservation,
        });
      } else {
        await releaseAiUsageReservation({
          firestore,
          reservation: aiUsageReservation,
        });
      }
    } catch (error) {
      console.error("[AI Bleed] Failed to finalize AI usage metering", error);
    }
  }
}

export async function prepareImpositionInputForAiBleed(params: {
  payload: ImpositionPayload;
  files: ImpositionInputFile[];
}): Promise<PreparedAiBleedInput> {
  const { payload, files } = params;

  if (
    payload.bleedType !== bleedType.DIFFERENTIAL_DIFFUSION ||
    files.length === 0
  ) {
    return {
      payload,
      files,
      warnings: [],
    };
  }

  const unsupportedFile = files.find(
    (file) => !isImageCandidate(file) && !isPdfCandidate(file),
  );
  if (unsupportedFile) {
    return {
      payload,
      files,
      warnings: [
        {
          code: IMPOSITION_WARNING_CODES.AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE,
          values: {
            filename: unsupportedFile.filename,
          },
        },
      ],
    };
  }

  if (
    (payload.customItemSizeWidth ?? 0) <= 0 ||
    (payload.customItemSizeHeight ?? 0) <= 0
  ) {
    return {
      payload,
      files,
      warnings: [
        {
          code: IMPOSITION_WARNING_CODES.AI_BLEED_MISSING_ITEM_DIMENSIONS,
        },
      ],
    };
  }

  const bleedMm = resolveBleedMm(payload);

  try {
    const normalizedFiles = await Promise.all(
      files.map((file) => normalizeFileForAiBleed(file)),
    );
    const processedFiles: ProcessedAiBleedFile[] = [];

    for (const file of normalizedFiles) {
      processedFiles.push(
        await outpaintSingleFile({
          file,
          payload,
          bleedMm,
        }),
      );
    }

    return {
      payload: {
        ...payload,
        bleed: bleedMm,
        bleedType: bleedType.BLEED_INCLUDED,
      },
      files: processedFiles.map((entry) => entry.file),
      warnings: processedFiles
        .map((entry) => entry.warning)
        .filter((warning): warning is ImpositionWarning => Boolean(warning)),
    };
  } catch (error) {
    console.error("[AI Bleed] Failed to preprocess imposition batch", error);

    return {
      payload,
      files,
      warnings: [resolveAiBleedFailureWarning(error)],
    };
  }
}
