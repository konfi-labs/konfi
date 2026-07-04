import { hasDuplicateIds } from "../../validators/has-duplicate-ids";

describe("hasDuplicateIds", () => {
  it("should return false for an empty array", () => {
    expect(hasDuplicateIds([])).toBe(false);
  });

  it("should return false for array with no duplicates", () => {
    expect(hasDuplicateIds(["1", "2", "3"])).toBe(false);
    expect(hasDuplicateIds(["a", "b", "c"])).toBe(false);
    expect(hasDuplicateIds(["id-1", "id-2", "id-3"])).toBe(false);
  });

  it("should return true for array with duplicates", () => {
    expect(hasDuplicateIds(["1", "1", "2"])).toBe(true);
    expect(hasDuplicateIds(["a", "b", "a"])).toBe(true);
    expect(hasDuplicateIds(["id-1", "id-1", "id-2"])).toBe(true);
  });

  it("should return true for array with multiple duplicates", () => {
    expect(hasDuplicateIds(["1", "1", "2", "2"])).toBe(true);
    expect(hasDuplicateIds(["a", "a", "b", "b", "c", "c"])).toBe(true);
  });

  it("should handle case-sensitive strings correctly", () => {
    expect(hasDuplicateIds(["A", "a"])).toBe(false);
    expect(hasDuplicateIds(["ID-1", "id-1"])).toBe(false);
  });

  it("should return false for array with single element", () => {
    expect(hasDuplicateIds(["1"])).toBe(false);
    expect(hasDuplicateIds(["unique-id"])).toBe(false);
  });
});
