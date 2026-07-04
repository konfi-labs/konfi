import type { TransferRoute, TransitDayOverride } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  computeNextTransitArrival,
  createDefaultInternalTransitSettings,
  normalizeInternalTransitSettings,
  transitDayOverrideDocId,
} from "../internal-transit";

const TIMEZONE = "Europe/Warsaw";

function buildRoute(overrides: Partial<TransferRoute> = {}): TransferRoute {
  return {
    id: "route-1",
    name: "Main → Pickup",
    toWarehouseId: "wh-pickup",
    departures: [
      {
        id: "dep-10",
        time: "10:00",
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    ],
    transitMinutes: 180,
    graceMinutes: 15,
    enabled: true,
    ...overrides,
  };
}

/**
 * Helper: an instant whose Europe/Warsaw wall-clock matches the given parts.
 * January = CET (UTC+1), July = CEST (UTC+2).
 */
function warsawInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Derive the UTC offset by formatting a probe instant in the timezone.
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(probe);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const offsetMinutes =
    (Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
    ) -
      probe.getTime()) /
    60000;

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000,
  );
}

describe("normalizeInternalTransitSettings", () => {
  it("creates empty defaults with Europe/Warsaw timezone", () => {
    const defaults = createDefaultInternalTransitSettings();
    expect(defaults.routes).toEqual([]);
    expect(defaults.timezone).toBe("Europe/Warsaw");
  });

  it("backfills defaults and drops invalid routes/departures", () => {
    const normalized = normalizeInternalTransitSettings({
      routes: [
        {
          id: "r1",
          name: "Route 1",
          toWarehouseId: "wh-1",
          departures: [
            { id: "d1", time: "08:30", daysOfWeek: [1, 1, 9, 2] },
            { id: "d2", time: "99:99", daysOfWeek: [3] },
          ],
          transitMinutes: 120,
          enabled: true,
        } as never,
        { name: "no warehouse" } as never,
      ],
    });

    expect(normalized.routes).toHaveLength(1);
    const [route] = normalized.routes;
    expect(route.departures).toHaveLength(1);
    expect(route.departures[0].daysOfWeek).toEqual([1, 2]);
    expect(route.graceMinutes).toBe(15);
    expect(normalized.timezone).toBe("Europe/Warsaw");
  });

  it("builds deterministic day-override doc ids", () => {
    expect(transitDayOverrideDocId("route-1", "2026-06-10")).toBe(
      "route-1_2026-06-10",
    );
  });
});

describe("computeNextTransitArrival", () => {
  it("schedules same-day arrival when dispatched before the cutoff", () => {
    // Dispatch 09:00 Warsaw → catches 10:00 departure, +180min = 13:00.
    const dispatchedAt = warsawInstant(2026, 6, 10, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result).not.toBeNull();
    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 10, 0).getTime(),
    );
    expect(result?.expectedArrivalAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 13, 0).getTime(),
    );
  });

  it("rolls to the next day when dispatched after the cutoff", () => {
    // Dispatch 11:00 Warsaw on Wed → next departure is Thu 10:00.
    const dispatchedAt = warsawInstant(2026, 6, 10, 11, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 11, 10, 0).getTime(),
    );
    expect(result?.expectedArrivalAt.getTime()).toBe(
      warsawInstant(2026, 6, 11, 13, 0).getTime(),
    );
  });

  it("counts a dispatch within the grace window after a departure", () => {
    // Dispatch 10:10 Warsaw, grace 15 → still catches 10:00 departure.
    const dispatchedAt = warsawInstant(2026, 6, 10, 10, 10);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 10, 0).getTime(),
    );
  });

  it("misses a departure once the grace window has elapsed", () => {
    // Dispatch 10:20 Warsaw, grace 15 → misses 10:00, rolls to next day.
    const dispatchedAt = warsawInstant(2026, 6, 10, 10, 20);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 11, 10, 0).getTime(),
    );
  });

  it("picks the second departure of the same day when after the first", () => {
    const route = buildRoute({
      departures: [
        { id: "dep-10", time: "10:00", daysOfWeek: [1, 2, 3, 4, 5] },
        { id: "dep-15", time: "15:00", daysOfWeek: [1, 2, 3, 4, 5] },
      ],
    });
    // Dispatch 12:00 Warsaw → catches 15:00 departure, +180 = 18:00.
    const dispatchedAt = warsawInstant(2026, 6, 10, 12, 0);
    const result = computeNextTransitArrival(dispatchedAt, route, [], TIMEZONE);

    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 15, 0).getTime(),
    );
    expect(result?.expectedArrivalAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 18, 0).getTime(),
    );
  });

  it("rolls over the weekend to Monday", () => {
    // 2026-06-13 is a Saturday; departures only Mon–Fri.
    const dispatchedAt = warsawInstant(2026, 6, 13, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    // Next Monday is 2026-06-15.
    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 15, 10, 0).getTime(),
    );
  });

  it("skips today's run via a day override", () => {
    const overrides: TransitDayOverride[] = [
      {
        date: "2026-06-10",
        routeId: "route-1",
        skipDepartureIds: ["dep-10"],
      },
    ];
    const dispatchedAt = warsawInstant(2026, 6, 10, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      overrides,
      TIMEZONE,
    );

    // 10:00 skipped today → rolls to Thu 2026-06-11 10:00.
    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 11, 10, 0).getTime(),
    );
  });

  it("uses an extra departure added by a day override", () => {
    const overrides: TransitDayOverride[] = [
      {
        date: "2026-06-10",
        routeId: "route-1",
        extraDepartures: [{ time: "08:00" }],
      },
    ];
    // Dispatch 07:30 Warsaw → catches the extra 08:00 departure.
    const dispatchedAt = warsawInstant(2026, 6, 10, 7, 30);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      overrides,
      TIMEZONE,
    );

    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 8, 0).getTime(),
    );
    expect(result?.expectedArrivalAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 11, 0).getTime(),
    );
  });

  it("ignores overrides for a different route", () => {
    const overrides: TransitDayOverride[] = [
      {
        date: "2026-06-10",
        routeId: "other-route",
        skipDepartureIds: ["dep-10"],
      },
    ];
    const dispatchedAt = warsawInstant(2026, 6, 10, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      overrides,
      TIMEZONE,
    );

    // Override does not apply → 10:00 departure still runs today.
    expect(result?.departureAt.getTime()).toBe(
      warsawInstant(2026, 6, 10, 10, 0).getTime(),
    );
  });

  it("returns null when the route has no departures", () => {
    const result = computeNextTransitArrival(
      warsawInstant(2026, 6, 10, 9, 0),
      buildRoute({ departures: [] }),
      [],
      TIMEZONE,
    );

    expect(result).toBeNull();
  });

  it("handles winter-time (CET) departures correctly", () => {
    // January → CET (UTC+1). 10:00 Warsaw = 09:00 UTC.
    const dispatchedAt = warsawInstant(2026, 1, 12, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result?.departureAt.toISOString()).toBe("2026-01-12T09:00:00.000Z");
    expect(result?.expectedArrivalAt.toISOString()).toBe(
      "2026-01-12T12:00:00.000Z",
    );
  });

  it("handles summer-time (CEST) departures correctly", () => {
    // July → CEST (UTC+2). 10:00 Warsaw = 08:00 UTC.
    const dispatchedAt = warsawInstant(2026, 7, 13, 9, 0);
    const result = computeNextTransitArrival(
      dispatchedAt,
      buildRoute(),
      [],
      TIMEZONE,
    );

    expect(result?.departureAt.toISOString()).toBe("2026-07-13T08:00:00.000Z");
    expect(result?.expectedArrivalAt.toISOString()).toBe(
      "2026-07-13T11:00:00.000Z",
    );
  });
});
