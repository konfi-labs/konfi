import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  applyGeneratedTranslations,
  getTranslatableSourceItems,
} from "./merge";
import { createManagedTranslationDescriptor } from "./registry";

const source = {
  id: "product-1",
  name: "Kubek {size}",
  description: "Opis z {{placeholder}}",
  seo: {
    title: "Kubek",
    description: "Opis",
    slug: "kubek",
  },
};

describe("managed translation merge", () => {
  it("preserves non-empty manual fields during automatic generation", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    const items = getTranslatableSourceItems({
      descriptor,
      source,
      translation: {
        locale: Locale.en,
        name: "Manual mug",
      },
      overwrite: false,
    });

    expect(items.map((item) => item.key)).not.toContain("name");
  });

  it("writes generated metadata and active live docs", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    const output = applyGeneratedTranslations({
      descriptor,
      generatedItems: [
        { key: "name", translatedText: "Mug {size}" },
        {
          key: "description",
          translatedText: "Description with {{placeholder}}",
        },
      ],
      locale: Locale.en,
      meta: {
        sourceLocale: Locale.pl,
        sourceHash: descriptor.sourceHash,
        status: "ai_generated",
        generatedBy: "admin-1",
        generatedProvider: "google-vertex",
        generatedModel: "gemini-3.1-flash-lite",
      },
      overwrite: false,
    });

    expect(output).toMatchObject({
      active: true,
      locale: Locale.en,
      name: "Mug {size}",
      description: "Description with {{placeholder}}",
      translationMeta: {
        sourceHash: descriptor.sourceHash,
        status: "ai_generated",
      },
    });
  });

  it("updates stale fields when overwrite is explicit", () => {
    const descriptor = createManagedTranslationDescriptor("product", source);
    const output = applyGeneratedTranslations({
      descriptor,
      generatedItems: [{ key: "name", translatedText: "Fresh mug" }],
      locale: Locale.en,
      meta: {
        sourceLocale: Locale.pl,
        sourceHash: descriptor.sourceHash,
        status: "ai_generated",
      },
      overwrite: true,
      translation: {
        locale: Locale.en,
        name: "Old mug",
      },
    });

    expect(output.name).toBe("Fresh mug");
  });

  it("copies non-translatable attribute option values into generated docs", () => {
    const attribute = {
      id: "finish",
      name: "Wykonczenie",
      options: [
        {
          value: "matte",
          label: "Mat",
          customFormat: false,
          hidden: false,
        },
      ],
    };
    const descriptor = createManagedTranslationDescriptor(
      "attribute",
      attribute,
    );
    const output = applyGeneratedTranslations({
      descriptor,
      generatedItems: [{ key: "options.0.label", translatedText: "Matte" }],
      locale: Locale.en,
      meta: {
        sourceLocale: Locale.pl,
        sourceHash: descriptor.sourceHash,
        status: "ai_generated",
      },
      source: attribute,
    });

    expect(output.options).toEqual([{ value: "matte", label: "Matte" }]);
  });
});
