import { arrayIntersection } from "../array-intersection";

describe("arrayIntersection", () => {
  it("should return an array of intersections", () => {
    expect(arrayIntersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    expect(arrayIntersection([1, 2, 3], [4, 5, 6])).toEqual([]);
  });

  it("should return an empty array when any input array is missing", () => {
    expect(arrayIntersection<number>([1, 2, 3], undefined, [2, 3])).toEqual([]);
    expect(arrayIntersection<number>([1, 2, 3], null, [2, 3])).toEqual([]);
  });

  it("should return an empty array when called without arguments", () => {
    expect(arrayIntersection()).toEqual([]);
  });

  it("should return a copy of the only array when given a single array", () => {
    const input = [1, 2, 2, 3];
    const result = arrayIntersection(input);
    expect(result).toEqual([1, 2, 2, 3]);
    expect(result).not.toBe(input);
  });

  it("should preserve order and duplicates from the first array", () => {
    expect(arrayIntersection([3, 1, 2, 1, 3], [1, 3])).toEqual([3, 1, 1, 3]);
  });

  it("should handle empty arrays", () => {
    expect(arrayIntersection([], [1, 2])).toEqual([]);
    expect(arrayIntersection([1, 2], [])).toEqual([]);
  });

  it("should intersect across more than two arrays", () => {
    expect(arrayIntersection([1, 2, 3, 4], [2, 3, 4], [3, 4, 5])).toEqual([
      3, 4,
    ]);
  });
});
