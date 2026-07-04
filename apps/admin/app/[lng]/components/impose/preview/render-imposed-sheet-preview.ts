import "client-only";

import type { ImposePreviewRequest } from "@konfi/wasm";
import { imposePdfFileToBytes } from "@konfi/wasm/browser";

type RenderedImposedSheetPreviewResponse = {
  pageCount: number;
  pageImages: Record<string, string>;
};

export type RenderImposedSheetPreviewProgress = {
  progressPercent: number;
};

type ImposedPreviewPdfCacheEntry = {
  promise: Promise<Uint8Array>;
};

const PDF_PREVIEW_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
const IMPOSED_PREVIEW_PDF_CACHE_LIMIT = 2;
const imposedPreviewPdfCache = new Map<string, ImposedPreviewPdfCacheEntry>();

function inferContentType(file: File): string {
  if (file.type) {
    return file.type;
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

  if (filename.endsWith(".gif")) {
    return "image/gif";
  }

  if (filename.endsWith(".avif")) {
    return "image/avif";
  }

  return "application/octet-stream";
}

function normalizeRequestedPageNumbers(
  pageNumbers: readonly number[],
): number[] {
  return Array.from(
    new Set(
      pageNumbers.filter(
        (pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0,
      ),
    ),
  ).toSorted((left, right) => left - right);
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function emitProgress(
  onProgress:
    | ((progress: RenderImposedSheetPreviewProgress) => void)
    | undefined,
  progressPercent: number,
): void {
  onProgress?.({
    progressPercent: Math.min(100, Math.max(0, Math.round(progressPercent))),
  });
}

function readFileBytes(params: {
  file: File;
  onProgress?: (progress: RenderImposedSheetPreviewProgress) => void;
}): Promise<Uint8Array> {
  const { file, onProgress } = params;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read preview source file."));
    });
    reader.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      emitProgress(onProgress, 2 + (event.loaded / event.total) * 18);
    });
    reader.addEventListener("load", () => {
      const result = reader.result;

      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Failed to read preview source bytes."));
        return;
      }

      emitProgress(onProgress, 20);
      resolve(new Uint8Array(result));
    });

    emitProgress(onProgress, 0);
    reader.readAsArrayBuffer(file);
  });
}

async function createImposedPreviewPdfBytes(params: {
  file: File;
  onProgress?: (progress: RenderImposedSheetPreviewProgress) => void;
  previewRequest: ImposePreviewRequest;
}): Promise<Uint8Array> {
  const { file, onProgress, previewRequest } = params;
  const sourceBytes = await readFileBytes({ file, onProgress });

  emitProgress(onProgress, 25);

  const imposedBytes = await imposePdfFileToBytes({
    request: previewRequest,
    bytes: sourceBytes,
    contentType: inferContentType(file),
  });

  emitProgress(onProgress, 55);
  return imposedBytes;
}

function evictOldestImposedPreviewPdfCacheEntry(): void {
  const oldestKey = imposedPreviewPdfCache.keys().next().value;

  if (typeof oldestKey === "string") {
    imposedPreviewPdfCache.delete(oldestKey);
  }
}

async function getImposedPreviewPdfBytes(params: {
  cacheKey?: string;
  file: File;
  onProgress?: (progress: RenderImposedSheetPreviewProgress) => void;
  previewRequest: ImposePreviewRequest;
}): Promise<Uint8Array> {
  const { cacheKey, file, onProgress, previewRequest } = params;

  if (!cacheKey) {
    return createImposedPreviewPdfBytes({ file, onProgress, previewRequest });
  }

  const existingEntry = imposedPreviewPdfCache.get(cacheKey);

  if (existingEntry) {
    imposedPreviewPdfCache.delete(cacheKey);
    imposedPreviewPdfCache.set(cacheKey, existingEntry);
    emitProgress(onProgress, 55);
    return existingEntry.promise;
  }

  const promise = createImposedPreviewPdfBytes({
    file,
    onProgress,
    previewRequest,
  }).catch((error: unknown) => {
    imposedPreviewPdfCache.delete(cacheKey);
    throw error;
  });

  imposedPreviewPdfCache.set(cacheKey, { promise });

  while (imposedPreviewPdfCache.size > IMPOSED_PREVIEW_PDF_CACHE_LIMIT) {
    evictOldestImposedPreviewPdfCacheEntry();
  }

  return promise;
}

export async function renderImposedSheetPreview(params: {
  cacheKey?: string;
  file: File;
  onProgress?: (progress: RenderImposedSheetPreviewProgress) => void;
  pageNumbers: readonly number[];
  previewHeight: number;
  previewRequest: ImposePreviewRequest;
  previewWidth: number;
}): Promise<RenderedImposedSheetPreviewResponse> {
  const {
    cacheKey,
    file,
    onProgress,
    pageNumbers,
    previewHeight,
    previewRequest,
    previewWidth,
  } = params;
  const normalizedPageNumbers = normalizeRequestedPageNumbers(pageNumbers);

  if (normalizedPageNumbers.length === 0) {
    throw new Error("At least one rendered preview page is required.");
  }

  const imposedBytes = await getImposedPreviewPdfBytes({
    cacheKey,
    file,
    onProgress,
    previewRequest,
  });
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_PREVIEW_WORKER_SRC;
  const loadingTask = pdfjsLib.getDocument({ data: imposedBytes.slice() });
  const pdf = await loadingTask.promise;
  emitProgress(onProgress, 60);

  try {
    const safeMaxWidthPx = Math.max(1, Math.round(previewWidth));
    const safeMaxHeightPx = Math.max(1, Math.round(previewHeight));
    const pageImages: Record<string, string> = {};
    const renderablePageNumbers = normalizedPageNumbers.filter(
      (pageNumber) => pageNumber >= 1 && pageNumber <= pdf.numPages,
    );
    let renderedPageCount = 0;

    for (const pageNumber of renderablePageNumbers) {
      const page = await pdf.getPage(pageNumber);

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(
          0.1,
          Math.min(
            safeMaxWidthPx / baseViewport.width,
            safeMaxHeightPx / baseViewport.height,
          ),
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const canvasContext = canvas.getContext("2d");

        if (!canvasContext) {
          throw new Error("Failed to create preview canvas context.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvas,
          canvasContext,
          viewport,
          background: "rgb(255, 255, 255)",
        }).promise;

        pageImages[String(pageNumber)] = canvasToDataUrl(canvas);
        renderedPageCount += 1;
        emitProgress(
          onProgress,
          60 + (renderedPageCount / renderablePageNumbers.length) * 40,
        );
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }

    return {
      pageCount: pdf.numPages,
      pageImages,
    };
  } finally {
    emitProgress(onProgress, 100);
    await pdf.destroy();
  }
}
