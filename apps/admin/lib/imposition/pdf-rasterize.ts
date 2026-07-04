import "server-only";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createPdfJsResourcePaths,
  type PdfJsResourcePaths,
} from "@/lib/pdfjs/resource-paths";

const PDF_PAGE_POINT_DPI = 72;
const PDF_RASTER_DPI = 300;
const PDF_MAX_DIMENSION_PX = 4096;

const require = createRequire(import.meta.url);

let pdfJsResourcePaths: PdfJsResourcePaths | null = null;

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

type PdfJsWorkerGlobal = {
  WorkerMessageHandler: object;
};

type PdfJsDisplayModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type CanvasModule = {
  createCanvas: (
    width: number,
    height: number,
  ) => {
    getContext: (contextId: "2d") => unknown;
    encode: (format: "png") => Promise<Buffer | Uint8Array>;
  };
};

function loadCanvasModule(): CanvasModule {
  return require("@napi-rs/canvas") as CanvasModule;
}

async function importPdfJsDisplayModule(): Promise<PdfJsDisplayModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsDisplayModule>;
}

let pdfJsWorkerSetupPromise: Promise<void> | null = null;
const pdfJsWorkerModuleSpecifier = "pdfjs-dist/legacy/build/pdf.worker.mjs";

async function ensurePdfJsWorkerGlobal(): Promise<void> {
  const existing = (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal })
    .pdfjsWorker;
  if (existing?.WorkerMessageHandler) {
    return;
  }

  if (!pdfJsWorkerSetupPromise) {
    pdfJsWorkerSetupPromise = import(pdfJsWorkerModuleSpecifier)
      .then((workerModule) => {
        const workerMessageHandler = workerModule.WorkerMessageHandler;

        if (!workerMessageHandler) {
          throw new Error(
            "PDF.js worker module did not expose WorkerMessageHandler.",
          );
        }

        (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal }).pdfjsWorker = {
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

export async function rasterizePdfFirstPageToPng(params: {
  bytes: Uint8Array;
}): Promise<Uint8Array> {
  const { bytes } = params;
  await ensurePdfJsWorkerGlobal();

  const { cMapsDir, standardFontsDir } = getPdfJsResourcePaths();

  const { getDocument } = await importPdfJsDisplayModule();

  const loadingTask = getDocument({
    data: bytes,
    cMapUrl: cMapsDir,
    cMapPacked: true,
    standardFontDataUrl: standardFontsDir,
    useSystemFonts: false,
    useWasm: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);

    try {
      const baseScale = PDF_RASTER_DPI / PDF_PAGE_POINT_DPI;
      const initialViewport = page.getViewport({ scale: baseScale });
      const maxDimension = Math.max(
        initialViewport.width,
        initialViewport.height,
      );
      const cappedScale =
        maxDimension > PDF_MAX_DIMENSION_PX
          ? baseScale * (PDF_MAX_DIMENSION_PX / maxDimension)
          : baseScale;
      const viewport = page.getViewport({ scale: cappedScale });

      const { createCanvas } = loadCanvasModule();
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const canvasContext = canvas.getContext("2d");

      await page.render({
        canvas: canvas as never,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
        background: "rgb(255, 255, 255)",
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
