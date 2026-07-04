import { getPathValue, isBlankTranslationValue, setPathValue } from "./path";
import { normalizeManagedTranslation } from "./registry";
import type {
  ManagedTranslationDescriptor,
  ManagedTranslationDocument,
  ManagedTranslationField,
  ManagedTranslationMeta,
} from "./types";

export interface TranslationSourceItem {
  key: string;
  text: string;
  label?: string;
}

export interface GeneratedTranslationItem {
  key: string;
  translatedText: string;
}

export function getTranslatableSourceItems(params: {
  descriptor: ManagedTranslationDescriptor;
  source: Record<string, unknown>;
  translation?: ManagedTranslationDocument | null;
  overwrite?: boolean;
}): TranslationSourceItem[] {
  const normalizedTranslation = params.translation
    ? normalizeManagedTranslation(params.descriptor, params.translation)
    : null;

  return params.descriptor.fields.reduce<TranslationSourceItem[]>(
    (items, field) => {
      if (field.translatable === false) {
        return items;
      }

      const sourceValue = getPathValue(params.source, field.sourcePath);

      if (typeof sourceValue !== "string" || sourceValue.trim().length === 0) {
        return items;
      }

      const existingValue = normalizedTranslation
        ? getPathValue(normalizedTranslation, field.targetPath)
        : undefined;

      if (!params.overwrite && !isBlankTranslationValue(existingValue)) {
        return items;
      }

      items.push({
        key: field.key,
        label: field.label,
        text: sourceValue,
      });
      return items;
    },
    [],
  );
}

export function applyGeneratedTranslations(params: {
  descriptor: ManagedTranslationDescriptor;
  source?: Record<string, unknown>;
  translation?: ManagedTranslationDocument | null;
  generatedItems: GeneratedTranslationItem[];
  locale: string;
  meta: ManagedTranslationMeta;
  overwrite?: boolean;
}): ManagedTranslationDocument {
  const target = params.translation
    ? normalizeManagedTranslation(params.descriptor, params.translation)
    : {};
  const output: ManagedTranslationDocument = {};
  const fieldsByKey = new Map<string, ManagedTranslationField>(
    params.descriptor.fields.map((field) => [field.key, field]),
  );

  params.descriptor.fields.forEach((field) => {
    const existingValue = getPathValue(target, field.targetPath);
    if (existingValue !== undefined) {
      setPathValue(output, field.targetPath, existingValue);
      return;
    }

    if (field.translatable === false && params.source) {
      const sourceValue = getPathValue(params.source, field.sourcePath);
      if (sourceValue !== undefined) {
        setPathValue(output, field.targetPath, sourceValue);
      }
    }
  });

  params.generatedItems.forEach((item) => {
    const field = fieldsByKey.get(item.key);
    if (!field) {
      return;
    }

    const existingValue = getPathValue(output, field.targetPath);
    if (!params.overwrite && !isBlankTranslationValue(existingValue)) {
      return;
    }

    setPathValue(output, field.targetPath, item.translatedText);
  });

  output.locale = params.locale as ManagedTranslationDocument["locale"];
  output.active = true;
  output.translationMeta = params.meta;

  return output;
}
