import { describe, expect, it } from "vitest";
import { getPdfPageCountFromMetadataText } from "./detect-imposition-page-count";

describe("getPdfPageCountFromMetadataText", () => {
  it("reads the count from a pages tree dictionary", () => {
    const pageCount = getPdfPageCountFromMetadataText(`
      2 0 obj
      << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>
      endobj
    `);

    expect(pageCount).toBe(4);
  });

  it("uses the largest pages-tree count when multiple pages nodes exist", () => {
    const pageCount = getPdfPageCountFromMetadataText(`
      2 0 obj
      << /Type /Pages /Kids [3 0 R] /Count 12 >>
      endobj
      8 0 obj
      << /Type /Pages /Kids [9 0 R] /Count 4 >>
      endobj
    `);

    expect(pageCount).toBe(12);
  });

  it("ignores individual page dictionaries", () => {
    const pageCount = getPdfPageCountFromMetadataText(`
      3 0 obj
      << /Type /Page /Parent 2 0 R /Count 999 >>
      endobj
    `);

    expect(pageCount).toBeNull();
  });
});
