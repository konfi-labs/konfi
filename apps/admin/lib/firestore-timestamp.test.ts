import { describe, expect, it } from "vitest";
import { serializeFirestoreTimestamp } from "./firestore-timestamp";

describe("serializeFirestoreTimestamp", () => {
  it("serializes Firestore Timestamp-like values", () => {
    expect(
      serializeFirestoreTimestamp({
        toDate: () => new Date("2026-05-07T07:41:19.272Z"),
      }),
    ).toBe("2026-05-07T07:41:19.272Z");
  });

  it("serializes seconds/nanoseconds timestamp snapshots", () => {
    expect(
      serializeFirestoreTimestamp({
        seconds: 1778139679,
        nanoseconds: 272000000,
      }),
    ).toBe("2026-05-07T07:41:19.272Z");
  });

  it("returns undefined for missing or invalid timestamps", () => {
    expect(serializeFirestoreTimestamp(undefined)).toBeUndefined();
    expect(serializeFirestoreTimestamp("not a date")).toBeUndefined();
  });
});
