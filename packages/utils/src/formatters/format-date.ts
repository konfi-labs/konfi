type TimestampObject = {
  nanoseconds?: unknown;
  seconds?: unknown;
  toDate?: unknown;
  toMillis?: unknown;
  _nanoseconds?: unknown;
  _seconds?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function dateFromTimestamp(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : undefined;
  }

  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return isValidDate(date) ? date : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const timestamp = value as TimestampObject;

  if (typeof timestamp.toDate === "function") {
    const date = timestamp.toDate();
    return date instanceof Date && isValidDate(date) ? date : undefined;
  }

  if (typeof timestamp.toMillis === "function") {
    const millis = timestamp.toMillis();
    if (typeof millis === "number" && Number.isFinite(millis)) {
      const date = new Date(millis);
      return isValidDate(date) ? date : undefined;
    }
  }

  const seconds =
    numberFromUnknown(timestamp.seconds) ??
    numberFromUnknown(timestamp._seconds);
  const nanoseconds =
    numberFromUnknown(timestamp.nanoseconds) ??
    numberFromUnknown(timestamp._nanoseconds) ??
    0;

  if (seconds !== undefined) {
    const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
    return isValidDate(date) ? date : undefined;
  }

  return undefined;
}

/**
 * Formats various timestamp formats into a localized date string.
 */
export function formatDate(
  timestamp: unknown,
  locale: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  },
): string {
  try {
    const date = dateFromTimestamp(timestamp);

    if (!date) {
      return "";
    }

    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch (error) {
    console.warn("Error formatting date:", error);
    return "";
  }
}
