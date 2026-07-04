import { normalizeToLargest } from "../../math/normalize-to-largest";

describe("normalizeToLargest", () => {
  it("should return an empty array when input is an empty array", () => {
    expect(normalizeToLargest([])).toEqual([]);
  });

  it("should return an array of zeros when all input values are zero", () => {
    expect(normalizeToLargest([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("should normalize values to the largest value", () => {
    expect(normalizeToLargest([1, 2, 3])).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("should handle a single value correctly", () => {
    expect(normalizeToLargest([5])).toEqual([1]);
  });
});
