export type ChangeSnapshotValue =
  | string
  | number
  | boolean
  | null
  | ChangeSnapshotValue[]
  | { [key: string]: ChangeSnapshotValue };

export type ChangeSnapshot = Record<string, ChangeSnapshotValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChangeSnapshot(
  value: ChangeSnapshotValue | undefined,
): value is ChangeSnapshot {
  return isRecord(value);
}

function readMethod(value: object, key: string): (() => unknown) | null {
  const method = (value as Record<string, unknown>)[key];

  if (typeof method !== "function") {
    return null;
  }

  return () => Reflect.apply(method, value, []);
}

function normalizeTimestampLike(value: object): string | null {
  const toMillis = readMethod(value, "toMillis");
  if (toMillis) {
    const millis = toMillis();
    if (typeof millis === "number" && Number.isFinite(millis)) {
      return new Date(millis).toISOString();
    }
  }

  const toDate = readMethod(value, "toDate");
  if (toDate) {
    const date = toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function normalizeValue(
  value: unknown,
  seen: WeakSet<object>,
): ChangeSnapshotValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen) ?? null);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (seen.has(value)) {
    return undefined;
  }

  const timestamp = normalizeTimestampLike(value);
  if (timestamp) {
    return timestamp;
  }

  seen.add(value);

  const normalized: ChangeSnapshot = {};
  for (const [key, childValue] of Object.entries(value)) {
    const nextValue = normalizeValue(childValue, seen);
    if (nextValue !== undefined) {
      normalized[key] = nextValue;
    }
  }

  seen.delete(value);

  return normalized;
}

export function createChangeSnapshot(value: unknown): ChangeSnapshot | null {
  const normalized = normalizeValue(value, new WeakSet<object>());

  return isChangeSnapshot(normalized) ? normalized : null;
}
