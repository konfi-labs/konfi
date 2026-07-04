import { getPathValue } from "./path";
import type { ManagedTranslationField } from "./types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function hashText(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashManagedTranslationSource(
  source: Record<string, unknown>,
  fields: ManagedTranslationField[],
): string {
  const sourceValues = fields.reduce<Record<string, unknown>>(
    (result, field) => {
      result[field.key] = getPathValue(source, field.sourcePath);
      return result;
    },
    {},
  );

  return hashText(stableStringify(sourceValues));
}
