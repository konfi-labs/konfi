import { describe, expect, it, vi } from "vitest";
import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import {
  buildPricingExclusionAssistantPrompt,
  getPricingExclusionAssistantAttributes,
  normalizeGeneratedPricingExclusionPlan,
  type GeneratedPricingExclusionPlan,
} from "./pricing-exclusion-rule-assistant";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/server-vertex", () => ({
  getVertexClient: () => {
    throw new Error("Vertex client should not be used in deterministic tests.");
  },
}));

const externalAttributes = [
  {
    id: "coverPaper",
    name: "Papier okładki",
    values: ["cover-120", "cover-170", "cover-250"],
    options: [
      { label: "120 g", value: "cover-120" },
      { label: "170 g", value: "cover-170" },
      { label: "250 g", value: "cover-250" },
    ],
  },
  {
    id: "innerPaper",
    name: "Papier środka",
    values: ["inner-90", "inner-120", "inner-170"],
    options: [
      { label: "90 g", value: "inner-90" },
      { label: "120 g", value: "inner-120" },
      { label: "170 g", value: "inner-170" },
    ],
  },
  {
    id: "coverLamination",
    name: "Foliowanie okładki",
    values: ["none", "gloss", "mat", "soft-skin"],
    options: [
      { label: "Brak", value: "none" },
      { label: "Folia błysk", value: "gloss" },
      { label: "Folia mat", value: "mat" },
      { label: "Folia Soft skin", value: "soft-skin" },
    ],
  },
  {
    id: "varnish",
    name: "Lakier",
    values: ["uv", "uv-3d"],
    options: [
      { label: "UV wybiórczy", value: "uv" },
      { label: "UV 3D wybiórczy", value: "uv-3d" },
    ],
  },
  {
    id: "selectiveFoil",
    name: "Folia wybiórcza",
    values: ["gold", "silver"],
    options: [
      { label: "Złota", value: "gold" },
      { label: "Srebrna", value: "silver" },
    ],
  },
] satisfies ExternalAttribute[];

const mappings = externalAttributes.map((attribute) => ({
  externalAttributeName: attribute.id,
  internalAttributeId: attribute.id,
  optionMappings: Object.fromEntries(
    attribute.values.map((value) => [value, value]),
  ),
})) satisfies AttributeMapping[];

describe("pricing exclusion rule assistant helpers", () => {
  it("expands exact rules and ordered paper comparisons into persisted exclusions", () => {
    const plan = {
      rules: [
        {
          when: [
            {
              attribute: "Foliowanie okładki",
              values: ["Brak", "Folia błysk"],
            },
          ],
          omitAttributes: ["Lakier", "Folia wybiórcza"],
        },
        {
          when: [{ attribute: "coverLamination", values: ["mat"] }],
          allowValues: [{ attribute: "varnish", values: ["UV wybiórczy"] }],
          omitAttributes: ["selectiveFoil"],
        },
      ],
      comparisonRules: [
        {
          leftAttribute: "coverPaper",
          operator: "<=",
          rightAttribute: "innerPaper",
        },
      ],
    } satisfies GeneratedPricingExclusionPlan;

    const result = normalizeGeneratedPricingExclusionPlan({
      attributes: getPricingExclusionAssistantAttributes({
        attributeMappings: mappings,
        externalAttributes,
      }),
      plan,
    });

    expect(result.warnings).toEqual([]);
    expect(result.rules).toContainEqual({
      when: { coverLamination: ["none", "gloss"] },
      omitAttributes: ["varnish", "selectiveFoil"],
      source: "manual",
    });
    expect(result.rules).toContainEqual({
      when: { coverLamination: ["mat"] },
      omitAttributes: ["selectiveFoil"],
      excludeValues: { varnish: ["uv-3d"] },
      source: "manual",
    });
    expect(result.rules).toContainEqual({
      when: { innerPaper: ["inner-120"] },
      excludeValues: { coverPaper: ["cover-170", "cover-250"] },
      source: "manual",
    });
    expect(result.rules).toContainEqual({
      when: { innerPaper: ["inner-170"] },
      excludeValues: { coverPaper: ["cover-250"] },
      source: "manual",
    });
  });

  it("skips unmapped or ignored supplier attributes before prompting", () => {
    const attrs = getPricingExclusionAssistantAttributes({
      attributeMappings: [
        ...mappings.slice(0, 1),
        {
          externalAttributeName: "innerPaper",
          ignored: true,
          internalAttributeId: "innerPaper",
        },
      ],
      externalAttributes,
    });

    expect(attrs.map((attribute) => attribute.id)).toEqual(["coverPaper"]);
  });

  it("builds compact prompt lines instead of serializing attribute objects", () => {
    const prompt = buildPricingExclusionAssistantPrompt({
      attributes: getPricingExclusionAssistantAttributes({
        attributeMappings: mappings,
        externalAttributes,
      }),
      description: "Cover paper must not be heavier than inner paper.",
      productName: "Booklet",
    });

    expect(prompt).toContain("A1 key=coverPaper");
    expect(prompt).toContain("cover-120=120 g");
    expect(prompt).not.toContain("{");
    expect(prompt).not.toContain('"values"');
  });
});
