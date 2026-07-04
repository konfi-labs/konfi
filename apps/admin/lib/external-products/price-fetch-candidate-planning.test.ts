import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import {
  buildPriceConfigurationInputs,
  type PricingCombinationStrategy,
} from "./pricing-combination-planner";
import {
  resolvePriceFetchCandidateInputs,
  samplePriceConfigurationInputs,
} from "./price-fetch-candidate-planning";

describe("resolvePriceFetchCandidateInputs", () => {
  const externalAttributes: ExternalAttribute[] = [
    {
      id: "paperFormat",
      name: "Format",
      values: ["flat", "convex"],
      affectsPricing: true,
    },
    {
      id: "paper",
      name: "Papier",
      values: ["matt", "gloss"],
      affectsPricing: true,
    },
    {
      id: "foil",
      name: "Folia",
      values: ["gold", "silver"],
      affectsPricing: true,
    },
  ];

  const configurationParams = {
    paperFormat: "paperFormat",
    paper: "paper",
    foil: "foil",
  };

  it("falls back to manual rules before dropping all strategy constraints", () => {
    const manualStrategy: PricingCombinationStrategy = {
      rules: [
        {
          when: { paperFormat: "flat" },
          excludedValues: { paper: ["gloss"] },
          reason: "manual exclusion rule",
        },
      ],
    };
    const learnedStrategy: PricingCombinationStrategy = {
      rules: [
        {
          when: { paperFormat: "flat" },
          allowedValues: { foil: ["gold"] },
        },
        {
          when: { paperFormat: "flat" },
          excludedValues: { foil: ["gold"] },
        },
        {
          when: { paperFormat: "convex" },
          allowedValues: { foil: ["silver"] },
        },
        {
          when: { paperFormat: "convex" },
          excludedValues: { foil: ["silver"] },
        },
      ],
    };
    const mergedStrategy: PricingCombinationStrategy = {
      rules: [
        ...(manualStrategy.rules ?? []),
        ...(learnedStrategy.rules ?? []),
      ],
    };
    const manualOnlyInputs = buildPriceConfigurationInputs({
      externalAttributes,
      configurationParams,
      strategy: manualStrategy,
    });

    const result = resolvePriceFetchCandidateInputs({
      externalAttributes,
      configurationParams,
      primaryStrategy: mergedStrategy,
      fallbackStrategies: [manualStrategy],
    });

    expect(result.configurationInputs).toEqual([]);
    expect(result.effectiveConfigurationInputs).toEqual(manualOnlyInputs);
    expect(result.appliedStrategy).toEqual(manualStrategy);
    expect(result.planningMode).toBe("fallback-strategy");
  });

  it("samples oversized candidate spaces while preserving option coverage", () => {
    const inputs = buildPriceConfigurationInputs({
      externalAttributes: [
        ...externalAttributes,
        {
          id: "binding",
          name: "Oprawa",
          values: ["none", "spiral", "staples"],
          affectsPricing: true,
        },
      ],
      configurationParams: {
        ...configurationParams,
        binding: "binding",
      },
    });

    const sampledInputs = samplePriceConfigurationInputs(inputs, 6);
    const coveredValues = new Set(
      sampledInputs.flatMap((input) =>
        Object.entries(input.configuration).map(
          ([attributeName, value]) => `${attributeName}=${value}`,
        ),
      ),
    );

    expect(inputs).toHaveLength(24);
    expect(sampledInputs).toHaveLength(6);
    expect(coveredValues).toEqual(
      new Set([
        "paperFormat=convex",
        "paperFormat=flat",
        "paper=gloss",
        "paper=matt",
        "foil=gold",
        "foil=silver",
        "binding=none",
        "binding=spiral",
        "binding=staples",
      ]),
    );
  });

  it("reports when effective candidates were sampled", () => {
    const result = resolvePriceFetchCandidateInputs({
      externalAttributes: [
        ...externalAttributes,
        {
          id: "binding",
          name: "Oprawa",
          values: ["none", "spiral", "staples"],
          affectsPricing: true,
        },
      ],
      configurationParams: {
        ...configurationParams,
        binding: "binding",
      },
      maxEffectiveCandidates: 6,
    });

    expect(result.configurationInputs).toHaveLength(24);
    expect(result.effectiveConfigurationInputs).toHaveLength(6);
    expect(result.candidateLimitApplied).toEqual({
      limitedCount: 6,
      originalCount: 24,
    });
  });
});
