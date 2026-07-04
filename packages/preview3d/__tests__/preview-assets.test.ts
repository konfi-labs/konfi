import { describe, expect, it } from "vitest";

import { normalizePreview3DAssets } from "../src/preview-assets";

describe("normalizePreview3DAssets", () => {
  it("sorts and deduplicates preview URLs deterministically", () => {
    expect(
      normalizePreview3DAssets([
        "https://cdn.test/front.png",
        " ",
        "https://cdn.test/back.png",
        "https://cdn.test/front.png",
      ]),
    ).toEqual({
      backUrl: "https://cdn.test/front.png",
      frontUrl: "https://cdn.test/back.png",
      urls: ["https://cdn.test/back.png", "https://cdn.test/front.png"],
    });
  });

  it("keeps the back texture optional when only one preview URL exists", () => {
    expect(normalizePreview3DAssets(["https://cdn.test/page-1.png"])).toEqual({
      backUrl: undefined,
      frontUrl: "https://cdn.test/page-1.png",
      urls: ["https://cdn.test/page-1.png"],
    });
  });
});
