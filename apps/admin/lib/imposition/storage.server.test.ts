import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildImpositionArchiveDownloadUrl,
  type CreateImpositionResponse,
} from "./types";
import {
  deleteImpositionUploadSources,
  downloadImpositionArchiveFromStorage,
  readImpositionUploadsFromStorage,
  uploadImpositionArchive,
} from "./storage.server";

vi.mock("server-only", () => ({}));

const storageMocks = vi.hoisted(() => {
  const download = vi.fn();
  const deleteFile = vi.fn();
  const file = vi.fn();
  const getMetadata = vi.fn();
  const save = vi.fn();
  const randomUUID = vi.fn();

  return {
    bucket: {
      file,
    },
    deleteFile,
    download,
    file,
    getMetadata,
    randomUUID,
    save,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(() => ({})),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => storageMocks.bucket),
  })),
}));

vi.mock("node:crypto", () => ({
  randomUUID: storageMocks.randomUUID,
}));

describe("imposition archive storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "konfi-test.appspot.com";
    storageMocks.randomUUID.mockReturnValue("archive-id");
    storageMocks.file.mockReturnValue({
      delete: storageMocks.deleteFile,
      download: storageMocks.download,
      getMetadata: storageMocks.getMetadata,
      name: "archive.tar.gz",
      save: storageMocks.save,
    });
    storageMocks.deleteFile.mockResolvedValue(undefined);
    storageMocks.save.mockResolvedValue(undefined);
    storageMocks.getMetadata.mockResolvedValue([
      {
        contentDisposition: 'attachment; filename="archive.tar.gz"',
        contentType: "application/gzip",
        metadata: {
          originalFilename: "archive.tar.gz",
        },
        size: "3",
      },
    ]);
    storageMocks.download.mockResolvedValue([Buffer.from([1, 2, 3])]);
  });

  it("stores server-generated archives without Firebase bearer download tokens", async () => {
    const result: CreateImpositionResponse = await uploadImpositionArchive({
      accountId: "admin-1",
      archive: {
        bytes: Uint8Array.from([1, 2, 3]),
        contentType: "application/gzip",
        filename: "archive.tar.gz",
        warnings: [],
      },
    });

    expect(result.storagePath).toMatch(
      /^imposition\/results\/accounts\/admin-1\/\d{4}-\d{2}-\d{2}\/archive-id-archive\.tar\.gz$/,
    );
    expect(result.downloadUrl).toBe(
      buildImpositionArchiveDownloadUrl(result.storagePath),
    );
    expect(result.downloadUrl).not.toContain("firebasestorage.googleapis.com");
    expect(result.downloadUrl).not.toContain("token=");

    const saveOptions = storageMocks.save.mock.calls[0]?.[1] as
      | {
          metadata?: {
            metadata?: Record<string, unknown>;
          };
        }
      | undefined;

    expect(saveOptions?.metadata?.metadata).toEqual({
      accountId: "admin-1",
      originalFilename: "archive.tar.gz",
    });
    expect(saveOptions?.metadata?.metadata).not.toHaveProperty(
      "firebaseStorageDownloadTokens",
    );
  });

  it("stores single-PDF archives with application/pdf contentType and .pdf filename in metadata", async () => {
    const result: CreateImpositionResponse = await uploadImpositionArchive({
      accountId: "admin-1",
      archive: {
        bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
        contentType: "application/pdf",
        filename: "i_sheet.pdf",
        warnings: [],
      },
    });

    expect(result.storagePath).toMatch(
      /^imposition\/results\/accounts\/admin-1\/\d{4}-\d{2}-\d{2}\/archive-id-i_sheet\.pdf$/,
    );
    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("i_sheet.pdf");
    expect(result.downloadUrl).toBe(
      buildImpositionArchiveDownloadUrl(result.storagePath),
    );

    const saveOptions = storageMocks.save.mock.calls[0]?.[1] as
      | {
          contentType?: string;
          metadata?: {
            contentDisposition?: string;
            metadata?: Record<string, unknown>;
          };
        }
      | undefined;

    expect(saveOptions?.contentType).toBe("application/pdf");
    expect(saveOptions?.metadata?.contentDisposition).toContain("i_sheet.pdf");
    expect(saveOptions?.metadata?.metadata).toEqual({
      accountId: "admin-1",
      originalFilename: "i_sheet.pdf",
    });
  });

  it("downloads archives from the authenticated admin result prefix", async () => {
    const archive = await downloadImpositionArchiveFromStorage({
      accountId: "admin-1",
      storagePath:
        "imposition/results/accounts/admin-1/2026-05-10/archive.tar.gz",
    });

    expect(Array.from(archive.bytes)).toEqual([1, 2, 3]);
    expect(archive.contentType).toBe("application/gzip");
    expect(archive.contentLength).toBe("3");
  });

  it("downloads legacy generated archives only with matching ownership metadata", async () => {
    storageMocks.getMetadata.mockResolvedValueOnce([
      {
        contentDisposition: 'attachment; filename="archive.tar.gz"',
        contentType: "application/gzip",
        metadata: {
          accountId: "admin-1",
          originalFilename: "archive.tar.gz",
        },
        size: "3",
      },
    ]);

    const archive = await downloadImpositionArchiveFromStorage({
      accountId: "admin-1",
      storagePath: "imposition/uploads/generated/2026-05-10/archive.tar.gz",
    });

    expect(Array.from(archive.bytes)).toEqual([1, 2, 3]);
    expect(storageMocks.file).toHaveBeenCalledWith(
      "imposition/uploads/generated/2026-05-10/archive.tar.gz",
    );
  });

  it("rejects legacy generated archives without matching ownership metadata", async () => {
    await expect(
      downloadImpositionArchiveFromStorage({
        accountId: "admin-1",
        storagePath: "imposition/uploads/generated/2026-05-10/archive.tar.gz",
      }),
    ).rejects.toThrow(
      "Imposition archive does not belong to the current admin.",
    );

    expect(storageMocks.download).not.toHaveBeenCalled();
  });

  it("rejects archive downloads outside the authenticated admin result prefix", async () => {
    await expect(
      downloadImpositionArchiveFromStorage({
        accountId: "admin-1",
        storagePath:
          "imposition/results/accounts/admin-2/2026-05-10/archive.tar.gz",
      }),
    ).rejects.toThrow("Invalid imposition archive path.");

    expect(storageMocks.file).not.toHaveBeenCalled();
  });

  it("reads account-scoped uploaded sources for the authenticated admin", async () => {
    const uploads = [
      {
        contentType: "application/pdf",
        filename: "sheet.pdf",
        size: 3,
        storagePath: "imposition/uploads/accounts/admin-1/2026-05-10/sheet.pdf",
      },
    ];

    const files = await readImpositionUploadsFromStorage(uploads, "admin-1");

    expect(files).toEqual([
      {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "application/gzip",
        filename: "sheet.pdf",
      },
    ]);
    expect(storageMocks.file).toHaveBeenCalledWith(
      "imposition/uploads/accounts/admin-1/2026-05-10/sheet.pdf",
    );
  });

  it("rejects uploaded sources from another account path", async () => {
    await expect(
      readImpositionUploadsFromStorage(
        [
          {
            contentType: "application/pdf",
            filename: "sheet.pdf",
            size: 3,
            storagePath:
              "imposition/uploads/accounts/admin-2/2026-05-10/sheet.pdf",
          },
        ],
        "admin-1",
      ),
    ).rejects.toThrow(
      "Imposition upload does not belong to the current admin.",
    );

    expect(storageMocks.file).not.toHaveBeenCalled();
  });

  it("rejects legacy uploaded sources without matching ownership metadata", async () => {
    await expect(
      readImpositionUploadsFromStorage(
        [
          {
            contentType: "application/pdf",
            filename: "sheet.pdf",
            size: 3,
            storagePath: "imposition/uploads/2026-05-10/sheet.pdf",
          },
        ],
        "admin-1",
      ),
    ).rejects.toThrow(
      "Imposition upload does not belong to the current admin.",
    );

    expect(storageMocks.download).not.toHaveBeenCalled();
  });

  it("deletes only uploaded sources owned by the authenticated admin", async () => {
    await deleteImpositionUploadSources(
      [
        {
          contentType: "application/pdf",
          filename: "sheet.pdf",
          size: 3,
          storagePath:
            "imposition/uploads/accounts/admin-1/2026-05-10/sheet.pdf",
        },
      ],
      "admin-1",
    );

    expect(storageMocks.deleteFile).toHaveBeenCalledTimes(1);

    await deleteImpositionUploadSources(
      [
        {
          contentType: "application/pdf",
          filename: "sheet.pdf",
          size: 3,
          storagePath:
            "imposition/uploads/accounts/admin-2/2026-05-10/sheet.pdf",
        },
      ],
      "admin-1",
    );

    expect(storageMocks.deleteFile).toHaveBeenCalledTimes(1);
  });
});
