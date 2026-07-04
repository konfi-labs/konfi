import { describe, expect, it } from "vitest";
import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import type { AISuggestedAttributeMapping } from "./ai-mapping-types";
import {
  normalizeAiSuggestedAttributeMappings,
  normalizeAttributeMappings,
} from "./attribute-mapping-normalization";

const externalAttributes: ExternalAttribute[] = [
  {
    id: "paperFormat",
    name: "Format",
    values: ["a4", "a5"],
    options: [
      { value: "a4", label: "A4" },
      { value: "a5", label: "A5" },
    ],
  },
  {
    id: "paperType",
    name: "Papier",
    values: ["matt"],
    options: [{ value: "matt", label: "Mat" }],
  },
];

const option = (value: string, label: string) => ({
  value,
  label,
  customFormat: false,
  hidden: false,
});

describe("normalizeAttributeMappings", () => {
  it("canonicalizes name-based aliases and merges duplicate mappings", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
        optionMappings: { a4: "a4" },
        verified: true,
      },
      {
        externalAttributeName: "Format",
        internalAttributeId: "format",
        optionMappings: { a5: "a5" },
        confidence: 0.91,
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes,
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
        optionMappings: {
          a4: "a4",
          a5: "a5",
        },
        confidence: 0.91,
        verified: true,
      },
    ]);
  });

  it("prefers the more complete mapping when canonical and alias entries disagree", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "paperFormat",
      },
      {
        externalAttributeName: "Format",
        internalAttributeId: "format",
        verified: true,
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes,
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
        verified: true,
      },
    ]);
  });

  it("keeps unknown custom mappings untouched", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Legacy Finish",
        internalAttributeId: "finish",
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes,
        mappings,
      }),
    ).toEqual(mappings);
  });

  it("preserves manually marked page count mappings", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "pageNumber",
        internalAttributeId: "format",
      },
      {
        externalAttributeName: "Pages",
        specialRole: "pageCount",
        verified: true,
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes: [
          ...externalAttributes,
          {
            id: "pageNumber",
            name: "Pages",
            values: ["8", "12"],
          },
        ],
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "pageNumber",
        specialRole: "pageCount",
        verified: true,
      },
    ]);
  });

  it("canonicalizes AI-normalized external and internal option values", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "paperWeightCover",
        internalAttributeId: "papier",
        optionMappings: {
          outer_matt_250g: "Kreda 250g",
        },
      },
      {
        externalAttributeName: "colorInner",
        internalAttributeId: "kolorystyka",
        optionMappings: {
          _4_4: "4 + 4",
        },
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes: [
          ...externalAttributes,
          {
            id: "paperWeightCover",
            name: "Papier okładki",
            values: ["outer-matt-250g"],
            options: [
              {
                value: "outer-matt-250g",
                label: "kreda mat 250g",
              },
            ],
          },
          {
            id: "colorInner",
            name: "Kolorystyka środka",
            values: ["4-4"],
            options: [{ value: "4-4", label: "kolor dwustronnie (4/4)" }],
          },
        ],
        internalAttributes: [
          {
            id: "papier",
            options: [option("kreda250", "kreda 250g")],
          },
          {
            id: "kolorystyka",
            options: [option("4+4", "4 + 4")],
          },
        ],
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperWeightCover",
        internalAttributeId: "papier",
        optionMappings: {
          "outer-matt-250g": "kreda250",
        },
      },
      {
        externalAttributeName: "colorInner",
        internalAttributeId: "kolorystyka",
        optionMappings: {
          "4-4": "4+4",
        },
      },
    ]);
  });

  it("preserves AI internal option values that cannot be canonicalized", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "paperType",
        internalAttributeId: "papier",
        optionMappings: {
          matt: "AI semantic value",
        },
      },
    ];

    expect(
      normalizeAttributeMappings({
        externalAttributes,
        internalAttributes: [
          {
            id: "papier",
            options: [option("kreda250", "kreda 250g")],
          },
        ],
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperType",
        internalAttributeId: "papier",
        optionMappings: {
          matt: "AI semantic value",
        },
      },
    ]);
  });
});

describe("normalizeAiSuggestedAttributeMappings", () => {
  it("rewrites AI suggestions to canonical external keys", () => {
    const mappings: AISuggestedAttributeMapping[] = [
      {
        externalAttributeName: "Format",
        internalAttributeId: "format",
        confidence: 0.88,
        optionMappings: [
          {
            externalValue: "a4",
            internalValue: "a4",
            confidence: 0.95,
          },
        ],
      },
    ];

    expect(
      normalizeAiSuggestedAttributeMappings({
        externalAttributes,
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
        confidence: 0.88,
        optionMappings: [
          {
            externalValue: "a4",
            internalValue: "a4",
            confidence: 0.95,
          },
        ],
      },
    ]);
  });

  it("keeps the stronger duplicate AI suggestion for the same canonical key", () => {
    const mappings: AISuggestedAttributeMapping[] = [
      {
        externalAttributeName: "paperFormat",
        confidence: 0.2,
        optionMappings: [],
        suggestedNewAttribute: {
          name: "Format",
          type: "DROPDOWN",
          options: [{ label: "A4", value: "a4" }],
        },
      },
      {
        externalAttributeName: "Format",
        internalAttributeId: "format",
        confidence: 0.84,
        optionMappings: [
          {
            externalValue: "a4",
            internalValue: "a4",
            confidence: 0.84,
          },
        ],
      },
    ];

    expect(
      normalizeAiSuggestedAttributeMappings({
        externalAttributes,
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
        confidence: 0.84,
        optionMappings: [
          {
            externalValue: "a4",
            internalValue: "a4",
            confidence: 0.84,
          },
        ],
      },
    ]);
  });

  it("canonicalizes AI suggestion option values against known options", () => {
    const mappings: AISuggestedAttributeMapping[] = [
      {
        externalAttributeName: "paperWeightCover",
        internalAttributeId: "papier",
        confidence: 0.88,
        optionMappings: [
          {
            externalValue: "outer_matt_250g",
            internalValue: "Kreda 250g",
            confidence: 0.9,
          },
        ],
      },
    ];

    expect(
      normalizeAiSuggestedAttributeMappings({
        externalAttributes: [
          ...externalAttributes,
          {
            id: "paperWeightCover",
            name: "Papier okładki",
            values: ["outer-matt-250g"],
            options: [
              {
                value: "outer-matt-250g",
                label: "kreda mat 250g",
              },
            ],
          },
        ],
        internalAttributes: [
          {
            id: "papier",
            options: [option("kreda250", "kreda 250g")],
          },
        ],
        mappings,
      }),
    ).toEqual([
      {
        externalAttributeName: "paperWeightCover",
        internalAttributeId: "papier",
        confidence: 0.88,
        optionMappings: [
          {
            externalValue: "outer-matt-250g",
            internalValue: "kreda250",
            confidence: 0.9,
          },
        ],
      },
    ]);
  });
});
