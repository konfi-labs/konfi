export const INCREMENTAL_OVERLAP_DAYS = 3;

/**
 * Derives the incremental `dateFrom` (YYYY-MM-DD) for a stateful sync: the last
 * successful sync timestamp minus a small overlap window, so late-edited
 * invoices near the previous boundary are re-caught. Returns undefined for a
 * missing/invalid timestamp so the caller falls back to a full scan.
 */
export function deriveIncrementalDateFrom(
  lastSyncedAtIso: string | undefined,
  overlapDays: number = INCREMENTAL_OVERLAP_DAYS,
): string | undefined {
  if (!lastSyncedAtIso) {
    return undefined;
  }

  const parsed = new Date(lastSyncedAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const overlap = Math.max(0, Math.floor(overlapDays));
  const shifted = new Date(parsed.getTime());
  shifted.setUTCDate(shifted.getUTCDate() - overlap);

  return shifted.toISOString().split("T")[0];
}
