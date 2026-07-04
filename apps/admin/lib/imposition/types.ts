import { isImpositionWarning, type ImpositionWarning } from "./warnings";
import {
  backPageRotation,
  bindingEdge,
  bleedType,
  duplexMode,
  layoutType,
  sourceSizing,
} from "@konfi/types";
import type { ImposePreviewRequest } from "@konfi/wasm";
import { z } from "zod";

export const DEFAULT_IMPOSITION_ARCHIVE_FILENAME = "imposition-output.tar.gz";
export const IMPOSITION_UPLOAD_PREFIX = "imposition/uploads";
export const IMPOSITION_RESULT_PREFIX = "imposition/results";
export const LEGACY_GENERATED_IMPOSITION_ARCHIVE_PREFIX = `${IMPOSITION_UPLOAD_PREFIX}/generated`;
export const IMPOSITION_ARCHIVE_DOWNLOAD_API_PATH = "/api/impose/archive";
export const IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE = "text/event-stream";

export type ImpositionPayload = NonNullable<ImposePreviewRequest["data"]>;

export type ImpositionInputFile = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
};

export type ImpositionUploadReference = {
  storagePath: string;
  filename: string;
  contentType: string;
  size: number;
};

export type CreateImpositionRequest = {
  data: ImpositionPayload;
  uploads: ImpositionUploadReference[];
};

export type CreateImpositionResponse = {
  contentType: string;
  downloadUrl: string;
  filename: string;
  storagePath: string;
  warnings: ImpositionWarning[];
};

export function buildImpositionArchiveDownloadUrl(storagePath: string): string {
  return `${IMPOSITION_ARCHIVE_DOWNLOAD_API_PATH}?path=${encodeURIComponent(storagePath)}`;
}

function createOptionalNullableBooleanSchema(): z.ZodType<
  boolean | null | undefined
> {
  return z.boolean().nullable().optional();
}

function createOptionalNullableFiniteNumberSchema(): z.ZodType<
  number | null | undefined
> {
  return z.number().finite().nullable().optional();
}

function createOptionalNullableStringSchema(): z.ZodType<
  string | null | undefined
> {
  return z.string().nullable().optional();
}

export const impositionPayloadSchema = z
  .object({
    automaticItemOrientation: createOptionalNullableBooleanSchema(),
    automaticNumberOfHorizontalItems: createOptionalNullableBooleanSchema(),
    automaticNumberOfVerticalItems: createOptionalNullableBooleanSchema(),
    automaticSheetOrientation: createOptionalNullableBooleanSchema(),
    automaticSpacingHorizontal: createOptionalNullableBooleanSchema(),
    automaticSpacingVertical: createOptionalNullableBooleanSchema(),
    backPageRotation: z.enum(backPageRotation).nullable().optional(),
    bindingEdge: z.enum(bindingEdge).nullable().optional(),
    bleed: createOptionalNullableFiniteNumberSchema(),
    bleedType: z.enum(bleedType).nullable().optional(),
    cropMarks: createOptionalNullableBooleanSchema(),
    customItemSizeHeight: createOptionalNullableFiniteNumberSchema(),
    customItemSizeWidth: createOptionalNullableFiniteNumberSchema(),
    customSheetSizeHeight: createOptionalNullableFiniteNumberSchema(),
    customSheetSizeWidth: createOptionalNullableFiniteNumberSchema(),
    duplexMode: z.enum(duplexMode).nullable().optional(),
    frontBackAlignment: createOptionalNullableBooleanSchema(),
    layout: z.enum(layoutType).nullable().optional(),
    mirrorBack: createOptionalNullableBooleanSchema(),
    numItemsHorizontal: createOptionalNullableFiniteNumberSchema(),
    numItemsVertical: createOptionalNullableFiniteNumberSchema(),
    pagesPerSignature: createOptionalNullableFiniteNumberSchema(),
    sourceSizing: z.enum(sourceSizing).nullable().optional(),
    spacingHorizontal: createOptionalNullableStringSchema(),
    spacingVertical: createOptionalNullableStringSchema(),
  })
  .strip()
  .superRefine((payload, context) => {
    if (payload.layout !== layoutType.BOOKLET) {
      return;
    }

    if (payload.pagesPerSignature == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pagesPerSignature"],
        message: "Booklet layouts require pagesPerSignature.",
      });
      return;
    }

    if (
      !Number.isInteger(payload.pagesPerSignature) ||
      payload.pagesPerSignature <= 0 ||
      payload.pagesPerSignature % 4 !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pagesPerSignature"],
        message: "pagesPerSignature must be a positive multiple of 4.",
      });
    }
  });

export const impositionUploadReferenceSchema = z
  .object({
    contentType: z.string().trim().min(1),
    filename: z.string().trim().min(1),
    size: z.number().finite().positive(),
    storagePath: z.string().trim().min(1),
  })
  .strip();

export const createImpositionRequestSchema = z
  .object({
    data: impositionPayloadSchema,
    uploads: z.array(impositionUploadReferenceSchema).min(1),
  })
  .strip();

function formatValidationPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) {
    return "request body";
  }

  return path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }

      if (typeof segment === "symbol") {
        const description = segment.description ?? segment.toString();
        return index === 0 ? description : `.${description}`;
      }

      return index === 0 ? segment : `.${segment}`;
    })
    .join("");
}

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${formatValidationPath(issue.path)}: ${issue.message}`)
    .join("; ");
}

function createInvalidImpositionPayloadError(reason: string): Error {
  return new Error(`Invalid impose request payload: ${reason}`);
}

export function parseImpositionPayload(value: unknown): ImpositionPayload {
  const result = impositionPayloadSchema.safeParse(value);

  if (!result.success) {
    throw createInvalidImpositionPayloadError(
      `invalid imposition data (${formatValidationIssues(result.error)})`,
    );
  }

  return result.data as ImpositionPayload;
}

export function parseCreateImpositionRequest(
  value: unknown,
): CreateImpositionRequest {
  const result = createImpositionRequestSchema.safeParse(value);

  if (!result.success) {
    throw createInvalidImpositionPayloadError(
      formatValidationIssues(result.error),
    );
  }

  return {
    data: result.data.data as ImpositionPayload,
    uploads: result.data.uploads,
  };
}

export const IMPOSITION_ACTIVE_JOB_STATUSES = [
  "uploading",
  "preparing",
  "processing",
  "finalizing",
] as const;

export type ImpositionActiveJobStatus =
  (typeof IMPOSITION_ACTIVE_JOB_STATUSES)[number];

export type ImpositionJobStatus =
  | ImpositionActiveJobStatus
  | "completed"
  | "failed";

export type ImpositionProgressStreamEvent =
  | {
      type: "progress";
      status: ImpositionActiveJobStatus;
      progressPercent: number | null;
      totalFiles: number;
      completedFiles: number;
      currentFileIndex?: number;
      currentFileName?: string;
    }
  | {
      type: "result";
      result: CreateImpositionResponse;
    }
  | {
      type: "error";
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return typeof value === "undefined" || isNonEmptyString(value);
}

function isOptionalPositiveInteger(
  value: unknown,
): value is number | undefined {
  return typeof value === "undefined" || isNonNegativeInteger(value);
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

export function isCreateImpositionResponse(
  value: unknown,
): value is CreateImpositionResponse {
  return (
    isRecord(value) &&
    isNonEmptyString(value.contentType) &&
    isNonEmptyString(value.downloadUrl) &&
    isNonEmptyString(value.filename) &&
    isNonEmptyString(value.storagePath) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => isImpositionWarning(warning))
  );
}

export function isImpositionActiveJobStatus(
  value: unknown,
): value is ImpositionActiveJobStatus {
  return (
    typeof value === "string" &&
    IMPOSITION_ACTIVE_JOB_STATUSES.includes(value as ImpositionActiveJobStatus)
  );
}

export function isImpositionProgressStreamEvent(
  value: unknown,
): value is ImpositionProgressStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "result") {
    return isCreateImpositionResponse(value.result);
  }

  if (value.type === "error") {
    return isNonEmptyString(value.error);
  }

  if (value.type !== "progress") {
    return false;
  }

  return (
    isImpositionActiveJobStatus(value.status) &&
    isProgressPercent(value.progressPercent) &&
    isNonNegativeInteger(value.totalFiles) &&
    isNonNegativeInteger(value.completedFiles) &&
    value.completedFiles <= value.totalFiles &&
    isOptionalPositiveInteger(value.currentFileIndex) &&
    (typeof value.currentFileIndex === "undefined" ||
      (value.currentFileIndex >= 1 &&
        value.currentFileIndex <= value.totalFiles)) &&
    isOptionalNonEmptyString(value.currentFileName)
  );
}
