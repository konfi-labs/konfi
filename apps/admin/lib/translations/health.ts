import { getPathValue, isBlankTranslationValue } from "./path";
import { normalizeManagedTranslation } from "./registry";
import type {
  ManagedTranslationDescriptor,
  ManagedTranslationDocument,
  ManagedTranslationDisplayStatus,
  ManagedTranslationHealth,
} from "./types";

function isFieldRequired(
  source: Record<string, unknown>,
  descriptor: ManagedTranslationDescriptor,
  fieldKey: string,
): boolean {
  const field = descriptor.fields.find(
    (candidate) => candidate.key === fieldKey,
  );
  if (!field || field.required === false) {
    return false;
  }

  const sourceValue = getPathValue(source, field.sourcePath);
  return !isBlankTranslationValue(sourceValue);
}

export function getManagedTranslationHealth(params: {
  source: Record<string, unknown>;
  descriptor: ManagedTranslationDescriptor;
  translation?: ManagedTranslationDocument | null;
}): ManagedTranslationHealth {
  const { descriptor, source, translation } = params;

  if (!translation) {
    return {
      status: "missing",
      issues: ["missing"],
      missingFieldKeys: descriptor.fields
        .filter((field) => isFieldRequired(source, descriptor, field.key))
        .map((field) => field.key),
      staleFieldCount: descriptor.fields.length,
      sourceHash: descriptor.sourceHash,
    };
  }

  const normalizedTranslation = normalizeManagedTranslation(
    descriptor,
    translation,
  );
  const missingFieldKeys = descriptor.fields
    .filter((field) => {
      if (!isFieldRequired(source, descriptor, field.key)) {
        return false;
      }

      return isBlankTranslationValue(
        getPathValue(normalizedTranslation, field.targetPath),
      );
    })
    .map((field) => field.key);
  const isStale =
    !!normalizedTranslation.translationMeta?.sourceHash &&
    normalizedTranslation.translationMeta.sourceHash !== descriptor.sourceHash;
  const isAiDraft =
    normalizedTranslation.translationMeta?.status === "ai_generated";
  const issues: ManagedTranslationHealth["issues"] = [];

  if (missingFieldKeys.length > 0) {
    issues.push("incomplete");
  }

  if (isStale) {
    issues.push("stale");
  }

  if (isAiDraft) {
    issues.push("aiDraft");
  }

  if (issues.includes("incomplete")) {
    return {
      status: "incomplete",
      issues,
      missingFieldKeys,
      staleFieldCount: isStale ? descriptor.fields.length : 0,
      sourceHash: descriptor.sourceHash,
    };
  }

  if (issues.includes("stale")) {
    return {
      status: "stale",
      issues,
      missingFieldKeys,
      staleFieldCount: descriptor.fields.length,
      sourceHash: descriptor.sourceHash,
    };
  }

  if (issues.includes("aiDraft")) {
    return {
      status: "aiDraft",
      issues,
      missingFieldKeys,
      staleFieldCount: 0,
      sourceHash: descriptor.sourceHash,
    };
  }

  return {
    status:
      normalizedTranslation.translationMeta?.status === "reviewed"
        ? "reviewed"
        : "complete",
    issues,
    missingFieldKeys,
    staleFieldCount: 0,
    sourceHash: descriptor.sourceHash,
  };
}

export function getManagedTranslationAggregateStatus(
  statuses: ManagedTranslationDisplayStatus[],
): ManagedTranslationDisplayStatus {
  if (statuses.includes("missing")) return "missing";
  if (statuses.includes("incomplete")) return "incomplete";
  if (statuses.includes("stale")) return "stale";
  if (statuses.includes("aiDraft")) return "aiDraft";
  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "reviewed")
  ) {
    return "reviewed";
  }

  return "complete";
}
