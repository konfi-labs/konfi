import { createManagedTranslationDescriptor } from "./registry";
import {
  MANAGED_TRANSLATION_SOURCE_LOCALE,
  type ManagedTranslationKind,
  type ManagedTranslationMeta,
} from "./types";

export function createManualTranslationMeta(params: {
  kind: ManagedTranslationKind;
  source: unknown;
}): ManagedTranslationMeta {
  return {
    sourceLocale: MANAGED_TRANSLATION_SOURCE_LOCALE,
    sourceHash: createManagedTranslationDescriptor(params.kind, params.source)
      .sourceHash,
    status: "manual",
  };
}
