import {
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  Unit,
} from "@konfi/types";
import {
  getQuantityOption,
  getQuantityOptions,
} from "../../getters/get-quantity-options";
import { describe, expect, it } from "vitest";

describe("getQuantityOptions", () => {
  const matrixPrices: Price[] = [
    {
      value: null,
      combination: {
        id: "combo-1",
        active: false,
        customFormat: false,
      },
      volume: { value: 100, deliveryTime: 2 },
      currency: CurrencyEnum.PLN,
    },
    {
      value: 2400,
      combination: {
        id: "combo-1",
        active: true,
        customFormat: false,
      },
      volume: { value: 200, deliveryTime: 4 },
      currency: CurrencyEnum.PLN,
    },
  ];
  const trailingDisabledMatrixPrices: Price[] = [
    {
      value: 1200,
      combination: {
        id: "combo-1",
        active: true,
        customFormat: false,
      },
      volume: { value: 100, deliveryTime: 2 },
      currency: CurrencyEnum.PLN,
    },
    {
      value: null,
      combination: {
        id: "combo-1",
        active: false,
        customFormat: false,
      },
      volume: { value: 200, deliveryTime: 4 },
      currency: CurrencyEnum.PLN,
    },
  ];

  it("marks inactive base matrix volumes as disabled", () => {
    const options = getQuantityOptions(
      [
        { value: 100, printType: PrintingMethod.DIGITAL },
        { value: 200, printType: PrintingMethod.OFFSET },
      ],
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      matrixPrices,
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(options[0]).toMatchObject({
      value: "100",
      disabled: true,
      totalPrice: undefined,
      deliveryTime: undefined,
    });
    expect(options[1]).toMatchObject({
      value: "200",
      disabled: false,
      deliveryTime: 4,
    });
    expect(options[1]?.totalPrice).toBeGreaterThan(0);
  });

  it("keeps custom matrix fallback volumes selectable when the previous base volume is available", () => {
    const option = getQuantityOption(
      150,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      trailingDisabledMatrixPrices,
      0,
      0,
      null,
      Unit.PCS,
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(option).toEqual(
      expect.objectContaining({
        value: "150",
        disabled: false,
      }),
    );
    expect(option.totalPrice).toBeGreaterThan(0);
    expect(option.deliveryTime).toBe(2);
  });

  it("disables custom matrix fallback volumes that sit below a disabled base volume", () => {
    const option = getQuantityOption(
      50,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      matrixPrices,
      0,
      0,
      null,
      Unit.PCS,
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(option).toMatchObject({
      value: "50",
      disabled: true,
      totalPrice: undefined,
      deliveryTime: undefined,
    });
  });

  it("disables custom matrix fallback volumes when the previous base volume is disabled", () => {
    const option = getQuantityOption(
      150,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      matrixPrices,
      0,
      0,
      null,
      Unit.PCS,
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(option).toMatchObject({
      value: "150",
      disabled: true,
      totalPrice: undefined,
      deliveryTime: undefined,
    });
  });

  it("keeps base matrix volumes selectable when the previous base volume is available", () => {
    const options = getQuantityOptions(
      [
        { value: 150, printType: PrintingMethod.DIGITAL },
        { value: 200, printType: PrintingMethod.OFFSET },
      ],
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      trailingDisabledMatrixPrices,
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(options[0]).toMatchObject({
      value: "150",
      disabled: false,
      deliveryTime: 2,
    });
    expect(options[0]?.totalPrice).toBeGreaterThan(0);
  });

  it("keeps dynamic zero-price volumes selectable when the price resolves locally", () => {
    const option = getQuantityOption(
      100,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.DYNAMIC,
      false,
      1,
      undefined,
      "combo-1",
      [
        {
          value: 0,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          volume: { value: 100, deliveryTime: 2 },
          currency: CurrencyEnum.PLN,
        },
      ],
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "100",
      disabled: false,
      totalPrice: 0,
      deliveryTime: 2,
      priceThreshold: {
        value: 100,
        unitPrice: 0,
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        tierCount: 1,
      },
    });
  });

  it("exposes matrix volume price thresholds on available options", () => {
    const options = getQuantityOptions(
      [
        { value: 100, printType: PrintingMethod.DIGITAL },
        { value: 200, printType: PrintingMethod.OFFSET },
      ],
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      matrixPrices,
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(options[0]?.priceThreshold).toBeUndefined();
    expect(options[1]?.priceThreshold).toMatchObject({
      value: 200,
      unitPrice: 2400,
      currency: CurrencyEnum.PLN,
      unit: Unit.PCS,
      tierCount: 1,
      tiers: [
        {
          value: 200,
          unitPrice: 2400,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
        },
      ],
    });
  });

  it("exposes the next matrix volume tier for derived quantities", () => {
    const option = getQuantityOption(
      150,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      [
        {
          value: 1000,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          volume: { value: 100, deliveryTime: 2 },
          currency: CurrencyEnum.PLN,
        },
        {
          value: 900,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          volume: { value: 200, deliveryTime: 4 },
          currency: CurrencyEnum.PLN,
        },
      ],
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "150",
      disabled: false,
      priceThreshold: {
        next: {
          value: 200,
          unitPrice: 900,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
          remainingQuantity: 50,
        },
        tierCount: 2,
      },
    });
  });

  it("exposes threshold price tiers for non-exact quantity options", () => {
    const option = getQuantityOption(
      150,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.THRESHOLD,
      false,
      1,
      undefined,
      undefined,
      [
        { value: 1000, threshold: 100, currency: CurrencyEnum.PLN },
        { value: 900, threshold: 200, currency: CurrencyEnum.PLN },
      ],
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "150",
      disabled: false,
      priceThreshold: {
        value: 100,
        unitPrice: 1000,
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        next: {
          value: 200,
          unitPrice: 900,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
          remainingQuantity: 50,
        },
        tierCount: 2,
        tiers: [
          {
            value: 100,
            unitPrice: 1000,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
          },
          {
            value: 200,
            unitPrice: 900,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
          },
        ],
      },
    });
  });

  it("exposes all threshold tiers for matrix products with threshold-shaped prices and one volume", () => {
    const option = getQuantityOption(
      1,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      true,
      1,
      undefined,
      "combo-1",
      [
        {
          value: 237,
          threshold: 50,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
        },
        {
          value: 124,
          threshold: 100,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
        },
        {
          value: 55,
          threshold: 250,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
        },
      ],
      1000,
      1000,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "1",
      disabled: false,
      priceThreshold: {
        value: 50,
        unitPrice: 237,
        unit: Unit.M2,
        tierCount: 3,
        tiers: [
          {
            value: 50,
            unitPrice: 237,
            currency: CurrencyEnum.PLN,
            unit: Unit.M2,
          },
          {
            value: 100,
            unitPrice: 124,
            currency: CurrencyEnum.PLN,
            unit: Unit.M2,
          },
          {
            value: 250,
            unitPrice: 55,
            currency: CurrencyEnum.PLN,
            unit: Unit.M2,
          },
        ],
      },
    });
  });

  it("exposes dynamic resolved volume tiers as price thresholds", () => {
    const option = getQuantityOption(
      250,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.DYNAMIC,
      false,
      1,
      undefined,
      "combo-1",
      [
        {
          value: 850,
          combination: {
            id: "combo-1",
            active: true,
            customFormat: false,
          },
          volume: { value: 250, deliveryTime: 3 },
          currency: CurrencyEnum.PLN,
        },
      ],
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "250",
      disabled: false,
      priceThreshold: {
        value: 250,
        unitPrice: 850,
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        tierCount: 1,
      },
    });
  });

  it("does not expose price thresholds for unresolved options", () => {
    const option = getQuantityOption(
      100,
      PrintingMethod.DIGITAL,
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      [],
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(option).toMatchObject({
      value: "100",
      disabled: true,
      priceThreshold: undefined,
    });
  });

  it("shows fallback price for disabled base volumes when a smaller active volume exists", () => {
    const prices: Price[] = [
      {
        value: 1000,
        combination: { id: "combo-1", active: true, customFormat: false },
        volume: { value: 1000, deliveryTime: 2 },
        currency: CurrencyEnum.PLN,
      },
      {
        value: null,
        combination: { id: "combo-1", active: false, customFormat: false },
        volume: { value: 1500, deliveryTime: 3 },
        currency: CurrencyEnum.PLN,
      },
      {
        value: null,
        combination: { id: "combo-1", active: false, customFormat: false },
        volume: { value: 2000, deliveryTime: 4 },
        currency: CurrencyEnum.PLN,
      },
      {
        value: 3000,
        combination: { id: "combo-1", active: true, customFormat: false },
        volume: { value: 2500, deliveryTime: 5 },
        currency: CurrencyEnum.PLN,
      },
    ];

    const options = getQuantityOptions(
      [
        { value: 1000, printType: PrintingMethod.DIGITAL },
        { value: 1500, printType: PrintingMethod.DIGITAL },
        { value: 2000, printType: PrintingMethod.DIGITAL },
        { value: 2500, printType: PrintingMethod.DIGITAL },
      ],
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      prices,
      0,
      0,
      null,
      Unit.PCS,
    );

    // 1000 is active — enabled
    expect(options[0]).toMatchObject({ value: "1000", disabled: false });
    expect(options[0]?.totalPrice).toBeGreaterThan(0);

    // 1500 and 2000 are disabled in the matrix but 1000 is active below them — show fallback price
    expect(options[1]).toMatchObject({ value: "1500", disabled: false });
    expect(options[1]?.totalPrice).toBeGreaterThan(0);
    expect(options[1]?.deliveryTime).toBe(2);

    expect(options[2]).toMatchObject({ value: "2000", disabled: false });
    expect(options[2]?.totalPrice).toBeGreaterThan(0);
    expect(options[2]?.deliveryTime).toBe(2);

    // 2500 is active — enabled
    expect(options[3]).toMatchObject({ value: "2500", disabled: false });
    expect(options[3]?.totalPrice).toBeGreaterThan(0);
  });

  it("disables base matrix volumes when the previous base volume is disabled", () => {
    const options = getQuantityOptions(
      [
        { value: 150, printType: PrintingMethod.DIGITAL },
        { value: 200, printType: PrintingMethod.OFFSET },
      ],
      1,
      PriceTypeEnum.MATRIX,
      false,
      1,
      undefined,
      "combo-1",
      matrixPrices,
      0,
      0,
      null,
      Unit.PCS,
    );

    expect(options[0]).toMatchObject({
      value: "150",
      disabled: true,
      totalPrice: undefined,
      deliveryTime: undefined,
    });
  });
});
