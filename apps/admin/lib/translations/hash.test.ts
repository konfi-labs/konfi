import { describe, expect, it } from "vitest";
import { createManagedTranslationDescriptor } from "./registry";

describe("managed translation source hashing", () => {
  it("keeps the same hash when unrelated source fields change", () => {
    const first = createManagedTranslationDescriptor("category", {
      id: "category-1",
      name: "Ulotki",
      description: "Opis",
      seo: {
        title: "Ulotki",
        description: "Opis SEO",
        slug: "ulotki",
      },
      updatedAt: "first",
    });
    const second = createManagedTranslationDescriptor("category", {
      id: "category-1",
      name: "Ulotki",
      description: "Opis",
      seo: {
        title: "Ulotki",
        description: "Opis SEO",
        slug: "ulotki",
      },
      updatedAt: "second",
    });

    expect(first.sourceHash).toBe(second.sourceHash);
  });

  it("changes the hash when translated source fields change", () => {
    const first = createManagedTranslationDescriptor("category", {
      name: "Ulotki",
      description: "Opis",
      seo: {
        title: "Ulotki",
        description: "Opis SEO",
        slug: "ulotki",
      },
    });
    const second = createManagedTranslationDescriptor("category", {
      name: "Wizytowki",
      description: "Opis",
      seo: {
        title: "Ulotki",
        description: "Opis SEO",
        slug: "ulotki",
      },
    });

    expect(first.sourceHash).not.toBe(second.sourceHash);
  });
});
