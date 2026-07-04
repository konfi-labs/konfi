import { getClosestVolume } from "../../getters/get-closest-volume";

describe("getClosestVolume", () => {
  it("should return the exact volume if it exists in the array", () => {
    const volumes = [10, 20, 30, 40, 50];
    expect(getClosestVolume(30, volumes)).toBe(30);
  });

  it("should return the closest volume when selected volume is between array values", () => {
    const volumes = [10, 20, 30, 40, 50];
    expect(getClosestVolume(22, volumes)).toBe(20);
    expect(getClosestVolume(26, volumes)).toBe(30);
  });

  it("should return the closest volume when selected volume is less than the minimum", () => {
    const volumes = [10, 20, 30, 40, 50];
    expect(getClosestVolume(5, volumes)).toBe(10);
  });

  it("should return the closest volume when selected volume is greater than the maximum", () => {
    const volumes = [10, 20, 30, 40, 50];
    expect(getClosestVolume(55, volumes)).toBe(50);
  });

  it("should handle decimal values correctly", () => {
    const volumes = [10.1, 20.2, 30.3, 40.4];
    expect(getClosestVolume(20.5, volumes)).toBe(20.2);
  });

  it("should handle single value arrays", () => {
    const volumes = [100];
    expect(getClosestVolume(50, volumes)).toBe(100);
    expect(getClosestVolume(150, volumes)).toBe(100);
  });

  it("should handle unsorted arrays", () => {
    const volumes = [40, 10, 30, 20];
    expect(getClosestVolume(22, volumes)).toBe(20);
    expect(getClosestVolume(28, volumes)).toBe(30);
  });
});
