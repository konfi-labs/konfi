import { describe, expect, it, vi } from "vitest";
import type { ProductWithAttributes } from "./types";

const aiMock = vi.hoisted(() => ({
  createMeteredAdminGenerateText: vi.fn(
    ({ generateText }: { generateText: unknown }) => generateText,
  ),
  generateText: vi.fn(),
  outputArray: vi.fn((input: unknown) => input),
  outputObject: vi.fn((input: unknown) => input),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  generateText: aiMock.generateText,
  Output: {
    array: aiMock.outputArray,
    object: aiMock.outputObject,
  },
}));
vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: () => () => "model",
}));
vi.mock("@/lib/ai/vertex-language-model.server", () => ({
  getAdminVertexLanguageModel: vi.fn(async () => "model"),
}));
vi.mock("@/lib/ai/metered-text", () => ({
  createMeteredAdminGenerateText: aiMock.createMeteredAdminGenerateText,
}));

import {
  buildProductSelectionReference,
  compactAttributeOptionsForQuestion,
  suggestProductRequestDetails,
  splitQuestionByProducts,
} from "./ai-functions";

describe("product suggestion prompt compaction", () => {
  it("keeps product selection references compact", () => {
    const products: ProductWithAttributes[] = [
      {
        productId: "poster",
        productName: "Plakaty",
        attributesWithOptions: Array.from(
          { length: 8 },
          (_attribute, attributeIndex) => ({
            attributeName: `Attribute ${attributeIndex}`,
            options: Array.from(
              { length: 20 },
              (_option, optionIndex) =>
                `Option ${attributeIndex}-${optionIndex}`,
            ),
          }),
        ),
      },
    ];

    const reference = buildProductSelectionReference(products);

    expect(reference).toEqual([
      {
        productId: "poster",
        productName: "Plakaty",
        attributeHints: [
          "Attribute 0: Option 0-0, Option 0-1, Option 0-2, Option 0-3, Option 0-4, Option 0-5",
          "Attribute 1: Option 1-0, Option 1-1, Option 1-2, Option 1-3, Option 1-4, Option 1-5",
          "Attribute 2: Option 2-0, Option 2-1, Option 2-2, Option 2-3, Option 2-4, Option 2-5",
          "Attribute 3: Option 3-0, Option 3-1, Option 3-2, Option 3-3, Option 3-4, Option 3-5",
        ],
      },
    ]);
  });

  it("caps combination options while preserving query-relevant choices", () => {
    const formatOptions = [
      "A6",
      "A5",
      "A4",
      "A3",
      "A2",
      ...Array.from({ length: 40 }, (_, index) => `Format ${index}`),
      "B1",
      "B2",
    ];
    const paperOptions = [
      "Kreda 135g",
      "Kreda 170g",
      "Kreda 250g",
      "Offset",
      ...Array.from({ length: 30 }, (_, index) => `Papier ${index}`),
      "Papier plakatowy",
    ];

    const result = compactAttributeOptionsForQuestion(
      {
        Format: formatOptions,
        Papier: paperOptions,
      },
      "Potrzebuję plakaty B1 i B2",
    );

    expect(result.Format).toContain("B1");
    expect(result.Format).toContain("B2");
    expect(result.Papier).toContain("Papier plakatowy");
    expect(result.Format).toHaveLength(20);
    expect(result.Papier).toHaveLength(20);
  });

  it("uses the only narrowed product candidate when model selection is empty", async () => {
    aiMock.generateText.mockResolvedValueOnce({ output: [] });

    const result = await splitQuestionByProducts("100 wizytówek", [
      {
        productId: "business-cards",
        productName: "Wizytówki",
        attributesWithOptions: [],
      },
    ]);

    expect(result).toEqual([
      {
        productId: "business-cards",
        question: "100 wizytówek",
      },
    ]);
  });

  it("passes tenant and channel context to metered AI calls", async () => {
    aiMock.generateText.mockResolvedValueOnce({ output: [] });

    await splitQuestionByProducts(
      "100 wizytówek",
      [
        {
          productId: "business-cards",
          productName: "Wizytówki",
          attributesWithOptions: [],
        },
      ],
      {
        channelId: "tenant-a_default",
        tenantId: "tenant-a",
      },
    );

    expect(aiMock.createMeteredAdminGenerateText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channelId: "tenant-a_default",
        model: "gemini-3.1-flash-lite",
        tenantId: "tenant-a",
      }),
    );
  });

  it("uses the lite model for product splitting", async () => {
    aiMock.generateText.mockResolvedValueOnce({ output: [] });

    await splitQuestionByProducts("100 wizytówek", [
      {
        productId: "business-cards",
        productName: "Wizytówki",
        attributesWithOptions: [],
      },
    ]);

    expect(aiMock.createMeteredAdminGenerateText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: "gemini-3.1-flash-lite",
      }),
    );
  });

  it("infers product request details in one structured call", async () => {
    aiMock.generateText.mockResolvedValueOnce({
      output: {
        customSizes: [
          { width: 707, height: 1000, quantity: 40 },
          { width: 500, height: 707, quantity: 40 },
        ],
        hasMultipleSizes: true,
        height: 1000,
        sizesCount: 2,
        volume: 80,
        width: 707,
      },
    });

    const result = await suggestProductRequestDetails({
      customFormat: true,
      defaultVolume: 1,
      minHeight: 707,
      minWidth: 500,
      question: "40 plakatów B1 i 40 plakatów B2",
    });

    expect(result).toMatchObject({
      hasMultipleSizes: true,
      sizesCount: 2,
      volume: 80,
    });
    expect(aiMock.outputObject).toHaveBeenCalled();
    expect(aiMock.createMeteredAdminGenerateText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: "gemini-3.1-flash-lite",
      }),
    );
  });

  it("keeps up to two known product candidates for price comparison", async () => {
    aiMock.generateText.mockResolvedValueOnce({
      output: [
        {
          question: "4 vouchery 148x105 mm, kolor dwustronnie, kreda 250g",
          productId: "flyers",
          candidateProductIds: ["prints", "unknown", "flyers"],
        },
      ],
    });

    const result = await splitQuestionByProducts(
      "Potrzebuję wydrukować dzisiaj 4 vouchery prezentowe w kolorze dwustronnie, format 148 mm x 105 mm, papier kredowy 250g.",
      [
        {
          productId: "flyers",
          productName: "Ulotki",
          attributesWithOptions: [],
        },
        {
          productId: "prints",
          productName: "Wydruki",
          attributesWithOptions: [],
        },
      ],
    );

    expect(result).toEqual([
      {
        question: "4 vouchery 148x105 mm, kolor dwustronnie, kreda 250g",
        productId: "flyers",
        candidateProductIds: ["flyers", "prints"],
      },
    ]);
  });
});
