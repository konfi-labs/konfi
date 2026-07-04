import { describe, expect, it } from "vitest";
import type { Attribute, Product } from "@konfi/types";
import { resolveHighConfidenceAiCostMatch } from "./cost-intelligence-ai-matching";

function product(overrides: Partial<Product> = {}): Product {
  return {
    attributeOptions: {
      paper: ["silk-350", "offset-90"],
    },
    id: "business-cards",
    name: "Business cards",
    ...overrides,
  } as unknown as Product;
}

const attributes = new Map<string, Attribute>([
  [
    "paper",
    {
      id: "paper",
      name: "Paper",
      options: [
        {
          customFormat: false,
          hidden: false,
          label: "Silk 350 g",
          value: "silk-350",
        },
      ],
    } as unknown as Attribute,
  ],
]);

describe("Fakturownia cost AI matching", () => {
  it("rejects AI matches below the high-confidence threshold", () => {
    expect(
      resolveHighConfidenceAiCostMatch({
        attributesById: attributes,
        match: {
          confidence: 0.89,
          productId: "business-cards",
        },
        products: [product()],
      }),
    ).toBeNull();
  });

  it("rejects product ids outside the bounded candidate list", () => {
    expect(
      resolveHighConfidenceAiCostMatch({
        attributesById: attributes,
        match: {
          confidence: 0.95,
          productId: "flyers",
        },
        products: [product()],
      }),
    ).toBeNull();
  });

  it("keeps valid high-confidence product and option matches", () => {
    expect(
      resolveHighConfidenceAiCostMatch({
        attributesById: attributes,
        match: {
          attributeId: "paper",
          confidence: 0.96,
          optionValue: "silk-350",
          productId: "business-cards",
        },
        products: [product()],
      }),
    ).toMatchObject({
      attributeId: "paper",
      attributeName: "Paper",
      confidence: 0.96,
      optionLabel: "Silk 350 g",
      optionValue: "silk-350",
      product: {
        id: "business-cards",
      },
      sourceSignals: ["ai_high_confidence_match"],
    });
  });

  it("keeps a product-less material match validated against the attribute catalog", () => {
    const result = resolveHighConfidenceAiCostMatch({
      attributesById: attributes,
      match: {
        attributeId: "paper",
        confidence: 0.95,
        optionValue: "silk-350",
      },
      products: [product()],
    });

    expect(result).toMatchObject({
      attributeId: "paper",
      attributeName: "Paper",
      confidence: 0.95,
      optionLabel: "Silk 350 g",
      optionValue: "silk-350",
      sourceSignals: ["ai_high_confidence_match", "ai_material_option_match"],
    });
    // Material matches are product-agnostic: no product is attached.
    expect(result).not.toHaveProperty("product");
  });

  it("rejects a match with neither a product nor a valid material", () => {
    expect(
      resolveHighConfidenceAiCostMatch({
        attributesById: attributes,
        match: { confidence: 0.95 },
        products: [product()],
      }),
    ).toBeNull();
  });

  it("rejects a product-less material whose option is not in the attribute catalog", () => {
    expect(
      resolveHighConfidenceAiCostMatch({
        attributesById: attributes,
        match: {
          attributeId: "paper",
          confidence: 0.95,
          optionValue: "unknown-999",
        },
        products: [product()],
      }),
    ).toBeNull();
  });
});
