"use client";

import * as pdfjsLib from "pdfjs-dist";

// Set up worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extract the page count from a PDF file.
 * Returns the total number of pages in the PDF, or null if unable to determine.
 */
export async function getPdfPageCount(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
  } catch (error) {
    console.error("Error reading PDF page count:", error);
    return null;
  }
}

/**
 * Extract page counts from multiple PDF files.
 * Returns an array of page counts corresponding to the input files.
 * Non-PDF files or files that fail to load will have null page counts.
 */
export async function getPdfPageCounts(
  files: readonly File[],
): Promise<(number | null)[]> {
  return Promise.all(
    files.map(async (file) => {
      if (!file.type || !file.type.includes("pdf")) {
        return null;
      }
      return getPdfPageCount(file);
    }),
  );
}
