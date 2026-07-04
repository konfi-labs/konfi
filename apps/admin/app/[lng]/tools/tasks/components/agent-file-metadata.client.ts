"use client";

import {
  AGENT_FILE_METADATA_MAX_PAGES,
  AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES,
} from "@/lib/ai/durable-agents/file-metadata";
import type {
  AgentFileMetadata,
  AgentFileMetadataPage,
} from "@/lib/ai/durable-agents/types";
import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_SUPPORTED_FILE_TYPES,
  type PreflightIssue,
} from "@konfi/types";

type PdfJsModule = typeof import("pdfjs-dist");

type BrowserPdfPage = {
  cleanup: () => void;
  getViewport: (options: { scale: number }) => {
    height: number;
    width: number;
  };
};

type BrowserPdfDocument = {
  destroy: () => Promise<void>;
  getPage: (pageNumber: number) => Promise<unknown>;
  numPages: number;
};

const PDF_POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const AGENT_BROWSER_METADATA_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

let pdfWorkerConfigured = false;

function roundDimensionMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pointsToMm(points: number): number {
  return roundDimensionMm((points / PDF_POINTS_PER_INCH) * MM_PER_INCH);
}

function inferUploadContentType(file: File): string {
  if (file.type && isSupportedContentType(file.type)) {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function toTransferableBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

function isSupportedContentType(contentType: string): boolean {
  return IMPOSITION_SUPPORTED_FILE_TYPES.some(
    (supportedType) => supportedType === contentType,
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadPdfJs(): Promise<PdfJsModule> {
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

async function readPdfPages(buffer: ArrayBuffer): Promise<{
  pageCount: number;
  pages: AgentFileMetadataPage[];
  pagesTruncated: boolean;
}> {
  const pdfjsLib = await loadPdfJs();
  const loadingTask = pdfjsLib.getDocument({
    data: toTransferableBytes(buffer),
  });
  const pdf = (await loadingTask.promise) as BrowserPdfDocument;
  const pages: AgentFileMetadataPage[] = [];
  const pageCount = pdf.numPages;
  const pageLimit = Math.min(pageCount, AGENT_FILE_METADATA_MAX_PAGES);

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = (await pdf.getPage(pageNumber)) as BrowserPdfPage;

      try {
        const viewport = page.getViewport({ scale: 1 });

        pages.push({
          heightMm: pointsToMm(viewport.height),
          pageNumber,
          widthMm: pointsToMm(viewport.width),
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return {
    pageCount,
    pages,
    pagesTruncated: pageCount > AGENT_FILE_METADATA_MAX_PAGES,
  };
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
          reject(
            new Error(`Failed to read image dimensions for ${file.name}.`),
          );
        },
        { once: true },
      );
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readImagePage(file: File): Promise<AgentFileMetadataPage> {
  const image = await loadImageElement(file);

  return {
    heightPx: image.naturalHeight,
    pageNumber: 1,
    widthPx: image.naturalWidth,
  };
}

async function readPdfMetadata(file: File): Promise<AgentFileMetadata> {
  const contentType = inferUploadContentType(file);
  const buffer = await file.arrayBuffer();
  const { getPdfPageCount, inspectPdfPreflightFromBytes } =
    await import("@konfi/wasm/browser");
  const [pdfPages, wasmPageCount, preflightIssues] = await Promise.all([
    readPdfPages(buffer),
    getPdfPageCount(toTransferableBytes(buffer)).catch(() => 0),
    inspectPdfPreflightFromBytes(toTransferableBytes(buffer)).catch(
      (error: unknown): PreflightIssue[] => [
        {
          attributes: {},
          description: getErrorMessage(error),
          rule: "client_pdf_preflight",
        },
      ],
    ),
  ]);

  return {
    contentType,
    filename: file.name,
    pageCount: Math.max(pdfPages.pageCount, wasmPageCount),
    pages: pdfPages.pages,
    pagesTruncated: pdfPages.pagesTruncated,
    preflightIssues: preflightIssues.slice(
      0,
      AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES,
    ),
    sizeBytes: file.size,
  };
}

async function readImageMetadata(file: File): Promise<AgentFileMetadata> {
  const contentType = inferUploadContentType(file);
  const buffer = await file.arrayBuffer();
  const { inspectImagePreflightFromBytes } =
    await import("@konfi/wasm/browser");
  const [page, preflightIssues] = await Promise.all([
    readImagePage(file).catch((): AgentFileMetadataPage => ({ pageNumber: 1 })),
    inspectImagePreflightFromBytes(
      toTransferableBytes(buffer),
      contentType,
    ).catch((error: unknown): PreflightIssue[] => [
      {
        attributes: {},
        description: getErrorMessage(error),
        rule: "client_image_preflight",
      },
    ]),
  ]);

  return {
    contentType,
    filename: file.name,
    pageCount: 1,
    pages: [page],
    preflightIssues: preflightIssues.slice(
      0,
      AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES,
    ),
    sizeBytes: file.size,
  };
}

async function readFileMetadata(file: File): Promise<AgentFileMetadata> {
  const contentType = inferUploadContentType(file);

  if (!isSupportedContentType(contentType)) {
    throw new Error(`${file.name} is not a supported PDF or image file.`);
  }

  if (file.size > AGENT_BROWSER_METADATA_MAX_FILE_SIZE_BYTES) {
    return {
      contentType,
      error:
        "Detailed browser metadata was skipped because the file is too large.",
      filename: file.name,
      pageCount: 1,
      pages: [],
      pagesTruncated: true,
      sizeBytes: file.size,
    };
  }

  if (contentType === "application/pdf") {
    return readPdfMetadata(file);
  }

  return readImageMetadata(file);
}

export function validateAgentMetadataFiles(files: readonly File[]): void {
  if (files.length > IMPOSITION_MAX_FILES) {
    throw new Error(`Select at most ${IMPOSITION_MAX_FILES} files.`);
  }

  const oversizedFile = files.find(
    (file) => file.size > IMPOSITION_MAX_FILE_SIZE_BYTES,
  );

  if (oversizedFile) {
    throw new Error(`${oversizedFile.name} is too large.`);
  }

  if (
    getImpositionTotalFileSize(files) > IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES
  ) {
    throw new Error("Selected files are too large together.");
  }
}

export async function readAgentFileMetadataInBrowser(
  files: readonly File[],
): Promise<AgentFileMetadata[]> {
  validateAgentMetadataFiles(files);

  const metadata: AgentFileMetadata[] = [];

  for (const file of files) {
    metadata.push(await readFileMetadata(file));
  }

  return metadata;
}
