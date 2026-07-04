import type {
  InternalTransitSettings,
  TransferRoute,
  TransitDayOverride,
  TransitDeparture,
} from "@konfi/types";

export const INTERNAL_TRANSIT_SETTINGS_DOC_ID = "internalTransit";

export const DEFAULT_INTERNAL_TRANSIT_TIMEZONE = "Europe/Warsaw";

export const DEFAULT_TRANSIT_GRACE_MINUTES = 15;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const FORWARD_SEARCH_DAYS = 14;

const MS_PER_MINUTE = 60_000;

/**
 * Firestore doc id for a per route+date day-override doc, stored under
 * `channels/{channelId}/transitDayOverrides/{routeId}_{YYYY-MM-DD}`.
 */
export function transitDayOverrideDocId(routeId: string, date: string): string {
  return `${routeId}_${date}`;
}

export function isValidTransitTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function createDefaultInternalTransitSettings(): InternalTransitSettings {
  return {
    routes: [],
    timezone: DEFAULT_INTERNAL_TRANSIT_TIMEZONE,
  };
}

function normalizeDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);
}

function normalizeDeparture(
  value: Partial<TransitDeparture> | null | undefined,
  index: number,
): TransitDeparture | null {
  if (!value || !isValidTransitTime(value.time)) {
    return null;
  }

  return {
    id:
      typeof value.id === "string" && value.id.trim().length > 0
        ? value.id
        : `departure-${index}`,
    time: value.time,
    daysOfWeek: normalizeDaysOfWeek(value.daysOfWeek),
  };
}

function normalizeRoute(
  value: Partial<TransferRoute> | null | undefined,
  index: number,
): TransferRoute | null {
  if (!value || typeof value.toWarehouseId !== "string" || !value.toWarehouseId) {
    return null;
  }

  const departures = Array.isArray(value.departures)
    ? value.departures
        .map((departure, departureIndex) =>
          normalizeDeparture(departure, departureIndex),
        )
        .filter((departure): departure is TransitDeparture => departure !== null)
    : [];

  const transitMinutes = Number(value.transitMinutes);
  const graceMinutes = Number(value.graceMinutes);

  return {
    id:
      typeof value.id === "string" && value.id.trim().length > 0
        ? value.id
        : `route-${index}`,
    name: typeof value.name === "string" ? value.name : "",
    toWarehouseId: value.toWarehouseId,
    ...(Array.isArray(value.fromWarehouseIds)
      ? {
          fromWarehouseIds: value.fromWarehouseIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        }
      : {}),
    departures,
    transitMinutes:
      Number.isFinite(transitMinutes) && transitMinutes >= 0
        ? Math.round(transitMinutes)
        : 0,
    graceMinutes:
      Number.isFinite(graceMinutes) && graceMinutes >= 0
        ? Math.round(graceMinutes)
        : DEFAULT_TRANSIT_GRACE_MINUTES,
    ...(typeof value.arrivalStatusId === "string" && value.arrivalStatusId
      ? { arrivalStatusId: value.arrivalStatusId }
      : {}),
    enabled: value.enabled === true,
  };
}

export function normalizeInternalTransitSettings(
  settings?: Partial<InternalTransitSettings> | null,
): InternalTransitSettings {
  const routes = Array.isArray(settings?.routes)
    ? settings.routes
        .map((route, index) => normalizeRoute(route, index))
        .filter((route): route is TransferRoute => route !== null)
    : [];

  const timezone =
    typeof settings?.timezone === "string" && settings.timezone.trim().length > 0
      ? settings.timezone.trim()
      : DEFAULT_INTERNAL_TRANSIT_TIMEZONE;

  return {
    ...settings,
    routes,
    timezone,
  };
}

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getWallClockParts(date: Date, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    // Intl can emit "24" for midnight in hour23/hour12:false — normalize to 0.
    hour: lookup("hour") % 24,
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

/**
 * Offset (ms) of `timeZone` from UTC at the given instant, i.e.
 * wallClock - utc. Positive east of UTC.
 */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getWallClockParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

/**
 * Resolve a wall-clock time in `timeZone` (a calendar date + HH:mm) to the
 * absolute UTC instant. Accounts for DST by re-deriving the offset at the
 * candidate instant.
 */
function wallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(naiveUtc), timeZone);
  const candidate = new Date(naiveUtc - firstOffset);
  // Re-check the offset at the candidate instant to settle DST boundaries.
  const secondOffset = getTimeZoneOffsetMs(candidate, timeZone);

  if (secondOffset === firstOffset) {
    return candidate;
  }

  return new Date(naiveUtc - secondOffset);
}

function formatDateKey(year: number, month: number, day: number): string {
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseTimeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

interface CandidateDeparture {
  departureAt: Date;
  expectedArrivalAt: Date;
}

export interface TransitArrivalResult {
  departureAt: Date;
  expectedArrivalAt: Date;
}

/**
 * Pure ETA computation: given the dispatch instant, a transfer route, the
 * matching day-override docs, and the tenant timezone, returns the next
 * courier departure that catches the dispatch (within `graceMinutes` after a
 * departure still counts) and the expected arrival instant.
 *
 * Searches forward up to 14 calendar days in the timezone; returns `null` when
 * the route has no qualifying departure in that window.
 */
export function computeNextTransitArrival(
  dispatchedAt: Date,
  route: TransferRoute,
  overrides: TransitDayOverride[],
  timezone: string,
): TransitArrivalResult | null {
  const transitMs = route.transitMinutes * MS_PER_MINUTE;
  const graceMs = route.graceMinutes * MS_PER_MINUTE;
  const overridesByDate = new Map<string, TransitDayOverride>();

  for (const override of overrides) {
    if (override.routeId === route.id) {
      overridesByDate.set(override.date, override);
    }
  }

  const start = getWallClockParts(dispatchedAt, timezone);

  for (let offset = 0; offset < FORWARD_SEARCH_DAYS; offset += 1) {
    // Walk forward one calendar day at a time in the target timezone by
    // anchoring on noon (avoids DST gaps around midnight).
    const dayAnchor = new Date(
      Date.UTC(start.year, start.month - 1, start.day + offset, 12, 0, 0),
    );
    const dayParts = getWallClockParts(dayAnchor, timezone);
    const dateKey = formatDateKey(dayParts.year, dayParts.month, dayParts.day);
    const weekday = new Date(
      Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day),
    ).getUTCDay();
    const override = overridesByDate.get(dateKey);
    const skipIds = new Set(override?.skipDepartureIds ?? []);

    const dayTimes: number[] = [];

    for (const departure of route.departures) {
      if (skipIds.has(departure.id)) {
        continue;
      }

      if (!departure.daysOfWeek.includes(weekday)) {
        continue;
      }

      const minutes = parseTimeToMinutes(departure.time);
      if (minutes !== null) {
        dayTimes.push(minutes);
      }
    }

    for (const extra of override?.extraDepartures ?? []) {
      const minutes = parseTimeToMinutes(extra.time);
      if (minutes !== null) {
        dayTimes.push(minutes);
      }
    }

    const candidates: CandidateDeparture[] = dayTimes
      .map((minutes) => {
        const departureAt = wallClockToInstant(
          dayParts.year,
          dayParts.month,
          dayParts.day,
          Math.floor(minutes / 60),
          minutes % 60,
          timezone,
        );

        return {
          departureAt,
          expectedArrivalAt: new Date(departureAt.getTime() + transitMs),
        };
      })
      // A dispatch within `graceMinutes` after a departure still counts.
      .filter(
        (candidate) =>
          candidate.departureAt.getTime() >= dispatchedAt.getTime() - graceMs,
      )
      .sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}
