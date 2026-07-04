import { describe, expect, it } from "vitest";
import {
  createActiveImpositionJob,
  createFailedImpositionJob,
  createStoredImpositionJob,
  MAX_STORED_IMPOSITION_JOBS,
  normalizeStoredImpositionJobs,
  sortImpositionJobsByCreatedAt,
} from "./local-jobs";
import { buildImpositionArchiveDownloadUrl } from "./types";
import { IMPOSITION_WARNING_CODES } from "./warnings";

describe("createActiveImpositionJob", () => {
  it("creates an uploading job with a local id and normalized defaults", () => {
    const job = createActiveImpositionJob({
      createdAt: 123,
      filename: " batch.pdf ",
      id: "job-1",
      totalFiles: 3,
    });

    expect(job).toEqual({
      createdAt: 123,
      filename: "batch.pdf",
      id: "job-1",
      progressPercent: 0,
      status: "uploading",
      totalFiles: 3,
      warnings: [],
    });
  });
});

describe("createFailedImpositionJob", () => {
  it("preserves job metadata when marking a job as failed", () => {
    const job = createFailedImpositionJob(
      {
        createdAt: 123,
        currentFileIndex: 2,
        currentFileName: "page-2.pdf",
        filename: "batch.pdf",
        id: "job-1",
        progressPercent: 64,
        totalFiles: 3,
        warnings: [],
      },
      "Something broke",
    );

    expect(job).toEqual({
      createdAt: 123,
      currentFileIndex: 2,
      currentFileName: "page-2.pdf",
      errorMessage: "Something broke",
      filename: "batch.pdf",
      id: "job-1",
      progressPercent: 64,
      status: "failed",
      totalFiles: 3,
      warnings: [],
    });
  });
});

describe("createStoredImpositionJob", () => {
  it("uses the storage path as the persisted job id", () => {
    const job = createStoredImpositionJob(
      {
        contentType: "application/gzip",
        downloadUrl: "https://example.com/imposition-output.tar.gz",
        filename: "imposition-output.tar.gz",
        storagePath: "imposition/results/accounts/admin-1/file.tar.gz",
        warnings: [],
      },
      123,
    );

    const storagePath = "imposition/results/accounts/admin-1/file.tar.gz";

    expect(job).toEqual({
      id: "imposition/results/accounts/admin-1/file.tar.gz",
      contentType: "application/gzip",
      createdAt: 123,
      downloadUrl: buildImpositionArchiveDownloadUrl(storagePath),
      filename: "imposition-output.tar.gz",
      progressPercent: 100,
      storagePath: "imposition/results/accounts/admin-1/file.tar.gz",
      status: "completed",
      totalFiles: 1,
      warnings: [],
    });
  });

  it("supports preserving a local job id and total file count on completion", () => {
    const job = createStoredImpositionJob(
      {
        contentType: "application/gzip",
        downloadUrl: "https://example.com/imposition-output.tar.gz",
        filename: "imposition-output.tar.gz",
        storagePath: "imposition/results/accounts/admin-1/file.tar.gz",
        warnings: [],
      },
      {
        createdAt: 123,
        id: "job-1",
        totalFiles: 4,
      },
    );

    expect(job.id).toBe("job-1");
    expect(job.totalFiles).toBe(4);
  });
});

describe("normalizeStoredImpositionJobs", () => {
  it("migrates legacy completed jobs from local storage", () => {
    const jobs = normalizeStoredImpositionJobs([
      {
        id: "legacy-job",
        contentType: "application/gzip",
        createdAt: 100,
        downloadUrl: "https://example.com/legacy.tar.gz",
        filename: "legacy.tar.gz",
        storagePath: "imposition/results/accounts/admin-1/legacy.tar.gz",
        warnings: [],
      },
    ]);

    const storagePath = "imposition/results/accounts/admin-1/legacy.tar.gz";

    expect(jobs).toEqual([
      {
        id: "legacy-job",
        contentType: "application/gzip",
        createdAt: 100,
        downloadUrl: buildImpositionArchiveDownloadUrl(storagePath),
        filename: "legacy.tar.gz",
        progressPercent: 100,
        storagePath: "imposition/results/accounts/admin-1/legacy.tar.gz",
        status: "completed",
        totalFiles: 1,
        warnings: [],
      },
    ]);
  });

  it("rewrites legacy generated archive URLs to the authenticated download route", () => {
    const storagePath =
      "imposition/uploads/generated/2026-05-10/archive.tar.gz";
    const jobs = normalizeStoredImpositionJobs([
      {
        id: "legacy-generated-job",
        contentType: "application/gzip",
        createdAt: 100,
        downloadUrl:
          "https://firebasestorage.googleapis.com/v0/b/bucket/o/archive?alt=media&token=token",
        filename: "archive.tar.gz",
        progressPercent: 100,
        storagePath,
        status: "completed",
        totalFiles: 1,
        warnings: [],
      },
    ]);

    expect(jobs[0]?.downloadUrl).toBe(
      buildImpositionArchiveDownloadUrl(storagePath),
    );
  });

  it("filters invalid jobs, deduplicates by storage path, and sorts newest first", () => {
    const jobs = normalizeStoredImpositionJobs([
      {
        id: "first",
        contentType: "application/gzip",
        createdAt: 100,
        downloadUrl: "https://example.com/first.tar.gz",
        filename: "first.tar.gz",
        progressPercent: 100,
        storagePath: "imposition/results/accounts/admin-1/first.tar.gz",
        status: "completed",
        totalFiles: 1,
        warnings: [],
      },
      {
        id: "duplicate-newer",
        contentType: "application/gzip",
        createdAt: 200,
        downloadUrl: "https://example.com/first-newer.tar.gz",
        filename: "first-newer.tar.gz",
        progressPercent: 100,
        storagePath: "imposition/results/accounts/admin-1/first.tar.gz",
        status: "completed",
        totalFiles: 1,
        warnings: [],
      },
      {
        id: "second",
        contentType: "application/gzip",
        createdAt: 150,
        downloadUrl: "https://example.com/second.tar.gz",
        filename: "second.tar.gz",
        progressPercent: 100,
        storagePath: "imposition/results/accounts/admin-1/second.tar.gz",
        status: "completed",
        totalFiles: 1,
        warnings: [
          {
            code: IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_FAILED,
            values: { reason: "fallback" },
          },
        ],
      },
      {
        storagePath: "missing-required-fields",
      },
    ]);

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.storagePath)).toEqual([
      "imposition/results/accounts/admin-1/second.tar.gz",
      "imposition/results/accounts/admin-1/first.tar.gz",
    ]);
    expect(jobs[1]?.downloadUrl).toBe(
      buildImpositionArchiveDownloadUrl(
        "imposition/results/accounts/admin-1/first.tar.gz",
      ),
    );
  });

  it("limits the stored job list to the most recent items", () => {
    const jobs = normalizeStoredImpositionJobs(
      Array.from({ length: MAX_STORED_IMPOSITION_JOBS + 5 }, (_, index) => ({
        id: `job-${index}`,
        contentType: "application/gzip",
        createdAt: index,
        downloadUrl: `https://example.com/job-${index}.tar.gz`,
        filename: `job-${index}.tar.gz`,
        progressPercent: 100,
        storagePath: `imposition/results/accounts/admin-1/job-${index}.tar.gz`,
        status: "completed",
        totalFiles: 1,
        warnings: [],
      })),
    );

    expect(jobs).toHaveLength(MAX_STORED_IMPOSITION_JOBS);
    expect(jobs[0]?.createdAt).toBe(MAX_STORED_IMPOSITION_JOBS + 4);
    expect(jobs.at(-1)?.createdAt).toBe(5);
  });
});

describe("sortImpositionJobsByCreatedAt", () => {
  it("sorts active and completed jobs newest first", () => {
    const jobs = sortImpositionJobsByCreatedAt([
      createStoredImpositionJob(
        {
          contentType: "application/gzip",
          downloadUrl: "https://example.com/imposition-output.tar.gz",
          filename: "imposition-output.tar.gz",
          storagePath: "imposition/results/accounts/admin-1/file.tar.gz",
          warnings: [],
        },
        100,
      ),
      createActiveImpositionJob({
        createdAt: 200,
        filename: "batch.pdf",
        id: "active-job",
        totalFiles: 2,
      }),
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "active-job",
      "imposition/results/accounts/admin-1/file.tar.gz",
    ]);
  });
});
