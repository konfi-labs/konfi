type FirestoreTimestampLike = {
  toDate: () => Date;
};

function isFirestoreTimestampLike(value: unknown): value is FirestoreTimestampLike {
  const candidate = value as { toDate?: unknown };

  return (
    typeof value === "object" &&
    value !== null &&
    typeof candidate.toDate === "function"
  );
}

function isSecondsTimestampLike(
  value: unknown,
): value is { seconds: number; nanoseconds?: number } {
  const candidate = value as { seconds?: unknown };

  return (
    typeof value === "object" &&
    value !== null &&
    typeof candidate.seconds === "number"
  );
}

export function serializeFirestoreTimestamp(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (isFirestoreTimestampLike(value)) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (isSecondsTimestampLike(value)) {
    const milliseconds =
      value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1000000);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  return undefined;
}
