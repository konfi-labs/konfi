import { AttributeInputTypeEnum, Locale } from "@konfi/types";
import {
  AttributeCreateSchema,
  AttributeTranslationCreateSchema,
} from "../../schemas";

describe("AttributeCreateSchema", () => {
  it("allows standard attribute options without advancedPreset", () => {
    const result = AttributeCreateSchema.validateSync({
      id: "paper",
      name: "Paper",
      calculated: true,
      required: false,
      format: false,
      pages: false,
      type: AttributeInputTypeEnum.DROPDOWN,
      options: [
        {
          label: "Matte",
          value: "matte",
          customFormat: false,
          hidden: false,
        },
      ],
      trackStock: false,
      createdBy: {
        id: "user-1",
        name: "Tester",
      },
    });

    expect(result.options[0]?.advancedPreset).toBeUndefined();
  });

  it("still rejects incomplete grommets config when advancedPreset is provided", () => {
    expect(() =>
      AttributeCreateSchema.validateSync(
        {
          id: "finishing",
          name: "Finishing",
          calculated: true,
          required: false,
          format: false,
          pages: false,
          type: AttributeInputTypeEnum.ADVANCED_FINISHING,
          options: [
            {
              label: "Custom",
              value: "custom",
              customFormat: false,
              hidden: false,
              advancedPreset: {
                grommets: {},
              },
            },
          ],
          trackStock: false,
          createdBy: {
            id: "user-1",
            name: "Tester",
          },
        },
        { abortEarly: false },
      ),
    ).toThrow();
  });
});

describe("AttributeTranslationCreateSchema", () => {
  it("allows option translations without advancedPreset", () => {
    const result = AttributeTranslationCreateSchema.validateSync({
      name: "Paper",
      locale: Locale.en,
      options: [
        {
          label: "Matte",
        },
      ],
      createdBy: {
        id: "user-1",
        name: "Tester",
      },
      translationMeta: {
        sourceLocale: Locale.pl,
        sourceHash: "source-hash",
        status: "manual",
      },
    });

    expect(result.options[0]?.advancedPreset).toBeUndefined();
  });
});
