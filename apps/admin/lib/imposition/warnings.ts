import type { TFunction } from "i18next";

export const IMPOSITION_WARNING_CODES = {
  AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE:
    "impose.warnings.aiBleedUnsupportedBatchFileType",
  AI_BLEED_MISSING_ITEM_DIMENSIONS:
    "impose.warnings.aiBleedMissingItemDimensions",
  AI_BLEED_REDUCED_WORKING_RESOLUTION:
    "impose.warnings.aiBleedReducedWorkingResolution",
  AI_BLEED_FALLBACK_VERTEX_CONFIG_INCOMPLETE:
    "impose.warnings.aiBleedFallbackVertexConfigIncomplete",
  AI_BLEED_FALLBACK_FAILED: "impose.warnings.aiBleedFallbackFailed",
  CONTENT_AWARE_BLEED_FALLBACK_MIRROR:
    "impose.warnings.contentAwareBleedFallbackMirror",
  SOURCE_PDF_BOX_MISMATCH: "impose.warnings.sourcePdfBoxMismatch",
} as const;

export type ImpositionWarningCode =
  (typeof IMPOSITION_WARNING_CODES)[keyof typeof IMPOSITION_WARNING_CODES];

type ImpositionWarningValue = string | number | boolean;

export type StructuredImpositionWarning = {
  code: ImpositionWarningCode;
  values?: Record<string, ImpositionWarningValue>;
};

export type ImpositionWarning = string | StructuredImpositionWarning;

const IMPOSE_WARNING_DEFAULT_VALUES: Record<ImpositionWarningCode, string> = {
  [IMPOSITION_WARNING_CODES.AI_BLEED_UNSUPPORTED_BATCH_FILE_TYPE]:
    "AI bleed currently supports only image uploads for the whole batch. {{filename}} could not be processed, so the existing differential-diffusion fallback was used instead.",
  [IMPOSITION_WARNING_CODES.AI_BLEED_MISSING_ITEM_DIMENSIONS]:
    "AI bleed requires valid item dimensions in the imposition request. The existing differential-diffusion fallback was used instead.",
  [IMPOSITION_WARNING_CODES.AI_BLEED_REDUCED_WORKING_RESOLUTION]:
    "AI bleed for {{filename}} used a reduced working resolution to fit the model input limits; the original artwork was still preserved in the center.",
  [IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_VERTEX_CONFIG_INCOMPLETE]:
    "AI bleed is unavailable because the server Vertex AI configuration is incomplete. The existing differential-diffusion fallback was used instead.",
  [IMPOSITION_WARNING_CODES.AI_BLEED_FALLBACK_FAILED]:
    "AI bleed could not preprocess this imposition batch. {{reason}} The existing differential-diffusion fallback was used instead.",
  [IMPOSITION_WARNING_CODES.CONTENT_AWARE_BLEED_FALLBACK_MIRROR]:
    "Fast content-aware bleed could not process {{filename}}. Mirror bleed was used instead.",
  [IMPOSITION_WARNING_CODES.SOURCE_PDF_BOX_MISMATCH]:
    "{{filename}} declares page boxes that don't match its artwork (often from Canva exports), which can shift or clip the result. Konfi re-centered the artwork automatically, but please double-check this file's output.",
};

const IMPOSE_WARNING_CODE_VALUES = Object.values(
  IMPOSITION_WARNING_CODES,
) as ImpositionWarningCode[];

const IMPOSE_WARNING_CODE_SET = new Set<string>(IMPOSE_WARNING_CODE_VALUES);

function isImpositionWarningCode(
  value: unknown,
): value is ImpositionWarningCode {
  return typeof value === "string" && IMPOSE_WARNING_CODE_SET.has(value);
}

function isImpositionWarningValue(
  value: unknown,
): value is ImpositionWarningValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function isStructuredImpositionWarning(
  value: unknown,
): value is StructuredImpositionWarning {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { code, values } = value as {
    code?: unknown;
    values?: unknown;
  };

  if (!isImpositionWarningCode(code)) {
    return false;
  }

  if (typeof values === "undefined") {
    return true;
  }

  if (typeof values !== "object" || values === null) {
    return false;
  }

  return Object.values(values as Record<string, unknown>).every(
    isImpositionWarningValue,
  );
}

export function isImpositionWarning(
  value: unknown,
): value is ImpositionWarning {
  return typeof value === "string" || isStructuredImpositionWarning(value);
}

export function formatImpositionWarning(
  warning: ImpositionWarning,
  t: TFunction,
): string {
  if (typeof warning === "string") {
    return warning;
  }

  return t(warning.code, {
    defaultValue: IMPOSE_WARNING_DEFAULT_VALUES[warning.code],
    ...(warning.values ?? {}),
  });
}
