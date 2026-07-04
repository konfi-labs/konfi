import type { UIMessage } from "ai";

type TimestampLike = {
  toDate: () => Date;
  seconds?: number;
  nanoseconds?: number;
  toMillis?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    isRecord(value) &&
    typeof value.toDate === "function" &&
    ("seconds" in value ||
      "nanoseconds" in value ||
      typeof value.toMillis === "function")
  );
}

function sanitizeChatValueInternal(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isTimestampLike(value)) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeChatValueInternal(item));
  }

  if (isRecord(value)) {
    const sanitizedEntries: Array<[string, unknown]> = [];

    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) {
        continue;
      }

      sanitizedEntries.push([key, sanitizeChatValueInternal(nestedValue)]);
    }

    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
}

export function sanitizeChatValue<T>(value: T): T {
  return sanitizeChatValueInternal(value) as T;
}

export function sanitizeUIMessageParts(
  parts: UIMessage["parts"],
): UIMessage["parts"] {
  return sanitizeChatValue(parts);
}

export function sanitizeUIMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: sanitizeUIMessageParts(message.parts),
  }));
}
