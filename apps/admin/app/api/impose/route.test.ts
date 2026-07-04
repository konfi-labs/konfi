import {
  bleedType,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
} from "@konfi/types";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPOSITION_WARNING_CODES } from "@/lib/imposition/warnings";

vi.mock("server-only", () => ({}));

const {
  mockGetAuthenticatedAdminUid,
  mockRequireAdminAuth,
  mockDeleteImpositionUploadSources,
  mockReadImpositionUploadsFromStorage,
  mockUploadImpositionArchive,
  mockPrepareImpositionInputForAiBleed,
  mockImposeFilesToArchive,
} = vi.hoisted(() => ({
  mockGetAuthenticatedAdminUid: vi.fn(),
  mockRequireAdminAuth: vi.fn(),
  mockDeleteImpositionUploadSources: vi.fn(),
  mockReadImpositionUploadsFromStorage: vi.fn(),
  mockUploadImpositionArchive: vi.fn(),
  mockPrepareImpositionInputForAiBleed: vi.fn(),
  mockImposeFilesToArchive: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  getAuthenticatedAdminUid: mockGetAuthenticatedAdminUid,
  requireAdminAuth: mockRequireAdminAuth,
}));

vi.mock("@/lib/imposition/storage.server", () => ({
  deleteImpositionUploadSources: mockDeleteImpositionUploadSources,
  readImpositionUploadsFromStorage: mockReadImpositionUploadsFromStorage,
  uploadImpositionArchive: mockUploadImpositionArchive,
}));

vi.mock("@/lib/imposition/ai-bleed", () => ({
  prepareImpositionInputForAiBleed: mockPrepareImpositionInputForAiBleed,
}));

vi.mock("@konfi/wasm", () => ({
  imposeFilesToArchive: mockImposeFilesToArchive,
}));

let POST: (typeof import("./route"))["POST"];

describe("/api/impose POST", () => {
  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteImpositionUploadSources.mockResolvedValue(undefined);
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockGetAuthenticatedAdminUid.mockResolvedValue("admin-1");
    mockUploadImpositionArchive.mockImplementation(async ({ archive }) => ({
      contentType: archive.contentType,
      downloadUrl: "https://example.com/imposition-output.tar.gz",
      filename: archive.filename,
      storagePath:
        "imposition/results/accounts/admin-1/imposition-output.tar.gz",
      warnings: archive.warnings,
    }));
  });

  it("merges AI bleed and archive warnings for storage-backed requests", async () => {
    const uploads = [
      {
        contentType: "application/pdf",
        filename: "sheet.pdf",
        size: 4,
        storagePath: "imposition/uploads/2026-03-10/sheet.pdf",
      },
    ];
    const aiWarning = {
      code: IMPOSITION_WARNING_CODES.AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE,
      values: {
        filename: "sheet.pdf",
      },
    } as const;

    mockReadImpositionUploadsFromStorage.mockResolvedValue([
      {
        bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
        contentType: "application/pdf",
        filename: "sheet.pdf",
      },
    ]);
    mockPrepareImpositionInputForAiBleed.mockResolvedValue({
      payload: {
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      },
      files: [
        {
          bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
          contentType: "application/pdf",
          filename: "sheet.pdf",
        },
      ],
      warnings: [aiWarning],
    });
    mockImposeFilesToArchive.mockResolvedValue({
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: "application/gzip",
      filename: "sheet-abc123.tar.gz",
      files: [
        {
          bytes: Uint8Array.from([1, 2, 3]),
          filename: "i_sheet.pdf",
        },
      ],
      warnings: ["WASM warning"],
    });

    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        },
        uploads,
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      warnings: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.warnings).toEqual([aiWarning, "WASM warning"]);
    expect(mockUploadImpositionArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "admin-1",
        archive: expect.objectContaining({
          warnings: [aiWarning, "WASM warning"],
        }),
      }),
    );
    expect(mockDeleteImpositionUploadSources).toHaveBeenCalledWith(
      uploads,
      "admin-1",
    );
    expect(mockReadImpositionUploadsFromStorage).toHaveBeenCalledWith(
      uploads,
      "admin-1",
    );
  });

  it("encodes merged warnings in the multipart download response header", async () => {
    const aiWarning = {
      code: IMPOSITION_WARNING_CODES.AI_BLEED_MISSING_ITEM_DIMENSIONS,
    } as const;

    mockPrepareImpositionInputForAiBleed.mockResolvedValue({
      payload: {
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      },
      files: [
        {
          bytes: Uint8Array.from([1, 2, 3]),
          contentType: "image/png",
          filename: "card.png",
        },
      ],
      warnings: [aiWarning],
    });
    mockImposeFilesToArchive.mockResolvedValue({
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: "application/gzip",
      filename: "card-abc123.tar.gz",
      files: [
        {
          bytes: Uint8Array.from([1, 2, 3]),
          filename: "i_card.pdf",
        },
      ],
      warnings: ["WASM warning"],
    });

    const formData = new FormData();
    formData.set(
      "data",
      JSON.stringify({
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        customItemSizeWidth: 100,
        customItemSizeHeight: 50,
      }),
    );
    formData.set(
      "upload_file_0",
      new File([Uint8Array.from([1, 2, 3])], "card.png", {
        type: "image/png",
      }),
    );

    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const encodedWarnings = response.headers.get("x-imposition-warnings");

    expect(response.status).toBe(200);
    expect(mockRequireAdminAuth).toHaveBeenCalledTimes(1);
    expect(encodedWarnings).toBeTruthy();
    expect(JSON.parse(decodeURIComponent(encodedWarnings ?? ""))).toEqual([
      aiWarning,
      "WASM warning",
    ]);
  });

  it("rejects oversized storage-backed batches before loading files from storage", async () => {
    const uploadSizes = [
      ...Array.from({
        length: Math.floor(
          IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES / IMPOSITION_MAX_FILE_SIZE_BYTES,
        ),
      }).map(() => IMPOSITION_MAX_FILE_SIZE_BYTES),
      (IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES % IMPOSITION_MAX_FILE_SIZE_BYTES) +
        1,
    ];

    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        },
        uploads: uploadSizes.map((size, index) => ({
          contentType: "application/pdf",
          filename: `sheet-${index + 1}.pdf`,
          size,
          storagePath: `imposition/uploads/2026-03-10/sheet-${index + 1}.pdf`,
        })),
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain(
      `${IMPOSITION_MAX_TOTAL_FILE_SIZE_MB} MB total upload limit`,
    );
    expect(mockReadImpositionUploadsFromStorage).not.toHaveBeenCalled();
    expect(mockDeleteImpositionUploadSources).not.toHaveBeenCalled();
  });

  it("rejects invalid imposition payload types for storage-backed requests", async () => {
    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          bleed: "3",
          bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        },
        uploads: [
          {
            contentType: "application/pdf",
            filename: "sheet.pdf",
            size: 4,
            storagePath: "imposition/uploads/2026-03-10/sheet.pdf",
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain("data.bleed");
    expect(mockReadImpositionUploadsFromStorage).not.toHaveBeenCalled();
    expect(mockPrepareImpositionInputForAiBleed).not.toHaveBeenCalled();
  });

  it("returns a single PDF directly in the multipart download response when archive is a single file", async () => {
    const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);

    mockPrepareImpositionInputForAiBleed.mockResolvedValue({
      payload: {
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      },
      files: [
        {
          bytes: pdfBytes,
          contentType: "application/pdf",
          filename: "card.pdf",
        },
      ],
      warnings: [],
    });
    mockImposeFilesToArchive.mockResolvedValue({
      bytes: pdfBytes,
      contentType: "application/pdf",
      filename: "i_sheet.pdf",
      files: [{ bytes: pdfBytes, filename: "i_sheet.pdf" }],
      warnings: [],
    });

    const formData = new FormData();
    formData.set(
      "data",
      JSON.stringify({
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      }),
    );
    formData.set(
      "upload_file_0",
      new File([pdfBytes], "sheet.pdf", { type: "application/pdf" }),
    );

    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("i_sheet.pdf");
  });

  it("passes contentType and filename through to the uploaded result for a single-PDF storage-backed request", async () => {
    const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
    const uploads = [
      {
        contentType: "application/pdf",
        filename: "sheet.pdf",
        size: 4,
        storagePath: "imposition/uploads/accounts/admin-1/2026-03-10/sheet.pdf",
      },
    ];

    mockReadImpositionUploadsFromStorage.mockResolvedValue([
      {
        bytes: pdfBytes,
        contentType: "application/pdf",
        filename: "sheet.pdf",
      },
    ]);
    mockPrepareImpositionInputForAiBleed.mockResolvedValue({
      payload: {
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      },
      files: [
        {
          bytes: pdfBytes,
          contentType: "application/pdf",
          filename: "sheet.pdf",
        },
      ],
      warnings: [],
    });
    mockImposeFilesToArchive.mockResolvedValue({
      bytes: pdfBytes,
      contentType: "application/pdf",
      filename: "i_sheet.pdf",
      files: [{ bytes: pdfBytes, filename: "i_sheet.pdf" }],
      warnings: [],
    });

    const request = new Request("http://localhost/api/impose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        },
        uploads,
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      contentType: string;
      filename: string;
    };

    expect(response.status).toBe(200);
    expect(mockUploadImpositionArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "admin-1",
        archive: expect.objectContaining({
          contentType: "application/pdf",
          filename: "i_sheet.pdf",
        }),
      }),
    );
    expect(payload.contentType).toBe("application/pdf");
    expect(payload.filename).toBe("i_sheet.pdf");
  });

  it("strips unknown form payload fields before sending data to the imposition pipeline", async () => {
    mockPrepareImpositionInputForAiBleed.mockResolvedValue({
      payload: {
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        customItemSizeHeight: 50,
        customItemSizeWidth: 100,
      },
      files: [
        {
          bytes: Uint8Array.from([1, 2, 3]),
          contentType: "image/png",
          filename: "card.png",
        },
      ],
      warnings: [],
    });
    mockImposeFilesToArchive.mockResolvedValue({
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: "application/gzip",
      filename: "card-abc123.tar.gz",
      files: [
        {
          bytes: Uint8Array.from([1, 2, 3]),
          filename: "i_card.pdf",
        },
      ],
      warnings: [],
    });

    const formData = new FormData();
    formData.set(
      "data",
      JSON.stringify({
        bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
        customItemSizeWidth: 100,
        customItemSizeHeight: 50,
        saveAsTemplate: true,
        templateName: "Spring cards",
      }),
    );
    formData.set(
      "upload_file_0",
      new File([Uint8Array.from([1, 2, 3])], "card.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/impose", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockPrepareImpositionInputForAiBleed).toHaveBeenCalledTimes(1);

    const [params] = mockPrepareImpositionInputForAiBleed.mock.calls[0] as [
      {
        payload: Record<string, unknown>;
      },
    ];
    const { payload } = params;

    expect(payload).toEqual({
      bleedType: bleedType.DIFFERENTIAL_DIFFUSION,
      customItemSizeHeight: 50,
      customItemSizeWidth: 100,
    });
    expect(payload).not.toHaveProperty("saveAsTemplate");
    expect(payload).not.toHaveProperty("templateName");
  });
});
