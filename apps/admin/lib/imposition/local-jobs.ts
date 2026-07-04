import {
  IMPOSITION_RESULT_PREFIX,
  LEGACY_GENERATED_IMPOSITION_ARCHIVE_PREFIX,
  buildImpositionArchiveDownloadUrl,
  type CreateImpositionResponse,
  type ImpositionActiveJobStatus,
} from "./types";
import { isImpositionWarning, type ImpositionWarning } from "./warnings";

export const MAX_STORED_IMPOSITION_JOBS = 20;

type ImpositionJobBase = {
  id: string;
  createdAt: number;
  filename: string;
  progressPercent: number | null;
  totalFiles: number;
  currentFileIndex?: number;
  currentFileName?: string;
  warnings: ImpositionWarning[];
};

export type ActiveImpositionJob = ImpositionJobBase & {
  status: ImpositionActiveJobStatus;
};

export type FailedImpositionJob = ImpositionJobBase & {
  status: "failed";
  errorMessage: string;
};

export type StoredImpositionJob = ImpositionJobBase & {
  status: "completed";
  contentType: string;
  downloadUrl: string;
  storagePath: string;
  progressPercent: 100;
};

export type ImpositionJob =
  | ActiveImpositionJob
  | FailedImpositionJob
  | StoredImpositionJob;

type LegacyStoredImpositionJob = {
  id: string;
  contentType: string;
  createdAt: number;
  downloadUrl: string;
  filename: string;
  storagePath: string;
  warnings: ImpositionWarning[];
};

type CreateStoredImpositionJobOptions = {
  createdAt?: number;
  id?: string;
  totalFiles?: number;
};

type CreateActiveImpositionJobOptions = {
  createdAt?: number;
  filename: string;
  id?: string;
  progressPercent?: number | null;
  status?: ImpositionActiveJobStatus;
  totalFiles?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImpositionWarningList(value: unknown): value is ImpositionWarning[] {
  return (
    Array.isArray(value) &&
    value.every((warning) => isImpositionWarning(warning))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isProgressPercent(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100)
  );
}

function normalizeProgressPercent(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeTotalFiles(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

function resolveStoredDownloadUrl(
  storagePath: string,
  downloadUrl: string,
): string {
  if (
    storagePath.startsWith(`${IMPOSITION_RESULT_PREFIX}/accounts/`) ||
    storagePath.startsWith(`${LEGACY_GENERATED_IMPOSITION_ARCHIVE_PREFIX}/`)
  ) {
    return buildImpositionArchiveDownloadUrl(storagePath);
  }

  return downloadUrl.trim();
}

export function createImpositionJobId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createActiveImpositionJob(
  options: CreateActiveImpositionJobOptions,
): ActiveImpositionJob {
  return {
    id: options.id ?? createImpositionJobId(),
    createdAt: options.createdAt ?? Date.now(),
    filename: options.filename.trim() || "imposition",
    progressPercent: normalizeProgressPercent(options.progressPercent ?? 0),
    status: options.status ?? "uploading",
    totalFiles: normalizeTotalFiles(options.totalFiles),
    warnings: [],
  };
}

export function createFailedImpositionJob(
  job: Pick<
    ImpositionJobBase,
    "createdAt" | "filename" | "id" | "totalFiles" | "warnings"
  > & {
    currentFileIndex?: number;
    currentFileName?: string;
    progressPercent?: number | null;
  },
  errorMessage: string,
): FailedImpositionJob {
  return {
    id: job.id,
    createdAt: job.createdAt,
    errorMessage: errorMessage.trim() || "Imposition failed",
    filename: job.filename.trim(),
    progressPercent: normalizeProgressPercent(job.progressPercent),
    status: "failed",
    totalFiles: normalizeTotalFiles(job.totalFiles),
    currentFileIndex: job.currentFileIndex,
    currentFileName: job.currentFileName?.trim() || undefined,
    warnings: [...job.warnings],
  };
}

export function createStoredImpositionJob(
  response: CreateImpositionResponse,
  createdAtOrOptions: number | CreateStoredImpositionJobOptions = Date.now(),
): StoredImpositionJob {
  const options =
    typeof createdAtOrOptions === "number"
      ? { createdAt: createdAtOrOptions }
      : createdAtOrOptions;

  return {
    id: options.id ?? response.storagePath,
    contentType: response.contentType,
    createdAt: options.createdAt ?? Date.now(),
    downloadUrl: resolveStoredDownloadUrl(
      response.storagePath,
      response.downloadUrl,
    ),
    filename: response.filename,
    progressPercent: 100,
    storagePath: response.storagePath,
    status: "completed",
    totalFiles: normalizeTotalFiles(options.totalFiles),
    warnings: response.warnings,
  };
}

function isLegacyStoredImpositionJob(
  value: unknown,
): value is LegacyStoredImpositionJob {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.contentType) &&
    isNonNegativeFiniteNumber(value.createdAt) &&
    isNonEmptyString(value.downloadUrl) &&
    isNonEmptyString(value.filename) &&
    isNonEmptyString(value.storagePath) &&
    isImpositionWarningList(value.warnings)
  );
}

export function isStoredImpositionJob(
  value: unknown,
): value is StoredImpositionJob {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.status === "completed" &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.contentType) &&
    isNonNegativeFiniteNumber(value.createdAt) &&
    isNonEmptyString(value.downloadUrl) &&
    isNonEmptyString(value.filename) &&
    isProgressPercent(value.progressPercent) &&
    value.progressPercent === 100 &&
    isNonEmptyString(value.storagePath) &&
    isNonNegativeFiniteNumber(value.totalFiles) &&
    value.totalFiles >= 1 &&
    (typeof value.currentFileIndex === "undefined" ||
      isNonNegativeFiniteNumber(value.currentFileIndex)) &&
    (typeof value.currentFileName === "undefined" ||
      isNonEmptyString(value.currentFileName)) &&
    isImpositionWarningList(value.warnings)
  );
}

export function sortImpositionJobsByCreatedAt<T extends ImpositionJob>(
  jobs: readonly T[],
): T[] {
  return jobs.toSorted((left, right) => right.createdAt - left.createdAt);
}

export function normalizeStoredImpositionJobs(
  value: unknown,
): StoredImpositionJob[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenStoragePaths = new Set<string>();
  const jobs: StoredImpositionJob[] = [];

  for (const item of value) {
    const normalizedItem = isStoredImpositionJob(item)
      ? item
      : isLegacyStoredImpositionJob(item)
        ? createStoredImpositionJob(
            {
              contentType: item.contentType,
              downloadUrl: item.downloadUrl,
              filename: item.filename,
              storagePath: item.storagePath,
              warnings: item.warnings,
            },
            {
              createdAt: item.createdAt,
              id: item.id,
            },
          )
        : undefined;

    if (!normalizedItem) {
      continue;
    }

    const storagePath = normalizedItem.storagePath.trim();

    if (seenStoragePaths.has(storagePath)) {
      continue;
    }

    seenStoragePaths.add(storagePath);
    jobs.push({
      ...normalizedItem,
      id: normalizedItem.id.trim(),
      contentType: normalizedItem.contentType.trim(),
      currentFileIndex: normalizedItem.currentFileIndex,
      currentFileName: normalizedItem.currentFileName?.trim() || undefined,
      downloadUrl: resolveStoredDownloadUrl(
        storagePath,
        normalizedItem.downloadUrl,
      ),
      filename: normalizedItem.filename.trim(),
      progressPercent: 100,
      storagePath,
      totalFiles: normalizeTotalFiles(normalizedItem.totalFiles),
      warnings: [...item.warnings],
    });
  }

  return jobs
    .toSorted((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_STORED_IMPOSITION_JOBS);
}
