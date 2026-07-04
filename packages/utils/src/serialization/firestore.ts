export type TimestampFormat = "iso" | "millis";

/**
 * Serialize Firestore-specific values (Timestamp, {seconds,nanoseconds}) and Dates
 * into plain JSON-safe representations. Defaults to ISO strings for temporal values.
 */
export function serializeFirestore<T>(
  input: T,
  format: TimestampFormat = "iso",
): unknown {
  const seen = new WeakSet<object>();

  const toSerializable = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    const type = typeof value;
    if (type !== "object") return value;

    // Timestamp-like: has toDate() and toMillis()
    const maybeObj = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (
      typeof maybeObj.toDate === "function" &&
      typeof maybeObj.toMillis === "function"
    ) {
      return format === "millis"
        ? maybeObj.toMillis!()
        : maybeObj.toDate!().toISOString();
    }
    // POJO Firestore timestamp {seconds, nanoseconds}
    if (
      typeof maybeObj.seconds === "number" &&
      typeof maybeObj.nanoseconds === "number"
    ) {
      const ms =
        maybeObj.seconds * 1000 + Math.floor(maybeObj.nanoseconds / 1_000_000);
      return format === "millis" ? ms : new Date(ms).toISOString();
    }
    // Date
    if (value instanceof Date) {
      return format === "millis" ? value.getTime() : value.toISOString();
    }
    // Firestore GeoPoint-like
    const maybeGeo = value as { latitude?: unknown; longitude?: unknown };
    if (
      typeof maybeGeo.latitude === "number" &&
      typeof maybeGeo.longitude === "number"
    ) {
      return { lat: maybeGeo.latitude, lng: maybeGeo.longitude };
    }

    if (Array.isArray(value)) {
      return value.map((v) => toSerializable(v));
    }

    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      return undefined; // avoid cycles
    }
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = toSerializable(v);
    }
    return out;
  };

  return toSerializable(input);
}
