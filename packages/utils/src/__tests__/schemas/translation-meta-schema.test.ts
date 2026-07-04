import { Locale } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  AttributeTranslationCreateSchema,
  ProductTranslationCreateSchema,
} from "../../schemas";

describe("managed translation schemas", () => {
  it("allows manual translation form values before translationMeta is appended", () => {
    const productTranslation = ProductTranslationCreateSchema.validateSync({
      name: "Business Cards",
      locale: Locale.en,
      description: "Premium cards",
      seo: {
        title: "Business Cards",
        description: "Premium cards",
        slug: "business-cards",
      },
      specialNotes: "",
      active: true,
      createdBy: {
        id: "user-1",
        name: "Tester",
      },
    });

    expect(productTranslation.translationMeta).toBeUndefined();

    const attributeTranslation = AttributeTranslationCreateSchema.validateSync({
      name: "Paper",
      locale: Locale.en,
      options: [
        {
          value: "matte",
          label: "Matte",
        },
      ],
      active: true,
      createdBy: {
        id: "user-1",
        name: "Tester",
      },
    });

    expect(attributeTranslation.translationMeta).toBeUndefined();
  });

  it("still rejects incomplete translationMeta when it is supplied", () => {
    expect(() =>
      ProductTranslationCreateSchema.validateSync(
        {
          name: "Business Cards",
          locale: Locale.en,
          description: "Premium cards",
          active: true,
          createdBy: {
            id: "user-1",
            name: "Tester",
          },
          translationMeta: {
            status: "manual",
          },
        },
        { abortEarly: false },
      ),
    ).toThrow();
  });
});
