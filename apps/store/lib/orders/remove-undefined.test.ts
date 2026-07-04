import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { removeUndefined } from "@konfi/utils";

describe("removeUndefined", () => {
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
      ],
      nested: {
        deadline: timestamp,
        skip: undefined,
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
      ],
      nested: {
        deadline: timestamp,
      },
    });
    expect(cleaned.createdAt).toBe(timestamp);
    expect(cleaned.updatedAt).toBe(timestamp);
    expect(cleaned.activities[0]?.timestamp).toBe(timestamp);
    expect(cleaned.nested.deadline).toBe(timestamp);
  });
});
