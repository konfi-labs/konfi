import {
  CurrencyEnum,
  CustomSizeWithQuantity,
  Price,
  PriceTypeEnum,
} from "@konfi/types";
import { describe, expect, it } from "vitest";
import { calcPrice, calculateDiscount } from "../price";

describe("Express Processing Price Calculation", () => {
  const samplePrices: Price[] = [
    {
      value: 100,
      currency: CurrencyEnum.PLN,
      combination: {
        id: "combo1",
        active: true,
        customFormat: false,
      },
    },
  ];

  describe("calculateDiscount with express percentage", () => {
    it("should apply express markup before discount", () => {
      const basePrice = 1000;
      const expressPercent = 20;
      const discount = 0;

      const result = calculateDiscount(
        basePrice,
        discount,
        undefined,
        expressPercent,
      );

      // 1000 + (1000 * 0.20) = 1200
      expect(result).toBe(1200);
    });

    it("should apply express markup then customer discount", () => {
      const basePrice = 1000;
      const expressPercent = 20;
      const customerDiscount = 10;

      const result = calculateDiscount(
        basePrice,
        0,
        customerDiscount,
        expressPercent,
      );

      // 1000 + (1000 * 0.20) = 1200
      // 1200 - (1200 * 0.10) = 1080
      expect(result).toBe(1080);
    });

    it("should apply express markup then standard discount", () => {
      const basePrice = 1000;
      const expressPercent = 20;
      const discount = 15;

      const result = calculateDiscount(
        basePrice,
        discount,
        undefined,
        expressPercent,
      );

      // 1000 + (1000 * 0.20) = 1200
      // 1200 - (1200 * 0.15) = 1020
      expect(result).toBe(1020);
    });

    it("should work without express percentage", () => {
      const basePrice = 1000;
      const discount = 10;

      const result = calculateDiscount(
        basePrice,
        discount,
        undefined,
        undefined,
      );

      // 1000 - (1000 * 0.10) = 900
      expect(result).toBe(900);
    });

    it("should handle zero express percentage", () => {
      const basePrice = 1000;
      const expressPercent = 0;
      const discount = 10;

      const result = calculateDiscount(
        basePrice,
        discount,
        undefined,
        expressPercent,
      );

      // 1000 - (1000 * 0.10) = 900
      expect(result).toBe(900);
    });
  });

  describe("calcPrice with express percentage", () => {
    it("should calculate price with express percentage for SINGLE price type", () => {
      const quantity = 10;
      const expressPercent = 25;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 = 1000
      // 1000 + (1000 * 0.25) = 1250
      expect(result.result).toBe(1250);
    });

    it("should calculate price with express percentage and discount", () => {
      const quantity = 10;
      const expressPercent = 20;
      const discount = 10;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        discount,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 = 1000
      // 1000 + (1000 * 0.20) = 1200
      // 1200 - (1200 * 0.10) = 1080
      expect(result.result).toBe(1080);
    });

    it("should calculate price without express percentage", () => {
      const quantity = 10;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      // 100 * 10 = 1000
      expect(result.result).toBe(1000);
    });

    it("should handle express percentage with customer discount", () => {
      const quantity = 10;
      const expressPercent = 30;
      const customerDiscount = 15;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        customerDiscount,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 = 1000
      // 1000 + (1000 * 0.30) = 1300
      // 1300 - (1300 * 0.15) = 1105
      // Fiscal enforcement (per-unit rounding) -> 1110
      expect(result.result).toBe(1110);
    });

    it("should handle express percentage with minimum order", () => {
      const quantity = 5;
      const minimumOrder = 10;
      const expressPercent = 20;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        minimumOrder,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 (minimum) = 1000
      // 1000 + (1000 * 0.20) = 1200
      expect(result.result).toBe(1200);
    });
  });

  describe("Express with THRESHOLD price type", () => {
    const thresholdPrices: Price[] = [
      {
        value: 100,
        threshold: 10,
        currency: CurrencyEnum.PLN,
      },
      {
        value: 90,
        threshold: 50,
        currency: CurrencyEnum.PLN,
      },
      {
        value: 80,
        threshold: 100,
        currency: CurrencyEnum.PLN,
      },
    ];

    it("should apply express markup for threshold pricing", () => {
      const quantity = 75;
      const expressPercent = 25;

      const result = calcPrice(
        quantity,
        thresholdPrices,
        PriceTypeEnum.THRESHOLD,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // Quantity 75 falls into threshold 50 with price 90
      // 90 * 75 = 6750
      // 6750 + (6750 * 0.25) = 8437.5
      // Fiscal enforcement (per-unit rounding) -> 8400
      expect(result.result).toBe(8400);
    });

    it("should apply express markup with discount for threshold pricing", () => {
      const quantity = 120;
      const expressPercent = 20;
      const discount = 10;

      const result = calcPrice(
        quantity,
        thresholdPrices,
        PriceTypeEnum.THRESHOLD,
        discount,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // Quantity 120 falls into threshold 100 with price 80
      // 80 * 120 = 9600
      // 9600 + (9600 * 0.20) = 11520
      // 11520 - (11520 * 0.10) = 10368
      // Fiscal enforcement (per-unit rounding) -> 10320
      expect(result.result).toBe(10320);
    });
  });

  describe("Express with MATRIX price type", () => {
    const matrixPrices: Price[] = [
      {
        value: 100,
        currency: CurrencyEnum.PLN,
        combination: {
          id: "combo1",
          active: true,
          customFormat: false,
        },
        volume: { value: 1, deliveryTime: 5 },
      },
      {
        value: 90,
        currency: CurrencyEnum.PLN,
        combination: {
          id: "combo1",
          active: true,
          customFormat: false,
        },
        volume: { value: 5, deliveryTime: 5 },
      },
    ];

    it("should apply express markup for matrix pricing", () => {
      const volume = 5;
      const expressPercent = 30;

      const result = calcPrice(
        1, // quantity
        matrixPrices,
        PriceTypeEnum.MATRIX,
        0,
        "combo1",
        volume,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // Volume 5 matches price 90
      // 90 * 5 = 450
      // 450 + (450 * 0.30) = 585
      expect(result.result).toBe(585);
    });

    it("should apply express markup with customer discount for matrix pricing", () => {
      const volume = 1;
      const expressPercent = 25;
      const customerDiscount = 20;

      const result = calcPrice(
        1,
        matrixPrices,
        PriceTypeEnum.MATRIX,
        0,
        "combo1",
        volume,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        customerDiscount,
        undefined,
        undefined,
        expressPercent,
      );

      // Volume 1 matches price 100
      // 100 * 1 = 100
      // 100 + (100 * 0.25) = 125
      // 125 - (125 * 0.20) = 100
      expect(result.result).toBe(100);
    });
  });

  describe("Express with custom format", () => {
    it("should apply express markup for custom format products", () => {
      const quantity = 10;
      const width = 500;
      const height = 500;
      const expressPercent = 20;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        true, // custom format
        width,
        height,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // Custom format: (500 * 500 * 10) / 1,000,000 = 2.5 m²
      // 100 * 2.5 = 250
      // 250 + (250 * 0.20) = 300
      expect(result.result).toBe(300);
    });

    it("should apply express markup with bleed", () => {
      const quantity = 10;
      const width = 500;
      const height = 500;
      const bleed = 5;
      const expressPercent = 15;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        true, // custom format
        width,
        height,
        1,
        null,
        bleed,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // With total bleed: effectiveWidth = 505, effectiveHeight = 505
      // piecesPerMeter = 1, so we bill by geometric area: (500*500*10)/1e6 = 2.5 m²
      // 100 * 2.5 = 250
      // 250 + (250 * 0.15) ≈ 287.5 -> fiscal enforcement -> 290
      expect(result.result).toBe(290);
    });
  });

  describe("Express with multiple custom sizes", () => {
    it("should apply express markup for multiple custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 1000, height: 1000, quantity: 1 }, // 1 m²
        { width: 500, height: 500, quantity: 2 }, // 0.5 m²
      ];
      const expressPercent = 25;

      const result = calcPrice(
        1, // ignored for custom format
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        true, // custom format
        1000, // ignored when customSizes provided
        1000, // ignored when customSizes provided
        1,
        null,
        undefined,
        undefined,
        customSizes,
        undefined,
        expressPercent,
      );

      // Total: 1 + 0.5 = 1.5 m²
      // 100 * 1.5 = 150
      // 150 + (150 * 0.25) = 187.5 -> fiscal enforcement -> 186
      expect(result.result).toBe(186);
    });

    it("should apply express markup with discount for multiple custom sizes", () => {
      const customSizes: CustomSizeWithQuantity[] = [
        { width: 2000, height: 1000, quantity: 1 }, // 2 m²
      ];
      const expressPercent = 20;
      const discount = 15;

      const result = calcPrice(
        1,
        samplePrices,
        PriceTypeEnum.SINGLE,
        discount,
        "",
        undefined,
        true,
        2000,
        1000,
        1,
        null,
        undefined,
        undefined,
        customSizes,
        undefined,
        expressPercent,
      );

      // Total: 2 m²
      // 100 * 2 = 200
      // 200 + (200 * 0.20) = 240
      // 240 - (240 * 0.15) = 204
      expect(result.result).toBe(204);
    });
  });

  describe("Express with edge cases", () => {
    it("should handle negative express percentage as zero", () => {
      const quantity = 10;
      const expressPercent = -10;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // Negative percentage should be treated as zero
      // 100 * 10 = 1000
      expect(result.result).toBe(1000);
    });

    it("should handle very high express percentage", () => {
      const quantity = 10;
      const expressPercent = 200; // 200% markup

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        0,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 = 1000
      // 1000 + (1000 * 2.00) = 3000
      expect(result.result).toBe(3000);
    });

    it("should apply express before both discount types", () => {
      const quantity = 10;
      const expressPercent = 50;
      const discount = 10;
      const customerDiscount = 5;

      const result = calcPrice(
        quantity,
        samplePrices,
        PriceTypeEnum.SINGLE,
        discount,
        "",
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        customerDiscount,
        undefined,
        undefined,
        expressPercent,
      );

      // 100 * 10 = 1000
      // 1000 + (1000 * 0.50) = 1500
      // Customer discount takes precedence over regular discount
      // 1500 - (1500 * 0.05) = 1425
      // Fiscal enforcement (per-unit rounding) -> 1430
      expect(result.result).toBe(1430);
    });
  });

  describe("Express mode delivery time reduction", () => {
    const pricesWithDeliveryTime: Price[] = [
      {
        value: 100,
        currency: CurrencyEnum.PLN,
        combination: {
          id: "combo1",
          active: true,
          customFormat: false,
        },
        volume: { value: 1, deliveryTime: 10 },
      },
    ];

    it("should not reduce delivery time when expressPercent is 0", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
      );

      expect(result.deliveryTime).toBe(10);
    });

    it("should not reduce delivery time when expressPercent is undefined", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.deliveryTime).toBe(10);
    });

    it("should reduce delivery time by 20% with 20% expressPercent", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        20,
      );

      // 20% express -> 20% time reduction
      // 10 * (1 - 0.2) = 8
      expect(result.deliveryTime).toBe(8);
    });

    it("should reduce delivery time by 50% with 50% expressPercent", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        50,
      );

      // 50% express -> 50% time reduction (capped at max)
      // 10 * (1 - 0.5) = 5
      expect(result.deliveryTime).toBe(5);
    });

    it("should cap delivery time reduction at 50% even with 100% expressPercent", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        100,
      );

      // 100% express -> capped at 50% time reduction (max)
      // 10 * (1 - 0.5) = 5
      expect(result.deliveryTime).toBe(5);
    });

    it("should handle values over 100% by capping at 50% reduction", () => {
      const result = calcPrice(
        1,
        pricesWithDeliveryTime,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        150,
      );

      // 150% express -> capped at 50% time reduction
      // 10 * (1 - 0.5) = 5
      expect(result.deliveryTime).toBe(5);
    });

    it("should round delivery time to nearest integer", () => {
      const pricesWithOddDelivery: Price[] = [
        {
          value: 100,
          currency: CurrencyEnum.PLN,
          combination: {
            id: "combo1",
            active: true,
            customFormat: false,
          },
          volume: { value: 1, deliveryTime: 7 },
        },
      ];

      const result = calcPrice(
        1,
        pricesWithOddDelivery,
        PriceTypeEnum.SINGLE,
        0,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        1,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        20,
      );

      // 20% express -> 20% time reduction
      // 7 * (1 - 0.2) = 5.6 -> round to 6
      expect(result.deliveryTime).toBe(6);
    });
  });
});
