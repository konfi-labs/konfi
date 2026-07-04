import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/saas-runtime-quotas", () => ({
  assertSaasRuntimeModuleAction: vi.fn(),
  assertSaasRuntimeQuotaAction: vi.fn(),
  recordSaasRuntimeQuotaUsageAction: vi.fn(),
}));

vi.mock("@/lib/firebase/clientApp", () => ({
  storage: {},
}));
import {
  buildFallbackMetadata,
  createItemFromMetadata,
  mergeMetadataIntoItems,
  readStickerMetadataInBrowser,
  resolveLinkedStickerSizeChange,
  shouldReadStickerMetadataInBrowser,
  STICKER_BROWSER_METADATA_MAX_FILE_SIZE_BYTES,
  STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_BYTES,
} from "./sticker-client";
import type {
  StickerImpositionItem,
  StickerSourceMetadata,
} from "@/lib/sticker-imposition/types";
import {
  stickerBleedFillMode,
  stickerCutShape,
} from "@/lib/sticker-imposition/types";

function makeSource(
  overrides?: Partial<StickerSourceMetadata>,
): StickerSourceMetadata {
  return {
    contentType: "application/pdf",
    filename: "label.pdf",
    heightMm: null,
    id: "0:1",
    pageCount: 1,
    pageNumber: 1,
    sourceFileIndex: 0,
    widthMm: null,
    ...overrides,
  };
}

function makeItem(
  overrides?: Partial<StickerImpositionItem>,
): StickerImpositionItem {
  return {
    bleedMm: 0,
    bleedFillMode: stickerBleedFillMode.MIRROR,
    cutOffsetMm: 0,
    cutShape: stickerCutShape.RECTANGLE,
    filename: "label.pdf",
    heightMm: 50,
    id: "0:1",
    mirrorBleedEnabled: false,
    pageNumber: 1,
    preserveAspectRatio: true,
    quantity: 1,
    sizeSource: "fallback",
    sourceHeightMm: null,
    sourceFileIndex: 0,
    sourceWidthMm: null,
    widthMm: 50,
    ...overrides,
  };
}

describe("createItemFromMetadata", () => {
  it("falls back to 50 mm when source has no dimensions", () => {
    const item = createItemFromMetadata(makeSource());
    expect(item.widthMm).toBe(50);
    expect(item.heightMm).toBe(50);
    expect(item.sizeSource).toBe("fallback");
    expect(item.bleedFillMode).toBe(stickerBleedFillMode.MIRROR);
  });

  it("preserves the saved bleed fill mode", () => {
    const item = createItemFromMetadata(
      makeSource(),
      makeItem({
        bleedFillMode: stickerBleedFillMode.CONTENT_AWARE_FAST,
      }),
    );

    expect(item.bleedFillMode).toBe(stickerBleedFillMode.CONTENT_AWARE_FAST);
  });

  it("applies file dimensions from source when no existing item", () => {
    const item = createItemFromMetadata(
      makeSource({ widthMm: 100, heightMm: 60 }),
    );
    expect(item.widthMm).toBe(100);
    expect(item.heightMm).toBe(60);
    expect(item.sourceWidthMm).toBe(100);
    expect(item.sourceHeightMm).toBe(60);
    expect(item.sizeSource).toBe("file");
  });

  it("applies file dimensions even when existing item already has a fallback value", () => {
    const existing = makeItem({
      widthMm: 50,
      heightMm: 50,
      sizeSource: "fallback",
    });
    const item = createItemFromMetadata(
      makeSource({ widthMm: 210, heightMm: 297 }),
      existing,
    );
    expect(item.widthMm).toBe(210);
    expect(item.heightMm).toBe(297);
    expect(item.sizeSource).toBe("file");
  });

  it("updates dimensions when source changes and existing sizeSource is 'file'", () => {
    const existing = makeItem({
      widthMm: 100,
      heightMm: 60,
      sizeSource: "file",
    });
    const item = createItemFromMetadata(
      makeSource({ widthMm: 148, heightMm: 210 }),
      existing,
    );
    expect(item.widthMm).toBe(148);
    expect(item.heightMm).toBe(210);
    expect(item.sizeSource).toBe("file");
  });

  it("preserves user-edited dimensions when source has real file dimensions", () => {
    const existing = makeItem({
      widthMm: 80,
      heightMm: 40,
      sizeSource: "user",
    });
    const item = createItemFromMetadata(
      makeSource({ widthMm: 210, heightMm: 297 }),
      existing,
    );
    expect(item.widthMm).toBe(80);
    expect(item.heightMm).toBe(40);
    expect(item.sizeSource).toBe("user");
  });

  it("preserves user-edited dimensions when source has no dimensions", () => {
    const existing = makeItem({
      widthMm: 80,
      heightMm: 40,
      sizeSource: "user",
    });
    const item = createItemFromMetadata(makeSource(), existing);
    expect(item.widthMm).toBe(80);
    expect(item.heightMm).toBe(40);
    expect(item.sizeSource).toBe("user");
  });

  it("preserves the aspect-ratio lock preference", () => {
    const item = createItemFromMetadata(
      makeSource({ widthMm: 210, heightMm: 297 }),
      makeItem({ preserveAspectRatio: false }),
    );
    expect(item.preserveAspectRatio).toBe(false);
  });

  it("uses source.filename for single-page files", () => {
    const item = createItemFromMetadata(
      makeSource({ filename: "sticker.pdf", pageCount: 1 }),
    );
    expect(item.filename).toBe("sticker.pdf");
  });

  it("appends page number for multi-page files", () => {
    const item = createItemFromMetadata(
      makeSource({ filename: "sticker.pdf", pageCount: 3, pageNumber: 2 }),
    );
    expect(item.filename).toBe("sticker.pdf / 2");
  });
});

describe("mergeMetadataIntoItems", () => {
  it("adds new items from sources when no existing items", () => {
    const sources = [makeSource({ widthMm: 100, heightMm: 50 })];
    const result = mergeMetadataIntoItems({ existingItems: [], sources });
    expect(result).toHaveLength(1);
    expect(result[0].widthMm).toBe(100);
    expect(result[0].sizeSource).toBe("file");
  });

  it("updates fallback items with real file dimensions when they arrive", () => {
    const fallbackItems = mergeMetadataIntoItems({
      existingItems: [],
      sources: [makeSource()],
    });
    expect(fallbackItems[0].sizeSource).toBe("fallback");

    const updated = mergeMetadataIntoItems({
      existingItems: fallbackItems,
      sources: [makeSource({ widthMm: 210, heightMm: 297 })],
    });
    expect(updated[0].widthMm).toBe(210);
    expect(updated[0].heightMm).toBe(297);
    expect(updated[0].sizeSource).toBe("file");
  });

  it("preserves user-edited items during real-metadata pass", () => {
    const userItems = [
      makeItem({ widthMm: 80, heightMm: 40, sizeSource: "user" }),
    ];
    const updated = mergeMetadataIntoItems({
      existingItems: userItems,
      sources: [makeSource({ widthMm: 210, heightMm: 297 })],
    });
    expect(updated[0].widthMm).toBe(80);
    expect(updated[0].heightMm).toBe(40);
    expect(updated[0].sizeSource).toBe("user");
  });

  it("preserves non-size fields across merges", () => {
    const existing = [
      makeItem({
        bleedMm: 2,
        quantity: 5,
        cutOffsetMm: 3,
        preserveAspectRatio: false,
      }),
    ];
    const updated = mergeMetadataIntoItems({
      existingItems: existing,
      sources: [makeSource({ widthMm: 100, heightMm: 60 })],
    });
    expect(updated[0].bleedMm).toBe(2);
    expect(updated[0].quantity).toBe(5);
    expect(updated[0].cutOffsetMm).toBe(3);
    expect(updated[0].preserveAspectRatio).toBe(false);
  });
});

describe("resolveLinkedStickerSizeChange", () => {
  it("updates the paired dimension when the lock is enabled", () => {
    const patch = resolveLinkedStickerSizeChange(
      makeItem({ widthMm: 100, heightMm: 50 }),
      "widthMm",
      80,
    );
    expect(patch.widthMm).toBe(80);
    expect(patch.heightMm).toBe(40);
    expect(patch.sizeSource).toBe("user");
  });

  it("updates only the edited dimension when the lock is disabled", () => {
    const patch = resolveLinkedStickerSizeChange(
      makeItem({
        heightMm: 50,
        preserveAspectRatio: false,
        widthMm: 100,
      }),
      "heightMm",
      80,
    );
    expect(patch.heightMm).toBe(80);
    expect(patch.widthMm).toBeUndefined();
    expect(patch.sizeSource).toBe("user");
  });
});

describe("buildFallbackMetadata", () => {
  it("creates null-dimension sources for all files", () => {
    const files = [new File(["a"], "a.pdf", { type: "application/pdf" })];
    const result = buildFallbackMetadata(files);
    expect(result).toHaveLength(1);
    expect(result[0].widthMm).toBeNull();
    expect(result[0].heightMm).toBeNull();
    expect(result[0].filename).toBe("a.pdf");
  });
});

describe("readStickerMetadataInBrowser", () => {
  it("allows browser inspection for files above the server direct-upload threshold", () => {
    const files = [
      {
        name: "five-megabyte-label.pdf",
        size: 5 * 1024 * 1024,
        type: "application/pdf",
      },
    ] as unknown as File[];

    expect(shouldReadStickerMetadataInBrowser(files)).toBe(true);
  });

  it("skips browser inspection above browser metadata limits", () => {
    const oversizedFile = [
      {
        name: "oversized-label.pdf",
        size: STICKER_BROWSER_METADATA_MAX_FILE_SIZE_BYTES + 1,
        type: "application/pdf",
      },
    ] as unknown as File[];
    const oversizedBatch = [
      {
        name: "labels-a.pdf",
        size: STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_BYTES / 2 + 1,
        type: "application/pdf",
      },
      {
        name: "labels-b.pdf",
        size: STICKER_BROWSER_METADATA_MAX_TOTAL_SIZE_BYTES / 2,
        type: "application/pdf",
      },
    ] as unknown as File[];

    expect(shouldReadStickerMetadataInBrowser(oversizedFile)).toBe(false);
    expect(shouldReadStickerMetadataInBrowser(oversizedBatch)).toBe(false);
  });

  it("uses fallback metadata for files too large for browser inspection", async () => {
    const files = [
      {
        name: "large-labels.pdf",
        size: 51 * 1024 * 1024,
        type: "application/pdf",
      },
    ] as unknown as File[];

    const result = await readStickerMetadataInBrowser(files);

    expect(result.artworkPreviews).toBeUndefined();
    expect(result.sources).toEqual([
      expect.objectContaining({
        filename: "large-labels.pdf",
        heightMm: null,
        pageCount: 1,
        widthMm: null,
      }),
    ]);
  });
});
