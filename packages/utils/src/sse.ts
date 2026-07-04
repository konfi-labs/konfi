/**
 * Decide if the client should fallback from SSE to polling.
 *
 * - If finished, never fallback.
 * - If no events have been seen for `timeoutMs` since the last event (or start), fallback.
 */
export const shouldFallbackToPolling = (opts: {
  startedAt: number;
  lastEventAt?: number;
  finished: boolean;
  timeoutMs?: number;
}): boolean => {
  if (opts.finished) return false;
  const timeout = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;
  const ref =
    typeof opts.lastEventAt === "number" ? opts.lastEventAt : opts.startedAt;
  return Date.now() - ref >= timeout;
};
