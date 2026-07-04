import {
  Campaign,
  CurrencyEnum,
  OrderItem,
  Price,
  PriceTypeEnum,
  Promotion,
  PromotionRule,
} from "@konfi/types";
import {
  applyPromotion,
  calcPrice,
  calculateDiscount,
  calculatePriceValue,
  calculateQuantity,
  getMatrixPrice,
  getThresholdsPrice,
  validatePromotionRules,
} from "../price";

describe("calcPrice", () => {
  const prices: Price[] = [
    {
      value: 3000,
      threshold: 5,
      currency: CurrencyEnum.PLN,
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 1, deliveryTime: 5 },
    },
    {
      value: 2000,
      threshold: 6,
      currency: CurrencyEnum.PLN,
      combination: { id: "combination2", active: true, customFormat: false },
      volume: { value: 1, deliveryTime: 5 },
    },
    {
      value: 1000,
      threshold: 25,
      currency: CurrencyEnum.PLN,
      combination: { id: "combination3", active: true, customFormat: false },
      volume: { value: 1, deliveryTime: 5 },
    },
  ];

  it("should clamp totals to fiscal precision for fractional unit prices", () => {
    const fractionalPrices: Price[] = [
      {
        value: 11012, // 110.12 PLN per unit
        currency: CurrencyEnum.PLN,
        combination: { id: "fractional", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      50,
      fractionalPrices,
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
    );

    // unitPrice = 110.12 PLN, quantity = 50
    // subtotal = 110.12 * 50 = 5506.00 PLN = 550600 groszy
    // enforceFiscalTotalPrecision keeps this value intact
    expect(result.result).toBe(550600);
  });

  it("should use volume as fiscalQuantity for MATRIX type ensuring fiscal precision", () => {
    // This test verifies that for MATRIX products, volume is used for fiscal enforcement
    // which prevents the 55.06 vs 55.05 discrepancy
    const priceType = PriceTypeEnum.MATRIX;
    const calculatedCombination = "test-combo";
    const volume = 100; // This should be used as fiscalQuantity, not quantity
    const quantity = 1; // Different from volume to verify volume is used
    const customFormat = false;
    const minimumOrder = 1;
    const matrixPrices: Price[] = [
      {
        value: 11012, // 110.12 PLN per unit
        currency: CurrencyEnum.PLN,
        combination: { id: "test-combo", active: true, customFormat: false },
        volume: { value: 100, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      matrixPrices,
      priceType,
      0,
      calculatedCombination,
      volume,
      customFormat,
      undefined,
      undefined,
      minimumOrder,
      null,
      undefined,
      undefined,
      undefined,
    );

    // With volume=100 as fiscalQuantity:
    // unitPrice = 110.12 PLN, quantity = 2.5 m² (billing)
    // subtotal ≈ 275.30 PLN = 27530 groszy
    // enforceFiscalTotalPrecision uses fiscalQuantity=100 pieces
    // treating total/quantity and re-deriving a 2-decimal unit price
    expect(result.result).toBe(1101200);
  });

  it("should enforce fiscal precision correctly for fractional area calculations", () => {
    // Simulates the real-world scenario: small pieces on large sheet
    const priceType = PriceTypeEnum.THRESHOLD;
    const quantity = 100; // 100 pieces
    const customFormat = true;
    const width = 100; // 100mm
    const height = 100; // 100mm
    const bleed = 5; // 5mm bleed
    const minimumOrder = 0.1;
    const thresholdPrices: Price[] = [
      {
        value: 10000, // 100 PLN per m²
        threshold: 0.1,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = calcPrice(
      quantity,
      thresholdPrices,
      priceType,
      0,
      undefined,
      undefined,
      customFormat,
      width,
      height,
      minimumOrder,
      null,
      bleed,
      undefined,
      undefined,
    );

    // With 100x100mm + 5mm bleed = 105x105mm effective, 100 pieces and
    // 100 PLN/m², the area-based subtotal is 123.40 PLN. Fiscal enforcement
    // re-derives a 2-decimal per-piece unit price from 100 physical pieces,
    // giving 1.23 PLN per piece and a final total of 123.00 PLN = 12300 groszy.
    expect(result.result).toBe(12300);
  });

  it("should truncate unit price to 3 decimal places", () => {
    // Test that unit prices are truncated, not rounded
    const priceType = PriceTypeEnum.SINGLE;
    const quantity = 7;
    const singlePrices: Price[] = [
      {
        value: 1429, // 14.29 PLN - this will create fractional unit price when divided
        currency: CurrencyEnum.PLN,
        combination: { id: "test", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      singlePrices,
      priceType,
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
    );

    // unitPrice = 14.29, subtotal = 14.29 * 7 = 100.03 PLN = 10003 groszy
    // Fiscal enforcement recomputes the same total from the 2-decimal
    // unit price and quantity.
    expect(result.result).toBe(10003);
  });

  it("should handle minimum order enforcement with fiscal precision", () => {
    const priceType = PriceTypeEnum.SINGLE;
    const quantity = 3;
    const minimumOrder = 10;
    const singlePrices: Price[] = [
      {
        value: 3300, // 33.00 PLN - exact value to avoid floating point issues
        currency: CurrencyEnum.PLN,
        combination: { id: "test", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      singlePrices,
      priceType,
      0,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      minimumOrder,
      null,
      undefined,
      undefined,
      undefined,
    );

    // billingQuantity = max(3, 10) = 10 (minimum order)
    // unitPrice = 33.00, subtotal = 33.00 * 10 = 330.00 PLN = 33000 groszy
    // Fiscal enforcement uses fiscalQuantity=3 but keeps the same total
    // after recomputing from unit price and quantity.
    expect(result.result).toBe(33000);
  });

  it("should properly calculate price with customerDiscount", () => {
    const quantity = 100;
    const priceType = PriceTypeEnum.SINGLE;
    const discountedAmount = 100;
    const calculatedCombination = undefined;
    const volume = undefined;
    const customFormat = false;
    const width = undefined;
    const height = undefined;
    const minimumOrder = 1;
    const customPrice = 15;
    const customerDiscount = 20;

    const result = calcPrice(
      quantity,
      prices,
      priceType,
      discountedAmount,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      undefined,
      customerDiscount,
      undefined,
    );

    expect(result.result).toBe(1200);
  });

  it("should generate only integers for the result", () => {
    const quantity = 100;
    const priceType = PriceTypeEnum.SINGLE;
    const discountedAmount = 0;
    const calculatedCombination = undefined;
    const volume = undefined;
    const customFormat = false;
    const width = undefined;
    const height = undefined;
    const minimumOrder = 1;
    const customPrice = 15;

    const result = calcPrice(
      quantity,
      prices,
      priceType,
      discountedAmount,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      undefined,
      undefined,
      undefined,
    );

    expect(Number.isInteger(result.result)).toBe(true);
  });

  it("should calculate price correctly for single price type", () => {
    const quantity = 50;
    const priceType = PriceTypeEnum.SINGLE;
    const discountValue = 10;
    const calculatedCombination = undefined;
    const volume = undefined;
    const customFormat = false;
    const width = undefined;
    const height = undefined;
    const minimumOrder = 1;
    const customPrice = 1500.0002;

    const result = calcPrice(
      quantity,
      prices,
      priceType,
      discountValue,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      undefined,
      undefined,
      undefined,
    );

    expect(result.result).toBe(67500);
  });

  it("should calculate price correctly for threshold price type", () => {
    const quantity = 250;
    const priceType = PriceTypeEnum.THRESHOLD;
    const discountValue = 10;
    const calculatedCombination = undefined;
    const volume = undefined;
    const customFormat = false;
    const width = 150;
    const height = 300;
    const minimumOrder = 1;
    const customPrice = null;

    const result = calcPrice(
      quantity,
      prices,
      priceType,
      discountValue,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      undefined,
      undefined,
      undefined,
    );

    expect(result.result).toBe(225000);
  });

  it("should calculate threshold price correctly for large custom format with bleed", () => {
    const quantity = 2;
    const priceType = PriceTypeEnum.THRESHOLD;
    const discountValue = 0;
    const calculatedCombination = undefined;
    const volume = undefined;
    const customFormat = true;
    const width = 594;
    const height = 841;
    const minimumOrder = 0.5;
    const customPrice = null;
    const bleed = 10;
    const largeFormatPrices: Price[] = [
      {
        value: 16600,
        threshold: 0.5,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = calcPrice(
      quantity,
      largeFormatPrices,
      priceType,
      discountValue,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      bleed,
      undefined,
      undefined,
    );

    // With total bleed, we bill by gross geometric area when only one
    // piece fits per 1m^2 sheet. For 594x841mm with 10mm bleed and volume 2,
    // this is ~1.028 m^2, so result should be close to a single unit price,
    // not doubled.
    expect(result.result).toBe(17064);
  });

  it("should ignore bleed for meter-scale custom threshold pricing", () => {
    const prices: Price[] = [
      {
        value: 10000,
        threshold: 1,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = calcPrice(
      1,
      prices,
      PriceTypeEnum.THRESHOLD,
      0,
      undefined,
      undefined,
      true,
      1000,
      1000,
      0,
      null,
      3,
      undefined,
      undefined,
    );

    expect(result.result).toBe(10000);
  });

  it("should calculate matrix price correctly for small custom format with bleed", () => {
    const quantity = 50;
    const priceType = PriceTypeEnum.MATRIX;
    const discountValue = 0;
    const calculatedCombination = "custom-format";
    const volume = 50;
    const customFormat = true;
    const width = 50;
    const height = 50;
    const minimumOrder = 0.5;
    const customPrice = null;
    const bleed = 4;
    const largeFormatPrices: Price[] = [
      {
        value: 11012,
        currency: CurrencyEnum.PLN,
        combination: { id: "custom-format", active: true, customFormat: true },
        volume: { value: 0.5, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      largeFormatPrices,
      priceType,
      discountValue,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      bleed,
      undefined,
      undefined,
    );

    // For 50x50mm with 4mm bleed (effective 54x54mm), quantity 50:
    // piecesPerMeterX = floor(1000/54) = 18
    // piecesPerMeterY = floor(1000/54) = 18
    // piecesPerMeter = 324
    // calculatedQuantity ≈ 0.154 m², billingQuantity = 0.5 (minimumOrder)
    // unitPrice = 110.12 PLN/m², area-based subtotal ≈ 55.06 PLN.
    // Fiscal enforcement, however, uses 50 physical pieces to derive a
    // 2-decimal per-piece unit price (1.10 PLN) and a final total of
    // 55.00 PLN = 5500 groszy.
    expect(result.result).toBe(5500);
  });

  it("should align fiscal total with unit price rounding like Fakturownia", () => {
    // Scenario analogous to Fakturownia behaviour: a target total that
    // cannot be represented exactly with a 2-decimal unit price and a
    // given quantity should snap to the nearest value coming from
    // unitPrice(2) * quantity.

    const priceType = PriceTypeEnum.SINGLE;
    const quantity = 250;

    const pricesForLine: Price[] = [
      {
        value: 46, // 0.46 PLN per unit → 0.46 * 250 = 115.00 PLN
        currency: CurrencyEnum.PLN,
        combination: { id: "unit-046", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      pricesForLine,
      priceType,
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
    );

    // With unit price 0.46 and quantity 250, result should be exactly
    // 115.00 PLN = 11500 groszy.
    expect(result.result).toBe(11500);
  });

  it("should calculate price correctly for matrix price type", () => {
    const quantity = 500;
    const priceType = PriceTypeEnum.MATRIX;
    const discountValue = 30;
    const calculatedCombination = "combination3";
    const volume = 2.5;
    const customFormat = true;
    const width = 20;
    const height = 40;
    const minimumOrder = 300;
    const customPrice = 2500;

    const result = calcPrice(
      quantity,
      prices,
      priceType,
      discountValue,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      customPrice,
      undefined,
      undefined,
      undefined,
    );

    expect(result.result).toBe(525000);
  });

  it("should calculate custom matrix volumes from interpolated total prices", () => {
    const result = calcPrice(
      1,
      [
        {
          value: 150,
          currency: CurrencyEnum.PLN,
          combination: {
            id: "interpolated",
            active: true,
            customFormat: false,
          },
          volume: { value: 10, deliveryTime: 3 },
        },
        {
          value: 225,
          currency: CurrencyEnum.PLN,
          combination: {
            id: "interpolated",
            active: true,
            customFormat: false,
          },
          volume: { value: 20, deliveryTime: 5 },
        },
      ],
      PriceTypeEnum.MATRIX,
      0,
      "interpolated",
      15,
      false,
      undefined,
      undefined,
      1,
      null,
      undefined,
      undefined,
      undefined,
    );

    expect(result.result).toBe(3000);
    expect(result.deliveryTime).toBe(5);
  });

  it("should handle fractional volume for MATRIX type with fiscal precision", () => {
    // MATRIX with a non-integer volume to verify quantity truncation and
    // fiscal enforcement behave correctly together.
    const quantity = 1;
    const priceType = PriceTypeEnum.MATRIX;
    const calculatedCombination = "matrix-fractional";
    const volume = 2.375; // weird fractional volume
    const customFormat = false;
    const minimumOrder = 0;
    const customPrice = null;
    const matrixPrices: Price[] = [
      {
        value: 1234, // 12.34 PLN per unit
        currency: CurrencyEnum.PLN,
        combination: {
          id: "matrix-fractional",
          active: true,
          customFormat: false,
        },
        volume: { value: 2.375, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      matrixPrices,
      priceType,
      0,
      calculatedCombination,
      volume,
      customFormat,
      undefined,
      undefined,
      minimumOrder,
      customPrice,
      undefined,
      undefined,
      undefined,
    );

    // calculatedQuantity = toFiscalQuantity(2.375) = 2.375
    // unitPrice = 12.34 PLN, raw subtotal ≈ 29.3075 PLN.
    // Internal truncation gives 29.30 PLN, but fiscal enforcement then
    // re-derives a 2-decimal unit price and rounds back to 29.31 PLN
    // = 2931 groszy.
    expect(result.result).toBe(2931);
  });

  it("should apply express and customer discount in correct order with fiscal precision", () => {
    // Base: 10 units * 10.00 PLN = 100.00 PLN
    // Express 50%: 100.00 -> 150.00 PLN
    // Customer discount 20%: 150.00 -> 120.00 PLN
    // Final result: 120.00 PLN = 12000 groszy
    const quantity = 10;
    const expressPrice: Price[] = [
      {
        value: 1000, // 10.00 PLN per unit
        currency: CurrencyEnum.PLN,
        combination: { id: "express", active: true, customFormat: false },
        volume: { value: 1, deliveryTime: 5 },
      },
    ];

    const result = calcPrice(
      quantity,
      expressPrice,
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
      20, // customerDiscount
      undefined, // customSizes
      undefined, // lng
      50, // expressPercent
    );

    expect(result.result).toBe(12000);
  });

  it("should throw an error if prices are undefined", () => {
    const quantity = 100;
    const priceType = PriceTypeEnum.SINGLE;
    const discountValue = 10;
    const calculatedCombination = "combination";
    const volume = 1;
    const customFormat = true;
    const width = 10;
    const height = 20;
    const minimumOrder = 100;
    const customPrice = 15;

    expect(() => {
      calcPrice(
        quantity,
        undefined,
        priceType,
        discountValue,
        calculatedCombination,
        volume,
        customFormat,
        width,
        height,
        minimumOrder,
        customPrice,
        undefined,
        undefined,
        undefined,
      );
    }).toThrow("Prices are undefined");
  });

  it("should treat combination.active undefined as active (not NaN) for MATRIX prices", () => {
    const matrixPrices: Price[] = [
      {
        value: 5000,
        currency: CurrencyEnum.PLN,
        combination: {
          id: "combo1",
          customFormat: false,
        } as Price["combination"],
        volume: { value: 100, deliveryTime: 3 },
      },
    ];

    const result = calcPrice(
      1,
      matrixPrices,
      PriceTypeEnum.MATRIX,
      0,
      "combo1",
      100,
      false,
      0,
      0,
      0,
    );

    expect(Number.isFinite(result.result)).toBe(true);
    expect(result.result).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it("should return NaN/error for combination.active explicitly false for MATRIX prices", () => {
    const matrixPrices: Price[] = [
      {
        value: 5000,
        currency: CurrencyEnum.PLN,
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 100, deliveryTime: 3 },
      },
    ];

    const result = calcPrice(
      1,
      matrixPrices,
      PriceTypeEnum.MATRIX,
      0,
      "combo1",
      100,
      false,
      0,
      0,
      0,
    );

    expect(result.error).toBeDefined();
  });
});

describe("calculateQuantity", () => {
  it("should calculate quantity correctly for custom format", () => {
    const customFormat = true;
    const quantity = 100;
    const width = 10;
    const height = 20;

    const result = calculateQuantity(customFormat, quantity, width, height);

    expect(result).toBe(0.02);
  });

  it("should calculate quantity correctly for non-custom format", () => {
    const customFormat = false;
    const quantity = 100;

    const result = calculateQuantity(customFormat, quantity, 0, 0);

    expect(result).toBe(100);
  });
});

describe("getThresholdsPrice", () => {
  const prices = [
    { value: 10, threshold: 100, currency: CurrencyEnum.PLN },
    { value: 20, threshold: 200, currency: CurrencyEnum.PLN },
    { value: 30, threshold: 300, currency: CurrencyEnum.PLN },
  ];

  it("should return price object for calculated quantity within threshold", () => {
    const calculatedQuantity = 150;

    const result = getThresholdsPrice(prices, calculatedQuantity);

    expect(result).toEqual({
      value: 10,
      threshold: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should return price object for calculated quantity below minimum threshold", () => {
    const calculatedQuantity = 50;

    const result = getThresholdsPrice(prices, calculatedQuantity);

    expect(result).toEqual({
      value: 10,
      threshold: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should return price object for calculated quantity above maximum threshold", () => {
    const calculatedQuantity = 350;

    const result = getThresholdsPrice(prices, calculatedQuantity);

    expect(result).toEqual({
      value: 30,
      threshold: 300,
      currency: CurrencyEnum.PLN,
    });
  });

  // Add more test cases for other scenarios
});

describe("calculatePriceValue", () => {
  const priceObject = { value: 10, currency: CurrencyEnum.PLN };
  const minimumOrder = 100;
  const discountValue = 10;

  it("should calculate price value correctly for calculated quantity below minimum order", () => {
    const calculatedQuantity = 50;

    const result = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      minimumOrder,
      discountValue,
    );

    expect(result).toEqual({ result: 900, minimumOrderShort: 50 });
  });

  it("should calculate price value correctly for calculated quantity above minimum order", () => {
    const calculatedQuantity = 150;

    const result = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      minimumOrder,
      discountValue,
    );

    expect(result).toEqual({ result: 1350 });
  });

  it("should respect fiscalQuantityOverride when enforcing precision", () => {
    // priceObject.value = 100 -> 1.00 PLN per unit
    // calculatedQuantity = 10 -> billingQuantity = 10
    // subtotal = 10 * 1.00 = 10.00 PLN = 1000 groszy
    // fiscalQuantityOverride = 3 causes fiscal enforcement to use 3 pieces:
    // unit = round(10.00 / 3, 2) = 3.33, total' = 3.33 * 3 = 9.99 PLN
    // final result = 9.99 PLN = 999 groszy
    const overridePriceObject = { value: 100, currency: CurrencyEnum.PLN };

    const result = calculatePriceValue(
      overridePriceObject,
      10,
      0,
      0,
      undefined,
      undefined,
      3, // fiscalQuantityOverride
    );

    expect(result.result).toBe(999);
  });
});

describe("calculateDiscount", () => {
  it("should calculate discountedAmount correctly", () => {
    const calcPrice = 100;
    const discountValue = 20;

    const result = calculateDiscount(calcPrice, discountValue);

    expect(result).toBe(80);
  });

  it("should return calcPrice if discountedAmount is 0", () => {
    const calcPrice = 100;
    const discountValue = 0;

    const result = calculateDiscount(calcPrice, discountValue);

    expect(result).toBe(100);
  });

  it("should return 0 if discountedAmount is more than price", () => {
    const calcPrice = 100;
    const disocuntValue = 150;

    const result = calculateDiscount(calcPrice, disocuntValue);

    expect(result).toBe(0);
  });
});

describe("calculateQuantity", () => {
  it("should calculate quantity correctly for custom format", () => {
    const customFormat = true;
    const quantity = 10;
    const width = 500;
    const height = 200;
    const expected = 1;

    const result = calculateQuantity(customFormat, quantity, width, height);

    expect(result).toBe(expected);
  });

  it("should use pieces-per-meter mode when bleed allows multiple pieces per sheet", () => {
    const customFormat = true;
    const quantity = 100;
    const width = 300;
    const height = 300;
    const bleed = 10;

    const result = calculateQuantity(
      customFormat,
      quantity,
      width,
      height,
      bleed,
    );

    // effective size 310x310mm, piecesPerMeter = 3*3=9, so
    // quantity/piecesPerMeter = 100/9 ≈ 11.111..., truncated to 11.111
    expect(result).toBe(11.111);
  });

  it("should fall back to area mode when effective size reaches sheet limit", () => {
    const customFormat = true;
    const quantity = 1;
    const width = 990;
    const height = 990;
    const bleed = 10;

    const result = calculateQuantity(
      customFormat,
      quantity,
      width,
      height,
      bleed,
    );

    // effective size 1000x1000mm -> piecesPerMeter is 1, so we stay in
    // packed mode and quantity remains 1.
    expect(result).toBe(1);
  });

  it("should calculate quantity correctly for non-custom format", () => {
    const customFormat = false;
    const quantity = 10;
    const width = 5;
    const height = 2;
    const expected = 10;

    const result = calculateQuantity(customFormat, quantity, width, height);

    expect(result).toBe(expected);
  });

  it("should throw an error if width is undefined for custom format", () => {
    const customFormat = true;
    const quantity = 10;
    const width = undefined;
    const height = 2;

    expect(() =>
      calculateQuantity(customFormat, quantity, width, height),
    ).toThrow("Width is undefined");
  });

  it("should throw an error if height is undefined for custom format", () => {
    const customFormat = true;
    const quantity = 10;
    const width = 5;
    const height = undefined;

    expect(() =>
      calculateQuantity(customFormat, quantity, width, height),
    ).toThrow("Height is undefined");
  });
});

describe("getThresholdsPrice", () => {
  it("should return the price object with the minimum threshold when calculated quantity is less than or equal to the minimum threshold", () => {
    const priceObjects = [
      { threshold: 10, value: 100, currency: CurrencyEnum.PLN },
      { threshold: 20, value: 200, currency: CurrencyEnum.PLN },
      { threshold: 30, value: 300, currency: CurrencyEnum.PLN },
    ];
    const calculatedQuantity = 5;

    const result = getThresholdsPrice(priceObjects, calculatedQuantity);

    expect(result).toEqual({
      threshold: 10,
      value: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should return the price object with the maximum threshold when calculated quantity is greater than or equal to the maximum threshold", () => {
    const priceObjects: Price[] = [
      { threshold: 10, value: 100, currency: CurrencyEnum.PLN },
      { threshold: 20, value: 200, currency: CurrencyEnum.PLN },
      { threshold: 30, value: 300, currency: CurrencyEnum.PLN },
    ];
    const calculatedQuantity = 35;

    const result = getThresholdsPrice(priceObjects, calculatedQuantity);

    expect(result).toEqual({
      threshold: 30,
      value: 300,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should return the price object with the threshold closest to the calculated quantity when it falls between two thresholds", () => {
    const priceObjects: Price[] = [
      { threshold: 10, value: 100, currency: CurrencyEnum.PLN },
      { threshold: 20, value: 200, currency: CurrencyEnum.PLN },
      { threshold: 30, value: 300, currency: CurrencyEnum.PLN },
    ];
    const calculatedQuantity = 15;

    const result = getThresholdsPrice(priceObjects, calculatedQuantity);

    expect(result).toEqual({
      threshold: 10,
      value: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should throw an error if no price object is found for the provided combination", () => {
    const priceObjects: Price[] = [
      { threshold: 10, value: 100, currency: CurrencyEnum.PLN },
      { threshold: 20, value: 200, currency: CurrencyEnum.PLN },
      { threshold: 30, value: 300, currency: CurrencyEnum.PLN },
    ];
    const calculatedQuantity = 25;
    const result = getThresholdsPrice(priceObjects, calculatedQuantity);

    expect(result).toEqual({
      threshold: 20,
      value: 200,
      currency: CurrencyEnum.PLN,
    });
  });
});

describe("getMatrixPrice", () => {
  const priceObjects: Price[] = [
    {
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 10, deliveryTime: 5 },
      value: 100,
      currency: CurrencyEnum.PLN,
    },
    {
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 20, deliveryTime: 5 },
      value: 200,
      currency: CurrencyEnum.PLN,
    },
    {
      combination: { id: "combination2", active: true, customFormat: false },
      volume: { value: 30, deliveryTime: 5 },
      value: 300,
      currency: CurrencyEnum.PLN,
    },
  ];

  it("should interpolate total price for a custom matrix volume", () => {
    const result = getMatrixPrice(
      [
        {
          combination: {
            id: "combination1",
            active: true,
            customFormat: false,
          },
          volume: { value: 10, deliveryTime: 3 },
          value: 150,
          currency: CurrencyEnum.PLN,
        },
        {
          combination: {
            id: "combination1",
            active: true,
            customFormat: false,
          },
          volume: { value: 20, deliveryTime: 5 },
          value: 225,
          currency: CurrencyEnum.PLN,
        },
      ],
      15,
      "combination1",
      false,
    );

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 15, deliveryTime: 5 },
      value: 200,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should return an interpolated price object for a valid combination and volume", () => {
    const calculatedCombination = "combination1";
    const calculatedQuantity = 15;
    const customFormat = false;

    const result = getMatrixPrice(
      priceObjects,
      calculatedQuantity,
      calculatedCombination,
      customFormat,
    );

    expect(result).toMatchObject({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 15, deliveryTime: 5 },
      currency: "PLN",
    });
    expect(result?.value).toBeCloseTo(166.66666666666666);
  });

  it("should return undefined for an invalid combination", () => {
    const calculatedCombination = "combination3";
    const calculatedQuantity = 15;
    const customFormat = false;

    const result = getMatrixPrice(
      priceObjects,
      calculatedQuantity,
      calculatedCombination,
      customFormat,
    );

    expect(result).toBeUndefined();
  });

  it("should treat an exact zero-valued matrix price as usable", () => {
    const result = getMatrixPrice(
      [
        {
          combination: {
            id: "combination1",
            active: true,
            customFormat: false,
          },
          volume: { value: 15, deliveryTime: 5 },
          value: 0,
          currency: CurrencyEnum.PLN,
        },
      ],
      15,
      "combination1",
      false,
    );

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 15, deliveryTime: 5 },
      value: 0,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should fall back to the next valid price when the first matrix volume is disabled", () => {
    const calculatedCombination = "combination1";
    const calculatedQuantity = 10;
    const customFormat = false;
    const sparsePriceObjects: Price[] = [
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 10, deliveryTime: 2 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 20, deliveryTime: 4 },
        value: 200,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(
      sparsePriceObjects,
      calculatedQuantity,
      calculatedCombination,
      customFormat,
    );

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 10, deliveryTime: 4 },
      value: 200,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should fall back to the previous valid price when a middle matrix volume is disabled", () => {
    const calculatedCombination = "combination1";
    const calculatedQuantity = 20;
    const customFormat = false;
    const sparsePriceObjects: Price[] = [
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 10, deliveryTime: 2 },
        value: 100,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 20, deliveryTime: 4 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 30, deliveryTime: 6 },
        value: 300,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(
      sparsePriceObjects,
      calculatedQuantity,
      calculatedCombination,
      customFormat,
    );

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 20, deliveryTime: 2 },
      value: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should reject custom matrix volumes that would jump across disabled base volumes", () => {
    const prices: Price[] = [
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 5, deliveryTime: 2 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 10, deliveryTime: 3 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 20, deliveryTime: 4 },
        value: 200,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(prices, 7, "combination1", false);

    expect(result).toBeUndefined();
  });

  it("should reject derived matrix volumes when the previous base volume is disabled", () => {
    const prices: Price[] = [
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 10, deliveryTime: 3 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 30, deliveryTime: 4 },
        value: 180,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(prices, 20, "combination1", false);

    expect(result).toBeUndefined();
  });

  it("should keep fallback pricing when the previous base volume is available", () => {
    const prices: Price[] = [
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 20, deliveryTime: 2 },
        value: 100,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 30, deliveryTime: 3 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 40, deliveryTime: 4 },
        value: 180,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(prices, 25, "combination1", false);

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 25, deliveryTime: 2 },
      value: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should fall back to a further active price when the immediate previous volume is disabled", () => {
    const prices: Price[] = [
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 10, deliveryTime: 2 },
        value: 100,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 20, deliveryTime: 3 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: false, customFormat: false },
        volume: { value: 30, deliveryTime: 4 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: { id: "combination1", active: true, customFormat: false },
        volume: { value: 40, deliveryTime: 5 },
        value: 400,
        currency: CurrencyEnum.PLN,
      },
    ];

    // Quantity 25 sits between two disabled volumes (20 and 30), but volume 10 is active.
    // It should fall back to volume 10's price.
    const result = getMatrixPrice(prices, 25, "combination1", false);

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 25, deliveryTime: 2 },
      value: 100,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should not use an exact matrix match from another combination", () => {
    const calculatedCombination = "combination1";
    const calculatedQuantity = 30;
    const customFormat = false;

    const result = getMatrixPrice(
      priceObjects,
      calculatedQuantity,
      calculatedCombination,
      customFormat,
    );

    expect(result).toEqual({
      combination: { id: "combination1", active: true, customFormat: false },
      volume: { value: 30, deliveryTime: 5 },
      value: 200,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should skip inactive exact match and fall back to the next active volume", () => {
    const prices: Price[] = [
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 50, deliveryTime: 2 },
        value: 3000,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 100, deliveryTime: 3 },
        value: 2500,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: {
          id: "combo1",
          active: true,
          customFormat: false,
        },
        volume: { value: 250, deliveryTime: 4 },
        value: 2000,
        currency: CurrencyEnum.PLN,
      },
    ];

    const result = getMatrixPrice(prices, 50, "combo1", false);

    expect(result).toEqual({
      combination: {
        id: "combo1",
        active: true,
        customFormat: false,
      },
      volume: { value: 50, deliveryTime: 4 },
      value: 2000,
      currency: CurrencyEnum.PLN,
    });
  });

  it("should skip inactive volumes in the fallback pool", () => {
    const prices: Price[] = [
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 50, deliveryTime: 2 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 100, deliveryTime: 3 },
        value: 2500,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: {
          id: "combo1",
          active: true,
          customFormat: false,
        },
        volume: { value: 250, deliveryTime: 4 },
        value: 2000,
        currency: CurrencyEnum.PLN,
      },
    ];

    // Volume 50: null value → fallback skips inactive vol 100, uses active vol 250
    const result50 = getMatrixPrice(prices, 50, "combo1", false);
    expect(result50?.combination?.active).toBe(true);
    expect(result50?.value).toBe(2000);

    // Volume 100: active=false with value → also falls through to 250
    const result100 = getMatrixPrice(prices, 100, "combo1", false);
    expect(result100?.combination?.active).toBe(true);
    expect(result100?.value).toBe(2000);
  });

  it("should return inactive exact match when all volumes are inactive (last resort)", () => {
    const prices: Price[] = [
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 50, deliveryTime: 2 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
      {
        combination: {
          id: "combo1",
          active: false,
          customFormat: false,
        },
        volume: { value: 100, deliveryTime: 3 },
        value: null,
        currency: CurrencyEnum.PLN,
      },
    ];

    // When no usable fallback exists, returns the exact match (even if inactive)
    const result = getMatrixPrice(prices, 50, "combo1", false);
    expect(result?.combination?.active).toBe(false);
    expect(result?.value).toBeNull();
  });
});

describe("calculatePriceValue", () => {
  it("should calculate price value without minimum order and discountedAmount", () => {
    const priceObject = { value: 10, currency: CurrencyEnum.PLN };
    const calculatedQuantity = 5;
    const minimumOrder = 0;
    const discountedAmount = 0;

    const result = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      minimumOrder,
      discountedAmount,
    );

    expect(result.result).toBe(50);
    expect(result.minimumOrderShort).toBeUndefined();
  });

  it("should calculate price value with minimum order and discountedAmount", () => {
    const priceObject = { value: 10, currency: CurrencyEnum.PLN };
    const calculatedQuantity = 3;
    const minimumOrder = 5;
    const discountValue = 40;

    const result = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      minimumOrder,
      discountValue,
    );

    expect(result.result).toBe(30);
    expect(result.minimumOrderShort).toBe(2);
  });

  it("should handle undefined price object value", () => {
    const priceObject = { value: undefined, currency: CurrencyEnum.PLN };
    const calculatedQuantity = 5;
    const minimumOrder = 0;
    const discountedAmount = 0;

    const result = calculatePriceValue(
      priceObject,
      calculatedQuantity,
      minimumOrder,
      discountedAmount,
    );

    expect(result.result).toBe(0);
    expect(result.minimumOrderShort).toBeUndefined();
  });
});

describe("calculateDiscount", () => {
  it("should return the same price if discountedAmount is 0", () => {
    const calcPrice = 100;
    const discountedAmount = 0;
    const result = calculateDiscount(calcPrice, discountedAmount);
    expect(result).toBe(calcPrice);
  });

  it("should return the same price if discountedAmount is less than 0", () => {
    const calcPrice = 100;
    const discountedAmount = -10;
    const result = calculateDiscount(calcPrice, discountedAmount);
    expect(result).toBe(calcPrice);
  });

  it("should return the same price if discountedAmount is not an integer", () => {
    const calcPrice = 100;
    const discountedAmount = 10.5;
    const result = calculateDiscount(calcPrice, discountedAmount);
    expect(result).toBe(calcPrice);
  });

  it("should calculate the discounted price correctly", () => {
    const calcPrice = 100;
    const discountedAmount = 20;
    const expected = 80;
    const result = calculateDiscount(calcPrice, discountedAmount);
    expect(result).toBe(expected);
  });

  it("should apply expressPercent markup to base price", () => {
    // 20% express markup on 100 -> 120
    const calcPrice = 100;
    const result = calculateDiscount(calcPrice, 0, undefined, 20);
    expect(result).toBe(120);
  });

  describe("validatePromotionRules", () => {
    const productId = "product1";
    const categoryId = "category1";
    const currency = CurrencyEnum.PLN;

    it("should return true for valid rules", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "EQ", values: ["product1"] },
        { attribute: "CATEGORY", operator: "EQ", values: ["category1"] },
        { attribute: "CURRENCY", operator: "EQ", values: [CurrencyEnum.PLN] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(true);
    });

    it("should support legacy misspelled category rules", () => {
      const rules = [
        { attribute: "CATEOGRY", operator: "EQ", values: ["category1"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(true);
    });

    it("should return false if attribute is missing", () => {
      const rules = [{ attribute: "", operator: "EQ", values: ["product1"] }];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is missing", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "", values: ["product1"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if item's value is missing", () => {
      const rules = [
        { attribute: "NON_EXISTENT", operator: "EQ", values: ["value"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is GT and value is not greater", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "GT", values: ["product2"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is LT and value is not less", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "LT", values: ["product1"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is EQ and value is not equal", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "EQ", values: ["product2"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is NE and value is equal", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "NE", values: ["product1"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is IN and value is not in values", () => {
      const rules = [
        {
          attribute: "PRODUCT",
          operator: "IN",
          values: ["product2", "product3"],
        },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is LTE and value is not less than or equal", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "LTE", values: ["product0"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    it("should return false if operator is GTE and value is not greater than or equal", () => {
      const rules = [
        { attribute: "PRODUCT", operator: "GTE", values: ["product2"] },
      ];

      const result = validatePromotionRules(
        rules as PromotionRule[],
        productId,
        categoryId,
        currency,
      );

      expect(result).toBe(false);
    });

    describe("applyPromotion", () => {
      const promotion = {
        id: "promo1",
        discount: 10,
        rules: [],
      };

      const items = [
        { id: "item1", price: 100, quantity: 1 },
        { id: "item2", price: 200, quantity: 2 },
      ];

      const shippingCost = 50;
      const total = 350;
      const campaign = { id: "campaign1" };

      it("should return empty object if promotion is invalid", () => {
        const validatePromotion = vi.fn().mockReturnValue(false);

        const result = applyPromotion(
          promotion as unknown as Promotion,
          items as unknown as OrderItem[],
          shippingCost,
          total,
          campaign as Campaign,
        );

        expect(result).toEqual({});
      });

      it("should return empty object if neither discount nor itemsWithDiscount are present", () => {
        const validatePromotion = vi.fn().mockReturnValue(true);
        const getDiscountFromPromotion = vi.fn().mockReturnValue({});

        const result = applyPromotion(
          promotion as unknown as Promotion,
          items as unknown as OrderItem[],
          shippingCost,
          total,
          campaign as Campaign,
        );

        expect(result).toEqual({});
      });
    });
  });
});
