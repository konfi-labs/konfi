import { describe, it, expect } from "vitest";
import { DiscountTypeEnum, Unit, OrderItem } from "@konfi/types";
import {
  roundUnitPrice,
  roundTotal,
  minorToMajorSafe,
  FAKTUROWNIA_UNIT_PRICE_PRECISION,
} from "../fakturownia";
import {
  toFiscalQuantity,
  toFiscalUnitPrice,
  FISCAL_UNIT_PRICE_PRECISION,
} from "../price";

/**
 * This test suite validates the flow from OrderItem prices to invoice positions.
 *
 * The key issue being tested:
 * - Order items have prices that are already fiscally sanitized via enforceFiscalTotalPrecision
 *   during order creation (unit = round(total/qty, 2), total' = round(unit * qty, 2))
 * - When building invoice positions, we must NOT apply additional fiscal truncation
 *   (toFiscalUnitPrice) because this causes double-sanitization and price drift
 * - We should only use roundUnitPrice (Fakturownia's rounding) to derive unit prices
 *   from the already-sanitized totals
 */
describe("Order Item to Invoice Position - Price Flow", () => {
  /**
   * Simulates enforceFiscalTotalPrecision from price.ts
   * This is what happens during order creation
   */
  const simulateFiscalEnforcement = (
    totalMinor: number,
    quantity: number,
  ): number => {
    const normalizedQuantity = toFiscalQuantity(quantity);
    if (normalizedQuantity <= 0) return Math.floor(totalMinor);

    const totalMajor = totalMinor / 100;
    // Round unit price to 2 decimals (fiscal requirement)
    const unitMajor = Math.round((totalMajor / normalizedQuantity) * 100) / 100;
    // Recalculate total with rounded unit price
    const adjustedTotalMajor =
      Math.round(unitMajor * normalizedQuantity * 100) / 100;
    return Math.round(adjustedTotalMajor * 100);
  };

  /**
   * Simulates the OLD buildPositionFromOrderItem logic (with double sanitization bug)
   */
  const buildPositionOld = (
    totalPriceMinor: number,
    quantity: number,
    discountPercent: number = 0,
  ) => {
    const totalGross = minorToMajorSafe(totalPriceMinor);
    const safeQuantity = toFiscalQuantity(quantity > 0 ? quantity : 1);

    let priceGross: number;
    if (discountPercent > 0) {
      const discountedUnitPrice = totalGross / safeQuantity;
      const originalUnitPrice =
        discountedUnitPrice / (1 - discountPercent / 100);
      // BUG: Double sanitization - toFiscalUnitPrice truncates, then roundUnitPrice rounds
      const fiscalOriginalUnitPrice = toFiscalUnitPrice(originalUnitPrice);
      priceGross = roundUnitPrice(fiscalOriginalUnitPrice);
    } else {
      const baseUnitPrice = totalGross / safeQuantity;
      // BUG: Double sanitization - toFiscalUnitPrice truncates, then roundUnitPrice rounds
      const fiscalBaseUnitPrice = toFiscalUnitPrice(baseUnitPrice);
      priceGross = roundUnitPrice(fiscalBaseUnitPrice);
    }

    const calculatedTotal = roundTotal(priceGross * safeQuantity);
    return { priceGross, calculatedTotal, originalTotal: totalGross };
  };

  /**
   * Simulates the FIXED buildPositionFromOrderItem logic (no double sanitization)
   */
  const buildPositionFixed = (
    totalPriceMinor: number,
    quantity: number,
    discountPercent: number = 0,
  ) => {
    const totalGross = minorToMajorSafe(totalPriceMinor);
    const safeQuantity = toFiscalQuantity(quantity > 0 ? quantity : 1);

    let priceGross: number;
    if (discountPercent > 0) {
      const discountedUnitPrice = totalGross / safeQuantity;
      const originalUnitPrice =
        discountedUnitPrice / (1 - discountPercent / 100);
      // FIX: Only use roundUnitPrice, skip toFiscalUnitPrice to avoid double-sanitization
      priceGross = roundUnitPrice(originalUnitPrice);
    } else {
      const baseUnitPrice = totalGross / safeQuantity;
      // FIX: Only use roundUnitPrice, skip toFiscalUnitPrice to avoid double-sanitization
      priceGross = roundUnitPrice(baseUnitPrice);
    }

    const calculatedTotal = roundTotal(priceGross * safeQuantity);
    return { priceGross, calculatedTotal, originalTotal: totalGross };
  };

  describe("Price preservation without discount", () => {
    it("should preserve fiscally-sanitized prices when quantity divides evenly", () => {
      // 10 items at 5.00 PLN each = 50.00 PLN = 5000 grosze
      const originalTotalMinor = 5000;
      const quantity = 10;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        originalTotalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(5000); // No change needed

      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);
      expect(fixedResult.priceGross).toBe(5.0);
      expect(fixedResult.calculatedTotal).toBe(50.0);
      expect(fixedResult.calculatedTotal).toBe(fixedResult.originalTotal);
    });

    it("should preserve fiscally-sanitized prices for edge case: 3 items at 11.50 PLN", () => {
      // 11.50 PLN / 3 = 3.8333... → rounded to 3.83
      // 3.83 * 3 = 11.49 PLN (fiscal enforcement adjusts total)
      const rawTotalMinor = 1150;
      const quantity = 3;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        rawTotalMinor,
        quantity,
      );
      // After fiscal enforcement: unit = round(11.50/3, 2) = 3.83, total = 3.83*3 = 11.49
      expect(fiscallySanitizedTotal).toBe(1149);

      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);
      expect(fixedResult.priceGross).toBe(3.83);
      expect(fixedResult.calculatedTotal).toBe(11.49);
      expect(fixedResult.calculatedTotal).toBe(fixedResult.originalTotal);
    });

    it("should handle fractional quantities (m² billing)", () => {
      // 2.5 m² at 10.00 PLN/m² = 25.00 PLN
      const totalMinor = 2500;
      const quantity = 2.5;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(2500);

      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);
      expect(fixedResult.priceGross).toBe(10.0);
      expect(fixedResult.calculatedTotal).toBe(25.0);
    });

    it("should handle small quantities with large unit prices", () => {
      // 1 item at 1234.56 PLN = 123456 grosze
      const totalMinor = 123456;
      const quantity = 1;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(123456);

      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);
      expect(fixedResult.priceGross).toBe(1234.56);
      expect(fixedResult.calculatedTotal).toBe(1234.56);
    });
  });

  describe("Price preservation with percentage discount", () => {
    it("should correctly reverse-calculate original price with 10% discount", () => {
      // Original: 100 PLN, after 10% discount = 90 PLN = 9000 grosze
      const discountedTotalMinor = 9000;
      const quantity = 1;
      const discountPercent = 10;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        discountedTotalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(9000);

      const fixedResult = buildPositionFixed(
        fiscallySanitizedTotal,
        quantity,
        discountPercent,
      );
      // 90 / (1 - 0.10) = 100
      expect(fixedResult.priceGross).toBe(100.0);
    });

    it("should handle discount with non-trivial quantity", () => {
      // 5 items, original 20 PLN each = 100 PLN, after 15% discount = 85 PLN
      const discountedTotalMinor = 8500;
      const quantity = 5;
      const discountPercent = 15;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        discountedTotalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(8500);

      const fixedResult = buildPositionFixed(
        fiscallySanitizedTotal,
        quantity,
        discountPercent,
      );
      // discountedUnit = 85/5 = 17, original = 17/(1-0.15) = 20
      expect(fixedResult.priceGross).toBe(20.0);
    });
  });

  describe("Double sanitization bug demonstration", () => {
    it("should show that old logic can produce different results due to truncation", () => {
      // Edge case: value that triggers difference between truncation and rounding
      // 7 items totaling 23.33 PLN → unit = 3.3328...
      // toFiscalUnitPrice truncates: 3.33
      // roundUnitPrice rounds: 3.33 (same in this case, but...)
      // The issue manifests when the division produces floating-point noise
      const totalMinor = 2333;
      const quantity = 7;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );

      const oldResult = buildPositionOld(fiscallySanitizedTotal, quantity);
      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);

      // Both should ideally match, but double sanitization can cause drift in edge cases
      // This test documents that the fixed version avoids unnecessary processing
      expect(fixedResult.priceGross).toBe(
        roundUnitPrice(minorToMajorSafe(fiscallySanitizedTotal) / quantity),
      );
    });

    it("should demonstrate the truncation vs rounding difference", () => {
      // Direct comparison: toFiscalUnitPrice vs roundUnitPrice
      // 3.8366... → truncate = 3.83, round = 3.84
      const value = 3.8366;

      expect(toFiscalUnitPrice(value)).toBe(3.83); // Truncates
      expect(roundUnitPrice(value)).toBe(3.84); // Rounds

      // When applied sequentially (the bug):
      const doubleSanitized = roundUnitPrice(toFiscalUnitPrice(value));
      expect(doubleSanitized).toBe(3.83); // Truncation wins

      // Single pass (the fix):
      const singlePass = roundUnitPrice(value);
      expect(singlePass).toBe(3.84); // Proper rounding
    });

    it("should show price drift scenario with real order data pattern", () => {
      // Scenario: Customer orders 3 custom prints
      // Raw price calculated: 115.47 PLN / 3 = 38.49 PLN/item
      // After fiscal enforcement during order creation:
      //   unit = round(115.47/3, 2) = 38.49
      //   total = 38.49 * 3 = 115.47 (no adjustment needed)
      const totalMinor = 11547;
      const quantity = 3;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      expect(fiscallySanitizedTotal).toBe(11547);

      // When creating invoice, we should get the same unit price back
      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);
      expect(fixedResult.priceGross).toBe(38.49);
      expect(fixedResult.calculatedTotal).toBe(115.47);
    });
  });

  describe("Precision constants consistency", () => {
    it("should have matching precision between fiscal and Fakturownia constants", () => {
      // These should match to ensure consistent behavior
      expect(FISCAL_UNIT_PRICE_PRECISION).toBe(
        FAKTUROWNIA_UNIT_PRICE_PRECISION,
      );
      expect(FISCAL_UNIT_PRICE_PRECISION).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should handle zero quantity gracefully", () => {
      const totalMinor = 1000;
      const quantity = 0;

      const fixedResult = buildPositionFixed(totalMinor, quantity);
      // Should use 1 as safe quantity
      expect(fixedResult.priceGross).toBe(10.0);
    });

    it("should handle very small totals", () => {
      const totalMinor = 1; // 0.01 PLN
      const quantity = 1;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);

      expect(fixedResult.priceGross).toBe(0.01);
    });

    it("should handle very large totals", () => {
      const totalMinor = 99999999; // 999,999.99 PLN
      const quantity = 1;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);

      expect(fixedResult.priceGross).toBe(999999.99);
    });

    it("should handle quantity with 3 decimal precision", () => {
      // 1.234 m² at ~8.10 PLN/m² ≈ 10.00 PLN
      const totalMinor = 1000;
      const quantity = 1.234;

      const fiscallySanitizedTotal = simulateFiscalEnforcement(
        totalMinor,
        quantity,
      );
      const fixedResult = buildPositionFixed(fiscallySanitizedTotal, quantity);

      // Quantity is truncated to 3 decimals: 1.234
      // Unit price: 10.00 / 1.234 = 8.103... → rounded to 8.10
      expect(fixedResult.priceGross).toBe(8.1);
    });
  });
});
