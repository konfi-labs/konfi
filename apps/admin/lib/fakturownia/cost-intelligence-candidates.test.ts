import { describe, expect, it } from "vitest";
import type { Attribute, FakturowniaCostEvidence, Product } from "@konfi/types";
import {
  rankCostProductCandidates,
  scoreCostProductCandidate,
} from "./cost-intelligence-candidates";

function evidence(
  overrides: Partial<FakturowniaCostEvidence> = {},
): FakturowniaCostEvidence {
  return {
    active: true,
    createdAt: new Date() as unknown as FakturowniaCostEvidence["createdAt"],
    createdBy: {
      id: "admin-1",
      name: "Admin",
    },
    currency: "PLN",
    id: "cost-1",
    invoice: {
      id: "invoice-1",
    },
    name: "Papier kredowy 350g / SRA3",
    normalizedText: "papier kredowy 350g sra3",
    position: {
      index: 0,
      name: "Papier kredowy 350g / SRA3",
    },
    quantity: 1,
    source: "fakturownia",
    supplier: {
      name: "Paper Supplier",
    },
    updatedAt: new Date() as unknown as FakturowniaCostEvidence["updatedAt"],
    updatedBy: {
      id: "admin-1",
      name: "Admin",
    },
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    attributeOptions: {},
    attributes: [],
    category: {
      id: "print",
      name: "Print",
    },
    description: "",
    id: "product-1",
    keywords: [],
    name: "Business cards",
    seo: {
      description: "",
      slug: "business-cards",
      title: "",
    },
    ...overrides,
  } as unknown as Product;
}

const attributes = new Map<string, Attribute>([
  [
    "paper",
    {
      id: "paper",
      keywords: ["material"],
      name: "Paper",
      options: [
        {
          customFormat: false,
          hidden: false,
          label: "Papier kredowy 350 g",
          value: "silk-350",
        },
      ],
    } as unknown as Attribute,
  ],
  [
    "format",
    {
      id: "format",
      keywords: ["size"],
      name: "Format",
      options: [
        {
          customFormat: false,
          hidden: false,
          label: "SRA3",
          value: "sra3",
        },
      ],
    } as unknown as Attribute,
  ],
]);

describe("Fakturownia cost candidate ranking", () => {
  it("finds candidates through attribute and option vocabulary", () => {
    const ranked = rankCostProductCandidates({
      attributesById: attributes,
      evidence: evidence(),
      limit: 12,
      products: [
        product({
          attributeOptions: {
            format: ["sra3"],
            paper: ["silk-350"],
          },
          attributes: ["paper", "format"],
          id: "business-cards",
          name: "Business cards",
        }),
        product({
          id: "stickers",
          name: "Stickers",
        }),
      ],
    });

    expect(ranked[0]?.product.id).toBe("business-cards");
    expect(ranked[0]?.matchedTokens).toEqual(
      expect.arrayContaining(["papier", "350", "sra3"]),
    );
  });

  it("expands mixed numeric tokens such as 350g", () => {
    const scored = scoreCostProductCandidate({
      attributesById: attributes,
      evidence: evidence({
        normalizedText: "karton 350g",
        position: {
          index: 0,
          name: "karton 350g",
        },
      }),
      product: product({
        attributeOptions: {
          paper: ["silk-350"],
        },
        attributes: ["paper"],
      }),
    });

    expect(scored.score).toBeGreaterThan(0);
    expect(scored.matchedTokens).toContain("350");
  });
});
