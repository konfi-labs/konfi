const ALLEGRO_HANDLING_TIME_DAYS_PATTERN = /^P(\d+)D$/;
const MIN_HANDLING_TIME_DAYS = 1;
const MAX_HANDLING_TIME_DAYS = 365;

export function toAllegroHandlingTimeDuration(
  days: number,
): string | undefined {
  if (
    !Number.isInteger(days) ||
    days < MIN_HANDLING_TIME_DAYS ||
    days > MAX_HANDLING_TIME_DAYS
  ) {
    return undefined;
  }

  return `P${days}D`;
}

export function parseAllegroHandlingTimeDays(value: string): number | null {
  const match = value.trim().match(ALLEGRO_HANDLING_TIME_DAYS_PATTERN);
  if (!match) return null;

  const days = Number(match[1]);
  return toAllegroHandlingTimeDuration(days) ? days : null;
}
