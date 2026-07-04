import {
  CleanedAttributeData,
  getProductFormPreviewInitConfiguration,
  getInitialProductFormPrices,
  ProductPreviewInitializationInput,
  ProductPriceInitializationInput,
} from "@/lib/product-form-prices";
import {
  Attribute,
  AttributeInputTypeEnum,
  Configuration,
  CurrencyEnum,
  PriceTypeEnum,
} from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";

const MEMBER = {
  id: "member-1",
  name: "Admin",
};

const TIMESTAMP = Timestamp.now();

const createAttribute = ({
  calculated = true,
  id,
  optionValues,
}: {
  calculated?: boolean;
  id: string;
  optionValues: string[];
}): Attribute => ({
  id,
  name: id,
  createdBy: MEMBER,
  createdAt: TIMESTAMP,
  updatedBy: MEMBER,
  updatedAt: TIMESTAMP,
  active: true,
  calculated,
  required: false,
  format: false,
  options: optionValues.map((value) => ({
    label: value,
    value,
    customFormat: false,
    hidden: false,
  })),
  keywords: [],
  type: AttributeInputTypeEnum.DROPDOWN,
  trackStock: false,
});

const createProductInput = (
  overrides: Partial<ProductPriceInitializationInput>,
): ProductPriceInitializationInput => ({
  prices: [],
  priceType: PriceTypeEnum.SINGLE,
  attributes: [],
  attributeDependencies: {},
  ...overrides,
});

const createPreviewProductInput = (
  overrides: Partial<ProductPreviewInitializationInput>,
): ProductPreviewInitializationInput => ({
  prices: [],
  priceType: PriceTypeEnum.MATRIX,
  attributeDependencies: {},
  spec: {
    defaultOrder: 50,
    minimumOrder: 50,
    minimumWidth: 100,
    minimumHeight: 100,
  } as ProductPreviewInitializationInput["spec"],
  volumes: [{ value: 50 }, { value: 100 }, { value: 300 }],
  ...overrides,
});

const EMPTY_ATTRIBUTE_DATA: CleanedAttributeData = {
  validAttributes: [],
  validAttributeOptions: {},
};

describe("getInitialProductFormPrices", () => {
  it("keeps single prices when editing non-matrix products", () => {
    const prices = getInitialProductFormPrices({
      cleanedAttributeData: EMPTY_ATTRIBUTE_DATA,
      globalAttributes: [
        createAttribute({ id: "paper", optionValues: ["standard"] }),
      ],
      product: createProductInput({
        prices: [
          {
            value: 1599,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: true,
              customFormat: false,
            },
          },
        ],
        priceType: PriceTypeEnum.SINGLE,
        attributes: ["paper"],
      }),
    });

    expect(prices).toHaveLength(1);
    expect(prices[0]?.value).toBe(1599);
    expect(prices[0]?.combination?.id).toBe(DEFAULT_COMBINATION);
  });

  it("keeps all threshold rows for non-matrix products", () => {
    const prices = getInitialProductFormPrices({
      cleanedAttributeData: EMPTY_ATTRIBUTE_DATA,
      globalAttributes: [
        createAttribute({ id: "size", optionValues: ["a4", "a5"] }),
      ],
      product: createProductInput({
        prices: [
          {
            value: 2000,
            threshold: 0,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: true,
              customFormat: false,
            },
          },
          {
            value: 1800,
            threshold: 100,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: true,
              customFormat: false,
            },
          },
        ],
        priceType: PriceTypeEnum.THRESHOLD,
        attributes: ["size"],
      }),
    });

    expect(prices).toHaveLength(2);
    expect(prices.map((price) => price.threshold)).toEqual([0, 100]);
    expect(prices.map((price) => price.value)).toEqual([2000, 1800]);
  });

  it("keeps default matrix prices while filtering invalid combinations", () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const prices = getInitialProductFormPrices({
      cleanedAttributeData: {
        validAttributes: ["finish"],
        validAttributeOptions: {
          finish: ["matte"],
        },
      },
      globalAttributes: [
        createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
      ],
      product: createProductInput({
        prices: [
          {
            value: 1000,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: true,
              customFormat: false,
            },
          },
          {
            value: 1200,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: true,
              customFormat: false,
            },
          },
          {
            value: 1400,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "gloss",
              active: true,
              customFormat: false,
            },
          },
        ],
        priceType: PriceTypeEnum.MATRIX,
        attributes: ["finish"],
      }),
    });

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();

    expect(prices.map((price) => price.combination?.id)).toEqual([
      DEFAULT_COMBINATION,
      "matte",
    ]);
  });

  it("preserves all matrix prices when globalAttributes is null (not yet loaded)", () => {
    const prices = getInitialProductFormPrices({
      cleanedAttributeData: {
        validAttributes: ["finish"],
        validAttributeOptions: {
          finish: ["matte", "gloss"],
        },
      },
      globalAttributes: null,
      product: createProductInput({
        prices: [
          {
            value: 1200,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: true,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
          {
            value: 1400,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "gloss",
              active: true,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
        ],
        priceType: PriceTypeEnum.MATRIX,
        attributes: ["finish"],
      }),
    });

    expect(prices).toHaveLength(2);
    expect(prices.map((price) => price.combination?.id)).toEqual([
      "matte",
      "gloss",
    ]);
  });

  it("keeps imported matrix prices whose option values contain hyphens", () => {
    const prices = getInitialProductFormPrices({
      cleanedAttributeData: {
        validAttributes: ["paper", "finish"],
        validAttributeOptions: {
          finish: ["gloss-front", "matt-front"],
          paper: ["gloss-250g", "matt-150g"],
        },
      },
      globalAttributes: [
        createAttribute({
          id: "paper",
          optionValues: ["matt-150g", "gloss-250g"],
        }),
        createAttribute({
          id: "finish",
          optionValues: ["matt-front", "gloss-front"],
        }),
      ],
      product: createProductInput({
        prices: [
          {
            value: 1200,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matt-150g-gloss-front",
              active: true,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
          {
            value: 1500,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "gloss-250g-matt-front",
              active: true,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
        ],
        priceType: PriceTypeEnum.MATRIX,
        attributes: ["paper", "finish"],
      }),
    });

    expect(prices.map((price) => price.combination?.id)).toEqual([
      "matt-150g-gloss-front",
      "gloss-250g-matt-front",
    ]);
  });

  it("preserves legacy single-token values when current attribute options no longer include them", () => {
    const prices = getInitialProductFormPrices({
      cleanedAttributeData: {
        validAttributes: ["finish", "pages"],
        validAttributeOptions: {
          finish: ["matte"],
        },
      },
      globalAttributes: [
        createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
        createAttribute({ id: "pages", optionValues: ["50", "100", "150"] }),
      ],
      product: createProductInput({
        prices: [
          {
            value: 1200,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte-250",
              active: true,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
        ],
        priceType: PriceTypeEnum.MATRIX,
        attributes: ["finish", "pages"],
      }),
    });

    expect(prices.map((price) => price.combination?.id)).toEqual(["matte-250"]);
  });
});

describe("getProductFormPreviewInitConfiguration", () => {
  it("defaults attribute-less matrix preview to the first usable explicit volume", () => {
    const configuration = getProductFormPreviewInitConfiguration({
      attributes: [],
      product: createPreviewProductInput({
        prices: [
          {
            value: null,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: false,
              customFormat: false,
            },
            volume: { value: 50, deliveryTime: 2 },
          },
          {
            value: null,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: false,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
          {
            value: 3900,
            currency: CurrencyEnum.PLN,
            combination: {
              id: DEFAULT_COMBINATION,
              active: true,
              customFormat: false,
            },
            volume: { value: 300, deliveryTime: 3 },
          },
        ],
      }),
      productId: "preview-product",
    });

    expect(configuration).not.toBeNull();
    expect((configuration as Configuration).calculatedCombination).toBe(
      DEFAULT_COMBINATION,
    );
    expect((configuration as Configuration).volume).toBe(300);
    expect(
      (configuration as Configuration).selectedAttributeOptions,
    ).toBeNull();
  });

  it("defaults matrix preview to the first usable explicit volume", () => {
    const configuration = getProductFormPreviewInitConfiguration({
      attributes: [
        createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
      ],
      product: createPreviewProductInput({
        prices: [
          {
            value: null,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: false,
              customFormat: false,
            },
            volume: { value: 50, deliveryTime: 2 },
          },
          {
            value: null,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: false,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
          },
          {
            value: 3900,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: true,
              customFormat: false,
            },
            volume: { value: 300, deliveryTime: 3 },
          },
        ],
      }),
      productId: "preview-product",
    });

    expect(configuration).not.toBeNull();
    expect((configuration as Configuration).calculatedCombination).toBe(
      "matte",
    );
    expect((configuration as Configuration).volume).toBe(300);
    expect((configuration as Configuration).selectedAttributeOptions).toEqual({
      finish: "matte",
      volume: 300,
    });
  });

  it("keeps the configured default order when that matrix volume is usable", () => {
    const configuration = getProductFormPreviewInitConfiguration({
      attributes: [
        createAttribute({ id: "finish", optionValues: ["matte", "gloss"] }),
      ],
      product: createPreviewProductInput({
        prices: [
          {
            value: 1900,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: true,
              customFormat: false,
            },
            volume: { value: 50, deliveryTime: 2 },
          },
          {
            value: 3900,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "matte",
              active: true,
              customFormat: false,
            },
            volume: { value: 300, deliveryTime: 3 },
          },
        ],
      }),
      productId: "preview-product",
    });

    expect(configuration).not.toBeNull();
    expect((configuration as Configuration).volume).toBe(50);
    expect((configuration as Configuration).selectedAttributeOptions).toEqual({
      finish: "matte",
      volume: 50,
    });
  });

  it("initializes dynamic previews from non-calculated attributes without explicit price rows", () => {
    const configuration = getProductFormPreviewInitConfiguration({
      attributes: [
        createAttribute({
          calculated: false,
          id: "paper",
          optionValues: ["standard", "premium"],
        }),
      ],
      product: createPreviewProductInput({
        prices: [],
        priceType: PriceTypeEnum.DYNAMIC,
      }),
      productId: "preview-dynamic-product",
    });

    expect(configuration).not.toBeNull();
    expect((configuration as Configuration).combination).toBe("standard");
    expect((configuration as Configuration).calculatedCombination).toBe(
      "standard",
    );
    expect((configuration as Configuration).volume).toBe(50);
    expect((configuration as Configuration).selectedAttributeOptions).toEqual({
      paper: "standard",
      volume: 50,
    });
  });
});
