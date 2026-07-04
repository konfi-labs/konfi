import {
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  QuantityOptions,
  Unit,
} from "@konfi/types";
import * as getQuantityOptionsModule from "../../getters/get-quantity-options";
import { validateQuantityOptions } from "../../validators/validate-quantity-options";

type QuantityOption = Parameters<typeof validateQuantityOptions>[2][number];

// Mock dependencies
vi.mock("../../getters/get-quantity-options", () => ({
  getQuantityOptions: vi.fn().mockReturnValue([
    { value: "100", totalPrice: 1000 },
    { value: "200", totalPrice: 1800 },
  ]),
  getQuantityOption: vi.fn().mockImplementation((volume: number) => ({
    value: `${volume}`,
    totalPrice: volume * 10,
  })),
}));

describe("validateQuantityOptions", () => {
  const mockSetOptions = vi.fn();

  const baseQuantityOptions: QuantityOptions = {
    volumes: [
      { value: 100, printType: PrintingMethod.DIGITAL },
      { value: 200, printType: PrintingMethod.OFFSET },
    ],
    prices: [{ value: 10 } as Price],
    quantity: 1,
    priceType: PriceTypeEnum.SINGLE,
    customFormat: false,
    minimumOrder: 1,
    unit: Unit.PCS,
    volume: 100,
    width: 100,
    height: 100,
    bleed: 3,
    includeBleed: true,
    customPrice: 0,
    discount: undefined,
    calculatedCombination: null,
    customVolumes: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return prev options if quantity is undefined for SINGLE price type", () => {
    const prev = { ...baseQuantityOptions };
    const next = { quantity: undefined };
    const options: QuantityOption[] = [];

    const result = validateQuantityOptions(prev, next, options, mockSetOptions);
    expect(result).toBe(prev);
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it("should compute options for MATRIX price type even if volume is undefined (initial hydration)", () => {
    const prev = { ...baseQuantityOptions, priceType: PriceTypeEnum.MATRIX };
    const next = { volume: undefined };
    const options: QuantityOption[] = [];

    const result = validateQuantityOptions(prev, next, options, mockSetOptions);
    // Options should still be built so the caller can auto-select a volume
    expect(mockSetOptions).toHaveBeenCalled();
    expect(result).not.toBe(prev);
  });

  it("should still bail early if quantity is undefined for MATRIX price type", () => {
    const prev = { ...baseQuantityOptions, priceType: PriceTypeEnum.MATRIX };
    const next = { quantity: undefined };
    const options: QuantityOption[] = [];

    const result = validateQuantityOptions(prev, next, options, mockSetOptions);
    expect(result).toBe(prev);
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it("should return prev options if required fields are undefined", () => {
    const prev = { ...baseQuantityOptions };
    const next = { volumes: undefined };
    const options: QuantityOption[] = [];

    const result = validateQuantityOptions(prev, next, options, mockSetOptions);
    expect(result).toBe(prev);
    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it("should set options with default quantity options when no existing options", () => {
    const prev = baseQuantityOptions;
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
    ]);
  });

  it("should add custom volume option if volume exists but not in options", () => {
    const prev = { ...baseQuantityOptions, volume: 150 };
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
      { value: "150", totalPrice: 1500 },
    ]);
  });

  it("should add custom volumes from customVolumes array when volume is undefined and options are empty", () => {
    const prev = {
      ...baseQuantityOptions,
      volume: undefined,
      quantity: 150,
      customVolumes: [150],
    };
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
      { value: "150", totalPrice: 1500 },
    ]);
  });

  it("should add custom volume option when options already exist", () => {
    const prev = {
      ...baseQuantityOptions,
      priceType: PriceTypeEnum.MATRIX,
      volume: 150,
    };
    const next = {};
    const options = [
      { value: "100", totalPrice: 1000, label: "" },
      { value: "200", totalPrice: 1800, label: "" },
    ];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenCalled();
    const lastCallArgs =
      mockSetOptions.mock.calls[mockSetOptions.mock.calls.length - 1][0];
    expect(lastCallArgs).toContainEqual(
      expect.objectContaining({ value: "150", totalPrice: 1500 }),
    );
  });

  it("should assign correct print types to custom volumes based on lower threshold values", () => {
    vi.clearAllMocks();

    // Reset getQuantityOptions mock to ensure fresh state
    vi.mocked(getQuantityOptionsModule.getQuantityOptions).mockReturnValue([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
    ]);

    const prev = {
      ...baseQuantityOptions,
      volume: undefined, // Don't add current volume
      customVolumes: [150, 250],
    };
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenCalled();
    const lastCallArgs =
      mockSetOptions.mock.calls[mockSetOptions.mock.calls.length - 1][0];

    // Check that both 150 and 250 were added
    expect(lastCallArgs).toContainEqual(
      expect.objectContaining({ value: "150" }),
    );
    expect(lastCallArgs).toContainEqual(
      expect.objectContaining({ value: "250" }),
    );

    // Verify print type selection: 150 uses DIGITAL (lower threshold), 250 uses OFFSET (>=200)
    expect(getQuantityOptionsModule.getQuantityOption).toHaveBeenCalledTimes(2);

    const calls = vi.mocked(getQuantityOptionsModule.getQuantityOption).mock
      .calls;
    // First call: 150 with DIGITAL (100 is the lower threshold)
    expect(calls[0][0]).toBe(150);
    expect(calls[0][1]).toBe(PrintingMethod.DIGITAL);
    // Second call: 250 with OFFSET (200 is the lower threshold)
    expect(calls[1][0]).toBe(250);
    expect(calls[1][1]).toBe(PrintingMethod.OFFSET);
  });

  it("should filter out options with invalid total price but keep zero-priced options", () => {
    vi.spyOn(
      getQuantityOptionsModule,
      "getQuantityOptions",
    ).mockReturnValueOnce([
      {
        value: "100",
        totalPrice: 1000,
        label: "",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: 0,
        disabled: false,
      },
      {
        // A zero total price is legitimate (e.g. DYNAMIC product with base
        // price of 0 and no rules) and must remain selectable.
        value: "200",
        totalPrice: 0,
        label: "",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: 0,
        disabled: false,
      },
      {
        value: "300",
        totalPrice: undefined,
        label: "",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: 0,
        disabled: false,
      },
    ]);

    const prev = baseQuantityOptions;
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      {
        currency: CurrencyEnum.PLN,
        deliveryTime: 0,
        disabled: false,
        icon: "",
        label: "",
        totalPrice: 1000,
        unit: Unit.PCS,
        value: "100",
      },
      {
        currency: CurrencyEnum.PLN,
        deliveryTime: 0,
        disabled: false,
        icon: "",
        label: "",
        totalPrice: 0,
        unit: Unit.PCS,
        value: "200",
      },
    ]);
  });

  it("should keep disabled matrix options even when they have no total price", () => {
    vi.spyOn(
      getQuantityOptionsModule,
      "getQuantityOptions",
    ).mockReturnValueOnce([
      {
        value: "100",
        totalPrice: undefined,
        label: "100",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: undefined,
        disabled: true,
      },
      {
        value: "200",
        totalPrice: 1800,
        label: "200",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: 3,
        disabled: false,
      },
    ]);

    const prev = {
      ...baseQuantityOptions,
      priceType: PriceTypeEnum.MATRIX,
    };
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      {
        value: "100",
        totalPrice: undefined,
        label: "100",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: undefined,
        disabled: true,
      },
      {
        value: "200",
        totalPrice: 1800,
        label: "200",
        icon: "",
        currency: CurrencyEnum.PLN,
        unit: Unit.PCS,
        deliveryTime: 3,
        disabled: false,
      },
    ]);
  });

  it("should drop disabled custom matrix options without a valid price", () => {
    vi.mocked(getQuantityOptionsModule.getQuantityOptions).mockReturnValueOnce([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
    ]);
    vi.mocked(
      getQuantityOptionsModule.getQuantityOption,
    ).mockImplementationOnce(() => ({
      value: "150",
      totalPrice: undefined,
      label: "150",
      icon: "",
      currency: CurrencyEnum.PLN,
      unit: Unit.PCS,
      deliveryTime: undefined,
      disabled: true,
    }));

    const prev = {
      ...baseQuantityOptions,
      priceType: PriceTypeEnum.MATRIX,
      volume: 150,
    };
    const next = {};
    const options: QuantityOption[] = [];

    validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(mockSetOptions).toHaveBeenLastCalledWith([
      { value: "100", totalPrice: 1000 },
      { value: "200", totalPrice: 1800 },
    ]);
  });

  it("should merge prev and next options correctly", () => {
    const prev = baseQuantityOptions;
    const next = { quantity: 2 };
    const options: QuantityOption[] = [];

    const result = validateQuantityOptions(prev, next, options, mockSetOptions);

    expect(result).toEqual({
      ...baseQuantityOptions,
      quantity: 2,
    });
  });
});
