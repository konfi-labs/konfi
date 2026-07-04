import type { PriceExtractionDeliveryTimeFormat } from "@konfi/types";

const HOUR_DELIVERY_TIME_PATTERN =
  /\d+\s*h\b|hour|hours|hr|hrs|godz|godzin|godziny/i;
const DAY_DELIVERY_TIME_PATTERN = /day|days|dni|dzien|dzień|robocz/i;
const DATE_LIKE_DELIVERY_TIME_PATTERN =
  /\d{4}[-/]\d{2}[-/]\d{2}|\d{2}:\d{2}|t\d{2}:\d{2}/i;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeDeliveryTimeDays(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.max(1, Math.ceil(value));
}

function resolveDateBasedDeliveryTime(
  value: Date | number | string,
  now: Date,
): number | undefined {
  const targetMs =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);

  if (!Number.isFinite(targetMs)) {
    return undefined;
  }

  return normalizeDeliveryTimeDays((targetMs - now.getTime()) / ONE_DAY_IN_MS);
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeExternalDeliveryTime(
  value: unknown,
): number | undefined {
  if (typeof value === "number") {
    return normalizeDeliveryTimeDays(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(",", ".");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  const interpretedDays =
    HOUR_DELIVERY_TIME_PATTERN.test(normalized) &&
    !DAY_DELIVERY_TIME_PATTERN.test(normalized)
      ? parsed / 24
      : parsed;

  if (!Number.isFinite(interpretedDays) || interpretedDays <= 0) {
    return undefined;
  }

  return normalizeDeliveryTimeDays(interpretedDays);
}

export function resolveExternalDeliveryTime(
  value: unknown,
  options?: {
    format?: PriceExtractionDeliveryTimeFormat;
    now?: Date;
  },
): number | undefined {
  const format = options?.format;
  const now = options?.now ?? new Date();

  if (format === "date-string") {
    return typeof value === "string"
      ? resolveDateBasedDeliveryTime(value, now)
      : undefined;
  }

  if (format === "unix-seconds") {
    const parsed = parseNumericValue(value);
    return parsed !== undefined
      ? resolveDateBasedDeliveryTime(parsed * 1000, now)
      : undefined;
  }

  if (format === "unix-milliseconds") {
    const parsed = parseNumericValue(value);
    return parsed !== undefined ? resolveDateBasedDeliveryTime(parsed, now) : undefined;
  }

  if (format === "hours") {
    const parsed = parseNumericValue(value);
    return parsed !== undefined ? normalizeDeliveryTimeDays(parsed / 24) : undefined;
  }

  if (
    typeof value === "string" &&
    DATE_LIKE_DELIVERY_TIME_PATTERN.test(value.trim())
  ) {
    const resolvedDateDeliveryTime = resolveDateBasedDeliveryTime(value, now);

    if (resolvedDateDeliveryTime !== undefined) {
      return resolvedDateDeliveryTime;
    }
  }

  return normalizeExternalDeliveryTime(value);
}
