import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import {
  findExternalAttributeByKey,
  getExternalAttributeKey,
} from "./external-attribute-key";

describe("getExternalAttributeKey", () => {
  it("returns id when present", () => {
    expect(getExternalAttributeKey({ id: "paper-id", name: "Paper" })).toBe(
      "paper-id",
    );
  });

  it("returns name when id is absent", () => {
    expect(getExternalAttributeKey({ name: "Paper" })).toBe("Paper");
  });

  it("returns name when id is empty string", () => {
    expect(getExternalAttributeKey({ id: "", name: "Paper" })).toBe("Paper");
  });
});

describe("findExternalAttributeByKey", () => {
  const attributes: ExternalAttribute[] = [
    { id: "paper-id", name: "Paper", values: ["matt-150g"], options: [] },
    { name: "Foil", values: ["matt-front"], options: [] },
    { id: "coat-id", name: "Coating", values: ["uv"], options: [] },
  ];

  it("finds by id first", () => {
    const result = findExternalAttributeByKey(attributes, "paper-id");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Paper");
  });

  it("falls back to name when key does not match any id", () => {
    const result = findExternalAttributeByKey(attributes, "Foil");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Foil");
  });

  it("returns undefined when key matches nothing", () => {
    const result = findExternalAttributeByKey(attributes, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("avoids false match when one attr's name equals another's id", () => {
    const ambiguous: ExternalAttribute[] = [
      { id: "Foil", name: "FoilType", values: [], options: [] },
      { name: "Foil", values: [], options: [] },
    ];

    // key "Foil" should match the first attribute by id, not the second by name
    const result = findExternalAttributeByKey(ambiguous, "Foil");
    expect(result).toBeDefined();
    expect(result!.name).toBe("FoilType");
  });
});
