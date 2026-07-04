import {
  CurrencyEnum,
  CustomSizeWithQuantity,
  PriceTypeEnum,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import { calcPrice, calculateQuantityForMultipleSizes } from "../price";

describe("Multiple Custom Sizes Price Calculation", () => {
  describe("calculateQuantityForMultipleSizes", () => {
    it("should calculate total quantity for multiple sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 200, quantity: 2 }, // 100*200*2 = 40,000 mm²
        { width: 150, height: 250, quantity: 3 }, // 150*250*3 = 112,500 mm²
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes);
      // Total: (40,000 + 112,500) / 1,000,000 = 0.1525 m²
      expect(totalQuantity).toBe(0.152); // Truncated to 3 decimal places (fiscal precision)
    });

    it("should handle single custom size", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 200, height: 300, quantity: 1 }, // 200*300*1 = 60,000 mm²
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes);
      // Total: 60,000 / 1,000,000 = 0.06 m²
      expect(totalQuantity).toBe(0.06);
    });

    it("should throw error for empty custom sizes array", () => {
      expect(() => calculateQuantityForMultipleSizes([])).toThrow(
        "Custom sizes array is empty or undefined",
      );
    });

    it("should throw error for invalid quantity", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 200, quantity: 0 },
      ];

      expect(() => calculateQuantityForMultipleSizes(customSizes)).toThrow(
        "Invalid quantity in custom size",
      );
    });

    it("should handle bleed calculation", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 200, quantity: 1 },
      ];
      const bleed = 5;

      const totalQuantity = calculateQuantityForMultipleSizes(
        customSizes,
        bleed,
      );
      // With 5mm total bleed: effective size 105x205mm
      // totalArea = 21,525 / 1,000,000 = 0.021525 -> truncated to 0.021
      expect(totalQuantity).toBe(0.021); // Truncated to 3 decimal places (fiscal precision)
    });

    it("should not pack poster-sized multiple custom sizes into full square-meter slots", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 450, height: 600, quantity: 2 },
        { width: 300, height: 400, quantity: 3 },
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes, 10);

      // Previous behaviour used slot packing when bleed was present:
      // 450x600x2 -> 1 m² and 300x400x3 -> 0.5 m².
      // Multiple explicit m² sizes should instead sum their gross area.
      expect(totalQuantity).toBe(0.942);
    });

    it("should use geometric area when only one piece fits per m² with bleed", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 600, height: 600, quantity: 1 },
        { width: 600, height: 600, quantity: 1 },
        { width: 2700, height: 450, quantity: 1 },
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes, 10);

      // Gross areas with 10mm total bleed (m²):
      // 610x610 + 610x610 + 2710x460 = 1.9903 => truncated to 1.99
      expect(totalQuantity).toBe(1.99);
    });

    it("should combine small pieces with large single-fit pieces by gross area", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 100, quantity: 100 },
        { width: 600, height: 600, quantity: 2 },
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes, 5);

      // Small pieces: 105x105 gross area each -> 1.1025 m² total.
      // Large pieces: 605x605 each -> 0.366025 m² per piece, 0.73205 m² total
      // Total ≈ 1.83455 -> truncated to 1.834
      expect(totalQuantity).toBe(1.834);
    });

    it("should sum many small stickers by gross area", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 50, height: 50, quantity: 500 },
      ];

      // With 3mm total bleed: effective 53x53mm
      // 53x53x500 = 1.4045 m² -> truncated to 1.404 m²
      const totalQuantity = calculateQuantityForMultipleSizes(customSizes, 3);

      expect(totalQuantity).toBe(1.404);
    });

    it("should include total bleed for sticker custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 100, quantity: 420 },
        { width: 60, height: 60, quantity: 5360 },
      ];

      const totalQuantity = calculateQuantityForMultipleSizes(customSizes, 3);

      // 100x100 -> 103x103 => 4.45578 m² -> 4.455 fiscal m²
      // 60x60 -> 63x63 => 21.27384 m² -> 21.273 fiscal m²
      // Total = 25.728 fiscal m²
      expect(totalQuantity).toBe(25.728);
    });
  });

  describe("calcPrice with multiple custom sizes", () => {
    const mockPrices = [
      {
        value: 10000, // 100 PLN = 10000 grosz per m²
        currency: "PLN" as any,
        threshold: 1,
        combination: undefined,
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    it("should calculate price for multiple custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 1000, height: 1000, quantity: 1 }, // 1000*1000*1 = 1,000,000 mm² = 1 m²
        { width: 500, height: 500, quantity: 1 }, // 500*500*1 = 250,000 mm² = 0.25 m²
      ];

      // Total: (1,000,000 + 250,000) / 1,000,000 = 1.25 m²
      // Price: 1.25 * 10000 = 12500 grosz
      const result = calcPrice(
        1, // quantity (ignored for custom format)
        mockPrices,
        PriceTypeEnum.SINGLE,
        undefined, // discount
        undefined, // calculatedCombination
        undefined, // volume
        true, // customFormat
        1000, // width (ignored when customSizes provided)
        1000, // height (ignored when customSizes provided)
        1, // minimumOrder
        null, // customPrice
        undefined, // bleed
        undefined, // customerDiscount
        customSizes,
      );

      expect(result.result).toBe(12500); // 125 PLN in grosz
    });

    it("should apply minimum order when using multiple custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 100, height: 100, quantity: 1 }, // 0.01 m²
      ];

      const result = calcPrice(
        1,
        mockPrices,
        PriceTypeEnum.SINGLE,
        undefined,
        undefined,
        undefined,
        true,
        100,
        100,
        1, // minimumOrder of 1 m² should override 0.01 m² calculated
        null,
        undefined,
        undefined,
        customSizes,
      );

      expect(result.result).toBe(10000); // billed at minimum 1 m²
    });

    it("should price matrix custom sizes without inflating large-piece area", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 600, height: 600, quantity: 2 },
        { width: 2700, height: 450, quantity: 1 },
      ];

      const matrixPrices = [
        {
          value: 27400, // 274.00 PLN per m²
          currency: CurrencyEnum.PLN,
          threshold: 0,
          combination: { id: "combo", active: true, customFormat: true },
          volume: { value: 1, deliveryTime: 5 },
        },
      ];

      const result = calcPrice(
        1,
        matrixPrices,
        PriceTypeEnum.MATRIX,
        undefined,
        "combo",
        3, // total pieces provided to satisfy MATRIX volume validation
        true,
        undefined,
        undefined,
        1,
        null,
        10,
        undefined,
        customSizes,
      );

      // Gross area total = 1.99 m², price = 1.99 * 274.00 = 545.26 PLN
      // Fiscal unit rounding yields 545.25 PLN => 54525 grosz
      expect(result.result).toBe(54525);
    });

    it("should price many small stickers via packing for custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 50, height: 50, quantity: 500 },
        { width: 70, height: 70, quantity: 500 },
      ];

      const result = calcPrice(
        1,
        mockPrices,
        PriceTypeEnum.SINGLE,
        undefined,
        undefined,
        undefined,
        true,
        50,
        50,
        1,
        null,
        0, // bleed
        undefined,
        customSizes,
      );

      expect(result.result).toBe(37000);
    });

    it("should fall back to regular calculation when no custom sizes", () => {
      const result = calcPrice(
        1, // quantity
        mockPrices,
        PriceTypeEnum.SINGLE,
        undefined, // discount
        undefined, // calculatedCombination
        undefined, // volume
        true, // customFormat
        1000, // width
        1000, // height
        1, // minimumOrder
        null, // customPrice
        undefined, // bleed
        undefined, // customerDiscount
        [], // empty customSizes
      );

      // Regular calculation: (1000*1000*1) / 1,000,000 = 1 m²
      // Price: 1 * 10000 = 10000 grosz
      expect(result.result).toBe(10000);
    });
  });
});
