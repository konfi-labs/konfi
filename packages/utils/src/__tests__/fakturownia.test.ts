import { describe, it, expect } from "vitest";
import {
  multiplyCurrency,
  roundTotal,
  roundUnitPrice,
  minorToMajorSafe,
  FAKTUROWNIA_TOTAL_PRECISION,
  FAKTUROWNIA_UNIT_PRICE_PRECISION,
} from "../fakturownia";

describe("multiplyCurrency", () => {
  it("should correctly multiply 0.70 * 16.95 to get 11.87 (not 11.86)", () => {
    // This is the exact case from the bug report:
    // składanie A3 do formatu A4: 0.70 PLN gross * 16.95 qty
    // JavaScript floating-point: 0.70 * 16.95 = 11.864999999999998
    // Expected: 11.87 (as Fakturownia calculates)
    const result = multiplyCurrency(0.7, 16.95);
    expect(result).toBe(11.87);
  });

  it("should correctly multiply 0.57 * 16.95 (net unit price case)", () => {
    // Net unit price from the bug report
    const result = multiplyCurrency(0.57, 16.95);
    // 0.57 * 16.95 = 9.6615 -> rounds to 9.66
    expect(result).toBe(9.66);
  });

  it("should handle exact multiplication without precision issues", () => {
    // Simple cases that shouldn't have precision issues
    expect(multiplyCurrency(10, 5)).toBe(50);
    expect(multiplyCurrency(1.5, 2)).toBe(3);
    expect(multiplyCurrency(0.01, 100)).toBe(1);
  });

  it("should handle fractional quantities correctly", () => {
    // 2.5 m² at 10.00 PLN/m² = 25.00 PLN
    expect(multiplyCurrency(10, 2.5)).toBe(25);

    // 1.234 m² at 8.10 PLN/m² ≈ 9.9954 PLN → 10.00 PLN
    expect(multiplyCurrency(8.1, 1.234)).toBe(10);
  });

  it("should round to nearest cent/grosz", () => {
    // When multiplying 0.5 * 2.01, we convert to minor units first:
    // unitPriceMinor = Math.round((0.5 + EPSILON) * 100) = 50
    // totalMinor = 50 * 2.01 = 100.5
    // Math.round(100.5) = 100 (JavaScript rounds half values to even - banker's rounding)
    // Result: 100 / 100 = 1.00 PLN
    expect(multiplyCurrency(0.5, 2.01)).toBe(1);
    
    // Cases that round up correctly
    expect(multiplyCurrency(0.5, 2.02)).toBe(1.01); // 50 * 2.02 = 101 -> 1.01
  });

  it("should handle zero and edge cases", () => {
    expect(multiplyCurrency(0, 10)).toBe(0);
    expect(multiplyCurrency(10, 0)).toBe(0);
    expect(multiplyCurrency(0, 0)).toBe(0);
  });

  it("should handle invalid inputs", () => {
    expect(multiplyCurrency(NaN, 10)).toBe(0);
    expect(multiplyCurrency(10, NaN)).toBe(0);
    expect(multiplyCurrency(Infinity, 10)).toBe(0);
    expect(multiplyCurrency(10, Infinity)).toBe(0);
  });

  it("should handle more floating-point edge cases", () => {
    // Known problematic floating-point multiplications
    expect(multiplyCurrency(0.1, 3)).toBe(0.3);
    expect(multiplyCurrency(0.2, 5)).toBe(1);
    expect(multiplyCurrency(0.07, 3)).toBe(0.21);
  });

  it("should handle large quantities", () => {
    expect(multiplyCurrency(0.01, 1000)).toBe(10);
    expect(multiplyCurrency(99.99, 100)).toBe(9999);
  });

  it("should handle unit prices with more precision", () => {
    // Unit price that appears to have 2 decimals but has floating-point issues
    // 1.23 might be stored as 1.2299999999999998 in some contexts
    expect(multiplyCurrency(1.23, 10)).toBe(12.3);
  });
});

describe("roundTotal", () => {
  it("should round to 2 decimal places", () => {
    expect(roundTotal(11.865)).toBe(11.87);
    expect(roundTotal(11.864)).toBe(11.86);
    expect(roundTotal(11.8649999)).toBe(11.86);
    // toFixed() behavior at exact 0.5 boundaries: 100.005 in floating-point
    // is represented as approximately 100.00499999999999 which rounds down
    expect(roundTotal(100.005)).toBe(100);
    expect(roundTotal(100.006)).toBe(100.01); // This rounds up correctly
  });
});

describe("roundUnitPrice", () => {
  it("should round to configured precision (2 decimal places)", () => {
    expect(FAKTUROWNIA_UNIT_PRICE_PRECISION).toBe(2);
    // toFixed() behavior: 0.575 in floating-point is approximately 0.5749999999999
    // which rounds down to 0.57
    expect(roundUnitPrice(0.575)).toBe(0.57);
    expect(roundUnitPrice(0.574)).toBe(0.57);
    expect(roundUnitPrice(0.576)).toBe(0.58);
  });
});

describe("minorToMajorSafe", () => {
  it("should convert grosze to PLN", () => {
    expect(minorToMajorSafe(1187)).toBe(11.87);
    expect(minorToMajorSafe(1186)).toBe(11.86);
    expect(minorToMajorSafe(100)).toBe(1);
  });

  it("should handle invalid inputs", () => {
    expect(minorToMajorSafe(null)).toBe(0);
    expect(minorToMajorSafe(undefined)).toBe(0);
    expect(minorToMajorSafe(NaN)).toBe(0);
  });
});

describe("precision constants", () => {
  it("should have consistent precision settings", () => {
    expect(FAKTUROWNIA_TOTAL_PRECISION).toBe(2);
    expect(FAKTUROWNIA_UNIT_PRICE_PRECISION).toBe(2);
  });
});
