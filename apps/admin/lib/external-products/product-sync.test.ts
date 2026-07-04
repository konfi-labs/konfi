import { describe, expect, it } from "vitest";
import { CurrencyEnum, PriceTypeEnum, Unit, type Product } from "@konfi/types";
import { DEFAULT_COMBINATION } from "@konfi/utils";
import {
  buildConnectedProductImportUpdate,
  groupProductPrices,
  hasCompatibleProductAttributesForImport,
  type ImportedProductPricingDraft,
} from "./product-sync";

function createBaseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    name: "Existing Product",
    description: "Description",
    prices: [
      {
        currency: CurrencyEnum.PLN,
        value: 100,
      },
    ],
    defaultPrice: {
      currency: CurrencyEnum.PLN,
      value: 100,
    },
    lowPrice: {
      currency: CurrencyEnum.PLN,
      value: 100,
    },
    highPrice: {
      currency: CurrencyEnum.PLN,
      value: 100,
    },
    volumes: [{ value: 1 }],
    attributes: ["format", "paper"],
    attributeOptions: {
      format: ["a4", "a5"],
      paper: ["matte", "gloss"],
    },
    attributeDependencies: {},
    customSize: false,
    customSizes: [],
    allowCustomPrice: false,
    recommended: false,
    difficulty: 1,
    shipping: {
      types: [],
    },
    spec: {
      images: [],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 100,
      step: 1,
    },
    category: {
      id: "category-1",
      name: "Category",
    },
    seo: {
      slug: "existing-product",
      title: "Existing Product",
      description: "Description",
    },
    productType: {
      id: "product-type-1",
      name: "Flyers",
      attributes: ["format", "paper"],
      isShippable: true,
    },
    priceType: PriceTypeEnum.MATRIX,
    prefferedUnit: Unit.PCS,
    availability: {
      published: false,
      availableForPurchase: false,
    },
    keywords: [],
    active: true,
    createdAt: new Date() as never,
    updatedAt: new Date() as never,
    createdBy: {
      id: "user-1",
      name: "User",
    },
    updatedBy: {
      id: "user-1",
      name: "User",
    },
    ...overrides,
  };
}

describe("groupProductPrices", () => {
  it("groups prices by calculated combination", () => {
    const groupedPrices = groupProductPrices([
      {
        currency: CurrencyEnum.PLN,
        value: 100,
      },
      {
        combination: {
          id: "a4-matte",
          active: true,
          customFormat: false,
        },
        currency: CurrencyEnum.PLN,
        value: 200,
      },
      {
        combination: {
          id: "a4-matte",
          active: true,
          customFormat: false,
        },
        currency: CurrencyEnum.PLN,
        value: 250,
      },
    ]);

    expect(groupedPrices).toEqual([
      {
        calculatedCombination: DEFAULT_COMBINATION,
        prices: [
          {
            currency: CurrencyEnum.PLN,
            value: 100,
          },
        ],
      },
      {
        calculatedCombination: "a4-matte",
        prices: [
          {
            combination: {
              id: "a4-matte",
              active: true,
              customFormat: false,
            },
            currency: CurrencyEnum.PLN,
            value: 200,
          },
          {
            combination: {
              id: "a4-matte",
              active: true,
              customFormat: false,
            },
            currency: CurrencyEnum.PLN,
            value: 250,
          },
        ],
      },
    ]);
  });
});

describe("hasCompatibleProductAttributesForImport", () => {
  it("returns false when matrix attributes differ from the existing product", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["paper", "format"],
      attributeOptions: {
        format: ["a4", "a5"],
        paper: ["matte", "gloss"],
      },
      priceType: PriceTypeEnum.MATRIX,
    };

    expect(
      hasCompatibleProductAttributesForImport(product, importedProduct),
    ).toBe(false);
  });

  it("returns true for non-matrix imports", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      priceType: PriceTypeEnum.THRESHOLD,
    };

    expect(
      hasCompatibleProductAttributesForImport(product, importedProduct),
    ).toBe(true);
  });
});

describe("buildConnectedProductImportUpdate", () => {
  it("requires syncing attributes when a matrix import is incompatible", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["format"],
      attributeDependencies: {
        format: {
          dependsOn: "paper",
          dependencyValues: ["matte"],
        },
      },
      attributeOptions: {
        format: ["a4"],
      },
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 250,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.MATRIX,
      prices: [
        {
          combination: {
            id: "a4",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 150,
        },
      ],
      productType: {
        id: "product-type-1",
        name: "Flyers",
        attributes: ["format"],
        isShippable: true,
      },
      spec: {
        defaultOrder: 10,
        images: [],
        maximumOrder: 100,
        minimumOrder: 10,
        step: 1,
      },
      volumes: [{ value: 10 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: false,
    });

    expect(result.requiresAttributeSync).toBe(true);
    expect(result.groupedPrices).toHaveLength(1);
    expect(result.applyDraft.priceType).toBe(PriceTypeEnum.MATRIX);
    expect(result.applyDraft.prices).toEqual(importedProduct.prices);
    expect(result.productUpdate.attributes).toBeUndefined();
  });

  it("stages only intersecting matrix prices when option sets differ", () => {
    const product = createBaseProduct({
      attributes: ["wysylka", "format", "papier", "kolorystyka"],
      attributeOptions: {
        wysylka: ["standard", "express"],
        format: ["9050", "8555", "6565mm", "8525mm", "5090mm", "5585mm"],
        papier: ["kreda350"],
        kolorystyka: ["4+4", "4+0"],
      },
      attributeDependencies: {},
    });
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["wysylka", "format", "papier", "kolorystyka"],
      attributeOptions: {
        wysylka: ["express", "standard", "economic"],
        format: ["9050", "8555", "6565mm", "8525mm"],
        papier: ["kreda350"],
        kolorystyka: ["4+4", "4+0"],
      },
      attributeDependencies: {},
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 250,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.MATRIX,
      prices: [
        {
          combination: {
            id: "standard-9050-kreda350-4+4",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 150,
        },
        {
          combination: {
            id: "express-8555-kreda350-4+0",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 200,
        },
        {
          combination: {
            id: "economic-9050-kreda350-4+4",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 100,
        },
      ],
      spec: {
        defaultOrder: 50,
        images: [],
        maximumOrder: 10000,
        minimumOrder: 50,
        step: 1,
      },
      volumes: [{ value: 50 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: false,
    });

    expect(
      hasCompatibleProductAttributesForImport(product, importedProduct),
    ).toBe(true);
    expect(result.requiresAttributeSync).toBe(false);
    expect(result.applyDraft.attributes).toBeUndefined();
    expect(result.applyDraft.prices).toHaveLength(2);
    expect(
      result.applyDraft.prices.map((price) => price.combination?.id),
    ).toEqual(["standard-9050-kreda350-4+4", "express-8555-kreda350-4+0"]);
    expect(
      result.groupedPrices.map((group) => group.calculatedCombination),
    ).toEqual(["standard-9050-kreda350-4+4", "express-8555-kreda350-4+0"]);
  });

  it("syncs mapped attributes when requested", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["format"],
      attributeDependencies: {
        format: {
          dependsOn: "paper",
          dependencyValues: ["matte"],
        },
      },
      attributeOptions: {
        format: ["a4"],
      },
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 250,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.MATRIX,
      prices: [
        {
          combination: {
            id: "a4",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 150,
        },
      ],
      productType: {
        id: "product-type-1",
        name: "Flyers",
        attributes: ["format"],
        isShippable: true,
      },
      spec: {
        defaultOrder: 10,
        images: [],
        maximumOrder: 100,
        minimumOrder: 10,
        step: 1,
      },
      volumes: [{ value: 10 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: true,
    });

    expect(result.requiresAttributeSync).toBe(false);
    expect(result.applyDraft.attributes).toEqual(["format"]);
    expect(result.applyDraft.attributeOptions).toEqual({
      format: ["a4"],
    });
    expect(result.applyDraft.attributeDependencies).toEqual({
      format: {
        dependsOn: "paper",
        dependencyValues: ["matte"],
      },
    });
    expect(result.productUpdate.attributes).toEqual(["format"]);
    expect(result.productUpdate.attributeOptions).toEqual({
      format: ["a4"],
    });
    expect(result.productUpdate.attributeDependencies).toEqual({
      format: {
        dependsOn: "paper",
        dependencyValues: ["matte"],
      },
    });
    expect(result.productUpdate.spec).toMatchObject({
      defaultOrder: 10,
      minimumOrder: 10,
    });
  });

  it("preserves the current product type when a connected import skips product type suggestion", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["format"],
      attributeDependencies: {},
      attributeOptions: {
        format: ["a4"],
      },
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.MATRIX,
      prices: [
        {
          combination: {
            id: "a4",
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          value: 150,
        },
      ],
      spec: {
        defaultOrder: 10,
        images: [],
        maximumOrder: 100,
        minimumOrder: 10,
        step: 1,
      },
      volumes: [{ value: 10 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: true,
    });

    expect(result.productUpdate.productType).toBeUndefined();
    expect(result.applyDraft.productType).toBeUndefined();
  });

  it("persists imported custom-size settings alongside pricing updates", () => {
    const product = createBaseProduct({
      customSize: false,
      spec: {
        images: [],
        defaultOrder: 10,
        minimumOrder: 10,
        maximumOrder: 100,
        step: 1,
      },
    });
    const importedProduct: ImportedProductPricingDraft = {
      customSize: true,
      customSizes: [],
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 250,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.MATRIX,
      prices: [
        {
          combination: {
            id: DEFAULT_COMBINATION,
            active: true,
            customFormat: false,
          },
          currency: CurrencyEnum.PLN,
          threshold: 1,
          value: 5500,
          volume: {
            deliveryTime: 2,
            value: 100,
          },
        },
      ],
      spec: {
        defaultOrder: 100,
        minimumOrder: 100,
        maximumHeight: 500,
        maximumWidth: 1000,
        images: [],
        minimumHeight: 100,
        minimumWidth: 200,
        step: 1,
        widthStep: 50,
        heightStep: 25,
      },
      volumes: [{ value: 100 }, { value: 250 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: false,
    });

    expect(result.requiresAttributeSync).toBe(false);
    expect(result.applyDraft.customSize).toBe(true);
    expect(result.applyDraft.customSizes).toEqual([]);
    expect(result.productUpdate.customSize).toBe(true);
    expect(result.productUpdate.customSizes).toEqual([]);
    expect(result.productUpdate.spec).toMatchObject({
      defaultOrder: 100,
      heightStep: 25,
      maximumHeight: 500,
      maximumWidth: 1000,
      minimumHeight: 100,
      minimumOrder: 100,
      minimumWidth: 200,
      widthStep: 50,
    });
  });

  it("preserves existing product images during external sync", () => {
    const product = createBaseProduct({
      spec: {
        images: ["existing-image.jpg"],
        defaultOrder: 1,
        minimumOrder: 1,
        maximumOrder: 100,
        step: 1,
      },
    });
    const importedProduct: ImportedProductPricingDraft = {
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 250,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 150,
      },
      priceType: PriceTypeEnum.THRESHOLD,
      prices: [
        {
          currency: CurrencyEnum.PLN,
          threshold: 1,
          value: 150,
        },
      ],
      spec: {
        images: ["external-image.jpg"],
        defaultOrder: 10,
        minimumOrder: 10,
        maximumOrder: 1000,
        step: 10,
      },
      volumes: [{ value: 10 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: false,
    });

    expect(result.requiresAttributeSync).toBe(false);
    expect(result.applyDraft.spec).toMatchObject({
      images: ["existing-image.jpg"],
      defaultOrder: 10,
      minimumOrder: 10,
      maximumOrder: 1000,
      step: 10,
    });
    expect(result.productUpdate.spec).toMatchObject({
      images: ["existing-image.jpg"],
      defaultOrder: 10,
      minimumOrder: 10,
      maximumOrder: 1000,
      step: 10,
    });
  });

  it("requires syncing attributes when matrix dependencies differ", () => {
    const product = createBaseProduct({
      attributeDependencies: {},
    });
    const importedProduct: ImportedProductPricingDraft = {
      attributes: ["format", "paper"],
      attributeDependencies: {
        paper: {
          dependsOn: "format",
          dependencyValues: ["a4"],
        },
      },
      attributeOptions: {
        format: ["a4", "a5"],
        paper: ["matte", "gloss"],
      },
      priceType: PriceTypeEnum.MATRIX,
    };

    expect(
      hasCompatibleProductAttributesForImport(product, importedProduct),
    ).toBe(false);
  });

  it("clears matrix-only fields for non-matrix imports", () => {
    const product = createBaseProduct();
    const importedProduct: ImportedProductPricingDraft = {
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        value: 99,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        value: 199,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        value: 99,
      },
      priceType: PriceTypeEnum.THRESHOLD,
      prices: [
        {
          currency: CurrencyEnum.PLN,
          threshold: 1,
          value: 99,
        },
      ],
      volumes: [{ value: 1 }, { value: 10 }],
    };

    const result = buildConnectedProductImportUpdate({
      product,
      importedProduct,
      syncMappedAttributes: false,
    });

    expect(result.requiresAttributeSync).toBe(false);
    expect(result.applyDraft.attributes).toEqual([]);
    expect(result.applyDraft.attributeOptions).toEqual({});
    expect(result.applyDraft.attributeDependencies).toEqual({});
    expect(result.applyDraft.productType).toBeNull();
    expect(result.productUpdate.attributes).toEqual([]);
    expect(result.productUpdate.attributeOptions).toEqual({});
    expect(result.productUpdate.productType).toBeNull();
    expect(result.productUpdate.priceType).toBe(PriceTypeEnum.THRESHOLD);
  });
});
