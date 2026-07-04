import { describe, expect, it, vi } from "vitest";
import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import {
  buildExternalPageCountConstraintsFromSourceRows,
  buildExternalDynamicPricingPrompt,
  buildExternalDynamicPricingSourceRows,
  type GeneratedDynamicPricingPlan,
  normalizeGeneratedExternalDynamicPricingConfig,
} from "./external-product-dynamic-pricing-agent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: () => {
    throw new Error("Vertex client should not be used in deterministic tests.");
  },
}));

const option = (value: string, label: string) => ({
  customFormat: false,
  hidden: false,
  label,
  value,
});

const paperAttribute = {
  id: "paper",
  name: "Paper",
  options: [option("matte", "Matte"), option("glossy", "Glossy")],
};

const externalPaperAttribute: ExternalAttribute = {
  id: "paper",
  name: "Paper",
  values: ["mat", "gloss", "silk"],
};

const paperMapping: AttributeMapping = {
  externalAttributeName: "paper",
  internalAttributeId: "paper",
  optionMappings: {
    gloss: "glossy",
    mat: "matte",
    silk: "silk",
  },
};

describe("external product dynamic pricing agent helpers", () => {
  it("skips supplier rows for mapped options that are not allowed internally", () => {
    const rows = buildExternalDynamicPricingSourceRows({
      configurations: [
        {
          configuration: { paper: "mat" },
          priceRanges: [{ price: 500, quantity: 50 }],
        },
        {
          configuration: { paper: "silk" },
          priceRanges: [{ price: 700, quantity: 50 }],
        },
      ],
      externalAttributes: [externalPaperAttribute],
      productAttributeOptions: { paper: ["matte", "glossy"] },
      selectedMappings: [paperMapping],
    });

    expect(rows).toEqual([
      {
        price: 500,
        quantity: 50,
        selection: { paper: "matte" },
      },
    ]);
  });

  it("does not fall back to generic prices when configured rows were excluded", () => {
    const rows = buildExternalDynamicPricingSourceRows({
      configurations: [
        {
          configuration: { paper: "silk" },
          priceRanges: [{ price: 700, quantity: 50 }],
        },
      ],
      externalAttributes: [externalPaperAttribute],
      fallbackPriceRanges: [{ price: 500, quantity: 50 }],
      productAttributeOptions: { paper: ["matte", "glossy"] },
      selectedMappings: [paperMapping],
    });

    expect(rows).toEqual([]);
  });

  it("keeps the highest supplier price for duplicate internal rows", () => {
    const rows = buildExternalDynamicPricingSourceRows({
      configurations: [
        {
          configuration: { paper: "mat" },
          priceRanges: [
            { deliveryTime: 3, price: 500, quantity: 50 },
            { deliveryTime: 5, price: 650, quantity: 50 },
          ],
        },
      ],
      externalAttributes: [externalPaperAttribute],
      productAttributeOptions: { paper: ["matte", "glossy"] },
      selectedMappings: [paperMapping],
    });

    expect(rows).toEqual([
      {
        deliveryTime: 5,
        price: 650,
        quantity: 50,
        selection: { paper: "matte" },
      },
    ]);
  });

  it("infers page-count constraints from mapped supplier rows", () => {
    const rows = [
      {
        pageCount: 16,
        price: 500,
        quantity: 50,
        selection: { paper: "matte" },
      },
      {
        pageCount: 64,
        price: 900,
        quantity: 50,
        selection: { paper: "matte" },
      },
      {
        pageCount: 16,
        price: 700,
        quantity: 50,
        selection: { paper: "glossy" },
      },
      {
        pageCount: 32,
        price: 950,
        quantity: 50,
        selection: { paper: "glossy" },
      },
    ];

    const constraints = buildExternalPageCountConstraintsFromSourceRows({
      pageCount: {
        coverPages: 4,
        enabled: true,
        maximum: 64,
        minimum: 16,
        step: 16,
      },
      productAttributeOptions: { paper: ["matte", "glossy"] },
      rows,
    });

    expect(constraints).toEqual([
      {
        conditions: [
          {
            attributeId: "paper",
            optionValues: ["glossy"],
          },
        ],
        maximum: 32,
      },
    ]);
  });

  it("builds a compact line prompt instead of serializing row objects", () => {
    const prompt = buildExternalDynamicPricingPrompt({
      attributes: [paperAttribute],
      pageCount: {
        constraints: [
          {
            conditions: [
              {
                attributeId: "paper",
                optionValues: ["glossy"],
              },
            ],
            maximum: 32,
          },
        ],
        coverPages: 4,
        enabled: true,
        maximum: 64,
        minimum: 16,
        step: 16,
      },
      productAttributeOptions: { paper: ["matte", "glossy"] },
      productName: "Business cards",
      rows: [
        {
          price: 489,
          quantity: 50,
          selection: { paper: "matte" },
        },
      ],
      volumes: [50],
    });

    expect(prompt).toContain("R1 q=50 p=4.89 s=paper:matte");
    expect(prompt).toContain("c=paper:glossy <=32");
    expect(prompt).not.toContain("{");
    expect(prompt).not.toContain("configuration");
  });

  it("accepts compact configs that keep supplier rows profitable", () => {
    const plan = {
      supported: true,
      basePrice: 6,
      baseDeliveryTime: 2,
      attributeRules: [],
      globalRules: [],
    } satisfies GeneratedDynamicPricingPlan;

    const config = normalizeGeneratedExternalDynamicPricingConfig({
      attributes: [paperAttribute],
      plan,
      productAttributeOptions: { paper: ["matte"] },
      rows: [
        {
          price: 500,
          quantity: 50,
          selection: { paper: "matte" },
        },
      ],
    });

    expect(config?.basePrice).toBe(600);
  });

  it("rejects configs that can underprice supplier rows", () => {
    const plan = {
      supported: true,
      basePrice: 4.98,
      attributeRules: [],
      globalRules: [],
    } satisfies GeneratedDynamicPricingPlan;

    const config = normalizeGeneratedExternalDynamicPricingConfig({
      attributes: [paperAttribute],
      plan,
      productAttributeOptions: { paper: ["matte"] },
      rows: [
        {
          price: 500,
          quantity: 50,
          selection: { paper: "matte" },
        },
      ],
    });

    expect(config).toBeNull();
  });
});
