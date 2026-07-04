const LARGE_PDF_FULL_PARSE_LIMIT_BYTES = 32 * 1024 * 1024;
const PDF_PAGE_COUNT_SCAN_CHUNK_BYTES = 2 * 1024 * 1024;
const PDF_PAGE_COUNT_SCAN_WINDOW_BYTES = 4096;

const pdfTextDecoder = new TextDecoder("latin1");

/**
 * Detect PDF page count on the client without forcing a full parse for large
 * brochure files.
 */
export async function detectImpositionPageCount(
  file: File,
): Promise<number | null> {
  // Only process PDF files
  if (!isPdfFile(file)) {
    return null;
  }

  try {
    const pageCountFromMetadata = await detectPdfPageCountFromMetadata(file);
    if (pageCountFromMetadata) {
      return pageCountFromMetadata;
    }

    if (file.size > LARGE_PDF_FULL_PARSE_LIMIT_BYTES) {
      return null;
    }

    const { getPdfPageCount } = await import("@konfi/wasm/browser");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pageCount = await getPdfPageCount(bytes);
    return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null;
  } catch (error) {
    console.error("Error detecting imposition page count:", error);
    return null;
  }
}

function isPdfFile(file: File): boolean {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

async function detectPdfPageCountFromMetadata(
  file: File,
): Promise<number | null> {
  const chunks: string[] = [];
  const headSize = Math.min(file.size, PDF_PAGE_COUNT_SCAN_CHUNK_BYTES);
  chunks.push(await readPdfTextSlice(file, 0, headSize));

  if (file.size > headSize) {
    const tailStart = Math.max(0, file.size - PDF_PAGE_COUNT_SCAN_CHUNK_BYTES);
    chunks.push(await readPdfTextSlice(file, tailStart, file.size));
  }

  return getPdfPageCountFromMetadataText(chunks.join("\n"));
}

async function readPdfTextSlice(
  file: File,
  start: number,
  end: number,
): Promise<string> {
  return pdfTextDecoder.decode(await file.slice(start, end).arrayBuffer());
}

export function getPdfPageCountFromMetadataText(text: string): number | null {
  const pagesTypePattern = /\/Type\s*\/Pages\b/g;
  const counts: number[] = [];

  for (const match of text.matchAll(pagesTypePattern)) {
    const typeIndex = match.index ?? 0;
    const start = Math.max(0, typeIndex - PDF_PAGE_COUNT_SCAN_WINDOW_BYTES);
    const end = Math.min(
      text.length,
      typeIndex + PDF_PAGE_COUNT_SCAN_WINDOW_BYTES,
    );
    const pageTreeCandidate = text.slice(start, end);
    const countMatch = /\/Count\s+([1-9]\d*)\b/.exec(pageTreeCandidate);

    if (countMatch?.[1]) {
      counts.push(Number.parseInt(countMatch[1], 10));
    }
  }

  if (counts.length === 0) {
    return null;
  }

  return Math.max(...counts);
}
