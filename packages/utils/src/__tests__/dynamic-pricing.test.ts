import { describe, expect, it } from "vitest";
import {
  Attribute,
  CurrencyEnum,
  DynamicPricingConfig,
  DynamicPricingPreset,
  Product,
} from "@konfi/types";
import {
  buildDynamicPricesForSelection,
  buildDynamicPricingSelections,
  calculateDynamicListingPrices,
  parseDynamicSelectionFromCombination,
  requiresRemoteDynamicPricingResolution,
  resolveDynamicPricingConfig,
} from "../dynamic-pricing";

const baseProduct = {
  attributeDependencies: {
    finish: {
      dependsOn: "material",
      dependencyValues: ["vinyl"],
    },
  },
  attributeOptions: {
    finish: ["gloss", "matt"],
    material: ["paper", "vinyl"],
  },
  attributes: ["material", "finish"],
  customSize: false,
  pageCount: {
    enabled: true,
    minimum: 4,
    maximum: 20,
    step: 4,
    coverPages: 4,
  },
  spec: {
    defaultOrder: 100,
    maximumOrder: 1000,
    minimumOrder: 10,
    step: 10,
  },
  volumes: [{ value: 10 }, { value: 100 }],
} satisfies Pick<
  Product,
  | "attributeDependencies"
  | "attributeOptions"
  | "attributes"
  | "customSize"
  | "pageCount"
  | "spec"
  | "volumes"
>;

const baseConfig = {
  attributeRules: [
    {
      adjustments: [
        { optionValue: "vinyl", priceAdjustment: 5 },
        { optionValue: "gloss", deliveryTimeAdjustment: 1, priceAdjustment: 2 },
      ],
      attributeId: "material",
      mode: "adjust",
    },
    {
      adjustments: [
        { optionValue: "gloss", deliveryTimeAdjustment: 1, priceAdjustment: 3 },
      ],
      attributeId: "finish",
      mode: "adjust",
    },
  ],
  baseDeliveryTime: 2,
  basePrice: 20,
  enabled: true,
  globalRules: [
    {
      calculator: "multiplier",
      id: "volume-multiplier",
      label: "Volume multiplier",
      metric: "volume",
      multiplier: 0.5,
      target: "price",
    },
    {
      calculator: "range",
      id: "page-count-range",
      inverse: true,
      label: "Page count range",
      maximumMetricValue: 20,
      maximumOutputValue: 1,
      metric: "pageCount",
      minimumMetricValue: 4,
      minimumOutputValue: 5,
      target: "price",
    },
    {
      calculator: "fixed",
      conditions: [
        {
          attributeId: "material",
          optionValues: ["vinyl"],
        },
      ],
      fixedValue: 2,
      id: "vinyl-speed",
      label: "Vinyl delivery",
      target: "deliveryTime",
    },
  ],
  inputs: [],
} satisfies DynamicPricingConfig;

describe("dynamic pricing", () => {
  it("parses full combinations while honoring attribute dependencies", () => {
    expect(parseDynamicSelectionFromCombination(baseProduct, "paper")).toEqual({
      material: "paper",
    });

    expect(
      parseDynamicSelectionFromCombination(baseProduct, "vinyl-gloss"),
    ).toEqual({
      finish: "gloss",
      material: "vinyl",
    });
  });

  it("builds valid attribute selections from product rules", () => {
    expect(buildDynamicPricingSelections(baseProduct)).toEqual([
      { material: "paper" },
      { finish: "gloss", material: "vinyl" },
      { finish: "matt", material: "vinyl" },
    ]);
  });

  it("generates volume-specific prices and delivery times", () => {
    const prices = buildDynamicPricesForSelection({
      calculatedCombination: "vinyl-gloss",
      config: baseConfig,
      context: {
        pageCount: 4,
      },
      product: baseProduct,
      selectedAttributeOptions: {
        finish: "gloss",
        material: "vinyl",
      },
    });

    expect(prices).toEqual([
      {
        combination: { active: true, customFormat: false, id: "vinyl-gloss" },
        currency: CurrencyEnum.PLN,
        value: 34,
        volume: { deliveryTime: 5, value: 10 },
      },
      {
        combination: { active: true, customFormat: false, id: "vinyl-gloss" },
        currency: CurrencyEnum.PLN,
        value: 79,
        volume: { deliveryTime: 5, value: 100 },
      },
    ]);
  });

  it("derives listing prices from all valid selections", () => {
    const listingPrices = calculateDynamicListingPrices({
      config: baseConfig,
      context: {
        pageCount: 4,
      },
      product: baseProduct,
    });

    expect(listingPrices.defaultPrice.value).toBe(71);
    expect(listingPrices.lowPrice.value).toBe(26);
    expect(listingPrices.highPrice.value).toBe(79);
  });

  it("keeps listing price fallbacks schema-valid when no volume rows exist", () => {
    const listingPrices = calculateDynamicListingPrices({
      config: baseConfig,
      product: {
        ...baseProduct,
        volumes: [],
      },
    });

    expect(listingPrices).toEqual({
      defaultPrice: {
        currency: CurrencyEnum.PLN,
        threshold: 0,
        value: 0,
      },
      highPrice: {
        currency: CurrencyEnum.PLN,
        threshold: 0,
        value: 0,
      },
      lowPrice: {
        currency: CurrencyEnum.PLN,
        threshold: 0,
        value: 0,
      },
    });
  });

  it("resolves linked presets into the effective config", () => {
    const configWithPresets: DynamicPricingConfig = {
      ...baseConfig,
      attributeRules: [
        {
          adjustments: [
            { optionValue: "paper", priceAdjustment: 1 },
            { optionValue: "vinyl", priceAdjustment: 2 },
          ],
          attributeId: "material",
          mode: "ignore",
        },
      ],
      globalRules: [],
      linkedPresetIds: ["preset-material", "preset-volume"],
    };
    const presets: DynamicPricingPreset[] = [
      {
        attributeRule: {
          adjustments: [
            { optionValue: "paper", priceAdjustment: 3 },
            { optionValue: "vinyl", priceAdjustment: 6 },
          ],
          attributeId: "material",
          mode: "adjust",
        },
        id: "preset-material",
        kind: "attribute",
        label: "Material adjustments",
      },
      {
        globalRule: {
          calculator: "multiplier",
          id: "preset-volume",
          label: "Volume price",
          metric: "volume",
          multiplier: 0.25,
          target: "price",
        },
        id: "preset-volume",
        kind: "global",
        label: "Volume preset",
      },
    ];

    const resolvedConfig = resolveDynamicPricingConfig(
      configWithPresets,
      presets,
    );

    expect(resolvedConfig.attributeRules).toEqual([
      {
        adjustments: [
          { optionValue: "paper", priceAdjustment: 3 },
          { optionValue: "vinyl", priceAdjustment: 6 },
        ],
        attributeId: "material",
        mode: "adjust",
      },
    ]);
    expect(resolvedConfig.globalRules).toEqual([
      {
        calculator: "multiplier",
        id: "preset-volume",
        label: "Volume price",
        metric: "volume",
        multiplier: 0.25,
        target: "price",
      },
    ]);
  });

  it("supports items-per-sheet and sheets-needed metrics", () => {
    const sheetProduct = {
      attributeDependencies: {},
      attributeOptions: {
        format: ["a6"],
        paper: ["offset"],
      },
      attributes: ["format", "paper"],
      customSize: false,
      spec: {
        defaultOrder: 100,
        maximumOrder: 100,
        minimumOrder: 100,
        step: 100,
      },
      volumes: [{ value: 100 }],
    } satisfies Pick<
      Product,
      | "attributeDependencies"
      | "attributeOptions"
      | "attributes"
      | "customSize"
      | "spec"
      | "volumes"
    >;
    const sheetAttributes = [
      {
        format: true,
        id: "format",
        options: [
          {
            customFormat: false,
            formatHeight: 148,
            formatWidth: 105,
            hidden: false,
            label: "A6",
            value: "a6",
          },
        ],
        trackStock: false,
      },
      {
        calculateStockFromSheet: {
          bleed: 0,
          enabled: true,
          margin: 0,
          sheetHeight: 320,
          sheetWidth: 450,
        },
        format: false,
        id: "paper",
        options: [
          {
            customFormat: false,
            hidden: false,
            label: "Offset",
            value: "offset",
          },
        ],
        trackStock: true,
      },
    ] satisfies Pick<
      Attribute,
      "calculateStockFromSheet" | "format" | "id" | "options" | "trackStock"
    >[];
    const sheetConfig: DynamicPricingConfig = {
      attributeRules: [],
      basePrice: 0,
      enabled: true,
      globalRules: [
        {
          calculator: "multiplier",
          id: "items",
          label: "Items per sheet",
          metric: "itemsPerSheet",
          multiplier: 1,
          target: "price",
        },
        {
          calculator: "multiplier",
          id: "sheets",
          label: "Sheets needed",
          metric: "sheetsNeeded",
          multiplier: 2,
          target: "price",
        },
      ],
      inputs: [],
      linkedPresetIds: [],
    };

    const prices = buildDynamicPricesForSelection({
      calculatedCombination: "a6-offset",
      config: sheetConfig,
      context: {
        attributes: sheetAttributes,
      },
      product: sheetProduct,
      selectedAttributeOptions: {
        format: "a6",
        paper: "offset",
      },
    });

    expect(prices[0]?.value).toBe(33);
  });

  it("supports page-count sheet-volume metrics with output multipliers", () => {
    const brochureProduct = {
      ...baseProduct,
      attributeDependencies: {},
      attributeOptions: {},
      attributes: [],
      volumes: [{ value: 100 }],
    } satisfies Pick<
      Product,
      | "attributeDependencies"
      | "attributeOptions"
      | "attributes"
      | "customSize"
      | "pageCount"
      | "spec"
      | "volumes"
    >;
    const brochureConfig: DynamicPricingConfig = {
      attributeRules: [],
      basePrice: 0,
      enabled: true,
      globalRules: [
        {
          calculator: "tier",
          fixedValue: 100,
          id: "base-sheet-rate",
          label: "Base sheet rate",
          maximumMetricValue: 200,
          metric: "totalSheetVolume",
          minimumMetricValue: 0,
          outputMultiplierMetric: "totalSheetsPerUnit",
          target: "price",
        },
        {
          calculator: "tier",
          fixedValue: 80,
          id: "discounted-sheet-rate",
          label: "Discounted sheet rate",
          maximumMetricValue: 600,
          metric: "totalSheetVolume",
          minimumMetricValue: 201,
          outputMultiplierMetric: "totalSheetsPerUnit",
          target: "price",
        },
      ],
      inputs: [],
      linkedPresetIds: [],
    };

    const fourInnerPages = buildDynamicPricesForSelection({
      calculatedCombination: "brochure",
      config: brochureConfig,
      context: {
        pageCount: 4,
      },
      product: brochureProduct,
      selectedAttributeOptions: {},
    });
    const twentyInnerPages = buildDynamicPricesForSelection({
      calculatedCombination: "brochure",
      config: brochureConfig,
      context: {
        pageCount: 20,
      },
      product: brochureProduct,
      selectedAttributeOptions: {},
    });

    expect(fourInnerPages[0]?.value).toBe(200);
    expect(twentyInnerPages[0]?.value).toBe(480);
  });

  it("keeps page-count sheet-volume pricing resolvable from local draft data", () => {
    const config: DynamicPricingConfig = {
      attributeRules: [],
      basePrice: 0,
      enabled: true,
      globalRules: [
        {
          calculator: "tier",
          fixedValue: 100,
          id: "base-sheet-rate",
          label: "Base sheet rate",
          maximumMetricValue: 200,
          metric: "totalSheetVolume",
          minimumMetricValue: 0,
          outputMultiplierMetric: "totalSheetsPerUnit",
          target: "price",
        },
      ],
      inputs: [],
      linkedPresetIds: [],
    };

    expect(requiresRemoteDynamicPricingResolution(config)).toBe(false);
  });

  it("uses each volume as the quantity metric when building price rows", () => {
    const quantityConfig: DynamicPricingConfig = {
      attributeRules: [],
      basePrice: 0,
      enabled: true,
      globalRules: [
        {
          calculator: "multiplier",
          id: "quantity-rule",
          label: "Quantity multiplier",
          metric: "quantity",
          multiplier: 1,
          target: "price",
        },
      ],
      inputs: [],
      linkedPresetIds: [],
    };

    const prices = buildDynamicPricesForSelection({
      calculatedCombination: "vinyl-gloss",
      config: quantityConfig,
      context: {
        quantity: 999,
      },
      product: baseProduct,
      selectedAttributeOptions: {
        finish: "gloss",
        material: "vinyl",
      },
    });

    expect(prices.map((price) => price.value)).toEqual([10, 100]);
  });

  it("caps generated selections to avoid exponential blowups", () => {
    const largeProduct = {
      attributeDependencies: {},
      attributeOptions: Object.fromEntries(
        Array.from({ length: 4 }, (_, attributeIndex) => [
          `attr${attributeIndex}`,
          Array.from(
            { length: 10 },
            (_, optionIndex) => `option${optionIndex}`,
          ),
        ]),
      ),
      attributes: ["attr0", "attr1", "attr2", "attr3"],
    } satisfies Pick<
      Product,
      "attributeDependencies" | "attributeOptions" | "attributes"
    >;

    const selections = buildDynamicPricingSelections(largeProduct);

    expect(selections).toHaveLength(250);
  });
});
