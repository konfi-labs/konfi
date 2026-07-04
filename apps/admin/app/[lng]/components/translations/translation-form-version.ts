function hasToMillis(value: object): value is { toMillis: () => number } {
  return "toMillis" in value && typeof value.toMillis === "function";
}

export function getTranslationFormVersion(translation: unknown) {
  if (!translation) {
    return undefined;
  }

  try {
    return JSON.stringify(translation, (_key, value: unknown) => {
      if (typeof value === "function") {
        return undefined;
      }

      if (value && typeof value === "object" && hasToMillis(value)) {
        return value.toMillis();
      }

      return value;
    });
  } catch {
    if (translation && typeof translation === "object" && "id" in translation) {
      return String(translation.id);
    }

    return "translation";
  }
}
