import { describe, expect, it } from "vitest";

import {
  AGENT_FILE_METADATA_MAX_PAGES,
  AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES,
  formatAgentFileMetadataForPrompt,
  sanitizeAgentFileMetadata,
} from "./file-metadata";

describe("sanitizeAgentFileMetadata", () => {
  it("keeps serializable file metadata and trims oversized arrays", () => {
    const pages = Array.from(
      { length: AGENT_FILE_METADATA_MAX_PAGES + 2 },
      (_, index) => ({
        heightMm: 50,
        pageNumber: index + 1,
        widthMm: 50,
      }),
    );
    const issues = Array.from(
      { length: AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES + 2 },
      (_, index) => ({
        attributes: { page: index + 1 },
        description: `Issue ${index + 1}`,
        rule: "test_rule",
      }),
    );

    const result = sanitizeAgentFileMetadata([
      {
        contentType: "application/pdf",
        filename: "Test.pdf",
        pageCount: 102,
        pages,
        preflightIssues: issues,
        sizeBytes: 2048,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentType: "application/pdf",
      filename: "Test.pdf",
      pageCount: 102,
      pagesTruncated: true,
      sizeBytes: 2048,
    });
    expect(result[0].pages).toHaveLength(AGENT_FILE_METADATA_MAX_PAGES);
    expect(result[0].preflightIssues).toHaveLength(
      AGENT_FILE_METADATA_MAX_PREFLIGHT_ISSUES,
    );
  });

  it("rejects invalid entries", () => {
    expect(
      sanitizeAgentFileMetadata([
        { filename: "", pageCount: 1, pages: [], sizeBytes: 1 },
        { filename: "file.pdf", pageCount: 0, pages: [], sizeBytes: 1 },
        { filename: "file.pdf", pageCount: 1, pages: [], sizeBytes: -1 },
      ]),
    ).toEqual([]);
  });
});

describe("formatAgentFileMetadataForPrompt", () => {
  it("formats deterministic metadata for the agent prompt", () => {
    const prompt = formatAgentFileMetadataForPrompt([
      {
        contentType: "application/pdf",
        filename: "Test.pdf",
        pageCount: 2,
        pages: [
          { heightMm: 50, pageNumber: 1, widthMm: 50 },
          { heightMm: 50, pageNumber: 2, widthMm: 50 },
        ],
        preflightIssues: [
          {
            attributes: {},
            description: "RGB color detected",
            rule: "no_rgb",
          },
        ],
        sizeBytes: 2048,
      },
    ]);

    expect(prompt).toContain("File bytes were not uploaded");
    expect(prompt).toContain("Treat file names as labels only");
    expect(prompt).toContain('"Test.pdf"');
    expect(prompt).toContain("2 pages");
    expect(prompt).toContain("page 1: 50 x 50 mm");
    expect(prompt).toContain("preflight: RGB color detected (no_rgb)");
  });
});
