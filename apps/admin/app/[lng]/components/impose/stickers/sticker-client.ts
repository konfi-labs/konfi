import {
  assertSaasRuntimeModuleAction,
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { auth, storage } from "@/lib/firebase/clientApp";
import {
  IMPOSITION_UPLOAD_PREFIX,
  type ImpositionUploadReference,
} from "@/lib/imposition/types";
import {
  stickerBleedFillMode,
  stickerCutShape,
  type StickerImpositionItem,
  type StickerSizeSource,
  type StickerSourceMetadata,
} from "@/lib/sticker-imposition/types";

export type StickerSizeAxis = "heightMm" | "widthMm";

type UploadStickerProgress = {
  progressPercent: number;
  totalFiles: number;
};

type BrowserPdfPage = {
  cleanup: () => void;
  getViewport: (options: { scale: number }) => {
    height: number;
    width: number;
  };
  render: (params: {
    background: string;
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { height: number; width: number };
  }) => {
    promise: Promise<void>;
  };
};

const PDF_POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const PREVIEW_MAX_DIMENSION_PX = 1400;
export const STICKER_BROWSER_METADATA_MAX_FILE_SIZE_MB = 50;
export const STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_MB = 100;
export const STICKER_BROWSER_METADATA_MAX_FILE_SIZE_BYTES =
  STICKER_BROWSER_METADATA_MAX_FILE_SIZE_MB * 1024 * 1024;
export const STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_BYTES =
  STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_MB * 1024 * 1024;
const STICKER_BROWSER_METADATA_MAX_PDF_PAGES = 100;
const STICKER_BROWSER_PREVIEW_MAX_PAGES = 24;

let pdfWorkerConfigured = false;

function roundDimensionMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type StickerMetadataResponse = {
  artworkPreviews?: Record<string, string>;
  sources: StickerSourceMetadata[];
};

export function buildFallbackMetadata(
  files: readonly File[],
): StickerSourceMetadata[] {
  return files.map((file, sourceFileIndex) => ({
    contentType: file.type || "application/octet-stream",
    filename: file.name,
    heightMm: null,
    id: `${sourceFileIndex}:1`,
    pageCount: 1,
    pageNumber: 1,
    sourceFileIndex,
    widthMm: null,
  }));
}

function buildSourceMetadataId(
  sourceFileIndex: number,
  pageNumber: number,
): string {
  return `${sourceFileIndex}:${pageNumber}`;
}

function pointsToMm(points: number): number {
  return roundDimensionMm((points / PDF_POINTS_PER_INCH) * MM_PER_INCH);
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

async function loadPdfJs() {
  const pdfjsLib = await import("pdfjs-dist");

  if (!pdfWorkerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerConfigured = true;
  }

  return pdfjsLib;
}

async function renderPdfPagePreviewToDataUrl(
  page: BrowserPdfPage,
): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(
    0.1,
    Math.min(
      PREVIEW_MAX_DIMENSION_PX / Math.max(baseViewport.width, 1),
      PREVIEW_MAX_DIMENSION_PX / Math.max(baseViewport.height, 1),
      1,
    ),
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const canvasContext = canvas.getContext("2d");

  if (!canvasContext) {
    throw new Error("Failed to create sticker preview canvas context.");
  }

  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  await page.render({
    background: "rgb(255, 255, 255)",
    canvas,
    canvasContext,
    viewport,
  }).promise;

  const dataUrl = canvasToDataUrl(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

async function readPdfSourceMetadataInBrowser(params: {
  contentType: string;
  file: File;
  sourceFileIndex: number;
}): Promise<StickerMetadataResponse> {
  const pdfjsLib = await loadPdfJs();
  const bytes = new Uint8Array(await params.file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const artworkPreviews: Record<string, string> = {};
  const sources: StickerSourceMetadata[] = [];

  try {
    if (pdf.numPages > STICKER_BROWSER_METADATA_MAX_PDF_PAGES) {
      return {
        sources: buildFallbackMetadata([params.file]).map((source) => ({
          ...source,
          contentType: params.contentType,
          sourceFileIndex: params.sourceFileIndex,
          id: buildSourceMetadataId(params.sourceFileIndex, 1),
        })),
      };
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = (await pdf.getPage(pageNumber)) as unknown as BrowserPdfPage;

      try {
        const viewport = page.getViewport({ scale: 1 });
        const id = buildSourceMetadataId(params.sourceFileIndex, pageNumber);

        sources.push({
          contentType: params.contentType,
          filename: params.file.name,
          heightMm: pointsToMm(viewport.height),
          id,
          pageCount: pdf.numPages,
          pageNumber,
          sourceFileIndex: params.sourceFileIndex,
          widthMm: pointsToMm(viewport.width),
        });
        if (pageNumber <= STICKER_BROWSER_PREVIEW_MAX_PAGES) {
          artworkPreviews[id] = await renderPdfPagePreviewToDataUrl(page);
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return { artworkPreviews, sources };
}

export function shouldReadStickerMetadataInBrowser(
  files: readonly File[],
): boolean {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    totalSize <= STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_BYTES &&
    files.every(
      (file) => file.size <= STICKER_BROWSER_METADATA_MAX_FILE_SIZE_BYTES,
    )
  );
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();

      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener(
        "error",
        () => {
          reject(new Error(`Failed to load image preview for ${file.name}.`));
        },
        { once: true },
      );
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderImagePreviewToDataUrl(file: File): Promise<string> {
  const image = await loadImageElement(file);
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = Math.min(PREVIEW_MAX_DIMENSION_PX / maxDimension, 1);
  const canvas = document.createElement("canvas");
  const canvasContext = canvas.getContext("2d");

  if (!canvasContext) {
    throw new Error("Failed to create sticker image preview canvas context.");
  }

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvasToDataUrl(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

async function readImageSourceMetadataInBrowser(params: {
  contentType: string;
  file: File;
  sourceFileIndex: number;
}): Promise<StickerMetadataResponse> {
  const id = buildSourceMetadataId(params.sourceFileIndex, 1);

  return {
    artworkPreviews: {
      [id]: await renderImagePreviewToDataUrl(params.file),
    },
    sources: [
      {
        contentType: params.contentType,
        filename: params.file.name,
        heightMm: null,
        id,
        pageCount: 1,
        pageNumber: 1,
        sourceFileIndex: params.sourceFileIndex,
        widthMm: null,
      },
    ],
  };
}

export async function readStickerMetadataInBrowser(
  files: readonly File[],
): Promise<StickerMetadataResponse> {
  if (!shouldReadStickerMetadataInBrowser(files)) {
    return { sources: buildFallbackMetadata(files) };
  }

  const artworkPreviews: Record<string, string> = {};
  const sources: StickerSourceMetadata[] = [];

  for (const [sourceFileIndex, file] of files.entries()) {
    const contentType = inferUploadContentType(file);
    const result =
      contentType === "application/pdf"
        ? await readPdfSourceMetadataInBrowser({
            contentType,
            file,
            sourceFileIndex,
          })
        : await readImageSourceMetadataInBrowser({
            contentType,
            file,
            sourceFileIndex,
          });

    sources.push(...result.sources);
    Object.assign(artworkPreviews, result.artworkPreviews);
  }

  return { artworkPreviews, sources };
}

export function createItemFromMetadata(
  source: StickerSourceMetadata,
  existingItem?: StickerImpositionItem,
): StickerImpositionItem {
  const existingSizeSource = existingItem?.sizeSource ?? "fallback";

  let widthMm: number;
  let heightMm: number;
  let sizeSource: StickerSizeSource;

  if (existingSizeSource === "user") {
    // Preserve the user's manual entry over any file-detected dimensions.
    widthMm = existingItem!.widthMm;
    heightMm = existingItem!.heightMm;
    sizeSource = "user";
  } else if (source.widthMm !== null && source.heightMm !== null) {
    // File dimensions are available — apply them.
    widthMm = source.widthMm;
    heightMm = source.heightMm;
    sizeSource = "file";
  } else {
    // No file dimensions; keep the previously known value or use the default.
    widthMm = existingItem?.widthMm ?? 50;
    heightMm = existingItem?.heightMm ?? 50;
    sizeSource = "fallback";
  }

  return {
    bleedMm: existingItem?.bleedMm ?? 0,
    bleedFillMode: existingItem?.bleedFillMode ?? stickerBleedFillMode.MIRROR,
    cutOffsetMm: existingItem?.cutOffsetMm ?? 0,
    cutShape: existingItem?.cutShape ?? stickerCutShape.RECTANGLE,
    filename:
      source.pageCount > 1
        ? `${source.filename} / ${source.pageNumber}`
        : source.filename,
    heightMm,
    id: source.id,
    mirrorBleedEnabled: existingItem?.mirrorBleedEnabled ?? false,
    pageNumber: source.pageNumber,
    preserveAspectRatio: existingItem?.preserveAspectRatio ?? true,
    quantity: existingItem?.quantity ?? 1,
    selectedPdfCutLineIds: existingItem?.selectedPdfCutLineIds ?? [],
    sizeSource,
    sourceHeightMm: source.heightMm,
    sourceFileIndex: source.sourceFileIndex,
    sourceWidthMm: source.widthMm,
    widthMm,
  };
}

export function mergeMetadataIntoItems(params: {
  existingItems: readonly StickerImpositionItem[];
  sources: readonly StickerSourceMetadata[];
}): StickerImpositionItem[] {
  const existingById = new Map(
    params.existingItems.map((item) => [item.id, item]),
  );

  return params.sources.map((source) =>
    createItemFromMetadata(source, existingById.get(source.id)),
  );
}

export function resolveLinkedStickerSizeChange(
  item: StickerImpositionItem,
  axis: StickerSizeAxis,
  nextValue: number,
): Partial<StickerImpositionItem> {
  const normalizedValue = Math.max(1, roundDimensionMm(nextValue));
  const basePatch: Partial<StickerImpositionItem> = {
    sizeSource: "user",
  };

  if (item.preserveAspectRatio === false) {
    return axis === "widthMm"
      ? { ...basePatch, widthMm: normalizedValue }
      : { ...basePatch, heightMm: normalizedValue };
  }

  const currentAxisValue = axis === "widthMm" ? item.widthMm : item.heightMm;
  const currentLinkedValue = axis === "widthMm" ? item.heightMm : item.widthMm;

  if (
    !Number.isFinite(currentAxisValue) ||
    !Number.isFinite(currentLinkedValue) ||
    currentAxisValue <= 0 ||
    currentLinkedValue <= 0
  ) {
    return axis === "widthMm"
      ? { ...basePatch, widthMm: normalizedValue }
      : { ...basePatch, heightMm: normalizedValue };
  }

  const linkedValue = Math.max(
    1,
    roundDimensionMm((normalizedValue / currentAxisValue) * currentLinkedValue),
  );

  return axis === "widthMm"
    ? {
        ...basePatch,
        heightMm: linkedValue,
        widthMm: normalizedValue,
      }
    : {
        ...basePatch,
        heightMm: normalizedValue,
        widthMm: linkedValue,
      };
}

export async function getErrorMessageFromResponse(
  response: Response,
): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  const text = (await response.text()).trim();
  return text || undefined;
}

export function triggerArchiveDownload(blob: Blob, filename: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  triggerArchiveUrlDownload(downloadUrl, filename);
}

export function triggerArchiveUrlDownload(
  downloadUrl: string,
  filename: string,
): void {
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.setAttribute("download", filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
}

function sanitizeStorageFilename(filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeFilename.length > 0 ? safeFilename : "sticker-upload.bin";
}

function createUploadId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferUploadContentType(file: File): string {
  const filename = file.name.toLowerCase();
  const normalizedType = file.type.trim().toLowerCase();

  if (
    filename.endsWith(".pdf") ||
    normalizedType === "application/pdf" ||
    normalizedType === "application/x-pdf"
  ) {
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

  if (filename.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filename.endsWith(".webp")) {
    return "image/webp";
  }

  return normalizedType || "application/octet-stream";
}

export async function uploadStickerSources(
  files: File[],
  onProgress?: (progress: UploadStickerProgress) => void,
): Promise<ImpositionUploadReference[]> {
  const { ref, uploadBytesResumable } = await import("firebase/storage");
  const dateSegment = new Date().toISOString().split("T")[0];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const transferredBytesByPath = new Map<string, number>();

  await assertSaasRuntimeModuleAction({
    module: "imposition",
    operation: "admin.sticker-imposition.source-upload",
  });
  await assertSaasRuntimeQuotaAction({
    operation: "admin.sticker-imposition.source-upload",
    requested: totalBytes,
    resource: "storageBytes",
  });

  const emitProgress = () => {
    const transferredBytes = Array.from(transferredBytesByPath.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const progressPercent =
      totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 100;

    onProgress?.({
      progressPercent,
      totalFiles: files.length,
    });
  };

  const uploadResults = await Promise.allSettled(
    files.map(async (file, index) => {
      const accountId = auth.currentUser?.uid;

      if (!accountId) {
        throw new Error("Authenticated admin user is required.");
      }

      const filename = file.name?.trim() || `sticker-upload-${index + 1}`;
      const safeFilename = sanitizeStorageFilename(filename);
      const storagePath = `${IMPOSITION_UPLOAD_PREFIX}/accounts/${accountId}/${dateSegment}/${createUploadId()}-${safeFilename}`;
      const contentType = inferUploadContentType(file);

      transferredBytesByPath.set(storagePath, 0);

      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(
          ref(storage, storagePath),
          file,
          {
            contentType,
            customMetadata: {
              accountId,
              originalFilename: filename,
            },
          },
        );

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            transferredBytesByPath.set(storagePath, snapshot.bytesTransferred);
            emitProgress();
          },
          (error) => {
            reject(error);
          },
          () => {
            transferredBytesByPath.set(storagePath, file.size);
            emitProgress();
            resolve();
          },
        );
      });

      return {
        contentType,
        filename,
        size: file.size,
        storagePath,
      };
    }),
  );

  const uploads = uploadResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failedUpload = uploadResults.find(
    (result) => result.status === "rejected",
  );

  if (!failedUpload) {
    await recordSaasRuntimeQuotaUsageAction({
      operation: "admin.sticker-imposition.source-upload",
      requested: totalBytes,
      resource: "storageBytes",
    });
    return uploads;
  }

  await cleanupStickerUploads(uploads);
  throw failedUpload.reason;
}

export async function cleanupStickerUploads(
  uploads: readonly ImpositionUploadReference[],
): Promise<void> {
  if (uploads.length === 0) {
    return;
  }

  const { deleteObject, ref } = await import("firebase/storage");

  await Promise.allSettled(
    uploads.map(async (upload) => {
      try {
        await deleteObject(ref(storage, upload.storagePath));
      } catch (error) {
        console.warn("Failed to remove temporary sticker upload", error);
      }
    }),
  );
}

export function getFilenameFromDisposition(value: string | null): string {
  if (!value) {
    return "sticker-imposition.tar.gz";
  }

  const encodedMatch = /filename\*=UTF-8''([^;]+)/.exec(value);

  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = /filename="([^"]+)"/.exec(value);
  return plainMatch?.[1] ?? "sticker-imposition.tar.gz";
}
