import { Locale } from "@konfi/types";
import {
  applyGeneratedTranslations,
  getTranslatableSourceItems,
  type GeneratedTranslationItem,
  type TranslationSourceItem,
} from "./merge";
import { createManagedTranslationDescriptor } from "./registry";
import {
  MANAGED_TRANSLATION_SOURCE_LOCALE,
  type ManagedTranslationDocument,
  type ManagedTranslationKind,
  type ManagedTranslationMeta,
} from "./types";

export interface BuildGeneratedManagedTranslationDocumentParams {
  kind: ManagedTranslationKind;
  source: Record<string, unknown>;
  translation: ManagedTranslationDocument | null;
  locale: Locale;
  mode: "missing" | "stale";
  generatedAt: ManagedTranslationMeta["generatedAt"];
  generatedBy: string;
  generatedProvider: string;
  generatedModel: string;
  generateText: (
    items: TranslationSourceItem[],
  ) => Promise<GeneratedTranslationItem[]>;
}

export interface BuildGeneratedManagedTranslationDocumentResult {
  document: ManagedTranslationDocument;
  generatedFieldCount: number;
  sourceHash: string;
}

export interface TryBuildGeneratedManagedTranslationDocumentResult {
  ok: boolean;
  document?: ManagedTranslationDocument;
  generatedFieldCount?: number;
  sourceHash?: string;
  error?: string;
}

export async function buildGeneratedManagedTranslationDocument({
  kind,
  source,
  translation,
  locale,
  mode,
  generatedAt,
  generatedBy,
  generatedProvider,
  generatedModel,
  generateText,
}: BuildGeneratedManagedTranslationDocumentParams): Promise<BuildGeneratedManagedTranslationDocumentResult> {
  const descriptor = createManagedTranslationDescriptor(kind, source);
  const overwrite = mode === "stale";
  const items = getTranslatableSourceItems({
    descriptor,
    source,
    translation,
    overwrite,
  });

  if (items.length === 0) {
    return {
      document: translation ?? {
        active: true,
        locale,
      },
      generatedFieldCount: 0,
      sourceHash: descriptor.sourceHash,
    };
  }

  const generatedItems = await generateText(items);
  const metaSourceHash =
    overwrite || !translation?.translationMeta?.sourceHash
      ? descriptor.sourceHash
      : translation.translationMeta.sourceHash;
  const meta: ManagedTranslationMeta = {
    sourceLocale: MANAGED_TRANSLATION_SOURCE_LOCALE,
    sourceHash: metaSourceHash,
    status: "ai_generated",
    generatedAt,
    generatedBy,
    generatedProvider,
    generatedModel,
  };

  return {
    document: applyGeneratedTranslations({
      descriptor,
      generatedItems,
      locale,
      meta,
      overwrite,
      source,
      translation,
    }),
    generatedFieldCount: generatedItems.length,
    sourceHash: descriptor.sourceHash,
  };
}

export async function tryBuildGeneratedManagedTranslationDocument(
  params: BuildGeneratedManagedTranslationDocumentParams,
): Promise<TryBuildGeneratedManagedTranslationDocumentResult> {
  try {
    return {
      ok: true,
      ...(await buildGeneratedManagedTranslationDocument(params)),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
