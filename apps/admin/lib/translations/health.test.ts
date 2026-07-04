import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import { getManagedTranslationHealth } from "./health";
import { createManagedTranslationDescriptor } from "./registry";
import type { ManagedTranslationDocument } from "./types";

const source = {
  id: "product-1",
  name: "Wizytówki",
  description: "Matowe wizytówki",
  seo: {
    title: "Wizytówki online",
    description: "Zamów wizytówki",
    slug: "wizytowki",
  },
};

function health(translation?: ManagedTranslationDocument | null) {
  const descriptor = createManagedTranslationDescriptor("product", source);
  return getManagedTranslationHealth({
    descriptor,
    source,
    translation,
  });
}

describe("getManagedTranslationHealth", () => {
  it("reports missing translations", () => {
    expect(health(null).status).toBe("missing");
  });

  it("reports incomplete translations when required fields are empty", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    expect(
      health({
        locale: Locale.en,
        name: "Business cards",
        description: "",
        translationMeta: {
          sourceLocale: Locale.pl,
          sourceHash: descriptor.sourceHash,
          status: "manual",
        },
      }).status,
    ).toBe("incomplete");
  });

  it("reports stale translations when the source hash differs", () => {
    expect(
      health({
        locale: Locale.en,
        name: "Business cards",
        description: "Matte business cards",
        seo: {
          title: "Business cards online",
          description: "Order business cards",
          slug: "business-cards",
        },
        translationMeta: {
          sourceLocale: Locale.pl,
          sourceHash: "old-hash",
          status: "manual",
        },
      }).status,
    ).toBe("stale");
  });

  it("reports AI drafts before review", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    expect(
      health({
        locale: Locale.en,
        name: "Business cards",
        description: "Matte business cards",
        seo: {
          title: "Business cards online",
          description: "Order business cards",
          slug: "business-cards",
        },
        translationMeta: {
          sourceLocale: Locale.pl,
          sourceHash: descriptor.sourceHash,
          status: "ai_generated",
        },
      }).status,
    ).toBe("aiDraft");
  });

  it("reports reviewed and complete translations", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    const translation = {
      locale: Locale.en,
      name: "Business cards",
      description: "Matte business cards",
      seo: {
        title: "Business cards online",
        description: "Order business cards",
        slug: "business-cards",
      },
      translationMeta: {
        sourceLocale: Locale.pl,
        sourceHash: descriptor.sourceHash,
        status: "reviewed" as const,
      },
    };

    expect(health(translation).status).toBe("reviewed");
    expect(
      health({
        ...translation,
        translationMeta: {
          ...translation.translationMeta,
          status: "manual",
        },
      }).status,
    ).toBe("complete");
  });
});
