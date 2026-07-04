import { requireAdminAuth } from "@/actions/auth-utils";
import {
  createStickerPreviewAssets,
  inferStickerContentType,
  readStickerSourceMetadata,
} from "@/lib/sticker-imposition/assets.server";
import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
} from "@konfi/types";
import { NextResponse } from "next/server";

function createErrorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function parseUploadIndex(key: string): number | undefined {
  const match = /^upload_file_(\d+)$/.exec(key);

  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getUploadedFiles(formData: FormData): File[] {
  const uploads: { file: File; index: number }[] = [];
  let fallbackIndex = 0;

  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File) || value.size <= 0) {
      continue;
    }

    uploads.push({
      file: value,
      index: parseUploadIndex(key) ?? fallbackIndex,
    });
    fallbackIndex += 1;
  }

  uploads.sort((left, right) => left.index - right.index);
  return uploads.map((upload) => upload.file);
}

function validateStickerFiles(files: readonly File[]): void {
  if (files.length === 0) {
    throw new Error("At least one sticker source file is required.");
  }

  if (files.length > IMPOSITION_MAX_FILES) {
    throw new Error(
      `Sticker imposition supports up to ${IMPOSITION_MAX_FILES} source files.`,
    );
  }

  const oversizedFile = files.find(
    (file) => file.size > IMPOSITION_MAX_FILE_SIZE_BYTES,
  );

  if (oversizedFile) {
    throw new Error(
      `File ${oversizedFile.name} exceeds the ${IMPOSITION_MAX_FILE_SIZE_MB} MB per-file limit.`,
    );
  }

  const totalSize = getImpositionTotalFileSize(files);

  if (totalSize > IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES) {
    throw new Error(
      `Sticker imposition exceeds the ${IMPOSITION_MAX_TOTAL_FILE_SIZE_MB} MB total upload limit.`,
    );
  }
}

function resolveErrorStatus(error: Error): number {
  if (error.message.includes("Unauthorized")) {
    return 401;
  }

  if (
    error.message.startsWith("At least one sticker source file") ||
    error.message.startsWith("Sticker imposition supports") ||
    error.message.startsWith("Sticker imposition exceeds") ||
    error.message.startsWith("File ")
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdminAuth();

    const formData = await request.formData();
    const files = getUploadedFiles(formData);
    validateStickerFiles(files);

    const metadata = await readStickerSourceMetadata(files);
    const previewAssets = await createStickerPreviewAssets({
      files,
      sources: metadata,
    });

    return NextResponse.json(
      {
        artworkPreviews: Object.fromEntries(
          previewAssets.map((asset) => [asset.itemId, asset.dataUrl]),
        ),
        sources: metadata,
        supportedContentTypes: files.map(inferStickerContentType),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[Sticker Metadata Route Error]:", error);

    if (error instanceof Error) {
      return createErrorResponse(error.message, resolveErrorStatus(error));
    }

    return createErrorResponse("Failed to read sticker source metadata.", 500);
  }
}
