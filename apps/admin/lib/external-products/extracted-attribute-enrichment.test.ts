import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import { enrichExtractedExternalAttributes } from "./extracted-attribute-enrichment";
import { createSyntheticEmptyBranchExternalOptionValue } from "./option-mapping-utils";

describe("enrichExtractedExternalAttributes", () => {
  it("adds inferred hidden values and distinct synthetic empty branches from attribute specs", () => {
    const attributes: ExternalAttribute[] = [
      {
        id: "paperWeight",
        name: "Papier",
        values: ["matt-150g"],
        options: [{ value: "matt-150g", label: "kreda mat 150g" }],
      },
      {
        id: "foil",
        name: "Folia",
        values: ["glossy-front", "matt-front"],
        options: [
          { value: "glossy-front", label: "Folia błysk" },
          { value: "matt-front", label: "Folia mat" },
        ],
      },
    ];

    const payload = {
      attributeSpecs: {
        attributes: [
          {
            id: "paperWeight",
            name: "Papier",
            options: [
              {
                label: "Matowy",
                empty: false,
                values: [{ value: "matt-150g", label: "kreda mat 150g" }],
              },
              {
                label: "Samoprzylepny",
                empty: true,
                values: [],
              },
              {
                label: "Standardowy",
                empty: true,
                values: [],
              },
            ],
          },
          {
            id: "foil",
            name: "Folia",
            options: [
              {
                label: "jednostronnie",
                empty: false,
                values: [
                  {
                    value: "glossy-front",
                    label: "Folia błysk",
                    correspondingValue: "glossy-both-sides",
                  },
                  {
                    value: "matt-front",
                    label: "Folia mat",
                    correspondingValue: "matt-both-sides",
                  },
                ],
              },
              {
                label: "dwustronnie",
                empty: true,
                values: [],
              },
            ],
          },
        ],
      },
    };

    const result = enrichExtractedExternalAttributes({
      attributes,
      payloads: [payload],
    });

    expect(result).toEqual([
      {
        id: "paperWeight",
        name: "Papier",
        values: [
          "matt-150g",
          createSyntheticEmptyBranchExternalOptionValue("Samoprzylepny"),
          createSyntheticEmptyBranchExternalOptionValue("Standardowy"),
        ],
        options: [
          { value: "matt-150g", label: "kreda mat 150g" },
          {
            value: createSyntheticEmptyBranchExternalOptionValue(
              "Samoprzylepny",
            ),
            label: "Samoprzylepny",
          },
          {
            value: createSyntheticEmptyBranchExternalOptionValue(
              "Standardowy",
            ),
            label: "Standardowy",
          },
        ],
      },
      {
        id: "foil",
        name: "Folia",
        values: [
          "glossy-front",
          "matt-front",
          "glossy-both-sides",
          "matt-both-sides",
        ],
        options: [
          { value: "glossy-front", label: "Folia błysk" },
          { value: "matt-front", label: "Folia mat" },
          {
            value: "glossy-both-sides",
            label: "Folia błysk (dwustronnie)",
          },
          {
            value: "matt-both-sides",
            label: "Folia mat (dwustronnie)",
          },
        ],
      },
    ]);
  });
});