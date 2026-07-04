import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockCreateStickerPreviewAssets,
  mockInferStickerContentType,
  mockReadStickerSourceMetadata,
  mockRequireAdminAuth,
} = vi.hoisted(() => ({
  mockCreateStickerPreviewAssets: vi.fn(),
  mockInferStickerContentType: vi.fn(),
  mockReadStickerSourceMetadata: vi.fn(),
  mockRequireAdminAuth: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/sticker-imposition/assets.server", () => ({
  createStickerPreviewAssets: mockCreateStickerPreviewAssets,
  inferStickerContentType: mockInferStickerContentType,
  readStickerSourceMetadata: mockReadStickerSourceMetadata,
}));

let POST: (typeof import("./route"))["POST"];

function createFormRequest() {
  const formData = new FormData();
  formData.append(
    "upload_file_0",
    new File([new Uint8Array([1, 2, 3])], "label.pdf", {
      type: "application/pdf",
    }),
  );

  return new Request("http://localhost/api/impose/stickers/metadata", {
    body: formData,
    method: "POST",
  });
}

describe("/api/impose/stickers/metadata POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockInferStickerContentType.mockReturnValue("application/pdf");
    mockReadStickerSourceMetadata.mockResolvedValue([
      {
        contentType: "application/pdf",
        filename: "label.pdf",
        heightMm: 50,
        id: "0:1",
        pageCount: 1,
        pageNumber: 1,
        sourceFileIndex: 0,
        widthMm: 80,
      },
    ]);
    mockCreateStickerPreviewAssets.mockResolvedValue([
      {
        dataUrl: "data:image/png;base64,AA==",
        itemId: "0:1",
      },
    ]);
  });

  it("returns sticker metadata together with preview artwork data", async () => {
    const response = await POST(createFormRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      artworkPreviews: {
        "0:1": "data:image/png;base64,AA==",
      },
      sources: [
        {
          contentType: "application/pdf",
          filename: "label.pdf",
          heightMm: 50,
          id: "0:1",
          pageCount: 1,
          pageNumber: 1,
          sourceFileIndex: 0,
          widthMm: 80,
        },
      ],
      supportedContentTypes: ["application/pdf"],
    });
    expect(mockCreateStickerPreviewAssets).toHaveBeenCalledWith({
      files: [
        expect.objectContaining({
          name: "label.pdf",
          type: "application/pdf",
        }),
      ],
      sources: [
        expect.objectContaining({
          id: "0:1",
        }),
      ],
    });
  });
});
