import { describe, expect, test } from "vitest";
import type { Attribute } from "@konfi/types";
import { attributeFromSnapshot } from "./configuration-attributes";

describe("attributeFromSnapshot", () => {
  test("uses the Firestore document id when the document data has no id", () => {
    const attribute = attributeFromSnapshot({
      id: "paperType",
      data: () =>
        ({
          name: "Paper type",
          calculated: true,
          required: false,
          format: false,
          options: [],
          keywords: [],
          type: "DROPDOWN",
          trackStock: false,
        }) as Attribute,
    });

    expect(attribute.id).toBe("paperType");
  });

  test("keeps the document id authoritative when the stored id is stale", () => {
    const attribute = attributeFromSnapshot({
      id: "correctId",
      data: () =>
        ({
          id: "staleId",
          name: "Paper type",
          calculated: true,
          required: false,
          format: false,
          options: [],
          keywords: [],
          type: "DROPDOWN",
          trackStock: false,
        }) as Attribute,
    });

    expect(attribute.id).toBe("correctId");
  });
});
