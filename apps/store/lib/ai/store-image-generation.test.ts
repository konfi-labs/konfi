import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  Attribute,
  CurrencyEnum,
  Product,
  PriceTypeEnum,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import {
  canAccessStoreImageGenerationProduct,
  DEFAULT_STORE_GENERATION_STYLE,
  buildStoreGeneratedImageHistoryEntry,
  IMPROVE_GENERATION_PROMPT_SYSTEM,
  buildGenerationPrompt,
  deriveGenerationContext,
  getStoreImageGenerationMonthKey,
  isStoreGeneratedImageExpired,
  isStoreImageGenerationRateLimitEnabled,
  reserveStoreImageGenerationBudget,
  sanitizePrompt,
} from "./store-image-generation.shared";

const nestedMember: Product["createdBy"] = {
  id: "member-1",
  name: "Test Member",
};

function createProduct(overrides?: Partial<Product>): Product {
  return {
    id: "product-1",
    name: "Event Flyer",
    active: true,
    createdAt: Timestamp.now(),
    createdBy: nestedMember,
    updatedAt: Timestamp.now(),
    updatedBy: nestedMember,
    prices: [],
    defaultPrice: { value: 0, currency: CurrencyEnum.PLN },
    lowPrice: { value: 0, currency: CurrencyEnum.PLN },
    highPrice: { value: 0, currency: CurrencyEnum.PLN },
    description: "Premium flyer for seasonal promotional campaigns.",
    volumes: [],
    attributes: ["format", "pages"],
    attributeOptions: {
      format: ["a4"],
      pages: ["8"],
    },
    customSize: false,
    allowCustomPrice: false,
    recommended: false,
    difficulty: 1,
    shipping: { types: [ShippingTypes.COURIER] },
    spec: {
      images: [],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 1000,
      step: 1,
      minimumWidth: 210,
      minimumHeight: 297,
    },
    category: {
      id: "cat-1",
      name: "Flyers",
      seo: { title: "Flyers", description: "Flyers", slug: "flyers" },
    },
    seo: {
      slug: "event-flyer",
      title: "Event Flyer",
      description: "Event Flyer",
    },
    productType: {
      id: "type-1",
      name: "Marketing print",
    },
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    availability: {
      published: true,
      availableForPurchase: true,
    },
    keywords: [],
    ...overrides,
  } as Product;
}

function createAttributes(): Attribute[] {
  return [
    {
      id: "format",
      name: "Format",
      active: true,
      createdAt: Timestamp.now(),
      createdBy: nestedMember,
      updatedAt: Timestamp.now(),
      updatedBy: nestedMember,
      calculated: false,
      required: true,
      format: true,
      options: [
        {
          label: "A4",
          value: "a4",
          customFormat: false,
          hidden: false,
          formatWidth: 210,
          formatHeight: 297,
        },
      ],
      keywords: [],
      type: "RADIO_GROUP",
      trackStock: false,
    },
    {
      id: "pages",
      name: "Pages",
      active: true,
      createdAt: Timestamp.now(),
      createdBy: nestedMember,
      updatedAt: Timestamp.now(),
      updatedBy: nestedMember,
      calculated: false,
      required: true,
      format: false,
      pages: true,
      options: [
        {
          label: "8 pages",
          value: "8",
          customFormat: false,
          hidden: false,
          pages: 8,
        },
      ],
      keywords: [],
      type: "RADIO_GROUP",
      trackStock: false,
    },
    {
      id: "printingSides",
      name: "Printing Sides",
      active: true,
      createdAt: Timestamp.now(),
      createdBy: nestedMember,
      updatedAt: Timestamp.now(),
      updatedBy: nestedMember,
      calculated: false,
      required: true,
      format: false,
      options: [
        {
          label: "Color Front Only (4+0)",
          value: "4+0",
          customFormat: false,
          hidden: false,
        },
        {
          label: "Color Both Sides (4+4)",
          value: "4+4",
          customFormat: false,
          hidden: false,
        },
      ],
      keywords: [],
      type: "RADIO_GROUP",
      trackStock: false,
    },
  ];
}

describe("store image generation helpers", () => {
  it("sanitizes a valid prompt", () => {
    const prompt = sanitizePrompt(
      "<b>Create</b> a premium flyer concept for a spring coffee tasting event with warm cream tones, elegant green accents, editorial typography, clear hierarchy, event details, a refined call to action, and a calm modern layout suitable for print production and real customer distribution.",
    );

    expect(prompt).not.toContain("<b>");
    expect(prompt).toContain("spring coffee tasting event");
  });

  it("rejects prompts with urls", () => {
    expect(() =>
      sanitizePrompt(
        "Create a poster for our event and use the same message as https://example.com while keeping the same colors, visuals, layout, and all other details from the page for print production and distribution across the city center next week.",
      ),
    ).toThrow("unsupported URL or markup");
  });

  it("derives size, aspect ratio, and page count from product data", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
      selectedAttributeOptions: {
        format: "a4",
        pages: "8",
      },
    });

    expect(context.sizeLabel).toBe("210 × 297 mm");
    expect(context.aspectRatio).toBe("2:3");
    expect(context.pageLabel).toBe("8 pages");
    expect(context.isLargeFormat).toBe(false);
  });

  it("marks large custom formats for verification guidance", () => {
    const context = deriveGenerationContext({
      product: createProduct({ customSize: true }),
      attributes: createAttributes(),
      requestedWidth: 600,
      requestedHeight: 1000,
    });

    expect(context.sizeLabel).toBe("600 × 1,000 mm");
    expect(context.isLargeFormat).toBe(true);
  });

  it("uses requested dimensions when no format selection is available", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: [],
      requestedWidth: 148,
      requestedHeight: 210,
    });

    expect(context.sizeLabel).toBe("148 × 210 mm");
    expect(context.aspectRatio).toBe("2:3");
    expect(context.isLargeFormat).toBe(false);
  });

  it("builds a combination description from selected attributes", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
      selectedAttributeOptions: {
        format: "a4",
        printingSides: "4+4",
      },
    });

    expect(context.combinationDescription).toBe(
      "Format: A4; Printing Sides: Color Both Sides (4+4)",
    );
    expect(context.printSideCount).toBe(1);
  });

  it("tells prompt improvement to preserve literal user copy", () => {
    expect(IMPROVE_GENERATION_PROMPT_SYSTEM).toContain(
      "Preserve any user-provided literal copy exactly as written",
    );
    expect(IMPROVE_GENERATION_PROMPT_SYSTEM).toContain("company names");
    expect(IMPROVE_GENERATION_PROMPT_SYSTEM).toContain("phone numbers");
    expect(IMPROVE_GENERATION_PROMPT_SYSTEM).toContain(
      "Do not translate, normalize, correct, shorten, expand, paraphrase, or replace",
    );
  });

  it("builds a prompt that states the product and format context", () => {
    const context = deriveGenerationContext({
      product: createProduct({ customSize: true }),
      attributes: createAttributes(),
      requestedWidth: 600,
      requestedHeight: 1000,
      requestedPageCount: 4,
    });

    const prompt = buildGenerationPrompt({
      prompt:
        "Design a bold conference roll-up with high contrast typography, a strong headline area, minimal copy, and geometric accents.",
      context,
      style: "elegancki",
      language: "Polish",
    });

    expect(prompt).toContain("Product: Event Flyer.");
    expect(prompt).toContain("Target size: 600 × 1,000 mm.");
    expect(prompt).toContain("large-format print");
    expect(prompt).toContain("Preferred user-selected style: elegancki.");
    expect(prompt).toContain("Keep any visible copy in Polish.");
  });

  it("falls back to the default style when none is provided", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
    });

    const prompt = buildGenerationPrompt({
      prompt:
        "Create a premium poster with a strong headline, generous spacing, clean visual hierarchy, and enough contrast to remain readable from distance.",
      context,
    });

    expect(prompt).toContain(
      `Preferred user-selected style: ${DEFAULT_STORE_GENERATION_STYLE}.`,
    );
  });

  it("allows draft products only for admin preview generation", () => {
    const draftProduct = createProduct({
      active: false,
      availability: {
        availableForPurchase: false,
        published: false,
      },
    });

    expect(canAccessStoreImageGenerationProduct(draftProduct, false)).toBe(
      false,
    );
    expect(canAccessStoreImageGenerationProduct(draftProduct, true)).toBe(true);
  });

  it("enables the hourly rate limit only in production", () => {
    expect(isStoreImageGenerationRateLimitEnabled("production")).toBe(true);
    expect(isStoreImageGenerationRateLimitEnabled("development")).toBe(false);
    expect(isStoreImageGenerationRateLimitEnabled("test")).toBe(false);
  });

  it("builds a prompt that forces flat back-side artwork for two-sided products", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
      selectedAttributeOptions: {
        format: "a4",
        printingSides: "4+4",
      },
    });

    const prompt = buildGenerationPrompt({
      prompt:
        "Create a refined conference handout with strong typography, clear event details, and a quieter secondary side with supporting information.",
      context: {
        ...context,
        printSideCount: 2,
      },
      targetSide: "back",
    });

    expect(prompt).toContain("Generate only the BACK side artwork");
    expect(prompt).toContain(
      "Output only the flat 2D printable design itself.",
    );
    expect(prompt).toContain("Do not render the physical product");
  });

  it("includes product-specific prompt enhancements when configured", () => {
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
    });

    const prompt = buildGenerationPrompt({
      prompt:
        "Design a bold conference roll-up with high contrast typography, a strong headline area, minimal copy, and geometric accents.",
      context,
      promptEnhancement:
        "Always keep the layout premium, calm, and editorial for this product.",
    });

    expect(prompt).toContain(
      "Product-specific direction: Always keep the layout premium, calm, and editorial for this product.",
    );
  });

  it("builds the monthly budget key from the current UTC month", () => {
    expect(
      getStoreImageGenerationMonthKey(new Date("2026-04-18T14:44:55.764Z")),
    ).toBe("2026-04");
  });

  it("builds a compact Firestore history entry for generated images", () => {
    const generatedAt = new Date("2026-04-19T14:44:55.764Z");
    const context = deriveGenerationContext({
      product: createProduct(),
      attributes: createAttributes(),
      selectedAttributeOptions: {
        format: "a4",
        pages: "8",
      },
    });

    expect(
      buildStoreGeneratedImageHistoryEntry({
        context,
        generatedAt,
        imageSide: "single",
        model: "gemini-test",
        productId: "product-1",
        prompt:
          "Create a premium event flyer with clear hierarchy, elegant typography, and calm editorial spacing for print.",
        storagePath: "ai/generated/users/user-1/2026-04-19/model/product-1/file.png",
        url: "https://example.com/generated.png",
      }),
    ).toEqual({
      url: "https://example.com/generated.png",
      storagePath:
        "ai/generated/users/user-1/2026-04-19/model/product-1/file.png",
      generatedAt: "2026-04-19T14:44:55.764Z",
      generatedAtMs: generatedAt.getTime(),
      expiresAt: "2026-04-26T14:44:55.764Z",
      expiresAtMs: Date.parse("2026-04-26T14:44:55.764Z"),
      productId: "product-1",
      prompt:
        "Create a premium event flyer with clear hierarchy, elegant typography, and calm editorial spacing for print.",
      productName: "Event Flyer",
      model: "gemini-test",
      side: "single",
      pageLabel: "8 pages",
      sizeLabel: "210 × 297 mm",
      aspectRatio: "2:3",
    });
  });

  it("treats generated images as expired after the retention window", () => {
    expect(
      isStoreGeneratedImageExpired({
        generatedAt: "2026-04-01T12:00:00.000Z",
        nowMs: Date.parse("2026-04-08T12:00:00.000Z"),
      }),
    ).toBe(true);

    expect(
      isStoreGeneratedImageExpired({
        generatedAt: "2026-04-01T12:00:00.000Z",
        nowMs: Date.parse("2026-04-08T11:59:59.000Z"),
      }),
    ).toBe(false);
  });

  it("reserves monthly budget within the configured limit", () => {
    expect(
      reserveStoreImageGenerationBudget({
        currentReservedUsdMicros: 19_990_000,
        estimatedGenerationCostUsdMicros: 3_225,
        monthlyBudgetUsdMicros: 20_000_000,
      }),
    ).toEqual({
      nextReservedUsdMicros: 19_993_225,
      remainingBudgetUsdMicros: 6_775,
    });
  });

  it("rejects budget reservations that would exceed the monthly cap", () => {
    expect(() =>
      reserveStoreImageGenerationBudget({
        currentReservedUsdMicros: 19_999_000,
        estimatedGenerationCostUsdMicros: 3_225,
        monthlyBudgetUsdMicros: 20_000_000,
      }),
    ).toThrow("MONTHLY_BUDGET_EXCEEDED");
  });
});
