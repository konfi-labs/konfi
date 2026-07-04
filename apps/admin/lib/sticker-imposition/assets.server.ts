import "server-only";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createPdfJsResourcePaths,
  type PdfJsResourcePaths,
} from "@/lib/pdfjs/resource-paths";
import sharp, { type Metadata } from "sharp";
import type { StickerImpositionItem, StickerSourceMetadata } from "./types";

const PDF_POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const DEFAULT_RENDER_DPI = 240;
const MAX_RENDER_DIMENSION_PX = 6000;
const PREVIEW_MAX_DIMENSION_PX = 1400;

const require = createRequire(import.meta.url);

type PdfJsWorkerGlobal = {
  WorkerMessageHandler: object;
};

type PdfJsDisplayModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type CanvasModule = {
  createCanvas: (
    width: number,
    height: number,
  ) => {
    encode: (format: "png") => Promise<Buffer | Uint8Array>;
    getContext: (contextId: "2d") => unknown;
  };
};

export type StickerArtworkAsset = {
  dataUrl: string;
  itemId: string;
};

export type StickerArtworkSourceFile =
  | File
  | {
    bytes: Uint8Array;
    contentType: string;
    filename: string;
  };

let pdfJsResourcePaths: PdfJsResourcePaths | null = null;
let pdfJsWorkerSetupPromise: Promise<void> | null = null;

function normalizeStickerContentType(
  contentType: string | undefined,
  filename: string,
): string {
  const normalizedType = contentType?.trim().toLowerCase() ?? "";
  const normalizedFilename = filename.toLowerCase();

  if (
    normalizedFilename.endsWith(".pdf") ||
    normalizedType === "application/pdf" ||
    normalizedType === "application/x-pdf"
  ) {
    return "application/pdf";
  }

  if (normalizedFilename.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedFilename.endsWith(".jpg") || normalizedFilename.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedFilename.endsWith(".tif") || normalizedFilename.endsWith(".tiff")) {
    return "image/tiff";
  }

  if (normalizedFilename.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (normalizedFilename.endsWith(".webp")) {
    return "image/webp";
  }

  return normalizedType || "application/octet-stream";
}

export function inferStickerContentType(file: File): string {
  return normalizeStickerContentType(file.type, file.name);
}

export async function readStickerSourceMetadata(
  files: readonly File[],
): Promise<StickerSourceMetadata[]> {
  const metadata: StickerSourceMetadata[] = [];

  for (const [sourceFileIndex, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = inferStickerContentType(file);

    if (contentType === "application/pdf") {
      metadata.push(
        ...(await readPdfMetadata({
          bytes,
          contentType,
          filename: file.name,
          sourceFileIndex,
        })),
      );
      continue;
    }

    metadata.push(
      await readImageMetadata({
        bytes,
        contentType,
        filename: file.name,
        sourceFileIndex,
      }),
    );
  }

  return metadata;
}

export async function createStickerArtworkAssets(params: {
  files: readonly StickerArtworkSourceFile[];
  items: readonly StickerImpositionItem[];
}): Promise<StickerArtworkAsset[]> {
  const fileBytes = await Promise.all(
    params.files.map(readStickerArtworkSourceFile),
  );
  const assets: StickerArtworkAsset[] = [];

  for (const item of params.items) {
    const source = fileBytes[item.sourceFileIndex];

    if (!source) {
      throw new Error(`Missing source file for ${item.filename}.`);
    }

    const pngBytes =
      source.contentType === "application/pdf"
        ? await renderPdfPageToPng({
          bytes: source.bytes,
          pageNumber: item.pageNumber,
          targetHeightMm: item.heightMm,
          targetWidthMm: item.widthMm,
        })
        : await renderImageToPng({
          bytes: source.bytes,
          targetHeightMm: item.heightMm,
          targetWidthMm: item.widthMm,
        });

    assets.push({
      dataUrl: `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
      itemId: item.id,
    });
  }

  return assets;
}

async function readStickerArtworkSourceFile(
  file: StickerArtworkSourceFile,
): Promise<{ bytes: Uint8Array; contentType: string; }> {
  if ("contentType" in file && "filename" in file) {
    return {
      bytes: file.bytes,
      contentType: normalizeStickerContentType(file.contentType, file.filename),
    };
  }

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: inferStickerContentType(file),
  };
}

export async function createStickerPreviewAssets(params: {
  files: readonly File[];
  sources: readonly StickerSourceMetadata[];
}): Promise<StickerArtworkAsset[]> {
  const fileBytes = await Promise.all(
    params.files.map(async (file) => ({
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: inferStickerContentType(file),
    })),
  );
  const assets: StickerArtworkAsset[] = [];

  for (const source of params.sources) {
    const file = fileBytes[source.sourceFileIndex];

    if (!file) {
      throw new Error(`Missing source file for ${source.filename}.`);
    }

    const pngBytes =
      file.contentType === "application/pdf"
        ? await renderPdfPagePreviewToPng({
          bytes: file.bytes,
          pageNumber: source.pageNumber,
        })
        : await renderImagePreviewToPng({
          bytes: file.bytes,
        });

    assets.push({
      dataUrl: `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
      itemId: source.id,
    });
  }

  return assets;
}

async function readPdfMetadata(params: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  sourceFileIndex: number;
}): Promise<StickerSourceMetadata[]> {
  const pdf = await loadPdfDocument(params.bytes);
  const metadata: StickerSourceMetadata[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      try {
        const viewport = page.getViewport({ scale: 1 });

        metadata.push({
          contentType: params.contentType,
          filename: params.filename,
          heightMm: pointsToMm(viewport.height),
          id: buildSourceMetadataId(params.sourceFileIndex, pageNumber),
          pageCount: pdf.numPages,
          pageNumber,
          sourceFileIndex: params.sourceFileIndex,
          widthMm: pointsToMm(viewport.width),
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return metadata;
}

async function readImageMetadata(params: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  sourceFileIndex: number;
}): Promise<StickerSourceMetadata> {
  const imageMetadata = await sharp(Buffer.from(params.bytes), {
    failOn: "none",
  }).metadata();
  const dimensions = resolveImagePhysicalSizeMm(imageMetadata);

  return {
    contentType: params.contentType,
    filename: params.filename,
    heightMm: dimensions?.heightMm ?? null,
    id: buildSourceMetadataId(params.sourceFileIndex, 1),
    pageCount: 1,
    pageNumber: 1,
    sourceFileIndex: params.sourceFileIndex,
    widthMm: dimensions?.widthMm ?? null,
  };
}

async function renderPdfPageToPng(params: {
  bytes: Uint8Array;
  pageNumber: number;
  targetHeightMm: number;
  targetWidthMm: number;
}): Promise<Uint8Array> {
  const pdf = await loadPdfDocument(params.bytes);

  try {
    if (params.pageNumber < 1 || params.pageNumber > pdf.numPages) {
      throw new Error(`PDF page ${params.pageNumber} does not exist.`);
    }

    const page = await pdf.getPage(params.pageNumber);

    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const target = resolveTargetPixels(
        params.targetWidthMm,
        params.targetHeightMm,
      );
      const scale = Math.max(
        0.1,
        Math.min(
          target.widthPx / baseViewport.width,
          target.heightPx / baseViewport.height,
        ),
      );
      const viewport = page.getViewport({ scale });
      const { createCanvas } = loadCanvasModule();
      const canvas = createCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height)),
      );
      const canvasContext = canvas.getContext("2d");

      await page.render({
        background: "rgb(255, 255, 255)",
        canvas: canvas as never,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const pngBuffer = await canvas.encode("png");

      return await normalizePngDimensions(pngBuffer, target);
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

async function renderImageToPng(params: {
  bytes: Uint8Array;
  targetHeightMm: number;
  targetWidthMm: number;
}): Promise<Uint8Array> {
  const target = resolveTargetPixels(
    params.targetWidthMm,
    params.targetHeightMm,
  );

  return await normalizePngDimensions(Buffer.from(params.bytes), target);
}

async function renderPdfPagePreviewToPng(params: {
  bytes: Uint8Array;
  pageNumber: number;
}): Promise<Uint8Array> {
  const pdf = await loadPdfDocument(params.bytes);

  try {
    if (params.pageNumber < 1 || params.pageNumber > pdf.numPages) {
      throw new Error(`PDF page ${params.pageNumber} does not exist.`);
    }

    const page = await pdf.getPage(params.pageNumber);

    try {
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
      const { createCanvas } = loadCanvasModule();
      const canvas = createCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height)),
      );
      const canvasContext = canvas.getContext("2d");

      await page.render({
        background: "rgb(255, 255, 255)",
        canvas: canvas as never,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const pngBuffer = await canvas.encode("png");
      return new Uint8Array(pngBuffer);
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

async function renderImagePreviewToPng(params: {
  bytes: Uint8Array;
}): Promise<Uint8Array> {
  const output = await sharp(Buffer.from(params.bytes), { failOn: "none" })
    .rotate()
    .resize({
      fit: "inside",
      height: PREVIEW_MAX_DIMENSION_PX,
      width: PREVIEW_MAX_DIMENSION_PX,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return new Uint8Array(output);
}

async function normalizePngDimensions(
  bytes: Buffer | Uint8Array,
  target: { heightPx: number; widthPx: number; },
): Promise<Uint8Array> {
  const output = await sharp(Buffer.from(bytes), { failOn: "none" })
    .rotate()
    .resize({
      fit: "fill",
      height: target.heightPx,
      width: target.widthPx,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return new Uint8Array(output);
}

async function loadPdfDocument(bytes: Uint8Array) {
  await ensurePdfJsWorkerGlobal();

  const { cMapsDir, standardFontsDir } = getPdfJsResourcePaths();
  const { getDocument } = await importPdfJsDisplayModule();
  const loadingTask = getDocument({
    cMapPacked: true,
    cMapUrl: cMapsDir,
    data: bytes,
    disableFontFace: true,
    standardFontDataUrl: standardFontsDir,
    useSystemFonts: false,
    useWasm: false,
  });

  return await loadingTask.promise;
}

function resolveImagePhysicalSizeMm(
  metadata: Metadata,
): { heightMm: number; widthMm: number; } | null {
  if (!metadata.width || !metadata.height || !metadata.density) {
    return null;
  }

  const density = metadata.density;

  if (!Number.isFinite(density) || density <= 0) {
    return null;
  }

  return {
    heightMm: roundMm((metadata.height / density) * MM_PER_INCH),
    widthMm: roundMm((metadata.width / density) * MM_PER_INCH),
  };
}

function resolveTargetPixels(
  widthMm: number,
  heightMm: number,
): { heightPx: number; widthPx: number; } {
  const widthPx = Math.max(
    1,
    Math.round((widthMm / MM_PER_INCH) * DEFAULT_RENDER_DPI),
  );
  const heightPx = Math.max(
    1,
    Math.round((heightMm / MM_PER_INCH) * DEFAULT_RENDER_DPI),
  );
  const scale = Math.min(
    1,
    MAX_RENDER_DIMENSION_PX / Math.max(widthPx, heightPx),
  );

  return {
    heightPx: Math.max(1, Math.round(heightPx * scale)),
    widthPx: Math.max(1, Math.round(widthPx * scale)),
  };
}

function buildSourceMetadataId(
  sourceFileIndex: number,
  pageNumber: number,
): string {
  return `${sourceFileIndex}:${pageNumber}`;
}

function loadCanvasModule(): CanvasModule {
  return require("@napi-rs/canvas") as CanvasModule;
}

async function importPdfJsDisplayModule(): Promise<PdfJsDisplayModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsDisplayModule>;
}

async function ensurePdfJsWorkerGlobal(): Promise<void> {
  const existing = (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal; })
    .pdfjsWorker;

  if (existing?.WorkerMessageHandler) {
    return;
  }

  if (!pdfJsWorkerSetupPromise) {
    pdfJsWorkerSetupPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs")
      .then((workerModule) => {
        const workerMessageHandler = workerModule.WorkerMessageHandler;

        if (!workerMessageHandler) {
          throw new Error(
            "PDF.js worker module did not expose WorkerMessageHandler.",
          );
        }

        (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal; }).pdfjsWorker = {
          WorkerMessageHandler: workerMessageHandler,
        };
      })
      .catch((error: unknown) => {
        pdfJsWorkerSetupPromise = null;
        throw error;
      });
  }

  await pdfJsWorkerSetupPromise;
}

function getPdfJsResourcePaths(): PdfJsResourcePaths {
  if (pdfJsResourcePaths) {
    return pdfJsResourcePaths;
  }

  pdfJsResourcePaths = createPdfJsResourcePaths({
    cwd: process.cwd(),
    resolvedPackageJsonPath: require.resolve("pdfjs-dist/package.json"),
    startDir: path.dirname(fileURLToPath(import.meta.url)),
  });

  return pdfJsResourcePaths;
}

function pointsToMm(points: number): number {
  return roundMm((points / PDF_POINTS_PER_INCH) * MM_PER_INCH);
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}
