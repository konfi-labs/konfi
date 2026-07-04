import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type {
  ExternalProduct,
  ExternalAttribute,
  AttributeMapping,
  FetchExternalProductRequest,
  FetchExternalProductResponse,
} from "../external-product";
import type { NestedMember } from "../../configuration/member";

describe("ExternalProduct Types", () => {
  describe("ExternalAttribute", () => {
    it("should have required fields", () => {
      const attribute: ExternalAttribute = {
        name: "Paper Type",
        values: ["Glossy", "Matte", "Uncoated"],
      };

      expect(attribute.name).toBe("Paper Type");
      expect(attribute.values).toHaveLength(3);
    });

    it("should support optional fields", () => {
      const attribute: ExternalAttribute = {
        name: "Finish",
        values: ["Gloss", "Matt"],
        category: "finish",
        affectsPricing: true,
      };

      expect(attribute.category).toBe("finish");
      expect(attribute.affectsPricing).toBe(true);
    });
  });

  describe("AttributeMapping", () => {
    it("should map external to internal attributes", () => {
      const mapping: AttributeMapping = {
        externalAttributeName: "Paper Type",
        internalAttributeId: "attr-paper-123",
        confidence: 0.95,
        verified: true,
        optionMappings: {
          Glossy: "glossy",
          Matte: "matte",
        },
      };

      expect(mapping.externalAttributeName).toBe("Paper Type");
      expect(mapping.internalAttributeId).toBe("attr-paper-123");
      expect(mapping.confidence).toBe(0.95);
      expect(mapping.optionMappings?.["Glossy"]).toBe("glossy");
    });

    it("should allow unverified mappings", () => {
      const mapping: AttributeMapping = {
        externalAttributeName: "Size",
        confidence: 0.65,
        verified: false,
      };

      expect(mapping.verified).toBe(false);
      expect(mapping.internalAttributeId).toBeUndefined();
    });

    it("should support provider-only pricing defaults", () => {
      const mapping: AttributeMapping = {
        externalAttributeName: "Delivery",
        providerOnlyPricing: true,
        fixedExternalValue: "standard",
        verified: true,
      };

      expect(mapping.providerOnlyPricing).toBe(true);
      expect(mapping.fixedExternalValue).toBe("standard");
      expect(mapping.internalAttributeId).toBeUndefined();
    });
  });

  describe("FetchExternalProductRequest", () => {
    it("should validate required URL field", () => {
      const request: FetchExternalProductRequest = {
        url: "https://example.com/product/123",
      };

      expect(request.url).toBe("https://example.com/product/123");
    });

    it("should support optional fields", () => {
      const request: FetchExternalProductRequest = {
        url: "https://example.com/product/456",
        providerId: "provider-1",
        forceRefresh: true,
      };

      expect(request.providerId).toBe("provider-1");
      expect(request.forceRefresh).toBe(true);
    });
  });

  describe("FetchExternalProductResponse", () => {
    it("should handle success response", () => {
      const systemMember: NestedMember = { id: "system", name: "System" };
      const now = Timestamp.now();

      const response: FetchExternalProductResponse = {
        success: true,
        externalProduct: {
          id: "ext-prod-1",
          source: {
            url: "https://example.com/product",
            type: "website",
            platform: "example.com",
            accessible: true,
          },
          originalName: "Test Product",
          attributes: [],
          imported: false,
          name: "Test Product",
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: systemMember,
          updatedBy: systemMember,
        },
      };

      expect(response.success).toBe(true);
      expect(response.externalProduct?.originalName).toBe("Test Product");
    });

    it("should handle error response", () => {
      const response: FetchExternalProductResponse = {
        success: false,
        error: "Failed to fetch URL",
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe("Failed to fetch URL");
    });
  });

  describe("ExternalProduct", () => {
    it("should have complete structure", () => {
      const systemMember: NestedMember = { id: "system", name: "System" };
      const now = Timestamp.now();

      const product: ExternalProduct = {
        id: "ext-prod-1",
        source: {
          url: "https://example.com/product/business-cards",
          type: "website",
          platform: "example.com",
          accessible: true,
        },
        originalName: "Premium Business Cards",
        originalDescription: "High-quality business cards",
        images: [
          "https://example.com/images/card1.jpg",
          "https://example.com/images/card2.jpg",
        ],
        attributes: [
          {
            name: "Paper Type",
            values: ["Glossy", "Matte"],
            category: "paper",
            affectsPricing: true,
          },
          {
            name: "Quantity",
            values: ["100", "250", "500"],
            category: "quantity",
            affectsPricing: true,
          },
        ],
        attributeMappings: [
          {
            externalAttributeName: "Paper Type",
            internalAttributeId: "attr-paper",
            confidence: 0.95,
            verified: true,
            optionMappings: {
              Glossy: "glossy",
              Matte: "matte",
            },
          },
        ],
        priceInfo: {
          currency: "USD",
          priceText: "$50 - $200",
        },
        specifications: {
          dimensions: "3.5 x 2 inches",
          weight: "14pt",
        },
        keywords: ["business cards", "printing", "premium"],
        imported: false,
        importStatus: "pending",
        contentHash: "abc123def456",
        name: "Premium Business Cards",
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: systemMember,
        updatedBy: systemMember,
      };

      expect(product.originalName).toBe("Premium Business Cards");
      expect(product.attributes).toHaveLength(2);
      expect(product.attributeMappings).toHaveLength(1);
      expect(product.images).toHaveLength(2);
      expect(product.importStatus).toBe("pending");
      expect(product.specifications?.dimensions).toBe("3.5 x 2 inches");
    });

    it("should support minimal external product", () => {
      const systemMember: NestedMember = { id: "system", name: "System" };
      const now = Timestamp.now();

      const product: ExternalProduct = {
        id: "ext-prod-2",
        source: {
          url: "https://minimal.com/product",
          type: "api",
        },
        originalName: "Minimal Product",
        attributes: [],
        name: "Minimal Product",
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: systemMember,
        updatedBy: systemMember,
      };

      expect(product.originalName).toBe("Minimal Product");
      expect(product.source.type).toBe("api");
    });
  });
});
