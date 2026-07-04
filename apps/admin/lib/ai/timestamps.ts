type TimestampLike = {
  toDate: () => Date;
};

export function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}

function formatDate(value: Date) {
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function formatTimestampLike(value: unknown) {
  if (!value) {
    return null;
  }

  if (isTimestampLike(value)) {
    return formatDate(value.toDate());
  }

  if (value instanceof Date) {
    return formatDate(value);
  }

  return null;
}
