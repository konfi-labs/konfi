import { describe, expect, it } from "vitest";

import { readAgentFileMetadataInBrowser } from "./agent-file-metadata.client";

describe("readAgentFileMetadataInBrowser", () => {
  it("skips detailed browser metadata for large files", async () => {
    const files = [
      {
        name: "catalog.pdf",
        size: 51 * 1024 * 1024,
        type: "application/pdf",
      },
    ] as unknown as File[];

    const metadata = await readAgentFileMetadataInBrowser(files);

    expect(metadata).toEqual([
      expect.objectContaining({
        error:
          "Detailed browser metadata was skipped because the file is too large.",
        filename: "catalog.pdf",
        pageCount: 1,
        pages: [],
        pagesTruncated: true,
      }),
    ]);
  });
});
