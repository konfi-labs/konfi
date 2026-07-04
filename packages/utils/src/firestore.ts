function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
 * Canonical sanitizer for Firestore write payloads that may contain optional
 * fields. Use this before writes that may run through the web Firestore SDK on
 * the server because those server-side clients cannot rely on app-level
 * ignoreUndefinedProperties initialization.
 */
export function removeUndefined<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    // Firestore rejects explicit undefined array entries. Preserve array indexes
    // by storing null instead of filtering elements out.
    return value.map((item) =>
      item === undefined ? null : removeUndefined(item),
    ) as T;
  }

  if (isPlainObject(value)) {
    const cleaned: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        cleaned[key] = removeUndefined(item);
      }
    }

    return cleaned as T;
  }

  return value;
}
