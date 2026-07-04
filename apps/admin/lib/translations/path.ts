export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getPathValue(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, source);
}

export function setPathValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const segments = path.split(".");
  let current: Record<string, unknown> | unknown[] = target;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const nextSegment = segments[index + 1];
    const nextIsArray = nextSegment !== undefined && /^\d+$/.test(nextSegment);

    if (Array.isArray(current)) {
      const arrayIndex = Number(segment);
      if (isLast) {
        current[arrayIndex] = value;
        return;
      }

      const existing = current[arrayIndex];
      if (!isRecord(existing) && !Array.isArray(existing)) {
        current[arrayIndex] = nextIsArray ? [] : {};
      }
      current = current[arrayIndex] as Record<string, unknown> | unknown[];
      return;
    }

    if (isLast) {
      current[segment] = value;
      return;
    }

    const existing = current[segment];
    if (!isRecord(existing) && !Array.isArray(existing)) {
      current[segment] = nextIsArray ? [] : {};
    }
    current = current[segment] as Record<string, unknown> | unknown[];
  });
}

export function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isBlankTranslationValue(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}
