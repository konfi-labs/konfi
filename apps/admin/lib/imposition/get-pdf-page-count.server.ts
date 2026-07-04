"use server";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createPdfJsResourcePaths,
  type PdfJsResourcePaths,
} from "@/lib/pdfjs/resource-paths";

const require = createRequire(import.meta.url);

type PdfJsWorkerGlobal = {
  WorkerMessageHandler: object;
};

type PdfJsDisplayModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsResourcePaths: PdfJsResourcePaths | null = null;
let pdfJsWorkerSetupPromise: Promise<void> | null = null;

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

async function importPdfJsDisplayModule(): Promise<PdfJsDisplayModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsDisplayModule>;
}

async function ensurePdfJsWorkerGlobal(): Promise<void> {
  const existing = (globalThis as { pdfjsWorker?: PdfJsWorkerGlobal; }).pdfjsWorker;
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

/**
 * Extract page count from PDF bytes.
 * Used to auto-detect pages_per_signature for imposition templates.
 */
export async function getPdfPageCountFromBytes(
  bytes: Uint8Array,
): Promise<number | null> {
  try {
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
    const pageCount = pdf.numPages;
    await pdf.destroy();

    return pageCount;
  } catch (error) {
    console.error("Error reading PDF page count:", error);
    return null;
  }
}
