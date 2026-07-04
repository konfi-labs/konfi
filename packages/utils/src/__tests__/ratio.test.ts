import { getRatio, isValidRatio } from "../ratio";

describe("getRatio", () => {
  test("should return 0 if width is 0", () => {
    expect(getRatio(0, 10)).toBe(0);
  });

  test("should return 0 if height is 0", () => {
    expect(getRatio(10, 0)).toBe(0);
  });

  test("should return the correct ratio", () => {
    expect(getRatio(10, 5)).toBe("2.00");
    expect(getRatio(7, 3)).toBe("2.33");
  });
});

describe("isValidRatio", () => {
  test("should return false if current ratio is 0", () => {
    expect(isValidRatio(0, 10, 1, 3, 2)).toBe(false);
    expect(isValidRatio(10, 0, 1, 3, 2)).toBe(false);
  });

  test("should return false if current ratio is not finite", () => {
    expect(isValidRatio(Infinity, 10, 1, 3, 2)).toBe(false);
    expect(isValidRatio(10, Infinity, 1, 3, 2)).toBe(false);
  });

  test("should return false if current ratio is less than minRatio", () => {
    expect(isValidRatio(1, 10, 0.2, 3, 2)).toBe(false);
  });

  test("should return false if current ratio is greater than maxRatio", () => {
    expect(isValidRatio(10, 1, 1, 5, 2)).toBe(false);
  });

  test("should return false if current ratio does not match the given ratio", () => {
    expect(isValidRatio(10, 5, 1, 3, 3)).toBe(false);
  });

  test("should return true if current ratio is within the range and matches the given ratio", () => {
    expect(isValidRatio(10, 5, 1, 3, 2)).toBe(true);
  });

  test("should return true if current ratio is within the range and ratio is 0", () => {
    expect(isValidRatio(10, 5, 1, 3, 0)).toBe(true);
  });
});
