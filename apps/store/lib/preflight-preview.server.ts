import "server-only";

import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const PDF_PAGE_POINT_DPI = 72;
const PDF_RASTER_DPI = 160;
const PDF_MAX_DIMENSION_PX = 2048;

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
    getContext: (contextId: "2d") => unknown;
    encode: (format: "png") => Promise<Uint8Array>;
  };
};

function toPdfJsFactoryUrl(dirPath: string): string {
  const withTrailingSeparator = dirPath.endsWith(path.sep)
    ? dirPath
    : `${dirPath}${path.sep}`;

  return pathToFileURL(withTrailingSeparator).href;
}

function getPdfJsPackageRoot(): string {
  return path.dirname(require.resolve("pdfjs-dist/package.json"));
}

function loadCanvasModule(): CanvasModule {
  return require("@napi-rs/canvas") as CanvasModule;
}

async function importPdfJsDisplayModule(): Promise<PdfJsDisplayModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsDisplayModule>;
}

let pdfJsWorkerSetupPromise: Promise<void> | null = null;

async function ensurePdfJsWorkerGlobal(): Promise<void> {
  const existing = (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal })
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

export async function rasterizePdfFirstPageToPng(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  await ensurePdfJsWorkerGlobal();

  const pdfJsPackageRoot = getPdfJsPackageRoot();
  const { getDocument } = await importPdfJsDisplayModule();
  const loadingTask = getDocument({
    data: bytes,
    cMapPacked: true,
    cMapUrl: toPdfJsFactoryUrl(path.join(pdfJsPackageRoot, "cmaps")),
    disableFontFace: true,
    standardFontDataUrl: toPdfJsFactoryUrl(
      path.join(pdfJsPackageRoot, "standard_fonts"),
    ),
    useSystemFonts: false,
    useWasm: false,
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

      await page.render({
        background: "rgb(255, 255, 255)",
        canvas: canvas as never,
        canvasContext: canvas.getContext(
          "2d",
        ) as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      return canvas.encode("png");
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}
