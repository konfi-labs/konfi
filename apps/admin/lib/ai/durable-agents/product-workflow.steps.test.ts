import { describe, expect, it, vi } from "vitest";
import {
  AttributeInputTypeEnum,
  PriceTypeEnum,
  ShippingTypes,
} from "@konfi/types";
import {
  buildProductCreationCatalogSetupPlan,
  buildProductCreationDraftFromPlan,
  buildProductCreationDraftSystemPrompt,
  formatProductDraftPricePreview,
  type ProductCreationCatalog,
  type ProductDraftPlan,
} from "./product-workflow.steps";

vi.mock("server-only", () => ({}));

const catalog: ProductCreationCatalog = {
  attributes: [
    {
      calculated: true,
      format: false,
      id: "mast-length",
      name: "Długość masztu",
      options: [
        {
          label: "S - 290cm",
          value: "s-290cm",
          customFormat: false,
          hidden: false,
        },
        {
          label: "M - 350cm",
          value: "m-350cm",
          customFormat: false,
          hidden: false,
        },
      ],
      required: true,
      type: AttributeInputTypeEnum.RADIO_GROUP,
    },
    {
      calculated: true,
      format: false,
      id: "flag-shape",
      name: "Kształt flagi",
      options: [
        {
          label: "S1 Pióro",
          value: "s1-pioro",
          customFormat: false,
          hidden: false,
        },
        {
          label: "F Łezka",
          value: "f-lezka",
          customFormat: false,
          hidden: false,
        },
      ],
      required: true,
      type: AttributeInputTypeEnum.RADIO_GROUP,
    },
    {
      calculated: true,
      format: false,
      id: "base",
      name: "Podstawa",
      options: [
        {
          label: "DRYL/ŚWIDER",
          value: "dryl-swider",
          customFormat: false,
          hidden: false,
        },
        {
          label: "KONTENER WODNY",
          value: "kontener-wodny",
          customFormat: false,
          hidden: false,
        },
      ],
      required: true,
      type: AttributeInputTypeEnum.RADIO_GROUP,
    },
  ],
  categories: [{ id: "outdoor", name: "Outdoor" }],
  productTypes: [
    {
      attributes: ["mast-length", "flag-shape", "base"],
      id: "advertising-flags",
      isShippable: true,
      name: "Flagi reklamowe",
    },
  ],
};

const balloonCatalog: ProductCreationCatalog = {
  ...catalog,
  attributes: [
    ...catalog.attributes,
    {
      calculated: false,
      format: false,
      id: "pompka",
      name: "Pompka do balonów",
      options: [
        { label: "Nie", value: "nie", customFormat: false, hidden: false },
        { label: "Tak", value: "tak", customFormat: false, hidden: false },
      ],
      required: true,
      type: AttributeInputTypeEnum.RADIO_GROUP,
    },
  ],
};

const basePlan: ProductDraftPlan = {
  categoryId: "outdoor",
  description: "Kompletna flaga reklamowa z masztem i podstawą.",
  dynamicPricing: null,
  grossPrices: true,
  missingAttributes: [],
  missingOptions: [],
  name: "Flagi reklamowe",
  priceType: PriceTypeEnum.MATRIX,
  priceTypeReason:
    "Cena zależy od kombinacji długości masztu, kształtu flagi i podstawy.",
  prices: [
    {
      active: true,
      attributeValues: {
        base: "dryl-swider",
        "flag-shape": "s1-pioro",
        "mast-length": "s-290cm",
      },
      deliveryTime: 2,
      quantity: 1,
      source: "S/S1/DRYL",
      threshold: null,
      valueGross: 296,
    },
    {
      active: true,
      attributeValues: {
        base: "kontener-wodny",
        "flag-shape": "f-lezka",
        "mast-length": "m-350cm",
      },
      deliveryTime: 2,
      quantity: 1,
      source: "M/F/KONTENER",
      threshold: null,
      valueGross: 352,
    },
  ],
  productTypeId: "advertising-flags",
  reviewSummary: "Szkic gotowy do sprawdzenia przed utworzeniem produktu.",
  selectedAttributes: [
    {
      attributeId: "mast-length",
      optionValues: ["s-290cm", "m-350cm"],
      role: "mast length",
    },
    {
      attributeId: "flag-shape",
      optionValues: ["s1-pioro", "f-lezka"],
      role: "flag shape",
    },
    {
      attributeId: "base",
      optionValues: ["dryl-swider", "kontener-wodny"],
      role: "base",
    },
  ],
  seoDescription: "Flagi reklamowe z masztem i podstawą.",
  seoTitle: "Flagi reklamowe",
  specialNotes: "Ceny brutto z tabeli źródłowej.",
  spec: {
    defaultOrder: 1,
    maximumHeight: null,
    maximumOrder: 1,
    maximumWidth: null,
    minimumHeight: null,
    minimumOrder: 1,
    minimumWidth: null,
    step: 1,
  },
  volumes: [{ value: 1 }],
};

describe("buildProductCreationDraftFromPlan", () => {
  it("explains unit-price dynamic and configurable semantics to the agent", () => {
    const systemPrompt = buildProductCreationDraftSystemPrompt(catalog);

    expect(systemPrompt).toContain("Konfi dynamic pricing is additive");
    expect(systemPrompt).toContain(
      "quantity and volume metrics are set to the currently generated product volume",
    );
    expect(systemPrompt).toContain(
      "Do not encode volume price tiers as multiple unconditional fixed globalRules",
    );
    expect(systemPrompt).toContain(
      "Pricing pattern recognition happens here from the user's source prompt",
    );
    expect(systemPrompt).toContain(
      "Global rule id and label are documentation only",
    );
    expect(systemPrompt).toContain("piecewise unit-price curve");
    expect(systemPrompt).toContain(
      "Never model an order-level add-on with multiplier=12",
    );
    expect(systemPrompt).toContain(
      "final already-multiplied prices for each volume",
    );
    expect(systemPrompt).toContain(
      "Konfi persisted prices are per-piece/unit prices",
    );
    expect(systemPrompt).toContain(
      "Do not encode an order-level add-on as attributeRules.priceAdjustment: 12",
    );
    expect(systemPrompt).toContain("pompka += 12 zł");
    expect(systemPrompt).toContain("dynamicPricing.globalRules.conditions");
    expect(systemPrompt).toContain(
      "configuration only exposes attributes for matrix-like products",
    );
    expect(systemPrompt).toContain(
      "Do not choose SINGLE or THRESHOLD for a product that needs option selectors",
    );
    expect(systemPrompt).toContain(
      "one fixed price for all options, choose DYNAMIC",
    );
    expect(systemPrompt).toContain(
      "selectedAttributes is the exact customer-visible option set",
    );
    expect(systemPrompt).toContain(
      "Do not expand selectedAttributes just because the catalog has more options",
    );
    expect(systemPrompt).toContain(
      "must not silently widen the product to unrelated catalog options",
    );
    expect(systemPrompt).toContain(
      "Only put customer-visible choices in selectedAttributes",
    );
    expect(systemPrompt).toContain(
      "Internal production parameters such as source sheet format",
    );
    expect(systemPrompt).toContain(
      "Do not add extra production-only attributes just to document how the price was calculated",
    );
    expect(systemPrompt).toContain("Page count is not a catalog attribute");
    expect(systemPrompt).toContain("fill product.pageCount");
    expect(systemPrompt).toContain("innerSheetVolume");
    expect(systemPrompt).toContain("outputMultiplierMetric");
    expect(systemPrompt).toContain('pageCount.pricing.mode="exact"');
    expect(systemPrompt).toContain(
      "Do not recommend implementing a separate dedicated brochure calculator",
    );
    expect(systemPrompt).toContain(
      "product.pageCount.minimum and maximum are inner customer-selectable pages only",
    );
    expect(systemPrompt).toContain('If the user says "4 + cover 4"');
    expect(systemPrompt).toContain(
      "A default page count is not the same as the allowed selectable page-count range",
    );
    expect(systemPrompt).toContain(
      "Create a blocked price/field note asking for the allowed minimum, maximum, and step",
    );
    expect(systemPrompt).toContain(
      "Set pageCount.minimum=pageCount.maximum only when the user explicitly says page count is fixed",
    );
    expect(systemPrompt).toContain("innerSheetCount = innerPages / 4");
    expect(systemPrompt).toContain(
      "calculate the unit price per finished brochure at each quantity breakpoint",
    );
    expect(systemPrompt).toContain("use the union of all breakpoints");
    expect(systemPrompt).toContain("not just one or two");
    expect(systemPrompt).toContain(
      "Do not infer delivery times from numeric price notation",
    );
    expect(systemPrompt).toContain(
      "If the prompt does not specify delivery time, use 2 days as the default",
    );
    expect(systemPrompt).toContain(
      "Never set deliveryTime or dynamicPricing.baseDeliveryTime to 0",
    );
  });

  it("models selectable pages with product pageCount instead of an attribute", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        description: "Katalog klejony z wyborem liczby stron.",
        dynamicPricing: {
          attributeRules: [],
          baseDeliveryTime: 3,
          basePrice: 10,
          enabled: true,
          globalRules: [
            {
              calculator: "multiplier",
              conditions: [],
              fixedValue: null,
              id: "inner-pages",
              inputId: null,
              inverse: null,
              label: "Inner page surcharge",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: "pageCount",
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: 0.5,
              target: "price",
            },
          ],
          inputs: [],
          linkedPresetIds: [],
        },
        missingAttributes: [
          {
            name: "Liczba stron",
            options: [
              { label: "8 stron", value: "8" },
              { label: "12 stron", value: "12" },
            ],
            reason:
              "The prompt described page options; pageCount should own them.",
            suggestedType: AttributeInputTypeEnum.RADIO_GROUP,
          },
        ],
        name: "Katalog klejony",
        pageCount: {
          coverPages: 4,
          enabled: true,
          externalAttributeName: null,
          maximum: 64,
          minimum: 8,
          placement: { afterAttributeId: null },
          pricingMode: "step",
          step: 4,
        },
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason:
          "Cena bazowa rośnie o dopłatę za każdą stronę wewnętrzną.",
        prices: [],
        productTypeId: null,
        selectedAttributes: [],
        spec: {
          ...basePlan.spec,
          defaultOrder: 1,
          maximumOrder: 1,
          minimumOrder: 1,
          step: 1,
        },
        volumes: [{ value: 1 }],
      },
      prompt:
        "Katalog klejony, klient wybiera 8-64 stron co 4 strony, okładka 4 strony. Cena 10 zł + 0,50 zł za stronę.",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.product.attributes).toEqual([]);
    expect(draft.product.attributeOptions).toEqual({});
    expect(draft.missingAttributes).toEqual([]);
    expect(draft.product.pageCount).toMatchObject({
      coverPages: 4,
      enabled: true,
      maximum: 64,
      minimum: 8,
      placement: { afterAttributeId: null },
      pricing: {
        mode: "step",
        stepPrices: [],
      },
      step: 4,
    });
    expect(draft.product.defaultPrice?.value).toBe(1400);

    const catalogSetup = buildProductCreationCatalogSetupPlan({ draft });
    expect(catalogSetup).toBeNull();
    expect(formatProductDraftPricePreview(draft)).toContain(
      "Page count: 8-64 inner pages, step 4, cover 4",
    );
  });

  it("stores exact page-count quantity tables instead of dynamic approximations", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        description: "Broszura z osobnym cennikiem dla każdej liczby stron.",
        dynamicPricing: null,
        name: "Broszura szyta",
        pageCount: {
          coverPages: 4,
          enabled: true,
          externalAttributeName: null,
          maximum: 12,
          minimum: 8,
          placement: { afterAttributeId: null },
          pricing: {
            exactPrices: [
              {
                pageCount: 12,
                prices: [
                  {
                    active: true,
                    attributeValues: {},
                    deliveryTime: 4,
                    quantity: null,
                    source: "12 stron / 100 szt.",
                    threshold: 100,
                    valueGross: 3.2,
                  },
                ],
              },
            ],
            mode: "exact",
            segmentPrices: [],
            stepPrices: [],
          },
          pricingMode: "exact",
          step: 4,
        },
        priceType: PriceTypeEnum.THRESHOLD,
        priceTypeReason:
          "Jedyną konfiguracją jest liczba stron, a ceny zależą od progu nakładu.",
        prices: [
          {
            active: true,
            attributeValues: {},
            deliveryTime: 4,
            quantity: null,
            source: "8 stron / 100 szt.",
            threshold: 100,
            valueGross: 4,
          },
        ],
        productTypeId: null,
        selectedAttributes: [],
        spec: {
          ...basePlan.spec,
          defaultOrder: 100,
          maximumOrder: 100,
          minimumOrder: 100,
          step: 100,
        },
        volumes: [{ value: 100 }],
      },
      prompt:
        "Broszura szyta, 8 albo 12 stron, progi nakładu. 8 stron: 100 szt. = 4 zł/szt.; 12 stron: 100 szt. = 3,20 zł/szt.",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.product.priceType).toBe(PriceTypeEnum.THRESHOLD);
    expect(draft.product.attributes).toEqual([]);
    expect(draft.product.dynamicPricing).toBeUndefined();
    expect(draft.product.prices?.[0]).toMatchObject({
      threshold: 100,
      value: 400,
    });
    expect(draft.product.pageCount?.pricing).toMatchObject({
      exactPrices: [
        {
          pageCount: 12,
          prices: [
            {
              threshold: 100,
              value: 320,
            },
          ],
        },
      ],
      mode: "exact",
      stepPrices: [],
    });
  });

  it("keeps condition-only dynamic attributes visible for safe add-on rules", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog: balloonCatalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: {
          attributeRules: [],
          baseDeliveryTime: 2,
          basePrice: 4.8902,
          enabled: true,
          globalRules: [
            {
              calculator: "range",
              conditions: [],
              fixedValue: null,
              id: "tier-50-100",
              inputId: null,
              inverse: false,
              label: "Unit price delta 50 to 100",
              maximumMetricValue: 100,
              maximumOutputValue: -1.1558,
              metric: "volume",
              minimumMetricValue: 50,
              minimumOutputValue: 0,
              multiplier: null,
              target: "price",
            },
            {
              calculator: "fixed",
              conditions: [
                {
                  attributeId: "pompka",
                  optionValues: ["tak"],
                },
              ],
              fixedValue: 0.24,
              id: "pump-first-tier",
              inputId: null,
              inverse: null,
              label: "Pump unit surcharge at 50 pcs",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "price",
            },
            {
              calculator: "range",
              conditions: [
                {
                  attributeId: "pompka",
                  optionValues: ["tak"],
                },
              ],
              fixedValue: null,
              id: "pump-50-100-delta",
              inputId: null,
              inverse: false,
              label: "Pump surcharge delta 50 to 100",
              maximumMetricValue: 100,
              maximumOutputValue: -0.12,
              metric: "volume",
              minimumMetricValue: 50,
              minimumOutputValue: 0,
              multiplier: null,
              target: "price",
            },
          ],
          inputs: [],
          linkedPresetIds: [],
        },
        name: "Balony standardowe 12 cali",
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason: "Produkt ma cennik wolumenowy i opcjonalną pompkę.",
        prices: [],
        productTypeId: null,
        selectedAttributes: [],
        spec: {
          ...basePlan.spec,
          defaultOrder: 50,
          maximumOrder: 100,
          minimumOrder: 50,
          step: 50,
        },
        volumes: [{ value: 50 }, { value: 100 }],
      },
      prompt:
        "Cennik BRUTTO: 50 sztuk = 244,51 zł; 100 sztuk = 373,44 zł. Pompka 1 sztuka += 12,00 zł brutto.",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.blockedItems).toEqual([]);
    expect(draft.product.attributes).toEqual(["pompka"]);
    expect(draft.product.attributeOptions).toEqual({ pompka: ["nie", "tak"] });
    expect(draft.product.defaultPrice?.value).toBe(489);
    expect(draft.product.lowPrice?.value).toBe(489);
    expect(draft.product.highPrice?.value).toBe(385);
  });

  it("keeps explicitly selected dynamic attribute options narrow", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: {
          attributeRules: [
            {
              adjustments: [
                {
                  deliveryTimeAdjustment: null,
                  optionValue: "s-290cm",
                  priceAdjustment: 0,
                },
              ],
              attributeId: "mast-length",
              mode: "adjust",
            },
          ],
          baseDeliveryTime: 2,
          basePrice: 25,
          enabled: true,
          globalRules: [
            {
              calculator: "fixed",
              conditions: [
                {
                  attributeId: "mast-length",
                  optionValues: ["s-290cm"],
                },
              ],
              fixedValue: 0,
              id: "selected-mast-only",
              inputId: null,
              inverse: null,
              label: "Selected mast only",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "price",
            },
          ],
          inputs: [],
          linkedPresetIds: [],
        },
        name: "Flaga z krótkim masztem",
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason:
          "Produkt ma jedną wybraną długość masztu z ceną dynamiczną.",
        prices: [],
        productTypeId: null,
        selectedAttributes: [
          {
            attributeId: "mast-length",
            optionValues: ["s-290cm"],
            role: "requested mast length",
          },
        ],
        volumes: [{ value: 1 }],
      },
      prompt:
        "Stwórz flagę tylko z opcją masztu S - 290cm. Nie dodawaj innych długości.",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.product.attributes).toEqual(["mast-length"]);
    expect(draft.product.attributeOptions).toEqual({
      "mast-length": ["s-290cm"],
    });
    expect(draft.selectedAttributes).toEqual([
      {
        attributeId: "mast-length",
        attributeName: "Długość masztu",
        optionValues: ["s-290cm"],
        role: "requested mast length",
      },
    ]);
  });

  it("builds a ready matrix product draft from existing attributes and options", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: basePlan,
      prompt: "Stwórz produkt: Flagi reklamowe",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.blockedItems).toEqual([]);
    expect(draft.priceType).toBe(PriceTypeEnum.MATRIX);
    expect(draft.product.productType?.id).toBe("advertising-flags");
    expect(draft.product.category?.id).toBe("outdoor");
    expect(draft.product.shipping?.types).toEqual([ShippingTypes.COURIER]);
    expect(draft.product.attributeOptions).toEqual({
      base: ["dryl-swider", "kontener-wodny"],
      "flag-shape": ["f-lezka", "s1-pioro"],
      "mast-length": ["m-350cm", "s-290cm"],
    });
    expect(draft.product.prices?.map((price) => price.value)).toEqual([
      29600, 35200,
    ]);
    expect(draft.product.prices?.[0]?.combination?.id).toBe(
      "s-290cm-s1-pioro-dryl-swider",
    );
  });

  it("formats visible price preview details for product draft review", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: basePlan,
      prompt: "Stwórz produkt: Flagi reklamowe",
    });

    const preview = formatProductDraftPricePreview(draft);

    expect(preview).toContain("Price type: MATRIX");
    expect(preview).toContain("combination=s-290cm-s1-pioro-dryl-swider");
    expect(preview).toContain("296.00 PLN");
    expect(preview).toContain("Calculated checkout preview:");
    expect(preview).toContain("total=296.00 PLN");
    expect(preview).toContain("Selectable attributes:");
    expect(preview).toContain("Długość masztu: m-350cm, s-290cm");
  });

  it("expands matrix rows across selected calculated options omitted from shared-price rows", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        prices: [
          {
            active: true,
            attributeValues: {
              "flag-shape": "s1-pioro",
              "mast-length": "s-290cm",
            },
            deliveryTime: 2,
            quantity: 1,
            source: "S/S1 - shared across bases",
            threshold: null,
            valueGross: 296,
          },
        ],
      },
      prompt:
        "Stwórz produkt: Flagi reklamowe. Cena S/S1 jest taka sama dla każdej podstawy.",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.blockedItems).toEqual([]);
    expect(draft.product.prices?.map((price) => price.combination?.id)).toEqual(
      ["s-290cm-s1-pioro-dryl-swider", "s-290cm-s1-pioro-kontener-wodny"],
    );
    expect(draft.product.prices?.map((price) => price.value)).toEqual([
      29600, 29600,
    ]);
  });

  it("blocks non-matrix-like drafts that include configurable attributes", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: null,
        priceType: PriceTypeEnum.SINGLE,
        priceTypeReason:
          "Jeden cennik dla wszystkich wariantów, ale warianty nadal muszą być wybieralne.",
        prices: [
          {
            active: true,
            attributeValues: {},
            deliveryTime: 2,
            quantity: 1,
            source: "fixed",
            threshold: null,
            valueGross: 300,
          },
        ],
        productTypeId: null,
      },
      prompt: "Stwórz produkt z wyborem masztu i kształtu oraz jedną ceną.",
    });

    expect(draft.readyForCreate).toBe(false);
    expect(draft.blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Configurable attributes",
          type: "price",
        }),
      ]),
    );
  });

  it("marks missing options as blocked instead of creating an unsafe draft", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        missingOptions: [
          {
            attributeId: "base",
            attributeName: "Podstawa",
            options: [{ label: "ROTATOR", value: "rotator" }],
          },
        ],
        prices: [
          {
            active: true,
            attributeValues: {
              base: "rotator",
              "flag-shape": "s1-pioro",
              "mast-length": "s-290cm",
            },
            deliveryTime: null,
            quantity: 1,
            source: "S/S1/ROTATOR",
            threshold: null,
            valueGross: 262,
          },
        ],
        selectedAttributes: basePlan.selectedAttributes.map((attribute) =>
          attribute.attributeId === "base"
            ? {
                ...attribute,
                optionValues: ["dryl-swider", "rotator"],
              }
            : attribute,
        ),
      },
      prompt: "Stwórz produkt: Flagi reklamowe",
    });

    expect(draft.readyForCreate).toBe(false);
    expect(draft.blockedItems.some((item) => item.type === "option")).toBe(
      true,
    );
    expect(draft.blockedItems.map((item) => item.label)).toContain(
      "Podstawa: ROTATOR",
    );

    const setupPlan = buildProductCreationCatalogSetupPlan({ draft });

    expect(setupPlan?.attributes).toEqual([]);
    expect(setupPlan?.options).toEqual([
      {
        attributeId: "base",
        attributeName: "Podstawa",
        options: [{ label: "ROTATOR", value: "rotator" }],
      },
    ]);
    expect(setupPlan?.productType).toBeUndefined();
  });

  it("builds autonomous catalog setup for missing attributes and product type", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        missingAttributes: [
          {
            name: "Kolor druku",
            options: [
              { label: "4/0", value: "4-0" },
              { label: "4/4", value: "4-4" },
            ],
            reason: "Brakuje atrybutu potrzebnego do wyboru wariantu druku.",
            suggestedType: AttributeInputTypeEnum.RADIO_GROUP,
          },
        ],
        productTypeId: null,
      },
      prompt: "Stwórz produkt: Flagi reklamowe z kolorem druku",
    });

    const setupPlan = buildProductCreationCatalogSetupPlan({ draft });

    expect(setupPlan).not.toBeNull();
    expect(setupPlan?.attributes).toEqual([
      {
        calculated: true,
        name: "Kolor druku",
        options: [
          { label: "4/0", value: "4-0" },
          { label: "4/4", value: "4-4" },
        ],
        reason: "Brakuje atrybutu potrzebnego do wyboru wariantu druku.",
        suggestedId: "kolorDruku",
        suggestedType: AttributeInputTypeEnum.RADIO_GROUP,
      },
    ]);
    expect(setupPlan?.productType?.name).toBe("Flagi reklamowe");
    expect(setupPlan?.productType?.suggestedId).toBe("flagiReklamowe");
    expect(setupPlan?.productType?.attributeRefs).toEqual(
      expect.arrayContaining([
        { attributeId: "mast-length", attributeName: "Długość masztu" },
        { attributeId: "flag-shape", attributeName: "Kształt flagi" },
        { attributeId: "base", attributeName: "Podstawa" },
        { attributeName: "Kolor druku" },
      ]),
    );
  });

  it("preserves additive component prices in dynamic pricing drafts", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: {
          attributeRules: [
            {
              adjustments: [
                {
                  optionValue: "s-290cm",
                  priceAdjustment: 120,
                  deliveryTimeAdjustment: null,
                },
                {
                  optionValue: "m-350cm",
                  priceAdjustment: 160,
                  deliveryTimeAdjustment: null,
                },
              ],
              attributeId: "mast-length",
              mode: "adjust",
            },
            {
              adjustments: [
                {
                  optionValue: "s1-pioro",
                  priceAdjustment: 89,
                  deliveryTimeAdjustment: null,
                },
                {
                  optionValue: "f-lezka",
                  priceAdjustment: 99,
                  deliveryTimeAdjustment: null,
                },
              ],
              attributeId: "flag-shape",
              mode: "adjust",
            },
            {
              adjustments: [
                {
                  optionValue: "dryl-swider",
                  priceAdjustment: 45,
                  deliveryTimeAdjustment: null,
                },
                {
                  optionValue: "kontener-wodny",
                  priceAdjustment: 95,
                  deliveryTimeAdjustment: null,
                },
              ],
              attributeId: "base",
              mode: "adjust",
            },
          ],
          baseDeliveryTime: 2,
          basePrice: 0,
          enabled: true,
          globalRules: [],
          inputs: [],
          linkedPresetIds: [],
        },
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason:
          "Cena końcowa to suma ceny flagi, masztu i podstawy dla wybranych opcji.",
        prices: [],
        selectedAttributes: [],
      },
      prompt: "Stwórz produkt: Flagi reklamowe z ceną sumowaną z komponentów",
    });

    expect(draft.readyForCreate).toBe(true);
    expect(draft.blockedItems).toEqual([]);
    expect(draft.product.dynamicPricing).toMatchObject({
      baseDeliveryTime: 2,
      basePrice: 0,
      enabled: true,
      attributeRules: [
        {
          adjustments: [
            {
              optionValue: "s-290cm",
              priceAdjustment: 12000,
            },
            {
              optionValue: "m-350cm",
              priceAdjustment: 16000,
            },
          ],
          attributeId: "mast-length",
          mode: "adjust",
        },
        {
          adjustments: [
            {
              optionValue: "s1-pioro",
              priceAdjustment: 8900,
            },
            {
              optionValue: "f-lezka",
              priceAdjustment: 9900,
            },
          ],
          attributeId: "flag-shape",
          mode: "adjust",
        },
        {
          adjustments: [
            {
              optionValue: "dryl-swider",
              priceAdjustment: 4500,
            },
            {
              optionValue: "kontener-wodny",
              priceAdjustment: 9500,
            },
          ],
          attributeId: "base",
          mode: "adjust",
        },
      ],
    });
    expect(draft.product.attributes).toEqual([
      "mast-length",
      "flag-shape",
      "base",
    ]);
    expect(draft.product.attributeOptions).toEqual({
      base: ["dryl-swider", "kontener-wodny"],
      "flag-shape": ["f-lezka", "s1-pioro"],
      "mast-length": ["m-350cm", "s-290cm"],
    });
    expect(draft.product.defaultPrice?.value).toBe(30400);
    expect(draft.product.lowPrice?.value).toBe(25400);
    expect(draft.product.highPrice?.value).toBe(35400);
  });

  it("converts dynamic pricing monetary rules to minor units", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: {
          attributeRules: [
            {
              adjustments: [
                {
                  deliveryTimeAdjustment: 1,
                  optionValue: "s-290cm",
                  priceAdjustment: 124,
                },
              ],
              attributeId: "mast-length",
              mode: "adjust",
            },
          ],
          baseDeliveryTime: 2,
          basePrice: 10,
          enabled: true,
          globalRules: [
            {
              calculator: "fixed",
              conditions: [],
              fixedValue: 15,
              id: "price-fixed",
              inputId: null,
              inverse: null,
              label: "Price fixed",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "price",
            },
            {
              calculator: "range",
              conditions: [],
              fixedValue: null,
              id: "price-range",
              inputId: null,
              inverse: false,
              label: "Price range",
              maximumMetricValue: 10,
              maximumOutputValue: 30,
              metric: "quantity",
              minimumMetricValue: 1,
              minimumOutputValue: 20,
              multiplier: null,
              target: "price",
            },
            {
              calculator: "multiplier",
              conditions: [],
              fixedValue: null,
              id: "price-multiplier",
              inputId: null,
              inverse: null,
              label: "Price multiplier",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: "quantity",
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: 2.5,
              target: "price",
            },
            {
              calculator: "fixed",
              conditions: [],
              fixedValue: 3,
              id: "delivery-fixed",
              inputId: null,
              inverse: null,
              label: "Delivery fixed",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "deliveryTime",
            },
          ],
          inputs: [],
          linkedPresetIds: [],
        },
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason: "Cena ma być liczona dynamicznie.",
        prices: [],
        selectedAttributes: [],
      },
      prompt: "Stwórz produkt: Flagi reklamowe z dynamiczną ceną 124 PLN",
    });

    expect(draft.product.dynamicPricing).toMatchObject({
      attributeRules: [
        {
          adjustments: [
            {
              deliveryTimeAdjustment: 1,
              optionValue: "s-290cm",
              priceAdjustment: 12400,
            },
          ],
          attributeId: "mast-length",
          mode: "adjust",
        },
      ],
      baseDeliveryTime: 2,
      basePrice: 1000,
      enabled: true,
      globalRules: [
        expect.objectContaining({
          fixedValue: 1500,
          id: "price-fixed",
          target: "price",
        }),
        expect.objectContaining({
          id: "price-range",
          maximumOutputValue: 3000,
          minimumOutputValue: 2000,
          target: "price",
        }),
        expect.objectContaining({
          id: "price-multiplier",
          multiplier: 250,
          target: "price",
        }),
        expect.objectContaining({
          fixedValue: 3,
          id: "delivery-fixed",
          target: "deliveryTime",
        }),
      ],
    });
  });

  it("blocks dynamic lookup-table rules that would stack for every volume", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: {
          attributeRules: [],
          baseDeliveryTime: 2,
          basePrice: 0,
          enabled: true,
          globalRules: [
            {
              calculator: "fixed",
              conditions: [],
              fixedValue: 244.51,
              id: "volume-50",
              inputId: null,
              inverse: null,
              label: "50 sztuk",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "price",
            },
            {
              calculator: "fixed",
              conditions: [],
              fixedValue: 373.44,
              id: "volume-100",
              inputId: null,
              inverse: null,
              label: "100 sztuk",
              maximumMetricValue: null,
              maximumOutputValue: null,
              metric: null,
              minimumMetricValue: null,
              minimumOutputValue: null,
              multiplier: null,
              target: "price",
            },
          ],
          inputs: [],
          linkedPresetIds: [],
        },
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason:
          "Błędnie opisany cennik wolumenowy jako osobne reguły fixed.",
        prices: [],
        productTypeId: null,
        selectedAttributes: [],
        spec: {
          ...basePlan.spec,
          defaultOrder: 50,
          maximumOrder: 100,
          minimumOrder: 50,
          step: 50,
        },
        volumes: [{ value: 50 }, { value: 100 }],
      },
      prompt: "Cennik BRUTTO: 50 sztuk = 244,51 zł; 100 sztuk = 373,44 zł.",
    });

    expect(draft.readyForCreate).toBe(false);
    expect(draft.blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Dynamic fixed price rules",
          type: "price",
        }),
      ]),
    );
    expect(draft.pricingPreview?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Dynamic fixed price rules",
          severity: "error",
        }),
      ]),
    );
    expect(formatProductDraftPricePreview(draft)).toContain("Pricing checks:");
  });

  it("blocks dynamic pricing drafts that omit usable pricing configuration", () => {
    const draft = buildProductCreationDraftFromPlan({
      catalog,
      channelId: "main-channel",
      plan: {
        ...basePlan,
        dynamicPricing: null,
        priceType: PriceTypeEnum.DYNAMIC,
        priceTypeReason: "Cena ma być liczona dynamicznie.",
        prices: [],
      },
      prompt: "Stwórz produkt: Flagi reklamowe z ceną dynamiczną",
    });

    expect(draft.readyForCreate).toBe(false);
    expect(draft.blockedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Dynamic pricing",
          type: "price",
        }),
      ]),
    );
  });
});
