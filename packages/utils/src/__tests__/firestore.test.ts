import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { removeUndefined } from "../firestore";

describe("removeUndefined", () => {
  it("preserves root undefined values", () => {
    expect(removeUndefined(undefined)).toBeUndefined();
  });

  it("preserves null values and empty collections", () => {
    expect(
      removeUndefined({
        emptyArray: [],
        emptyObject: {},
        value: null,
        skip: undefined,
      }),
    ).toEqual({
      emptyArray: [],
      emptyObject: {},
      value: null,
    });
  });

  it("preserves non-plain Firestore value instances", () => {
    class FirestoreReferenceLike {
      constructor(readonly path: string) {}
    }

    const reference = new FirestoreReferenceLike("collection/document");

    const cleaned = removeUndefined({
      reference,
      optional: undefined,
    });

    expect(cleaned).toEqual({ reference });
    expect(cleaned.reference).toBe(reference);
  });

  it("preserves Firestore Timestamp instances while removing undefined fields", () => {
    const timestamp = Timestamp.now();

    const cleaned = removeUndefined({
      createdAt: timestamp,
      updatedAt: timestamp,
      optional: undefined,
      activities: [
        {
          timestamp,
          value: "NEW",
          unused: undefined,
        },
        undefined,
      ],
      nested: {
        deadline: timestamp,
        skip: undefined,
        deeper: {
          keep: "value",
          skip: undefined,
        },
      },
    });

    expect(cleaned).toEqual({
      createdAt: timestamp,
      updatedAt: timestamp,
      activities: [
        {
          timestamp,
          value: "NEW",
        },
        null,
      ],
      nested: {
        deadline: timestamp,
        deeper: {
          keep: "value",
        },
      },
    });
    expect(cleaned.createdAt).toBe(timestamp);
    expect(cleaned.updatedAt).toBe(timestamp);
    expect(cleaned.activities[0]?.timestamp).toBe(timestamp);
    expect(cleaned.nested.deadline).toBe(timestamp);
  });
});
