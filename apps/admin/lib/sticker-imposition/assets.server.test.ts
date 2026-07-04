import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readStickerSourceMetadata } from "./assets.server";

const PDFJS_METADATA_TEST_TIMEOUT_MS = 15_000;

function mmFromPoints(value: number): number {
  return Math.round((value / 72) * 25.4 * 100) / 100;
}

function createPdfBytes(
  pages: Array<{ heightPt: number; widthPt: number }>,
): Uint8Array {
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 3 + index * 2);
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`,
    ...pages.flatMap((page, index) => [
      `${contentIds[index]} 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n`,
      `${pageIds[index]} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << >> /Contents ${contentIds[index]} 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] >>\nendobj\n`,
    ]),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

describe("readStickerSourceMetadata", () => {
  it(
    "recognizes all pages from PDFs with non-standard PDF mime types",
    async () => {
      const pdfBytes = createPdfBytes([
        { widthPt: 144, heightPt: 216 },
        { widthPt: 288, heightPt: 360 },
      ]);
      const file = new File([pdfBytes], "multi-page.pdf", {
        type: "application/x-pdf",
      });

      const metadata = await readStickerSourceMetadata([file]);

      expect(metadata).toHaveLength(2);
      expect(metadata).toEqual([
        expect.objectContaining({
          contentType: "application/pdf",
          filename: "multi-page.pdf",
          id: "0:1",
          pageCount: 2,
          pageNumber: 1,
          sourceFileIndex: 0,
        }),
        expect.objectContaining({
          contentType: "application/pdf",
          filename: "multi-page.pdf",
          id: "0:2",
          pageCount: 2,
          pageNumber: 2,
          sourceFileIndex: 0,
        }),
      ]);
      expect(metadata[0]?.widthMm).toBe(mmFromPoints(144));
      expect(metadata[0]?.heightMm).toBe(mmFromPoints(216));
      expect(metadata[1]?.widthMm).toBe(mmFromPoints(288));
      expect(metadata[1]?.heightMm).toBe(mmFromPoints(360));
    },
    PDFJS_METADATA_TEST_TIMEOUT_MS,
  );
});
