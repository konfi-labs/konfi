import {
  getAuthenticatedAdminUid,
  requireAdminAuth,
} from "@/actions/auth-utils";
import {
  deleteImpositionUploadSources,
  readImpositionUploadsFromStorage,
  uploadImpositionArchive,
} from "@/lib/imposition/storage.server";
import { prepareImpositionInputForAiBleed } from "@/lib/imposition/ai-bleed";
import { IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE } from "@/lib/imposition/types";
import type {
  CreateImpositionRequest,
  ImpositionInputFile,
  ImpositionPayload,
  ImpositionProgressStreamEvent,
} from "@/lib/imposition/types";
import {
  parseCreateImpositionRequest as parseValidatedCreateImpositionRequest,
  parseImpositionPayload,
} from "@/lib/imposition/types";
import {
  isImpositionWarning,
  type ImpositionWarning,
} from "@/lib/imposition/warnings";
import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
} from "@konfi/types";
import type { ImposeArchiveProgressUpdate } from "@konfi/wasm";
import { NextResponse } from "next/server";

type ImpositionArchiveResult = Omit<
  Awaited<ReturnType<(typeof import("@konfi/wasm"))["imposeFilesToArchive"]>>,
  "warnings"
> & {
  warnings: ImpositionWarning[];
};

async function loadWasmModule(): Promise<typeof import("@konfi/wasm")> {
  return import("@konfi/wasm");
}

const IMPOSITION_PROGRESS_STREAM_HEADERS = {
  "Cache-Control": "no-store, no-transform",
  "Content-Type": `${IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE}; charset=utf-8`,
  "X-Accel-Buffering": "no",
} as const;

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

function validateImpositionBatchLimits(
  files: ReadonlyArray<{ filename: string; size: number }>,
): void {
  if (files.length === 0) {
    throw new Error("At least one file is required for imposition.");
  }

  if (files.length > IMPOSITION_MAX_FILES) {
    throw new Error(
      `Imposition batch exceeds the maximum of ${IMPOSITION_MAX_FILES} files.`,
    );
  }

  const oversizedFile = files.find(
    (file) => file.size > IMPOSITION_MAX_FILE_SIZE_BYTES,
  );

  if (oversizedFile) {
    throw new Error(
      `File ${oversizedFile.filename} exceeds the ${IMPOSITION_MAX_FILE_SIZE_MB} MB per-file limit.`,
    );
  }

  const totalFileSize = getImpositionTotalFileSize(files);

  if (totalFileSize > IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES) {
    throw new Error(
      `Imposition batch exceeds the ${IMPOSITION_MAX_TOTAL_FILE_SIZE_MB} MB total upload limit.`,
    );
  }
}

function parseJsonImpositionRequest(value: unknown): CreateImpositionRequest {
  const parsedRequest = parseValidatedCreateImpositionRequest(value);

  validateImpositionBatchLimits(
    parsedRequest.uploads.map((upload) => ({
      filename: upload.filename,
      size: upload.size,
    })),
  );

  return parsedRequest;
}

function getRequiredStringField(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required form data field: ${key}`);
  }

  return value;
}

function parseUploadIndex(key: string): number | undefined {
  const match = /^upload_file_(\d+)$/.exec(key);

  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function inferContentType(file: File): string {
  const normalizedType = file.type.trim().toLowerCase();

  if (normalizedType === "image/jpg") {
    return "image/jpeg";
  }

  if (normalizedType) {
    return normalizedType;
  }

  const filename = file.name.toLowerCase();

  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (filename.endsWith(".png")) {
    return "image/png";
  }

  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filename.endsWith(".tif") || filename.endsWith(".tiff")) {
    return "image/tiff";
  }

  if (filename.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}

function getUploadedFiles(formData: FormData): File[] {
  const uploads: { index: number; file: File }[] = [];
  let fallbackIndex = 0;

  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File) || value.size <= 0) {
      continue;
    }

    const parsedIndex = parseUploadIndex(key);

    uploads.push({
      index: parsedIndex ?? fallbackIndex,
      file: value,
    });

    fallbackIndex += 1;
  }

  uploads.sort((left, right) => left.index - right.index);
  return uploads.map((upload) => upload.file);
}

function encodeWarningsHeader(
  warnings: ImpositionWarning[],
): string | undefined {
  if (warnings.length === 0) {
    return undefined;
  }

  return encodeURIComponent(JSON.stringify(warnings));
}

async function parseJsonRequestBody(
  request: Request,
): Promise<CreateImpositionRequest> {
  try {
    const payload = (await request.json()) as unknown;
    return parseJsonImpositionRequest(payload);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid impose request payload")
    ) {
      throw error;
    }

    throw new Error(
      `Invalid impose request payload: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

async function createArchiveFromInput(params: {
  payload: ImpositionPayload;
  files: ImpositionInputFile[];
  onProgress?: (progress: ImposeArchiveProgressUpdate) => Promise<void> | void;
}): Promise<ImpositionArchiveResult> {
  const preparedInput = await prepareImpositionInputForAiBleed(params);
  const { imposeFilesToArchive } = await loadWasmModule();

  const archive = await imposeFilesToArchive({
    onProgress: params.onProgress,
    request: preparedInput.payload,
    files: preparedInput.files,
  });

  return {
    ...archive,
    warnings: [...preparedInput.warnings, ...archive.warnings].filter(
      isImpositionWarning,
    ),
  };
}

async function parseMultipartRequest(
  request: Request,
): Promise<{ payload: ImpositionPayload; files: ImpositionInputFile[] }> {
  const formData = await request.formData();
  const rawPayload = getRequiredStringField(formData, "data");

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawPayload) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid impose request payload: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }

  const payload = parseImpositionPayload(parsedPayload);

  const uploadedFiles = getUploadedFiles(formData);

  if (uploadedFiles.length === 0) {
    throw new Error("At least one file is required for imposition.");
  }

  validateImpositionBatchLimits(
    uploadedFiles.map((file) => ({
      filename: file.name,
      size: file.size,
    })),
  );

  return {
    payload,
    files: await Promise.all(
      uploadedFiles.map(async (file) => ({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: inferContentType(file),
        filename: file.name,
      })),
    ),
  };
}

function createArchiveDownloadResponse(
  archive: ImpositionArchiveResult,
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": archive.contentType,
    "Content-Disposition": `attachment; filename="${archive.filename}"; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
  });

  const warningsHeader = encodeWarningsHeader(archive.warnings);

  if (warningsHeader) {
    headers.set("x-imposition-warnings", warningsHeader);
  }

  return new Response(new Uint8Array(archive.bytes), {
    status: 200,
    headers,
  });
}

function wantsImpositionProgressStream(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  const progressHeader = request.headers.get("x-imposition-progress") || "";

  return (
    accept.includes(IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE) ||
    progressHeader === "1"
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function encodeImpositionProgressEvent(
  event: ImpositionProgressStreamEvent,
): Uint8Array {
  const encoder = new TextEncoder();

  return encoder.encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

async function enqueueImpositionProgressEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: ImpositionProgressStreamEvent,
): Promise<void> {
  controller.enqueue(encodeImpositionProgressEvent(event));
  await yieldToEventLoop();
}

function createProcessingProgressEvent(
  progress: ImposeArchiveProgressUpdate,
): ImpositionProgressStreamEvent {
  const progressPercent =
    progress.totalFiles > 0
      ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
      : 100;

  return {
    type: "progress",
    status: "processing",
    progressPercent,
    totalFiles: progress.totalFiles,
    completedFiles: progress.completedFiles,
    currentFileIndex: progress.fileIndex,
    currentFileName: progress.filename,
  };
}

async function handleStorageBackedProgressRequest(
  request: Request,
): Promise<Response> {
  const accountId = await getAuthenticatedAdminUid();
  const payload = await parseJsonRequestBody(request);
  const totalUploads = payload.uploads.length;

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        await enqueueImpositionProgressEvent(controller, {
          type: "progress",
          status: "preparing",
          progressPercent: null,
          totalFiles: totalUploads,
          completedFiles: 0,
        });

        const files = await readImpositionUploadsFromStorage(
          payload.uploads,
          accountId,
        );

        const archive = await createArchiveFromInput({
          payload: payload.data,
          files,
          onProgress: async (progress) => {
            await enqueueImpositionProgressEvent(
              controller,
              createProcessingProgressEvent(progress),
            );
          },
        });

        await enqueueImpositionProgressEvent(controller, {
          type: "progress",
          status: "finalizing",
          progressPercent: null,
          totalFiles: files.length,
          completedFiles: archive.files.length,
        });

        const storedArchive = await uploadImpositionArchive({
          accountId,
          archive,
        });

        await enqueueImpositionProgressEvent(controller, {
          type: "result",
          result: storedArchive,
        });
      } catch (error) {
        await enqueueImpositionProgressEvent(controller, {
          type: "error",
          error: getErrorMessage(error),
        });
      } finally {
        await deleteImpositionUploadSources(payload.uploads, accountId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: IMPOSITION_PROGRESS_STREAM_HEADERS,
  });
}

async function handleStorageBackedRequest(request: Request): Promise<Response> {
  const accountId = await getAuthenticatedAdminUid();
  const payload = await parseJsonRequestBody(request);

  try {
    const files = await readImpositionUploadsFromStorage(
      payload.uploads,
      accountId,
    );
    const archive = await createArchiveFromInput({
      payload: payload.data,
      files,
    });
    const storedArchive = await uploadImpositionArchive({ accountId, archive });

    return NextResponse.json(storedArchive, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await deleteImpositionUploadSources(payload.uploads, accountId);
  }
}

async function handleMultipartRequest(request: Request): Promise<Response> {
  await requireAdminAuth();

  const { payload, files } = await parseMultipartRequest(request);
  const archive = await createArchiveFromInput({ payload, files });

  return createArchiveDownloadResponse(archive);
}

function resolveErrorStatus(error: Error): number {
  if (error.message.includes("Unauthorized")) {
    return 401;
  }

  if (
    error.message.startsWith("Invalid impose request payload") ||
    error.message.startsWith("Missing required form data field") ||
    error.message.startsWith("At least one file is required") ||
    error.message.startsWith("Invalid imposition upload path") ||
    error.message.startsWith("Imposition batch exceeds") ||
    error.message.startsWith("File ")
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      if (wantsImpositionProgressStream(request)) {
        return await handleStorageBackedProgressRequest(request);
      }

      return await handleStorageBackedRequest(request);
    }

    return await handleMultipartRequest(request);
  } catch (error) {
    console.error("[Local Impose Route Error]:", error);

    if (error instanceof Error) {
      const status = resolveErrorStatus(error);
      return createErrorResponse(error.message, status);
    }

    return createErrorResponse("Failed to create imposition.", 500);
  }
}
