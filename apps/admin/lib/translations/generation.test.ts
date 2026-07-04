import { Locale } from "@konfi/types";
import { describe, expect, it, vi } from "vitest";
import {
  buildGeneratedManagedTranslationDocument,
  tryBuildGeneratedManagedTranslationDocument,
} from "./generation";
import type { GeneratedTranslationItem, TranslationSourceItem } from "./merge";
import { createManagedTranslationDescriptor } from "./registry";
import type { ManagedTranslationMeta } from "./types";

const generatedAt = {
  toDate: () => new Date("2026-01-01T00:00:00.000Z"),
  toMillis: () => 1,
} as ManagedTranslationMeta["generatedAt"];

const productSource = {
  id: "mug-1",
  name: "Kubek {{customerName}}",
  description:
    "Ceramiczny kubek z linkiem https://example.test i placeholderem {orderId}.",
  seo: {
    title: "Kubek personalizowany",
    description: "Kubek z nadrukiem dla zamówienia %s.",
    slug: "kubek-personalizowany",
  },
};

function buildParams(
  generateText: (
    items: TranslationSourceItem[],
  ) => Promise<GeneratedTranslationItem[]>,
) {
  return {
    kind: "product" as const,
    source: productSource,
    translation: null,
    locale: Locale.en,
    mode: "missing" as const,
    generatedAt,
    generatedBy: "member-1",
    generatedProvider: "google-vertex",
    generatedModel: "gemini-3-flash-lite",
    generateText,
  };
}

describe("buildGeneratedManagedTranslationDocument", () => {
  it("preserves placeholders and writes generated metadata", async () => {
    const descriptor = createManagedTranslationDescriptor(
      "product",
      productSource,
    );
    const generateText = vi.fn(async () => [
      {
        key: "name",
        translatedText: "Mug {{customerName}}",
      },
      {
        key: "description",
        translatedText:
          "Ceramic mug with link https://example.test and placeholder {orderId}.",
      },
      {
        key: "seo.title",
        translatedText: "Personalized mug",
      },
      {
        key: "seo.description",
        translatedText: "Printed mug for order %s.",
      },
      {
        key: "seo.slug",
        translatedText: "personalized-mug",
      },
    ]);

    const result = await buildGeneratedManagedTranslationDocument(
      buildParams(generateText),
    );

    expect(result.document.name).toBe("Mug {{customerName}}");
    expect(result.document.description).toContain("{orderId}");
    expect(result.document.seo).toMatchObject({
      description: "Printed mug for order %s.",
      slug: "personalized-mug",
    });
    expect(result.document.translationMeta).toMatchObject({
      sourceLocale: Locale.pl,
      sourceHash: descriptor.sourceHash,
      status: "ai_generated",
      generatedBy: "member-1",
      generatedProvider: "google-vertex",
      generatedModel: "gemini-3-flash-lite",
    });
    expect(result.document.active).toBe(true);
    expect(result.generatedFieldCount).toBe(5);
  });

  it("does not overwrite non-empty manual fields during missing generation", async () => {
    const descriptor = createManagedTranslationDescriptor(
      "product",
      productSource,
    );
    const generateText = vi.fn(async (items: TranslationSourceItem[]) =>
      items.map((item) => ({
        key: item.key,
        translatedText: `generated:${item.key}`,
      })),
    );

    const result = await buildGeneratedManagedTranslationDocument({
      ...buildParams(generateText),
      translation: {
        locale: Locale.en,
        active: true,
        name: "Manual mug name",
        description: "",
        translationMeta: {
          sourceLocale: Locale.pl,
          sourceHash: descriptor.sourceHash,
          status: "manual",
        },
      },
    });

    expect(
      generateText.mock.calls[0]?.[0].map((item) => item.key),
    ).not.toContain("name");
    expect(result.document.name).toBe("Manual mug name");
    expect(result.document.description).toBe("generated:description");
    expect(result.document.translationMeta?.status).toBe("ai_generated");
  });

  it("returns a failure result when provider generation fails", async () => {
    const result = await tryBuildGeneratedManagedTranslationDocument(
      buildParams(async () => {
        throw new Error("provider unavailable");
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: "provider unavailable",
    });
  });
});
